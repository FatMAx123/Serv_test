// ============================================================
//  TESTS / DEV-TOOLS-ISOLATION.TEST.JS
//  Редактор мира и шоурум — только в локальной папке проекта и в локальной GM-сборке:
//   - релизный клиент (build-client → Render / Яндекс Игры) их не содержит, страж валит сборку;
//   - релизные страницы несут флаг __PS_RELEASE_BUILD → загрузчик редактора и F2 выключены;
//   - на боевой VPS (deploy-vps / sync-client-vps) их файлы не уезжают и подчищаются;
//   - GM-сборка (build-gm) их содержит.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

module.exports = async function (t) {
  t.suite('dev-tools: релизная сборка клиента без редактора и шоурума');
  const bc = read('scripts', 'build-client.js');
  t.ok(/'game\.html'/.test(bc) && !/'editor\.html'/.test(bc) && !/'showroom\.html'/.test(bc), 'в релиз копируются только игровые страницы (без editor.html / showroom.html)');
  t.ok(/name\.startsWith\('editor'\) && name !== 'editor-overrides-data\.js'/.test(bc) && /name\.startsWith\('showroom'\)/.test(bc), 'editor*.js и showroom*.js не копируются (данные мира editor-overrides-data.js — копируются)');
  t.ok(/__PS_RELEASE_BUILD = true/.test(bc), 'в релизные страницы вставляется флаг __PS_RELEASE_BUILD');
  t.ok(/BUILD-CLIENT_FATAL/.test(bc) && /process\.exit\(1\)/.test(bc), 'страж: попадание редактора/шоурума в билд роняет сборку');
  // Регулярка стража: ловит инструменты, но не данные мира
  const reSrc = /const DEV_ONLY_FILE_RE = (\/.*\/i);/.exec(bc);
  t.ok(!!reSrc, 'страж-регулярка найдена');
  if (reSrc) {
    const re = eval(reSrc[1]); // eslint-disable-line no-eval
    t.ok(re.test('editor.js') && re.test('editor-engine-layout.js') && re.test('editor.html') && re.test('editor-engine.css'), 'страж ловит файлы редактора');
    t.ok(re.test('showroom.js') && re.test('showroom.html') && re.test('showroom.css'), 'страж ловит файлы шоурума');
    t.ok(!re.test('editor-overrides.json') && !re.test('editor-overrides-data.js') && !re.test('game.html'), 'страж не трогает данные мира и игру');
  }
  const distDir = path.join(ROOT, 'dist', 'client');
  if (fs.existsSync(path.join(distDir, 'game.html'))) {
    const leaks = [];
    (function scan(d) {
      for (const it of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, it.name);
        if (it.isDirectory()) scan(p);
        else if (/^(editor(?!-overrides)|showroom)/i.test(it.name)) leaks.push(path.relative(distDir, p));
      }
    })(distDir);
    t.eq(leaks, [], 'в текущем dist/client нет файлов редактора и шоурума');
    t.ok(fs.readFileSync(path.join(distDir, 'game.html'), 'utf8').includes('__PS_RELEASE_BUILD = true'), 'dist/client/game.html помечен как релиз');
    t.ok(!fs.readFileSync(path.join(distDir, 'menu.html'), 'utf8').includes('mm-btn-showroom'), 'в релизном меню нет кнопки шоурума');
  } else {
    t.ok(true, 'dist/client не собран — проверка готового билда пропущена');
  }

  t.suite('dev-tools: релиз выключает загрузчик редактора (F2)');
  const boot = read('client', 'js', 'boot.module.js');
  t.ok(/const EDITOR_SCRIPTS = PS_RELEASE_BUILD \? \[\] :/.test(boot), 'в релизе список скриптов редактора пуст');
  t.ok(/__ensureSceneEditor = async function \(game\) \{\s*\n\s*if \(PS_RELEASE_BUILD\) return null;/.test(boot), 'в релизе __ensureSceneEditor сразу возвращает null (без /api/editor/*)');
  const mainJs = read('client', 'js', 'main.js');
  t.ok(/if \(e\.key === 'F2'\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*if \(window\.__PS_RELEASE_BUILD === true\) return;/.test(mainJs), 'F2 в релизе ничего не делает');

  t.suite('dev-tools: редактор и шоурум не уезжают на боевой VPS');
  const dv = read('scripts', 'deploy-vps.js');
  t.ok(/--exclude="client\/js\/editor\.js"/.test(dv) && /--exclude="client\/js\/editor-engine-layout\.js"/.test(dv) && /--exclude="client\/js\/showroom\.js"/.test(dv), 'deploy-vps исключает editor.js, editor-engine-layout.js, showroom.js');
  t.ok(/rm -f \$\{REMOTE_DIR\}\/client\/js\/editor\.js/.test(dv), 'deploy-vps подчищает остатки редактора на VPS');
  const sc = read('scripts', 'sync-client-vps.js');
  t.ok(/--exclude="client\/js\/editor\.js"/.test(sc) && /client\/js\/editor-engine-layout\.js/.test(sc) && /client\/editor\.html/.test(sc), 'sync-client-vps исключает и подчищает редактор и шоурум');

  t.suite('dev-tools: локальная GM-сборка содержит редактор и шоурум');
  const gm = read('scripts', 'build-gm.js');
  t.ok(/'editor\.html'/.test(gm) && /'showroom\.html'/.test(gm), 'build-gm копирует editor.html и showroom.html');
  t.ok(!/__PS_RELEASE_BUILD/.test(gm), 'GM-сборка не помечается как релиз (редактор работает)');
};
