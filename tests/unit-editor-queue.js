// Юнит-тест очереди сохранения редактора: имитируем сервер с задержкой и ревизиями.
const fs = require('fs'), vm = require('vm');
const ls = new Map();
global.window = globalThis;
global.localStorage = { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
global.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} }, addEventListener() {} };
global.location = { port: '3000' };
const listeners = {};
window.addEventListener = (n, f) => { (listeners[n] = listeners[n] || []).push(f); };
window.removeEventListener = (n, f) => { listeners[n] = (listeners[n] || []).filter(x => x !== f); };
global.THREE = new Proxy(function () {}, { get: () => function () { return new Proxy({}, { get: () => () => {} }); } });
vm.runInThisContext(fs.readFileSync(require('path').join(__dirname, '..', 'shared', 'world-metrics.js'), 'utf8'));
try { vm.runInThisContext(fs.readFileSync(require('path').join(__dirname, '..', 'client', 'js', 'editor.js'), 'utf8')); } catch (e) { console.log('editor.js load error', e.message); }
const SE = window.SceneEditor; if (!SE) { console.log('нет SceneEditor'); process.exit(1); }
// сервер
let disk = { rev: 5, customProps: [] }; let writes = 0;
global.fetch = async (url, o) => {
  const body = JSON.parse(o.body); writes++;
  await new Promise(r => setTimeout(r, 150));
  if (body.baseRev != null && body.baseRev !== disk.rev) return { status: 409, json: async () => ({ ok: false, code: 'ECONFLICT', currentRev: disk.rev }) };
  disk = Object.assign({}, body, { rev: disk.rev + 1 }); delete disk.baseRev;
  return { status: 200, json: async () => ({ ok: true, rev: disk.rev, savedAt: Date.now() }) };
};
window.EDITOR_OVERRIDES_REV = 5;
const ed = Object.create(SE.prototype); ed.enabled = true; ed.game = { addChatMessage: (t) => console.log('  чат:', t) };
const WM = window.WorldMetrics;
(async () => {
  ed._saveInit().readyAt = 0;
  // 5 быстрых правок, каждая вызывает saveToServer (как 25 call-site'ов)
  const ps = [];
  for (let i = 0; i < 5; i++) { WM.CUSTOM_PROPS.push({ id: 'p' + i, position: { x: i, y: 0, z: 0 } }); ps.push(ed.saveToServer(true)); }
  const rs = await Promise.all(ps);
  console.log('результаты:', rs.map(r => r.ok + '/' + r.rev).join(' '), '| записей на сервер:', writes, '| на диске пропов:', disk.customProps.length, 'rev', disk.rev);
  // правка без явного сохранения (drag → только saveToLocalStorage) → автосохранение
  WM.CUSTOM_PROPS[0].position.x = 999; ed.saveToLocalStorage();
  await new Promise(r => setTimeout(r, 2200));
  console.log('автосохранение drag: x на диске =', disk.customProps[0].position.x, 'rev', disk.rev);
  // конфликт: кто-то другой записал
  disk.rev = 50; WM.CUSTOM_PROPS.push({ id: 'z' }); const c = await ed.saveToServer(true);
  console.log('конфликт:', c.ok, c.code, '| пропов на диске не изменилось:', disk.customProps.length);
  process.exit(0);
})();
