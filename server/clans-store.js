// ============================================================
//  SERVER / CLANS-STORE.JS — отдельное хранилище кланов.
//  Не в профиле игрока: состав — общая запись, и правка чужого JSON
//  поверх живой сессии стёрла бы прогресс члена (тот же урок, что друзья).
//  В памяти — Map; на диск — JSON.stringify синхронно ДО очереди записи,
//  как DB.save профиля. Любой await между проверкой склада и mutate — дюп.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const CL = require('../shared/clan-rules.js');
const CH = require('../shared/char-rules.js');
let DB = null;
try { DB = require('./db.js'); } catch (_) { }

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'data', 'clans');
const BAD = new Set(['__proto__', 'constructor', 'prototype']);

const byId = new Map();
const byName = new Map();
const byKey = new Map(); // yid:charId -> clanId (c0 = старые сейвы без charId)
const writeChains = new Map();

function noop() { }
function enqueue(id, job) {
  const prev = writeChains.get(id) || Promise.resolve();
  const result = prev.then(job, job);
  const chain = result.then(noop, noop).then(() => {
    if (writeChains.get(id) === chain) writeChains.delete(id);
  });
  writeChains.set(id, chain);
  return result;
}

function safeCountMap(src) {
  const out = Object.create(null);
  if (!src || typeof src !== 'object') return out;
  for (const k of Object.keys(src)) {
    if (BAD.has(k)) continue;
    const n = Math.floor(+src[k]);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

function safeMembers(src) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(src)) return out;
  for (const raw of src) {
    if (!raw) continue;
    const yid = String(raw.yid == null ? '' : raw.yid).slice(0, 64);
    if (!yid || BAD.has(yid)) continue;
    const charId = CH.normalizeCharId(raw.charId);
    const key = CH.memberKey(yid, charId);
    if (seen.has(key)) continue;
    seen.add(key);
    const rank = (raw.rank === 'leader' || raw.rank === 'officer') ? raw.rank : 'member';
    const name = CL.sanitizeClanName(raw.name) || yid.slice(0, 16);
    out.push({
      yid: yid,
      charId: charId,
      name: name,
      rank: rank,
      joinedAt: Math.max(0, Math.floor(+raw.joinedAt) || 0)
    });
  }
  return out;
}

function normalize(raw, fileId) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || fileId || '').slice(0, 32);
  if (!id || BAD.has(id) || id.indexOf('c_') !== 0) return null;
  const name = CL.sanitizeClanName(raw.name);
  if (!name) return null;
  const members = safeMembers(raw.members);
  if (!members.length) return null;
  let leaderYid = String(raw.leaderYid || '').slice(0, 64);
  let leaderCharId = CH.normalizeCharId(raw.leaderCharId);
  const lead = members.find((m) => m.rank === 'leader') || members[0];
  if (!lead) return null;
  if (!leaderYid || BAD.has(leaderYid)) { leaderYid = lead.yid; leaderCharId = lead.charId; }
  lead.rank = 'leader';
  for (const m of members) {
    if (m.yid === leaderYid && CH.normalizeCharId(m.charId) === leaderCharId) m.rank = 'leader';
  }
  let crest = null;
  if (raw.crest) {
    const n = CL.normalizeCrest(raw.crest);
    if (n.ok) crest = { w: n.w, h: n.h, rgba: n.rgba, hash: n.hash };
  }
  return {
    id: id,
    name: name,
    level: Math.max(0, Math.min(CL.MAX_CLAN_LEVEL, raw.level | 0)),
    reputation: Math.max(0, Math.floor(+raw.reputation) || 0),
    leaderYid: leaderYid,
    leaderCharId: leaderCharId,
    members: members,
    wh: safeCountMap(raw.wh),
    whPlusById: safeCountMap(raw.whPlusById),
    crest: crest,
    createdAt: Math.max(0, Math.floor(+raw.createdAt) || Date.now())
  };
}

function indexAdd(c) {
  byId.set(c.id, c);
  byName.set(c.name.toLowerCase(), c.id);
  for (const m of c.members) byKey.set(CH.memberKey(m.yid, m.charId), c.id);
}

