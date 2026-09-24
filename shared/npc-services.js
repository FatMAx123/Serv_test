// ============================================================
//  SHARED / NPC-SERVICES.JS — услуги NPC: магазины, телепорты, баффы, склад.
//  UMD: сервер = require, клиент = <script>.
//
//  ЗАЧЕМ: до этого модуля покупка, телепорт и баффы жили ТОЛЬКО в клиенте
//  (npc-ui.js buyItem → локальный spendCurrency + addItem; map-renderer.js
//  teleportMenu → player.mesh.position.set). Сервер о них не знал, поэтому
//  первая же синхронизация инвентаря (net-ws.js applyInv полностью пересобирает
//  сумку из серверного inv) стирала покупку, а телепорт откатывался clampSpeed.
//  Здесь — единый каталог и правила, по которым сервер проверяет интенты
//  npc_buy / npc_sell / npc_teleport / npc_buff, а клиент рисует те же цены.
//
//  Данные НЕ дублируются: NPC берутся из world-metrics (с учётом оверрайдов
//  редактора), метаданные предметов — из loot-rules + item-db.
// ============================================================
(function (root, factory) {
  var isNode = (typeof module !== 'undefined' && module.exports);
  // Зависимости резолвятся ЛЕНИВО: в браузере порядок <script> не гарантирует,
  // что loot-rules уже загружен (он идёт после inventory.js), а кэш undefined
  // сломал бы все цены.
  var api = factory(
    isNode ? function () { return require('./world-metrics.js'); } : function () { return root.WorldMetrics; },
    isNode ? function () { return require('./loot-rules.js'); } : function () { return root.LOOT_RULES; },
    isNode ? function () { return require('./item-db.js'); } : function () { return root.ITEM_DB; }
  );
  if (isNode) module.exports = api;
  else { root.NPC_SERVICES = api; root.NPCS = api; }
})(typeof window !== 'undefined' ? window : globalThis, function (getWM, getLR, getITEMS) {
  'use strict';

  // ---- Константы правил ----
  /** Радиус разговора с NPC. Клиент открывает диалог на 4.0–4.5 м и закрывает
   *  на 5.5 м; сервер даёт запас на рассинхрон позиции, но не «через полкарты». */
  var INTERACT_RANGE = 7;
  var INTERACT_R2 = INTERACT_RANGE * INTERACT_RANGE;
  /** Доля цены при продаже предмета торговцу. Money sink: цикл купил-продал
   *  всегда убыточен, поэтому им нельзя фармить валюту (медные детали). */
  var SELL_RATE = 0.4;
  /** Слотов в сумке. Столько же на клиенте (main.js: new Inventory(80)). */
  var MAX_INV_SLOTS = 80;
  /**
   * Слотов на персональном складе. Классический приватный склад — 80 ячеек,
   * столько же, сколько базовая сумка; расширений склада в границах 1–20 нет.
   * Лимит считается отдельно от сумки, поэтому склад реально разгружает её.
   */
  var MAX_WH_SLOTS = 80;
  /**
   * Плата за вклад — за каждый занимаемый стак, минимум один (30
   * медных деталей за предмет). Money sink: положить 10 разных стаков = 300, то есть
   * цена одного телепорта. За выдачу со склада комиссия не берётся.
   */
  var WH_FEE_PER_STACK = 30;
  /** Максимум за одну покупку — чтобы опечатка не съела весь кошелёк. */
  var MAX_BUY_COUNT = 999;

  // Объектный литерал {'__proto__': 1} НЕ создаёт собственное свойство (это
  // установка прототипа), поэтому проверка по hasOwnProperty пропускала бы
  // именно самый опасный ключ. Regex надёжнее.
  var BAD_KEY_RE = /^(?:__proto__|constructor|prototype)$/;
  function isBadKey(k) { return BAD_KEY_RE.test(String(k)); }

  // ---- Индекс NPC (перестраивается после applyEditorOverrides) ----
  var _npcIndex = null;

  function buildIndex() {
    var idx = Object.create(null);
    var WM = getWM();
    if (!WM || typeof WM.buildCityNPCs !== 'function') return idx;
    var list = [];
    try { list = list.concat(WM.buildCityNPCs()); } catch (e) { /* ignore */ }
    try { list = list.concat(WM.buildRegionNPCs()); } catch (e) { /* ignore */ }
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (!n || !n.id || isBadKey(String(n.id))) continue;
      idx[String(n.id)] = n;
    }
    return idx;
  }

  /** Сбросить кэш NPC. Звать после WM.applyEditorOverrides. */
  function rebuild() { _npcIndex = null; }

  function index() {
    // Пустой индекс не кэшируем: в браузере world-metrics может подгрузиться
    // позже нас, и один неудачный вызов иначе «залипал» бы навсегда.
    if (!_npcIndex || !Object.keys(_npcIndex).length) _npcIndex = buildIndex();
    return _npcIndex;
  }

  function getNpc(npcId) {
    if (npcId == null) return null;
    var k = String(npcId);
    if (isBadKey(k)) return null;
    var idx = index();
    return Object.prototype.hasOwnProperty.call(idx, k) ? idx[k] : null;
  }

  function allNpcs() {
    var idx = index();
    return Object.keys(idx).map(function (k) { return idx[k]; });
  }

  /** 2D-дистанция: у сервера нет координаты Y, и все проверки радиусов — по XZ. */
  function inRange(npc, x, z) {
    if (!npc || !npc.position) return false;
    var dx = npc.position.x - x, dz = npc.position.z - z;
    return (dx * dx + dz * dz) <= INTERACT_R2;
  }

  // ---- Метаданные предметов (loot-rules + item-db) ----
  /**
   * Цены и правила стака живут в loot-rules (LOOT_ITEMS), боевые статы — в
   * item-db. Часть предметов есть только в одной из баз (buckler — только
   * item-db, iron_hammer — только loot-rules), поэтому нужен объединённый вид.
   */
  function itemMeta(itemId) {
    if (itemId == null) return null;
    var id = String(itemId).toLowerCase();
    if (!id || isBadKey(id)) return null;
    var LR = getLR();
    var ITEMS = getITEMS();
    var li = null;
    try { li = LR && LR.itemById ? LR.itemById(id) : null; } catch (e) { li = null; }
    var ci = null;
    try { ci = ITEMS && ITEMS.get ? ITEMS.get(id) : null; } catch (e) { ci = null; }
    if (!li && !ci) return null;
    var stackable = li ? !!li.stackable : false;
    var maxStack = li && li.maxStack ? Math.max(1, li.maxStack | 0) : 1;
    if (!stackable) maxStack = 1;
    return {
      id: id,
      name: (li && li.name) || (ci && ci.name) || id,
      type: (li && li.type) || (ci && ci.type) || 'misc',
      grade: (li && li.grade) || (ci && ci.grade) || 'no_grade',
      price: (li && li.price != null) ? (li.price | 0) : ((ci && ci.price != null) ? (ci.price | 0) : 0),
      stackable: stackable,
      maxStack: maxStack,
      slot: (ci && ci.slot) || null
    };
  }

  /** Валюта не занимает слоты: клиент держит её отдельным счётчиком. */
  function isCurrency(itemId) {
    var m = itemMeta(itemId);
    return !!(m && m.type === 'adena');
  }

  // ---- Ёмкость сумки ----
  /** Сколько слотов займут count единиц предмета «с нуля». */
  function slotsFor(itemId, count) {
    var n = Math.max(0, Math.floor(+count) || 0);
    if (n <= 0) return 0;
    var m = itemMeta(itemId);
    if (!m || m.type === 'adena') return 0;
    return Math.ceil(n / Math.max(1, m.maxStack));
  }

  /** Занятые слоты по серверному инвентарю {itemId: count}. */
  function invSlotsUsed(inv) {
    if (!inv || typeof inv !== 'object') return 0;
    var used = 0;
    var keys = Object.keys(inv);
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      var n = Math.floor(+inv[id]) || 0;
      if (n <= 0) continue;
      used += slotsFor(id, n);
    }
    return used;
  }

  /**
   * Влезет ли count единиц в контейнер. Учитывает долив в существующий неполный
   * стак — так же, как клиентский addStackable.
   * @param maxSlots ёмкость: сумка по умолчанию, склад — MAX_WH_SLOTS
   * @returns {{ok:boolean, need:number, free:number}}
   */
  function canFit(inv, itemId, count, maxSlots) {
    var cap = (maxSlots != null && maxSlots > 0) ? (maxSlots | 0) : MAX_INV_SLOTS;
    var n = Math.max(0, Math.floor(+count) || 0);
    if (n <= 0) return { ok: true, need: 0, free: cap };
    var m = itemMeta(itemId);
    if (!m || m.type === 'adena') return { ok: true, need: 0, free: cap };
    var have = (inv && Object.prototype.hasOwnProperty.call(inv, m.id))
      ? (Math.floor(+inv[m.id]) || 0) : 0;
    var used = invSlotsUsed(inv);
    var free = cap - used;
    // Слоты, которые понадобятся дополнительно: считаем «было» и «стало».
    var before = slotsFor(m.id, have);
    var after = slotsFor(m.id, have + n);
    var need = Math.max(0, after - before);
    return { ok: need <= free, need: need, free: free };
  }

  // ---- Персональный склад ----
  /** Влезет ли count единиц на склад (та же математика, своя ёмкость). */
  function whCanFit(wh, itemId, count) {
    return canFit(wh, itemId, count, MAX_WH_SLOTS);
  }

  /**
   * Плата за вклад: за каждый занимаемый стак, минимум один. Долив в уже
   * лежащий стак тоже платный — иначе сток обнуляется одной кнопкой.
   */
  function whDepositFee(itemId, count) {
    var n = Math.max(0, Math.floor(+count) || 0);
    if (n <= 0) return 0;
    var m = itemMeta(itemId);
    if (!m) return 0;
    return WH_FEE_PER_STACK * Math.max(1, slotsFor(m.id, n));
  }

  /**
   * Можно ли вообще хранить предмет на складе.
   * - валюта: клиент держит её отдельным счётчиком и ею же платится сама плата
   *   за вклад — хранение медных деталей дало бы круговую логику без выгоды;
   * - квестовые: их нельзя ни продать, ни сдать на склад, иначе игрок
   *   запирает себя в квесте.
   * @returns {{ok:boolean, reason:string}}
   */
  function whStorable(itemId) {
    var m = itemMeta(itemId);
    if (!m) return { ok: false, reason: 'unknown_item' };
    if (m.type === 'adena') return { ok: false, reason: 'currency' };
    if (m.type === 'quest') return { ok: false, reason: 'quest_item' };
    return { ok: true, reason: '' };
  }

  // ---- Заточка при переносе между ёмкостями (сумка / склад / чужая сумка) ----
  /** Значение карты счётчиков без сюрпризов прототипа. */
  function plusMapCount(m, k) {
    return (m && Object.prototype.hasOwnProperty.call(m, k)) ? (m[k] | 0) : 0;
  }

  /**
   * Можно ли перенести count единиц с учётом заточки. Реестр plus — один на
   * templateId в каждой ёмкости (инвентарь — счётчики без экземпляров), поэтому
   * смешивать заточенную вещь с обычной копией нельзя: +N либо размножится, либо
   * потеряется.
   *
   * Правило: если plus есть хоть в одной из двух ёмкостей, переносим ВСЕ копии
   * сразу и только когда в приёмнике этого предмета нет.
   *
   * Надетый слот — третья ёмкость: она делит plusById с сумкой, но в fromCounts
   * не входит. Без fromLocked вклад запасной копии, пока такая же вещь надета и
   * заточена, уносил plus на склад и оставлял +N на экипе (дюп заточки).
   *
   * @param opts.fromLocked     копии источника вне fromCounts (надето)
   * @param opts.toLocked       копии приёмника вне toCounts
   * @param opts.fromExtraPlus  заточка источника вне fromPlus (plus на надетом)
   * @param opts.toExtraPlus    заточка приёмника вне toPlus
   */
  function plusMoveOk(fromCounts, fromPlus, toCounts, toPlus, itemId, count, opts) {
    opts = opts || {};
    var fp = plusMapCount(fromPlus, itemId);
    var tp = plusMapCount(toPlus, itemId);
    if ((opts.fromExtraPlus | 0) > fp) fp = opts.fromExtraPlus | 0;
    if ((opts.toExtraPlus | 0) > tp) tp = opts.toExtraPlus | 0;
    if (!fp && !tp) return true;
    if ((opts.fromLocked | 0) > 0 || (opts.toLocked | 0) > 0) return false;
    return (count | 0) >= plusMapCount(fromCounts, itemId) && plusMapCount(toCounts, itemId) === 0;
  }

  /** Перенести запись заточки вслед за предметом (звать после переноса счётчиков). */
  function plusMove(fromPlus, toPlus, itemId) {
    if (!fromPlus || !toPlus) return;
    var plus = plusMapCount(fromPlus, itemId);
    delete fromPlus[itemId];
    if (plus > 0) toPlus[itemId] = plus;
    else delete toPlus[itemId];
  }

  // ---- Магазины ----
  /** Кап live-шопа фазы 1: NG + D. C/B не продаются (CONTENT_SCOPE_1_20). */
  var SHOP_GRADE_MAX = 'd';
  var SHOP_GRADE_RANK = { no_grade: 0, ng: 0, d: 1, c: 2, b: 3, a: 4, s: 5 };
  function shopGradeOk(grade) {
    var g = String(grade || 'no_grade').toLowerCase().replace(/-/g, '_');
    if (g === 'none' || g === 'n' || g === 'no') g = 'no_grade';
    var r = SHOP_GRADE_RANK[g];
    if (r == null) r = 0;
    return r <= (SHOP_GRADE_RANK[SHOP_GRADE_MAX] || 1);
  }

  /** Нормализованный каталог NPC: [{itemId, price, name, type, grade, stackable, maxStack}]. */
  function shopCatalog(npcId) {
    var npc = getNpc(npcId);
    if (!npc || !Array.isArray(npc.shop)) return [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < npc.shop.length; i++) {
      var raw = npc.shop[i];
      var id = (typeof raw === 'string') ? raw : (raw && raw.itemId);
      var m = itemMeta(id);
      if (!m) continue;                       // нет шаблона — товара не существует
      if (!shopGradeOk(m.grade)) continue;    // C/B не в витрине 1–20
      if (seen[m.id]) continue;
      // Цена товара: явная из записи магазина, иначе каталожная.
      var price = (raw && typeof raw === 'object' && raw.price != null) ? (raw.price | 0) : m.price;
      if (!(price > 0)) continue;             // «бесплатных» товаров в магазине не бывает
      seen[m.id] = 1;
      out.push({
        itemId: m.id, price: price, name: m.name, type: m.type,
        grade: m.grade, stackable: m.stackable, maxStack: m.maxStack
      });
    }
    return out;
  }

  /** Позиция каталога или null. Авторитет цены — сервер, не пакет клиента. */
  function shopEntry(npcId, itemId) {
    if (itemId == null) return null;
    var id = String(itemId).toLowerCase();
    var cat = shopCatalog(npcId);
    for (var i = 0; i < cat.length; i++) if (cat[i].itemId === id) return cat[i];
    return null;
  }

  /**
   * Цена выкупа предмета торговцем. Скупают только то, что имеет цену и не
   * является валютой или квестовым предметом (иначе можно продать сюжетный
   * предмет и застрять в квесте).
   * @returns {number} 0 — предмет не принимают
   */
  function sellPrice(itemId) {
    var m = itemMeta(itemId);
    if (!m) return 0;
    if (m.type === 'adena' || m.type === 'quest') return 0;
    var s = String(itemId || '').toLowerCase();
    if (s === 'engineer_emitter_low' || s === 'engineer_nano_bracelet' ||
        s === 'operator_compressor_low' || s === 'operator_bracers_low') return 0;
    if (m.nodrop || m.noDrop || m.undroppable || m.notDropable || m.bound) return 0;
    if (m.isResonator || m.isCircuitDevice || m.isCompressor || m.isOperatorDevice ||
        m.isNanoBracelet || m.isBraceletDevice || m.isBracers || m.isOperatorBracers ||
        m.isValveDevice || m.isCircuit) return 0;
    if (!(m.price > 0)) return 0;
    return Math.max(1, Math.floor(m.price * SELL_RATE));
  }

  // ---- Телепорты ----
  /** Точки телепорта NPC: [{index, id, name, x, z, cost}]. */
  function teleportPoints(npcId) {
    var npc = getNpc(npcId);
    if (!npc || !Array.isArray(npc.teleports)) return [];
    var out = [];
    for (var i = 0; i < npc.teleports.length; i++) {
      var t = npc.teleports[i];
      if (!t || !Number.isFinite(+t.x) || !Number.isFinite(+t.z)) continue;
      out.push({
        index: i,
        id: String(npcId) + ':' + i,
        name: t.name || ('Точка ' + (i + 1)),
        x: +t.x, z: +t.z,
        cost: Math.max(0, t.cost | 0)
      });
    }
    return out;
  }

  /** Точка по индексу либо по стабильному id (npcId:index). */
  function teleportPoint(npcId, key) {
    var pts = teleportPoints(npcId);
    if (key == null) return null;
    var n = Math.floor(+key);
    if (Number.isFinite(n) && String(n) === String(key).trim()) {
      return pts[n] || null;
    }
    var s = String(key);
    for (var i = 0; i < pts.length; i++) if (pts[i].id === s || pts[i].name === s) return pts[i];
    return null;
  }

  // ---- Баффы NPC ----
  /** Предложения баффера: [{id, name, description, cost, duration, effect}]. */
  function buffOffers(npcId) {
    var npc = getNpc(npcId);
    if (!npc || !Array.isArray(npc.buffs)) return [];
    var out = [];
    for (var i = 0; i < npc.buffs.length; i++) {
      var b = npc.buffs[i];
      if (!b || !b.id || isBadKey(String(b.id))) continue;
      out.push({
        id: String(b.id),
        name: b.name || b.id,
        description: b.description || '',
        cost: Math.max(0, b.cost | 0),
        duration: Math.max(1, b.duration | 0),
        effect: b.effect && typeof b.effect === 'object' ? b.effect : {}
      });
    }
    return out;
  }

  function buffOffer(npcId, buffId) {
    if (buffId == null) return null;
    var id = String(buffId);
    var list = buffOffers(npcId);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  return {
    INTERACT_RANGE: INTERACT_RANGE,
    INTERACT_R2: INTERACT_R2,
    SELL_RATE: SELL_RATE,
    MAX_INV_SLOTS: MAX_INV_SLOTS,
    MAX_WH_SLOTS: MAX_WH_SLOTS,
    WH_FEE_PER_STACK: WH_FEE_PER_STACK,
    MAX_BUY_COUNT: MAX_BUY_COUNT,
    rebuild: rebuild,
    getNpc: getNpc,
    allNpcs: allNpcs,
    inRange: inRange,
    itemMeta: itemMeta,
    isCurrency: isCurrency,
    slotsFor: slotsFor,
    invSlotsUsed: invSlotsUsed,
    canFit: canFit,
    whCanFit: whCanFit,
    whDepositFee: whDepositFee,
    whStorable: whStorable,
    plusMapCount: plusMapCount,
    plusMoveOk: plusMoveOk,
    plusMove: plusMove,
    SHOP_GRADE_MAX: SHOP_GRADE_MAX,
    shopGradeOk: shopGradeOk,
    shopCatalog: shopCatalog,
    shopEntry: shopEntry,
    sellPrice: sellPrice,
    teleportPoints: teleportPoints,
    teleportPoint: teleportPoint,
    buffOffers: buffOffers,
    buffOffer: buffOffer
  };
});
