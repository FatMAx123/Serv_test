// ============================================================
//  TESTS / AUDIT_REMEDIATION_GROUP4.TEST.JS
//  Аудит сервера, группа 4 — атомарность переносов (обмен, лавка, клан-склад):
//   - DB.saveAtomic: файловая БД — журнал + записи + удаление журнала, доигрывание;
//   - Postgres — одна транзакция (BEGIN … COMMIT / ROLLBACK);
//   - обработчики обмена, лавки и клан-склада сохраняют перенос одной операцией.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const DB = require('../server/db.js');
const CH = require('../shared/char-rules.js');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TXN_DIR = path.join(DATA_DIR, '_txn');
const CLANS_DIR = path.join(DATA_DIR, 'clans');

function profileFile(yid, charId) {
  return path.join(DATA_DIR, CH.profileStem(String(yid).toLowerCase().replace(/[^a-z0-9_-]/g, '_'), charId) + '.json');
}
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } }
function rm(f) { for (const x of [f, f + '.bak']) { try { fs.unlinkSync(x); } catch (_) { } } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function (t) {
  const FB = DB.FileBackend;
  const sfx = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const yA = 'itest_txn_a_' + sfx, yB = 'itest_txn_b_' + sfx, clanId = 'itesttxn' + sfx;
  const fA = profileFile(yA, 'c0'), fB = profileFile(yB, 'c0');
  const fClan = path.join(CLANS_DIR, clanId + '.json');
  const journalsBefore = fs.existsSync(TXN_DIR) ? fs.readdirSync(TXN_DIR).length : 0;

  try {
    // ------------------------------------------------------------------
    t.suite('Группа 4.1: файловая БД — атомарный перенос (журнал → записи → удаление)');
    await FB.saveAtomic([
      { kind: 'profile', yid: yA, charId: 'c0', data: { name: 'TxnA', saveRev: 5, inv: { copper_parts: 90 } } },
      { kind: 'profile', yid: yB, charId: 'c0', data: { name: 'TxnB', saveRev: 7, inv: { copper_parts: 10, synthetic_oil: 1 } } },
      { kind: 'clan', id: clanId, get: () => ({ id: clanId, name: 'TxnClan', members: [], wh: { synthetic_oil: 3 } }) }
    ]);
    t.eq(readJson(fA) && readJson(fA).inv.copper_parts, 90, 'профиль A записан');
    t.eq(readJson(fB) && readJson(fB).inv.synthetic_oil, 1, 'профиль B записан');
    t.eq(readJson(fClan) && readJson(fClan).wh.synthetic_oil, 3, 'клан записан (снимок взят в момент записи)');
    const journalsAfter = fs.existsSync(TXN_DIR) ? fs.readdirSync(TXN_DIR).length : 0;
    t.eq(journalsAfter, journalsBefore, 'журнал после успешного переноса удалён');

    // ------------------------------------------------------------------
    t.suite('Группа 4.2: доигрывание журнала после «падения»');
    // Журнал записан, а записи профилей и клана не успели (процесс упал)
    fs.mkdirSync(TXN_DIR, { recursive: true });
    await sleep(30);
    const jfile = path.join(TXN_DIR, String(Date.now()).padStart(15, '0') + '-test-' + sfx + '.json');
    fs.writeFileSync(jfile, JSON.stringify({
      v: 1, at: Date.now(), items: [
        { kind: 'profile', yid: yA, charId: 'c0', data: { name: 'TxnA', saveRev: 6, inv: { copper_parts: 40 } } },
        { kind: 'profile', yid: yB, charId: 'c0', data: { name: 'TxnB', saveRev: 8, inv: { copper_parts: 60, synthetic_oil: 1 } } },
        { kind: 'clan', data: { id: clanId, name: 'TxnClan', members: [], wh: { synthetic_oil: 9 } } }
      ]
    }));
    await FB.replayJournals({ force: true });
    t.eq(readJson(fA).inv.copper_parts, 40, 'доигран профиль A');
    t.eq(readJson(fB).inv.copper_parts, 60, 'доигран профиль B — перенос не потерян и не задвоен');
    t.eq(readJson(fClan).wh.synthetic_oil, 9, 'доигран склад клана');
    t.ok(!fs.existsSync(jfile), 'журнал после доигрывания удалён');

    // Файл, переписанный ПОСЛЕ журнала, не откатывается к снимку журнала
    const jfile2 = path.join(TXN_DIR, String(Date.now()).padStart(15, '0') + '-test2-' + sfx + '.json');
    fs.writeFileSync(jfile2, JSON.stringify({
      v: 1, at: Date.now(), items: [
        { kind: 'clan', data: { id: clanId, name: 'TxnClan', members: [], wh: { synthetic_oil: 1 } } }
      ]
    }));
    const past = new Date(Date.now() - 60000);
    fs.utimesSync(jfile2, past, past);
    await sleep(20);
    fs.writeFileSync(fClan, JSON.stringify({ id: clanId, name: 'TxnClan', members: [], wh: { synthetic_oil: 12 } }));
    await FB.replayJournals({ force: true });
    t.eq(readJson(fClan).wh.synthetic_oil, 12, 'более свежий файл клана не перезаписан старым журналом');
    t.ok(!fs.existsSync(jfile2), 'журнал удалён и в этом случае');

    // Профиль: снимок журнала с ревизией ниже диска не применяется
    const jfile3 = path.join(TXN_DIR, String(Date.now()).padStart(15, '0') + '-test3-' + sfx + '.json');
    fs.writeFileSync(jfile3, JSON.stringify({
      v: 1, at: Date.now(), items: [
        { kind: 'profile', yid: yA, charId: 'c0', data: { name: 'TxnA', saveRev: 2, inv: { copper_parts: 1 } } }
      ]
    }));
    await sleep(20);
    await FB.replayJournals({ force: true });
    t.eq(readJson(fA).inv.copper_parts, 40, 'устаревшая ревизия профиля из журнала не затирает диск');
  } finally {
    rm(fA); rm(fB); rm(fClan);
  }

  // ------------------------------------------------------------------
  t.suite('Группа 4.3: Postgres — перенос одной транзакцией');
  {
    const queries = [];
    let failOn = null;
    const client = {
      query: async (sql) => {
        const s = String(sql).trim().split(/\s+/).slice(0, 3).join(' ');
        queries.push(s);
        if (failOn && String(sql).includes(failOn)) throw Object.assign(new Error('boom'), { code: 'XX000' });
        return { rows: [] };
      },
      release: () => queries.push('RELEASE')
    };
    const pool = { connect: async () => client, query: client.query, on: () => {} };
    const pg = DB.createPgBackend(pool);
    await pg.saveAtomic([
      { kind: 'profile', yid: 'pgA', data: { saveRev: 3 } },
      { kind: 'profile', yid: 'pgB', data: { saveRev: 4 } },
      { kind: 'clan', id: 'cl1', get: () => ({ id: 'cl1', name: 'C', wh: {} }) }
    ]);
    t.eq(queries, ['BEGIN', 'INSERT INTO profiles(yid,', 'INSERT INTO profiles(yid,', 'INSERT INTO clans(id,', 'COMMIT', 'RELEASE'],
      'BEGIN → два профиля → клан → COMMIT');
    queries.length = 0;
    failOn = 'INSERT INTO clans';
    let threw = false;
    try {
      await pg.saveAtomic([
        { kind: 'profile', yid: 'pgA', data: { saveRev: 5 } },
        { kind: 'clan', id: 'cl1', data: { id: 'cl1', name: 'C', wh: {} } }
      ]);
    } catch (_) { threw = true; }
    t.ok(threw, 'ошибка записи клана пробрасывается вызывающему');
    t.ok(queries.includes('ROLLBACK') && !queries.includes('COMMIT'), 'при ошибке — ROLLBACK, профиль не закоммичен отдельно');
  }

  // ------------------------------------------------------------------
  t.suite('Группа 4.4: обмен, лавка и клан-склад сохраняют перенос одной операцией');
  {
    const calls = [];
    const saveTransferAtomic = (list, clan) => calls.push({ pids: list.map((p) => p.pid), clan: clan ? clan.id : null });
    const singleSaves = [];
    const saveProfileNow = (p) => singleSaves.push(p.pid);
    const inv = (pl, id) => (Number(pl.inv[id]) || 0);

    // Обмен
    const createTradeHandler = require('../server/handlers/trade-handler.js');
    const p = { pid: 1, name: 'A', x: 0, z: 0, inv: { synthetic_oil: 2 }, plusById: {}, equip: {} };
    const q = { pid: 2, name: 'B', x: 1, z: 0, inv: { copper_parts: 100 }, plusById: {}, equip: {} };
    const th = createTradeHandler({
      players: new Map([[1, p], [2, q]]), send: () => {}, isBadKey: () => false, invCount: inv,
      wouldExceedWeight: () => ({ ok: true }), pruneInv: () => {}, saveProfileNow, saveTransferAtomic, pushWeight: () => {}
    });
    p.trade = { peer: 2, offer: { synthetic_oil: 1 }, locked: true, confirmed: true, at: Date.now() };
    q.trade = { peer: 1, offer: { copper_parts: 30 }, locked: true, confirmed: true, at: Date.now() };
    th.tradeExecute(p, q);
    t.eq(calls[0], { pids: [1, 2], clan: null }, 'обмен: оба профиля — одним атомарным сохранением');
    t.eq(singleSaves, [], 'обмен: отдельных сохранений нет');
    t.eq(q.inv.synthetic_oil, 1, 'обмен прошёл (масло у B)');

    // Личная лавка
    calls.length = 0;
    const createStoreHandler = require('../server/handlers/store-handler.js');
    const owner = { pid: 3, name: 'Seller', x: 0, z: 0, inv: { synthetic_oil: 5 }, plusById: {}, equip: {},
      store: { mode: 'sell', title: 'x', items: { synthetic_oil: { count: 5, price: 10 } } } };
    const buyer = { pid: 4, name: 'Buyer', x: 1, z: 0, inv: { copper_parts: 100 }, plusById: {}, equip: {} };
    const cur = (pl) => inv(pl, 'copper_parts');
    const sh = createStoreHandler({
      players: new Map([[3, owner], [4, buyer]]), send: () => {}, broadcastAOI: () => {},
      currencyOf: cur, takeCurrency: (pl, n) => { pl.inv.copper_parts = cur(pl) - n; return true; },
      giveCurrency: (pl, n) => { pl.inv.copper_parts = cur(pl) + n; }, invCount: inv, isBadKey: () => false,
      canCarryMore: () => ({ ok: true }), pruneInv: () => {}, saveProfileNow, saveTransferAtomic, pushWeight: () => {},
      playerStunned: () => false, Mod: { log: () => {} }
    });
    sh.doStoreDeal(buyer, { pid: 3, itemId: 'synthetic_oil', count: 2, expectedPrice: 10 }, 'buy');
    t.eq(calls[0], { pids: [4, 3], clan: null }, 'лавка: покупатель и продавец — одним атомарным сохранением');
    t.eq(buyer.inv.synthetic_oil, 2, 'покупка прошла');

    // Клан-склад: исходник использует атомарное сохранение для put и take
    const clanSrc = fs.readFileSync(path.join(ROOT, 'server', 'handlers', 'clan-handler.js'), 'utf8');
    const n = (clanSrc.match(/saveTransferAtomic\(\[p\], c\)/g) || []).length;
    t.eq(n, 2, 'клан-склад: вклад и выдача сохраняют сумку и склад одной операцией');
  }
};