function indexRemove(c) {
  byId.delete(c.id);
  if (byName.get(c.name.toLowerCase()) === c.id) byName.delete(c.name.toLowerCase());
  for (const m of c.members) {
    const k = CH.memberKey(m.yid, m.charId);
    if (byKey.get(k) === c.id) byKey.delete(k);
  }
}

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function loadAll() {
  byId.clear(); byName.clear(); byKey.clear();
  ensureDir();
  let n = 0;
  for (const f of fs.readdirSync(DIR)) {
    if (!/\.json$/i.test(f)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      const c = normalize(raw, f.replace(/\.json$/i, ''));
      if (c) { indexAdd(c); n++; }
    } catch (e) {
      console.error('[clans] skip', f, e && e.message);
    }
  }
  console.log('[clans] loaded', n);
  return n;
}

async function loadAllAsync() {
  byId.clear(); byName.clear(); byKey.clear();
  if (DB && typeof DB.loadAllClans === 'function') {
    try {
      const list = await DB.loadAllClans();
      let n = 0;
      for (const raw of list) {
        const c = normalize(raw, raw.id);
        if (c) { indexAdd(c); n++; }
      }
      console.log('[clans] loaded (async):', n);
      return n;
    } catch (e) {
      console.error('[clans] loadAllAsync fallback to fs:', e && e.message);
    }
  }
  return loadAll();
}

function get(id) {
  if (id == null) return null;
  const k = String(id);
  return byId.has(k) ? byId.get(k) : null;
}

function byNameGet(name) {
  const n = CL.sanitizeClanName(name);
  if (!n) return null;
  const id = byName.get(n.toLowerCase());
  return id ? get(id) : null;
}

function clanIdOf(yid, charId) {
  if (!yid) return null;
  return byKey.get(CH.memberKey(yid, charId)) || null;
}

function ofKey(yid, charId) {
  const id = clanIdOf(yid, charId);
  return id ? get(id) : null;
}

/** Старый вход: слот c0. Новый код — ofPlayer / ofKey. */
function ofYid(yid) {
  return ofKey(yid, CH.DEFAULT_CHAR_ID);
}

function ofPlayer(p) {
  if (!p || !p.yid) return null;
  return ofKey(p.yid, p.charId);
}

function memberOf(clan, yid, charId) {
  if (!clan || !Array.isArray(clan.members)) return null;
  const wantY = String(yid);
  const wantC = CH.normalizeCharId(charId);
  for (let i = 0; i < clan.members.length; i++) {
    const m = clan.members[i];
    if (m.yid === wantY && CH.normalizeCharId(m.charId) === wantC) return m;
  }
  return null;
}

function newId() {
  for (let i = 0; i < 8; i++) {
    const id = 'c_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    if (!byId.has(id) && !BAD.has(id)) return id;
  }
  return 'c_' + Math.random().toString(36).slice(2, 12);
}

function create(opts) {
  const name = CL.sanitizeClanName(opts && opts.name);
  if (!name) return { ok: false, reason: 'name' };
  if (byName.has(name.toLowerCase())) return { ok: false, reason: 'taken' };
  const yid = String((opts && opts.leaderYid) || '').slice(0, 64);
  if (!yid || BAD.has(yid)) return { ok: false, reason: 'args' };
  const charId = CH.normalizeCharId(opts && opts.leaderCharId);
  if (byKey.has(CH.memberKey(yid, charId))) return { ok: false, reason: 'already' };
  const rec = {
    id: newId(),
    name: name,
    level: 0,
    reputation: 0,
    leaderYid: yid,
    leaderCharId: charId,
    members: [{ yid: yid, charId: charId, name: String((opts && opts.leaderName) || name).slice(0, 16), rank: 'leader', joinedAt: Date.now() }],
    wh: Object.create(null),
    whPlusById: Object.create(null),
    crest: null,
    createdAt: Date.now()
  };
  rec.members[0].name = (opts && opts.leaderName) ? String(opts.leaderName).slice(0, 16) : rec.members[0].name;
  indexAdd(rec);
  save(rec, { isCreate: true, whAuthoritative: true, forcePersist: true });
  return { ok: true, clan: rec };
}

function cloneFlatMap(src) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const k of Object.keys(src)) out[k] = src[k];
  return out;
}

