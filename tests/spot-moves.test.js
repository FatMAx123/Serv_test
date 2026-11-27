// ============================================================
//  TESTS / SPOT-MOVES.TEST.JS — правка спота в редакторе доходит до игры.
//  Споты строятся из зон (MOB_DB.buildSpotsFromEditorZones); редактор пишет сдвиг спота в
//  zone.spotMoves[номер в зоне]. Генерация та же: меняются только точка и радиус этого спота,
//  число, порядок, мобы и уровни остальных — как были. Поле переживает экспорт / применение.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

module.exports = function (t) {
  t.suite('spot-moves: сдвиг спота хранится в зоне');
  const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
  const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'editor-overrides.json'), 'utf8'));
  WM.applyEditorOverrides(JSON.parse(JSON.stringify(src)));
  const before = JSON.parse(JSON.stringify(WM.MOB_SPOTS));
  const zone = WM.HUNT_ZONES.find((z) => z && z.kind !== 'territory' && !z.noSpots && before.some((s) => s.huntZoneId === z.id));
  t.ok(!!zone, 'есть зона охоты со спотами');
  const first = before.findIndex((s) => s.huntZoneId === zone.id);

  const ex = WM.exportEditorOverrides();
  ex.huntZones.find((h) => h.id === zone.id).spotMoves = { 1: { np: [0.5, 0.5], rM: 40 }, bad: { np: [2, 2] } };
  WM.applyEditorOverrides(JSON.parse(JSON.stringify(ex)));
  const moved = WM.MOB_SPOTS[first + 1];
  t.eq(moved.np, [0.5, 0.5], 'спот сдвинут');
  t.near(moved.r * WM.W, 40, 0.5, 'радиус из rM');
  t.eq([moved.mob, moved.lvl, moved.n], [before[first + 1].mob, before[first + 1].lvl, before[first + 1].n], 'моб, уровни, пачка — как у генератора');
  t.eq(WM.MOB_SPOTS.length, before.length, 'число спотов то же');
  const others = (arr) => JSON.stringify(arr.filter((_, i) => i !== first + 1));
  t.ok(others(WM.MOB_SPOTS) === others(before), 'остальные споты не изменились');
  const exported = WM.exportEditorOverrides().huntZones.find((h) => h.id === zone.id).spotMoves;
  t.eq(exported, { 1: { np: [0.5, 0.5], rM: 40 } }, 'экспорт хранит сдвиг, мусорный ключ отброшен');

  WM.applyEditorOverrides(JSON.parse(JSON.stringify(src))); // вернуть как было для следующих тестов
};
