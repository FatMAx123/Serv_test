// ============================================================
//  SHARED / CHAR-RULES.JS — мультиперсонажность (PLAN 5.5).
//  Слоты живут на сервере. c0 = существующий data/<yid>.json,
//  остальные — data/<yid>.<charId>.json / postgres yid:charId.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CHAR_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var MAX_SLOTS = 7;
  var DEFAULT_CHAR_ID = 'c0';

  function normalizeCharId(raw) {
    if (raw == null || raw === '') return DEFAULT_CHAR_ID;
    var s = String(raw).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
    if (!s) return DEFAULT_CHAR_ID;
    var low = s.toLowerCase();
    if (low === '__proto__' || low === 'constructor' || low === 'prototype') return DEFAULT_CHAR_ID;
    return s;
  }

  function isDefaultChar(charId) {
    return normalizeCharId(charId) === DEFAULT_CHAR_ID;
  }

  /** Имя файла без .json. ySafe уже прогнан через safeName. c0 → <yid>, иначе <yid>.<charId>. */
  function profileStem(ySafe, charId) {
    var y = String(ySafe || '');
    var c = normalizeCharId(charId);
    return isDefaultChar(c) ? y : y + '.' + c;
  }

  /** Ключ postgres / рейтинга. c0 = сам yid (старые строки не трогаем). */
  function profileKey(yid, charId) {
    var c = normalizeCharId(charId);
    return isDefaultChar(c) ? String(yid) : String(yid) + ':' + c;
  }

  /** Ключ членства в клане: два персонажа одного аккаунта — разные члены. */
  function memberKey(yid, charId) {
    return String(yid) + ':' + normalizeCharId(charId);
  }

  function parseProfileStem(stem) {
    var s = String(stem || '');
    var i = s.indexOf('.');
    if (i < 0) return { yid: s, charId: DEFAULT_CHAR_ID };
    return { yid: s.slice(0, i), charId: normalizeCharId(s.slice(i + 1)) };
  }

  function newCharId() {
    return 'c_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }

  function sameChar(a, b) {
    if (!a || !b) return false;
    var ay = a.yid != null ? String(a.yid) : '';
    var by = b.yid != null ? String(b.yid) : '';
    if (!ay || ay !== by) return false;
    return normalizeCharId(a.charId) === normalizeCharId(b.charId);
  }

  function summarize(pr, charId) {
    if (!pr || typeof pr !== 'object') return null;
    var id = normalizeCharId(charId || pr.charId);
    return {
      id: id,
      name: String(pr.name || 'Operator').slice(0, 16),
      level: pr.level || 1,
      exp: pr.exp || 0,
      sp: pr.sp || 0,
      cls: pr.cls || 'operator',
      className: pr.className || '',
      classTier: pr.classTier || 0,
      classHistory: Array.isArray(pr.classHistory) ? pr.classHistory.slice() : [pr.cls || 'operator'],
      race: pr.race || 'human',
      gender: pr.gender || 'male',
      hp: pr.hp,
      maxHp: pr.maxHp,
      energy: pr.energy,
      maxEnergy: pr.maxEnergy,
      pAtk: pr.pAtk != null ? pr.pAtk : pr.attack,
      pDef: pr.pDef != null ? pr.pDef : pr.defense,
      cAtk: pr.cAtk != null ? pr.cAtk : pr.mAtk,
      cDef: pr.cDef != null ? pr.cDef : pr.mDef,
      karma: pr.karma || 0,
      accessLevel: pr.accessLevel || 0,
      gm: !!pr.gm,
      appearance: pr.appearance || null,
      equip: pr.equip || null,
      createdAt: pr.createdAt || 0
    };
  }

  return {
    MAX_SLOTS: MAX_SLOTS,
    DEFAULT_CHAR_ID: DEFAULT_CHAR_ID,
    normalizeCharId: normalizeCharId,
    isDefaultChar: isDefaultChar,
    profileStem: profileStem,
    profileKey: profileKey,
    memberKey: memberKey,
    parseProfileStem: parseProfileStem,
    newCharId: newCharId,
    sameChar: sameChar,
    summarize: summarize
  };
});
