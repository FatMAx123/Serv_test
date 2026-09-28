// ============================================================
//  SCRIPTS / GUARD-ANTI-ROLLBACK.JS
//  Автоматическая система защиты от откатов (Zero Rollback Guard)
//  Проверяет все архитектурные инварианты C++, uWS, Worker Threads,
//  Zero-Stutter Three.js рендера и блокирует деплой при любых регрессиях.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
let passes = 0;

function check(title, conditionFn) {
  try {
    const ok = conditionFn();
    if (ok) {
      console.log(`  🟢 [PASS] ${title}`);
      passes++;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failures++;
    }
  } catch (err) {
    console.error(`  ❌ [FAIL] ${title} -> Исключение: ${err && err.message}`);
    failures++;
  }
}

function readFile(relPath) {
  const p = path.join(ROOT, relPath);
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

console.log('\n============================================================');
console.log('🛡️  PROJECT STEAM: ПРОВЕРКА ИНВАРИАНТОВ АНТИ-ОТКАТА (ZERO ROLLBACK)');
console.log('============================================================\n');

// ------------------------------------------------------------
// 1. ИНВАРИАНТ C++ SIMD И SPATIAL GRID
// ------------------------------------------------------------
console.log('1. Проверка нативного C++ AVX2 SIMD движка:');

check('binding.gyp существует и включает флаги -O3 -mavx2', () => {
  const bg = readFile('binding.gyp');
  return bg.includes('project_steam_native') && bg.includes('-mavx2') && bg.includes('-O3');
});

check('Исходники C++ на месте (main.cpp, combat_engine.h, spatial_grid.h)', () => {
  return fs.existsSync(path.join(ROOT, 'native/src/main.cpp')) &&
         fs.existsSync(path.join(ROOT, 'native/src/combat_engine.h')) &&
         fs.existsSync(path.join(ROOT, 'native/src/spatial_grid.h'));
});

check('Нативный C++ модуль project_steam_native подключен в spatial-grid и l2-combat', () => {
  const sg = readFile('server/spatial-grid.js');
  const l2 = readFile('shared/l2-combat.js');
  return sg.includes('project_steam_native.node') && l2.includes('project_steam_native.node');
});

check('server.js импортирует NativeSpatialGrid из spatial-grid.js', () => {
  const srv = readFile('server/server.js');
  return srv.includes('NativeSpatialGrid');
});

// ------------------------------------------------------------
// 2. ИНВАРИАНТ СЕТЕВОГО ТРАНСПОРТА (uWebSockets.js)
// ------------------------------------------------------------
console.log('\n2. Проверка C++ Zero-GC транспорта (uWebSockets.js):');

check('ecosystem.config.js жестко фиксирует NET_ENGINE: uws и STRICT_UWS: 1', () => {
  const eco = readFile('ecosystem.config.js');
  return eco.includes("NET_ENGINE: 'uws'") && eco.includes("STRICT_UWS: '1'");
});

check('server/net-transport.js выбрасывает фатальную ошибку при отсутствии uWS в продакшене', () => {
  const nt = readFile('server/net-transport.js');
  return nt.includes('ERR_UWS_NOT_AVAILABLE') && nt.includes('NET_TRANSPORT_FATAL');
});

check('server/net-transport.js запрещает откат на ws при STRICT_UWS=1', () => {
  const nt = readFile('server/net-transport.js');
  return nt.includes('ERR_UWS_REQUIRED') && nt.includes('STRICT_UWS');
});

// ------------------------------------------------------------
// 3. ИНВАРИАНТ WORKER THREADS (РАЗГРУЗКА vCPU)
// ------------------------------------------------------------
console.log('\n3. Проверка изоляции I/O через Worker Threads:');

check('Файлы persistence-client.js и persistence-worker.js существуют', () => {
  return fs.existsSync(path.join(ROOT, 'server/workers/persistence-client.js')) &&
         fs.existsSync(path.join(ROOT, 'server/workers/persistence-worker.js'));
});

check('server.js использует фоновый persistence worker для сохранения базы', () => {
  const srv = readFile('server/server.js');
  return srv.includes('persistence-client') || srv.includes('saveAllToDiskWorker');
});

// ------------------------------------------------------------
// 4. ИНВАРИАНТЫ ТРОТТЛИНГА БОТОВ (ПРЕДОТВРАЩЕНИЕ 50K РЕЙКАСТОВ И СПАМА)
// ------------------------------------------------------------
console.log('\n4. Проверка защиты от флуда и геодата-рейкастов ботов:');

check('server.js: broadcastMoveVecStart блокирует отправку векторов ботов', () => {
  const srv = readFile('server/server.js');
  return srv.includes('if (isOriginBot) return;');
});

check('server.js: clampSpeed исключает вызовы геодаты для синтетических ботов', () => {
  const srv = readFile('server/server.js');
  return srv.includes('if (p && p.yid && isSyntheticBot(p.yid))') && srv.includes('snapStandY(p)');
});

check('server.js: ensureNearbyMobs заблокирован для синтетических ботов', () => {
  const srv = readFile('server/server.js');
  return srv.includes('if (p.yid && isSyntheticBot(p.yid)) return;');
});

// ------------------------------------------------------------
// 5. ИНВАРИАНТЫ КЛИЕНТА (ZERO-STUTTER RENDERING / АУДИТ №28)
// ------------------------------------------------------------
console.log('\n5. Проверка защиты клиента от фризов (Zero-Stutter Rendering):');

check('client/js/char-model.js: глобальный кэш текстуры волос (_cachedGrayscaleHairTex)', () => {
  const cm = readFile('client/js/char-model.js');
  return cm.includes('_cachedGrayscaleHairTex') && cm.includes('mat.userData._hairGrayDone');
});

check('client/js/char-model.js: tintHairMaterial НЕ вызывает mat.needsUpdate (защита от рекомпиляции шейдера)', () => {
  const cm = readFile('client/js/char-model.js');
  const tintIdx = cm.indexOf('function tintHairMaterial');
  if (tintIdx === -1) return false;
  const funcBody = cm.slice(tintIdx, tintIdx + 500);
  return !funcBody.includes('mat.needsUpdate = true');
});

check('client/js/char-model.js: кэш шаблонов оружия (_weaponFbxTemplates)', () => {
  const cm = readFile('client/js/char-model.js');
  return cm.includes('_weaponFbxTemplates') && cm.includes('_weaponFbxTemplates.get(relPath).clone(true)');
});

check('client/js/char-model.js: функции fastClonePlayerModel, preloadAssets и warmupPipeline экспортированы', () => {
  const cm = readFile('client/js/char-model.js');
  return cm.includes('export async function fastClonePlayerModel') &&
         cm.includes('export function preloadAssets') &&
         cm.includes('export async function warmupPipeline') &&
         cm.includes('fastClonePlayerModel') &&
         cm.includes('preloadAssets') &&
         cm.includes('warmupPipeline');
});

check('client/js/main.js: предзагрузка CharModel.preloadAssets() и прогрев warmupPipeline() активны', () => {
  const main = readFile('client/js/main.js');
  return main.includes('CharModel.preloadAssets()') && main.includes('CharModel.warmupPipeline(');
});

check('client/js/net-ws.js: спавн игроков использует fastClonePlayerModel с initialDist', () => {
  const nws = readFile('client/js/net-ws.js');
  return nws.includes('CM.fastClonePlayerModel') && nws.includes('initialDist');
});

check('client/js/net-ws.js: неймплейт отключает генерацию мипмапов (generateMipmaps = false)', () => {
  const nws = readFile('client/js/net-ws.js');
  return nws.includes('ttex.generateMipmaps = false');
});

// ------------------------------------------------------------
// 6. САНИТАРИЯ РАБОЧЕГО ДЕРЕВА (НЕТ СТАРОГО МУСОРА И ДУБЛИКАТОВ)
// ------------------------------------------------------------
console.log('\n6. Проверка чистоты репозитория и отсутствия устаревших зеркал:');

check('Отсутствуют папки-дубликаты (Models — копия, client/promo — копия.html)', () => {
  return !fs.existsSync(path.join(ROOT, 'Models — копия')) &&
         !fs.existsSync(path.join(ROOT, 'client/promo — копия.html'));
});

check('В scratch/ отсутствуют старые зеркала серверов (scratch/serv_test)', () => {
  return !fs.existsSync(path.join(ROOT, 'scratch/serv_test'));
});

check('Скрипт deploy-vps.js включает вызов проверки инвариантов перед сборкой', () => {
  const dep = readFile('scripts/deploy-vps.js');
  return dep.includes('guard-anti-rollback.js');
});

console.log('\n============================================================');
console.log(`ИТОГ ПРОВЕРКИ: ${passes} пройдено, ${failures} провалено`);
console.log('============================================================\n');

if (failures > 0) {
  console.error(`❌ [ANTI_ROLLBACK_GUARD_FAIL] Обнаружено ${failures} нарушений архитектурных инвариантов!`);
  console.error('Откат на старые версии или нарушение инвариантов КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ.');
  process.exit(1);
} else {
  console.log('✅ [ANTI_ROLLBACK_GUARD_OK] Все инварианты производительности соблюдены на 100%!\n');
  process.exit(0);
}
