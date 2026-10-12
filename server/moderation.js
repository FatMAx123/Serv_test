// ============================================================
//  SERVER / MODERATION.JS — санкции по yid, лог чата/действий, репорты.
//  Не в профиле игрока: бан должен переживать сессию и не затираться DB.save.
//  JSON.stringify санкций — синхронно до очереди записи.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const MR = require('../shared/moderation-rules.js');

const DIR = path.join(__dirname, '..', 'data', 'moderation');
const SANCTIONS_FILE = path.join(DIR, 'sanctions.json');
const SANCTIONS_IP_FILE = path.join(DIR, 'sanctions-ip.json');

const sanctions = Object.create(null); // yid -> { banUntil, muteUntil, reason, by, at }
const sanctionsIp = Object.create(null); // ip -> { banUntil, muteUntil, reason, by, at }

function sanitizeIp(raw) {
  if (typeof raw !== 'string') return null;
  const ip = raw.trim().replace(/^::ffff:/, '');
  if (!ip || ip === '127.0.0.1' || ip === '::1') return null; // loopback не банится
  if (ip.length > 64 || !/^[0-9a-fA-F.:]+$/.test(ip)) return null;
  return ip.toLowerCase();
}
const writeChains = new Map();
function noop() {}
function enqueue(key, job) {
  const prev = writeChains.get(key) || Promise.resolve();
  const result = prev.then(job, job);
  const chain = result.then(noop, noop).then(() => {
    if (writeChains.get(key) === chain) writeChains.delete(key);
  });
  writeChains.set(key, chain);
  return result;
}

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

function load() {
  ensureDir();
  try {
    const raw = JSON.parse(fs.readFileSync(SANCTIONS_FILE, 'utf8'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const k of Object.keys(raw)) {
        const yid = MR.sanitizeYid(k);
        if (!yid) continue;
        const v = raw[k];
        if (!v || typeof v !== 'object') continue;
        sanctions[yid] = {
          banUntil: v.banUntil == null ? null : (Number.isFinite(+v.banUntil) ? +v.banUntil : 0),
          muteUntil: v.muteUntil == null ? null : (Number.isFinite(+v.muteUntil) ? +v.muteUntil : 0),
          reason: MR.sanitizeReason(v.reason),
          by: String(v.by || '').slice(0, 64),
          at: Math.floor(+v.at) || 0
        };
      }
    }
  } catch (e) {
    if (e && e.code !== 'ENOENT') console.error('[mod] load', e && e.message);
  }

  try {
    const rawIp = JSON.parse(fs.readFileSync(SANCTIONS_IP_FILE, 'utf8'));
    if (rawIp && typeof rawIp === 'object' && !Array.isArray(rawIp)) {
      for (const k of Object.keys(rawIp)) {
        const ip = sanitizeIp(k);
        if (!ip) continue;
        const v = rawIp[k];
        if (!v || typeof v !== 'object') continue;
        sanctionsIp[ip] = {
          banUntil: v.banUntil == null ? null : (Number.isFinite(+v.banUntil) ? +v.banUntil : 0),
          muteUntil: v.muteUntil == null ? null : (Number.isFinite(+v.muteUntil) ? +v.muteUntil : 0),
          reason: MR.sanitizeReason(v.reason),
          by: String(v.by || '').slice(0, 64),
          at: Math.floor(+v.at) || 0
        };
      }
    }
  } catch (e) {
    if (e && e.code !== 'ENOENT') console.error('[mod] load IP', e && e.message);
  }
}

function snapshotIp() {
  const out = Object.create(null);
  for (const ip of Object.keys(sanctionsIp)) {
    const s = sanctionsIp[ip];
    if (!s) continue;
    const banOn = MR.isActive(s.banUntil);
    const muteOn = MR.isActive(s.muteUntil);
    if (!banOn && !muteOn) continue;
    out[ip] = {
      banUntil: banOn ? s.banUntil : 0,
      muteUntil: muteOn ? s.muteUntil : 0,
      reason: s.reason || '',
      by: s.by || '',
      at: s.at || 0
    };
  }
  return out;
}

function saveIp() {
  ensureDir();
  const json = JSON.stringify(snapshotIp());
  const tmp = SANCTIONS_IP_FILE + '.tmp.' + process.pid + '.' + Date.now();
  return enqueue('sanctionsIp', async () => {
    try {
      await fs.promises.writeFile(tmp, json, 'utf8');
      await fs.promises.rename(tmp, SANCTIONS_IP_FILE);
    } catch (e) {
      try { await fs.promises.unlink(tmp); } catch (_) {}
      throw e;
    }
  });
}

function snapshot() {
  const out = Object.create(null);
  for (const yid of Object.keys(sanctions)) {
    const s = sanctions[yid];
    if (!s) continue;
    const banOn = MR.isActive(s.banUntil);
    const muteOn = MR.isActive(s.muteUntil);
    if (!banOn && !muteOn) continue;
    out[yid] = {
      banUntil: banOn ? s.banUntil : 0,
      muteUntil: muteOn ? s.muteUntil : 0,
      reason: s.reason || '',
      by: s.by || '',
      at: s.at || 0
    };
  }
  return out;
}

