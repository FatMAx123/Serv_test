'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const G = require(path.join(ROOT, 'server', 'editor-guard.js'));

module.exports = function (t) {
  t.suite('editor-guard: какие файлы закрыты');
  t.ok(G.isEditorAsset('/editor.html'), 'editor.html');
  t.ok(G.isEditorAsset('/js/editor.js'), 'editor.js');
  t.ok(G.isEditorAsset('/js/editor.js?v=1'), 'editor.js с cache-buster');
  t.ok(G.isEditorAsset('/js/editor-engine-layout.js'), 'layout');
  t.ok(G.isEditorAsset('/css/editor-engine.css'), 'css');
  t.ok(!G.isEditorAsset('/js/editor-overrides-data.js'), 'оверрайды мира — не инструмент');
  t.ok(!G.isEditorAsset('/js/world-content.js'), 'мир не редактор');
  t.ok(!G.isEditorAsset('/game.html'), 'game.html открыт');

  t.suite('editor-guard: токен');
  const p = { yid: 'itest_tok', pid: 42 };
  const key = G.issue(p);
  t.ok(key.length >= 24, 'ключ достаточно длинный');
  t.ok(G.valid(key), 'только что выданный валиден');
  t.ok(!G.valid('abc'), 'короткий мусор невалиден');
  t.ok(!G.valid(key + 'x'), 'чужой ключ невалиден');
  t.ok(G.allowSessionKey('/api/editor/session?k=' + key), 'query k проходит');
  const req = { headers: { cookie: G.COOKIE + '=' + key } };
  t.ok(G.allowAsset(req), 'cookie проходит');
  t.ok(!G.allowAsset({ headers: {} }), 'без cookie нельзя');
  G.revokePid(42);
  t.ok(!G.valid(key), 'после disconnect ключ мёртв');
};