function isCwhOwner() {
  // Сначала роль воркера: флаг мастера мог унаследоваться через окружение fork.
  const isClusterWorker = process.env.IS_CLUSTER_WORKER === '1';
  if (isClusterWorker) {
    const wIdx = process.env.WORKER_INDEX || process.env.WORKER_ID || '1';
    return wIdx === '1';
  }
  if (process.env.IS_CLUSTER_MASTER === '1') return false;
  return true;
}

function metaSnapshot(c, extra) {
  const base = {
    id: c.id,
    name: c.name,
    level: c.level | 0,
    leaderYid: c.leaderYid,
    leaderCharId: CH.normalizeCharId(c.leaderCharId),
    members: c.members.map((m) => ({
      yid: m.yid,
      charId: CH.normalizeCharId(m.charId),
      name: m.name,
      rank: m.rank,
      joinedAt: Number(m.joinedAt) || 0
    })),
    crest: c.crest ? { w: c.crest.w, h: c.crest.h, rgba: c.crest.rgba, hash: c.crest.hash } : null,
    createdAt: Number(c.createdAt) || 0
  };
  return extra ? Object.assign(base, extra) : base;
}

function whSnapshot(c) {
  return {
    id: c.id,
    wh: cloneFlatMap(c.wh),
    whPlusById: cloneFlatMap(c.whPlusById),
    whAuthoritative: true
  };
}

function snapshot(c) {
  return {
    id: c.id,
    name: c.name,
    level: c.level | 0,
    reputation: c.reputation | 0,
    leaderYid: c.leaderYid,
    leaderCharId: CH.normalizeCharId(c.leaderCharId),
    members: c.members.map((m) => ({
      yid: m.yid,
      charId: CH.normalizeCharId(m.charId),
      name: m.name,
      rank: m.rank,
      joinedAt: Number(m.joinedAt) || 0
    })),
    wh: cloneFlatMap(c.wh),
    whPlusById: cloneFlatMap(c.whPlusById),
    crest: c.crest ? { w: c.crest.w, h: c.crest.h, rgba: c.crest.rgba, hash: c.crest.hash } : null,
    createdAt: Number(c.createdAt) || 0
  };
}

let syncBroadcaster = null;
function setSyncBroadcaster(fn) {
  syncBroadcaster = fn;
}
function notifyRawSync(action, payload) {
  if (typeof syncBroadcaster === 'function') {
    try { syncBroadcaster(action, payload); } catch (_) { }
  }
}
function notifySync(action, clan) {
  if (typeof syncBroadcaster === 'function') {
    try { syncBroadcaster(action, action === 'remove' ? { id: clan.id, name: clan.name, members: clan.members } : snapshot(clan)); } catch (_) { }
  }
}

function persistOnly(c) {
  if (!c || !c.id) return Promise.resolve();
  const snap = snapshot(c);
  if (DB && typeof DB.saveClan === 'function') {
    return DB.saveClan(snap);
  }
  ensureDir();
  const json = JSON.stringify(snap);
  const file = path.join(DIR, c.id + '.json');
  const tmp = file + '.tmp.' + process.pid + '.' + Date.now();
  return enqueue(c.id, async () => {
    try {
      await fs.promises.writeFile(tmp, json, 'utf8');
      try { await fs.promises.copyFile(file, file + '.bak'); } catch (_) { }
      await fs.promises.rename(tmp, file);
    } catch (e) {
      try { await fs.promises.unlink(tmp); } catch (_) { }
      throw e;
    }
  });
}

