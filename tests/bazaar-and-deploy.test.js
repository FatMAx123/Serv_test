// ============================================================
//  TESTS / BAZAAR-AND-DEPLOY.TEST.JS
//  Проверка интеграции библиотеки bazaar (GLB/Draco + WebP)
//  в каталог редактора и скриптов ручного деплоя мира.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function loadInSandbox(relPath, extraGlobals = {}) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const win = Object.assign({}, extraGlobals.window || {});
  const sandbox = {
    window: win,
    globalThis: win,
    console,
    Math,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    JSON,
    Date,
    RegExp,
    Error,
    Promise,
    setTimeout,
    clearTimeout,
    ...extraGlobals,
  };
  sandbox.window = win;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: relPath });
  return sandbox;
}

module.exports = function (t) {
  t.suite('bazaar-and-deploy: библиотека Восточного базара (GLB) и ручной деплой мира');

  // 1. Проверка каталога PropsLibrary
  const plibSandbox = loadInSandbox('client/js/props-library-data.js');
  const PropsLibrary = plibSandbox.PropsLibrary || plibSandbox.window.PropsLibrary;
  t.ok(PropsLibrary, 'PropsLibrary загружается из client/js/props-library-data.js');

  const categories = PropsLibrary.getCategories();
  t.ok(categories.some(c => c.id === 'bazaar' && c.icon === '🏺'), 'категория bazaar зарегистрирована в PropsLibrary');

  const bazaarItems = PropsLibrary.getByCategory('bazaar');
  t.eq(bazaarItems.length, 86, 'в категории bazaar ровно 86 оптимизированных Draco GLB моделей');

  let missingAssets = [];
  for (const item of bazaarItems) {
    const glbPath = path.join(ROOT, 'client', 'assets', 'props', item.file);
    const iconPath = path.join(ROOT, 'client', 'assets', 'props', 'icons', `${item.id}.webp`);
    const texPath = path.join(ROOT, 'client', 'assets', 'props', 'textures', `${item.id}.webp`);
    if (item.format !== 'glb' || !item.file.startsWith('bazaar/') || !item.file.endsWith('.glb')) {
      missingAssets.push(`bad-meta:${item.id}:${item.file}:${item.format}`);
    }
    if (item.defaultScale !== 1) {
      missingAssets.push(`bad-scale:${item.id}:${item.defaultScale}`);
    }
    if (!fs.existsSync(glbPath)) missingAssets.push(`missing-glb:${item.id}`);
    if (!fs.existsSync(iconPath)) missingAssets.push(`missing-icon:${item.id}`);
    if (!fs.existsSync(texPath)) missingAssets.push(`missing-tex:${item.id}`);
  }
  t.eq(missingAssets.length, 0, `все 86 моделей базара имеют GLB, WebP-текстуру и иконку (${missingAssets.slice(0, 3).join(', ')})`);

  // Поиск по разным форматам ключа в PropsLibrary.getById
  t.ok(PropsLibrary.getById('wmfiaaldw'), 'getById по id (wmfiaaldw)');
  t.ok(PropsLibrary.getById('bazaar/wmfiaaldw.glb'), 'getById по относительному пути (bazaar/wmfiaaldw.glb)');
  t.ok(PropsLibrary.getById('wmfiaaldw.glb'), 'getById по имени файла (wmfiaaldw.glb)');
  t.ok(PropsLibrary.getById('bazaar/wmfiaaldw'), 'getById по пути без расширения (bazaar/wmfiaaldw)');
  t.ok(PropsLibrary.getById('Stump_4'), 'регрессия FBX: getById по имени без расширения (Stump_4)');

  // 2. Проверка карты текстур PROP_TEXTURES_DATA (86 моделей + 8 декалей/вариантов = 94)
  const ptexSandbox = loadInSandbox('client/js/prop-textures-data.js');
  const texMap = ptexSandbox.window.PROP_TEXTURES_DATA;
  t.ok(texMap instanceof ptexSandbox.Map, 'PROP_TEXTURES_DATA является Map');
  const extraTexIds = ['phhibtp2', 'phlvmjp2', 'tl0gedmka', 'ubqmdb2ew', 'wdipagu', 'xdhhdgq', 'xdhhdhl', 'xdhhdit'];
  const expectedTexIds = bazaarItems.map(i => i.id).concat(extraTexIds);
  const missingTexEntries = expectedTexIds.filter(id => {
    const texFile = path.join(ROOT, 'client', 'assets', 'props', 'textures', `${id}.webp`);
    return texMap.get(id) !== `${id}.webp` || texMap.get(`${id}.webp`) !== `${id}.webp` || !fs.existsSync(texFile);
  });
  t.eq(missingTexEntries.length, 0, `все 94 текстуры базара присутствуют на диске и в PROP_TEXTURES_DATA (${missingTexEntries.join(', ')})`);

  // 3. Проверка Draco WASM декодеров и резолвера расширений в WorldContent
  for (const dracoFile of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) {
    t.ok(fs.existsSync(path.join(ROOT, 'client', 'js', 'libs', 'draco', dracoFile)), `Draco файл ${dracoFile} присутствует в client/js/libs/draco/`);
  }

  const mockThree = {
    Group: function () { this.children = []; this.add = () => {}; },
    Object3D: function () { this.position = { set: () => {} }; this.rotation = { set: () => {} }; this.scale = { set: () => {} }; this.updateMatrix = () => {}; this.matrix = {}; },
    Matrix4: function () {},
    Quaternion: function () {},
    Vector3: function () {},
    Euler: function () {},
  };
  const wcSandbox = loadInSandbox('client/js/world-content.js', {
    THREE: mockThree,
    window: { THREE: mockThree, PropsLibrary },
    document: { createElement: () => ({}) },
    performance: { now: () => 0 },
    PropsLibrary,
  });
  const wc = new wcSandbox.window.WorldContent({ THREE: mockThree, scene: { add: () => {} } });
  const fi = wc.foliageInstancer;
  t.eq(fi.getResolvedFileName({ modelFile: 'bazaar/wmfiaaldw.glb', meshType: 'glb' }), 'bazaar/wmfiaaldw.glb', 'getResolvedFileName сохраняет .glb путь');
  t.eq(fi.getResolvedFileName({ modelId: 'xemmcdc', meshType: 'xemmcdc' }), 'bazaar/xemmcdc.glb', 'getResolvedFileName берет bazaar/*.glb из PropsLibrary');
  t.eq(fi.getResolvedFileName({ file: 'bazaar/wmfiaaldw.glb', meshType: 'glb' }), 'bazaar/wmfiaaldw.glb', 'getResolvedFileName поддерживает поле file без modelFile');
  t.eq(fi.getResolvedFileName({ meshType: 'OakTree' }), 'OakTree.fbx', 'getResolvedFileName добавляет .fbx только для legacy имён без расширения');

  // 4. Проверка скрипта ручного деплоя (безопасность: не трогает VPS)
  const deployWorldSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'deploy-world-client.js'), 'utf8');
  t.ok(deployWorldSrc.includes('--build-only'), 'deploy-world-client.js поддерживает режим --build-only для сборки dist/client');
  t.ok(deployWorldSrc.includes('deploy-render.js'), 'deploy-world-client.js делегирует публикацию в deploy-render.js');
  t.ok(!deployWorldSrc.includes('deploy-vps') && !deployWorldSrc.includes('auto-deploy-all'), 'deploy-world-client.js изолирован от боевого VPS и auto-deploy-all');
};