function save() {
  ensureDir();
  const json = JSON.stringify(snapshot());
  const tmp = SANCTIONS_FILE + '.tmp.' + process.pid + '.' + Date.now();
  return enqueue('sanctions', async () => {
    try {
      await fs.promises.writeFile(tmp, json, 'utf8');
      await fs.promises.rename(tmp, SANCTIONS_FILE);
    } catch (e) {
      try { await fs.promises.unlink(tmp); } catch (_) {}
      throw e;
    }
  });
}

function getRec(yid) {
  const id = MR.sanitizeYid(yid);
  if (!id) return null;
  const rec = sanctions[id];
  return rec ? { id: id, rec: rec } : null;
}

function ensureRec(yid) {
  const id = MR.sanitizeYid(yid);
  if (!id) return null;
  if (!sanctions[id]) {
    sanctions[id] = { banUntil: 0, muteUntil: 0, reason: '', by: '', at: 0 };
  }
  return { id: id, rec: sanctions[id] };
}

function banInfo(yid, now) {
  const got = getRec(yid);
  if (!got) return null;
  if (!MR.isActive(got.rec.banUntil, now)) return null;
  return { until: got.rec.banUntil, reason: got.rec.reason || '', by: got.rec.by || '' };
}

function muteInfo(yid, now) {
  const got = getRec(yid);
  if (!got) return null;
  if (!MR.isActive(got.rec.muteUntil, now)) return null;
  return { until: got.rec.muteUntil, reason: got.rec.reason || '', by: got.rec.by || '' };
}

function setBan(yid, opts) {
  opts = opts || {};
  const got = ensureRec(yid);
  if (!got) return { ok: false, reason: 'args' };
  got.rec.banUntil = Object.prototype.hasOwnProperty.call(opts, 'until')
    ? opts.until
    : MR.untilFromTtl(opts.ttlSec);
  got.rec.reason = MR.sanitizeReason(opts.reason);
  got.rec.by = String(opts.by || 'mod').slice(0, 64);
  got.rec.at = Date.now();
  save();
  return { ok: true, yid: got.id, until: got.rec.banUntil, reason: got.rec.reason };
}

function setMute(yid, opts) {
  opts = opts || {};
  const got = ensureRec(yid);
  if (!got) return { ok: false, reason: 'args' };
  got.rec.muteUntil = Object.prototype.hasOwnProperty.call(opts, 'until')
    ? opts.until
    : MR.untilFromTtl(opts.ttlSec);
  got.rec.reason = MR.sanitizeReason(opts.reason);
  got.rec.by = String(opts.by || 'mod').slice(0, 64);
  got.rec.at = Date.now();
  save();
  return { ok: true, yid: got.id, until: got.rec.muteUntil, reason: got.rec.reason };
}

function clearBan(yid) {
  const got = ensureRec(yid);
  if (!got) return { ok: false, reason: 'args' };
  got.rec.banUntil = 0;
  save();
  return { ok: true, yid: got.id };
}

function clearMute(yid) {
  const got = ensureRec(yid);
  if (!got) return { ok: false, reason: 'args' };
  got.rec.muteUntil = 0;
  save();
  return { ok: true, yid: got.id };
}

function banIpInfo(rawIp, now) {
  const ip = sanitizeIp(rawIp);
  if (!ip) return null;
  const s = sanctionsIp[ip];
  if (!s || !MR.isActive(s.banUntil, now)) return null;
  return { until: s.banUntil, reason: s.reason || '', by: s.by || '', ip: ip };
}

function muteIpInfo(rawIp, now) {
  const ip = sanitizeIp(rawIp);
  if (!ip) return null;
  const s = sanctionsIp[ip];
  if (!s || !MR.isActive(s.muteUntil, now)) return null;
  return { until: s.muteUntil, reason: s.reason || '', by: s.by || '', ip: ip };
}

function setBanIp(rawIp, opts) {
  opts = opts || {};
  const ip = sanitizeIp(rawIp);
  if (!ip) return { ok: false, reason: 'args' };
  if (!sanctionsIp[ip]) sanctionsIp[ip] = { banUntil: 0, muteUntil: 0, reason: '', by: '', at: 0 };
  const s = sanctionsIp[ip];
  s.banUntil = Object.prototype.hasOwnProperty.call(opts, 'until')
    ? opts.until
    : MR.untilFromTtl(opts.ttlSec);
  s.reason = MR.sanitizeReason(opts.reason);
  s.by = String(opts.by || 'mod').slice(0, 64);
  s.at = Date.now();
  saveIp();
  return { ok: true, ip: ip, until: s.banUntil, reason: s.reason };
}

