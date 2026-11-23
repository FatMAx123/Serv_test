// ============================================================
//  TESTS / CRYSTAL-SOURCES.TEST.JS — кристаллы D у соло-мобов 15–20.
//  Прогон экономики показал ~60 ч фарма кристаллов на одно D-оружие (45 шт.):
//  соло их роняли только четыре моба по ~1%. Теперь — полосы 15–17 и 18–20,
//  у Мастерового сверху спойл.
// ============================================================
'use strict';
const path = require('path');
const LT = require(path.join(__dirname, '..', 'server', 'data', 'loot-tables.js'));

function perKill(mob) {
  const T = LT.MOB_LOOT_TABLES[mob];
  let drop = 0, spoil = 0;
  ((T.crystals && T.crystals.groups) || []).forEach((g) => g.items.forEach((it) => {
    if (it.id === 'crystal_d') drop += g.chance * (it.min + it.max) / 2;
  }));
  if (T.spoil && T.spoil.chance) {
    const pool = (T.spoil.groups || []).flatMap((g) => g.items);
    const sum = pool.reduce((a, b) => a + b.weight, 0);
    pool.forEach((it) => { if (it.id === 'crystal_d') spoil += T.spoil.chance * it.weight / sum * (it.min + it.max) / 2; });
  }
  return { drop, spoil };
}

module.exports = function (t) {
  t.suite('Кристаллы D: соло-мобы 15–20');
  ['oblivion_walker', 'memory_scrubber', 'range_spotter', 'rogue_target', 'steam_crane_spider'].forEach((mob) => {
    const k = perKill(mob);
    t.near(k.drop, 0.02, 1e-9, mob + ': дроп 2% по 1 шт.');
    t.ok(k.spoil > 0, mob + ': есть спойл кристаллов');
  });
  ['rezdiq_private', 'gauge_warden', 'kettle_stalker', 'iron_crawler', 'dryer_hound'].forEach((mob) => {
    const k = perKill(mob);
    t.near(k.drop, 0.075, 1e-9, mob + ': дроп 5% по 1–2 шт.');
    t.ok(k.spoil > k.drop * 0.9, mob + ': спойл Мастерового не хуже дропа', String(k.spoil));
  });
  const boss = perKill('boiler_sovereign');
  t.ok(boss.drop > 5, 'боссы по-прежнему дают кристаллы пачкой');
};
