// ============================================================
//  SERVER / EDITOR-GATE.JS — граница между игровым сервером и редактором мира.
//
//  Редактор мира живёт только на локальной машине. Его серверные модули
//  (editor-guard.js — сессии/ключи редактора, editor-overrides-writer.js — запись
//  мира на диск, http/editor-api.js — HTTP-ручки редактора) в боевой пакет VPS
//  не входят (scripts/deploy-vps.js). Игровой код берёт их только отсюда:
//   - на проде (NODE_ENV=production) или без файлов — пустая заглушка: ключей
//     редактора нет, сессий нет, записи нет, файлы редактора не отдаются;
//   - локально — настоящие модули (их поведение по-прежнему гейтится EDITOR_ENABLED).
// ============================================================
'use strict';

const path = require('path');

const IS_PROD = process.env.NODE_ENV === 'production';

/** require без падения, если модуля редактора нет в пакете. */
function optionalRequire(rel) {
  try {
    return require(rel);
  } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND' && String(e.message || '').indexOf(path.basename(rel)) >= 0) return null;
    throw e;
  }
}

function pathOnly(url) {
  return String(url || '').split('?')[0].split('#')[0].replace(/\\/g, '/').toLowerCase();
}

/** Без редактора: всё, что похоже на файлы редактора/шоурума, не отдаётся никому. */
const STUB_GUARD = Object.freeze({
  COOKIE: 'ps_ed',
  stub: true,
  isEditorAsset: (url) => /(^|\/)(editor[^/]*\.(html|js|css)|showroom[^/]*\.(html|js|css))$/.test(pathOnly(url)) &&
    !/(^|\/)editor-overrides/.test(pathOnly(url)),
  issue: () => null,
  registerToken: () => {},
  revoke: () => {},
  revokePid: () => {},
  pruneExpired: () => {},
  tokens: new Map(),
  valid: () => false,
  allowAsset: () => false,
  allowSessionKey: () => false,
  sessionKey: () => null,
  cookieHeader: () => '',
  isHttpsReq: (req) => !!(req && req.socket && req.socket.encrypted),
  isLoopbackReq: () => false,
  tokenFromQuery: () => '',
  tokenFromHeader: () => '',
  tokenFromCookie: () => ''
});

const realGuard = IS_PROD ? null : optionalRequire('./editor-guard.js');

let _writer;
/** Модуль записи мира редактора (только локально); null на проде. */
function writer() {
  if (_writer === undefined) _writer = IS_PROD ? null : optionalRequire('./editor-overrides-writer.js');
  return _writer;
}

let _editorApi;
/** HTTP-ручки редактора (только локально); null на проде. */
function editorApiModule() {
  if (_editorApi === undefined) _editorApi = IS_PROD ? null : optionalRequire('./http/editor-api.js');
  return _editorApi;
}

module.exports = {
  /** Модули редактора доступны в этой установке (локальная машина). */
  available: !!realGuard,
  EditorGuard: realGuard || STUB_GUARD,
  writer,
  editorApiModule
};
