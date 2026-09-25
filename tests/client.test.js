// ============================================================
//  TESTS / CLIENT.TEST.JS — статические проверки клиента.
//  Браузер не поднимаем: проверяем то, что ломается молча —
//  синтаксис, цепочку загрузки, cache-buster'ы и вызовы удалённых методов.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const CLIENT_JS = path.join(ROOT, 'client', 'js');

/** ES-модули (грузятся через type="module" / import) — их проверяем отдельно. */
const ES_MODULES = new Set(['boot.module.js', 'char-model.js', 'char-select-room.js']);

function listClientJs() {
  return fs.readdirSync(CLIENT_JS)
    .filter(f => /\.js$/.test(f))
    .filter(f => !ES_MODULES.has(f))
    .map(f => path.join(CLIENT_JS, f));
}

function bootScripts() {
  const src = fs.readFileSync(path.join(CLIENT_JS, 'boot.module.js'), 'utf8');
  const m = src.match(/const SCRIPTS = \[([\s\S]*?)\n\];/);
  if (!m) return [];
  // Комментарии внутри списка убираем: апостроф в русском комментарии
  // («5 raycast'ов») иначе открывает фальшивую кавычку и сдвигает весь разбор.
  return [...stripComments(m[1]).matchAll(/'([^']+)'/g)].map(x => x[1]);
}

/**
 * Убрать комментарии: проверки «этот вызов больше не встречается» иначе
 * срабатывают на пояснениях в шапке файла, где старый код упомянут текстом.
 */
