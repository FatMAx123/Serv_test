// ============================================================
//  TESTS / DEVICES-COPPER.TEST.JS — этап 5: медь от уровня спавна и разнесённые споты.
//  Медь за убийство раньше шла по таблице моба (Бумбокс с таблицей 10-го ур. стоял на
//  спотах 5–17), а заряды стоили больше меди с соло-треша. Лучший соло-спот 11–19 был
//  один на все уровни, а на 18–20 соло-споты были только в пати-зонах.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const LT = require(path.join(ROOT, 'server', 'data', 'loot-tables.js'));
const MOB_DB = require(path.join(ROOT, 'shared', 'mob-db.js'));
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));

/** Ожидаемая медь за убийство (по таблице, без случайности), игрок того же уровня. */
function expCopper(mobId, ml) {
  const T = LT.MOB_LOOT_TABLES[mobId];
  const lm = LT.levelMod(ml, ml);
  const k = LT.copperLevelMult(T.level, ml);
  return (T.adena.groups || []).reduce((a, g) => a + Math.min(1, g.chance * lm.adena) * (g.min + g.max) / 2 * k, 0);
}

module.exports = function (t) {
  t.suite('Медь от уровня спавна');
  const wd = LT.MOB_LOOT_TABLES.welding_drone.level;
  let mono = true;
  for (let L = 2; L <= 30; L++) if (LT.copperLevelMult(wd, L) <= LT.copperLevelMult(wd, L - 1)) mono = false;
  t.ok(mono, 'множитель меди растёт с уровнем спавна');
  t.ok(expCopper('welding_drone', 17) > expCopper('welding_drone', 10) * 1.2, 'Бумбокс на 17-м споте богаче, чем на 10-м');
  t.near(LT.copperLevelMult(LT.MOB_LOOT_TABLES.scrapper.level, 3), 1, 0.05, '1–5: медь учебных мобов как в C1');

  // Заряд — 15 меди, боец бьёт соло-треш своего уровня 6–10 раз (прогон economy-sim-1-20).
  // Медь за убийство с 8 ур. должна покрывать хотя бы 6 зарядов: с зарядами гринд не в минус.
  const ss = ITEMS.get('soulshot_no_grade').price;
  const poor = [];
  for (let L = 8; L <= 20; L++) {
    const tgt = expCopper('rust_sentry', L);
    if (tgt < ss * 6) poor.push(L + ': ' + tgt.toFixed(0));
  }
  t.eq(poor, [], 'соло-треш 8–20: медь за убийство ≥ 6 зарядов');
  t.ok(expCopper('rust_sentry', 15) < ss * 15, '…но заряды не превращаются в печатный станок (< 15 зарядов)');

  // Боссы и рейды — свои финальные таблицы
  let bossCopper = 0;
  for (let i = 0; i < 400; i++) bossCopper += LT.rollMobLoot('scrap_tyrant', 20, 20, { boss: true }).adena;
  const T = LT.MOB_LOOT_TABLES.scrap_tyrant.adena.groups[0];
  t.ok(bossCopper / 400 <= T.max * 1.01, 'медь рейда не пересчитывается по уровню');

  t.suite('Споты 6–20 разнесены');
  WM.applyEditorOverrides(JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'editor-overrides.json'), 'utf8')));
  const spots = WM.MOB_SPOTS.filter((s) => !s.boss);
  const wdZones = new Set(spots.filter((s) => s.mob === 'welding_drone').map((s) => s.zone));
  ['Восточные земли', 'Руины химзавода', 'Тихая заводь'].forEach((z) =>
    t.ok(!wdZones.has(z), 'Бумбокса нет в зоне «' + z + '»'));
  const solo = (s) => { const m = MOB_DB.get(s.mob); return m && /^solo_|^pack$/.test(m.role); };
  const calm18 = spots.filter((s) => solo(s) && !s.dangerZone && s.lvl[1] >= 18);
  t.ok(calm18.length >= 5, '18+: есть соло-споты вне опасных зон (' + calm18.length + ')');
  t.ok(calm18.every((s) => s.zone === 'Восточный полигон'), '…на дальнем краю Восточного полигона');
  const scr = spots.filter((s) => s.mob === 'scrapper' && s.zone === 'Холмы Астарда');
  t.ok(scr.length > 0 && scr.every((s) => s.lvl[0] <= 7), 'мирный Скраппер в холмах — только у входа (≤7)');
  // каждая полоса 6–20 — минимум две зоны с соло-мобами
  const thin = [];
  for (let L = 6; L <= 20; L++) {
    const zones = new Set(spots.filter((s) => solo(s) && s.lvl[0] <= L && s.lvl[1] >= L).map((s) => s.zone));
    if (zones.size < 2) thin.push(L);
  }
  t.eq(thin, [], 'на каждом уровне 6–20 соло-мобы есть минимум в двух зонах');

  t.suite('Этап 6: новая техника 6–20 и пасхалки');
  const NEW = ['mouse_ball', 'alarm_snooze', 'brick_phone', 'garland_tangle', 'keyboard_centipede', 'intercom_whois',
    'cash_register', 'vhs_rewinder', 'flash_camera', 'power_meter', 'phone_one_percent', 'laptop_update'];
  const spawned = new Set(spots.map((s) => s.mob));
  for (const id of NEW) {
    const m = MOB_DB.get(id);
    const T = LT.MOB_LOOT_TABLES[id];
    t.ok(!!m && /^solo_|^pack$/.test(m.role), id + ': соло-моб в mob-db');
    t.ok(spawned.has(id), id + ': стоит в ките своей зоны и спавнится');
    t.ok(!!T && T.spoil && T.spoil.groups && T.spoil.groups.length > 0, id + ': таблица лута и спойла');
    t.ok(/[а-яё]/i.test(m.flavor || '') && !/магия|заклинан|руна/i.test(m.flavor), id + ': описание без магии');
  }
  const EGGS = ['tv_remote_lost', 'atm_greedy', 'retro_console'];
  const secret = MOB_DB.getSecretSpots();
  for (const id of EGGS) {
    t.ok(!!MOB_DB.get(id) && !!LT.MOB_LOOT_TABLES[id], id + ': пасхалка с таблицей лута');
    t.eq(secret.filter((s) => s.mob === id).length, 1, id + ': ровно один секретный спот');
  }
  const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
  t.ok(NPCS.sellPrice('trophy_aa_batteries') > 0 && NPCS.sellPrice('trophy_cartridge_999') > NPCS.sellPrice('trophy_aa_batteries'),
    'трофеи пасхалок продаются торговцам');

  t.suite('Магия соло-треша под той же поправкой, что и удар');
  const st = MOB_DB.statsAtLevel('welding_drone', 14);
  const raw = MOB_DB.baseCurve(14);
  t.ok(st.cAtk < raw.cAtk * 0.8, 'C.Atk Бумбокса на 14 ур. ниже табличного (как P.Atk)');
};
