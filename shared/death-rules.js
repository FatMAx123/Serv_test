// ============================================================
//  SHARED / DEATH-RULES.JS — дроп вещей при смерти (Classic C1).
//
//  Канонический onDieDropItem — ДВЕ независимые таблицы, не «только карма»:
//    PLAYER — смерть от NPC, уровень > Lucky (у нас 4 → дроп с 5+).
//    KARMA  — karma>0 и pk>=KARMA_PK_LIMIT, любой убийца; перекрывает PLAYER.
//  Мирная зона и Lucky (level <= keepUntil) — вещей нет. Медные детали и квест не падают.
//  Падает весь стак / вся надетая штука (ItemInstance), не 10 %.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DEATH_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var ADENA_ID = 'copper_parts';
  var LUCKY_UNTIL = 4;
  var KARMA_PK_LIMIT = 5;

  // l2jfrozen / L2J Interlude defaults (percent, Rnd.get(100) < n).
  var PLAYER = {
    dropLimit: 3,
    rateDrop: 5,
    rateItem: 70,
    rateEquip: 25,
    rateWeapon: 5
  };
  var KARMA = {
    dropLimit: 10,
    rateDrop: 40,
    rateItem: 50,
    rateEquip: 40,
    rateWeapon: 10
  };

  var EQUIP_ORDER = [
    'weapon', 'shield', 'chest', 'legs', 'head', 'helmet',
    'gloves', 'hands', 'feet', 'boots',
    'necklace', 'earring_l', 'earring_r', 'ring_l', 'ring_r',
    'bracelet', 'accessory'
  ];

  var BAD_KEY_RE = /^(?:__proto__|constructor|prototype)$/;
  function isBadKey(k) { return BAD_KEY_RE.test(String(k)); }

  function isAdena(id, meta) {
    var s = String(id || '').toLowerCase();
    if (s === ADENA_ID || s === 'adena') return true;
    if (!meta) return false;
    var t = String(meta.type || '').toLowerCase();
    return t === 'adena' || !!meta.currency;
  }

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

  function isQuest(meta) {
    if (!meta) return false;
    if (meta.quest) return true;
    return String(meta.type || '').toLowerCase() === 'quest';
  }

  function isDropable(id, meta) {
    var s = String(id || '').toLowerCase();
    if (!s || isBadKey(s)) return false;
    if (isAdena(s, meta)) return false;
    if (isQuest(meta)) return false;
    if (isDevice(s, meta)) return false;
    if (meta && (meta.nodrop || meta.noDrop || meta.undroppable || meta.notDropable || meta.bound || meta.hero || meta.shadow)) return false;
    return true;
  }

  function kindOf(meta, equipped) {
    if (!equipped) return 'item';
    var t = String((meta && meta.type) || '').toLowerCase();
    var slot = String((meta && meta.slot) || '').toLowerCase();
    var wc = String((meta && meta.weaponClass) || '').toLowerCase();
    if (t === 'weapon' || slot === 'weapon' || wc) return 'weapon';
    return 'equip';
  }

  function skillLuckyUntil(tpl) {
    if (!tpl) return 0;
    var n = 0;
    if (tpl.deathKeepItemsUntilLevel) n = Math.max(n, +tpl.deathKeepItemsUntilLevel || 0);
    if (tpl.lucky) n = Math.max(n, LUCKY_UNTIL);
    var ranks = tpl.ranks;
    if (Array.isArray(ranks)) {
      for (var i = 0; i < ranks.length; i++) {
        var r = ranks[i];
        if (!r) continue;
        if (r.lucky) n = Math.max(n, LUCKY_UNTIL);
        if (r.deathKeepItemsUntilLevel) n = Math.max(n, +r.deathKeepItemsUntilLevel || 0);
      }
    }
    return n;
  }

  /**
   * Порог Lucky. C1: getLevel()>4 на PLAYER-таблице — пол 4 даже без скилла.
   * Скилл может поднять (Classic Lucky до 9); у нас оба стартера = 4.
   */
  function luckyUntil(skills, skillGet, rootClass) {
    var n = LUCKY_UNTIL;
    if (skills && typeof skillGet === 'function') {
      var keys = Object.keys(skills);
      for (var i = 0; i < keys.length; i++) {
        n = Math.max(n, skillLuckyUntil(skillGet(keys[i])));
      }
    }
    if (rootClass === 'engineer' || rootClass === 'operator') {
      n = Math.max(n, LUCKY_UNTIL);
    }
    return n;
  }

  /** Java Rnd.get(100) < chance. rng() → [0, 1). */
  function pct(rng, chance) {
    chance = +chance || 0;
    if (chance <= 0) return false;
    if (chance >= 100) return true;
    var roll = Math.floor((typeof rng === 'function' ? rng() : Math.random()) * 100);
    return roll < chance;
  }

  function pickTable(ctx) {
    ctx = ctx || {};
    var keep = ctx.keepItemsUntil | 0;
    if (keep <= 0) keep = LUCKY_UNTIL;
    if (ctx.peace) return { table: null, rates: null, reason: 'peace', keepItemsUntil: keep };
    var level = ctx.level | 0;
    if (level <= keep) {
      return { table: null, rates: null, reason: 'lucky', keepItemsUntil: keep };
    }
    if ((ctx.karma | 0) > 0 && (ctx.pk | 0) >= KARMA_PK_LIMIT) {
      return { table: 'karma', rates: KARMA, reason: 'karma', keepItemsUntil: keep };
    }
    if (ctx.byMob) {
      return { table: 'player', rates: PLAYER, reason: 'mob', keepItemsUntil: keep };
    }
    return {
      table: null,
      rates: null,
      reason: ctx.byPlayer ? 'pvp' : 'none',
      keepItemsUntil: keep
    };
  }

  function pushCandidate(out, id, count, plus, equipped, slot, meta) {
    if (!isDropable(id, meta)) return;
    var n = Math.floor(+count) || 0;
    if (n <= 0) return;
    out.push({
      id: id,
      count: n,
      plus: Math.max(0, Math.floor(Number(plus)) || 0),
      equipped: !!equipped,
      slot: equipped ? slot : null,
      kind: kindOf(meta, !!equipped)
    });
  }

  function listCandidates(inv, equip, plusById, itemMeta) {
    var out = [];
    var seenSlot = Object.create(null);
    var metaOf = typeof itemMeta === 'function' ? itemMeta : function () { return null; };

    function addEquip(slot) {
      if (!equip || seenSlot[slot]) return;
      var e = equip[slot];
      if (!e || typeof e !== 'object') return;
      seenSlot[slot] = true;
      var id = String(e.templateId || e.id || '').toLowerCase();
      if (!id || isBadKey(id)) return;
      var pl = Math.max(0, Math.floor(Number(e.plus))) || 0;
      pushCandidate(out, id, 1, pl, true, slot, metaOf(id));
    }

    for (var i = 0; i < EQUIP_ORDER.length; i++) addEquip(EQUIP_ORDER[i]);
    if (equip) {
      var slots = Object.keys(equip);
      for (var s = 0; s < slots.length; s++) addEquip(slots[s]);
    }

    var keys = Object.keys(inv || {}).sort();
    for (var k = 0; k < keys.length; k++) {
      var id = String(keys[k] || '').toLowerCase();
      if (!id || isBadKey(id)) continue;
      var n = Math.max(0, Math.floor(Number(inv[keys[k]]))) || 0;
      var rawPlus = plusById ? (plusById[id] != null ? plusById[id] : plusById[keys[k]]) : 0;
      var plus = Math.max(0, Math.floor(Number(rawPlus))) || 0;
      pushCandidate(out, id, n, plus, false, null, metaOf(id));
    }
    return out;
  }

  /**
   * Чистый ролл. Не мутирует инвентарь.
   * state: { inv, equip, plusById, skills, level, karma, pk }
   * ctx:   { byMob, byPlayer, peace, skillGet, rootClass, itemMeta }
   */
  function rollDeathDrops(state, ctx, rng) {
    rng = rng || Math.random;
    state = state || {};
    ctx = ctx || {};
    var keep = luckyUntil(state.skills, ctx.skillGet, ctx.rootClass);
    var pick = pickTable({
      peace: !!ctx.peace,
      level: state.level,
      karma: state.karma,
      pk: state.pk,
      byMob: !!ctx.byMob,
      byPlayer: !!ctx.byPlayer,
      keepItemsUntil: keep
    });
    var out = {
      table: pick.table,
      reason: pick.reason,
      keepItemsUntil: keep,
      dropped: []
    };
    if (!pick.table || !pick.rates) return out;
    if (!pct(rng, pick.rates.rateDrop)) {
      out.reason = 'rate';
      return out;
    }
    var list = listCandidates(state.inv, state.equip, state.plusById, ctx.itemMeta);
    var limit = pick.rates.dropLimit | 0;
    for (var i = 0; i < list.length && out.dropped.length < limit; i++) {
      var c = list[i];
      var ch = pick.rates.rateItem;
      if (c.kind === 'weapon') ch = pick.rates.rateWeapon;
      else if (c.kind === 'equip') ch = pick.rates.rateEquip;
      if (pct(rng, ch)) out.dropped.push(c);
    }
    return out;
  }

  return {
    ADENA_ID: ADENA_ID,
    LUCKY_UNTIL: LUCKY_UNTIL,
    KARMA_PK_LIMIT: KARMA_PK_LIMIT,
    PLAYER: PLAYER,
    KARMA: KARMA,
    EQUIP_ORDER: EQUIP_ORDER,
    isAdena: isAdena,
    isQuest: isQuest,
    isDevice: isDevice,
    CLASS_DEVICE_IDS: CLASS_DEVICE_IDS,
    isDropable: isDropable,
    kindOf: kindOf,
    luckyUntil: luckyUntil,
    pct: pct,
    pickTable: pickTable,
    listCandidates: listCandidates,
    rollDeathDrops: rollDeathDrops
  };
});