function stripComments(code) {
  return String(code)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

module.exports = function (t) {
  t.suite('client: синтаксис');
  const files = listClientJs();
  const broken = [];
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    try { new vm.Script(code, { filename: f }); }
    catch (e) { broken.push(path.basename(f) + ': ' + (e && e.message)); }
  }
  t.eq(broken, [], 'все классические скрипты парсятся (' + files.length + ' файлов)');
  // ES-модули: vm.Script их не принимает (import вне модуля), поэтому проверяем
  // синтаксис через `node --check` с расширением .mjs во временном файле.
  const brokenModules = [];
  const os = require('os');
  const { execFileSync } = require('child_process');
  for (const name of ES_MODULES) {
    const src = path.join(CLIENT_JS, name);
    if (!fs.existsSync(src)) continue;
    const tmp = path.join(os.tmpdir(), 'psmod-' + process.pid + '-' + name.replace(/\.js$/, '') + '.mjs');
    try {
      fs.copyFileSync(src, tmp);
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    } catch (e) {
      const msg = String((e && e.stderr && e.stderr.toString()) || (e && e.message) || '').split('\n')
        .filter(l => /SyntaxError|Error/.test(l))[0] || 'ошибка проверки';
      brokenModules.push(name + ': ' + msg.trim());
    } finally {
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  }
  t.eq(brokenModules, [], 'ES-модули парсятся (' + [...ES_MODULES].join(', ') + ')');

  t.suite('client: цепочка загрузки boot.module.js');
  const scripts = bootScripts();
  t.ok(scripts.length >= 60, 'список SCRIPTS прочитан', 'скриптов: ' + scripts.length);
  const missing = [];
  const noVersion = [];
  for (const s of scripts) {
    const rel = s.split('?')[0];
    // src в game.html разрешается относительно client/
    const abs = path.normalize(path.join(ROOT, 'client', rel));
    if (!fs.existsSync(abs)) missing.push(s);
    if (s.indexOf('?v=') < 0) noVersion.push(s);
  }
  t.eq(missing, [], 'все файлы цепочки существуют');
  // Регресс: сервер отдаёт статику с `immutable, max-age=1 год`; файл без ?v=
  // после деплоя не обновится у игрока никогда (было у 7 файлов).
  t.eq(noVersion, [], 'у каждого файла есть ?v= cache-buster');

  t.suite('client: порядок зависимостей');
  const idx = (needle) => scripts.findIndex(s => s.indexOf(needle) >= 0);
  t.ok(idx('editor-overrides-data') < idx('world-metrics') && idx('editor-overrides-data') >= 0,
    'editor-overrides-data грузится до world-metrics');
  t.ok(idx('item-db') < idx('js/inventory.js') && idx('item-db') >= 0,
    'shared/item-db до inventory.js (лестницы приборов берутся из ITEM_DB)');
  t.ok(idx('grade-rules') >= 0 && idx('grade-rules') < idx('item-db'),
    'grade-rules до item-db (levelReq штампуется при загрузке каталога)');
  t.ok(idx('buff-rules') >= 0, 'buff-rules в цепочке загрузки (слоты C1)');
  t.ok(idx('weight-rules') >= 0 && idx('weight-rules') < idx('item-db'),
    'weight-rules до item-db (вес штампуется при загрузке каталога)');
  t.ok(idx('enchant-rules') >= 0 && idx('enchant-rules') < idx('item-db'),
    'enchant-rules до item-db (crystalCount штампуется при загрузке)');
  t.ok(idx('death-rules') >= 0, 'death-rules в цепочке загрузки (дроп при смерти C1)');
  t.ok(idx('event-rules') >= 0 && idx('event-rules') < idx('game-rules'),
    'event-rules до game-rules (WORLD_EVENTS берётся из каталога)');
  t.ok(idx('duel-rules') >= 0, 'duel-rules в цепочке загрузки (дуэль 1v1)');
  t.ok(idx('mesh-bin.js') >= 0 && idx('mesh-bin.js') < idx('mesh-bin-loader'),
    'mesh-bin.js до loader (PLAN 4.7)');
  t.ok(idx('mesh-bin-loader') >= 0 && idx('mesh-bin-loader') < idx('js/terrain.js'),
    'бинарный меш грузится до terrain.js');
  t.ok(idx('terrain-data.js') < 0, 'terrain-data.js больше не в boot (JSON-числа → bin)');
  t.ok(idx('volcano-data.js') < 0, 'volcano-data.js не в boot');
  t.ok(idx('mountains-data.js') < 0, 'mountains-data.js не в boot');
  t.ok(idx('js/editor.js') < 0, 'editor.js не в boot игрока (PLAN 4.6)');
  t.ok(idx('editor-engine-layout') < 0, 'layout редактора не в boot игрока');
  t.ok(/__PS_EDITOR_KEY/.test(fs.readFileSync(path.join(CLIENT_JS, 'boot.module.js'), 'utf8')),
    'ленивая загрузка редактора требует ключ с сервера');
  t.ok(idx('js/audio.js') >= 0 && idx('js/audio.js') < idx('js/main.js'),
    'audio.js в boot до main.js (PLAN 8)');
  t.ok(idx('terrain-height') >= 0 && idx('terrain-height') < idx('js/terrain.js'),
    'terrain-height до terrain.js (standY берёт высоту из индекса, а не из 5 лучей)');
  t.ok(idx('props-library-data') < idx('props-collision'), 'props-library-data до props-collision');
  t.ok(idx('js/net-ws.js') < idx('js/main.js'), 'net-ws до main.js');
  t.ok(idx('world-content') >= 0 && idx('world-content') < idx('js/main.js'),
    'world-content до main.js (автономный контент мира без редактора)');
  t.ok(idx('prop-textures-data') >= 0 && idx('prop-textures-data') < idx('world-content'),
    'prop-textures-data до world-content (словарь текстур для автономного загрузчика)');

  t.suite('client: удалённые API не вызываются');
  const all = files.map(f => ({ name: path.basename(f), code: fs.readFileSync(f, 'utf8') }));
  const callsSyncDevice = all.filter(f => /\bsyncDeviceEquip\s*\(/.test(f.code)).map(f => f.name);
  t.eq(callsSyncDevice, [], 'syncDeviceEquip удалён и больше не вызывается');
  const equipWithMeta = all.filter(f => /intentEquip\([^)]*,[^)]*,[^)]*,[^)]*\)/.test(f.code)).map(f => f.name);
  t.eq(equipWithMeta, [], 'intentEquip больше не принимает meta с уровнями приборов');

  t.suite('client: dev-гейты отладки');
  const mainJs = all.find(f => f.name === 'main.js').code;
  t.ok(/_fpsVisible = false/.test(mainJs), 'FPS HUD выключен по умолчанию');
  t.ok(/window\.PS_DEV && window\.CrowdStressTest/.test(mainJs), 'стресс-тест толпы под dev-флагом');
  t.ok(/case 'F4':[\s\S]{0,200}window\.PS_DEV/.test(mainJs), 'F4-инспектор под dev-флагом');
  const uiJs = all.find(f => f.name === 'ui.js').code;
  t.ok(/setStatusEffects/.test(uiJs), 'UI принимает полный снимок слотов (диспел/смерть)');
  const netWsFx = all.find(f => f.name === 'net-ws.js').code;
  t.ok(/case 'effects':/.test(netWsFx), 'пакет effects разбирается');
  t.ok(/setStatusEffects/.test(netWsFx), 'effects заменяет иконки, а не копит');
  t.ok(/PS_DEV/.test(uiJs) && /Команда доступна только в тестовом режиме/.test(uiJs),
    'отладочные чат-команды под dev-флагом');
  const editorJs = all.find(f => f.name === 'editor.js').code;
  t.ok(/setEditorAllowed/.test(editorJs) && /editorAllowed/.test(editorJs),
    'редактор мира гейтится editorAllowed (dev из welcome)');
  t.ok(/if \(!editorAllowed && !this\.enabled\) return;/.test(editorJs),
    'F2 не открывает редактор без dev-флага');
  const netJs = all.find(f => f.name === 'net-ws.js').code;
  t.ok(/window\.PS_DEV = this\.dev/.test(netJs), 'welcome.dev пробрасывается в window.PS_DEV');
  t.ok(/window\.PS_GM = this\.gm/.test(netJs), 'welcome.gm пробрасывается в window.PS_GM');
  t.ok(/__PS_EDITOR_KEY/.test(netJs) && /editorKey/.test(netJs),
    'ключ редактора только из welcome GM, не из консоли');
  t.ok(/__psAllowInspect/.test(netJs), 'консоль/F12 снимается только после welcome GM/модера');
  const antiJs = all.find(f => f.name === 'anti-inspect.js');
  t.ok(antiJs, 'anti-inspect.js есть');
  t.ok(/F12/.test(antiJs.code) && /STAFF_LEVEL = 50/.test(antiJs.code),
    'F12 и DevTools режутся до accessLevel 50');
  const gameHtml = fs.readFileSync(path.join(ROOT, 'client', 'game.html'), 'utf8');
  t.ok(/anti-inspect\.js/.test(gameHtml) && gameHtml.indexOf('anti-inspect.js') < gameHtml.indexOf('boot.module.js'),
    'anti-inspect грузится в game.html до boot');
  const menuHtml = fs.readFileSync(path.join(ROOT, 'client', 'menu.html'), 'utf8');
  t.ok(!/href=["']editor\.html["']/.test(menuHtml), 'в меню нет ссылки на editor.html');
  const terrainJs = all.find(f => f.name === 'terrain.js').code;
  t.ok(!/var STREAM_LOG = true/.test(terrainJs), 'STREAM_LOG не включён константой');
  t.ok(/visibilitychange/.test(mainJs), 'main.js ставит паузу на свёрнутой вкладке');
  const bootSrc = fs.readFileSync(path.join(CLIENT_JS, 'boot.module.js'), 'utf8');
  t.ok(/isOptionalEditorTool/.test(bootSrc) && /editor-engine-layout/.test(bootSrc),
    'skip редактора не ловит editor-overrides-data по подстроке editor');
  const ovJs = all.find(f => f.name === 'editor-overrides-data.js').code;
  t.ok(!/project_steam_editor_overrides/.test(stripComments(ovJs)),
    'оверрайды мира больше не пишутся в localStorage (PLAN 4.7)');
  t.ok(!/JSON\.parse\(JSON\.stringify\(diskData/.test(stripComments(ovJs)),
    'нет клона 850 КБ оверрайдов на загрузке');
  const audioJs = all.find(f => f.name === 'audio.js');
  t.ok(audioJs, 'audio.js есть');
  t.ok(/GameAudio/.test(audioJs.code) && /setPageHidden/.test(audioJs.code),
    'аудио-менеджер глушит звук на hidden');

  t.suite('client: клиентский боевой контур не оживает');
  const skillsJs = all.find(f => f.name === 'skills.js').code;
  // executeSkill — мёртвый кластер ~300 строк; если появится вызов, включится
  // клиентский урон в server-authority модели.
  const execCalls = (skillsJs.match(/(?:^|[^.\w])executeSkill\s*\(/g) || []).length;
  const execDefs = (skillsJs.match(/\bexecuteSkill\s*\([^)]*\)\s*\{/g) || []).length;
  t.eq(execCalls, execDefs, 'executeSkill только объявлен, не вызывается',
    'вызовов: ' + execCalls + ', объявлений: ' + execDefs);

  t.suite('client: нет локальных мутаций валюты и наград');
  // Проверяем КОД без комментариев: в шапках файлов старые вызовы упомянуты
  // текстом как объяснение регресса.
  const src = {};
  all.forEach((f) => { src[f.name] = stripComments(f.code); });
  // spendCurrency вызывался в 4 местах (магазин, баффы, телепорт, данж) и
  // списывал адену локально — сервер об этом не знал, списание откатывалось.
  const spends = Object.keys(src).filter(n => /\.spendCurrency\s*\(/.test(src[n]));
  t.eq(spends, ['dungeon.js'], 'spendCurrency остался только в данжах (под флагом)',
    spends.join(', ') || 'нигде');
  t.ok(/if \(DungeonManager\.SERVER_READY\) \{[\s\S]{0,300}spendCurrency/.test(src['dungeon.js']),
    'списание за вход в данж под флагом SERVER_READY');
  // Награды за квесты выдавал клиент (addItem + gainExp)
  const questJs = src['quest.js'];
  t.ok(!/inventory\.addItem/.test(questJs), 'quest.js не выдаёт предметы локально');
  t.ok(!/gainExp/.test(questJs), 'quest.js не начисляет EXP локально');
  t.ok(!/localStorage/.test(questJs), 'quest.js не хранит прогресс в localStorage');
  t.ok(/applyServerState/.test(questJs), 'quest.js применяет серверный снапшот');
  // Магазин: цена больше не приходит аргументом из клиентского каталога
  const npcUiJs = src['npc-ui.js'];
  t.ok(/intentNpcBuy/.test(npcUiJs), 'покупка идёт через intentNpcBuy');
  t.ok(/applyShopCatalog/.test(npcUiJs), 'каталог приходит с сервера (shop_open)');
  t.ok(!/inventory\.addItem\(itemId/.test(npcUiJs), 'магазин не добавляет предмет локально');
  t.ok(!/player\.applyBuff/.test(npcUiJs), 'баффы NPC не применяются локально');
  // Телепорт: позиция ставится сервером
  const mapJs = src['map-renderer.js'];
  t.ok(/intentTeleport/.test(mapJs), 'телепорт идёт через intentTeleport');
  t.ok(!/player\.mesh\.position\.set\(t\.x/.test(mapJs), 'телепорт не ставит позицию локально');
  // Заточка: своя таблица шансов убрана
  const invJs = src['inventory.js'];
  t.ok(!/0:\s*100,/.test(invJs), 'локальная таблица шансов заточки удалена');
  t.ok(/intentEnchant/.test(invJs), 'заточка идёт через intentEnchant');
  t.ok(/enchantBonus/.test(invJs), 'бонус заточки берётся из shared item-db');
  // Данжи: локальные награды под флагом
  const dunJs = src['dungeon.js'];
  t.ok(/DungeonManager\.SERVER_READY = false/.test(dunJs), 'данжи закрыты флагом SERVER_READY');
  t.ok(/if \(!DungeonManager\.SERVER_READY\) return;/.test(dunJs),
    'локальный лут данжа под флагом');

  t.suite('client: reconciliation позиции');
  const netJs2 = src['net-ws.js'];
  // serverSelf писался в 6 местах и не читался нигде
  t.ok(/_reconcile\s*\(/.test(netJs2), 'есть покадровая коррекция позиции');
  t.ok(/_applyServerPosition\s*\(/.test(netJs2), 'есть жёсткая постановка позиции (телепорт)');
  t.ok(/const s = this\.serverSelf/.test(netJs2), 'serverSelf читается в reconciliation');
  t.ok(/RECON_SOFT/.test(netJs2) && /RECON_HARD/.test(netJs2), 'пороги коррекции заданы');

  t.suite('client: крафт-UI существует');
  t.ok(fs.existsSync(path.join(CLIENT_JS, 'craft.js')), 'client/js/craft.js есть');
  const craftJs = src['craft.js'];
  t.ok(craftJs && /window\.CraftManager/.test(craftJs) && /window\.CraftUI/.test(craftJs),
    'CraftManager и CraftUI экспортированы (main.js их ждёт)');
  t.ok(craftJs && /intentCraft/.test(craftJs) && /intentLearn/.test(craftJs),
    'крафт и изучение идут через серверные интенты');
  t.ok(bootScripts().some(s => s.indexOf('js/craft.js') >= 0), 'craft.js в цепочке загрузки');

  t.suite('client: персональный склад');
  const npcUi = src['npc-ui.js'];
  t.ok(/npc-warehouse/.test(npcUi) && /showWarehouseView\s*\(/.test(npcUi),
    'подвид склада и его открытие есть в диалоге NPC');
  t.ok(/t\.type === 'warehouse'/.test(npcUi), 'кнопка склада показывается по типу NPC');
  t.ok(/applyWarehouse\s*\(/.test(npcUi), 'содержимое рисуется из серверного пакета');
  // Склад — серверная операция: локальных addItem/removeItem быть не должно,
  // иначе первая же синхронизация сумки сотрёт перенос (как было с магазином).
  const whBlock = (npcUi.match(/\n {4}showWarehouseView\([\s\S]*?\n {4}_whIntent\([\s\S]*?\n {4}\}/) || [''])[0];
  t.ok(whBlock.length > 500 && whBlock.length < 20000, 'блок склада найден целиком',
    whBlock.length + ' символов');
  t.ok(!/inventory\.(addItem|removeItem|spendCurrency)/.test(whBlock),
    'окно склада не двигает предметы локально');
  t.ok(/plus > 0/.test(whBlock) && /shiftKey/.test(whBlock),
    'заточенный стак уходит целиком даже без Shift');
  t.ok(/plusMoveOk/.test(whBlock), 'клиент гасит строки тем же правилом заточки, что сервер');
  t.ok(/На склад/.test(src['inventory-ui.js']), 'пункт «На склад» в контекстном меню сумки');
  const netWs = src['net-ws.js'];
  t.ok(/intentWhOpen/.test(netWs) && /intentWhPut/.test(netWs) && /intentWhTake/.test(netWs),
    'интенты склада объявлены');
  t.ok(/case 'wh_open'/.test(netWs) && /case 'wh_ok'/.test(netWs) && /case 'wh_fail'/.test(netWs),
    'ответы склада разбираются');
  // Ключи нового окна обязаны быть в обоих словарях: ru/en уже разъехались
  // (см. PLAN 6), новые дырки добавлять нельзя.
  const i18nSrc = fs.readFileSync(path.join(CLIENT_JS, 'i18n.js'), 'utf8');
  const missingI18n = [];
  ['warehouse', 'warehouse_subtitle', 'warehouse_hint', 'wh_bag', 'wh_store', 'wh_empty', 'wh_note', 'wh_enchanted']
    .forEach((k) => {
      const n = (i18nSrc.match(new RegExp('(^|\\s)' + k + ':', 'g')) || []).length;
      if (n !== 2) missingI18n.push(k + '×' + n);
    });
  t.eq(missingI18n, [], 'все ключи склада есть и в ru, и в en');

  t.suite('client: клик по земле после серверной коррекции');
  // Регресс: _applyServerPosition обнуляла p.moveTarget (Vector3 → null), и
  // следующий клик по земле падал на `this.moveTarget.copy(p)`:
  // «Cannot read properties of null (reading 'copy')». Дальше игрок не мог
  // ходить до перезагрузки страницы, а фатальный обработчик рисовал оверлей.
  t.ok(!/moveTarget\s*=\s*null/.test(src['net-ws.js']),
    'коррекция позиции не обнуляет moveTarget');
  t.ok(/moveTarget\.set\(/.test(src['net-ws.js']),
    'вместо обнуления вектор переставляется на новую позицию');
  const V3 = function (x, y, z) {
    this.x = x || 0; this.y = y || 0; this.z = z || 0;
    this.copy = (v) => { this.x = v.x || 0; this.y = v.y || 0; this.z = v.z || 0; return this; };
    this.set = (a, b, c) => { this.x = a; this.y = b; this.z = c; return this; };
    this.subVectors = (a, b) => { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; };
  };
  const winPlayer = { THREE: { Vector3: V3 } };
  // player.js — это ровно `class Player {…}` + window.Player, поэтому грузится
  // с заглушкой THREE: конструктор (createMesh, DOM) в тесте не вызывается.
  new Function('window', 'THREE', fs.readFileSync(path.join(CLIENT_JS, 'player.js'), 'utf8'))(
    winPlayer, winPlayer.THREE
  );
  t.ok(typeof winPlayer.Player === 'function', 'player.js поднимается с заглушкой THREE');
  const fakePlayer = {
    continuousMove: { active: true }, isDead: false, hp: 100,
    moveTarget: null,                 // состояние после старой коррекции позиции
    _standingUp: false, isSitting: false, isMoving: false, mesh: null,
    stopFollowing() {}, playLocoAnim() {}, showMoveClickMarker() {}
  };
  let moveErr = null;
  try { winPlayer.Player.prototype.moveTo.call(fakePlayer, { x: 5, y: 0, z: 7 }); }
  catch (e) { moveErr = e; }
  t.ok(!moveErr, 'moveTo не падает, даже если moveTarget обнулён', moveErr && moveErr.message);
  t.ok(fakePlayer.moveTarget && fakePlayer.moveTarget.x === 5 && fakePlayer.moveTarget.z === 7 &&
    fakePlayer.isMoving === true, 'цель движения выставлена, игрок пошёл',
    fakePlayer.moveTarget ? JSON.stringify({ x: fakePlayer.moveTarget.x, z: fakePlayer.moveTarget.z }) : 'null');

  t.suite('client: reconciliation не тянет игрока в старую точку');
  // Регресс: сервер сообщает свою позицию только событиями (welcome, телепорт,
  // воскрешение), поэтому serverSelf оставался позицией входа в мир. _reconcile
  // сравнивала с ним КАЖДЫЙ кадр, когда игрок стоит: отошёл на 2.5 м и встал —
  // тянет назад, отошёл на 25 м — телепорт на спавн. Плюс клик-ту-мув не стримил
  // move, и серверная позиция реально отставала на весь забег.
  const playerJs = src['player.js'];
  t.ok(/_streamMoveToServer\s*\(/.test(playerJs), 'позиция стримится во время бега');
  t.eq((playerJs.match(/_streamMoveToServer\(delta\)/g) || []).length, 3,
    'стрим включён во всех трёх ветках движения (follow, continuous, click)');
  const netSrc = src['net-ws.js'];
  t.ok(/RECON_FRESH_MS/.test(netSrc), 'у снимка серверной позиции есть срок годности');
  t.ok(/_setServerSelf\s*\(/.test(netSrc), 'snapshot ставится через _setServerSelf');
  t.eq((netSrc.match(/serverSelf = \{/g) || []).length, 1,
    'объект снимка создаётся в одном месте (со временем), а не в шести');

  const winNet = { game: null };
  new Function('window', fs.readFileSync(path.join(CLIENT_JS, 'net-ws.js'), 'utf8'))(winNet);
  const NetWS = winNet.NetWS;
  t.ok(typeof NetWS === 'function', 'net-ws.js поднимается вне браузера');
  const mkNet = (serverSelf) => ({
    serverSelf, _reconTarget: null, predict: { x: 0, z: 0 },
    hardCalls: 0,
    _applyServerPosition(x, z, opts) { this.hardCalls++; this.lastHard = { x, z, hard: !!(opts && opts.hard) }; }
  });
  const mkGame = (x, z, moving) => ({
    player: { mesh: { position: { x, y: 1, z } }, isDead: false, isMoving: !!moving }
  });
  // 1) Устаревший снимок — не трогаем игрока вообще
  winNet.game = mkGame(300, 300, false);
  let net = mkNet({ x: 0, z: 0, at: Date.now() - 10000 });
  NetWS.prototype._reconcile.call(net, 0.016);
  t.ok(winNet.game.player.mesh.position.x === 300 && net.hardCalls === 0 && !net._reconTarget,
    'по устаревшему снимку коррекции нет',
    'x=' + winNet.game.player.mesh.position.x + ' hard=' + net.hardCalls);
  // 2) Свежий снимок в 10 м — мягкая коррекция сдвигает к серверу
  winNet.game = mkGame(310, 300, false);
  net = mkNet({ x: 300, z: 300, at: Date.now() });
  NetWS.prototype._reconcile.call(net, 0.016);
  const movedBack = 310 - winNet.game.player.mesh.position.x;
  t.ok(movedBack > 0 && movedBack < 10 && net.hardCalls === 0,
    'по свежему снимку игрок плавно подтягивается', 'сдвиг ' + movedBack.toFixed(2) + ' м за кадр');
  // 3) Свежий снимок дальше RECON_HARD — жёсткая постановка
  winNet.game = mkGame(400, 300, false);
  net = mkNet({ x: 300, z: 300, at: Date.now() });
  NetWS.prototype._reconcile.call(net, 0.016);
  t.ok(net.hardCalls === 1 && net.lastHard.hard === true,
    'расхождение больше 25 м ставится жёстко', 'hard=' + net.hardCalls);
  // 4) На бегу не дёргаем даже по свежему снимку
  winNet.game = mkGame(310, 300, true);
  net = mkNet({ x: 300, z: 300, at: Date.now() });
  NetWS.prototype._reconcile.call(net, 0.016);
  t.ok(winNet.game.player.mesh.position.x === 310 && net.hardCalls === 0,
    'во время бега коррекции нет (сервер догонит по стриму)');

  t.suite('client: обмен игрок ↔ игрок');
  t.ok(fs.existsSync(path.join(CLIENT_JS, 'trade-ui.js')), 'client/js/trade-ui.js есть');
  const tradeUi = src['trade-ui.js'];
  t.ok(tradeUi && /window\.TradeUI/.test(tradeUi), 'TradeUI экспортирован (main.js его ждёт)');
  t.ok(/tradeUI = new TradeUI/.test(src['main.js']), 'main.js создаёт game.tradeUI');
  const bootList = bootScripts();
  const iTradeRules = bootList.findIndex(s => s.indexOf('trade-rules') >= 0);
  const iNpcServices = bootList.findIndex(s => s.indexOf('npc-services') >= 0);
  const iTradeUi = bootList.findIndex(s => s.indexOf('js/trade-ui.js') >= 0);
  const iMain = bootList.findIndex(s => s.indexOf('js/main.js') >= 0);
  t.ok(iTradeRules > iNpcServices && iNpcServices >= 0,
    'shared/trade-rules после npc-services (слоты и метаданные оттуда)');
  t.ok(iTradeUi >= 0 && iTradeUi < iMain, 'trade-ui до main.js');
  // Перенос вещей — только сервер: локальных мутаций сумки в окне быть не должно
  t.ok(!/inventory\.(addItem|removeItem|spendCurrency)/.test(tradeUi || ''),
    'окно обмена не двигает предметы локально');
  t.ok(/intentTradeAdd|intentTradeRemove/.test(tradeUi || ''), 'окно работает через интенты');
  const netTrade = src['net-ws.js'];
  ['intentTradeOffer', 'intentTradeAccept', 'intentTradeAdd', 'intentTradeRemove',
    'intentTradeLock', 'intentTradeConfirm', 'intentTradeCancel'].forEach((fn) => {
    t.ok(netTrade.indexOf(fn) >= 0, 'интент ' + fn + ' объявлен');
  });
  ['trade_invite', 'trade_open', 'trade_update', 'trade_done', 'trade_close', 'trade_fail'].forEach((p) => {
    t.ok(netTrade.indexOf("case '" + p + "'") >= 0, 'пакет ' + p + ' разбирается');
  });
  t.ok(/isActive\(\)/.test(src['inventory-ui.js']) && /tradeUI\.add\(/.test(src['inventory-ui.js']),
    'пункт «В обмен» появляется при открытом окне обмена');
  t.ok(/\/trade /.test(src['ui.js']) && /intentTradeOffer/.test(src['ui.js']),
    'команда /trade отправляет предложение');

  t.suite('client: дуэль');
  t.ok(/intentDuelOffer/.test(src['net-ws.js']) && /intentDuelAccept/.test(src['net-ws.js']),
    'интенты дуэли объявлены');
  t.ok(/case 'duel_invite'/.test(src['net-ws.js']) && /case 'duel_start'/.test(src['net-ws.js']),
    'пакеты дуэли разбираются');
  t.ok(/\/duel /.test(src['ui.js']) && /intentDuelOffer/.test(src['ui.js']),
    'команда /duel отправляет вызов');
  t.ok(/id: 'duel'/.test(src['char-menu.js']) && /intentDuelOffer/.test(src['char-menu.js']),
    'пункт «Дуэль» в меню действий');

  t.suite('client: каналы чата');
  const uiChat = src['ui.js'];
  t.ok(/intentChat\([^)]*'tell'/.test(uiChat), '/tell отправляется в канал tell');
  t.ok(/intentChat\([^)]*'party'/.test(uiChat), '/p отправляется в канал party');
  t.ok(/intentChat\([^)]*'shout'/.test(uiChat), '/shout и ! отправляются в канал shout');
  t.ok(/_tabForType/.test(uiChat) && /'shout'/.test(uiChat) && /'tell'/.test(uiChat),
    'вкладки журнала знают про крик и личное');
  const html = fs.readFileSync(path.join(ROOT, 'client', 'game.html'), 'utf8');
  ['all', 'shout', 'party', 'clan', 'tell', 'system'].forEach((tab) => {
    t.ok(html.indexOf('data-tab="' + tab + '"') >= 0, 'вкладка ' + tab + ' есть в разметке');
  });
  t.ok(!/data-tab="alliance"/.test(html), 'вкладки «Альянс» нет — альянсов в 1–20 нет');
  const netChat = src['net-ws.js'];
  t.ok(/case 'chat_fail'/.test(netChat), 'отказ чата разбирается');
  t.ok(/m\.ch/.test(netChat), 'канал читается из пакета');
  t.ok(/intentChat\(text, ch, to\)/.test(netChat), 'intentChat принимает канал и адресата');
  t.ok(/intentChat\([^)]*'clan'/.test(uiChat), '/c отправляется в канал clan');
  t.ok(/intentReport/.test(src['net-ws.js']) && /\/report/.test(uiChat),
    'репорт игрока: интент и команда /report');
  t.ok(/4012/.test(src['net-ws.js']) && /muted/.test(src['net-ws.js']),
    'клиент знает бан (4012) и мут чата');

  t.suite('client: клан');
  t.ok(fs.existsSync(path.join(CLIENT_JS, 'clan-ui.js')), 'client/js/clan-ui.js есть');
  t.ok(bootScripts().some(s => s.indexOf('js/clan-ui.js') >= 0), 'clan-ui.js в цепочке загрузки');
  t.ok(bootScripts().some(s => s.indexOf('shared/clan-rules.js') >= 0), 'clan-rules.js в цепочке загрузки');
  const netCl = src['net-ws.js'];
  ['intentClanInfo', 'intentClanCreate', 'intentClanInvite', 'intentClanAccept',
    'intentClanLeave', 'intentClanKick', 'intentCwhOpen', 'intentCwhPut', 'intentCwhTake',
    'intentClanCrest'].forEach((fn) => {
    t.ok(netCl.indexOf(fn) >= 0, 'интент ' + fn + ' объявлен');
  });
  ['clan', 'clan_ok', 'clan_fail', 'clan_invite', 'clan_crest', 'clan_tag', 'cwh_open', 'cwh_ok', 'cwh_fail'].forEach((pk) => {
    t.ok(netCl.indexOf("case '" + pk + "'") >= 0, 'пакет ' + pk + ' разбирается');
  });
  t.ok(!/inventory\.(addItem|removeItem|spendCurrency)/.test(src['clan-ui.js']),
    'окно клана не двигает предметы локально');
  t.ok(/intentClanInfo/.test(src['char-menu.js']) && /intentClanInvite/.test(src['char-menu.js']),
    'кнопки клана в меню действий зовут сервер, а не заглушку');
  t.ok(/showWarehouseView\('clan'\)/.test(src['npc-ui.js']) && /intentCwhOpen/.test(src['npc-ui.js']),
    'клан-склад открывается у того же NPC склада');
  const i18nClan = fs.readFileSync(path.join(CLIENT_JS, 'i18n.js'), 'utf8');
  t.eq((i18nClan.match(/(^|\s)clan_warehouse:/g) || []).length, 2, 'ключ clan_warehouse есть в ru и en');

  t.suite('client: список друзей');
  const netFr = src['net-ws.js'];
  ['intentFriendList', 'intentFriendAdd', 'intentFriendAccept', 'intentFriendRemove'].forEach((fn) => {
    t.ok(netFr.indexOf(fn) >= 0, 'интент ' + fn + ' объявлен');
  });
  ['friends', 'friend_request', 'friend_status', 'friend_fail'].forEach((pk) => {
    t.ok(netFr.indexOf("case '" + pk + "'") >= 0, 'пакет ' + pk + ' разбирается');
  });
  const uiFr = src['ui.js'];
  t.ok(/\/friends/.test(uiFr) && /intentFriendList/.test(uiFr), 'команда /friends показывает список');
  t.ok(/\/friend_accept/.test(uiFr) && /intentFriendAccept/.test(uiFr), 'команда /friend_accept есть');
  t.ok(/\/unfriend/.test(uiFr) && /intentFriendRemove/.test(uiFr), 'команда /unfriend есть');
  // Кнопка «Сделка» в меню действий больше не заглушка
  t.ok(/intentTradeOffer/.test(src['char-menu.js']), 'кнопка «Сделка» в меню действий зовёт обмен');

  t.suite('client: лут-режимы пати');
  const lootJs = src['loot.js'];
  // Мёртвый клиентский код распределения удалён: решает сервер.
  t.ok(!/distributePartyLoot|roundRobinLoot|byDamageLoot/.test(lootJs),
    'клиентское распределение лута удалено (решает сервер)');
  t.ok(!/PARTY_DROP_MODE/.test(lootJs), 'мёртвый DROP_CONFIG.PARTY_DROP_MODE убран');
  t.ok(/intentPartyLoot/.test(src['net-ws.js']), 'интент смены режима объявлен');
  t.ok(/partyLootMode/.test(src['net-ws.js']), 'режим приходит в пакете party');
  t.ok(/'party_mode'/.test(src['net-ws.js']), 'отказ по режиму лута разбирается');
  t.ok(/\/loot/.test(src['ui.js']) && /intentPartyLoot/.test(src['ui.js']),
    'команда /loot меняет режим');
  // Регресс: в switch onMessage было два case 'party' — второй недостижим
  t.eq((src['net-ws.js'].match(/case 'party':/g) || []).length, 1,
    'дубль case \'party\' в onMessage удалён');

  t.suite('client: мультиперсонажность');
  const netChars = src['net-ws.js'];
  t.ok(!/lid = String\(ch\.id\)/.test(netChars),
    'dev uniqueID больше не подменяется на char.id — иначе в проде 7 слотов = 1 профиль');
  t.ok(/uniqueID: 'local_' \+ lid/.test(netChars) && /charId: ch && ch.id/.test(netChars),
    'аккаунт = ps_local_id, персонаж уходит отдельным charId');
  t.ok(/4005/.test(netChars) && /4011/.test(netChars) && /4012/.test(netChars),
    'слоты/удаление/бан — фатальные close, без бесконечного реконнекта');
  t.ok(/los: 'Цель не в зоне видимости/.test(src['net-ws.js']),
    'skill_fail los показывает «не в зоне видимости»');
  const csJs = src['char-select.js'];
  t.ok(/\/api\/chars/.test(csJs) && /\/api\/chars\/create/.test(csJs) && /\/api\/chars\/delete/.test(csJs),
    'выбор персонажа берёт список/создание/удаление с сервера');
  t.ok(!/uniqueID: 'local_' \+ .*ch\.id/.test(csJs),
    'char-select не подписывает uniqueID слотом');
  const csHtml = fs.readFileSync(path.join(ROOT, 'client', 'character-select.html'), 'utf8');
  t.ok(/js\/config\.js/.test(csHtml), 'character-select.html знает адрес игрового сервера');
  t.ok(/char-rules\.js/.test(csHtml), 'правила слотов общие с сервером');

  t.suite('client: синхронизация скиллов с shared/skill-db (P1.2)');
  const sharedSkillDb = require('../shared/skill-db');
  const skillsCode = fs.readFileSync(path.join(CLIENT_JS, 'skills.js'), 'utf8');
  const sandbox = {
    window: {
      SKILL_DB: sharedSkillDb,
      CLASS_SYSTEM: require('../shared/class-system')
    },
    console: { log: () => {}, warn: () => {}, error: () => {} }
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(skillsCode, sandbox);

  t.ok(!sandbox.window.SKILL_BY_ID['op_wrench_strike'], 'op_wrench_strike отсутствует в SKILL_BY_ID');
  t.ok(!sandbox.window.SKILL_DATABASE['op_wrench_strike'], 'op_wrench_strike отсутствует в SKILL_DATABASE');

  const clientSkills = sandbox.window.SKILL_DATABASE;
  const missingInShared = [];
  const rangeMismatches = [];
  const effectRangeMismatches = [];

  for (const key of Object.keys(clientSkills)) {
    const cs = clientSkills[key];
    if (!cs || !cs.id) continue;
    const ss = sharedSkillDb.get(cs.id);
    if (!ss) {
      missingInShared.push(cs.id);
      continue;
    }
    if (cs.type === 'active' && ss.type === 'active') {
      if (ss.range != null && cs.range !== ss.range) {
        rangeMismatches.push(cs.id + ' (client=' + cs.range + ' vs shared=' + ss.range + ')');
      }
      if (ss.effectRange != null && cs.effectRange !== ss.effectRange) {
        effectRangeMismatches.push(cs.id + ' (client=' + cs.effectRange + ' vs shared=' + ss.effectRange + ')');
      }
    }
  }

  t.eq(missingInShared, [], 'все скиллы клиента присутствуют в shared/skill-db');
  t.eq(rangeMismatches, [], 'range активных скиллов клиента совпадает с shared');
  t.eq(effectRangeMismatches, [], 'effectRange активных скиллов клиента совпадает с shared');

  const dummyPlayer = { playerClass: 'operator', level: 1, passiveBonuses: {} };
  const sm = new sandbox.window.SkillManager(dummyPlayer);
  const smMismatches = [];
  for (const id of Object.keys(sharedSkillDb.SKILLS)) {
    const ss = sharedSkillDb.SKILLS[id];
    if (ss.type === 'active' && ss.range != null) {
      const smRange = sm.getSkillRange(id);
      if (smRange !== ss.range) {
        smMismatches.push(id + ' (sm=' + smRange + ' vs shared=' + ss.range + ')');
      }
    }
  }
  t.eq(smMismatches, [], 'SkillManager.getSkillRange выдает паспортный range из shared');

  t.suite('client: 3D позиционный звук и пул источников (P2.3)');
  const audioCode = fs.readFileSync(path.join(CLIENT_JS, 'audio.js'), 'utf8');
  t.ok(/init3D/.test(audioCode), 'audio.js объявляет init3D');
  t.ok(/playPositional/.test(audioCode), 'audio.js объявляет playPositional');
  t.ok(/SFX_3D_CAP\s*=\s*8/.test(audioCode), 'audio.js ограничивает 3D пул капом 8 источников');
  t.ok(/MAX_3D_DIST\s*=\s*60/.test(audioCode), 'audio.js имеет дальность отсечения 60м');
  t.ok(/REF_3D_DIST\s*=\s*5/.test(audioCode), 'audio.js имеет базовую дистанцию 5м');

  // Mock Three.js & Web Audio in VM sandbox
  class MockAudioNode {
    connect() {}
    disconnect() {}
    setValueAtTime() {}
    exponentialRampToValueAtTime() {}
    start() {}
    stop() {}
  }
  class MockGainNode extends MockAudioNode {
    constructor() {
      super();
      this.gain = {
        value: 1,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {}
      };
    }
  }
  class MockAudioContext {
    constructor() {
      this.currentTime = 0;
      this.destination = new MockAudioNode();
      this.state = 'running';
    }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { return new MockGainNode(); }
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect() {},
        disconnect() {},
        start() {},
        stop() {}
      };
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime() {} },
        connect() {},
        start() {},
        stop() {}
      };
    }
    createPanner() {
      return {
        panningModel: 'HRTF',
        distanceModel: 'inverse',
        refDistance: 5,
        maxDistance: 60,
        rolloffFactor: 1.2,
        setPosition(x, y, z) { this.x = x; this.y = y; this.z = z; },
        connect() {}
      };
    }
    decodeAudioData(ab) {
      return Promise.resolve({ duration: 0.1 });
    }
  }
  class MockAudioListener {
    constructor() {
      this.context = new MockAudioContext();
      this.gain = new MockGainNode();
      this.parent = null;
    }
    getInput() { return this.gain; }
  }
  class MockPositionalAudio {
    constructor(listener) {
      this.listener = listener;
      this.isPlaying = false;
      this.panner = listener.context.createPanner();
    }
    setRefDistance(d) { this.refDist = d; }
    setMaxDistance(d) { this.maxDist = d; }
    setRolloffFactor(r) { this.rolloff = r; }
    setDistanceModel(m) { this.distModel = m; }
    setBuffer(b) { this.buffer = b; }
    setVolume(v) { this.volume = v; }
    play() { this.isPlaying = true; }
    stop() { this.isPlaying = false; }
  }
  class MockObject3D {
    constructor() {
      this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      this.children = [];
    }
    add(c) { this.children.push(c); c.parent = this; }
  }

  const audioSandbox = {
    window: {
      AudioContext: MockAudioContext,
      THREE: {
        AudioContext: {
          setContext() {}
        },
        AudioListener: MockAudioListener,
        PositionalAudio: MockPositionalAudio,
        Object3D: MockObject3D
      },
      localStorage: {
        getItem() { return null; },
        setItem() {}
      },
      addEventListener() {},
      removeEventListener() {}
    },
    document: {
      addEventListener() {},
      hidden: false
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Audio: class MockAudio {
      constructor() { this.volume = 1; }
      play() { return Promise.resolve(); }
      pause() {}
    },
    Date,
    Math,
    setTimeout,
    clearTimeout
  };
  audioSandbox.window.window = audioSandbox.window;
  vm.createContext(audioSandbox);
  vm.runInContext(audioCode, audioSandbox);

  const audioInst = audioSandbox.window.GameAudio;
  t.ok(audioInst, 'GameAudio инициализирован');
  audioInst.unlock();
  t.ok(audioInst.unlocked, 'GameAudio разблокирован');

  const mockCamera = new MockObject3D();
  const mockScene = new MockObject3D();
  audioInst.init3D(mockCamera, mockScene);

  t.ok(audioInst.listener, 'THREE.AudioListener создан');
  t.eq(audioInst._posPool.length, 8, '3D пул содержит ровно 8 слотов (кап)');
  t.eq(audioInst._posPool[0].audio.maxDist, 60, 'слот настроен на maxDistance 60м');
  t.eq(audioInst._posPool[0].audio.refDist, 5, 'слот настроен на refDistance 5м');

  // Test position > 60m is dropped early
  const posFar = { x: 100, y: 0, z: 100 }; // dist ~ 141m > 60m
  const slotsInUseBefore = audioInst._posPool.filter(s => s.inUse).length;
  audioInst.play('hit', posFar);
  const slotsInUseAfter = audioInst._posPool.filter(s => s.inUse).length;
  t.eq(slotsInUseBefore, slotsInUseAfter, 'звук на дистанции > 60м отсекается (не тратит голоса)');

  // Test position within 5m–50m triggers positional playback
  const posMid = { x: 15, y: 0, z: 0 }; // dist = 15m
  audioInst.play('hit', posMid);
  t.ok(true, 'play("hit", pos) корректно отрабатывает без исключений');

  // Test Web Audio pure engine: zero new Audio() calls (eliminates Chrome Global Media Controls overlay)
  t.ok(!/new Audio\(/.test(audioCode), 'audio.js не использует new Audio() — только внутриигровой Web Audio движок');
  audioInst.play('soulshot');
  t.ok(true, 'play("soulshot") 2D SFX воспроизводится через AudioBuffer / синтез без исключений');

  // Test setZone & hidden state suspend / resume
  audioInst.setZone('village');
  t.eq(audioInst._pendingZone, 'village', 'setZone корректно переключает зону');
  audioInst.setPageHidden(true);
  t.ok(audioInst.hidden, 'audioInst.hidden = true при скрытии вкладки');
  t.eq(audioInst.ctx.state, 'suspended', 'AudioContext suspended при скрытии вкладки');
  audioInst.setPageHidden(false);
  t.ok(!audioInst.hidden, 'audioInst.hidden = false при возврате во вкладку');
  t.eq(audioInst.ctx.state, 'running', 'AudioContext running при возврате во вкладку');

  t.suite('client: i18n словарь и a11y выделения чата (P2.4)');
  // Проверка CSS на выделение текста чата
  const styleCss = fs.readFileSync(path.join(ROOT, 'client', 'css', 'style.css'), 'utf8');
  t.ok(!/html,\s*body\s*\{[^}]*user-select:\s*none\s*!important/s.test(styleCss),
    'html, body в style.css не блокирует user-select намертво через !important');

  const l2HudCss = fs.readFileSync(path.join(ROOT, 'client', 'css', 'l2-hud.css'), 'utf8');
  t.ok(/\.l2-chat-log\s*\{[^}]*user-select:\s*text\s*!important/s.test(l2HudCss),
    'l2-chat-log имеет user-select: text !important');
  t.ok(/\.chat-message[^{]*\{[^}]*user-select:\s*text\s*!important/s.test(l2HudCss),
    'chat-message имеет user-select: text !important');

  // Проверка i18n
  const i18nCode = fs.readFileSync(path.join(CLIENT_JS, 'i18n.js'), 'utf8');
  const i18nSandbox = {
    window: {
      localStorage: {
        getItem() { return 'ru'; },
        setItem() {}
      },
      sessionStorage: {
        getItem() { return 'ru'; },
        setItem() {}
      }
    },
    document: {
      readyState: 'complete',
      addEventListener() {},
      querySelectorAll() { return []; }
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Object,
    RegExp
  };
  i18nSandbox.window.window = i18nSandbox.window;
  vm.createContext(i18nSandbox);
  vm.runInContext(i18nCode, i18nSandbox);

  const i18nInst = i18nSandbox.window.i18n;
  t.ok(i18nInst, 'I18nManager инициализирован');

  const requiredHudKeys = [
    'chat_all', 'chat_shout', 'chat_party', 'chat_clan', 'chat_tell', 'chat_system',
    'chat_placeholder', 'party_title', 'sys_status', 'sys_inventory', 'sys_map', 'sys_settings',
    'mobile_attack', 'mobile_target', 'mobile_pickup', 'mobile_rest', 'mobile_row',
    'death_title', 'death_body', 'death_village_btn', 'death_hint'
  ];

  i18nInst.setLanguage('ru');
  t.eq(i18nInst.getLanguage(), 'ru', 'текущий язык ru');
  const missingRuKeys = requiredHudKeys.filter(k => !i18nInst.dict.ru[k]);
  t.eq(missingRuKeys, [], 'все ключи HUD присутствуют в словаре ru');

  i18nInst.setLanguage('en');
  t.eq(i18nInst.getLanguage(), 'en', 'язык переключён на en');
  const missingEnKeys = requiredHudKeys.filter(k => !i18nInst.dict.en[k]);
  t.eq(missingEnKeys, [], 'все ключи HUD присутствуют в словаре en');
  t.eq(i18nInst.t('chat_all'), 'All', 't("chat_all") на en возвращает "All"');
  t.eq(i18nInst.t('party_title'), 'PARTY', 't("party_title") на en возвращает "PARTY"');

  // DOM markup validation in game.html
  const inGameHtml = fs.readFileSync(path.join(ROOT, 'client', 'game.html'), 'utf8');
  t.ok(/data-i18n="chat_all"/.test(inGameHtml), 'game.html содержит data-i18n="chat_all"');
  t.ok(/data-i18n="party_title"/.test(inGameHtml), 'game.html содержит data-i18n="party_title"');
  t.ok(/data-i18n="death_title"/.test(inGameHtml), 'game.html содержит data-i18n="death_title"');
  t.ok(/data-i18n-title="sys_status"/.test(inGameHtml), 'game.html содержит data-i18n-title="sys_status"');
  t.ok(/data-i18n-placeholder="chat_placeholder"/.test(inGameHtml), 'game.html содержит data-i18n-placeholder="chat_placeholder"');

  // Ground loot hover (L2 classic plain text on hover)
  t.suite('client: ground loot hover (L2 classic style)');
  const inHudCss = fs.readFileSync(path.join(ROOT, 'client', 'css', 'l2-hud.css'), 'utf8');
  t.ok(/id="l2-ground-loot-hover"/.test(inGameHtml), 'game.html содержит id="l2-ground-loot-hover"');
  t.ok(/\.l2-ground-loot-hover\s*\{/.test(inHudCss), 'l2-hud.css содержит класс .l2-ground-loot-hover');
  t.ok(/text-shadow:/.test(inHudCss), 'стили l2-ground-loot-hover имеют text-shadow для контура текста');

  const lootJsCode = fs.readFileSync(path.join(CLIENT_JS, 'loot.js'), 'utf8');
  const lootSandbox = {
    window: {
      ITEM_DATABASE: {
        iron_scrap: { id: 'iron_scrap', name: 'Железный лом' },
        long_sword: { id: 'long_sword', name: 'Длинный меч' }
      }
    },
    THREE: {
      Vector3: class { constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; } },
      Group: class { constructor() { this.children = []; this.userData = {}; } add(c) { this.children.push(c); } traverse(fn) { fn(this); this.children.forEach(c => c.traverse ? c.traverse(fn) : fn(c)); } },
      Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.userData = {}; this.position = { set() {}, x: 0, y: 0, z: 0 }; } traverse(fn) { fn(this); } },
      BoxGeometry: class {},
      MeshBasicMaterial: class { constructor(opts) { Object.assign(this, opts); } }
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Object,
    Date,
    Map,
    Set
  };
  lootSandbox.window.window = lootSandbox.window;
  vm.createContext(lootSandbox);
  vm.runInContext(lootJsCode, lootSandbox);

  const LM = lootSandbox.window.LootManager;
  t.ok(typeof LM.prototype.getLootDisplayName === 'function', 'getLootDisplayName метод доступен');

  const lmInst = new LM({ add() {} });
  t.eq(lmInst.getLootDisplayName({ drop: { itemId: 'copper_parts', amount: 21 } }), 'Медные детали(21)', 'Медные детали(21)');
  t.eq(lmInst.getLootDisplayName({ drop: { itemId: 'iron_scrap', amount: 1 } }), 'Железный лом', 'Железный лом (1 шт без скобок)');
  t.eq(lmInst.getLootDisplayName({ drop: { itemId: 'iron_scrap', amount: 5 } }), 'Железный лом(5)', 'Железный лом(5)');
  t.eq(lmInst.getLootDisplayName({ drop: { itemId: 'long_sword', amount: 1, plus: 3 } }), '+3 Длинный меч', '+3 Длинный меч');
  t.eq(lmInst.getLootDisplayName({ drop: { name: 'adena', amount: 21 } }), 'adena(21)', 'adena(21) в точности как на скриншоте');

  // Paperdoll slots for title and costume, crisp nameplates
  t.suite('client: paperdoll slots, equippable titles and crisp nameplates');
  const invUiCode = fs.readFileSync(path.join(CLIENT_JS, 'inventory-ui.js'), 'utf8');
  const invCode = fs.readFileSync(path.join(CLIENT_JS, 'inventory.js'), 'utf8');
  const iconsCode = fs.readFileSync(path.join(CLIENT_JS, 'l2-icon-assets.js'), 'utf8');
  const playerCode = fs.readFileSync(path.join(CLIENT_JS, 'player.js'), 'utf8');

  t.ok(/data-slot="title"/.test(invUiCode), 'кукла персонажа содержит data-slot="title"');
  t.ok(/data-slot="costume"/.test(invUiCode), 'кукла персонажа содержит data-slot="costume"');
  t.ok(/TITLE:\s*'title'/.test(invCode), 'EQUIP_SLOTS содержит TITLE');
  t.ok(/COSTUME:\s*'costume'/.test(invCode), 'EQUIP_SLOTS содержит COSTUME');
  t.ok(/case\s+'title':/.test(iconsCode), 'l2-icon-assets отрисовывает силуэт титула');
  t.ok(/case\s+'costume':/.test(iconsCode), 'l2-icon-assets отрисовывает силуэт костюма');
  t.ok(/_nameCanvas\.width\s*=\s*1024/.test(playerCode), 'плашка титула игрока в 1024x192 (высокая чёткость)');
  t.ok(/_nameTex\.generateMipmaps\s*=\s*true/.test(playerCode), 'мипмапы включены для предотвращения мыла на дистанции');
};

