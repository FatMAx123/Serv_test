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

const sanctions = Object.create(null); // yid -> { banUntil, muteUntil, reason, by, at }
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
  return enqueue('sanctions', () => fs.promises.writeFile(SANCTIONS_FILE, json, 'utf8'));
}

function recOf(yid) {
  const id = MR.sanitizeYid(yid);
  if (!id) return null;
  if (!sanctions[id]) {
    sanctions[id] = { banUntil: 0, muteUntil: 0, reason: '', by: '', at: 0 };
  }
  return { id: id, rec: sanctions[id] };
}

function banInfo(yid, now) {
  const got = recOf(yid);
  if (!got) return null;
  if (!MR.isActive(got.rec.banUntil, now)) return null;
  return { until: got.rec.banUntil, reason: got.rec.reason || '', by: got.rec.by || '' };
}

function muteInfo(yid, now) {
  const got = recOf(yid);
  if (!got) return null;
  if (!MR.isActive(got.rec.muteUntil, now)) return null;
  return { until: got.rec.muteUntil, reason: got.rec.reason || '', by: got.rec.by || '' };
}

function setBan(yid, opts) {
  opts = opts || {};
  const got = recOf(yid);
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
  const got = recOf(yid);
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
  const got = recOf(yid);
  if (!got) return { ok: false, reason: 'args' };
  got.rec.banUntil = 0;
  save();
  return { ok: true, yid: got.id };
}

function clearMute(yid) {
  const got = recOf(yid);
  if (!got) return { ok: false, reason: 'args' };
  got.rec.muteUntil = 0;
  save();
  return { ok: true, yid: got.id };
}

function dayStamp(now) {
  const d = new Date(now || Date.now());
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return d.getUTCFullYear() + '-' + m + '-' + day;
}

function log(kind, rec) {
  const k = String(kind || 'event').slice(0, 24);
  const row = Object.assign({ t: k, at: Date.now() }, rec || {});
  let line;
  try { line = JSON.stringify(row); } catch (e) { return; }
  if (line.length > 2000) line = line.slice(0, 2000);
  ensureDir();
  const file = path.join(DIR, 'log-' + dayStamp(row.at) + '.jsonl');
  enqueue('log', () => fs.promises.appendFile(file, line + '\n', 'utf8'));
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
  setBan: setBan,
  setMute: setMute,
  clearBan: clearBan,
  clearMute: clearMute,
  log: log,
  report: report,
  flush: flush,
  snapshot: snapshot
};
