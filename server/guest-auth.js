// SERVER / GUEST-AUTH.JS — единая проверка владения гостевым аккаунтом (local_*).
// Раньше проверка была размазана по doLogin / chars API / set-codeword и в каждом
// месте имела дыры: токен сверялся только с первым персонажем, новый слот и
// /api/chars/create не требовали токена, set-codeword принимал любой yid.
//
// Этап 4 (C4/H3): гостевые токены аккаунта с ключом — СЛУЧАЙНЫЕ и отзываемые.
//  - Раньше токен = HMAC(захардкоженная соль, хэш ключа): вечный, одинаковый на всех
//    устройствах, вычислим любым, у кого есть дамп реестра; отозвать нельзя.
//  - Теперь при вводе ключа выдаётся новый случайный токен (32 байта). Его хэш
//    добавляется в pr.guestTokenHashes всех персонажей аккаунта (до GUEST_TOKENS_MAX,
//    по умолчанию 5 устройств; старые вытесняются). Хранится в профилях (БД) — работает
//    и в кластере, где у каждого воркера свой экземпляр реестра ключей.
//  - Смена ключа (set-codeword) или revokeAll() отзывает все токены аккаунта.
//  - Миграция: старый вычисляемый токен принимается, пока GUEST_LEGACY_TOKENS !== '0',
//    и сразу заменяется новым случайным (сервер отдаёт его клиенту в welcome/chars API).
//  - TOFU: аккаунт с персонажами, но без единого хэша токена (очень старые профили),
//    закрепляет токен первым входом. GUEST_TOFU=0 запрещает это (новые гости без
//    персонажей не затрагиваются).
'use strict';

const crypto = require('crypto');
const AUTH = require('./auth.js');

const GUEST_YID_RE = /^local_[a-z0-9_-]{4,64}$/;
const MIN_TOKEN_LEN = 16;

function tokensMax() {
  const n = parseInt(process.env.GUEST_TOKENS_MAX || '5', 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 20) : 5;
}
function legacyTokensAllowed() { return process.env.GUEST_LEGACY_TOKENS !== '0'; }
function tofuAllowed() { return process.env.GUEST_TOFU !== '0'; }

function looksLikeGuest(yid) {
  return String(yid || '').toLowerCase().startsWith('local_');
}

/**
 * yid допустим? Гостевые id — строго в нижнем регистре и только [a-z0-9_-]:
 * иначе `local_x.y` и `local_x_y` (или `LOCAL_X` на Windows) попадали в один
 * файл профиля через safeName() и давали две сессии на один профиль (дюп).
 */
function isValidYid(yid) {
  const s = String(yid || '');
  if (!s || s.length > 128) return false;
  if (looksLikeGuest(s)) return GUEST_YID_RE.test(s);
  return true;
}

function isGuestYid(yid) {
  return GUEST_YID_RE.test(String(yid || ''));
}

/** Все хэши токенов, которые принимает профиль/игрок. */
function tokenHashesOf(pr) {
  const out = [];
  if (!pr) return out;
  if (Array.isArray(pr.guestTokenHashes)) {
    for (const h of pr.guestTokenHashes) if (typeof h === 'string' && h) out.push(h);
  }
  if (typeof pr.guestTokenHash === 'string' && pr.guestTokenHash) out.push(pr.guestTokenHash);
  return out;
}
function tokenMatches(pr, tokenHash) {
  return !!tokenHash && tokenHashesOf(pr).includes(tokenHash);
}

/** Реестр ключей (AccountKeys) — хранит хэши токенов аккаунта с ключом и без персонажей. */
let _registry = null;
function setTokenRegistry(r) { _registry = r || null; }
function registryHashes(yid) {
  try { return (_registry && _registry.tokenHashesFor && _registry.tokenHashesFor(yid)) || []; } catch (_) { return []; }
}

/** Онлайн-игроки аккаунта (ставит server.js), чтобы запись токена не затиралась сохранением из памяти. */
let _onlineResolver = null;
function setOnlineResolver(fn) { _onlineResolver = typeof fn === 'function' ? fn : null; }
function onlineOf(yid) {
  try { return (_onlineResolver && _onlineResolver(yid)) || []; } catch (_) { return []; }
}

/**
 * Проверка владения гостевым аккаунтом.
 * @returns {Promise<{ok:boolean, reason?:string, tokenHash?:string, legacy?:boolean, tofu?:boolean, profiles?:Array}>}
 *   legacy=true — принят старый вычисляемый токен, его нужно заменить (issueToken).
 */
