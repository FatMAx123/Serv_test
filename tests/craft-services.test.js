// ============================================================
//  TESTS / CRAFT-SERVICES.TEST.JS — Паровой Горн и Мастерская.
//  Горн: NPC-крафтер для любого класса, нарочно невыгодный (чертёж сгорает,
//  шанс ≤50%, плата = max(порог, средняя плата живых Мастерских × 1.5)).
//  Мастерская: Мастеровой собирает для покупателя из его материалов за плату.
// ============================================================
'use strict';
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const G = require(path.join(ROOT, 'shared', 'game-rules.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const TR = require(path.join(ROOT, 'shared', 'trade-rules.js'));
const { createCraftHandler } = require(path.join(ROOT, 'server', 'handlers', 'craft-handler.js'));
const createStoreHandler = require(path.join(ROOT, 'server', 'handlers', 'store-handler.js'));

/** crypto.randomInt подменяется: roll 0 → всегда успех, 99999999 → всегда провал. */
function withRoll(roll, fn) {
  const orig = crypto.randomInt;
  crypto.randomInt = () => roll;
  try { return fn(); } finally { crypto.randomInt = orig; }
}

const priceOf = (id) => { const m = NPCS.itemMeta(id); return (m && +m.price) || 0; };
const KRAN = NPCS.allNpcs().find((n) => n.id === 'smith_kran');
const noop = () => {};
const MOD = { log: noop };

function makeHandlers(players, sent) {
  const send = (p, m) => sent.push(Object.assign({ to: p.pid }, m));
  const store = createStoreHandler({
    players, send, broadcastAOI: noop,
    currencyOf: (p) => (p.inv.copper_parts | 0),
    takeCurrency: noop, giveCurrency: noop,
    invCount: (p, id) => (p.inv[id] | 0),
    isBadKey: () => false, canCarryMore: () => ({ ok: true }), pruneInv: noop,
    saveProfileNow: noop, pushWeight: noop, playerStunned: () => false, Mod: MOD
  });
  const craft = createCraftHandler({
    send,
    checkRate: () => true,
    tableGet: (tbl, k) => (Object.prototype.hasOwnProperty.call(tbl, k) ? tbl[k] : null),
    wouldExceedWeight: () => ({ ok: true }),
    bagPlus: () => 0,
    pruneInv: (p) => { for (const k of Object.keys(p.inv)) if (p.inv[k] <= 0) delete p.inv[k]; },
    questCollectChanged: noop, saveProfileNow: noop, pushWeight: noop,
    players,
    npcForService: (p, npcId, failType, pred) => {
      const n = NPCS.getNpc(npcId);
      if (!n || !pred(n)) { send(p, { t: failType, reason: 'no_service' }); return null; }
      if (!NPCS.inRange(n, p.x, p.z)) { send(p, { t: failType, reason: 'range' }); return null; }
      return n;
    },
    storePayload: store.storePayload,
    Mod: MOD
  });
  return { store, craft };
}

function mkPlayer(pid, cls, extra) {
  return Object.assign({
    pid, cls, name: 'p' + pid, hp: 100, dead: false, x: KRAN.position.x, z: KRAN.position.z,
    inv: {}, equip: {}, plusById: {}, learned: new Set(), skills: {}, store: null, trade: null
  }, extra || {});
}

module.exports = function (t) {
  t.suite('Паровой Горн: правила цены и шанса');
  t.ok(KRAN && KRAN.forge === true, 'Горн стоит у Кузнеца-Сборщика Крана');
  t.eq(G.forgeChance('synthetic_oil'), 0.5, 'расходник 100% → в Горне 50%');
  t.eq(G.forgeChance('revolution_sword'), 0.5, 'D-оружие 60% → 50%');
  t.eq(G.forgeChance('hydraulic_blade'), 0.4, 'рецепт с 40% в Горне не становится лучше');
  t.eq(G.forgeMinFee('revolution_sword', priceOf), Math.round(409000 * 0.3), 'порог D-оружия — 30% цены');
  t.eq(G.forgeMinFee('steam_boots', priceOf), 30000, 'порог D-брони не ниже 30 000');
  t.eq(G.forgeMinFee('synthetic_oil', priceOf), 500, 'минимум чертежа 1-го уровня — 500');
  const min = G.forgeMinFee('revolution_sword', priceOf);
  t.eq(G.forgeFee('revolution_sword', priceOf, []), min, 'без Мастерских плата = порогу');
  t.eq(G.forgeFee('revolution_sword', priceOf, [150000, 250000]), Math.round(200000 * 1.5),
    'две Мастерские 150k и 250k → средняя × 1.5');
  t.eq(G.forgeFee('revolution_sword', priceOf, [1000]), min, 'дешёвые Мастерские не опускают Горн ниже порога');
  t.eq(G.forgeFee('revolution_sword', priceOf, [999999999]), Math.round(min * 5 * 1.5),
    'заоблачная плата одного Мастерового зажимается до 5 × порог');

  t.suite('Паровой Горн: заказ у NPC');
  {
    const players = new Map();
    const sent = [];
    const { craft } = makeHandlers(players, sent);
    const op = mkPlayer(1, 'operator');
    players.set(1, op);
    craft.doForgeList(op, { npcId: 'smith_kran' });
    const list = sent.find((m) => m.t === 'forge_list');
    const q = list && list.recipes.find((r) => r.recipeId === 'synthetic_oil');
    t.ok(q && q.fee === 500 && q.workshops === 0, 'прейскурант: плата 500, Мастерских 0');

    sent.length = 0;
    op.inv = { gear_fragment: 2, oil_filter: 1, copper_parts: 1000 };
    craft.doForgeCraft(op, { id: 'synthetic_oil', npcId: 'smith_kran', expectedFee: 500 });
    t.ok(sent.some((m) => m.reason === 'no_recipe'), 'без чертежа-предмета Горн не собирает');
    t.eq(op.inv.copper_parts, 1000, 'деньги не списаны');

    op.inv.recipe_synthetic_oil = 1;
    sent.length = 0;
    withRoll(0, () => craft.doForgeCraft(op, { id: 'synthetic_oil', npcId: 'smith_kran', expectedFee: 500 }));
    t.ok(sent.some((m) => m.t === 'craft_ok' && m.via === 'forge'), 'Оператор собирает в Горне');
    t.eq(op.inv.synthetic_oil, 5, 'результат выдан');
    t.eq(op.inv.copper_parts, 500, 'плата 500 списана');
    t.ok(!op.inv.recipe_synthetic_oil, 'чертёж сгорел');
    t.ok(!op.inv.gear_fragment && !op.inv.oil_filter, 'материалы списаны');

    op.inv = { gear_fragment: 2, oil_filter: 1, copper_parts: 1000, recipe_synthetic_oil: 1 };
    sent.length = 0;
    // 0.5 × 1e8 = 50 000 000: бросок ровно на границе 50% — провал (успех только < шанса)
    withRoll(50000000, () => craft.doForgeCraft(op, { id: 'synthetic_oil', npcId: 'smith_kran', expectedFee: 500 }));
    t.ok(sent.some((m) => m.t === 'craft_fail' && m.via === 'forge' && !m.reason), 'бросок 50% в Горне — провал');
    t.ok(!op.inv.synthetic_oil && !op.inv.recipe_synthetic_oil && op.inv.copper_parts === 500,
      'при провале чертёж, материалы и плата потеряны');

    op.inv = { gear_fragment: 2, oil_filter: 1, copper_parts: 1000, recipe_synthetic_oil: 1 };
    sent.length = 0;
    craft.doForgeCraft(op, { id: 'synthetic_oil', npcId: 'smith_kran', expectedFee: 400 });
    t.ok(sent.some((m) => m.reason === 'price_changed'), 'устаревшая плата → price_changed');
    t.eq(op.inv.copper_parts, 1000, 'при смене цены ничего не списано');

    const far = mkPlayer(2, 'operator', { x: KRAN.position.x + 100 });
    sent.length = 0;
    craft.doForgeList(far, { npcId: 'smith_kran' });
    t.ok(sent.some((m) => m.t === 'forge_fail' && m.reason === 'range'), 'издалека Горн недоступен');
    const notForge = mkPlayer(3, 'operator');
    sent.length = 0;
    craft.doForgeList(notForge, { npcId: 'trader_vex' });
    t.ok(sent.some((m) => m.reason === 'no_service'), 'у других NPC Горна нет');
  }

  t.suite('Мастерская: открытие');
  {
    const players = new Map();
    const sent = [];
    const { store, craft } = makeHandlers(players, sent);
    const op = mkPlayer(1, 'operator');
    op.learned.add('synthetic_oil');
    store.doStoreSet(op, { mode: 'craft', items: [{ recipeId: 'synthetic_oil', price: 100 }] });
    t.ok(!op.store && sent.some((m) => m.reason === 'class'), 'Оператор не открывает Мастерскую');
    const cr = mkPlayer(2, 'craftsman', { skills: { cr_create_item: 1 } });
    sent.length = 0;
    store.doStoreSet(cr, { mode: 'craft', items: [{ recipeId: 'synthetic_oil', price: 100 }] });
    t.ok(!cr.store && sent.some((m) => m.reason === 'not_learned'), 'неизученный рецепт не выставить');
    cr.learned.add('synthetic_oil');
    cr.learned.add('copper_shield');
    sent.length = 0;
    store.doStoreSet(cr, { mode: 'craft', items: [{ recipeId: 'copper_shield', price: 100 }] });
    t.ok(!cr.store && sent.some((m) => m.reason === 'not_learned'), 'рецепт выше уровня ремесла не выставить');
    sent.length = 0;
    store.doStoreSet(cr, { mode: 'craft', title: 'Масло на заказ', items: [{ recipeId: 'synthetic_oil', price: 300 }] });
    t.ok(cr.store && cr.store.mode === 'craft' && cr.store.items.synthetic_oil.price === 300, 'Мастерская открыта');
    t.eq(store.storePublic(cr), { mode: 'craft', title: 'Масло на заказ', count: 1 }, 'вывеска для AOI');
    players.set(2, cr);
    const pl = store.storePayload(mkPlayer(9, 'operator'), cr);
    t.ok(pl.mode === 'craft' && pl.recipes[0].mats.length === 2 && pl.recipes[0].chance === 1,
      'покупатель видит рецепт, материалы и шанс хозяина');
    // Живая Мастерская поднимает цену Горна
    const q = craft.forgeQuote('synthetic_oil');
    t.eq(q.workshops, 1, 'Горн видит одну живую Мастерскую');
    t.eq(q.fee, 500, 'Мастерская за 300 → 300 × 1.5 = 450 ниже порога, Горн берёт порог 500');
    t.eq(TR.normalizeCraftOffers([{ recipeId: 'nope', price: 5 }], G.RECIPES).bad, ['nope'], 'неизвестный рецепт отброшен');
  }

  t.suite('Мастерская: заказ сборки');
  {
    const players = new Map();
    const sent = [];
    const { store, craft } = makeHandlers(players, sent);
    const cr = mkPlayer(2, 'craftsman', { skills: { cr_create_item: 1 }, inv: { copper_parts: 10 } });
    cr.learned.add('synthetic_oil');
    players.set(2, cr);
    store.doStoreSet(cr, { mode: 'craft', items: [{ recipeId: 'synthetic_oil', price: 300 }] });
    const buyer = mkPlayer(3, 'operator', { inv: { gear_fragment: 4, oil_filter: 2, copper_parts: 1000 } });
    players.set(3, buyer);

    sent.length = 0;
    withRoll(0, () => craft.doManufacture(buyer, { pid: 2, recipeId: 'synthetic_oil', expectedPrice: 300 }));
    const deal = sent.find((m) => m.t === 'store_deal' && m.to === 3);
    t.ok(deal && deal.dir === 'craft' && deal.ok, 'покупатель получает результат заказа');
    t.eq(buyer.inv.synthetic_oil, 5, 'предмет у покупателя');
    t.eq(buyer.inv.gear_fragment, 2, 'материалы списаны у покупателя');
    t.eq(buyer.inv.copper_parts, 700, 'плата списана у покупателя');
    t.eq(cr.inv.copper_parts, 310, 'плата у Мастерового');
    t.ok(sent.some((m) => m.t === 'store_deal' && m.to === 2 && m.dir === 'crafted'), 'Мастеровой видит заказ');

    sent.length = 0;
    craft.doManufacture(buyer, { pid: 2, recipeId: 'synthetic_oil', expectedPrice: 200 });
    t.ok(sent.some((m) => m.reason === 'price_changed'), 'смена платы → price_changed');
    t.eq(buyer.inv.copper_parts, 700, 'ничего не списано');

    buyer.inv.gear_fragment = 0;
    sent.length = 0;
    craft.doManufacture(buyer, { pid: 2, recipeId: 'synthetic_oil', expectedPrice: 300 });
    t.ok(sent.some((m) => m.t === 'store_fail' && m.reason === 'mats'), 'без материалов заказ не принимается');
    t.eq(buyer.inv.copper_parts, 700, 'деньги целы');

    const farBuyer = mkPlayer(4, 'operator', { x: cr.x + 40, inv: { gear_fragment: 2, oil_filter: 1, copper_parts: 1000 } });
    sent.length = 0;
    craft.doManufacture(farBuyer, { pid: 2, recipeId: 'synthetic_oil', expectedPrice: 300 });
    t.ok(sent.some((m) => m.reason === 'range'), 'вне радиуса лавки заказ не принимается');

    const fullBuyer = mkPlayer(5, 'operator', { inv: { gear_fragment: 2, oil_filter: 1, copper_parts: 1000 } });
    // Перегруз эмулируем через wouldExceedWeight → { ok: false }
    const { craft: craftHeavy } = (() => {
      const s2 = [];
      const h = createCraftHandler({
        send: (p, m) => s2.push(m), checkRate: () => true,
        tableGet: (tbl, k) => tbl[k], wouldExceedWeight: () => ({ ok: false }), bagPlus: () => 0,
        pruneInv: noop, questCollectChanged: noop, saveProfileNow: noop, pushWeight: noop,
        players, Mod: MOD
      });
      h._sent = s2;
      return { craft: h };
    })();
    craftHeavy.doManufacture(fullBuyer, { pid: 2, recipeId: 'synthetic_oil', expectedPrice: 300 });
    t.ok(craftHeavy._sent.some((m) => m.reason === 'weight'), 'перегруз — отказ');
    t.eq(fullBuyer.inv.copper_parts, 1000, 'при перегрузе ничего не списано');
    t.eq(fullBuyer.inv.gear_fragment, 2, 'материалы целы');
  }
};
