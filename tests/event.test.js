// ============================================================
//  TESTS / EVENT.TEST.JS — мировые события 1–20 (PLAN 5.9 / L2 C1).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const EV = require(path.join(ROOT, 'shared', 'event-rules.js'));
const G = require(path.join(ROOT, 'shared', 'game-rules.js'));
const MOB = require(path.join(ROOT, 'shared', 'mob-db.js'));

module.exports = function (t) {
  t.suite('event-rules: каталог');
  const pb = EV.getEvent('pipe_burst');
  t.ok(pb && pb.kind === 'invasion', 'pipe_burst — набег, не уникальный рейд');
  t.eq(pb.name, 'Прорыв паровой трубы', 'имя события');
  t.eq(pb.intervalSec, 2 * 3600, 'интервал 2 ч (не спам)');
  t.eq(pb.durationSec, 15 * 60, 'окно 15 мин');
  t.ok(EV.packSize(pb) >= 6 && EV.packSize(pb) <= 12, 'пачка 6–12', 'n=' + EV.packSize(pb));
  t.ok(!(pb.pack || []).some((r) => EV.isPhase1Raid(r.mobId)),
    'в пачке нет уникальных рейдов фазы 1');
  t.ok(EV.isPhase1Raid('drill_worm') && EV.isPhase1Raid('scrap_tyrant') && EV.isPhase1Raid('green_protocol'),
    'рейды острова: Бур, Тиран, Протокол');
  t.ok(!EV.isPhase1Raid('repair_drone') && !EV.isPhase1Raid('scrapper'),
    'полевые мобы — не рейд-анонс');

  const ss = EV.getEvent('scrap_stampede');
  t.ok(ss && ss.kind === 'invasion' && ss.minLvl === 5, 'scrap_stampede — набег для новичков');
  const cl = EV.getEvent('chemical_leak');
  t.ok(cl && cl.kind === 'invasion' && cl.minLvl === 15, 'chemical_leak — кислотный выброс');

  t.suite('event-rules: game-rules отдаёт те же данные');
  t.ok(G.WORLD_EVENTS && G.WORLD_EVENTS.pipe_burst, 'G.WORLD_EVENTS.pipe_burst заполнен');
  t.ok(G.WORLD_EVENTS && G.WORLD_EVENTS.scrap_stampede, 'G.WORLD_EVENTS.scrap_stampede заполнен');
  t.ok(G.WORLD_EVENTS && G.WORLD_EVENTS.chemical_leak, 'G.WORLD_EVENTS.chemical_leak заполнен');
  t.eq(G.WORLD_EVENTS.pipe_burst.id, 'pipe_burst', 'id совпадает');
  t.eq(G.WORLD_EVENTS.pipe_burst.kind, 'invasion', 'kind invasion');

  t.suite('event-rules: пачка из существующих мобов');
  const pack = EV.expandPack(pb, 14, 17, (a, b) => a);
  t.ok(pack.length >= 6, 'expandPack собрал пачку', 'n=' + pack.length);
  const missing = pack.filter((r) => !MOB.get(r.mobId)).map((r) => r.mobId);
  t.eq(missing, [], 'все mobId пачки есть в mob-db');
  t.ok(!pack.some((r) => EV.isPhase1Raid(r.mobId)), 'expandPack выкидывает рейды');
  t.ok(pack.some((r) => r.champion), 'в пачке есть чемпион/элита');

  const packSS = EV.expandPack(ss, 6, 9, (a, b) => a);
  const missingSS = packSS.filter((r) => !MOB.get(r.mobId)).map((r) => r.mobId);
  t.eq(missingSS, [], 'все mobId пачки scrap_stampede есть в mob-db');

  const packCL = EV.expandPack(cl, 16, 20, (a, b) => a);
  const missingCL = packCL.filter((r) => !MOB.get(r.mobId)).map((r) => r.mobId);
  t.eq(missingCL, [], 'все mobId пачки chemical_leak есть в mob-db');

  t.suite('event-rules: выбор зоны');
  const hunts = [
    { id: 'school', name: 'Школа', kind: 'hunt', lvl: [1, 5], x: 0, z: 0 },
    { id: 'town', name: 'Деревня', kind: 'territory', peace: true, lvl: [1, 1], x: 1, z: 1 },
    { id: 'oblivion', name: 'Поле забвения', kind: 'hunt', lvl: [16, 18], x: 10, z: 20 },
    { id: 'dump', name: 'Свалка', kind: 'hunt', lvl: [5, 12], x: 30, z: 40 }
  ];
  t.ok(!EV.isEventHunt(hunts[0], pb), 'учебка 1–5 не берётся');
  t.ok(!EV.isEventHunt(hunts[1], pb), 'territory/peace не берётся');
  t.ok(EV.isEventHunt(hunts[2], pb), 'Забвение 16–18 подходит');
  const pick = EV.pickHunt(hunts, pb, () => 0);
  t.ok(pick && pick.id === 'oblivion', 'hints предпочитают «Забвение»', pick && pick.id);
  t.eq(EV.pickHunt(hunts.filter((h) => h.id === 'school'), pb, () => 0), null,
    'если подходящих зон нет — null');

  t.suite('event-rules: таймер');
  t.ok(!EV.shouldStart(1000, 0, 60), 'без lastAt сразу не стартует (не в момент бута)');
  t.ok(!EV.shouldStart(1000, 1000, 60), 'сразу после отметки — рано');
  t.ok(EV.shouldStart(1000 + 60 * 1000, 1000, 60), 'через интервал — пора');
  t.eq(EV.intervalOf(pb, false), 7200, 'прод: 2 ч');
  t.eq(EV.durationOf(pb, true), 90, 'debug: короткое окно');

  t.suite('event-rules: сервер подключён');
  const srv = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  t.ok(/require\('\.\.\/shared\/event-rules\.js'\)/.test(srv), 'server.js требует event-rules');
  t.ok(/startInvasion|EV\.pickHunt/.test(srv) && /announceRaidSpawn/.test(srv),
    'набег и анонс рейда на сервере');
  t.ok(!/G\.BOSSES\[ev\.boss\]/.test(srv), 'больше не спавнит уникальный рейд как ивент');
  t.ok(/case 'debug_event'/.test(srv), 'dev debug_event для проверки');
};