function applySync(action, raw, opts) {
  if (!raw || !raw.id) return null;
  if (action === 'remove') {
    const existing = byId.get(String(raw.id));
    if (existing) {
      indexRemove(existing);
      if (opts && typeof opts.onRemoved === 'function') opts.onRemoved(existing);
      return existing;
    }
    return null;
  }

  if (action === 'rep_delta') {
    const existing = byId.get(String(raw.id));
    if (!existing) return null;
    const delta = Math.floor(+raw.delta) || 0;
    if (delta !== 0) {
      existing.reputation = Math.max(0, (Math.floor(Number(existing.reputation)) || 0) + delta);
    }
    if (opts && opts.persistOnOwner && isCwhOwner()) {
      persistOnly(existing);
    }
    if (opts && typeof opts.onUpdated === 'function') opts.onUpdated(existing);
    return existing;
  }

  if (action === 'wh_sync') {
    const existing = byId.get(String(raw.id));
    if (!existing) return null;
    existing.wh = safeCountMap(raw.wh);
    existing.whPlusById = safeCountMap(raw.whPlusById);
    if (opts && typeof opts.onUpdated === 'function') opts.onUpdated(existing);
    return existing;
  }

  if (action === 'meta_sync') {
    const existing = byId.get(String(raw.id));
    if (!existing) {
      // Fallback: если клан еще не был создан локально, пробуем нормализовать
      const full = normalize(raw, raw.id);
      if (!full) return null;
      indexAdd(full);
      if (opts && opts.persistOnOwner && isCwhOwner()) persistOnly(full);
      if (opts && typeof opts.onUpdated === 'function') opts.onUpdated(full);
      return full;
    }
    const cleanName = raw.name ? CL.sanitizeClanName(raw.name) : null;
    if (cleanName) {
      if (existing.name && existing.name.toLowerCase() !== cleanName.toLowerCase()) {
        byName.delete(existing.name.toLowerCase());
      }
      existing.name = cleanName;
    }
    if (raw.level != null) {
      existing.level = Math.max(0, Math.min(CL.MAX_CLAN_LEVEL, raw.level | 0));
    }
    if (raw.repDelta != null) {
      const rd = Math.floor(+raw.repDelta) || 0;
      existing.reputation = Math.max(0, (existing.reputation | 0) + rd);
    } else if (raw.reputation != null && !isCwhOwner()) {
      existing.reputation = Math.max(0, Math.floor(+raw.reputation) || 0);
    }
    if (Array.isArray(raw.members) && raw.members.length > 0) {
      for (const m of existing.members) {
        const k = CH.memberKey(m.yid, m.charId);
        if (byKey.get(k) === existing.id) byKey.delete(k);
      }
      existing.members = safeMembers(raw.members);
      const lead = existing.members.find((m) => m.rank === 'leader') || existing.members[0];
      let lYid = raw.leaderYid ? String(raw.leaderYid).slice(0, 64) : existing.leaderYid;
      let lChar = raw.leaderCharId ? CH.normalizeCharId(raw.leaderCharId) : existing.leaderCharId;
      if (!lYid || BAD.has(lYid)) { lYid = lead.yid; lChar = lead.charId; }
      existing.leaderYid = lYid;
      existing.leaderCharId = lChar;
    }
    if (raw.crest !== undefined) {
      if (raw.crest) {
        const n = CL.normalizeCrest(raw.crest);
        if (n.ok) existing.crest = { w: n.w, h: n.h, rgba: n.rgba, hash: n.hash };
      } else {
        existing.crest = null;
      }
    }
    indexAdd(existing);
    if (opts && opts.persistOnOwner && isCwhOwner()) {
      persistOnly(existing);
    }
    if (opts && typeof opts.onUpdated === 'function') opts.onUpdated(existing);
    return existing;
  }

  const c = normalize(raw, raw.id);
  if (!c) return null;

  const existing = byId.get(c.id);
  if (existing) {
    if (existing.name && existing.name.toLowerCase() !== c.name.toLowerCase()) {
      byName.delete(existing.name.toLowerCase());
    }
    for (const m of existing.members) {
      const k = CH.memberKey(m.yid, m.charId);
      if (byKey.get(k) === existing.id) byKey.delete(k);
    }

    existing.name = c.name;
    existing.level = c.level;
    existing.reputation = c.reputation;
    existing.leaderYid = c.leaderYid;
    existing.leaderCharId = c.leaderCharId;
    existing.members = c.members;
    // Защита CWH на владельце (Town Worker 1): удаленный 'save' без whAuthoritative НЕ затирает склад клана
    if (!isCwhOwner() || raw.whAuthoritative === true) {
      existing.wh = c.wh;
      existing.whPlusById = c.whPlusById;
    }
    existing.crest = c.crest;

    indexAdd(existing);
    if (opts && opts.persistOnOwner && isCwhOwner()) persistOnly(existing);
    if (opts && typeof opts.onUpdated === 'function') opts.onUpdated(existing);
    return existing;
  } else {
    indexAdd(c);
    if (opts && opts.persistOnOwner && isCwhOwner()) persistOnly(c);
    if (opts && typeof opts.onUpdated === 'function') opts.onUpdated(c);
    return c;
  }
}

