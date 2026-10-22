// ============================================================
//  SERVER / CORE / PLAYER.JS
//  Доменная модель персонажа (Player), расчет боевых характеристик,
//  управление экипировкой, приборами, баффами, весом и сериализация.
//  Декомпозиция монолита server.js — Фаза 2 (Core Invariants 100% Preserved).
// ============================================================
'use strict';

const path = require('path');
const CH = require('../../shared/char-rules.js');
const CS = require('../../shared/class-system.js');
const ITEMS = require('../../shared/item-db.js');
const SK = require('../../shared/skill-db.js');
const L2 = require('../../shared/l2-combat.js');
const GR = require('../../shared/grade-rules.js');
const BR = require('../../shared/buff-rules.js');
const WR = require('../../shared/weight-rules.js');
const QD = require('../../shared/quest-db.js');
const COS = require('../../shared/cosmetics-db.js');
const LR = require('../../shared/loot-rules.js');
const GEO = require('../../shared/geo.js');
const WM = require('../../shared/world-metrics.js');
const EXP = require('../../shared/l2-exp-table.js');
const SEC = require('../security-config.js');
const PlayerDb = require('../player-db.js');
const { normalizePlusRegistry } = require('../handlers/item-plus-utils.js');
const { isGM } = require('../handlers/gm-handler.js');

// ------------------------------------------------------------
//  Константы и фильтры безопасности
// ------------------------------------------------------------
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function isBadKey(k) { return BAD_KEYS.has(String(k)); }

const ATK_INTERVAL_SLACK = 0.92;
const ATK_INTERVAL_MIN_MS = 120;
const MOVE_TOLERANCE = 1.35;
const MOVE_BURST_SEC = 1.5;

const SYNTHETIC_BOTS_ALLOWED = process.env.STRESS_TEST === '1' || Boolean(process.env.STRESS_SECRET) || (SEC && typeof SEC.insecureDev === 'function' && SEC.insecureDev());
function isSyntheticBot(yid) {
  if (!yid || !SYNTHETIC_BOTS_ALLOWED) return false;
  const s = String(yid);
  return s.startsWith('stress_bot_') || s.startsWith('bot_uniq_') || s.startsWith('bot3k_');
}

/** Безопасный доступ к справочнику: TABLE['constructor'] возвращал функцию. */
function tableGet(table, key) {
  if (!table || key == null) return undefined;
  const k = String(key);
  if (isBadKey(k)) return undefined;
  return Object.prototype.hasOwnProperty.call(table, k) ? table[k] : undefined;
}

function safeNum(v, def, min, max) {
  if (v == null || v === '') return def;
  const n = +v;
  if (!Number.isFinite(n)) return def;
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}

