// ============================================================
//  SERVER / CORE / RETIRED-ITEMS.JS — предметы, изъятые из игры.
//  Схема бижутерии игры: две серьги + слот ожерелья (резонатор/компрессор)
//  + слот браслета (нано-браслет/наручи) вместо пары колец. Кольца и обычные
//  ожерелья в неё не помещаются: их нельзя надеть, а в сумке и на складе
//  они только занимали место. При загрузке профиля или кланового склада
//  такие вещи изымаются, а владелец получает медь по курсу выкупа NPC
//  (SELL_RATE от прежней цены) — как если бы продал их торговцу. Заточку
//  NPC не оплачивает (как в L2), поэтому plus не влияет на сумму.
// ============================================================
'use strict';

const NPCS = require('../../shared/npc-services.js');

/** Прежняя цена шаблона (на момент изъятия) — база для возврата меди. */
const RETIRED_PRICES = Object.freeze({
  copper_ring: 250,
  pressure_ring: 15000,
  tower_circuit_ring: 88000,
  copper_necklace: 600,
  iron_necklace: 14000,
  engine_necklace: 90000,
  directive_seal: 140000
});
const CURRENCY = 'copper_parts';
const CURRENCY_CAP = 2147483647;

function isRetired(id) {
  return Object.prototype.hasOwnProperty.call(RETIRED_PRICES, String(id || '').toLowerCase());
}

function refundOf(id, count) {
  const price = RETIRED_PRICES[id] || 0;
  return Math.floor(price * NPCS.SELL_RATE) * Math.max(0, Math.floor(+count) || 0);
}

/** Убрать изъятые id из карты счётчиков и реестра заточки. Возвращает {refund, removed}. */
function purgeCountMap(map, plusMap) {
  const out = { refund: 0, removed: 0 };
  if (!map || typeof map !== 'object') return out;
  for (const id of Object.keys(RETIRED_PRICES)) {
    if (plusMap && Object.prototype.hasOwnProperty.call(plusMap, id)) delete plusMap[id];
    if (!Object.prototype.hasOwnProperty.call(map, id)) continue;
    const n = Math.max(0, Math.floor(+map[id]) || 0);
    delete map[id];
    out.refund += refundOf(id, n);
    out.removed += n;
  }
  return out;
}

function credit(map, amount) {
  if (!map || amount <= 0) return;
  const cur = Math.max(0, Number(map[CURRENCY]) || 0);
  map[CURRENCY] = Math.min(CURRENCY_CAP, cur + amount);
}

/**
 * Профиль игрока: сумка + экип → медь в сумку, личный склад → медь на склад.
 * Идемпотентно: повторный вызов на уже очищенном профиле ничего не делает.
 */
function purgePlayer(p) {
  const res = { refund: 0, removed: 0 };
  if (!p) return res;
  const bag = purgeCountMap(p.inv, p.plusById);
  if (p.equip && typeof p.equip === 'object') {
    for (const slot of Object.keys(p.equip)) {
      const piece = p.equip[slot];
      const tid = piece && String(piece.templateId || piece.id || '').toLowerCase();
      if (!tid || !isRetired(tid)) continue;
      delete p.equip[slot];
      bag.refund += refundOf(tid, 1);
      bag.removed += 1;
    }
  }
  if (bag.refund > 0) {
    if (!p.inv) p.inv = Object.create(null);
    credit(p.inv, bag.refund);
  }
  const wh = purgeCountMap(p.wh, p.whPlusById);
  if (wh.refund > 0) credit(p.wh, wh.refund);
  res.refund = bag.refund + wh.refund;
  res.removed = bag.removed + wh.removed;
  return res;
}

/** Клановый склад: изъятые вещи → медь на тот же склад. */
function purgeClanWarehouse(c) {
  if (!c || !c.wh) return { refund: 0, removed: 0 };
  const r = purgeCountMap(c.wh, c.whPlusById);
  if (r.refund > 0) credit(c.wh, r.refund);
  return r;
}

module.exports = {
  RETIRED_PRICES,
  isRetired,
  refundOf,
  purgePlayer,
  purgeClanWarehouse
};
