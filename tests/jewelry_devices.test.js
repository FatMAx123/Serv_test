// ============================================================
//  TESTS / JEWELRY_DEVICES.TEST.JS
//  Бижутерия в схеме игры: две серьги + резонатор/компрессор (слот ожерелья)
//  + нано-браслет/наручи (слот браслета вместо пары колец L2).
//   - мусорная бижутерия (кольца, обычные ожерелья) изъята и возвращена медью;
//   - M.Def: голые 41 = ожерелье 13 + браслет 10 + серьги 9×2;
//   - две серьги в разных слотах, слоты приборов принимают только приборы;
//   - лестницы корпуса: одинаковый cDef, цена от дохода с мобов, гейт по уровню;
//   - источники серёг в луте и награда квеста.
// ============================================================
'use strict';

const ITEMS = require('../shared/item-db.js');
const NPCS = require('../shared/npc-services.js');
const QD = require('../shared/quest-db.js');
const LT = require('../server/data/loot-tables.js');
const RI = require('../server/core/retired-items.js');
const playerCore = require('../server/core/player.js');
const createInventoryActionHandler = require('../server/handlers/inventory-action-handler.js');

const RETIRED = ['copper_ring', 'pressure_ring', 'tower_circuit_ring', 'copper_necklace',
  'iron_necklace', 'engine_necklace', 'directive_seal'];

