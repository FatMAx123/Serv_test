// ============================================================
//  TESTS / NPC.TEST.JS — услуги NPC: каталоги, цены, дистанция, ёмкость сумки.
//  Регресс: покупка, телепорт и баффы жили только в клиенте (локальный
//  spendCurrency + addItem), и первая же серверная синхронизация инвентаря
//  стирала покупку.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const LR = require(path.join(ROOT, 'shared', 'loot-rules.js'));
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));

module.exports = function (t) {
  // Оверрайды редактора переносят NPC — сервер применяет их при старте,
  // тест обязан работать с той же геометрией.
  try {
    const f = path.join(ROOT, 'shared', 'editor-overrides.json');
    if (fs.existsSync(f)) { WM.applyEditorOverrides(JSON.parse(fs.readFileSync(f, 'utf8'))); NPCS.rebuild(); }
  } catch (e) { /* ignore */ }

  t.suite('npc-services: индекс NPC');
  const all = NPCS.allNpcs();
  t.ok(all.length >= 25, 'NPC загружены из world-metrics', 'всего: ' + all.length);
  t.ok(!!NPCS.getNpc('trader_vex'), 'NPC ищется по id');
  t.eq(NPCS.getNpc('__proto__'), null, 'prototype-ключи не резолвятся');
  t.eq(NPCS.getNpc('нет_такого'), null, 'неизвестный id → null');
  const shops = all.filter(n => n.shop && n.shop.length);
  t.eq(shops.length, 7, 'магазинов ровно 7');
  const tpNpcs = all.filter(n => NPCS.teleportPoints(n.id).length);
  t.eq(tpNpcs.length, 2, 'телепортёров ровно 2');

  t.suite('npc-services: дистанция взаимодействия');
  const vex = NPCS.getNpc('trader_vex');
  t.ok(NPCS.inRange(vex, vex.position.x, vex.position.z), 'вплотную — в радиусе');
  t.ok(NPCS.inRange(vex, vex.position.x + 6, vex.position.z), '6 м — в радиусе');
  t.ok(!NPCS.inRange(vex, vex.position.x + 10, vex.position.z), '10 м — вне радиуса');
  t.ok(!NPCS.inRange(vex, 0, 0), 'через полкарты — вне радиуса');
  // Радиус сервера должен быть не меньше клиентского окна диалога (4.5 м открыть,
  // 5.5 м закрыть), иначе легитимная покупка отклонялась бы.
  t.ok(NPCS.INTERACT_RANGE >= 5.5, 'радиус ≥ клиентского порога закрытия диалога',
    NPCS.INTERACT_RANGE + ' м');

  t.suite('npc-services: каталоги магазинов');
  const cat = NPCS.shopCatalog('trader_vex');
  t.ok(cat.length >= 18, 'каталог Векса — не менее 18 позиций', 'позиций: ' + cat.length);
  t.ok(cat.every(e => e.price > 0), 'у всех позиций цена > 0');
  t.ok(cat.every(e => e.name && e.type), 'у всех позиций есть имя и тип');
  const hammer = cat.find(e => e.itemId === 'operator_hammer_low');
  t.eq(hammer && hammer.price, 100, 'цена молота из loot-rules (100)');
  t.eq(NPCS.shopEntry('trader_vex', 'buckler'), null, 'товара не из каталога нет');
  t.eq(NPCS.shopEntry('trader_vex', '__proto__'), null, 'prototype-ключ не товар');
  t.eq(NPCS.shopCatalog('gilbert').length, 0, 'у не-торговца каталог пуст');
  // Все 84 позиции всех магазинов должны иметь цену и шаблон, иначе товар
  // молча исчезал бы из витрины.
  let totalItems = 0, broken = [];
  shops.forEach((n) => {
    const c = NPCS.shopCatalog(n.id);
    totalItems += c.length;
    c.forEach((e) => { if (!NPCS.itemMeta(e.itemId)) broken.push(n.id + '/' + e.itemId); });
  });
  t.eq(broken, [], 'все товары всех магазинов известны каталогу предметов');
  t.ok(totalItems >= 70, 'суммарно позиций в магазинах', String(totalItems));
  const overGradeShop = [];
  shops.forEach((n) => {
    NPCS.shopCatalog(n.id).forEach((e) => {
      if (!NPCS.shopGradeOk(e.grade)) overGradeShop.push(n.id + '/' + e.itemId + ':' + e.grade);
    });
  });
  t.eq(overGradeShop, [], 'в live-шопе нет C/B (кап фазы 1 — NG+D)');
  t.eq(NPCS.shopEntry('trader_dora', 'engine_necklace'), null, 'ожерелье C не в витрине Доры');
  t.eq(NPCS.shopEntry('archivist_skrip', 'recipe_hydraulic_armor'), null, 'чертёж C-доспеха не у Скрипа');

  t.suite('npc-services: продажа (money sink)');
  t.ok(NPCS.SELL_RATE > 0 && NPCS.SELL_RATE < 1, 'ставка выкупа между 0 и 1', String(NPCS.SELL_RATE));
  t.eq(NPCS.sellPrice('operator_hammer_low'), 40, 'выкуп = 40 % цены');
  t.eq(NPCS.sellPrice('copper_parts'), 0, 'валюту не скупают');
  t.eq(NPCS.sellPrice('audio_log_01'), 0, 'квестовые предметы не скупают');
  t.eq(NPCS.sellPrice('нет_такого'), 0, 'неизвестный предмет не скупают');
  // Цикл «купил-продал» обязан быть убыточным, иначе это фарм адены.
  const loop = cat.filter(e => NPCS.sellPrice(e.itemId) >= e.price);
  t.eq(loop.map(e => e.itemId), [], 'нет товаров с выкупом ≥ цены покупки');

  t.suite('npc-services: телепорты');
  const pts = NPCS.teleportPoints('dispatcher_roxy');
  t.eq(pts.length, 5, 'у диспетчера 5 точек');
  t.ok(pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.z) && p.cost > 0),
    'у всех точек координаты и цена');
  t.eq(NPCS.teleportPoint('dispatcher_roxy', 2).name, 'Западный Периметр', 'точка по индексу');
  t.eq(NPCS.teleportPoint('dispatcher_roxy', 'dispatcher_roxy:0').cost, 800, 'точка по стабильному id');
  t.eq(NPCS.teleportPoint('dispatcher_roxy', 99), null, 'индекс за границей → null');
  t.eq(NPCS.teleportPoints('trader_vex').length, 0, 'у торговца точек нет');

  t.suite('npc-services: баффы');
  const buffs = NPCS.buffOffers('biotin');
  t.eq(buffs.length, 3, 'у баффера 3 предложения');
  t.ok(buffs.every(b => b.cost > 0 && b.duration > 0), 'у всех цена и длительность');
  t.eq(NPCS.buffOffer('biotin', 'overclock').cost, 300, 'цена overclock');
  t.eq(NPCS.buffOffer('biotin', 'нет_такого'), null, 'неизвестный бафф → null');

  t.suite('npc-services: ёмкость сумки');
  t.eq(NPCS.MAX_INV_SLOTS, 80, 'слотов 80 (как в клиенте)');
  t.eq(LR.LOOT_ITEMS.synthetic_oil.maxStack, 999, 'maxStack масла 999 (от него считаются слоты и плата)');
  t.eq(NPCS.slotsFor('synthetic_oil', 999), 1, 'стак 999 = 1 слот (maxStack 999)');
  t.eq(NPCS.slotsFor('synthetic_oil', 1000), 2, '1000 = 2 слота');
  t.eq(NPCS.slotsFor('operator_hammer_low', 3), 3, 'нестакуемое = по слоту на штуку');
  t.eq(NPCS.slotsFor('copper_parts', 999999), 0, 'валюта слотов не занимает');
  t.ok(NPCS.canFit({}, 'synthetic_oil', 999).ok, 'в пустую сумку влезает стак');
  // Полная сумка: 80 слотов одним ключом. Прежний вариант «80 разных
  // нестакуемых предметов» молча не выполнялся — их в базе всего 46, и весь
  // блок проверок ёмкости уходил в незамеченный skip.
  const full = Object.create(null);
  full.synthetic_oil = 999 * 80;
  t.eq(NPCS.invSlotsUsed(full), 80, 'занятые слоты считаются верно');
  t.ok(!NPCS.canFit(full, 'iron_hammer', 1).ok, 'в полную сумку новый предмет не влезает');
  t.ok(!NPCS.canFit(full, 'synthetic_oil', 1).ok, 'в полную сумку не влезает и долив нового стака');
  // Долив в существующий неполный стак не требует слота
  const withStack = Object.create(null);
  withStack.synthetic_oil = 999 * 79 + 500;   // 80-й стак неполный: 500 из 999
  t.ok(NPCS.canFit(withStack, 'synthetic_oil', 100).ok, 'долив в неполный стак не требует слота');
  t.ok(!NPCS.canFit(withStack, 'synthetic_oil', 600).ok, 'перелив за maxStack требует слота');

  t.suite('npc-services: персональный склад');
  const whNpcs = all.filter(n => n.type === 'warehouse');
  t.eq(whNpcs.map(n => n.id), ['warehouse_w7'], 'склад в мире один и он на месте');
  t.eq(NPCS.MAX_WH_SLOTS, 80, 'ёмкость склада 80 (L2 Classic: как базовая сумка)');
  t.ok(NPCS.WH_FEE_PER_STACK > 0, 'вклад платный — это money sink',
    NPCS.WH_FEE_PER_STACK + '⚙️ за стак');
  // Что склад не принимает
  t.eq(NPCS.whStorable('synthetic_oil').ok, true, 'расходник хранить можно');
  t.eq(NPCS.whStorable('copper_parts').reason, 'currency', 'валюту не хранят');
  t.eq(NPCS.whStorable('audio_log_01').reason, 'quest_item', 'квестовые предметы не хранят');
  t.eq(NPCS.whStorable('нет_такого').reason, 'unknown_item', 'неизвестный предмет не хранят');
  // Плата: за стак, минимум один
  t.eq(NPCS.whDepositFee('synthetic_oil', 1), 30, 'одна штука = плата за один стак');
  t.eq(NPCS.whDepositFee('synthetic_oil', 999), 30, 'полный стак 999 = та же плата');
  t.eq(NPCS.whDepositFee('synthetic_oil', 1000), 60, '1000 = два стака = двойная плата');
  t.eq(NPCS.whDepositFee('operator_hammer_low', 3), 90, 'нестакуемое = плата за каждую штуку');
  t.eq(NPCS.whDepositFee('synthetic_oil', 0), 0, 'ноль единиц — платить не за что');
  // Ёмкость склада считается отдельно от сумки
  t.ok(NPCS.whCanFit({}, 'synthetic_oil', 999).ok, 'на пустой склад стак влезает');
  const whFull = Object.create(null);
  whFull.synthetic_oil = 999 * 80;            // ровно 80 слотов
  t.eq(NPCS.invSlotsUsed(whFull), NPCS.MAX_WH_SLOTS, 'склад заполнен под потолок');
  t.ok(!NPCS.whCanFit(whFull, 'iron_hammer', 1).ok, 'полный склад новый предмет не принимает');
  t.ok(NPCS.canFit(whFull, 'iron_hammer', 1, 200).ok, 'явная ёмкость аргументом работает');
  t.eq(NPCS.canFit({}, 'synthetic_oil', 999).free, NPCS.MAX_INV_SLOTS,
    'canFit без ёмкости считает по сумке (обратная совместимость)');

  t.suite('npc-services: заточка при переносе (plusMoveOk)');
  t.ok(NPCS.plusMoveOk({ operator_hammer_low: 1 }, { operator_hammer_low: 1 }, {}, {},
    'operator_hammer_low', 1), 'весь стак заточенного — можно');
  t.ok(!NPCS.plusMoveOk({ operator_hammer_low: 2 }, { operator_hammer_low: 1 }, {}, {},
    'operator_hammer_low', 1), 'часть заточенного стака — нельзя');
  t.ok(!NPCS.plusMoveOk({ operator_hammer_low: 1 }, { operator_hammer_low: 1 },
    { operator_hammer_low: 1 }, {}, 'operator_hammer_low', 1),
    'в приёмнике уже есть копия — нельзя смешать с заточенной');
  t.ok(NPCS.plusMoveOk({ synthetic_oil: 5 }, {}, {}, {}, 'synthetic_oil', 2),
    'без заточки частичный перенос можно');
  t.ok(!NPCS.plusMoveOk({ operator_hammer_low: 1 }, { operator_hammer_low: 1 }, {}, {},
    'operator_hammer_low', 1, { fromLocked: 1 }),
    'надетая заточенная копия блокирует вклад запасной');
  t.ok(!NPCS.plusMoveOk({ operator_hammer_low: 1 }, {}, {}, { operator_hammer_low: 1 },
    'operator_hammer_low', 1, { toLocked: 1, toExtraPlus: 1 }),
    'надетая заточенная копия блокирует выдачу со склада');
  t.ok(NPCS.plusMoveOk({ operator_hammer_low: 1 }, {}, {}, {},
    'operator_hammer_low', 1, { fromLocked: 1 }),
    'без заточки надетая копия не мешает сдать запасную');
  const fromPlus = { operator_hammer_low: 1 };
  const toPlus = {};
  NPCS.plusMove(fromPlus, toPlus, 'operator_hammer_low');
  t.eq(fromPlus.operator_hammer_low, undefined, 'plusMove снимает заточку с источника');
  t.eq(toPlus.operator_hammer_low, 1, 'plusMove ставит заточку приёмнику');
  NPCS.plusMove({ operator_hammer_low: 0 }, toPlus, 'operator_hammer_low');
  t.eq(toPlus.operator_hammer_low, undefined, 'нулевой plus не оставляет заточку в приёмнике');

  t.suite('npc-services: метаданные предметов');
  const meta = NPCS.itemMeta('buckler');
  t.ok(meta && meta.slot === 'shield', 'предмет только из item-db тоже находится',
    meta ? JSON.stringify({ slot: meta.slot, price: meta.price }) : 'нет');
  t.ok(NPCS.itemMeta('iron_hammer'), 'предмет только из loot-rules находится');
  t.eq(NPCS.itemMeta('__proto__'), null, 'prototype-ключ не предмет');
  t.eq(NPCS.itemMeta(null), null, 'null → null');
  t.ok(NPCS.isCurrency('copper_parts'), 'copper_parts опознан как валюта');
  t.ok(!NPCS.isCurrency('synthetic_oil'), 'расходник не валюта');
  t.eq({}.price, undefined, 'Object.prototype не загрязнён');

  t.suite('npc-services: rebuild после оверрайдов');
  const before = NPCS.getNpc('trader_vex').position.x;
  NPCS.rebuild();
  t.eq(NPCS.getNpc('trader_vex').position.x, before, 'rebuild не меняет позицию без новых оверрайдов');
  t.ok(ITEMS.get('buckler'), 'item-db доступен (зависимость npc-services)');
};
