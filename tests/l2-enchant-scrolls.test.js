// ============================================================
//  TESTS / L2-ENCHANT-SCROLLS.TEST.JS — раздельные усилители заточки (L2: Enchant Weapon /
//  Enchant Armor): выбор по типу предмета, проверка на сервере, источники (магазин, дроп, квесты).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ER = require(path.join(ROOT, 'shared', 'enchant-rules.js'));
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));
const QD = require(path.join(ROOT, 'shared', 'quest-db.js'));
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const LT = require(path.join(ROOT, 'server', 'data', 'loot-tables.js'));
const createEnchantHandler = require(path.join(ROOT, 'server', 'handlers', 'enchant-handler.js'));

const PAIRS = LT.ARMOR_AMPLIFIER_OF;

module.exports = function (t) {
  t.suite('Усилители: предметы и тип цели');
  for (const id of Object.keys(PAIRS)) {
    const w = ITEMS.get(id);
    const a = ITEMS.get(PAIRS[id]);
    t.ok(w && w.targetType === 'weapon', id + ' — только оружие');
    t.ok(a && a.targetType === 'armor' && a.type === 'enchant', PAIRS[id] + ' — только броня');
    t.eq(a && a.grade, w && w.grade, PAIRS[id] + ' того же грейда, что ' + id);
    t.ok(a && w && a.price < w.price, PAIRS[id] + ' дешевле оружейного (' + (a && a.price) + ' < ' + (w && w.price) + ')');
  }
  t.ok(ER.isBlessedScroll('blessed_armor_pressure_amplifier'), 'благословлённый усилитель брони распознаётся');

  t.suite('Усилители: выбор по типу предмета');
  t.eq(ER.scrollCandidates({ type: 'weapon', grade: 'no_grade' }, 'weapon'), ['pressure_amplifier', 'blessed_pressure_amplifier'], 'NG-оружие');
  t.eq(ER.scrollCandidates({ type: 'weapon', grade: 'd' }, 'weapon'), ['pressure_amplifier_d'], 'D-оружие');
  t.eq(ER.scrollCandidates({ type: 'armor', grade: 'no_grade' }, 'chest'), ['armor_pressure_amplifier', 'blessed_armor_pressure_amplifier'], 'NG-броня');
  t.eq(ER.scrollCandidates({ type: 'armor', grade: 'd' }, 'legs'), ['armor_pressure_amplifier_d'], 'D-броня');
  t.eq(ER.scrollCandidates({ type: 'shield', slot: 'shield', grade: 'd' }, 'shield'), ['armor_pressure_amplifier_d'], 'щит — усилителем брони');
  t.eq(ER.scrollCandidates({ type: 'accessory', grade: 'no_grade' }, 'earring_l'), ['armor_pressure_amplifier', 'blessed_armor_pressure_amplifier'], 'бижутерия — усилителем брони');

  t.suite('Усилители: сервер точит броню только усилителем брони');
  {
    const sent = [];
    const eh = createEnchantHandler({
      send: (p, m) => sent.push(m), checkRate: () => true,
      isBadKey: (k) => /^(?:__proto__|constructor|prototype)$/.test(String(k)),
      pushCombatStats: () => {}, pushWeight: () => {}, saveProfileNow: () => {},
      invCount: (p, id) => (p.inv[id] | 0), canCarryMore: () => ({ ok: true }), spawnGroundLoot: () => {}
    });
    const mk = (inv) => ({
      pid: 1, hp: 100, dead: false, inv: Object.assign({}, inv),
      equip: {
        chest: { id: 'wooden_breastplate', templateId: 'wooden_breastplate', plus: 0 },
        weapon: { id: 'operator_hammer_low', templateId: 'operator_hammer_low', plus: 0 }
      }
    });
    const p1 = mk({ pressure_amplifier: 1 });
    eh.doEnchant(p1, { slot: 'chest' });
    t.eq(p1.equip.chest.plus, 0, 'оружейным усилителем броня не точится');
    t.eq(p1.inv.pressure_amplifier, 1, 'оружейный усилитель не потрачен');
    t.ok(sent.some((m) => m.t === 'msg' && /броня/.test(m.text)), 'подсказка: нужен усилитель «броня»');

    const p2 = mk({ armor_pressure_amplifier: 1 });
    eh.doEnchant(p2, { slot: 'chest' });
    t.eq(p2.equip.chest.plus, 1, 'усилителем брони броня точится (+0 → +1, до safe 100 %)');
    t.ok(!p2.inv.armor_pressure_amplifier, 'усилитель брони потрачен');

    const p3 = mk({ armor_pressure_amplifier: 1 });
    sent.length = 0;
    eh.doEnchant(p3, { slot: 'weapon', scrollId: 'armor_pressure_amplifier' });
    t.eq(p3.equip.weapon.plus, 0, 'усилителем брони оружие не точится');
    t.ok(sent.some((m) => m.t === 'enchant_fail' && m.reason === 'wrong_scroll'), 'отказ wrong_scroll');

    const p4 = mk({ pressure_amplifier: 1 });
    eh.doEnchant(p4, { slot: 'weapon' });
    t.eq(p4.equip.weapon.plus, 1, 'оружейным усилителем оружие точится, как раньше');
  }

  t.suite('Усилители: магазины');
  try { if (WM.applyEditorOverrides) WM.applyEditorOverrides(require(path.join(ROOT, 'shared', 'editor-overrides.json'))); } catch (e) { /* ignore */ }
  NPCS.rebuild();
  const milly = NPCS.shopCatalog('milly').reduce((o, e) => { o[e.itemId] = e.price; return o; }, {});
  t.eq([milly.armor_pressure_amplifier, milly.armor_pressure_amplifier_d, milly.blessed_armor_pressure_amplifier], [100, 400, 1000],
    'Милли продаёт усилители брони (100 / 400 / 1000)');
  t.ok(NPCS.shopCatalog('harbor_trader').some((e) => e.itemId === 'armor_pressure_amplifier'), 'торговец Гавани продаёт NG-усилитель брони');
  t.ok(NPCS.sellPrice('armor_pressure_amplifier') < NPCS.shopEntry('milly', 'armor_pressure_amplifier').price, 'перепродажа NPC убыточна');

  t.suite('Усилители: дроп — бронный рядом с каждым оружейным, с тем же шансом');
  let tablesWithAmp = 0, mismatches = [];
  for (const id of Object.keys(LT.MOB_LOOT_TABLES)) {
    const T = LT.MOB_LOOT_TABLES[id];
    const exp = {};
    for (const key of ['common', 'equipment', 'rare', 'recipes', 'crystals', 'special']) {
      const sec = T[key];
      if (!sec || !sec.groups) continue;
      for (const g of sec.groups) {
        const total = g.items.reduce((s, it) => s + it.weight, 0) || 1;
        for (const it of g.items) exp[it.id] = (exp[it.id] || 0) + g.chance * it.weight / total;
      }
    }
    let has = false;
    for (const w of Object.keys(PAIRS)) {
      if (!exp[w]) continue;
      has = true;
      if (Math.abs((exp[PAIRS[w]] || 0) - exp[w]) > 1e-9) mismatches.push(id + ':' + w);
    }
    if (has) tablesWithAmp++;
  }
  t.ok(tablesWithAmp > 10, 'усилители есть в таблицах дропа', 'таблиц: ' + tablesWithAmp);
  t.eq(mismatches, [], 'ожидаемый шанс бронного = оружейному во всех таблицах');

  t.suite('Усилители: квестовые награды');
  const quests = QD.QUESTS || QD.ALL || {};
  let pairsChecked = 0, bad = [];
  for (const qid of Object.keys(quests)) {
    const items = (quests[qid] && quests[qid].rewards && quests[qid].rewards.items) || [];
    for (const it of items) {
      if (!PAIRS[it.id]) continue;
      pairsChecked++;
      const twin = items.find((x) => x.id === PAIRS[it.id]);
      if (!twin || twin.count !== it.count) bad.push(qid + ':' + it.id);
    }
  }
  t.ok(pairsChecked >= 10, 'квестов с усилителями найдено', String(pairsChecked));
  t.eq(bad, [], 'каждый оружейный усилитель в награде идёт в паре с бронным того же количества');

  t.suite('Заточка L2: шансы по типу, потолок +16, NG до +3 без риска');
  t.eq(ER.successChance(3, { type: 'weapon', grade: 'd' }), 0.68, 'оружие выше safe — 68 % (L2J)');
  t.eq(ER.successChance(3, { type: 'armor', grade: 'd', slot: 'chest' }), 0.52, 'броня выше safe — 52 %');
  t.eq(ER.successChance(3, { type: 'accessory', grade: 'd', slot: 'earring' }), 0.54, 'бижутерия выше safe — 54 %');
  t.eq(ER.successChance(3, { type: 'armor', grade: 'd', fullBody: true }), 1, 'цельная броня +3 → +4 безопасно');
  t.eq(ER.maxLevel({ grade: 'd' }), 16, 'D — до +16');
  t.eq(ER.maxLevel({ grade: 'no_grade' }), 3, 'NG — до +3 (safe = max, без риска)');
  t.eq(ITEMS.ENCHANT_MAX, 16, 'абсолютный потолок +16');

  t.suite('Заточка L2: кристаллы при поломке (L2J getCrystalCount)');
  const sword = { type: 'weapon', grade: 'd', crystalCount: 100 };
  const mail = { type: 'armor', grade: 'd', crystalCount: 100 };
  t.eq(ER.crystalize(sword, 3).count, 100 + 90 * 3, 'оружие +3: база + 90 × 3');
  t.eq(ER.crystalize(sword, 5).count, 100 + 90 * (2 * 5 - 3), 'оружие +5: база + 90 × (2·5 − 3)');
  t.eq(ER.crystalize(mail, 5).count, 100 + 11 * (3 * 5 - 6), 'броня +5: база + 11 × (3·5 − 6)');

  t.suite('Заточка L2: одиночный предмет в сумке');
  {
    const sent = [];
    const eh = createEnchantHandler({
      send: (p, m) => sent.push(m), checkRate: () => true,
      isBadKey: (k) => /^(?:__proto__|constructor|prototype)$/.test(String(k)),
      pushCombatStats: () => {}, pushWeight: () => {}, saveProfileNow: () => {},
      invCount: (p, id) => (p.inv[id] | 0), canCarryMore: () => ({ ok: true }), spawnGroundLoot: () => {}
    });
    const p = { pid: 5, hp: 100, dead: false, equip: {}, plusById: {}, inv: { armor_pressure_amplifier: 1, wooden_breastplate: 1 } };
    eh.doEnchant(p, { itemId: 'wooden_breastplate', scrollId: 'armor_pressure_amplifier' });
    t.eq(p.plusById.wooden_breastplate, 1, 'вещь в сумке заточена (+1 в plusById)');
    t.ok(sent.some((m) => m.t === 'enchant_ok' && m.itemId === 'wooden_breastplate' && m.invPlus), 'ответ несёт itemId и invPlus');
    const q = { pid: 6, hp: 100, dead: false, equip: {}, plusById: {}, inv: { armor_pressure_amplifier: 1, wooden_breastplate: 2 } };
    sent.length = 0;
    eh.doEnchant(q, { itemId: 'wooden_breastplate', scrollId: 'armor_pressure_amplifier' });
    t.ok(sent.some((m) => m.t === 'enchant_fail' && m.reason === 'stack'), 'стопку из двух копий точить нельзя');
    t.eq(q.inv.armor_pressure_amplifier, 1, 'усилитель не потрачен');
  }

  t.suite('Окно заточки: список предметов из усилителя');
  {
    const g = globalThis;
    const saved = { ER: g.ENCHANT_RULES, DB: g.ITEM_DB, game: g.game, UI: g.EnchantUI };
    g.ENCHANT_RULES = ER;
    g.ITEM_DB = ITEMS;
    const mkItem = (id, count, plus) => ({ templateId: id, template: ITEMS.get(id), count: count || 1, enchantLevel: plus || 0 });
    g.game = { inventory: {
      equipment: { weapon: mkItem('operator_hammer_low'), chest: mkItem('wooden_breastplate', 1, 2) },
      slots: [mkItem('armor_pressure_amplifier', 3), mkItem('iron_hammer'), mkItem('short_sword', 2), null]
    } };
    delete require.cache[require.resolve(path.join(ROOT, 'client', 'js', 'enchant-ui.js'))];
    require(path.join(ROOT, 'client', 'js', 'enchant-ui.js'));
    const arm = g.EnchantUI._candidates('armor_pressure_amplifier').map((c) => c.key);
    const wpn = g.EnchantUI._candidates('pressure_amplifier').map((c) => c.key);
    t.eq(arm, ['slot:chest'], 'усилитель брони: только надетая броня (оружие не в списке)');
    t.eq(wpn, ['slot:weapon', 'bag:iron_hammer'], 'усилитель оружия: надетое + одиночное в сумке; стопка из двух — нет');
    g.ENCHANT_RULES = saved.ER; g.ITEM_DB = saved.DB; g.game = saved.game; g.EnchantUI = saved.UI;
  }

  t.suite('Усилители: клиент');
  const inv = fs.readFileSync(path.join(ROOT, 'client', 'js', 'inventory.js'), 'utf8');
  t.ok(/template\.type === 'enchant'[\s\S]{0,300}EnchantUI\.open/.test(inv), 'использование усилителя открывает окно заточки');
  const boot = fs.readFileSync(path.join(ROOT, 'client', 'js', 'boot.module.js'), 'utf8');
  t.ok(/js\/enchant-ui\.js\?v=/.test(boot), 'окно заточки подключено в boot.module.js');
  t.ok(/shared\/enchant-rules\.js\?v=l2c-1/.test(boot) && /js\/inventory-ui\.js\?v=l2c-1/.test(boot), 'версии изменённых модулей подняты (сброс immutable-кэша)');
};
