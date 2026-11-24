// ============================================================
//  TESTS / DEV-TOOLS-ISOLATION.TEST.JS
//  Редактор мира и шоурум — только в локальной папке проекта и в локальной GM-сборке:
//   - релизный клиент (build-client → Render / Яндекс Игры) их не содержит, страж валит сборку;
//   - релизные страницы несут флаг __PS_RELEASE_BUILD → загрузчик редактора и F2 выключены;
//   - на боевой VPS (deploy-vps / sync-client-vps) их файлы не уезжают и подчищаются;
//   - GM-сборка (build-gm) их содержит.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

module.exports = async function (t) {
  t.suite('dev-tools: релизная сборка клиента без редактора и шоурума');
  const bc = read('scripts', 'build-client.js');
  t.ok(/'game\.html'/.test(bc) && !/'editor\.html'/.test(bc) && !/'showroom\.html'/.test(bc), 'в релиз копируются только игровые страницы (без editor.html / showroom.html)');
  t.ok(/name\.startsWith\('editor'\) && name !== 'editor-overrides-data\.js'/.test(bc) && /name\.startsWith\('showroom'\)/.test(bc), 'editor*.js и showroom*.js не копируются (данные мира editor-overrides-data.js — копируются)');
  t.ok(/__PS_RELEASE_BUILD = true/.test(bc), 'в релизные страницы вставляется флаг __PS_RELEASE_BUILD');
  t.ok(/BUILD-CLIENT_FATAL/.test(bc) && /process\.exit\(1\)/.test(bc), 'страж: попадание редактора/шоурума в билд роняет сборку');
  // Регулярка стража: ловит инструменты, но не данные мира
  const reSrc = /const DEV_ONLY_FILE_RE = (\/.*\/i);/.exec(bc);
  t.ok(!!reSrc, 'страж-регулярка найдена');
  if (reSrc) {
    const re = eval(reSrc[1]); // eslint-disable-line no-eval
    t.ok(re.test('editor.js') && re.test('editor-engine-layout.js') && re.test('editor.html') && re.test('editor-engine.css'), 'страж ловит файлы редактора');
    t.ok(re.test('showroom.js') && re.test('showroom.html') && re.test('showroom.css'), 'страж ловит файлы шоурума');
    t.ok(!re.test('editor-overrides.json') && !re.test('editor-overrides-data.js') && !re.test('game.html'), 'страж не трогает данные мира и игру');
  }
  const distDir = path.join(ROOT, 'dist', 'client');
  if (fs.existsSync(path.join(distDir, 'game.html'))) {
    const leaks = [];
    (function scan(d) {
      for (const it of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, it.name);
        if (it.isDirectory()) scan(p);
        else if (/^(editor(?!-overrides)|showroom)/i.test(it.name)) leaks.push(path.relative(distDir, p));
      }
    })(distDir);
    t.eq(leaks, [], 'в текущем dist/client нет файлов редактора и шоурума');
    t.ok(fs.readFileSync(path.join(distDir, 'game.html'), 'utf8').includes('__PS_RELEASE_BUILD = true'), 'dist/client/game.html помечен как релиз');
    t.ok(!fs.readFileSync(path.join(distDir, 'menu.html'), 'utf8').includes('mm-btn-showroom'), 'в релизном меню нет кнопки шоурума');
  } else {
    t.ok(true, 'dist/client не собран — проверка готового билда пропущена');
  }

  t.suite('dev-tools: релиз выключает загрузчик редактора (F2)');
  const boot = read('client', 'js', 'boot.module.js');
  t.ok(/const EDITOR_SCRIPTS = PS_RELEASE_BUILD \? \[\] :/.test(boot), 'в релизе список скриптов редактора пуст');
  t.ok(/__ensureSceneEditor = async function \(game\) \{\s*\n\s*if \(PS_RELEASE_BUILD\) return null;/.test(boot), 'в релизе __ensureSceneEditor сразу возвращает null (без /api/editor/*)');
  const mainJs = read('client', 'js', 'main.js');
  t.ok(/if \(e\.key === 'F2'\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*if \(window\.__PS_RELEASE_BUILD === true\) return;/.test(mainJs), 'F2 в релизе ничего не делает');

  t.suite('dev-tools: на боевой VPS — только чистый серверный пакет');
  const dv = read('scripts', 'deploy-vps.js');
  const listOf = (src, name) => {
    const m = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(src);
    return m ? (m[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1)) : null;
  };
  const vpsClient = listOf(dv, 'SERVER_CLIENT_FILES');
  const vpsScripts = listOf(dv, 'SERVER_SCRIPTS');
  const tg = /const targets = \[([\s\S]*?)\]\.join/.exec(dv);
  const targetItems = tg ? (tg[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1)) : [];
  t.ok(!!vpsClient && !!vpsScripts && targetItems.length > 0, 'deploy-vps: списки пакета найдены');
  t.ok(!targetItems.some((x) => x === 'client' || x === 'client/js' || x === 'scripts' || x.startsWith('client/assets')),
    'deploy-vps не везёт клиент, ассеты и инструменты целиком (только серверный набор)');
  t.ok(vpsClient && vpsClient.every((f) => /^client\/(js\/[\w-]+\.js|data\/mesh\/[\w-]+\.bin)$/.test(f)) &&
    !vpsClient.some((f) => /editor\.js|showroom|crowd-stress|char-model|main\.js|ui\.js/.test(f)),
    'из клиента на VPS — только геодата сервера (без редактора, шоурума, тестов и игрового JS)');
  // каждый клиентский модуль, который грузит сервер (loadWorldGeo), — в пакете VPS
  const srv = read('server', 'server.js');
  const needJs = [];
  srv.replace(/path\.join\(CLIENT, 'js', '([\w-]+\.js)'\)/g, (_, f) => { needJs.push('client/js/' + f); return _; });
  const needBin = [];
  srv.replace(/path\.join\(CLIENT, 'data', 'mesh', '([\w-]+\.bin)'\)/g, (_, f) => { needBin.push('client/data/mesh/' + f); return _; });
  t.ok(needJs.length > 0 && needJs.concat(needBin).every((f) => vpsClient && vpsClient.includes(f)),
    'всё, что сервер читает из client/, есть в пакете VPS (' + needJs.concat(needBin).length + ' файлов)');
  t.ok(vpsScripts && vpsScripts.every((f) => /^scripts\/(guard-anti-rollback|healthcheck|watchdog)\.js$/.test(f)),
    'из scripts/ на VPS — только guard, healthcheck и watchdog');
  const eco = read('ecosystem.config.js');
  t.ok(/script: 'scripts\/watchdog\.js'/.test(eco) && vpsScripts && vpsScripts.includes('scripts/watchdog.js'),
    'watchdog из PM2 есть в пакете');
  t.ok(/rsync -a --delete \$\{stageDir\}\/client\/ \$\{REMOTE_DIR\}\/client\//.test(dv) &&
    /rsync -a --delete \$\{stageDir\}\/scripts\/ \$\{REMOTE_DIR\}\/scripts\//.test(dv),
    'deploy-vps подчищает на VPS остатки прежних деплоев в client/ и scripts/');
  t.ok(/guard-anti-rollback\.js --server/.test(dv), 'на VPS guard запускается в серверном режиме');
  const sc = read('scripts', 'sync-client-vps.js');
  const scClient = listOf(sc, 'SERVER_CLIENT_FILES');
  t.ok(!!scClient && JSON.stringify(scClient) === JSON.stringify(vpsClient),
    'sync-client-vps синхронизирует тот же серверный набор геодаты, что deploy-vps');
  t.ok(!/ client\/js(`| )/.test(sc) && !/editor-overrides\.json client/.test(sc),
    'sync-client-vps не заливает на VPS клиентский JS целиком');
  const guard = read('scripts', 'guard-anti-rollback.js');
  t.ok(/process\.argv\.includes\('--server'\)/.test(guard) && /function checkLocal\(/.test(guard),
    'guard: серверный режим пропускает только клиентские проверки');

  t.suite('dev-tools: в релизном клиенте нет панели тестов и отладки');
  const gameHtml = read('client', 'game.html');
  t.ok(/<!-- dev-only -->\s*<button[^>]*data-action="tests"[\s\S]*?<\/button>\s*<!-- \/dev-only -->/.test(gameHtml),
    'кнопка «Тесты» (F9) в game.html помечена dev-only');
  const csHtml = read('client', 'character-select.html');
  t.ok(/<!-- dev-only -->[\s\S]*id="cs-debug-fps"[\s\S]*?<!-- \/dev-only -->/.test(csHtml),
    'FPS-график выбора персонажа помечен dev-only');
  t.ok(/DEV_ONLY_BLOCK_RE/.test(bc) && /name === 'crowd-stress-test\.js'\) return false/.test(bc),
    'build-client вырезает dev-only блоки и не копирует стресс-тест толпы');
  if (reSrc) {
    const re2 = eval(reSrc[1]); // eslint-disable-line no-eval
    t.ok(re2.test('crowd-stress-test.js'), 'страж билда ловит стресс-тест толпы');
  }
  t.ok(/if \(!PS_RELEASE_BUILD\) \{[\s\S]{0,200}crowd-stress-test\.js/.test(boot) && !/^\s*'js\/crowd-stress-test\.js/m.test(boot),
    'boot грузит стресс-тест только вне релиза');
  t.ok(/if \(e\.key === 'F9'\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*if \(window\.__PS_RELEASE_BUILD === true\) return;/.test(mainJs),
    'F9 (панель тестов) в релизе ничего не делает');
  t.ok(!/Все тесты ядра зелёные/.test(mainJs), 'в чат при входе не пишется отладочная сводка тестов');
  const uiJs = read('client', 'js', 'ui.js');
  t.ok(/const devTools = window\.__PS_RELEASE_BUILD !== true;/.test(uiJs) && /\$\{devTools \? `<!-- Кнопки тестирования/.test(uiJs),
    'в настройках релиза нет кнопок теста толпы и отладочных колец');
  if (fs.existsSync(path.join(distDir, 'game.html'))) {
    const dGame = fs.readFileSync(path.join(distDir, 'game.html'), 'utf8');
    const dCs = fs.readFileSync(path.join(distDir, 'character-select.html'), 'utf8');
    t.ok(!/data-action="tests"/.test(dGame) && !/id="cs-debug-fps"/.test(dCs) && !fs.existsSync(path.join(distDir, 'js', 'crowd-stress-test.js')),
      'в текущем dist/client нет панели тестов, FPS-графика и стресс-теста');
  }

  t.suite('dev-tools: локальная GM-сборка содержит редактор и шоурум');
  const gm = read('scripts', 'build-gm.js');
  t.ok(/'editor\.html'/.test(gm) && /'showroom\.html'/.test(gm), 'build-gm копирует editor.html и showroom.html');
  t.ok(!/__PS_RELEASE_BUILD/.test(gm), 'GM-сборка не помечается как релиз (редактор работает)');
};