async function verifyGuestOwnership(DB, AccountKeys, yid, guestToken) {
  if (!isGuestYid(yid)) return { ok: false, reason: 'bad_yid' };
  const token = typeof guestToken === 'string' ? guestToken.trim() : '';
  if (token.length < MIN_TOKEN_LEN) {
    if (process.env.ALLOW_INSECURE_DEV === '1' && process.env.NODE_ENV !== 'production') {
      return { ok: true, devBypass: true };
    }
    return { ok: false, reason: 'token_required' };
  }
  const tokenHash = AUTH.hashGuestToken(token);

  const keyHash = AccountKeys && AccountKeys.byYid ? AccountKeys.byYid.get(yid) : null;
  // legacy-токены выдавались от хэша ключа; после смены параметров хэша (этап 4.2) — и от прежних хэшей
  const keyHashes = keyHash ? ((AccountKeys.keyHashesOf && AccountKeys.keyHashesOf(yid)) || [keyHash]) : [];
  const isDerived = keyHashes.some(h => AUTH.deriveGuestToken(h) === token);

  let list = [];
  try { list = (await DB.listChars(yid)) || []; } catch (_) { list = []; }
  const profiles = [];
  const reg = registryHashes(yid);
  let anyHash = reg.length > 0, matched = reg.includes(tokenHash);
  for (const c of list) {
    const cId = c.id || c.charId || 'c0';
    let pr = null;
    try { pr = await DB.load(yid, cId); } catch (_) { pr = null; }
    if (!pr) continue;
    profiles.push({ charId: cId, pr });
    if (tokenHashesOf(pr).length) anyHash = true;
    if (tokenMatches(pr, tokenHash)) matched = true;
  }

  // Старый вычисляемый токен (в т.ч. записанный в профиль как guestTokenHash) — только в окне миграции.
  if (isDerived) {
    if (!legacyTokensAllowed()) return { ok: false, reason: 'legacy_token' };
    return { ok: true, tokenHash, legacy: true, profiles };
  }
  if (matched) return { ok: true, tokenHash, profiles };
  if (keyHash) return { ok: false, reason: 'bad_token' };
  if (anyHash) return { ok: false, reason: 'bad_token' };
  // Нет ни ключа, ни хэшей.
  if (profiles.length > 0 && !tofuAllowed()) return { ok: false, reason: 'tofu_disabled' };
  return { ok: true, tokenHash, tofu: true, profiles };
}

/** Записать tokenHash в профили аккаунта без хэшей (TOFU) — после успешной проверки. */
async function pinTokenHash(DB, yid, own, onlineCharIds) {
  if (!own || !own.ok || !own.tofu || !own.tokenHash || !own.profiles) return;
  for (const { charId, pr } of own.profiles) {
    if (tokenHashesOf(pr).length) continue;
    if (onlineCharIds && onlineCharIds.has(charId)) continue;
    pr.guestTokenHashes = [own.tokenHash];
    try { await DB.save(yid, pr, charId); } catch (_) {}
  }
}

/** Объединение хэшей токенов всех персонажей аккаунта (для нового слота). */
async function accountTokenHashes(DB, yid) {
  const set = new Set();
  let list = [];
  try { list = (await DB.listChars(yid)) || []; } catch (_) { list = []; }
  for (const c of list) {
    let pr = null;
    try { pr = await DB.load(yid, c.id || c.charId || 'c0'); } catch (_) { pr = null; }
    for (const h of tokenHashesOf(pr)) set.add(h);
  }
  for (const p of onlineOf(yid)) for (const h of tokenHashesOf(p)) set.add(h);
  for (const h of registryHashes(yid)) set.add(h);
  return [...set].slice(0, tokensMax());
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Применить изменение набора токенов ко всем профилям аккаунта (БД + онлайн-игроки в памяти).
 * @param {(hashes:string[], pr:object)=>string[]} mutate
 */
async function _mutateTokens(DB, yid, mutate) {
  const online = onlineOf(yid);
  const onlineByChar = new Map();
  for (const p of online) {
    if (!p) continue;
    p.guestTokenHashes = mutate(tokenHashesOf(p), p);
    p.guestTokenHash = null;
    onlineByChar.set(String(p.charId || 'c0'), p);
  }
  if (_registry && _registry.mutateTokens) {
    try { await _registry.mutateTokens(yid, mutate); } catch (e) { console.error('[GuestAuth] registry tokens', yid, e && e.message); }
  }
  let list = [];
  try { list = (await DB.listChars(yid)) || []; } catch (_) { list = []; }
  for (const c of list) {
    const cId = c.id || c.charId || 'c0';
    let pr = null;
    try { pr = await DB.load(yid, cId); } catch (_) { pr = null; }
    if (!pr) continue;
    const onl = onlineByChar.get(String(cId));
    pr.guestTokenHashes = onl ? onl.guestTokenHashes.slice() : mutate(tokenHashesOf(pr), pr);
    pr.guestTokenHash = null;
    try { await DB.save(yid, pr, cId); } catch (e) { console.error('[GuestAuth] save', yid, cId, e && e.message); }
  }
}

/**
 * Выдать новый случайный токен аккаунту (вход по ключу / замена legacy-токена).
 * @param {{dropHash?:string}} [opts] dropHash — хэш, который нужно удалить (старый legacy-токен)
 * @returns {Promise<{token:string, tokenHash:string}>}
 */
async function issueToken(DB, yid, opts) {
  const token = newToken();
  const h = AUTH.hashGuestToken(token);
  const drop = new Set();
  if (opts && opts.dropHash) drop.add(opts.dropHash);
  if (opts && opts.keyHash) drop.add(AUTH.hashGuestToken(AUTH.deriveGuestToken(opts.keyHash)));
  if (opts && Array.isArray(opts.keyHashes)) for (const kh of opts.keyHashes) drop.add(AUTH.hashGuestToken(AUTH.deriveGuestToken(kh)));
  const max = tokensMax();
  await _mutateTokens(DB, yid, (hashes) => [h].concat(hashes.filter(x => x !== h && !drop.has(x))).slice(0, max));
  return { token, tokenHash: h };
}

/** Отозвать ВСЕ токены аккаунта; при keep — оставить только новый выданный. */
async function revokeAll(DB, yid, opts) {
  const keepNew = !!(opts && opts.issueNew);
  const token = keepNew ? newToken() : null;
  const h = token ? AUTH.hashGuestToken(token) : null;
  await _mutateTokens(DB, yid, () => (h ? [h] : []));
  return { token, tokenHash: h };
}

module.exports = {
  isValidYid, isGuestYid, looksLikeGuest, verifyGuestOwnership, pinTokenHash,
  tokenHashesOf, tokenMatches, issueToken, accountTokenHashes, revokeAll, setOnlineResolver, setTokenRegistry, MIN_TOKEN_LEN
};
