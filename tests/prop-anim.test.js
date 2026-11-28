// ============================================================
//  TESTS / PROP-ANIM.TEST.JS — анимированные пропсы (поле anim в сцене).
//  Дирижабль у рынка парит: { anim: { type: 'float', amp, period, sway } }.
//   - поле переживает запекание мира (scripts/bake-world.js);
//   - клиент (world-content.js) регистрирует такую группу и покачивает её вокруг
//     позиции из сцены, не трогая X/Z; пока открыт редактор — не двигает;
//   - кадр игры (main.js) вызывает updateAnimatedProps;
//   - раскладка рынка ставит anim дирижаблю.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function loadWorldContent() {
  const code = fs.readFileSync(path.join(ROOT, 'client', 'js', 'world-content.js'), 'utf8');
  const mockThree = {
    Group: function () { this.children = []; this.add = () => {}; },
    Object3D: function () {},
    Matrix4: function () {},
    Quaternion: function () {},
    Vector3: function () {},
    Euler: function () {},
  };
  const win = { THREE: mockThree, PropsLibrary: { getById: () => null, items: [] } };
  const sandbox = {
    window: win, console, Math, Map, Set, Array, Object, String, Number, Boolean, JSON, Date, RegExp, Error, Promise,
    setTimeout, clearTimeout, THREE: mockThree, document: { createElement: () => ({}) }, performance: { now: () => 0 },
    PropsLibrary: win.PropsLibrary,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'client/js/world-content.js' });
  return new win.WorldContent({ THREE: mockThree, scene: { add: () => {} } });
}

function fakeGroup(p) {
  const g = { parent: {}, visible: true, userData: { propData: p } };
  g.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
  g.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
  return g;
}

module.exports = function (t) {
  t.suite('prop-anim: поле anim проходит через запекание мира');
  const Bake = require(path.join(ROOT, 'scripts', 'bake-world.js'));
  const anim = { type: 'float', amp: 0.8, period: 9, sway: 0.03 };
  const world = Bake.bakeWorld({ customProps: [{ id: 'mkt_airship_01', meshType: 'fbx', modelId: 'airship', position: { x: 1, y: 2, z: 3 }, anim }] });
  t.ok(world.customProps && world.customProps.length === 1, 'дирижабль в мире');
  t.eq(JSON.stringify(world.customProps[0].anim), JSON.stringify(anim), 'anim не потерялся');

  t.suite('prop-anim: клиент покачивает пропс вокруг позиции из сцены');
  const wc = loadWorldContent();
  t.ok(typeof wc.updateAnimatedProps === 'function', 'updateAnimatedProps есть');
  const p = { id: 'mkt_airship_01', position: { x: 10, y: 90, z: -5 }, rotation: { x: 0, y: 1.2, z: 0 }, anim };
  const g = fakeGroup(p);
  wc._registerAnimatedProp(g, p);
  const still = { id: 'mkt_crate_01', position: { x: 0, y: 0, z: 0 } };
  wc._registerAnimatedProp(fakeGroup(still), still);
  t.eq(wc._animatedProps.size, 1, 'регистрируются только пропсы с anim');
  const ys = [];
  let xzOk = true, rotOk = true;
  for (let i = 0; i < 40; i++) {
    wc.updateAnimatedProps(i * 0.25);
    ys.push(g.position.y);
    if (g.position.x !== 10 || g.position.z !== -5) xzOk = false;
    if (Math.abs(g.rotation.y - 1.2) > 0.05 || Math.abs(g.rotation.x) > 0.05 || Math.abs(g.rotation.z) > 0.05) rotOk = false;
  }
  const lo = Math.min(...ys), hi = Math.max(...ys);
  t.ok(hi - lo > 0.8, 'высота меняется во времени (размах ' + (hi - lo).toFixed(2) + ' м)');
  t.ok(lo >= 90 - 0.8 - 1e-9 && hi <= 90 + 0.8 + 1e-9, 'в пределах amp вокруг высоты из сцены');
  t.ok(xzOk, 'X/Z не трогаются');
  t.ok(rotOk, 'крен и тангаж малые, рысканье вокруг поворота из сцены');

  t.suite('prop-anim: редактор открыт — пропс стоит');
  wc.game = { editor: { enabled: true } };
  g.position.set(1, 2, 3);
  wc.updateAnimatedProps(5);
  t.eq(g.position.y, 2, 'анимация на паузе, пока открыт редактор');
  wc.game = { editor: { enabled: false } };
  g.visible = false;
  wc.updateAnimatedProps(5);
  t.eq(g.position.y, 2, 'невидимая группа не обновляется');

  t.suite('prop-anim: подключено в кадр игры и в раскладку рынка');
  const mainSrc = fs.readFileSync(path.join(ROOT, 'client', 'js', 'main.js'), 'utf8');
  t.ok(/worldContent\.updateAnimatedProps\(elapsed\)/.test(mainSrc), 'main.js вызывает updateAnimatedProps каждый кадр');
  const wcSrc = fs.readFileSync(path.join(ROOT, 'client', 'js', 'world-content.js'), 'utf8');
  t.ok(/this\._registerAnimatedProp\(group, p\)/.test(wcSrc), 'spawnCustomPropMesh регистрирует анимированные группы');
  const layoutSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'market-square', 'layout_market.js'), 'utf8');
  t.ok(/ship\.anim = \{ type: 'float'/.test(layoutSrc), 'дирижаблю у рынка задан anim');
};
