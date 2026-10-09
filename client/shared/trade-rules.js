// ============================================================
//  SHARED / TRADE-RULES.JS — правила обмена между игроками.
//  UMD: сервер = require, клиент = <script>.
//
//  ЗАЧЕМ: до этого единственным способом передать вещь другому игроку было
//  выбросить её на землю и надеяться, что подберёт свой. Обмен — это перенос
//  между ДВУМЯ профилями, поэтому правила (что вообще передаётся, сколько
//  позиций в окне, сколько слотов останется у получателя) обязаны быть одни и
//  те же у сервера и клиента: клиент по ним гасит недоступные предметы, сервер
//  по ним отказывает.
//
//  Сам перенос — только на сервере, в одном тике, без await между проверкой и
//  записью: profileOf возвращает ССЫЛКИ на p.inv, и любая асинхронность внутри
//  транзакции — это дюп.
// ============================================================
(function (root, factory) {
  var isNode = (typeof module !== 'undefined' && module.exports);
  // Зависимость резолвится лениво: в браузере порядок <script> не гарантирует,
  // что npc-services уже загружен.
  var api = factory(
    isNode ? function () { return require('./npc-services.js'); } : function () { return root.NPCS; }
  );
  if (isNode) module.exports = api;
  else { root.TRADE_RULES = api; root.TRADE = api; }
})(typeof window !== 'undefined' ? window : globalThis, function (getNPCS) {
  'use strict';

  /** Дистанция обмена. Столько же, сколько у приглашения в группу (PARTY_INVITE_R). */
  var TRADE_RANGE = 50;
  var TRADE_R2 = TRADE_RANGE * TRADE_RANGE;
  /** Позиций на сторону: классический лимит ячеек в окне обмена C1. */
  var MAX_TRADE_SLOTS = 8;
  /** Брошенное окно не должно держать игрока в «занят обменом» вечно. */
  var TRADE_TTL_MS = 120000;
  /** Дистанция, с которой видно и можно открыть личную лавку (подойти вплотную). */
  var STORE_RANGE = 15;
  var STORE_R2 = STORE_RANGE * STORE_RANGE;
  /** Позиций в личной лавке. Столько же в клиентском окне (private-store.js maxSlots). */
  var MAX_STORE_SLOTS = 8;
  /** Потолок цены за штуку: защита от 1e9 в пакете и от переполнения при count × price. */
  var MAX_ITEM_PRICE = 999999999;

  var BAD_KEY_RE = /^(?:__proto__|constructor|prototype)$/;
  function isBadKey(k) { return BAD_KEY_RE.test(String(k)); }

  /**
   * Можно ли вообще передать предмет.
   * Квестовые — нет: их нельзя ни продать, ни передать, иначе игрок
   * запирает себя (или чужой) квест. Валюта — можно: обмен медных деталей и есть
   * основной сценарий торговли.
   * @returns {{ok:boolean, reason:string}}
   */
  var CLASS_DEVICE_IDS = {
    'engineer_emitter_low': true,
    'engineer_nano_bracelet': true,
    'operator_compressor_low': true,
    'operator_bracers_low': true
  };

  function isDevice(id, meta) {
    var s = String(id || '').toLowerCase();
    if (CLASS_DEVICE_IDS[s]) return true;
    if (!meta) return false;
    var mid = String(meta.id || meta.templateId || '').toLowerCase();
    if (CLASS_DEVICE_IDS[mid]) return true;
    return !!(meta.isResonator || meta.isCircuitDevice || meta.isCompressor ||
              meta.isOperatorDevice || meta.isNanoBracelet || meta.isBraceletDevice ||
              meta.isBracers || meta.isOperatorBracers || meta.isValveDevice || meta.isCircuit);
  }

  function tradable(itemId) {
    var NPCS = getNPCS();
    if (!NPCS || !NPCS.itemMeta) return { ok: false, reason: 'no_rules' };
    if (itemId == null || isBadKey(itemId)) return { ok: false, reason: 'args' };
    var m = NPCS.itemMeta(itemId);
    if (!m) return { ok: false, reason: 'unknown_item' };
    if (m.type === 'quest') return { ok: false, reason: 'quest_item' };
    if (isDevice(itemId, m)) return { ok: false, reason: 'bound_item' };
    if (m.nodrop || m.noDrop || m.undroppable || m.notDropable || m.bound) return { ok: false, reason: 'bound_item' };
    return { ok: true, reason: '' };
  }

  /** Сколько позиций занято в предложении (валюта тоже позиция окна). */
  function offerSlots(offer) {
    if (!offer) return 0;
    var n = 0;
    var keys = Object.keys(offer);
    for (var i = 0; i < keys.length; i++) if ((Math.floor(+offer[keys[i]]) || 0) > 0) n++;
    return n;
  }

  /**
   * Сколько слотов сумки займёт содержимое ПОСЛЕ обмена: своё предложение
   * уходит, чужое приходит. Считать «влезет ли чужое» по текущей сумке нельзя
   * дважды: полная сумка, отдающая 5 вещей и получающая 5, обмен пройти обязана,
   * а два разных предмета по отдельности пролезут в один свободный слот, вместе
   * — нет.
   */
  function slotsAfterSwap(inv, give, take) {
    var NPCS = getNPCS();
    if (!NPCS) return 0;
    var post = Object.create(null);
    var keys, i, id, n;
    if (inv) {
      keys = Object.keys(inv);
      for (i = 0; i < keys.length; i++) {
        if (isBadKey(keys[i])) continue;
        post[keys[i]] = Math.floor(+inv[keys[i]]) || 0;
      }
    }
    if (give) {
      keys = Object.keys(give);
      for (i = 0; i < keys.length; i++) {
        id = keys[i];
        if (isBadKey(id)) continue;
        n = Math.floor(+give[id]) || 0;
        post[id] = (post[id] || 0) - n;
      }
    }
    if (take) {
      keys = Object.keys(take);
      for (i = 0; i < keys.length; i++) {
        id = keys[i];
        if (isBadKey(id)) continue;
        n = Math.floor(+take[id]) || 0;
        post[id] = (post[id] || 0) + n;
      }
    }
    keys = Object.keys(post);
    for (i = 0; i < keys.length; i++) if (post[keys[i]] <= 0) delete post[keys[i]];
    return NPCS.invSlotsUsed(post);
  }

  /** Влезет ли чужое предложение с учётом того, что своё уходит. */
  function canSwap(inv, give, take) {
    var NPCS = getNPCS();
    var cap = (NPCS && NPCS.MAX_INV_SLOTS) || 80;
    var after = slotsAfterSwap(inv, give, take);
    return { ok: after <= cap, used: after, cap: cap };
  }

  /** 2D-дистанция, как все радиусы на сервере (координаты y у игрока нет). */
  function inRange(ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;
    return (dx * dx + dz * dz) <= TRADE_R2;
  }

  /** Дистанция до личной лавки — короче, чем у обмена. */
  function inStoreRange(ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;
    return (dx * dx + dz * dz) <= STORE_R2;
  }

  /**
   * Нормализовать позиции лавки из пакета клиента: только известные предметы,
   * целые count/price в разумных границах, не больше MAX_STORE_SLOTS позиций.
   * @returns {{items: Object, bad: string[]}} items = {itemId: {count, price}}
   */
  function normalizeStoreItems(list) {
    var items = Object.create(null);
    var bad = [];
    var n = 0;
    if (!Array.isArray(list)) return { items: items, bad: bad };
    for (var i = 0; i < list.length && n < MAX_STORE_SLOTS; i++) {
      var raw = list[i];
      if (!raw) continue;
      var id = String(raw.itemId || raw.id || '').toLowerCase();
      var can = tradable(id);
      if (!can.ok) { bad.push(id || '?'); continue; }
      var count = Math.floor(+raw.count) || 0;
      // maxPrice — поле buy-списка клиента, price — sell-списка
      var price = Math.floor(+(raw.price != null ? raw.price : raw.maxPrice)) || 0;
      if (count < 1 || price < 1 || price > MAX_ITEM_PRICE) { bad.push(id); continue; }
      if (items[id]) { items[id].count += count; continue; }
      items[id] = { count: count, price: price };
      n++;
    }
    return { items: items, bad: bad };
  }

  return {
    TRADE_RANGE: TRADE_RANGE,
    TRADE_R2: TRADE_R2,
    MAX_TRADE_SLOTS: MAX_TRADE_SLOTS,
    TRADE_TTL_MS: TRADE_TTL_MS,
    STORE_RANGE: STORE_RANGE,
    STORE_R2: STORE_R2,
    MAX_STORE_SLOTS: MAX_STORE_SLOTS,
    MAX_ITEM_PRICE: MAX_ITEM_PRICE,
    tradable: tradable,
    offerSlots: offerSlots,
    slotsAfterSwap: slotsAfterSwap,
    canSwap: canSwap,
    inRange: inRange,
    inStoreRange: inStoreRange,
    normalizeStoreItems: normalizeStoreItems
  };
});
