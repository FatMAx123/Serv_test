// ============================================================
//  TESTS / PERSISTENCE-POSTGRES.TEST.JS
//  Тестирование персистентности: валидация продакшен-БД,
//  PostgresBackend (DDL, индексы JSONB, батч-апсерт UNNEST, пулы)
//  и FileBackend.saveBatch.
// ============================================================
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const DB = require(path.join(ROOT, 'server', 'db.js'));

module.exports = async function (t) {
  // ── 1. Валидация продакшен-БД (assertProductionDatabase) ──────
  t.suite('db: assertProductionDatabase валидация режима окружения');

  t.ok(typeof DB.assertProductionDatabase === 'function', 'DB.assertProductionDatabase экспортирована');
  t.ok(typeof DB.FileBackend.assertProductionDatabase === 'function', 'FileBackend.assertProductionDatabase доступна');

  // Dev режим: file backend разрешен
  const devRes = DB.assertProductionDatabase({ env: 'development', mode: 'file' });
  t.ok(devRes.ok, 'в development режиме file backend разрешён');

  // Prod режим без Postgres: выбрасывает исключение ERR_POSTGRES_REQUIRED
  let prodErr = null;
  try {
    DB.assertProductionDatabase({ env: 'production', mode: 'file' });
  } catch (err) {
    prodErr = err;
  }
  t.ok(prodErr !== null, 'в production с DB=file выброшено исключение');
  t.eq(prodErr && prodErr.code, 'ERR_POSTGRES_REQUIRED', 'код ошибки ERR_POSTGRES_REQUIRED');

  // Strict режим: выбрасывает исключение при mode !== postgres
  let strictErr = null;
  try {
    DB.assertProductionDatabase({ strict: true, mode: 'file' });
  } catch (err) {
    strictErr = err;
  }
  t.ok(strictErr !== null, 'при strict=true с DB=file выброшено исключение');
  t.eq(strictErr && strictErr.code, 'ERR_POSTGRES_REQUIRED', 'код ошибки strict режима ERR_POSTGRES_REQUIRED');

  // Prod режим с Postgres, но без DATABASE_URL: выбрасывает ERR_DATABASE_URL_MISSING
  let missingUrlErr = null;
  try {
    DB.assertProductionDatabase({ env: 'production', mode: 'postgres', databaseUrl: '' });
  } catch (err) {
    missingUrlErr = err;
  }
  t.ok(missingUrlErr !== null, 'при DB=postgres без DATABASE_URL выброшено исключение');
  t.eq(missingUrlErr && missingUrlErr.code, 'ERR_DATABASE_URL_MISSING', 'код ошибки ERR_DATABASE_URL_MISSING');

  // Prod режим с Postgres и корректным DATABASE_URL: успешно проходит
  const prodPgRes = DB.assertProductionDatabase({
    env: 'production',
    mode: 'postgres',
    databaseUrl: 'postgres://usr:pass@localhost:5432/l2db'
  });
  t.ok(prodPgRes.ok, 'в production с DB=postgres и DATABASE_URL проверка успешно пройдена');

  // Аварийный обход в проде (ALLOW_FILE_DB_IN_PROD=1)
  const bypassRes = DB.assertProductionDatabase({
    env: 'production',
    mode: 'file',
    allowFileInProd: true
  });
  t.ok(bypassRes.ok, 'аварийный флаг allowFileInProd=true разрешает запуск');

  // ── 2. PostgresBackend с Mock-пулом: DDL, функциональные индексы JSONB ──
  t.suite('db: PostgresBackend DDL & функциональные индексы JSONB');

  const executedQueries = [];
  const mockStorage = {
    profiles: new Map(),
    clans: new Map(),
    system_state: new Map()
  };

  const mockPool = {
    totalCount: 10,
    idleCount: 8,
    waitingCount: 0,
    async query(sql, params) {
      executedQueries.push({ sql: String(sql).trim(), params });
      const s = String(sql);

      // SELECT 1 AS ok (healthcheck)
      if (s.includes('SELECT 1 AS ok')) {
        return { rows: [{ ok: 1 }] };
      }

      // CREATE TABLE / INDEX
      if (s.includes('CREATE TABLE') || s.includes('CREATE INDEX')) {
        return { rows: [] };
      }

      // Profiles: SELECT data FROM profiles WHERE yid=$1
      if (s.includes('SELECT data FROM profiles WHERE yid=$1')) {
        const item = mockStorage.profiles.get(params[0]);
        return { rows: item ? [{ data: item.data }] : [] };
      }

      // Profiles: SELECT yid, data FROM profiles WHERE yid=$1 OR yid LIKE $2
      if (s.includes('SELECT yid, data FROM profiles WHERE yid=$1 OR yid LIKE $2')) {
        const yid = params[0];
        const prefix = yid + ':';
        const rows = [];
        for (const [k, v] of mockStorage.profiles.entries()) {
          if (k === yid || k.startsWith(prefix)) {
            rows.push({ yid: k, data: v.data });
          }
        }
        return { rows };
      }

      // Profiles single INSERT: INSERT INTO profiles(yid, data, updated) VALUES($1, $2, NOW()) ...
      if (s.includes('INSERT INTO profiles(yid, data, updated)')) {
        mockStorage.profiles.set(params[0], { data: params[1], updated: new Date() });
        return { rowCount: 1 };
      }

      // Profiles batch INSERT: UNNEST($1::text[], $2::text[])
      if (s.includes('UNNEST($1::text[], $2::text[])')) {
        const keys = params[0];
        const jsons = params[1];
        for (let i = 0; i < keys.length; i++) {
          mockStorage.profiles.set(keys[i], { data: JSON.parse(jsons[i]), updated: new Date() });
        }
        return { rowCount: keys.length };
      }

      // Profiles DELETE: DELETE FROM profiles WHERE yid=$1
      if (s.includes('DELETE FROM profiles WHERE yid=$1')) {
        mockStorage.profiles.delete(params[0]);
        return { rowCount: 1 };
      }

      // Clans: SELECT data FROM clans WHERE id=$1
      if (s.includes('SELECT data FROM clans WHERE id=$1')) {
        const item = mockStorage.clans.get(params[0]);
        return { rows: item ? [{ data: item.data }] : [] };
      }

      // Clans: SELECT data FROM clans ORDER BY updated DESC
      if (s.includes('SELECT data FROM clans ORDER BY updated DESC')) {
        const rows = [...mockStorage.clans.values()].map(v => ({ data: v.data }));
        return { rows };
      }

      // Clans: INSERT INTO clans
      if (s.includes('INSERT INTO clans')) {
        mockStorage.clans.set(params[0], { name: params[1], data: params[2], updated: new Date() });
        return { rowCount: 1 };
      }

      // Clans: DELETE FROM clans WHERE id=$1
      if (s.includes('DELETE FROM clans WHERE id=$1')) {
        mockStorage.clans.delete(params[0]);
        return { rowCount: 1 };
      }

      // System state: SELECT value FROM system_state WHERE key=$1
      if (s.includes('SELECT value FROM system_state WHERE key=$1')) {
        const item = mockStorage.system_state.get(params[0]);
        return { rows: item ? [{ value: item.value }] : [] };
      }

      // System state: INSERT INTO system_state
      if (s.includes('INSERT INTO system_state')) {
        mockStorage.system_state.set(params[0], { value: params[1], updated: new Date() });
        return { rowCount: 1 };
      }

      return { rows: [] };
    },
    async end() {}
  };

  const pgBackend = DB.createPgBackend(mockPool);
  await pgBackend.init();

  const initQuery = executedQueries.find(q => q.sql.includes('CREATE TABLE IF NOT EXISTS profiles'));
  t.ok(initQuery !== undefined, 'DDL инициализации выполнен');
  t.ok(initQuery.sql.includes('idx_profiles_name ON profiles((data->>\'name\'))'), 'индекс idx_profiles_name по data->>name создан');
  t.ok(initQuery.sql.includes('idx_profiles_level ON profiles(((data->>\'level\')::int))'), 'индекс idx_profiles_level по (data->>level)::int создан');
  t.ok(initQuery.sql.includes('idx_clans_name ON clans((data->>\'name\'))'), 'индекс idx_clans_name создан');

  // ── 3. PostgresBackend CRUD и батч-апсерт (saveBatch) ─────────
  t.suite('db: PostgresBackend CRUD & saveBatch (UNNEST)');

  // Сохранение и загрузка профиля
  const profileC0 = { name: 'PlayerOne', level: 25, exp: 120000, cls: 'warrior', hp: 450, maxHp: 450 };
  await pgBackend.save('usr_test_1', profileC0, 'c0');
  await pgBackend.flush();

  const loadedC0 = await pgBackend.load('usr_test_1', 'c0');
  t.ok(loadedC0 !== null, 'профиль c0 загружен');
  t.eq(loadedC0.name, 'PlayerOne', 'имя профиля c0 совпадает');
  t.eq(loadedC0.level, 25, 'уровень профиля c0 совпадает');

  // Сохранение в слот c2
  const profileC2 = { name: 'PlayerTwoMage', level: 40, exp: 800000, cls: 'wizard', hp: 320, maxHp: 320 };
  await pgBackend.save('usr_test_1', profileC2, 'c2');
  await pgBackend.flush();

  const loadedC2 = await pgBackend.load('usr_test_1', 'c2');
  t.ok(loadedC2 !== null, 'профиль c2 загружен');
  t.eq(loadedC2.name, 'PlayerTwoMage', 'имя профиля c2 совпадает');

  // Список персонажей пользователя
  const chars = await pgBackend.listChars('usr_test_1');
  t.eq(chars.length, 2, 'listChars возвращает 2 слота');
  t.ok(chars.some(c => c.id === 'c0' && c.name === 'PlayerOne'), 'слот c0 в списке');
  t.ok(chars.some(c => c.id === 'c2' && c.name === 'PlayerTwoMage'), 'слот c2 в списке');

  // Удаление слота
  await pgBackend.removeChar('usr_test_1', 'c2');
  await pgBackend.flush();
  const charsAfterDelete = await pgBackend.listChars('usr_test_1');
  t.eq(charsAfterDelete.length, 1, 'после removeChar остался 1 слот');
  t.eq(charsAfterDelete[0].id, 'c0', 'оставшийся слот — c0');

  // Батч-апсерт (saveBatch)
  const batchItems = [
    { yid: 'usr_batch_1', charId: 'c0', data: { name: 'BatchHero1', level: 52, cls: 'knight' } },
    { yid: 'usr_batch_2', charId: 'c0', data: { name: 'BatchHero2', level: 61, cls: 'gladiator' } },
    { yid: 'usr_batch_1', charId: 'c1', data: { name: 'BatchHero1Alt', level: 20, cls: 'scout' } }
  ];

  await pgBackend.saveBatch(batchItems);
  const unnestQuery = executedQueries.find(q => q.sql.includes('UNNEST($1::text[], $2::text[])'));
  t.ok(unnestQuery !== undefined, 'батч-запрос выполнен через UNNEST($1::text[], $2::text[])');

  const b1 = await pgBackend.load('usr_batch_1', 'c0');
  const b2 = await pgBackend.load('usr_batch_2', 'c0');
  const b1Alt = await pgBackend.load('usr_batch_1', 'c1');
  t.eq(b1 && b1.name, 'BatchHero1', 'батч 1 загружен верно');
  t.eq(b2 && b2.name, 'BatchHero2', 'батч 2 загружен верно');
  t.eq(b1Alt && b1Alt.name, 'BatchHero1Alt', 'батч альт-персонаж загружен верно');

  // Кланы
  const clanData = { id: 'clan_red', name: 'RedDragons', leader: 'PlayerOne', level: 3 };
  await pgBackend.saveClan(clanData);
  await pgBackend.flush();
  const loadedClan = await pgBackend.loadClan('clan_red');
  t.ok(loadedClan !== null, 'клан загружен');
  t.eq(loadedClan.name, 'RedDragons', 'имя клана совпадает');

  const allClans = await pgBackend.loadAllClans();
  t.ok(allClans.length >= 1, 'loadAllClans возвращает сохранённый клан');

  await pgBackend.removeClan('clan_red');
  await pgBackend.flush();
  const clanAfterRemove = await pgBackend.loadClan('clan_red');
  t.eq(clanAfterRemove, null, 'клан успешно удалён');

  // Системное состояние
  await pgBackend.saveSystemState('world_time', { cycle: 4, isNight: true });
  await pgBackend.flush();
  const sysState = await pgBackend.loadSystemState('world_time');
  t.ok(sysState !== null, 'системное состояние загружено');
  t.eq(sysState.isNight, true, 'значение системного состояния верное');

  // HealthCheck и PoolStats
  const health = await pgBackend.healthCheck();
  t.ok(health.ok, 'healthCheck возвращает ok: true');
  t.eq(health.mode, 'postgres', 'healthCheck mode: postgres');
  t.ok(typeof health.latencyMs === 'number', 'healthCheck измеряет latencyMs');

  const stats = pgBackend.getPoolStats();
  t.eq(stats.mode, 'postgres', 'poolStats mode: postgres');
  t.eq(stats.totalCount, 10, 'poolStats totalCount: 10');
  t.eq(stats.idleCount, 8, 'poolStats idleCount: 8');

  // ── 4. Retry при транзиентных сбоях сети Postgres ─────────────
  t.suite('db: Retry при транзиентных сбоях сети (ECONNRESET)');

  let failOnce = true;
  const flakeyPool = {
    totalCount: 5,
    idleCount: 5,
    waitingCount: 0,
    async query(sql, params) {
      if (failOnce) {
        failOnce = false;
        const e = new Error('read ECONNRESET');
        e.code = 'ECONNRESET';
        throw e;
      }
      return { rows: [{ data: { name: 'RecoveredPlayer', level: 10 } }] };
    }
  };

  const flakeyBackend = DB.createPgBackend(flakeyPool);
  const recovered = await flakeyBackend.load('usr_recovered', 'c0');
  t.ok(recovered !== null, 'успешное восстановление после ECONNRESET');
  t.eq(recovered.name, 'RecoveredPlayer', 'данные успешно получены со второй попытки');

  // ── 5. FileBackend.saveBatch ──────────────────────────────────
  t.suite('db: FileBackend.saveBatch батч-сохранение');

  t.ok(typeof DB.FileBackend.saveBatch === 'function', 'FileBackend.saveBatch доступна');
  const fileBatch = [
    { yid: 'test_file_b1', charId: 'c0', data: { name: 'FileHero1', level: 1 } },
    { yid: 'test_file_b2', charId: 'c0', data: { name: 'FileHero2', level: 2 } }
  ];

  await DB.FileBackend.saveBatch(fileBatch);
  await DB.FileBackend.flush();

  const fb1 = await DB.FileBackend.load('test_file_b1', 'c0');
  const fb2 = await DB.FileBackend.load('test_file_b2', 'c0');
  t.ok(fb1 !== null && fb1.name === 'FileHero1', 'первый файл в батче сохранён');
  t.ok(fb2 !== null && fb2.name === 'FileHero2', 'второй файл в батче сохранён');

  // Очистка тестовых файлов
  await DB.FileBackend.removeChar('test_file_b1', 'c0');
  await DB.FileBackend.removeChar('test_file_b2', 'c0');
  await DB.FileBackend.flush();
};
