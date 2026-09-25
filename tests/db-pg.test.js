// ============================================================
//  TESTS / DB-PG.TEST.JS
//  Стресс-тестирование, устойчивость к сбоям и верификация
//  адаптера PostgreSQL (PgBackend) под нагрузкой.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DB = require(path.join(ROOT, 'server', 'db.js'));

/**
 * Имитатор PostgreSQL пула (MockPgPool) с поддержкой:
 *  - DDL (CREATE TABLE, CREATE INDEX)
 *  - Upsert (ON CONFLICT DO UPDATE)
 *  - Параметризованных запросов profiles, clans, system_state
 *  - Имитации транзиентных сбоев сети (ECONNRESET) для проверки retryPgQuery
 *  - Метрик пула (totalCount, idleCount, waitingCount)
 */
class MockPgPool {
  constructor(opts = {}) {
    this.profiles = new Map(); // key -> { data, updated }
    this.clans = new Map();    // id -> { name, data, updated }
    this.systemState = new Map(); // key -> { value, updated }
    this.failNextCount = 0;
    this.failErrorCode = 'ECONNRESET';
    this.queryLog = [];
    this.totalCount = opts.max || 10;
    this.idleCount = opts.max || 10;
    this.waitingCount = 0;
    this.ended = false;
  }

  async query(sql, params = []) {
    if (this.ended) throw new Error('Cannot use a pool after calling end()');
    this.queryLog.push({ sql, params });

    // Имитация сбоя
    if (this.failNextCount > 0) {
      this.failNextCount--;
      const err = new Error(this.failErrorMessage || 'Database error: ' + this.failErrorCode);
      err.code = this.failErrorCode;
      throw err;
    }

    const s = sql.trim();

    // DDL
    if (s.startsWith('CREATE TABLE') || s.startsWith('CREATE INDEX')) {
      return { rowCount: 0, rows: [] };
    }

    // SELECT 1 AS ok (health check)
    if (s.includes('SELECT 1')) {
      return { rowCount: 1, rows: [{ ok: 1 }] };
    }

    // PROFILES: INSERT / UPDATE
    if (s.startsWith('INSERT INTO profiles')) {
      const [key, data] = params;
      this.profiles.set(key, { data, updated: new Date() });
      return { rowCount: 1, rows: [] };
    }

    // PROFILES: SELECT single
    if (s.startsWith('SELECT data FROM profiles WHERE yid=$1')) {
      const key = params[0];
      const entry = this.profiles.get(key);
      return { rowCount: entry ? 1 : 0, rows: entry ? [{ data: entry.data }] : [] };
    }

    // PROFILES: SELECT listChars (prefix search)
    if (s.includes('FROM profiles WHERE yid=$1 OR yid LIKE $2')) {
      const [y, pattern] = params;
      const prefix = pattern.replace(':%', ':').replace(/\\([%_\\])/g, '$1');
      const rows = [];
      for (const [key, entry] of this.profiles.entries()) {
        if (key === y || key.startsWith(prefix)) {
          rows.push({ yid: key, data: entry.data });
        }
      }
      return { rowCount: rows.length, rows };
    }

    // PROFILES: DELETE
    if (s.startsWith('DELETE FROM profiles WHERE yid=$1')) {
      const key = params[0];
      const existed = this.profiles.delete(key);
      return { rowCount: existed ? 1 : 0, rows: [] };
    }

    // CLANS: INSERT / UPDATE
    if (s.startsWith('INSERT INTO clans')) {
      const [id, name, data] = params;
      this.clans.set(id, { name, data, updated: new Date() });
      return { rowCount: 1, rows: [] };
    }

    // CLANS: SELECT single
    if (s.startsWith('SELECT data FROM clans WHERE id=$1')) {
      const id = params[0];
      const entry = this.clans.get(id);
      return { rowCount: entry ? 1 : 0, rows: entry ? [{ data: entry.data }] : [] };
    }

    // CLANS: SELECT all
    if (s.startsWith('SELECT data FROM clans ORDER BY updated DESC')) {
      const rows = [...this.clans.values()].map(c => ({ data: c.data }));
      return { rowCount: rows.length, rows };
    }

    // CLANS: DELETE
    if (s.startsWith('DELETE FROM clans WHERE id=$1')) {
      const id = params[0];
      const existed = this.clans.delete(id);
      return { rowCount: existed ? 1 : 0, rows: [] };
    }

    // SYSTEM_STATE: INSERT / UPDATE
    if (s.startsWith('INSERT INTO system_state')) {
      const [key, value] = params;
      this.systemState.set(key, { value, updated: new Date() });
      return { rowCount: 1, rows: [] };
    }

    // SYSTEM_STATE: SELECT single
    if (s.startsWith('SELECT value FROM system_state WHERE key=$1')) {
      const key = params[0];
      const entry = this.systemState.get(key);
      return { rowCount: entry ? 1 : 0, rows: entry ? [{ value: entry.value }] : [] };
    }

    return { rowCount: 0, rows: [] };
  }

