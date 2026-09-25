// tests/phase1_boss_drop_audit.test.js
const itemDb = require('../shared/item-db.js');
const lootRules = require('../shared/loot-rules.js');
const worldMetrics = require('../shared/world-metrics.js');

module.exports = async function (t) {
  const { suite, ok, eq } = t;
  const items = itemDb.ITEMS || itemDb;
  const lootTables = lootRules.MOB_LOOT_TABLES;

  suite('Phase 1 Raid Bosses: Strict Low D Loot Audit');
  {
    const phase1Bosses = ['scrap_tyrant', 'drill_worm', 'press_hammer', 'boiler_sovereign'];
    const bannedWeapons = [
      'demon_staff', 'sentinel_staff', 'goat_staff', // Top D
      'ghost_manifold', 'atuba_mace',                 // High D
      'bone_resonator', 'life_manifold'               // Hi-Mid D
    ];

    for (const bossId of phase1Bosses) {
      const table = lootTables[bossId];
      ok(!!table, `Boss ${bossId} has a valid loot table`);
      
      const rareItems = [];
      (table.rare.groups || []).forEach(g => {
        g.items.forEach(i => rareItems.push(i.id));
      });

      // 1. Verify NO banned High/Top D weapons
      for (const banned of bannedWeapons) {
        ok(!rareItems.includes(banned), `${bossId} does NOT drop banned weapon ${banned}`);
      }

      // 2. Verify all dropped weapons/armors are Low D or NG
      for (const itemId of rareItems) {
        const item = items[itemId];
        ok(!!item, `Item ${itemId} exists in item-db`);
        const grade = (item.grade || '').toLowerCase();
        ok(['no_grade', 'd'].includes(grade), `${bossId} item ${itemId} is No-Grade or D-Grade (got ${grade})`);
      }
    }
  }

  suite('Phase 1 Boss Cores: Grade D Alignment');
  {
    const cores = ['scrap_tyrant_core', 'drill_worm_core', 'press_hammer_core', 'boiler_sovereign_core', 'green_protocol_core'];
    for (const coreId of cores) {
      const core = items[coreId];
      ok(!!core, `Core ${coreId} exists`);
      eq(core.grade, 'd', `Core ${coreId} grade is 'd'`);
    }
  }

  suite('Island Mobs 1-20 lvl: Zero Top/High D & Zero C/B Leaks');
  {
    const banned = [
      'demon_staff', 'sentinel_staff', 'goat_staff', // Top D
      'ghost_manifold', 'atuba_mace',                 // High D
      'bone_resonator', 'life_manifold',              // Mid-High D
      'demon_fangs', 'tears_fairy'                    // Mid D
    ];
    let leakFound = false;

    for (const [mobId, table] of Object.entries(lootTables)) {
      const maxLvl = Math.max(...(table.level || [1, 1]));
      if (maxLvl <= 20) {
        const allItems = [];
        if (table.equipment) table.equipment.groups.forEach(g => allItems.push(...g.items));
        if (table.rare) table.rare.groups.forEach(g => allItems.push(...g.items));

        for (const it of allItems) {
          if (banned.includes(it.id)) {
            leakFound = true;
            console.error(`Leak found in mob ${mobId}: banned item ${it.id}`);
          }
          const itDef = items[it.id];
          if (itDef && ['c', 'b', 'a', 's'].includes(itDef.grade)) {
            leakFound = true;
            console.error(`Leak found in mob ${mobId}: high-grade item ${it.id} (${itDef.grade})`);
          }
        }
      }
    }
    ok(!leakFound, 'Zero Top D, High D, or C/B items drop from mobs level <= 20');
  }

  suite('Phase 1 Pinnacle Bosses (20-23 lvl): Zero C/B/A/S Leaks');
  {
    const pinnacleBosses = ['cruna_overseer', 'logic_corruptor', 'rezdiq_colonel', 'green_protocol', 'steel_colossus'];
    for (const bossId of pinnacleBosses) {
      const table = lootTables[bossId];
      ok(!!table, `Boss ${bossId} has a loot table`);
      const maxLvl = Math.max(...(table.level || [1, 1]));
      ok(maxLvl >= 20 && maxLvl <= 23, `Boss ${bossId} level is in Phase 1 cap range 20-23 (got ${maxLvl})`);

      const allItems = [];
      ['common', 'equipment', 'rare', 'recipes', 'crystals', 'special'].forEach(cat => {
        if (table[cat] && table[cat].groups) {
          table[cat].groups.forEach(g => allItems.push(...g.items));
        }
      });

      for (const it of allItems) {
        eq(it.id !== 'crystal_c', true, `Boss ${bossId} does not drop crystal_c`);
        const itDef = items[it.id];
        if (itDef && itDef.grade) {
          ok(['no_grade', 'd'].includes(itDef.grade.toLowerCase()), `Boss ${bossId} item ${it.id} is NG or D grade (got ${itDef.grade})`);
        }
      }
    }
  }

  suite('Trader Dora: Robe & Armor Supply Alignment');
  {
    const npcs = worldMetrics.buildCityNPCs();
    const dora = npcs.find(n => n.id === 'trader_dora');
    ok(!!dora, 'trader_dora exists in city NPCs');
    ok(dora.shop.includes('circuit_robe_jacket'), 'Dora sells circuit_robe_jacket');
    ok(dora.shop.includes('devotion_jacket'), 'Dora sells devotion_jacket');
    ok(dora.shop.includes('mithril_jacket'), 'Dora sells mithril_jacket');
    ok(dora.shop.includes('knowledge_jacket'), 'Dora sells knowledge_jacket');
    ok(dora.shop.includes('copper_plate'), 'Dora sells copper_plate');
    ok(dora.shop.includes('boiler_shield'), 'Dora sells boiler_shield');
  }
};