module.exports = async function (t) {
  // ------------------------------------------------------------------
  t.suite('Бижутерия: шаблоны и голый M.Def');
  t.ok(RETIRED.every((id) => !ITEMS.get(id)), 'кольца и обычные ожерелья удалены из item-db');
  const jewelry = Object.keys(ITEMS.ITEMS).filter((id) => {
    const s = String(ITEMS.ITEMS[id].slot || '').toLowerCase();
    return /neck|bracelet|ring|ear/.test(s);
  }).sort();
  t.eq(jewelry, ['copper_earring', 'coral_earring', 'engineer_emitter_low', 'engineer_nano_bracelet',
    'operator_bracers_low', 'operator_compressor_low'], 'бижутерия = 2 серьги + 4 прибора');
  t.eq([ITEMS.get('copper_earring').cDef, ITEMS.get('coral_earring').cDef], [15, 30], 'серьги NG 15 / D 30 M.Def');
  t.eq(ITEMS.NAKED_MDEF.bracelet, 10, 'браслет вычитает голые 10 (пара колец 5 + 5)');

  const fullNg = {
    necklace: { id: 'engineer_emitter_low', templateId: 'engineer_emitter_low', shellIndex: 0 },
    bracelet: { id: 'engineer_nano_bracelet', templateId: 'engineer_nano_bracelet', casingIndex: 0 },
    earring_l: { id: 'copper_earring', templateId: 'copper_earring' },
    earring_r: { id: 'copper_earring', templateId: 'copper_earring' }
  };
  const g = ITEMS.gearFromEquip(fullNg, { isMagePath: true });
  t.eq(g.nakedMDefSub, 41, 'полный набор вычитает весь голый M.Def 41 (13 + 10 + 9 + 9)');
  t.eq(g.armorCDef, 60, 'приборы NG I 15 + 15, серьги 15 + 15 = 60 M.Def');
  const one = ITEMS.gearFromEquip({ earring_l: fullNg.earring_l }, { isMagePath: true });
  t.eq(one.nakedMDefSub, 9, 'одна серьга вычитает только свои 9');

  // ------------------------------------------------------------------
  t.suite('Бижутерия: лестницы корпуса резонатора и браслета');
  const R = ITEMS.RESONATOR_SHELL_LADDER, N = ITEMS.NANO_CASING_LADDER;
  t.eq(N.map((s) => s.cDef), R.map((s) => s.cDef), 'браслет даёт тот же cDef, что резонатор');
  t.eq(R.map((s) => s.playerLevel).slice(0, 8), [1, 5, 10, 15, 18, 20, 24, 28], 'гейт по уровню NG I…D III');
  t.eq(N.map((s) => s.playerLevel), R.map((s) => s.playerLevel), 'гейты обеих линий совпадают');
  const copper = (L) => L.map((s) => s.materials.copper_parts || 0);
  t.eq(copper(R).slice(0, 8), [0, 100, 500, 1500, 2500, 8000, 12000, 18000], 'медь за ступени NG II…D III');
  t.eq(copper(N), copper(R), 'цена в меди одинакова для обеих линий');
  let grows = true;
  for (let i = 2; i < R.length; i++) if (copper(R)[i] <= copper(R)[i - 1]) grows = false;
  t.ok(grows, 'цена каждой следующей ступени выше');
  const mats = new Set();
  for (const L of [R, N]) for (const st of L) for (const m of Object.keys(st.materials)) mats.add(m);
  t.ok([...mats].every((m) => m === 'copper_parts' || ITEMS.get(m)), 'все материалы лестниц существуют в item-db');
  t.ok(!mats.has('synthetic_oil') && !mats.has('pressure_amplifier'), 'HP-банка и NG-усилитель больше не материалы корпуса');
  t.eq([R[5].materials.pressure_amplifier_d, R[5].materials.crystal_d], [1, 30], 'D I: усилитель D + 30 кристаллов D');
  t.ok(R[1].materials.iron_scrap > 0 && N[1].materials.copper_cable > 0, 'резонатор — металл, браслет — проводка');
  t.eq([ITEMS.shellIndexCap(R, 4), ITEMS.shellIndexCap(R, 5), ITEMS.shellIndexCap(R, 19)], [0, 1, 4], 'shellIndexCap по уровню');

  // ------------------------------------------------------------------
  t.suite('Бижутерия: слоты экипировки');
  const { equipSlotForTpl, sanitizeEquipSlots, EQUIP_SLOTS } = playerCore;
  t.ok(EQUIP_SLOTS.has('earring_l') && EQUIP_SLOTS.has('earring_r') && !EQUIP_SLOTS.has('earring'), 'две серьги — два слота');
  t.eq(equipSlotForTpl(ITEMS.get('copper_earring')), 'earring', 'шаблон серьги → логический слот earring');
  t.eq(equipSlotForTpl(ITEMS.get('engineer_emitter_low')), 'necklace', 'резонатор → слот ожерелья');
  t.eq(equipSlotForTpl(ITEMS.get('operator_bracers_low')), 'bracelet', 'наручи → слот браслета');
  t.eq(equipSlotForTpl({ id: 'x_neck', slot: 'necklace', type: 'accessory' }), null, 'обычное ожерелье не надевается');
  t.eq(equipSlotForTpl({ id: 'x_ring', slot: 'ring', type: 'accessory' }), null, 'кольцо не надевается');

  const legacy = {
    yid: 'itest_jw', inv: Object.create(null), plusById: Object.create(null),
    equip: {
      earring: { id: 'copper_earring', templateId: 'copper_earring', plus: 2 },
      earring_r: { id: 'coral_earring', templateId: 'coral_earring' }
    }
  };
  sanitizeEquipSlots(legacy);
  t.eq(Object.keys(legacy.equip).sort(), ['earring_l', 'earring_r'], 'старый ключ earring переезжает в свободный earring_l');
  t.eq(legacy.equip.earring_l.plus, 2, 'заточка серьги сохраняется при переезде');
  const full = {
    yid: 'itest_jw2', inv: Object.create(null), plusById: Object.create(null),
    equip: {
      earring_l: { id: 'copper_earring', templateId: 'copper_earring' },
      earring_r: { id: 'copper_earring', templateId: 'copper_earring' },
      earring: { id: 'coral_earring', templateId: 'coral_earring' }
    }
  };
  sanitizeEquipSlots(full);
  t.ok(!full.equip.earring && full.inv.coral_earring === 1, 'третья серьга при занятых слотах уходит в сумку');

  // ------------------------------------------------------------------
  t.suite('Бижутерия: надевание двух серёг (doEquip)');
  const sent = [];
  const h = createInventoryActionHandler({
    send: (p, m) => sent.push(m),
    checkRate: () => true,
    isBadKey: playerCore.isBadKey,
    equipSlotForTpl,
    stampDeviceFields: () => {},
    pushCombatStats: () => {},
    pushWeight: () => {},
    saveProfileNow: () => {},
    broadcastCosmeticsUpdate: () => {},
    invCount: (p, id) => p.inv[id] | 0,
    spawnGroundLoot: () => {},
    itemLookup: (id) => ITEMS.get(id)
  });
  const mkP = (inv, equip) => ({
    hp: 100, level: 20, inv: Object.assign(Object.create(null), inv), plusById: Object.create(null),
    equip: Object.assign(Object.create(null), equip || {})
  });
  const tid = (p, s) => p.equip[s] && p.equip[s].templateId;

  const p1 = mkP({ copper_earring: 2 });
  h.doEquip(p1, { templateId: 'copper_earring' });
  h.doEquip(p1, { templateId: 'copper_earring' });
  t.eq([tid(p1, 'earring_l'), tid(p1, 'earring_r'), p1.inv.copper_earring || 0], ['copper_earring', 'copper_earring', 0],
    'две одинаковые серьги из сумки занимают оба слота');

  const p2 = mkP({ coral_earring: 1 }, { earring_l: { id: 'copper_earring', templateId: 'copper_earring' } });
  h.doEquip(p2, { templateId: 'coral_earring', slot: 'earring_l' });
  t.eq([tid(p2, 'earring_l'), p2.inv.copper_earring], ['coral_earring', 1], 'явная сторона: серьга заменяет левую, старая — в сумку');

  const p3 = mkP({}, { earring_l: { id: 'copper_earring', templateId: 'copper_earring', plus: 1 } });
  h.doEquip(p3, { templateId: 'copper_earring', slot: 'earring_r' });
  t.eq([tid(p3, 'earring_l') || null, tid(p3, 'earring_r'), p3.equip.earring_r.plus], [null, 'copper_earring', 1],
    'серьга без копии в сумке переезжает L → R с заточкой');

  const p4 = mkP({}, { earring_r: { id: 'copper_earring', templateId: 'copper_earring' } });
  h.doEquip(p4, { templateId: 'copper_earring' });
  t.eq([tid(p4, 'earring_l') || null, tid(p4, 'earring_r')], [null, 'copper_earring'], 'повторный экип без стороны не двигает серьгу');

  const p5 = mkP({ copper_earring: 1 }, { earring_l: { id: 'copper_earring', templateId: 'copper_earring' } });
  h.doEquip(p5, { templateId: 'copper_earring', slot: 'earring_r' });
  t.eq([tid(p5, 'earring_l'), tid(p5, 'earring_r'), p5.inv.copper_earring || 0], ['copper_earring', 'copper_earring', 0],
    'копия из сумки надевается рядом, а не забирает соседнюю');

  // ------------------------------------------------------------------
  t.suite('Бижутерия: изъятие старых украшений с возвратом меди');
  const rate = NPCS.SELL_RATE;
  t.eq(RI.refundOf('pressure_ring', 2), Math.floor(15000 * rate) * 2, 'возврат = цена × курс выкупа NPC');
  const pr = {
    inv: { copper_parts: 100, copper_ring: 2, synthetic_oil: 3 },
    plusById: { copper_ring: 3 },
    equip: { necklace: { id: 'iron_necklace', templateId: 'iron_necklace' }, weapon: { id: 'x', templateId: 'operator_hammer_low' } },
    wh: { engine_necklace: 1, copper_parts: 5 },
    whPlusById: { engine_necklace: 2 }
  };
  const res = RI.purgePlayer(pr);
  const bagRefund = Math.floor(250 * rate) * 2 + Math.floor(14000 * rate);
  t.eq(pr.inv, { copper_parts: 100 + bagRefund, synthetic_oil: 3 }, 'сумка и экип: украшения изъяты, медь в сумку');
  t.eq([!!pr.equip.necklace, !!pr.equip.weapon], [false, true], 'изъято только украшение, оружие на месте');
  t.eq(pr.wh, { copper_parts: 5 + Math.floor(90000 * rate) }, 'склад: медь на склад');
  t.eq([pr.plusById, pr.whPlusById], [{}, {}], 'реестры заточки очищены');
  t.eq([res.removed, res.refund], [4, bagRefund + Math.floor(90000 * rate)], 'итог возврата');
  const again = RI.purgePlayer(pr);
  t.eq([again.removed, again.refund], [0, 0], 'повторная загрузка ничего не начисляет');

  const clan = { wh: { directive_seal: 1, tower_circuit_ring: 1 }, whPlusById: { directive_seal: 1 } };
  RI.purgeClanWarehouse(clan);
  t.eq(clan.wh, { copper_parts: Math.floor(140000 * rate) + Math.floor(88000 * rate) }, 'клан-склад: медь на тот же склад');

  const pl = new playerCore.Player(9701, 'itest_jw_load', {
    name: 'JwLoad', level: 10, cls: 'operator',
    inv: { copper_parts: 10, pressure_ring: 1 },
    equip: { earring: { id: 'copper_earring', templateId: 'copper_earring' } }
  }, {});
  t.ok(!pl.inv.pressure_ring && pl.inv.copper_parts === 10 + Math.floor(15000 * rate), 'загрузка профиля изымает кольцо и платит медь');
  t.ok(pl._retiredRefund && pl._retiredRefund.removed === 1, 'игрок получит сообщение о возврате');
  t.eq(pl.equip.earring_l && pl.equip.earring_l.templateId, 'copper_earring', 'старая серьга при загрузке — в earring_l');

  // ------------------------------------------------------------------
  t.suite('Бижутерия: источники серёг');
  const T = LT.MOB_LOOT_TABLES;
  const sources = (itemId) => Object.keys(T).filter((mid) => ['equipment', 'rare'].some((k) =>
    T[mid][k] && T[mid][k].groups.some((gr) => gr.items.some((it) => it.id === itemId))));
  const coral = sources('coral_earring');
  t.ok(['press_hammer', 'boiler_sovereign', 'steel_colossus', 'green_protocol', 'cruna_overseer', 'rezdiq_colonel',
    'steam_roller_bogatyr'].every((b) => coral.includes(b)), 'фреоновая серьга (D) падает с боссов 18–23');
  t.ok(['boiler_overpress', 'pressure_fiend'].every((m) => coral.includes(m)), 'и редко с мобов зон 18–22');
  t.ok(sources('copper_earring').length >= 5, 'медная серьга: бонусный дроп на NG-охоте');
  let unknown = [];
  for (const mid of Object.keys(T)) for (const k of ['common', 'equipment', 'rare', 'recipes', 'crystals', 'special']) {
    const sec = T[mid][k]; if (!sec || !sec.groups) continue;
    for (const gr of sec.groups) for (const it of gr.items) if (!ITEMS.get(it.id)) unknown.push(mid + ':' + it.id);
  }
  t.eq(unknown, [], 'в луте нет предметов без шаблона');
  t.ok(NPCS.shopEntry('trader_dora', 'copper_earring') && !NPCS.shopEntry('trader_dora', 'coral_earring'),
    'медная серьга в витрине, фреоновая (D) — нет');
  const q = QD.get ? QD.get('side_audio_log_01') : null;
  t.eq(q && q.rewards.items, [{ id: 'copper_earring', count: 1 }], 'квест «Голос из прошлого» даёт серьгу вместо кольца');
};
