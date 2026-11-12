// ============================================================
//  SCRIPTS / DEPLOY-WORLD-CLIENT.JS
//  Ручной деплой изменений мира из локального редактора:
//  1. Синхронизация world overrides (shared/ -> client/data/)
//  2. Сборка чистого боевого клиента в локальную папку dist/client/
//  3. Деплой чистого клиента на сервер Render.com (ветка render-client)
//  Боевой сервер VPS (217.179.49.236) не затрагивается.
// ============================================================
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const buildOnly = args.includes('--build-only');
const customMsg = args.filter(a => a !== '--build-only').join(' ').replace(/["`$]/g, '').trim() || 'World update from local GM editor';

console.log('============================================================');
console.log(buildOnly
  ? '📦 [DEPLOY-WORLD] Сборка чистого боевого клиента (dist/client)'
  : '🚀 [DEPLOY-WORLD] Ручной деплой мира -> dist/client + Render.com');
console.log('============================================================\n');

// 1. Синхронизация editor-overrides.json из shared/ в client/data/
try {
  const overridesWriter = require(path.join(ROOT, 'server', 'editor-overrides-writer.js'));
  overridesWriter.ensureClientData();
} catch (e) {
  console.warn('⚠️ Предупреждение синхронизации editor-overrides.json:', e.message);
}

// Проверяем и синхронизируем карты покраски террейна (если в shared новее)
for (const fname of ['terrain-paint-1.png', 'terrain-paint-2.png']) {
  const srcShared = path.join(ROOT, 'shared', fname);
  const dstClient = path.join(ROOT, 'client', 'data', fname);
  if (fs.existsSync(srcShared)) {
    const sStat = fs.statSync(srcShared);
    const dStat = fs.existsSync(dstClient) ? fs.statSync(dstClient) : null;
    if (!dStat || sStat.mtimeMs > dStat.mtimeMs) {
      fs.copyFileSync(srcShared, dstClient);
      console.log(`🎨 Синхронизирован ${fname} -> client/data/${fname}`);
    }
  }
}

// 2. Сборка чистого клиента в dist/client/ (или полный deploy-render.js, который сам зовет build-client.js)
if (buildOnly) {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-client.js')], { cwd: ROOT, stdio: 'inherit' });
  console.log('\n✅ [DEPLOY-WORLD] Локальный чистый боевой клиент обновлён: dist/client/\n');
} else {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'deploy-render.js'), customMsg], { cwd: ROOT, stdio: 'inherit' });
  console.log('\n✅ [DEPLOY-WORLD] Мир обновлён в dist/client/ и опубликован на Render.com!\n');
}
