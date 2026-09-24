#!/usr/bin/env node
// ============================================================
//  SCRIPTS / MIGRATE-DB.JS
//  Консольная утилита миграции данных Project Steam:
//    - file-to-pg: экспорт из data/*.json в PostgreSQL
//    - pg-to-file: экспорт из PostgreSQL в data/*.json
//    - verify:     сверка целостности и количества записей
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CLANS_DIR = path.join(DATA_DIR, 'clans');
const CHARS_FILE = path.join(DATA_DIR, 'characters.json');
const GM_FILE = path.join(DATA_DIR, 'gm-access.json');

const args = process.argv.slice(2);
const command = args.find(a => !a.startsWith('-')) || 'help';
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('--verbose');

function printHelp() {
  console.log(`
Project Steam — Утилита миграции БД
Использование:
  node scripts/migrate-db.js <command> [options]

Команды:
  file-to-pg    Перенос данных из файловой системы (data/) в PostgreSQL
  pg-to-file    Экспорт данных из PostgreSQL в файлы data/
  verify        Сверка количества записей и проверка консистентности
  help          Справка

Опции:
  --dry-run     Тестовый прогон без записи данных
  --verbose     Подробный вывод каждого перенесённого объекта
  
Переменные окружения:
  DATABASE_URL  URL подключения к PostgreSQL (postgresql://user:pass@host:5432/dbname)
  PG_POOL_MAX   Максимальный размер пула соединений (по умолчанию 20)
`);
}

async function getPgPool() {
  let pg;
  try {
    pg = require('pg');
  } catch (e) {
    throw new Error('Модуль pg не найден. Установите: npm i pg');
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('Переменная DATABASE_URL не задана. Задайте: export DATABASE_URL="postgres://..."');
  }
  const pool = new pg.Pool({
    connectionString: dbUrl,
    max: parseInt(process.env.PG_POOL_MAX || '10', 10),
    ssl: dbUrl.includes('sslmode=require') || process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
  });
  return pool;
}

function getLocalProfiles() {
  const profiles = [];
  if (!fs.existsSync(DATA_DIR)) return profiles;
  const files = fs.readdirSync(DATA_DIR);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    if (f === 'characters.json' || f === 'gm-access.json' || f.startsWith('characters_registry') || f.includes('.tmp.') || f.endsWith('.bak')) continue;
    try {
      const fullPath = path.join(DATA_DIR, f);
      const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const stem = f.slice(0, -5);
      profiles.push({ stem, fullPath, data: raw });
    } catch (e) {
      console.warn(`[migrate] Пропуск повреждённого файла ${f}:`, e.message);
    }
  }
  return profiles;
}

function getLocalClans() {
  const clans = [];
  if (!fs.existsSync(CLANS_DIR)) return clans;
  const files = fs.readdirSync(CLANS_DIR);
  for (const f of files) {
    if (!f.endsWith('.json') || f.includes('.tmp.') || f.endsWith('.bak')) continue;
    try {
      const fullPath = path.join(CLANS_DIR, f);
      const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      if (raw && raw.id) {
        clans.push({ id: raw.id, name: raw.name || raw.id, fullPath, data: raw });
      }
    } catch (e) {
      console.warn(`[migrate] Пропуск повреждённого файла клана ${f}:`, e.message);
    }
  }
  return clans;
}

function getLocalSystemState() {
  const states = [];
  if (fs.existsSync(CHARS_FILE)) {
    try {
      states.push({ key: 'characters_registry', data: JSON.parse(fs.readFileSync(CHARS_FILE, 'utf8')) });
    } catch (_) {}
  }
  if (fs.existsSync(GM_FILE)) {
    try {
      states.push({ key: 'gm_access', data: JSON.parse(fs.readFileSync(GM_FILE, 'utf8')) });
    } catch (_) {}
  }
  return states;
}