function addReputation(c, amount) {
  if (!c || !c.id) return Promise.resolve();
  const delta = Math.max(0, Math.floor(+amount) || 0);
  if (!delta) return Promise.resolve();
  c.reputation = Math.max(0, (Math.floor(Number(c.reputation)) || 0) + delta);
  notifyRawSync('rep_delta', { id: c.id, delta: delta });
  if (isCwhOwner()) {
    return persistOnly(c);
  }
  return Promise.resolve();
}

function saveMeta(c, opts) {
  if (!c || !c.id) return Promise.resolve();
  const extra = (opts && opts.repDelta != null) ? { repDelta: Math.floor(+opts.repDelta) || 0 } : null;
  notifyRawSync('meta_sync', metaSnapshot(c, extra));
  if (isCwhOwner()) {
    return persistOnly(c);
  }
  return Promise.resolve();
}

function saveWh(c) {
  if (!c || !c.id) return Promise.resolve();
  notifyRawSync('wh_sync', whSnapshot(c));
  return persistOnly(c);
}

/**
 * Склад клана + профили участников переноса одной операцией (DB.saveAtomic):
 * вклад/выдача меняет и клан, и сумку игрока — падение между двумя записями давало дюп/потерю.
 * profileItems: [{kind:'profile', yid, charId, data}]. Снимок клана берётся в момент записи.
 */
function saveWhAtomic(c, profileItems) {
  if (!c || !c.id) return Promise.resolve();
  notifyRawSync('wh_sync', whSnapshot(c));
  const items = (profileItems || []).filter(Boolean);
  if (DB && typeof DB.saveAtomic === 'function') {
    return DB.saveAtomic(items.concat([{ kind: 'clan', id: c.id, get: () => snapshot(c) }]));
  }
  // Без атомарной записи — как раньше: клан и профили по отдельности
  const writes = [persistOnly(c)];
  if (DB && typeof DB.save === 'function') for (const it of items) writes.push(DB.save(it.yid, it.data, it.charId));
  return Promise.all(writes);
}

function save(c, opts) {
  if (!c || !c.id) return Promise.resolve();
  const options = opts || {};
  if (!isCwhOwner() && !options.isCreate && !options.whAuthoritative) {
    return saveMeta(c, options);
  }
  const snap = snapshot(c);
  if (isCwhOwner() || options.whAuthoritative) snap.whAuthoritative = true;
  notifyRawSync('save', snap);
  return persistOnly(c);
}

function remove(c) {
  if (!c || !c.id) return Promise.resolve();
  notifySync('remove', { id: c.id, name: c.name, members: c.members });
  indexRemove(c);
  if (DB && typeof DB.removeClan === 'function') {
    return DB.removeClan(c.id);
  }
  const file = path.join(DIR, c.id + '.json');
  return enqueue(c.id, () => fs.promises.unlink(file).catch(() => { }));
}

function reindexMember(yid, charId, clanId) {
  if (!yid) return;
  const k = CH.memberKey(yid, charId);
  if (clanId) byKey.set(k, clanId);
  else byKey.delete(k);
}

function renameIndex(oldName, rec) {
  if (oldName && byName.get(oldName.toLowerCase()) === rec.id) byName.delete(oldName.toLowerCase());
  byName.set(rec.name.toLowerCase(), rec.id);
}

function all() { return [...byId.values()]; }

function flush() {
  const jobs = [...writeChains.values()];
  if (DB && typeof DB.flush === 'function') jobs.push(DB.flush());
  return Promise.all(jobs).then(noop, noop);
}

module.exports = {
  DIR: DIR,
  loadAll: loadAll,
  loadAllAsync: loadAllAsync,
  get: get,
  byName: byNameGet,
  clanIdOf: clanIdOf,
  ofYid: ofYid,
  ofKey: ofKey,
  ofMember: ofKey,
  ofPlayer: ofPlayer,
  memberOf: memberOf,
  create: create,
  addReputation: addReputation,
  saveMeta: saveMeta,
  saveWh: saveWh,
  saveWhAtomic: saveWhAtomic,
  save: save,
  persistOnly: persistOnly,
  remove: remove,
  isCwhOwner: isCwhOwner,
  snapshot: snapshot,
  reindexMember: reindexMember,
  renameIndex: renameIndex,
  all: all,
  flush: flush,
  setSyncBroadcaster: setSyncBroadcaster,
  applySync: applySync
};