function setMuteIp(rawIp, opts) {
  opts = opts || {};
  const ip = sanitizeIp(rawIp);
  if (!ip) return { ok: false, reason: 'args' };
  if (!sanctionsIp[ip]) sanctionsIp[ip] = { banUntil: 0, muteUntil: 0, reason: '', by: '', at: 0 };
  const s = sanctionsIp[ip];
  s.muteUntil = Object.prototype.hasOwnProperty.call(opts, 'until')
    ? opts.until
    : MR.untilFromTtl(opts.ttlSec);
  s.reason = MR.sanitizeReason(opts.reason);
  s.by = String(opts.by || 'mod').slice(0, 64);
  s.at = Date.now();
  saveIp();
  return { ok: true, ip: ip, until: s.muteUntil, reason: s.reason };
}

function clearBanIp(rawIp) {
  const ip = sanitizeIp(rawIp);
  if (!ip) return { ok: false, reason: 'args' };
  if (sanctionsIp[ip]) {
    sanctionsIp[ip].banUntil = 0;
    saveIp();
  }
  return { ok: true, ip: ip };
}

function clearMuteIp(rawIp) {
  const ip = sanitizeIp(rawIp);
  if (!ip) return { ok: false, reason: 'args' };
  if (sanctionsIp[ip]) {
    sanctionsIp[ip].muteUntil = 0;
    saveIp();
  }
  return { ok: true, ip: ip };
}

function dayStamp(now) {
  const d = new Date(now || Date.now());
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return d.getUTCFullYear() + '-' + m + '-' + day;
}

function sanitizeLogRow(rec) {
  if (!rec || typeof rec !== 'object') return {};
  const out = Object.create(null);
  for (const k of Object.keys(rec)) {
    if (k === '__proto__' || k === 'constructor') continue;
    const val = rec[k];
    if (typeof val === 'string') {
      out[k] = val.slice(0, 512);
    } else if (typeof val === 'number' || typeof val === 'boolean' || val === null) {
      out[k] = val;
    } else if (typeof val === 'object') {
      try {
        const s = JSON.stringify(val);
        out[k] = s.length > 512 ? JSON.parse(s.slice(0, 510) + '}') : val;
      } catch (_) {
        out[k] = String(val).slice(0, 256);
      }
    }
  }
  return out;
}

function log(kind, rec) {
  const k = String(kind || 'event').slice(0, 24);
  const row = Object.assign({ t: k, at: Date.now() }, sanitizeLogRow(rec));
  let line;
  try { line = JSON.stringify(row); } catch (e) { return; }
  ensureDir();
  const file = path.join(DIR, 'log-' + dayStamp(row.at) + '.jsonl');
  enqueue('log', () => fs.promises.appendFile(file, line + '\n', 'utf8'));
}

async function pruneOldLogs(retentionDays = 7) {
  try {
    ensureDir();
    const files = await fs.promises.readdir(DIR);
    const now = Date.now();
    const maxAgeMs = Math.max(1, retentionDays) * 86400000;
    for (const f of files) {
      const m = f.match(/^log-(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (m && m[1]) {
        const logDate = Date.parse(m[1] + 'T00:00:00Z');
        if (Number.isFinite(logDate) && (now - logDate) > maxAgeMs) {
          try {
            await fs.promises.unlink(path.join(DIR, f));
            console.log('[mod] Pruned old log file:', f);
          } catch (_) {}
        }
      }
    }
  } catch (e) {
    if (e && e.code !== 'ENOENT') console.error('[mod] pruneOldLogs err:', e && e.message);
  }
}

function report(rec) {
  const row = {
    t: 'report',
    at: Date.now(),
    fromYid: MR.sanitizeYid(rec && rec.fromYid) || '',
    fromName: String((rec && rec.fromName) || '').slice(0, 16),
    targetYid: MR.sanitizeYid(rec && rec.targetYid) || '',
    targetName: String((rec && rec.targetName) || '').slice(0, 16),
    text: MR.sanitizeReason(rec && rec.text).slice(0, MR.REPORT_MAX)
  };
  if (!row.fromYid) return { ok: false, reason: 'args' };
  log('report', row);
  ensureDir();
  const file = path.join(DIR, 'reports.jsonl');
  let line;
  try { line = JSON.stringify(row); } catch (e) { return { ok: false, reason: 'args' }; }
  enqueue('reports', () => fs.promises.appendFile(file, line + '\n', 'utf8'));
  return { ok: true };
}

function flush() {
  return Promise.all([...writeChains.values()]).then(noop, noop);
}

module.exports = {
  DIR: DIR,
  load: load,
  banInfo: banInfo,
  muteInfo: muteInfo,
  banIpInfo: banIpInfo,
  muteIpInfo: muteIpInfo,
  setBan: setBan,
  setMute: setMute,
  setBanIp: setBanIp,
  setMuteIp: setMuteIp,
  clearBan: clearBan,
  clearMute: clearMute,
  clearBanIp: clearBanIp,
  clearMuteIp: clearMuteIp,
  sanitizeIp: sanitizeIp,
  log: log,
  pruneOldLogs: pruneOldLogs,
  report: report,
  flush: flush,
  snapshot: snapshot,
  snapshotIp: snapshotIp
};