async function ensurePgSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      yid TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_profiles_updated ON profiles(updated);

    CREATE TABLE IF NOT EXISTS clans (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      data JSONB NOT NULL,
      updated TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_clans_updated ON clans(updated);

    CREATE TABLE IF NOT EXISTS system_state (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function fileToPg() {
  console.log(`[migrate:file-to-pg] Старт миграции ФС -> PostgreSQL ${isDryRun ? '(DRY-RUN)' : ''}`);
  const pool = isDryRun ? null : await getPgPool();
  if (pool) await ensurePgSchema(pool);

  const profiles = getLocalProfiles();
  const clans = getLocalClans();
  const states = getLocalSystemState();

  console.log(`[migrate] Найдено: профилей ${profiles.length}, кланов ${clans.length}, системных состояний ${states.length}`);

  let profCount = 0;
  for (const p of profiles) {
    // stem в файловой системе c0 = yid, иначе yid.charId
    // В Postgres pkey: c0 = yid, иначе yid:charId
    const parts = p.stem.split('.');
    const key = parts.length > 1 ? `${parts[0]}:${parts.slice(1).join('.')}` : parts[0];

    if (isVerbose) console.log(`  -> профиль: ${key} (${p.data.name || 'безымянный'})`);
    if (!isDryRun && pool) {
      await pool.query(
        'INSERT INTO profiles(yid, data, updated) VALUES($1, $2, NOW()) ON CONFLICT(yid) DO UPDATE SET data=$2, updated=NOW()',
        [key, p.data]
      );
    }
    profCount++;
  }

  let clanCount = 0;
  for (const c of clans) {
    if (isVerbose) console.log(`  -> клан: [${c.id}] ${c.name}`);
    if (!isDryRun && pool) {
      await pool.query(
        'INSERT INTO clans(id, name, data, updated) VALUES($1, $2, $3, NOW()) ON CONFLICT(id) DO UPDATE SET name=$2, data=$3, updated=NOW()',
        [c.id, c.name, c.data]
      );
    }
    clanCount++;
  }

  let stateCount = 0;
  for (const s of states) {
    if (isVerbose) console.log(`  -> system_state: ${s.key}`);
    if (!isDryRun && pool) {
      await pool.query(
        'INSERT INTO system_state(key, value, updated) VALUES($1, $2, NOW()) ON CONFLICT(key) DO UPDATE SET value=$2, updated=NOW()',
        [s.key, s.data]
      );
    }
    stateCount++;
  }

  if (pool) await pool.end();
  console.log(`[migrate:file-to-pg] Успешно завершено! Перенесено: ${profCount} профилей, ${clanCount} кланов, ${stateCount} состояний.`);
  return { profCount, clanCount, stateCount };
}

async function pgToFile() {
  console.log(`[migrate:pg-to-file] Старт миграции PostgreSQL -> ФС ${isDryRun ? '(DRY-RUN)' : ''}`);
  const pool = await getPgPool();
  await ensurePgSchema(pool);

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CLANS_DIR)) fs.mkdirSync(CLANS_DIR, { recursive: true });

  const profRes = await pool.query('SELECT yid, data FROM profiles');
  let profCount = 0;
  for (const r of profRes.rows) {
    // В Postgres key: yid или yid:charId -> файл stem: yid.json или yid.charId.json
    const stem = String(r.yid).replace(':', '.');
    const fPath = path.join(DATA_DIR, stem + '.json');
    if (isVerbose) console.log(`  <- профиль: ${stem}`);
    if (!isDryRun) {
      fs.writeFileSync(fPath, JSON.stringify(r.data, null, 2), 'utf8');
    }
    profCount++;
  }

  const clanRes = await pool.query('SELECT id, data FROM clans');
  let clanCount = 0;
  for (const r of clanRes.rows) {
    const fPath = path.join(CLANS_DIR, r.id + '.json');
    if (isVerbose) console.log(`  <- клан: ${r.id}`);
    if (!isDryRun) {
      fs.writeFileSync(fPath, JSON.stringify(r.data, null, 2), 'utf8');
    }
    clanCount++;
  }

  const stateRes = await pool.query('SELECT key, value FROM system_state');
  let stateCount = 0;
  for (const r of stateRes.rows) {
    if (r.key === 'characters_registry') {
      if (!isDryRun) fs.writeFileSync(CHARS_FILE, JSON.stringify(r.value, null, 2), 'utf8');
    } else if (r.key === 'gm_access') {
      if (!isDryRun) fs.writeFileSync(GM_FILE, JSON.stringify(r.value, null, 2), 'utf8');
    } else {
      const fPath = path.join(DATA_DIR, r.key + '.json');
      if (!isDryRun) fs.writeFileSync(fPath, JSON.stringify(r.value, null, 2), 'utf8');
    }
    stateCount++;
  }

  await pool.end();
  console.log(`[migrate:pg-to-file] Успешно завершено! Выгружено: ${profCount} профилей, ${clanCount} кланов, ${stateCount} состояний.`);
  return { profCount, clanCount, stateCount };
}

async function verify() {
  console.log('[migrate:verify] Сверка ФС и PostgreSQL...');
  const pool = await getPgPool();
  await ensurePgSchema(pool);

  const localProfiles = getLocalProfiles();
  const localClans = getLocalClans();

  const pRes = await pool.query('SELECT count(*)::int as count FROM profiles');
  const cRes = await pool.query('SELECT count(*)::int as count FROM clans');
  const sRes = await pool.query('SELECT count(*)::int as count FROM system_state');

  const pgProfiles = pRes.rows[0].count;
  const pgClans = cRes.rows[0].count;
  const pgStates = sRes.rows[0].count;

  console.log(`
Статус сверки:
  Профили игроков:   ФС = ${localProfiles.length}  |  PostgreSQL = ${pgProfiles}
  Кланы:             ФС = ${localClans.length}     |  PostgreSQL = ${pgClans}
  Системные записи:  ФС = ${getLocalSystemState().length}     |  PostgreSQL = ${pgStates}
  `);

  await pool.end();
}

async function run() {
  switch (command) {
    case 'file-to-pg':
      await fileToPg();
      break;
    case 'pg-to-file':
      await pgToFile();
      break;
    case 'verify':
      await verify();
      break;
    case 'help':
    default:
      printHelp();
      break;
  }
}

if (require.main === module) {
  run().catch(e => {
    console.error('[migrate] Ошибка:', e.message);
    process.exit(1);
  });
}

module.exports = { fileToPg, pgToFile, verify, getLocalProfiles, getLocalClans, getLocalSystemState };