/** Плоская карта без прототипа: {id: number}. */
function safeCountMap(src) {
  const out = Object.create(null);
  if (!src || typeof src !== 'object') return out;
  for (const k of Object.keys(src)) {
    if (isBadKey(k)) continue;
    const n = Math.floor(+src[k]);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

/** Карта экипа без прототипа: {slot: {templateId, ...}}. */
function safeEquipMap(src) {
  const out = Object.create(null);
  if (!src || typeof src !== 'object') return out;
  for (const k of Object.keys(src)) {
    if (isBadKey(k)) continue;
    const v = src[k];
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const item = Object.create(null);
    for (const ik of Object.keys(v)) {
      if (isBadKey(ik)) continue;
      item[ik] = v[ik];
    }
    out[k] = item;
  }
  return out;
}

/** Белый список слотов экипировки (H9). Слот определяется только шаблоном. */
const EQUIP_SLOTS = new Set([
  'weapon', 'shield', 'chest', 'legs', 'head', 'gloves', 'boots',
  'necklace', 'bracelet', 'earring', 'title', 'costume'
]);

function equipSlotForTpl(tpl) {
  if (!tpl || typeof tpl !== 'object') return null;
  let s = String(tpl.slot || '').toLowerCase();
  if (s === 'ring' || s === 'ring_l' || s === 'ring_r') s = 'bracelet';
  if (!EQUIP_SLOTS.has(s)) return null;
  const type = String(tpl.type || '').toLowerCase();
  if (s === 'title' && type !== 'title') return null;
  if (s === 'costume' && type !== 'costume') return null;
  if (s === 'weapon' && type !== 'weapon') return null;
  return s;
}

function sanitizeEquipSlots(p) {
  if (!p || !p.equip) return 0;
  let fixed = 0;
  for (const slot of Object.keys(p.equip)) {
    const piece = p.equip[slot];
    const tid = piece && String(piece.templateId || piece.id || '').toLowerCase();
    if (!tid || isBadKey(tid)) { delete p.equip[slot]; fixed++; continue; }
    const tpl = ITEMS.get(tid);
    if (!tpl) continue;
    const want = equipSlotForTpl(tpl);
    if (want === slot) continue;
    fixed++;
    delete p.equip[slot];
    if (want && !p.equip[want]) { p.equip[want] = piece; continue; }
    const had = (p.inv[tid] | 0);
    p.inv[tid] = had + 1;
    const pl = (piece.plus | 0) || 0;
    if (pl > 0 && had === 0) p.plusById[tid] = pl;
    else if (had > 0 && (p.plusById[tid] | 0) < pl) p.plusById[tid] = pl;
  }
  if (fixed) console.warn('[equip] профиль', p.yid, 'исправлено слотов:', fixed);
  return fixed;
}

/** Карта скиллов без прототипа: {skillId: rank}. */
function safeSkillMap(src) {
  const out = Object.create(null);
  if (!src || typeof src !== 'object') return out;
  for (const k of Object.keys(src)) {
    if (isBadKey(k)) continue;
    const n = Math.floor(+src[k]);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

/** Список друзей: [{yid, name}]. */
const MAX_FRIENDS = 64;
function safeFriendList(src) {
  const out = [];
  if (!Array.isArray(src)) return out;
  const seen = new Set();
  for (const raw of src) {
    if (out.length >= MAX_FRIENDS) break;
    if (!raw) continue;
    const yid = String(raw.yid == null ? raw : raw.yid).slice(0, 64);
    if (!yid || isBadKey(yid) || seen.has(yid)) continue;
    seen.add(yid);
    out.push({ yid: yid, name: sanitizeCharName(raw.name) || yid.slice(0, 16) });
  }
  return out;
}

const NAME_RE = /^[\w\u0400-\u04FF\- ]+$/;
function sanitizeCharName(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[\u0000-\u001f\u007f-\u009f\u00a0\u2000-\u200f\u2028-\u202f\u3000]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim().slice(0, 16);
  if (s.length < 2) return null;
  if (!NAME_RE.test(s)) return null;
  if (CS && typeof CS.isReservedCharName === 'function' && CS.isReservedCharName(s)) return null;
  return s;
}

// ------------------------------------------------------------
//  Приборы инженера (серверное состояние)
// ------------------------------------------------------------
function safeDevices(src, equip, level) {
  const out = Object.create(null);
  const lvlCap = ITEMS.deviceLevelCap(level);
  const shellCap = ITEMS.shellIndexCap(ITEMS.RESONATOR_SHELL_LADDER, level);
  const casingCap = ITEMS.shellIndexCap(ITEMS.NANO_CASING_LADDER, level);
  const num = (v, def) => {
    const n = Math.floor(+v);
    return Number.isFinite(n) ? n : def;
  };
  const s = (src && typeof src === 'object' && !Array.isArray(src)) ? src : null;
  const res = (!s && equip && typeof equip === 'object') ? equip.necklace : null;
  const br = (!s && equip && typeof equip === 'object')
    ? (equip.bracelet || equip.ring_l || equip.ring_r) : null;
  let circuit = s ? num(s.circuit != null ? s.circuit : s.valve, 1) : num(res && (res.circuitLevel != null ? res.circuitLevel : (res.valveLevel != null ? res.valveLevel : res.resonatorLevel)), 1);
  let nano = s ? num(s.nano != null ? s.nano : s.wrist, 1) : num(br && (br.nanoLevel != null ? br.nanoLevel : br.wristLevel), 1);
  let shell = s ? num(s.shell, 0) : num(res && res.shellIndex, 0);
  let casing = s ? num(s.casing, 0) : num(br && br.casingIndex, 0);
  out.circuit = Math.max(1, Math.min(lvlCap, circuit));
  out.nano = Math.max(1, Math.min(lvlCap, nano));
  out.shell = Math.max(0, Math.min(shellCap, shell));
  out.casing = Math.max(0, Math.min(casingCap, casing));
  out.valve = out.circuit;
  out.wrist = out.nano;
  return out;
}

function stampDeviceFields(p, eq, tpl) {
  if (!eq || !tpl || !p.devices) return;
  if (ITEMS.isResonatorTpl(tpl)) {
    eq.circuitLevel = p.devices.circuit;
    eq.valveLevel = p.devices.circuit;
    eq.resonatorLevel = p.devices.circuit;
    eq.shellIndex = p.devices.shell;
  } else if (ITEMS.isNanoBraceletTpl(tpl)) {
    eq.nanoLevel = p.devices.nano;
    eq.wristLevel = p.devices.nano;
    eq.casingIndex = p.devices.casing;
  }
}

function syncDevicesToEquip(p) {
  if (!p || !p.equip || !p.devices) return;
  for (const slot of Object.keys(p.equip)) {
    const eq = p.equip[slot];
    const tpl = eq && ITEMS.get(String(eq.templateId || eq.id || '').toLowerCase());
    if (tpl) stampDeviceFields(p, eq, tpl);
  }
}

// ------------------------------------------------------------
//  Сетевая отправка (DI callback)
// ------------------------------------------------------------
let _defaultSend = null;
function setPlayerSend(fn) {
  _defaultSend = fn;
}
function playerSend(p, msg) {
  if (typeof p.send === 'function') return p.send(msg);
  if (_defaultSend) return _defaultSend(p, msg);
}

// ------------------------------------------------------------
//  Доменная модель Player
// ------------------------------------------------------------
class Player {
  constructor(pid, yid, pr, opts) {
    this.pid = pid; this.yid = yid;
    this.entityKey = 'p' + pid;
    this.transformSlot = -1;
    this.charId = CH.normalizeCharId((opts && opts.charId) || (pr && pr.charId));
    this.createdAt = Math.max(0, Math.floor(+(pr && pr.createdAt)) || 0);
    this.name = sanitizeCharName(pr && pr.name) || 'Operator';
    this.dev = !!(opts && opts.dev);

    // AccessLevel
    const dbLvl = (PlayerDb && PlayerDb.getAccessLevel) ? PlayerDb.getAccessLevel(this.yid, this.name, 0) : 0;
    const prLvl = (pr && pr.accessLevel != null) ? Math.max(0, Math.min(100, parseInt(pr.accessLevel, 10) || 0)) : 0;
    const gmStrict = SEC.isProd() || process.env.GM_STRICT === '1';
    const isPrGm = !gmStrict && !!(pr && (pr.gm === true || pr.accessLevel >= 50));
    this.accessLevel = dbLvl >= 50 ? dbLvl : (!gmStrict && prLvl >= 50 ? prLvl : (isPrGm ? 100 : 0));
    this.gm = isPrGm || isGM(this);
    if (this.gm && this.accessLevel < 50) {
      this.accessLevel = 100;
    }

    this.level = safeNum(pr && pr.level, 1, 1, 200);
    this.exp = safeNum(pr && pr.exp, 0, 0);
    this.sp = safeNum(pr && pr.sp, 0, 0);
    this.race = CS.normalizeRace((pr && pr.race) || 'human');
    this.gender = CS.normalizeGender((pr && pr.gender) || 'male');
    this.cls = CS.getClass(pr && pr.cls) ? pr.cls : CS.normalizeBaseClass((pr && pr.cls) || 'operator');
    this.classTier = (CS.getClass(this.cls) || {}).tier || 0;
    this.classHistory = Array.isArray(pr && pr.classHistory) && pr.classHistory.length
      ? pr.classHistory.slice()
      : [this.cls];
    this.x = (pr && pr.x === 0 && pr.z === 0) ? -107.5 : safeNum(pr && pr.x, -107.5, -20000, 20000);
    this.z = (pr && pr.x === 0 && pr.z === 0) ? -246.4 : safeNum(pr && pr.z, -246.4, -20000, 20000);
    this.y = GEO.ready() ? GEO.standY(this.x, this.z, isSyntheticBot((pr && pr.yid) || this.yid) ? null : safeNum(pr && pr.y, 0, -500, 2000)) : safeNum(pr && pr.y, 0, -500, 2000);
    this.karma = safeNum(pr && pr.karma, 0, 0);
    this.pk = safeNum(pr && pr.pk, 0, 0);
    this.inv = safeCountMap(pr && pr.inv);
    this.equip = safeEquipMap(pr && pr.equip);
    this.quests = QD.normalizeState(pr && pr.quests);
    this.devices = safeDevices(pr && pr.devices, pr && pr.equip, this.level);
    this.plusById = safeCountMap(pr && pr.plusById);
    this.wh = safeCountMap(pr && pr.wh);
    this.whPlusById = safeCountMap(pr && pr.whPlusById);

    normalizePlusRegistry(this);
    sanitizeEquipSlots(this);

    this.friends = safeFriendList(pr && pr.friends);
    this.clanId = null;
    this.learned = new Set(Array.isArray(pr && pr.learned) ? pr.learned.filter(id => typeof id === 'string' && !isBadKey(id)) : []);
    this.skills = safeSkillMap(pr && pr.skills);
    this.guestTokenHash = (pr && pr.guestTokenHash) || null;
    this.guestTokenHashes = (pr && Array.isArray(pr.guestTokenHashes)) ? pr.guestTokenHashes.filter(h => typeof h === 'string').slice(0, 20) : [];
    this.appearance = (pr && pr.appearance) ? COS.normalizeAppearance(pr.appearance) : null;
    this.cosmetics = COS.normalize((pr && pr.cosmetics) || null);

    // Миграция старого титула
    const legTitle = (this.cosmetics && (this.cosmetics.title || this.cosmetics.titleName)) || null;
    if (legTitle && (!this.equip || !this.equip.title)) {
      const s = String(legTitle).toLowerCase();
      let itemId = 'title_tralalero';
      if (s.includes('bombardi')) itemId = 'title_bombardiro';
      else if (s.includes('tung')) itemId = 'title_tung_tung';
      else if (s.includes('ballerina') || s.includes('cappuccino')) itemId = 'title_ballerina_cap';
      else if (s.includes('skibidi')) itemId = 'title_skibidi_steam';
      else if (s.includes('pioneer')) itemId = 'title_pioneer';
      else if (s.includes('master')) itemId = 'title_master';
      else if (ITEMS && typeof ITEMS.get === 'function' && ITEMS.get('title_' + s)) itemId = 'title_' + s;
      if (!this.equip) this.equip = Object.create(null);
      this.equip.title = { id: itemId, templateId: itemId };
      this.cosmetics.title = null;
      this.cosmetics.titleName = null;
    }

    syncDevicesToEquip(this);

    const gear0 = ITEMS.gearFromEquip(this.equip, {
      isMagePath: CS.rootClass(this.cls) === 'engineer'
    });
    const st = CS.statsAtLevel(this.cls, this.level, gear0);
    this.maxHp = Math.floor((st.maxHp || 100) + (gear0.hpBonus || 0));
    this.maxEnergy = Math.floor((st.maxEnergy || 50) + (gear0.energyBonus || 0));
    this.speedBase = Math.max(1, +st.speed || 7.5);
    this.hp = Math.min((pr && pr.hp != null) ? pr.hp : this.maxHp, this.maxHp);
    this.energy = Math.min((pr && pr.energy != null) ? pr.energy : this.maxEnergy, this.maxEnergy);

    this.dead = !!(pr && pr.dead);
    if (this.dead) this.hp = 0;
    this.region = (WM.regionAt(this.x, this.z) || {}).id || 'village';
    this.known = new Set();
    this.knownBy = new Set();
    this.cd = {};
    this.rate = {};
    this.seq = 0;
    this.flagUntil = 0;
    this.partyId = null;
    this.duel = null;
    this._duelFrom = null;
    this._duelTo = null;
    this.buffs = [];
    this.debuffs = [];
    this._combatPack = null;
    this._combatPackExpiry = 0;
    this.store = null;
    this.trade = null;
    this.sitting = false;
    this.walking = false;
    this.moving = false;
    this._lastMoveAt = 0;

    ensureStarterSkills(this);
  }

  get combatPack() {
    const now = Date.now();
    if (this._combatPack && now < this._combatPackExpiry) {
      return this._combatPack;
    }

    const gear = ITEMS.gearFromEquip(this.equip || {}, {
      isMagePath: CS.rootClass(this.cls) === 'engineer'
    });
    const st = CS.statsAtLevel(this.cls, this.level, gear);
    const primary = st.primary || {};
    let pAtk = st.pAtk, pDef = st.pDef, cAtk = st.cAtk, cDef = st.cDef;
    let critRate = st.critRate, accuracy = st.accuracy, evasion = st.evasion;

    const pas = passiveBonuses(this);
    pAtk = Math.floor(pAtk * (1 + (pas.attackPercent || 0)) + (pas.pAtkFlat || 0));
    pDef = Math.floor(pDef * (1 + (pas.defensePercent || 0)) + (pas.pDefFlat || 0));
    cAtk = Math.floor(cAtk * (1 + (pas.cAtkPercent || 0)) + (pas.cAtkFlat || 0));
    cDef = Math.floor(cDef * (1 + (pas.cDefPercent || 0)) + (pas.cDefFlat || 0));
    if (pas.critChance) critRate += (pas.critChance <= 1 ? pas.critChance * 100 : pas.critChance);
    if (pas.evasion) {
      const ev = +pas.evasion;
      evasion += (ev > 0 && ev <= 1) ? Math.round(ev * 100) : Math.round(ev);
    }

    let atkM = 1, defM = 1, spdM = 1, atkSpdM = 1;
    this.buffs = BR.prune(this.buffs, now);
    this.debuffs = BR.prune(this.debuffs, now);
    atkM = BR.foldMult(this.buffs, 'attackMult', now);
    defM = BR.foldMult(this.buffs, 'defenseMult', now);
    spdM = BR.foldMult(this.buffs, 'speedMult', now);
    atkSpdM = BR.foldMult(this.buffs, 'atkSpdMult', now);
    const pDefDebM = BR.pDefMult(this.debuffs, now);
    const accDeb = BR.accFlat(this.debuffs, now);
    pAtk = Math.floor(pAtk * atkM);
    cAtk = Math.floor(cAtk * atkM);
    pDef = Math.floor(pDef * defM * pDefDebM);
    cDef = Math.floor(cDef * defM);
    const maxHp = Math.floor(st.maxHp * (1 + (pas.hpPercent || 0)) + (gear.hpBonus || 0));
    const buffMaxEn = BR.foldAdd ? BR.foldAdd(this.buffs, 'maxEnergyBonus', now) : 0;
    const maxEnergy = Math.floor(
      st.maxEnergy * (1 + (pas.energyPercent || 0)) + (pas.maxEnergyFlat || 0) + (gear.energyBonus || 0) + buffMaxEn
    );

    const wClassPack = gear.weaponClass || st.weaponClass || 'fist';
    const wBase = gear.weaponAtkBase != null ? gear.weaponAtkBase : L2.weaponBaseAtkSpd(wClassPack);
    const isFistPack = (wClassPack === 'fist');
    const pasAtkSpd = (pas.attackSpeed || 0) + (isFistPack ? (pas.fistAtkSpeed || 0) : 0);
    let atkSpdL2 = L2.atkSpdL2(wBase, primary.DEX || 20, (1 + pasAtkSpd) * atkSpdM);
    const wGrade = equippedWeaponGrade(this);
    const aGrade = equippedArmorGrade(this);
    const gradePen = GR.penalty(GR.expertiseRank(this.skills), wGrade, aGrade);
    if (gradePen.accuracy) accuracy = Math.max(1, accuracy + gradePen.accuracy);
    if (accDeb) accuracy = Math.max(1, accuracy + accDeb);
    if (gradePen.atkSpdMult < 1) atkSpdL2 = Math.max(1, atkSpdL2 * gradePen.atkSpdMult);
    const swingSec = L2.swingTimeSec(atkSpdL2);

    const buffCritDmg = BR.foldAdd ? BR.foldAdd(this.buffs, 'critDamageBoost', now) : 0;
    const vampiric = BR.foldAdd ? BR.foldAdd(this.buffs, 'vampiric', now) : 0;
    const stunResist = BR.foldAdd ? BR.foldAdd(this.buffs, 'stunResist', now) : 0;
    const hpRegenFlat = BR.foldAdd ? BR.foldAdd(this.buffs, 'hpRegenFlat', now) : 0;
    const energyRegenFlat = BR.foldAdd ? BR.foldAdd(this.buffs, 'energyRegenFlat', now) : 0;
    const energyRegenMult = BR.foldMult ? BR.foldMult(this.buffs, 'energyRegenMult', now) : 1;
    const adenaMult = BR.foldMult ? BR.foldMult(this.buffs, 'adenaMult', now) : 1;
    const dropMult = BR.foldMult ? BR.foldMult(this.buffs, 'dropMult', now) : 1;
    const spdVal = Math.max(1, (+st.speed || 7.5) * spdM);
    const clsObj = CS.getClass ? CS.getClass(this.cls) : null;

    const pack = {
      pAtk, pDef, cAtk, cDef, mAtk: cAtk, mDef: cDef,
      accuracy, evasion, critRate, critDamage: 2.0 + (pas.critDamage || 0) + buffCritDmg,
      vampiric, stunResist, hpRegenFlat, energyRegenFlat, energyRegenMult, adenaMult, dropMult,
      blockBonus: pas.blockRate || 0,
      rangeBonus: pas.rangeBonus || 0,
      lowHpDefense: pas.lowHpDefense || 0,
      lowHpAttack: pas.lowHpAttack || 0,
      explosiveDamage: pas.explosiveDamage || 0,
      level: this.level, dex: primary.DEX || 20, wit: primary.WIT || 20,
      tier: (clsObj && clsObj.tier != null) ? clsObj.tier : 0,
      primary, maxHp, maxEnergy,
      baseHpReg: st.baseHpReg != null ? st.baseHpReg : 1.5,
      baseMpReg: st.baseMpReg != null ? st.baseMpReg : 0.9,
      weaponClass: wClassPack,
      weaponAtkBase: wBase,
      atkSpdL2: atkSpdL2,
      swingSec: swingSec,
      atkIntervalMs: L2.quantizeCombatMs ? L2.quantizeCombatMs(Math.max(ATK_INTERVAL_MIN_MS, Math.round(swingSec * 1000 * ATK_INTERVAL_SLACK)), 100) : Math.max(ATK_INTERVAL_MIN_MS, Math.round(swingSec * 1000 * ATK_INTERVAL_SLACK)),
      hasShield: !!gear.hasShield,
      shieldDef: gear.shieldDef || 0,
      speedBase: Math.max(1, +st.speed || 7.5),
      speed: spdVal,
      speedL2: Math.round(spdVal * 16),
      gear,
      gradePenalty: gradePen
    };

    let minUntil = Infinity;
    if (Array.isArray(this.buffs)) {
      for (let i = 0; i < this.buffs.length; i++) {
        const u = this.buffs[i] && this.buffs[i].until;
        if (typeof u === 'number' && u > now && u < minUntil) minUntil = u;
      }
    }
    if (Array.isArray(this.debuffs)) {
      for (let i = 0; i < this.debuffs.length; i++) {
        const u = this.debuffs[i] && this.debuffs[i].until;
        if (typeof u === 'number' && u > now && u < minUntil) minUntil = u;
      }
    }

    this._combatPack = pack;
    this._combatPackExpiry = minUntil === Infinity ? (now + 60000) : minUntil;
    return pack;
  }

  get pAtk() { return this.combatPack.pAtk; }
  get pDef() { return this.combatPack.pDef; }
  get cAtk() { return this.combatPack.cAtk; }
  get cDef() { return this.combatPack.cDef; }
  get mAtk() { return this.cAtk; }
  get mDef() { return this.cDef; }
  get isFlagged() { return Date.now() < this.flagUntil; }

  applyClassStats() {
    this._combatPack = null;
    this._combatPackExpiry = 0;
    const pack = this.combatPack;
    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    const enRatio = this.maxEnergy > 0 ? this.energy / this.maxEnergy : 1;
    this.maxHp = pack.maxHp;
    this.maxEnergy = pack.maxEnergy;
    this.hp = Math.max(1, Math.floor(this.maxHp * hpRatio));
    this.energy = Math.max(0, Math.floor(this.maxEnergy * enRatio));
    this.classTier = (CS.getClass(this.cls) || {}).tier || 0;
    this.speedBase = Math.max(1, +pack.speedBase || 7.5);
  }

  resetMoveBudget(optSpd) {
    const spd = optSpd != null ? optSpd : (this._combatPack ? this._combatPack.speed : this.speedBase);
    this._moveBudget = spd * MOVE_TOLERANCE * MOVE_BURST_SEC;
    this._moveBudgetAt = Date.now();
    this._speedViol = 0;
    this._syncSentAt = Date.now();
  }

  profile() {
    return profileOf(this);
  }

  selfPayload(clanTag) {
    return selfPayload(this, clanTag);
  }
}

// ------------------------------------------------------------
//  Сеты и грейды брони/оружия
// ------------------------------------------------------------
function hasRobeSetEquipped(equip) {
  return ITEMS.hasRobeSet ? ITEMS.hasRobeSet(equip) : ITEMS.hasRobe(equip);
}

function namedSetCastBonus(equip) {
  if (!hasRobeSetEquipped(equip)) return 0;
  if (ITEMS.castSpeedSetBonus) return ITEMS.castSpeedSetBonus(equip) || 0;
  return ITEMS.devotionSetPct(equip) || 0;
}

function armorSetBonuses(equip) {
  if (ITEMS.evaluateSets) return ITEMS.evaluateSets(equip || {});
  return null;
}

const SHOT_ITEMS = {
  soulshot_no_grade: { kind: 'ss', mult: 2.0, grade: 'no_grade' },
  soulshot_d: { kind: 'ss', mult: 2.0, grade: 'd' },
  soulshot_c: { kind: 'ss', mult: 2.0, grade: 'c' },
  spiritshot_no_grade: { kind: 'sps', mult: 1.5, grade: 'no_grade' },
  spiritshot_d: { kind: 'sps', mult: 1.5, grade: 'd' },
  spiritshot_c: { kind: 'sps', mult: 1.5, grade: 'c' },
  blessed_spiritshot_no_grade: { kind: 'bsps', mult: 2.0, grade: 'no_grade' },
  blessed_spiritshot_d: { kind: 'bsps', mult: 2.0, grade: 'd' },
  blessed_spiritshot_c: { kind: 'bsps', mult: 2.0, grade: 'c' }
};

function normalizeItemGrade(g) {
  return GR.normalize(g);
}

function equippedWeaponGrade(p) {
  const eq = (p && p.equip) || {};
  const w = eq.weapon || eq.WEAPON;
  if (!w) return 'no_grade';
  if (w.grade) return GR.normalize(w.grade);
  if (w.template && w.template.grade) return GR.normalize(w.template.grade);
  const id = String(w.id || w.templateId || (w.template && w.template.id) || '').toLowerCase();
  if (!id || isBadKey(id)) return 'no_grade';
  try {
    const tpl = ITEMS.get ? ITEMS.get(id) : null;
    if (tpl) return GR.normalize(tpl.grade);
    const rt = ITEMS.resolveTemplate ? ITEMS.resolveTemplate(w) : null;
    if (rt) return GR.normalize(rt.grade);
  } catch (e) { /* ignore */ }
  return 'no_grade';
}

function equippedWeaponShotCount(p, shotKind) {
  const eq = (p && p.equip) || {};
  const w = eq.weapon || eq.WEAPON;
  if (!w) return 1;
  let tpl = null;
  const id = String(w.id || w.templateId || (w.template && w.template.id) || '').toLowerCase();
  if (id && !isBadKey(id)) {
    try {
      tpl = (ITEMS.get ? ITEMS.get(id) : null) || (ITEMS.resolveTemplate ? ITEMS.resolveTemplate(w) : null);
    } catch (e) { /* ignore */ }
  }
  const itemObj = tpl || w.template || w;
  const isMagicalShot = (shotKind === 'sps' || shotKind === 'bsps');
  if (isMagicalShot) {
    const sps = itemObj.spiritshotUse ?? itemObj.spiritShotUse;
    return (typeof sps === 'number' && sps > 0) ? Math.floor(sps) : 1;
  }
  const ss = itemObj.soulshotUse ?? itemObj.soulShotUse;
  return (typeof ss === 'number' && ss > 0) ? Math.floor(ss) : 1;
}

function shotKindMatchesFilter(kind, kindFilter) {
  if (!kindFilter) return true;
  if (kind === kindFilter) return true;
  if (kindFilter === 'sps' && kind === 'bsps') return true;
  return false;
}

function toggleShotArm(p, itemId) {
  itemId = String(itemId || '').toLowerCase();
  const meta = tableGet(SHOT_ITEMS, itemId);
  if (!meta) return null;
  const countNeeded = equippedWeaponShotCount(p, meta.kind);
  if ((p.inv[itemId] || 0) < countNeeded) return { ok: false, reason: 'empty', id: itemId, needed: countNeeded };
  if (p.armedShot === itemId) {
    p.armedShot = null;
    return { ok: true, armed: false, id: itemId, inv: p.inv };
  }
  p.armedShot = itemId;
  const wGrade = equippedWeaponGrade(p);
  const gradeOk = normalizeItemGrade(meta.grade) === wGrade;
  return {
    ok: true,
    armed: true,
    id: itemId,
    kind: meta.kind,
    mult: meta.mult,
    grade: meta.grade,
    weaponGrade: wGrade,
    gradeOk: gradeOk,
    inv: p.inv
  };
}

function consumeArmedShot(p, kindFilter, sendFn) {
  const id = p.armedShot;
  if (!id) return { shotMod: 1.0, consumed: null, kind: null };
  const meta = tableGet(SHOT_ITEMS, id);
  if (!meta) { p.armedShot = null; return { shotMod: 1.0, consumed: null, kind: null }; }
  if (!shotKindMatchesFilter(meta.kind, kindFilter)) {
    return { shotMod: 1.0, consumed: null, kind: null };
  }
  const wGrade = equippedWeaponGrade(p);
  if (normalizeItemGrade(meta.grade) !== wGrade) {
    const now = Date.now();
    if (!p._lastShotGradeMsg || now - p._lastShotGradeMsg > 8000) {
      p._lastShotGradeMsg = now;
      try {
        const doSend = sendFn || playerSend;
        if (typeof doSend === 'function') {
          doSend(p, {
            t: 'msg',
            text: 'Заряд не подходит к оружию (нужен грейд: ' + wGrade + ').'
          });
        }
      } catch (e) { /* ignore */ }
    }
    return { shotMod: 1.0, consumed: null, kind: null, gradeFail: true };
  }
  const countNeeded = equippedWeaponShotCount(p, meta.kind);
  if ((p.inv[id] || 0) < countNeeded) {
    p.armedShot = null;
    return { shotMod: 1.0, consumed: null, kind: null };
  }
  p.inv[id] -= countNeeded;
  if (p.inv[id] <= 0) {
    delete p.inv[id];
    p.armedShot = null;
  }
  return { shotMod: meta.mult, consumed: id, kind: meta.kind, count: countNeeded };
}

// ------------------------------------------------------------
//  Пассивки и расчет эффектов
// ------------------------------------------------------------
function passiveBonuses(p) {
  const out = {
    attackPercent: 0, defensePercent: 0, hpPercent: 0, energyPercent: 0,
    critChance: 0, evasion: 0, cAtkPercent: 0, cDefPercent: 0,
    critDamage: 0, maxEnergyFlat: 0, attackSpeed: 0, fistAtkSpeed: 0, chargeSpeed: 0,
    castSpeedSet: 0, energyRegen: 0, pAtkFlat: 0, cAtkFlat: 0, pDefFlat: 0, cDefFlat: 0,
    healPower: 0, speedL2: 0, hpRegenSit: 0, mpRegenSit: 0, lucky: false,
    blockRate: 0, rangeBonus: 0, lowHpDefense: 0, lowHpAttack: 0, explosiveDamage: 0,
    robeSetActive: false, activeSets: []
  };
  if (!p.skills && !p.equip) return out;
  const robeSetOk = hasRobeSetEquipped(p.equip);
  out.robeSetActive = robeSetOk;
  out.castSpeedSet = robeSetOk ? namedSetCastBonus(p.equip) : 0;
  const setB = armorSetBonuses(p.equip);
  if (setB) {
    out.activeSets = setB.active || [];
    if (setB.cAtkPercent) out.cAtkPercent += setB.cAtkPercent;
    if (setB.pDefPercent) out.defensePercent += setB.pDefPercent;
    if (setB.energyPercent) out.energyPercent += setB.energyPercent;
    if (setB.energyRegen) out.energyRegen += setB.energyRegen;
  }
  if (!p.skills) return out;
  Object.keys(p.skills).forEach((id) => {
    const tpl = SK.get(id);
    if (!tpl || tpl.type !== 'passive') return;
    const rank = p.skills[id] || 1;
    const eff = tpl.effectPerLevel || {};
    const robeGated = !!(tpl.requiresRobe || tpl.requiresRobeSet);
    const robeActive = !robeGated || robeSetOk;
    const heavyGated = !!tpl.requiresHeavy;
    const heavyActive = !heavyGated || (ITEMS.hasHeavyArmor && ITEMS.hasHeavyArmor(p.equip));
    const lightGated = !!tpl.requiresLight;
    const lightActive = !lightGated || (ITEMS.hasLightArmor && ITEMS.hasLightArmor(p.equip));
    if (!heavyActive || !lightActive) return;
    if (id === 'eng_robe_step' && eff.attackSpeed) {
      out.fistAtkSpeed += eff.attackSpeed * rank;
    }
    Object.keys(out).forEach((k) => {
      if (k === 'robeSetActive' || k === 'castSpeedSet' || k === 'fistAtkSpeed') return;
      if (id === 'eng_robe_step' && k === 'attackSpeed') return;
      if (eff[k]) out[k] += eff[k] * rank;
    });
    if (eff.maxEnergy) out.maxEnergyFlat += eff.maxEnergy * rank;
    if (eff.healPower) out.healPower += eff.healPower * rank;
    const r = (tpl.ranks && tpl.ranks[Math.min(rank, tpl.ranks.length) - 1]) || null;
    if (r) {
      if (r.pAtkPercent != null) out.attackPercent += r.pAtkPercent;
      else if (r.attackPercent != null) out.attackPercent += r.attackPercent;
      if (r.cAtkPercent != null) out.cAtkPercent += r.cAtkPercent;
      if (r.pAtkFlat != null) out.pAtkFlat += r.pAtkFlat;
      if (r.cAtkFlat != null) out.cAtkFlat += r.cAtkFlat;
      if (r.pDefFlat != null) out.pDefFlat += r.pDefFlat;
      if (r.cDefFlat != null) out.cDefFlat += r.cDefFlat;
      if (r.evasion != null) out.evasion += r.evasion;
      if (r.speedL2 != null) out.speedL2 += r.speedL2;
      if (r.hpRegenSit != null) out.hpRegenSit += r.hpRegenSit;
      if (r.mpRegenSit != null) out.mpRegenSit += r.mpRegenSit;
      if (r.lucky) out.lucky = true;
      if (r.blockRate != null) out.blockRate += r.blockRate;
      if (r.rangeBonus != null) out.rangeBonus += r.rangeBonus;
      if (r.lowHpDefense != null) out.lowHpDefense += r.lowHpDefense;
      if (r.lowHpAttack != null) out.lowHpAttack += r.lowHpAttack;
      if (r.explosiveDamage != null) out.explosiveDamage += r.explosiveDamage;
      if (robeActive) {
        if (id === 'eng_robe_step') {
          if (r.attackSpeed) out.fistAtkSpeed += r.attackSpeed;
        } else {
          if (r.attackSpeed) out.attackSpeed += r.attackSpeed;
        }
        if (r.chargeSpeed) out.chargeSpeed += r.chargeSpeed;
        if (r.energyRegen) out.energyRegen += r.energyRegen;
      }
    }
  });
  if (!robeSetOk) {
    out.chargeSpeed = 0;
    out.castSpeedSet = 0;
  }
  return out;
}

function ensureStarterSkills(p) {
  if (!p.skills) p.skills = {};
  const root = CS.rootClass(p.cls);
  const starters = root === 'engineer'
    ? [
        'eng_lucky', 'eng_expert_tune', 'eng_robe_step',
        'eng_coolant_mind', 'eng_pressure_bolt', 'eng_self_repair'
      ]
    : ['op_power_strike', 'op_weapon_mastery'];

  const isPlayerGm = isGM(p);
  if (isPlayerGm) {
    starters.push('test_immortal');
    starters.push('gm_oneshot');
    starters.push('gm_resurrect');
    starters.push('gm_speed');
    if (p.skills && p.skills.gm_flash) {
      delete p.skills.gm_flash;
      p.skills.gm_speed = 1;
    }
  } else {
    if (p.skills && p.skills.test_immortal) delete p.skills.test_immortal;
    if (p.skills && p.skills.gm_oneshot) delete p.skills.gm_oneshot;
    if (p.skills && p.skills.gm_resurrect) delete p.skills.gm_resurrect;
    if (p.skills && p.skills.gm_flash) delete p.skills.gm_flash;
    if (p.skills && p.skills.gm_speed) delete p.skills.gm_speed;
  }
  starters.forEach((id) => {
    if (!p.skills[id] && SK.get(id)) p.skills[id] = 1;
  });
  grantExpertiseSkills(p);
}

function grantExpertiseSkills(p) {
  if (!p || (p.classTier | 0) < 1) return;
  const id = GR.expertiseSkillId(CS.rootClass(p.cls));
  if (!p.skills) p.skills = {};
  if (!p.skills[id] && SK.get(id)) p.skills[id] = 1;
}

function equippedArmorGrade(p) {
  let best = 'no_grade';
  let bestR = 0;
  const eq = (p && p.equip) || {};
  for (const slot of Object.keys(eq)) {
    if (slot === 'weapon') continue;
    const e = eq[slot];
    const tid = e && String(e.templateId || e.id || '').toLowerCase();
    if (!tid || isBadKey(tid)) continue;
    const tpl = ITEMS.get(tid);
    const g = tpl && tpl.grade;
    const r = GR.rank(g);
    if (r > bestR) { bestR = r; best = GR.normalize(g); }
  }
  return best;
}

function isPlayerImmortal(p) {
  if (!p) return false;
  if (p.invul) return true;
  if (!Array.isArray(p.buffs) || !p.buffs.length) return false;
  const now = Date.now();
  for (let i = 0; i < p.buffs.length; i++) {
    const b = p.buffs[i];
    if (!b || !(b.until > now)) continue;
    if (b.immortal || b.invulnerable || b.id === 'test_immortal') return true;
  }
  return false;
}

function effectsPayload(p) {
  const now = Date.now();
  p.buffs = BR.prune(p.buffs, now);
  p.debuffs = BR.prune(p.debuffs, now);
  return {
    t: 'effects',
    buffs: p.buffs.map((e) => BR.publicView(e, now)),
    debuffs: p.debuffs.map((e) => BR.publicView(e, now)),
    cap: { buffs: BR.MAX_BUFFS, debuffs: BR.MAX_DEBUFFS }
  };
}

function invalidateCombatPack(p) {
  if (p) {
    p._combatPack = null;
    p._combatPackExpiry = 0;
  }
}

function pushEffects(p, sendFn) {
  invalidateCombatPack(p);
  const doSend = sendFn || playerSend;
  if (typeof doSend === 'function') doSend(p, effectsPayload(p));
}

function applyPlayerBuff(p, buff, now) {
  now = now || Date.now();
  const r = BR.apply(p.buffs, Object.assign({ kind: 'buff' }, buff), now);
  p.buffs = r.list;
  invalidateCombatPack(p);
  return r;
}

function applyPlayerDebuff(p, deb, now, cancelCastFn) {
  now = now || Date.now();
  const r = BR.apply(p.debuffs, Object.assign({ kind: 'debuff' }, deb), now);
  p.debuffs = r.list;
  invalidateCombatPack(p);
  if (p.casting && (deb.kind === 'stun' || deb.stun || deb.kind === 'silence' || deb.silence)) {
    if (typeof cancelCastFn === 'function') cancelCastFn(p, deb.kind || 'debuff');
    else if (typeof p.cancelCast === 'function') p.cancelCast(deb.kind || 'debuff');
  }
  return r;
}

function playerStunned(p, now) {
  return BR.hasKind(p.debuffs, 'stun', now || Date.now());
}

function playerSilenced(p, now) {
  return BR.hasKind(p.debuffs, 'silence', now || Date.now());
}

// ------------------------------------------------------------
//  Вес и вместимость
// ------------------------------------------------------------
function itemLookup(id) {
  id = String(id || '').toLowerCase();
  if (!id) return null;
  try {
    if (ITEMS && ITEMS.get) {
      const a = ITEMS.get(id);
      if (a) return a;
    }
  } catch (e) { /* ignore */ }
  try {
    if (LR && LR.itemById) return LR.itemById(id);
    if (LR && LR.LOOT_ITEMS) return LR.LOOT_ITEMS[id] || null;
  } catch (e2) { /* ignore */ }
  return null;
}

function playerCon(p) {
  const pack = p && p.combatPack;
  const prim = (pack && pack.primary) || {};
  return prim.CON != null ? +prim.CON : 43;
}

function playerWeightState(p) {
  const load = WR.totalLoad(p.inv, p.equip, itemLookup);
  const max = WR.maxLoad(playerCon(p));
  return WR.penalty(load, max);
}

function weightPayload(p) {
  const st = playerWeightState(p);
  return {
    weight: st.load,
    maxWeight: st.max,
    weightRatio: Math.round(st.ratio * 1000) / 1000,
    noRegen: !!st.noRegen,
    weightSpeed: st.speedMult,
    canAttack: !!st.canAttack,
    overloaded: !!st.overloaded
  };
}

function pushWeight(p, sendFn) {
  const doSend = sendFn || playerSend;
  if (typeof doSend === 'function') {
    doSend(p, Object.assign({ t: 'weight' }, weightPayload(p)));
  }
}

function canCarryMore(p, itemId, count) {
  return WR.canAdd(p.inv, p.equip, itemId, count, playerCon(p), itemLookup);
}

function invAfter(inv, minus, plus) {
  const next = Object.assign(Object.create(null), inv || {});
  if (minus) {
    for (const id of Object.keys(minus)) {
      next[id] = (next[id] | 0) - (minus[id] | 0);
      if (next[id] <= 0) delete next[id];
    }
  }
  if (plus) {
    for (const id of Object.keys(plus)) {
      next[id] = (next[id] | 0) + (plus[id] | 0);
    }
  }
  return next;
}

function wouldExceedWeight(p, minus, plus) {
  const load = WR.totalLoad(invAfter(p.inv, minus, plus), p.equip, itemLookup);
  const max = WR.maxLoad(playerCon(p));
  return { ok: load <= max, load: load, max: max };
}

function failWeight(p, t, extra, sendFn) {
  const st = playerWeightState(p);
  const doSend = sendFn || playerSend;
  if (typeof doSend === 'function') {
    doSend(p, Object.assign({ t: t || 'loot_fail', reason: 'weight', weight: st.load, maxWeight: st.max }, extra || {}));
  }
}

// ------------------------------------------------------------
//  Классовые скиллы и косметика
// ------------------------------------------------------------
function skillAllowedForClass(p, templateClass) {
  if (!templateClass) return false;
  if (templateClass === 'any' || templateClass === 'all' || templateClass === '*') return true;
  if (templateClass === p.cls) return true;
  const line = CS.classLineage(p.cls);
  return line.indexOf(templateClass) !== -1;
}

function cosmeticsPublic(p) {
  const c = p && p.cosmetics ? p.cosmetics : null;
  const isGm = isGM(p);
  const defaultAura = isGm ? 'gm_champion' : null;
  const defaultNameColor = isGm ? '#00f0ff' : null;
  const defaultTitle = isGm ? 'GM' : null;
  const defaultTitleColor = isGm ? '#ffd700' : null;

  let eqTitle = p && p.equip && p.equip.title;
  let eqTitleTpl = null;
  if (eqTitle) {
    const tid = String(eqTitle.templateId || eqTitle.id || '').toLowerCase();
    eqTitleTpl = (ITEMS && typeof ITEMS.get === 'function') ? ITEMS.get(tid) : null;
  }

  let effectiveAura = (c && c.aura && c.aura !== 'none' && c.aura !== 'off')
    ? c.aura
    : ((c && (c.aura === 'none' || c.aura === 'off')) ? null : defaultAura);

  if (effectiveAura && !isGm && (!p || !p.dev)) {
    const now = Date.now();
    const hasAuraBuff = Array.isArray(p.buffs) && p.buffs.some(b => b && b.auraId && b.until > now);
    if (!hasAuraBuff) {
      effectiveAura = null;
      if (c) c.aura = null;
    }
  }

  let resolvedTitleName = eqTitleTpl
    ? (eqTitleTpl.titleText || eqTitleTpl.name)
    : (isGm ? defaultTitle : null);

  if (isGm && !eqTitleTpl && (!resolvedTitleName || resolvedTitleName === '[Administrator]' || resolvedTitleName === '[Game Master]')) {
    resolvedTitleName = 'GM';
  }

  let resolvedTitleColor = eqTitleTpl
    ? (eqTitleTpl.titleColor || '#ffd700')
    : (isGm ? defaultTitleColor : null);

  return {
    title: (eqTitleTpl && eqTitleTpl.id) || null,
    titleName: resolvedTitleName || null,
    titleColor: resolvedTitleColor || null,
    nameColor: (c && c.nameColor) || defaultNameColor,
    aura: effectiveAura
  };
}

function grantSkillFree(p, skillId) {
  skillId = String(skillId || '').toLowerCase();
  const tpl = SK.get(skillId);
  if (!tpl) return { ok: false, reason: 'unknown' };
  if (!skillAllowedForClass(p, tpl.class)) return { ok: false, reason: 'class' };
  if (!p.skills) p.skills = {};
  if ((p.skills[skillId] || 0) >= 1) return { ok: true, already: true, skillId, name: tpl.name };
  p.skills[skillId] = 1;
  return { ok: true, already: false, skillId, name: tpl.name };
}

// ------------------------------------------------------------
//  Сериализация профиля и снимки для клиента
// ------------------------------------------------------------
function profileOf(p) {
  return {
    charId: CH.normalizeCharId(p.charId),
    createdAt: p.createdAt || 0,
    name: p.name, level: p.level, exp: p.exp, sp: p.sp || 0,
    race: p.race || 'human', gender: p.gender || 'male',
    cls: p.cls, classTier: p.classTier || 0,
    classHistory: Array.isArray(p.classHistory) ? p.classHistory : [p.cls],
    x: p.x, y: p.y, z: p.z,
    hp: p.hp, maxHp: p.maxHp, energy: p.energy, maxEnergy: p.maxEnergy,
    dead: !!p.dead,
    karma: p.karma, pk: p.pk,
    accessLevel: p.accessLevel || 0,
    gm: isGM(p),
    inv: p.inv, equip: p.equip, learned: p.learned ? [...p.learned] : [],
    plusById: p.plusById || {},
    wh: p.wh || {},
    whPlusById: p.whPlusById || {},
    friends: Array.isArray(p.friends) ? p.friends : [],
    devices: p.devices || null,
    quests: p.quests || null,
    skills: p.skills || {},
    guestTokenHash: p.guestTokenHash || null,
    guestTokenHashes: Array.isArray(p.guestTokenHashes) ? p.guestTokenHashes : [],
    appearance: p.appearance || null,
    cosmetics: COS.normalize(p.cosmetics || null)
  };
}

function selfPayload(p, clanTagFn) {
  const cd = CS.getClass(p.cls);
  const pack = p.combatPack;
  const tag = (typeof clanTagFn === 'function') ? clanTagFn(p) : { clanId: null, clanName: null, crestHash: null };
  const w = weightPayload(p);
  return {
    x: p.x, y: p.y, z: p.z,
    hp: p.hp, maxHp: p.maxHp, energy: p.energy, maxEnergy: p.maxEnergy,
    dead: !!p.dead,
    level: p.level, exp: p.exp || 0, sp: p.sp || 0,
    gmSpeedMul: p.gmSpeedMul || 1,
    flashSpeed: !!p.flashSpeed,
    expToNext: EXP.expToNext(p.level),
    cls: p.cls, className: cd ? cd.name : p.cls,
    classTier: p.classTier || 0,
    race: p.race || 'human',
    gender: p.gender || 'male',
    path: cd ? cd.path : 'fighter',
    karma: p.karma,
    appearance: p.appearance || null,
    pAtk: pack.pAtk, pDef: pack.pDef, cAtk: pack.cAtk, cDef: pack.cDef,
    accuracy: pack.accuracy, evasion: pack.evasion, critRate: pack.critRate,
    primary: pack.primary,
    weaponClass: pack.weaponClass || 'fist',
    atkSpdL2: pack.atkSpdL2,
    atkIntervalMs: pack.atkIntervalMs,
    skills: p.skills || {},
    cosmetics: cosmeticsPublic(p),
    cosmeticsFull: COS.normalize(p.cosmetics || null),
    clanId: tag.clanId,
    clanName: tag.clanName,
    crestHash: tag.crestHash,
    weight: w.weight,
    maxWeight: w.maxWeight
  };
}

function combatStatsPayload(p) {
  const pack = p.combatPack;
  const w = weightPayload(p);
  return {
    t: 'combat_stats',
    pAtk: pack.pAtk,
    pDef: pack.pDef,
    cAtk: pack.cAtk,
    cDef: pack.cDef,
    accuracy: pack.accuracy,
    evasion: pack.evasion,
    critRate: pack.critRate,
    critDamage: pack.critDamage,
    vampiric: pack.vampiric,
    stunResist: pack.stunResist,
    hpRegenFlat: pack.hpRegenFlat,
    energyRegenFlat: pack.energyRegenFlat,
    energyRegenMult: pack.energyRegenMult,
    adenaMult: pack.adenaMult,
    dropMult: pack.dropMult,
    maxHp: pack.maxHp,
    maxEnergy: pack.maxEnergy,
    hp: p.hp,
    energy: p.energy,
    primary: pack.primary,
    weaponClass: pack.weaponClass || 'fist',
    atkSpdL2: pack.atkSpdL2,
    atkIntervalMs: pack.atkIntervalMs,
    speed: pack.speed,
    speedL2: pack.speedL2,
    speedBase: pack.speedBase,
    equip: p.equip || {},
    gradePenalty: pack.gradePenalty || null,
    weight: w.weight,
    maxWeight: w.maxWeight,
    weightRatio: w.weightRatio,
    weightSpeed: w.weightSpeed,
    noRegen: w.noRegen,
    canAttack: w.canAttack,
    overloaded: w.overloaded,
    inv: p.inv
  };
}

module.exports = {
  Player,
  BAD_KEYS,
  isBadKey,
  safeNum,
  tableGet,
  safeCountMap,
  safeEquipMap,
  EQUIP_SLOTS,
  equipSlotForTpl,
  sanitizeEquipSlots,
  safeSkillMap,
  safeFriendList,
  sanitizeCharName,
  safeDevices,
  stampDeviceFields,
  syncDevicesToEquip,
  setPlayerSend,
  hasRobeSetEquipped,
  namedSetCastBonus,
  armorSetBonuses,
  SHOT_ITEMS,
  normalizeItemGrade,
  equippedWeaponGrade,
  equippedWeaponShotCount,
  shotKindMatchesFilter,
  toggleShotArm,
  consumeArmedShot,
  passiveBonuses,
  ensureStarterSkills,
  grantExpertiseSkills,
  equippedArmorGrade,
  isPlayerImmortal,
  effectsPayload,
  invalidateCombatPack,
  pushEffects,
  applyPlayerBuff,
  applyPlayerDebuff,
  playerStunned,
  playerSilenced,
  itemLookup,
  playerCon,
  playerWeightState,
  weightPayload,
  pushWeight,
  canCarryMore,
  invAfter,
  wouldExceedWeight,
  failWeight,
  skillAllowedForClass,
  cosmeticsPublic,
  grantSkillFree,
  profileOf,
  selfPayload,
  combatStatsPayload,
  isSyntheticBot
};
