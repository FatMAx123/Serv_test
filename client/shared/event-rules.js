// ============================================================
//  SHARED / EVENT-RULES.JS — мировые события 1–20 (L2 C1).
//
//  C1 на острове 1–20 не имеет Seven Signs / Festival. Живой контур:
//    1) анонс уникальных рейдов фазы 1 (как «Raid boss has appeared»);
//    2) короткий набег «Прорыв трубы» — пачка полевых мобов, НЕ второй
//       drill_worm (уникальный RB, 1 спот, 4 ч).
//  Дроп набега идёт через rollMobLoot({ event:true }) → EVENT_*_MULT.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EVENT_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var PHASE1_RAIDS = {
    boiler_exploder_b1: 1,
    grinder_ripper_m9: 1,
    vacuum_cyclone_3000: 1,
    chainsaw_lumberjack_x14: 1,
    fridge_frost_sever: 1,
    steam_roller_bogatyr: 1,
    scrap_tyrant: 1,
    drill_worm: 1,
    press_hammer: 1,
    boiler_sovereign: 1,
    green_protocol: 1,
    cruna_overseer: 1,
    rezdiq_colonel: 1,
    steel_colossus: 1
  };

  var EVENTS = {
    scrap_stampede: {
      id: 'scrap_stampede',
      name: 'Бунт утилизаторов',
      kind: 'invasion',
      intervalSec: 2 * 3600,
      durationSec: 15 * 60,
      debugIntervalSec: 60,
      debugDurationSec: 90,
      minLvl: 5,
      maxLvl: 11,
      packRadius: 16,
      pack: [
        { mobId: 'steam_hound', n: 4, champion: true },
        { mobId: 'junk_magpie', n: 3 },
        { mobId: 'survey_beacon', n: 2 }
      ],
      regionNameHints: [
        'холм', 'астард', 'междуреч', 'свалк', 'западн'
      ]
    },
    pipe_burst: {
      id: 'pipe_burst',
      name: 'Прорыв паровой трубы',
      kind: 'invasion',
      // Не drill_worm: уникальный рейд уже на 4-часовом споте.
      intervalSec: 2 * 3600,
      durationSec: 15 * 60,
      debugIntervalSec: 60,
      debugDurationSec: 90,
      minLvl: 12,
      maxLvl: 18,
      packRadius: 16,
      pack: [
        { mobId: 'repair_drone', n: 3, champion: true },
        { mobId: 'oblivion_walker', n: 4 },
        { mobId: 'memory_scrubber', n: 3 }
      ],
      regionNameHints: [
        'забвен', 'свалк', 'завод', 'полигон',
        'химзавод', 'барак', 'крепост', 'пасек', 'сад'
      ]
    },
    chemical_leak: {
      id: 'chemical_leak',
      name: 'Выброс Зелёной порчи',
      kind: 'invasion',
      intervalSec: 2 * 3600,
      durationSec: 15 * 60,
      debugIntervalSec: 60,
      debugDurationSec: 90,
      minLvl: 15,
      maxLvl: 22,
      packRadius: 18,
      pack: [
        { mobId: 'green_fault_drone', n: 4, champion: true },
        { mobId: 'acid_sprayer', n: 3 },
        { mobId: 'green_steam_wraith', n: 2 },
        { mobId: 'spill_containment', n: 1 }
      ],
      regionNameHints: [
        'хим', 'руин', 'котлов', 'забвен', 'предел'
      ]
    }
  };

  function isPhase1Raid(mobId) {
    return !!PHASE1_RAIDS[String(mobId || '')];
  }

  function getEvent(id) {
    if (id == null) return null;
    var k = String(id);
    return Object.prototype.hasOwnProperty.call(EVENTS, k) ? EVENTS[k] : null;
  }

  function invasionKey(id) {
    return 'inv:' + String(id || 'pipe_burst');
  }

  function raidKey(mobId) {
    return 'raid:' + String(mobId || '');
  }

  function zoneLvl(h) {
    if (!h) return [0, 0];
    var lo = (h.lvl && h.lvl[0] != null) ? (h.lvl[0] | 0)
      : (h.levelRange && h.levelRange[0] != null) ? (h.levelRange[0] | 0) : 0;
    var hi = (h.lvl && h.lvl[1] != null) ? (h.lvl[1] | 0)
      : (h.levelRange && h.levelRange[1] != null) ? (h.levelRange[1] | 0) : lo;
    if (hi < lo) hi = lo;
    return [lo, hi];
  }

  function isEventHunt(h, ev) {
    if (!h) return false;
    if (h.kind === 'territory' || h.peace || h.arena) return false;
    if (h.hunt === false) return false;
    var lv = zoneLvl(h);
    if (!lv[0] && !lv[1]) return false;
    var minL = ev && ev.minLvl != null ? (ev.minLvl | 0) : 12;
    var maxL = ev && ev.maxLvl != null ? (ev.maxLvl | 0) : 20;
    if (lv[1] < minL || lv[0] > maxL) return false;
    return true;
  }

  function hintMatch(h, hints) {
    if (!hints || !hints.length) return true;
    var name = String((h && h.name) || '').toLowerCase();
    for (var i = 0; i < hints.length; i++) {
      if (hints[i] && name.indexOf(String(hints[i]).toLowerCase()) >= 0) return true;
    }
    return false;
  }

  function pickHunt(hunts, ev, rnd) {
    hunts = Array.isArray(hunts) ? hunts : [];
    var pool = [];
    for (var i = 0; i < hunts.length; i++) {
      if (isEventHunt(hunts[i], ev)) pool.push(hunts[i]);
    }
    var hinted = [];
    for (var j = 0; j < pool.length; j++) {
      if (hintMatch(pool[j], ev && ev.regionNameHints)) hinted.push(pool[j]);
    }
    if (hinted.length) pool = hinted;
    if (!pool.length) return null;
    var r = typeof rnd === 'function' ? rnd() : Math.random();
    if (r < 0) r = 0;
    if (r >= 1) r = 0.999999;
    return pool[Math.floor(r * pool.length)] || null;
  }

  function packSize(ev) {
    var n = 0;
    var pack = (ev && ev.pack) || [];
    for (var i = 0; i < pack.length; i++) n += (pack[i].n | 0);
    if (n < 1) n = 1;
    if (n > 12) n = 12;
    return n;
  }

  function expandPack(ev, zoneLo, zoneHi, rngInt) {
    var out = [];
    var pack = (ev && ev.pack) || [];
    var ri = typeof rngInt === 'function' ? rngInt : function (a, b) {
      return a + Math.floor(Math.random() * (b - a + 1));
    };
    var lo = zoneLo | 0;
    var hi = zoneHi | 0;
    if (hi < lo) hi = lo;
    for (var i = 0; i < pack.length && out.length < 12; i++) {
      var row = pack[i];
      if (!row || !row.mobId) continue;
      if (isPhase1Raid(row.mobId)) continue;
      var n = Math.max(0, row.n | 0);
      for (var k = 0; k < n && out.length < 12; k++) {
        out.push({
          mobId: String(row.mobId),
          champion: !!row.champion,
          level: ri(lo, hi)
        });
      }
    }
    return out;
  }

  function packOffset(i, n, radius, rnd) {
    n = Math.max(1, n | 0);
    radius = +radius || 16;
    var rfn = typeof rnd === 'function' ? rnd : Math.random;
    var ang = (i / n) * Math.PI * 2 + (rfn() - 0.5) * 0.5;
    var rad = radius * (0.3 + rfn() * 0.7);
    return { dx: Math.cos(ang) * rad, dz: Math.sin(ang) * rad };
  }

  /** Первый старт — после полного интервала от now0 (не в момент бута). */
  function shouldStart(now, lastAt, intervalSec) {
    intervalSec = +intervalSec || 0;
    if (intervalSec <= 0) return false;
    if (!lastAt) return false;
    return (now - lastAt) >= intervalSec * 1000;
  }

  function intervalOf(ev, debug) {
    if (!ev) return 0;
    return debug ? (ev.debugIntervalSec || 60) : (ev.intervalSec || 7200);
  }

  function durationOf(ev, debug) {
    if (!ev) return 0;
    return debug ? (ev.debugDurationSec || ev.durationSec || 90) : (ev.durationSec || 900);
  }

  return {
    EVENTS: EVENTS,
    PHASE1_RAIDS: PHASE1_RAIDS,
    isPhase1Raid: isPhase1Raid,
    getEvent: getEvent,
    invasionKey: invasionKey,
    raidKey: raidKey,
    zoneLvl: zoneLvl,
    isEventHunt: isEventHunt,
    pickHunt: pickHunt,
    packSize: packSize,
    expandPack: expandPack,
    packOffset: packOffset,
    shouldStart: shouldStart,
    intervalOf: intervalOf,
    durationOf: durationOf
  };
});
