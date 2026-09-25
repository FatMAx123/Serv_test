// ============================================================
//  TESTS / QUEST.TEST.JS — данные и правила квестов 1–20.
//  Регресс: квесты жили в клиенте (localStorage), ключи базы были UPPERCASE,
//  а quest.id — lowercase, из-за чего QUEST_DATABASE[id] всегда возвращал
//  undefined; цели kill/collect не работали (хуки не вызывались), collect
//  указывал на валюту copper_parts, которая не лежит в сумке как предмет.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const QD = require(path.join(ROOT, 'shared', 'quest-db.js'));
const CS = require(path.join(ROOT, 'shared', 'class-system.js'));
const LR = require(path.join(ROOT, 'shared', 'loot-rules.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const MOB = require(path.join(ROOT, 'shared', 'mob-db.js'));
const EXP = require(path.join(ROOT, 'shared', 'l2-exp-table.js'));
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));

module.exports = function (t) {
  // Споты и позиции NPC зависят от оверрайдов редактора — сервер применяет их
  // при старте, тест обязан работать с той же геометрией.
  try {
    const f = path.join(ROOT, 'shared', 'editor-overrides.json');
    if (fs.existsSync(f)) {
      WM.applyEditorOverrides(JSON.parse(fs.readFileSync(f, 'utf8')));
      if (WM.rebuildMobSpotsFromEditor) WM.rebuildMobSpotsFromEditor();
      NPCS.rebuild();
    } else if (WM.rebuildMobSpotsFromEditor) {
      WM.rebuildMobSpotsFromEditor();
      NPCS.rebuild();
    }
  } catch (e) { /* ignore */ }

  t.suite('quest-db: целостность данных');
  const errs = QD.validate();
  t.eq(errs, [], 'валидация данных без ошибок');
  t.ok(QD.all().length >= 8, 'квестов не меньше 8', 'всего: ' + QD.all().length);
  // Ключ должен совпадать с id: раньше расхождение ломало все обращения.
  const keyMismatch = Object.keys(QD.QUESTS).filter(k => QD.QUESTS[k].id !== k);
  t.eq(keyMismatch, [], 'ключ базы == quest.id');
  t.ok(QD.get('main_01_welcome'), 'квест ищется по lowercase id');
  t.eq(QD.get('MAIN_01_WELCOME'), QD.get('main_01_welcome'), 'регистр id не важен');
  t.eq(QD.get('__proto__'), null, 'prototype-ключ не квест');
  t.eq(QD.get('нет_такого'), null, 'неизвестный id → null');

  t.suite('quest-db: цели выполнимы в мире');
  // kill: моб должен существовать и реально спавниться
  const spots = WM.buildSpots ? WM.buildSpots() : [];
  t.ok(spots.length > 0, 'споты мира загружены', 'спотов: ' + spots.length);
  const spawnCount = {};
  spots.forEach((s) => { spawnCount[s.mob] = (spawnCount[s.mob] || 0) + (s.n || 0); });
  const noSpawn = [];
  const noMob = [];
  QD.all().forEach((q) => {
    q.objectives.filter(o => o.type === 'kill').forEach((o) => {
      if (!MOB.get(o.target)) noMob.push(q.id + '/' + o.target);
      else if (!spawnCount[o.target]) noSpawn.push(q.id + '/' + o.target);
    });
  });
  t.eq(noMob, [], 'все kill-цели есть в mob-db');
  t.eq(noSpawn, [], 'все kill-цели реально спавнятся в мире');

  // collect: предмет должен падать с мобов (иначе цель невыполнима)
  const drops = new Set();
  Object.keys(LR.MOB_LOOT_TABLES).forEach((mobId) => {
    for (let i = 0; i < 120; i++) {
      const d = LR.rollMobLoot(mobId, { level: 14 });
      if (d && Array.isArray(d.items)) d.items.forEach(it => drops.add(it.id));
      const s = LR.rollSpoil(mobId, { level: 14 });
      if (Array.isArray(s)) s.forEach(it => drops.add(it.id));
    }
  });
  const notDropped = [];
  const isCurrency = [];
  QD.all().forEach((q) => {
    q.objectives.filter(o => o.type === 'collect').forEach((o) => {
      if (NPCS.isCurrency(o.target)) isCurrency.push(q.id + '/' + o.target);
      else if (!drops.has(o.target)) notDropped.push(q.id + '/' + o.target);
    });
  });
  t.eq(isCurrency, [], 'ни одна collect-цель не указывает на валюту');
  t.eq(notDropped, [], 'все collect-цели выпадают с мобов');

  // collect не должен закрываться покупкой в магазине: иначе квест = «занеси адену»
  const sold = new Set();
  NPCS.allNpcs().forEach((n) => NPCS.shopCatalog(n.id).forEach(e => sold.add(e.itemId)));
  const buyable = [];
  QD.all().forEach((q) => {
    const collects = q.objectives.filter(o => o.type === 'collect');
    if (!collects.length) return;
    // Квест «покупаемый», только если ВСЕ его collect-цели продаются
    if (collects.every(o => sold.has(o.target))) buyable.push(q.id);
  });
  t.eq(buyable, [], 'нет квестов, полностью закрываемых покупкой материалов');

  // talk: NPC должен существовать
  const noNpc = [];
  QD.all().forEach((q) => {
    if (q.npc && !NPCS.getNpc(q.npc)) noNpc.push(q.id + '/npc:' + q.npc);
    q.objectives.filter(o => o.type === 'talk').forEach((o) => {
      if (!NPCS.getNpc(o.target)) noNpc.push(q.id + '/talk:' + o.target);
    });
  });
  t.eq(noNpc, [], 'все NPC квестов существуют в world-metrics');

  t.suite('quest-db: баланс наград (кап 20)');
  // Награды-ЭКИП не должны быть выше D: кап фазы 1 — Top D @20.
  // Материалы и трофеи боссов (ядра) исключены — они штатный дроп рейдов 16–20.
  const overGrade = [];
  const WEARABLE = { weapon: 1, armor: 1, accessory: 1 };
  QD.all().forEach((q) => {
    (q.rewards.items || []).forEach((it) => {
      const meta = NPCS.itemMeta(it.id);
      if (!meta || !WEARABLE[meta.type]) return;
      const g = String(meta.grade || 'no_grade').toLowerCase();
      if (g === 'c' || g === 'b' || g === 'a' || g === 's') overGrade.push(q.id + '/' + it.id + ':' + g);
    });
  });
  t.eq(overGrade, [], 'в наградах нет экипа выше D-грейда');
  // Чертежи выше D тоже бессмысленны: крафт C/B недоступен в фазе 1.
  const overRecipe = [];
  QD.all().forEach((q) => {
    (q.rewards.items || []).forEach((it) => {
      const meta = NPCS.itemMeta(it.id);
      if (!meta || meta.type !== 'recipe') return;
      const g = String(meta.grade || 'no_grade').toLowerCase();
      if (g !== 'no_grade' && g !== 'd') overRecipe.push(q.id + '/' + it.id + ':' + g);
    });
  });
  t.eq(overRecipe, [], 'в наградах нет чертежей выше D-грейда');
  // Уровень требования не выше капа
  const overLevel = QD.all().filter(q => q.levelReq > EXP.MAX_LEVEL).map(q => q.id);
  t.eq(overLevel, [], 'levelReq не выше MAX_LEVEL');
  // EXP-награда не должна превышать уровень: 2000 exp на 20 ур. ≈ 0.2 % бара
  const q04 = QD.get('main_04_certification');
  t.ok(q04.rewards.exp < EXP.expToNext(19), 'финальный квест не даёт больше бара уровня',
    q04.rewards.exp + ' < ' + EXP.expToNext(19));

  t.suite('quest-db: цепочка и доступность');
  t.eq(QD.prerequisiteOf('main_02_perimeter'), 'main_01_welcome', 'обратный индекс цепочки');
  t.eq(QD.prerequisiteOf('main_01_welcome'), null, 'у первого квеста нет предусловия');
  let st = QD.emptyState();
  t.ok(QD.canAccept(st, QD.get('main_01_welcome'), 1).ok, 'main_01 доступен на 1 ур.');
  t.eq(QD.canAccept(st, QD.get('main_02_perimeter'), 1).reason, 'prereq',
    'main_02 закрыт до сдачи main_01');
  t.eq(QD.canAccept(st, QD.get('main_04_certification'), 19).reason, 'level',
    'main_04 требует 20 ур.');
  const op04 = QD.get('main_04_certification');
  const tech04 = QD.get('main_04_certification_tech');
  t.ok(tech04, 'квест инженера на 20 существует');
  t.eq(op04.classReq, 'operator', 'main_04 — оператор');
  t.eq(tech04.classReq, 'engineer', 'tech_04 — инженер');
  t.eq(QD.prerequisiteOf('main_04_certification_tech'), 'main_03_machines',
    'инженерская сертификация после Языка машин');
  const liveTransfer = [];
  ['operator', 'engineer'].forEach((id) => {
    const c = CS.getClass(id);
    const qid = c && c.transferQuest;
    if (!qid || !QD.get(qid)) liveTransfer.push(id + ':' + qid);
  });
  t.eq(liveTransfer, [], 'transferQuest обеих баз указывает на живой квест');
  st.done.main_03_machines = { n: 1, at: Date.now() };
  t.ok(QD.canAccept(st, op04, 20, Date.now(), 'operator').ok, 'оператор видит свою сертификацию');
  t.eq(QD.canAccept(st, op04, 20, Date.now(), 'engineer').reason, 'class',
    'инженер не берёт квест оператора');
  t.ok(QD.canAccept(st, tech04, 20, Date.now(), 'engineer').ok, 'инженер видит сертификацию контура');
  t.eq(QD.canAccept(st, tech04, 20, Date.now(), 'operator').reason, 'class',
    'оператор не берёт квест инженера');
  const snapOp = QD.snapshot(st, 20, Date.now(), 'operator');
  const snapEng = QD.snapshot(st, 20, Date.now(), 'engineer');
  t.ok(snapOp.available.indexOf('main_04_certification') >= 0, 'в available оператора — его 04');
  t.ok(snapOp.available.indexOf('main_04_certification_tech') < 0, 'в available оператора нет tech 04');
  t.ok(snapEng.available.indexOf('main_04_certification_tech') >= 0, 'в available инженера — tech 04');
  t.ok(snapEng.available.indexOf('main_04_certification') < 0, 'в available инженера нет operator 04');
  t.ok(tech04.rewards && tech04.rewards.classChange, 'сдача tech 04 открывает 1-ю профу');

  // Квесты 1-й профессии Инженера (L2 C1 Wizard / Cleric аналог)
  t.suite('quest-db: 1-я смена профессии инженера (Конструктор и Наладчик)');
  const qConst = QD.get('path_to_constructor');
  const qTech = QD.get('path_to_technomancer');
  t.ok(qConst, 'квест Путь Конструктора существует');
  t.ok(qTech, 'квест Путь Наладчика существует');
  t.eq(qConst.classReq, 'engineer', 'Путь Конструктора только для инженера');
  t.eq(qTech.classReq, 'engineer', 'Путь Наладчика только для инженера');
  t.eq(QD.prerequisiteOf('path_to_constructor'), 'main_03_machines', 'Путь Конструктора после main_03');
  t.eq(QD.prerequisiteOf('path_to_technomancer'), 'main_03_machines', 'Путь Наладчика после main_03');
  t.ok(QD.canAccept(st, qConst, 20, Date.now(), 'engineer').ok, 'инженер может взять Путь Конструктора');
  t.ok(QD.canAccept(st, qTech, 20, Date.now(), 'engineer').ok, 'инженер может взять Путь Наладчика');
  t.eq(QD.canAccept(st, qConst, 20, Date.now(), 'operator').reason, 'class', 'оператор не может взять Путь Конструктора');
  t.eq(QD.canAccept(st, qTech, 20, Date.now(), 'operator').reason, 'class', 'оператор не может взять Путь Наладчика');
  t.eq(QD.canAccept(st, qConst, 19, Date.now(), 'engineer').reason, 'level', 'Путь Конструктора требует 20 ур.');
  t.eq(QD.canAccept(st, qTech, 19, Date.now(), 'engineer').reason, 'level', 'Путь Наладчика требует 20 ур.');
  t.ok(snapEng.available.indexOf('path_to_constructor') >= 0, 'Путь Конструктора в available инженера');
  t.ok(snapEng.available.indexOf('path_to_technomancer') >= 0, 'Путь Наладчика в available инженера');
  t.ok(snapOp.available.indexOf('path_to_constructor') < 0, 'Путь Конструктора не в available оператора');
  t.ok(snapOp.available.indexOf('path_to_technomancer') < 0, 'Путь Наладчика не в available оператора');

  // Серверный трансфер по квестам
  const { createSkillLearnHandler } = require(path.join(ROOT, 'server', 'handlers', 'skill-learn-handler.js'));
  const testMsgs = [];
  const pEngConst = {
    pid: 101, cls: 'engineer', level: 20,
    quests: { done: { path_to_constructor: { n: 1, at: Date.now() } } },
    applyClassStats: () => {}, maxHp: 200, maxEnergy: 100
  };
  const slh = createSkillLearnHandler({
    CS, QD, NPCS, EXP,
    send: (p, msg) => testMsgs.push(msg),
    broadcastAOI: () => {},
    saveProfileNow: () => {},
    grantExpertiseSkills: () => {}
  });
  testMsgs.length = 0;
  t.ok(!slh.doClassTransfer(pEngConst, 'technomancer'), 'трансфер в Наладчика без его квеста отклонён');
  t.eq(testMsgs[0] && testMsgs[0].reason, 'quest', 'причина отказа — квест');
  t.eq(testMsgs[0] && testMsgs[0].need, 'path_to_technomancer', 'требуется path_to_technomancer');
  testMsgs.length = 0;
  t.ok(slh.doClassTransfer(pEngConst, 'constructor'), 'трансфер в Конструктора успешен');
  t.eq(pEngConst.cls, 'constructor', 'класс изменён на constructor');
  t.eq(testMsgs[0] && testMsgs[0].t, 'class_transfer_ok', 'class_transfer_ok отправлен');

  const pEngTech = {
    pid: 102, cls: 'engineer', level: 20,
    quests: { done: { path_to_technomancer: { n: 1, at: Date.now() } } },
    applyClassStats: () => {}, maxHp: 200, maxEnergy: 100
  };
  testMsgs.length = 0;
  t.ok(!slh.doClassTransfer(pEngTech, 'constructor'), 'трансфер в Конструктора без его квеста отклонён');
  testMsgs.length = 0;
  t.ok(slh.doClassTransfer(pEngTech, 'technomancer'), 'трансфер в Наладчика успешен');
  t.eq(pEngTech.cls, 'technomancer', 'класс изменён на technomancer');

  // 1-я смена профессии Оператора (Механик, Разрушитель, Стрелок через main_04_certification)
  t.suite('quest-db: 1-я смена профессии оператора (Механик, Разрушитель, Стрелок)');
  const pOpNoQuest = {
    pid: 103, cls: 'operator', level: 20,
    quests: { done: {} },
    applyClassStats: () => {}, maxHp: 200, maxEnergy: 100
  };
  testMsgs.length = 0;
  t.ok(!slh.doClassTransfer(pOpNoQuest, 'mechanic'), 'трансфер оператора без сертификации отклонён');
  t.eq(testMsgs[0] && testMsgs[0].reason, 'quest', 'причина отказа оператора — квест');
  t.eq(testMsgs[0] && testMsgs[0].need, 'main_04_certification', 'требуется main_04_certification');

  const pOpWithQuest = {
    pid: 104, cls: 'operator', level: 20,
    quests: { done: { main_04_certification: { n: 1, at: Date.now() } } },
    applyClassStats: () => {}, maxHp: 200, maxEnergy: 100
  };
  testMsgs.length = 0;
  t.ok(slh.doClassTransfer(pOpWithQuest, 'gunner'), 'трансфер оператора в Стрелка (gunner) успешен');
  t.eq(pOpWithQuest.cls, 'gunner', 'класс изменён на gunner');
  t.eq(testMsgs[0] && testMsgs[0].t, 'class_transfer_ok', 'class_transfer_ok отправлен для gunner');

  const pOpMech = {
    pid: 105, cls: 'operator', level: 20,
    quests: { done: { main_04_certification: { n: 1, at: Date.now() } } },
    applyClassStats: () => {}, maxHp: 200, maxEnergy: 100
  };
  testMsgs.length = 0;
  t.ok(slh.doClassTransfer(pOpMech, 'mechanic'), 'трансфер оператора в Механика (mechanic) успешен');
  t.eq(pOpMech.cls, 'mechanic', 'класс изменён на mechanic');

  const pOpDest = {
    pid: 106, cls: 'operator', level: 20,
    quests: { done: { main_04_certification: { n: 1, at: Date.now() } } },
    applyClassStats: () => {}, maxHp: 200, maxEnergy: 100
  };
  testMsgs.length = 0;
  t.ok(slh.doClassTransfer(pOpDest, 'destroyer'), 'трансфер оператора в Разрушителя (destroyer) успешен');
  t.eq(pOpDest.cls, 'destroyer', 'класс изменён на destroyer');

  t.eq(QD.canAccept(st, QD.get('side_audio_log_01'), 5).reason, 'level',
    'скрытый квест требует 12 ур.');

  t.suite('quest-db: состояние игрока');
  st.active.main_01_welcome = { p: [0], at: Date.now() };
  t.eq(QD.stateOf(st, QD.get('main_01_welcome')), QD.STATES.IN_PROGRESS, '0/1 → in_progress');
  st.active.main_01_welcome.p = [1];
  t.eq(QD.stateOf(st, QD.get('main_01_welcome')), QD.STATES.COMPLETABLE, '1/1 → completable');
  t.eq(QD.canAccept(st, QD.get('main_01_welcome'), 1).reason, 'active', 'активный нельзя взять снова');
  delete st.active.main_01_welcome;
  st.done.main_01_welcome = { n: 1, at: Date.now() };
  t.eq(QD.stateOf(st, QD.get('main_01_welcome')), QD.STATES.COMPLETED, 'после сдачи → completed');
  t.ok(QD.canAccept(st, QD.get('main_02_perimeter'), 1).ok, 'цепочка открылась');
  t.eq(QD.canAccept(st, QD.get('main_01_welcome'), 1).reason, 'done', 'не-repeatable повторно нельзя');

  t.suite('quest-db: repeatable и daily');
  const now = Date.now();
  st.done.daily_scrapper_hunt = { n: 1, at: now };
  t.eq(QD.canAccept(st, QD.get('daily_scrapper_hunt'), 5, now).reason, 'daily_done',
    'daily в тот же день недоступен');
  t.ok(QD.canAccept(st, QD.get('daily_scrapper_hunt'), 5, now + 86400000 * 2).ok,
    'daily доступен на следующие сутки');
  st.done.side_milly_parts = { n: 3, at: now };
  t.ok(QD.canAccept(st, QD.get('side_milly_parts'), 5, now).ok,
    'repeatable без daily доступен сразу');

  t.suite('quest-db: normalizeState (данные из профиля)');
  const dirty = JSON.parse('{"active":{"main_01_welcome":{"p":[999],"at":5},' +
    '"нет_такого":{"p":[1]},"__proto__":{"p":[1]}},' +
    '"done":{"main_02_perimeter":{"n":-3},"__proto__":{"n":9}}}');
  const norm = QD.normalizeState(dirty);
  t.eq(Object.keys(norm.active), ['main_01_welcome'], 'неизвестные квесты отброшены');
  t.eq(norm.active.main_01_welcome.p, [1], 'прогресс зажат по count цели');
  t.eq(norm.done.main_02_perimeter.n, 1, 'отрицательный счётчик исправлен');
  t.eq({}.p, undefined, 'Object.prototype не загрязнён');
  t.eq(QD.normalizeState(null), QD.emptyState(), 'null → пустое состояние');
  t.eq(QD.normalizeState('строка'), QD.emptyState(), 'строка → пустое состояние');
  t.eq(QD.normalizeState([1, 2]), QD.emptyState(), 'массив → пустое состояние');

  t.suite('quest-db: снапшот для клиента');
  const snap = QD.snapshot(norm, 20);
  t.ok(Array.isArray(snap.active) && Array.isArray(snap.done) && Array.isArray(snap.available),
    'снапшот содержит active/done/available');
  t.ok(snap.active[0] && snap.active[0].state === QD.STATES.COMPLETABLE,
    'состояние считается в снапшоте');
  t.ok(snap.available.indexOf('main_01_welcome') < 0, 'активный квест не в available');
  t.ok(snap.available.length > 0, 'на 20 ур. что-то доступно', snap.available.join(','));

  t.suite('quest-db: индексы целей');
  const kills = QD.killTargets();
  t.ok(kills.length >= 4 && kills.every(id => MOB.get(id)), 'killTargets — существующие мобы',
    kills.join(', '));
  const collects = QD.collectTargets();
  t.ok(collects.length >= 4 && collects.every(id => NPCS.itemMeta(id)),
    'collectTargets — существующие предметы', collects.join(', '));
  t.ok(QD.forNpc('gilbert').length >= 2, 'квесты Гилберта находятся по npc',
    QD.forNpc('gilbert').map(q => q.id).join(', '));
  t.eq(QD.forNpc('нет_такого'), [], 'у неизвестного NPC квестов нет');
};