  async end() {
    this.ended = true;
    this.idleCount = 0;
    this.totalCount = 0;
  }
}

module.exports = async function (t) {
  t.suite('db-pg: инициализация схемы и пула соединений');
  const mockPool = new MockPgPool({ max: 25 });
  const pgBackend = DB.createPgBackend(mockPool);

  const initRes = await pgBackend.init();
  t.eq(initRes.ok, true, 'инициализация DDL схемы PostgreSQL завершена успешно');
  t.eq(pgBackend.MODE, 'postgres', 'режим бэкенда — postgres');

  t.suite('db-pg: атомарное сохранение и загрузка профилей');
  await pgBackend.save('yid_test_01', { name: 'PlayerOne', level: 10, inv: { adena: 500 } });
  const loaded1 = await pgBackend.load('yid_test_01');
  t.ok(loaded1 && loaded1.name === 'PlayerOne', 'профиль c0 загружен из PostgreSQL');
  t.eq(loaded1.level, 10, 'уровень персонажа сохранён корректно');
  t.eq(loaded1.inv.adena, 500, 'инвентарь сохранён корректно');

  // Мультиперсонажность: сохранение второго слота
  await pgBackend.save('yid_test_01', { name: 'PlayerAlt', level: 5, inv: { adena: 100 } }, 'c_alt');
  const loadedAlt = await pgBackend.load('yid_test_01', 'c_alt');
  t.ok(loadedAlt && loadedAlt.name === 'PlayerAlt', 'дополнительный слот (c_alt) изолирован');
  t.eq((await pgBackend.load('yid_test_01')).name, 'PlayerOne', 'основной слот c0 не затронут');

  const charsList = await pgBackend.listChars('yid_test_01');
  t.eq(charsList.length, 2, 'listChars возвращает оба персонажа аккаунта');
  t.ok(charsList.some(c => c.id === 'c0' && c.name === 'PlayerOne'), 'список содержит c0');
  t.ok(charsList.some(c => c.id === 'c_alt' && c.name === 'PlayerAlt'), 'список содержит c_alt');

  await pgBackend.removeChar('yid_test_01', 'c_alt');
  t.eq(await pgBackend.load('yid_test_01', 'c_alt'), null, 'удаление дополнительного слота');
  t.ok((await pgBackend.load('yid_test_01')).name === 'PlayerOne', 'c0 после удаления альта цел');

  t.suite('db-pg: стресс-тест пула соединений под конкурентной нагрузкой');
  const CONCURRENT_OPS = 50;
  const jobs = [];
  const tStart = Date.now();

  for (let i = 0; i < CONCURRENT_OPS; i++) {
    const yid = `stress_user_${i % 10}`;
    const pdata = { name: `User_${i % 10}`, level: 10 + (i % 5), seq: i };
    jobs.push(pgBackend.save(yid, pdata));
  }
  await Promise.all(jobs);
  const elapsedMs = Date.now() - tStart;
  t.ok(elapsedMs < 1000, `50 конкурентных сохранений завершены быстро (${elapsedMs} мс)`);

  // Проверка сериализации на одном yid (writeChains): последний в очереди побеждает
  const serialJobs = [];
  for (let s = 1; s <= 20; s++) {
    serialJobs.push(pgBackend.save('race_user', { name: 'RacePlayer', val: s }));
  }
  await Promise.all(serialJobs);
  const finalRace = await pgBackend.load('race_user');
  t.eq(finalRace && finalRace.val, 20, 'последовательность конкурентных сейвов на одном ключе сохранена (val=20)');

  t.suite('db-pg: персистентность кланов в PostgreSQL');
  const testClan = {
    id: 'c_steam_test',
    name: 'SteamForge',
    level: 2,
    reputation: 1500,
    leaderYid: 'yid_leader',
    leaderCharId: 'c0',
    members: [{ yid: 'yid_leader', charId: 'c0', name: 'Leader', rank: 'leader' }],
    wh: { copper_ingot: 50 }
  };
  await pgBackend.saveClan(testClan);
  const loadedClan = await pgBackend.loadClan('c_steam_test');
  t.ok(loadedClan && loadedClan.name === 'SteamForge', 'клан сохранён и прочитан из PostgreSQL');
  t.eq(loadedClan.wh.copper_ingot, 50, 'склад клана в PostgreSQL корректен');

  const allClans = await pgBackend.loadAllClans();
  t.ok(allClans.some(c => c.id === 'c_steam_test'), 'loadAllClans находит созданный клан');

  await pgBackend.removeClan('c_steam_test');
  t.eq(await pgBackend.loadClan('c_steam_test'), null, 'removeClan удаляет клан из PostgreSQL');

  t.suite('db-pg: устойчивость к транзиентным сетевым сбоям (retryPgQuery)');
  mockPool.failNextCount = 2; // Первые 2 попытки выбросят ECONNRESET
  mockPool.failErrorCode = 'ECONNRESET';
  mockPool.failErrorMessage = 'Connection terminated unexpectedly';
  let saveOk = false;
  try {
    await pgBackend.save('retry_user', { name: 'ResilientUser', level: 15 });
    saveOk = true;
  } catch (e) {
    saveOk = false;
  }
  t.ok(saveOk, 'запись успешно выполнена после двух транзиентных ECONNRESET (авто-повтор)');
  const loadedResilient = await pgBackend.load('retry_user');
  t.eq(loadedResilient && loadedResilient.level, 15, 'данные после восстановления сети целы');

  // Фатальная ошибка (не транзиентная) должна пробрасываться
  const errorMockPool = new MockPgPool({ max: 5 });
  const errorBackend = DB.createPgBackend(errorMockPool);
  errorMockPool.failNextCount = 1;
  errorMockPool.failErrorCode = '42P01'; // undefined_table
  errorMockPool.failErrorMessage = 'relation "profiles" does not exist';
  let threwFatal = false;
  try {
    await errorBackend.save('fatal_user', { name: 'Fatal' });
  } catch (_) {
    threwFatal = true;
  }
  t.ok(threwFatal, 'не-транзиентная ошибка пробрасывается наружу');

  t.suite('db-pg: системное состояние (реестры персонажей и GM)');
  await pgBackend.saveSystemState('test_gm_access', { accounts: { 'admin_yid': 100 } });
  const loadedSys = await pgBackend.loadSystemState('test_gm_access');
  t.ok(loadedSys && loadedSys.accounts['admin_yid'] === 100, 'system_state сохраняется и читается из PostgreSQL');

  t.suite('db-pg: healthCheck, метрики пула и graceful shutdown');
  const health = await pgBackend.healthCheck();
  t.eq(health.ok, true, 'healthCheck сообщает ok: true');
  t.eq(health.mode, 'postgres', 'healthCheck режим postgres');
  t.ok(typeof health.latencyMs === 'number', 'healthCheck замерил latencyMs');

  const stats = pgBackend.getPoolStats();
  t.eq(stats.mode, 'postgres', 'poolStats режим postgres');
  t.ok(typeof stats.totalCount === 'number', 'poolStats сообщает totalCount');

  await pgBackend.close();
  t.eq(mockPool.ended, true, 'close() дренирует очередь и корректно закрывает пул');

  t.suite('db-pg: утилита миграции migrate-db.js');
  const mig = require(path.join(ROOT, 'scripts', 'migrate-db.js'));
  t.ok(typeof mig.fileToPg === 'function', 'fileToPg функция доступна');
  t.ok(typeof mig.pgToFile === 'function', 'pgToFile функция доступна');
  t.ok(typeof mig.verify === 'function', 'verify функция доступна');
  const locProfs = mig.getLocalProfiles();
  t.ok(Array.isArray(locProfs), 'getLocalProfiles возвращает массив профилей');
  const locClans = mig.getLocalClans();
  t.ok(Array.isArray(locClans), 'getLocalClans возвращает массив кланов');
  const locStates = mig.getLocalSystemState();
  t.ok(Array.isArray(locStates), 'getLocalSystemState возвращает массив состояний');
};
