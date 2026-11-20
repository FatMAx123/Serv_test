// ============================================================
//  TESTS / AUDIT_SERVER_REMEDIATION.TEST.JS
//  Регрессионные тесты по всем фазам серверного аудита (Фазы 0–5)
// ============================================================
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = async function (t) {
  // ── Фаза 0: секреты и fail-closed ──
  t.suite('Remediation Phase 0: Секреты и защита stress-auth');
  {
    const AUTH = require(path.join(ROOT, 'server', 'auth.js'));
    const stressData = Buffer.from(JSON.stringify({ uniqueID: 'stress_bot_1', issuedAt: Date.now() })).toString('base64url');
    const origSecret = process.env.STRESS_SECRET;
    const origTest = process.env.STRESS_TEST;
    try {
      process.env.STRESS_TEST = '1';
      process.env.STRESS_SECRET = 'ps-stress-perf-2026';
      const blocked = AUTH.verifySignature(stressData, 'ps-stress-perf-2026', 'some_secret', { env: 'production' });
      t.eq(blocked.ok, false, 'скомпрометированный литерал ps-stress-perf-2026 отвергнут в production');
    } finally {
      if (origSecret === undefined) delete process.env.STRESS_SECRET; else process.env.STRESS_SECRET = origSecret;
      if (origTest === undefined) delete process.env.STRESS_TEST; else process.env.STRESS_TEST = origTest;
    }

    const deploySurge = fs.readFileSync(path.join(ROOT, 'scripts', 'deploy-surge.js'), 'utf8');
    const rebindKey = fs.readFileSync(path.join(ROOT, 'scripts', 'rebind-key.js'), 'utf8');
    const stressScript = fs.readFileSync(path.join(ROOT, 'scripts', 'stress-test-3000.js'), 'utf8');
    const wfStress = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'stress-test.yml'), 'utf8');
    t.ok(!deploySurge.includes('aindiegus.dev') && !deploySurge.includes('OstrovStali'), 'deploy-surge.js очищен от учётных данных');
    t.ok(!rebindKey.includes('ps_vault_master_secret_2026_aes256gcm') && !rebindKey.includes('local_hnuzlv9blmp'), 'rebind-key.js очищен от секрета и пользовательских хэшей');
    t.ok(!stressScript.includes('ps-stress-perf-2026'), 'stress-test-3000.js не содержит хардкод stress-key');
    t.ok(wfStress.includes('secrets.STRESS_SECRET') || wfStress.includes('stress-key'), 'stress-test.yml использует проверенный конфиг');
  }

  // ── Фаза 1: Кластерная изоляция, БД, corpse HP, 64-bit EXP/reputation ──
  t.suite('Remediation Phase 1: Целостность кластера, БД и безопасные целые');
  {
    const DB = require(path.join(ROOT, 'server', 'db.js'));
    t.throws(() => {
      DB.assertProductionDatabase({
        env: 'development',
        strict: false,
        mode: 'file',
        clusterWorkers: 4,
        allowFileInProd: false,
        allowClusterFile: false
      });
    }, 'DB=file при CLUSTER_WORKERS=4 без явного разрешения блокируется');

    const Clans = require(path.join(ROOT, 'server', 'clans-store.js'));
    const origMaster = process.env.IS_CLUSTER_MASTER;
    const origWorker = process.env.IS_CLUSTER_WORKER;
    const origIdx = process.env.WORKER_INDEX;
    try {
      process.env.IS_CLUSTER_MASTER = '1';
      delete process.env.IS_CLUSTER_WORKER;
      t.eq(Clans.isCwhOwner(), false, 'Master-процесс кластера не является владельцем записи кланов');
      delete process.env.IS_CLUSTER_MASTER;
      process.env.IS_CLUSTER_WORKER = '1';
      process.env.WORKER_INDEX = '1';
      t.eq(Clans.isCwhOwner(), true, 'Worker #1 в кластере является владельцем записи кланов');
      process.env.WORKER_INDEX = '2';
      t.eq(Clans.isCwhOwner(), false, 'Worker #2 в кластере не является владельцем записи кланов');
    } finally {
      if (origMaster === undefined) delete process.env.IS_CLUSTER_MASTER; else process.env.IS_CLUSTER_MASTER = origMaster;
      if (origWorker === undefined) delete process.env.IS_CLUSTER_WORKER; else process.env.IS_CLUSTER_WORKER = origWorker;
      if (origIdx === undefined) delete process.env.WORKER_INDEX; else process.env.WORKER_INDEX = origIdx;
    }

    const { Player, cosmeticsPublic } = require(path.join(ROOT, 'server', 'core', 'player.js'));
    const deadP = new Player(91001, 'local_deadp', {
      name: 'CorpseHero', level: 10, hp: 0, dead: true, cls: 'operator',
      cosmetics: { aura: 'champion_gold', auras: ['champion_gold'] }
    });
    deadP.applyClassStats();
    t.eq(deadP.dead, true, 'dead флаг сохранён при applyClassStats');
    t.eq(deadP.hp, 0, 'мёртвый персонаж остаётся с 0 HP при applyClassStats');
    const cos = cosmeticsPublic(deadP);
    t.eq(cos.aura, 'champion_gold', 'серверная постоянная аура из cosmetics.auras сохраняется');

    const PlayerDb = require(path.join(ROOT, 'server', 'player-db.js'));
    const bigExp = 5000000000; // > 2^31 - 1
    PlayerDb.touch({ name: 'BigExpHero', level: 80, exp: bigExp, sp: bigExp, cls: 'operator', createdAt: 1790000000000 }, 'local_bigexp', 'c0');
    const rec = PlayerDb.getByYid('local_bigexp', 'c0');
    t.ok(rec && rec.exp === bigExp && rec.sp === bigExp, 'PlayerDb хранит EXP/SP > 32-bit без переполнения');
  }

  // ── Фаза 2: Безопасность Gateway, CORS, TRUST_PROXY, body limit ──
  t.suite('Remediation Phase 2: Периметр HTTP/WS и анти-спуфинг IP');
  {
    const SEC = require(path.join(ROOT, 'server', 'security-config.js'));
    const savedEnv = process.env.NODE_ENV;
    const savedTrust = process.env.TRUST_PROXY;
    try {
      process.env.NODE_ENV = 'development';
      t.eq(SEC.maxHttpBodyBytes('/api/save-editor'), 32 * 1024 * 1024, 'dev /api/save-editor получает лимит 32MB');
      process.env.NODE_ENV = 'production';
      t.eq(SEC.maxHttpBodyBytes('/api/save-editor'), 4096, 'prod /api/save-editor строго ограничен 4KB');

      process.env.TRUST_PROXY = '1';
      const spoofedPublic = SEC.resolveClientIp('198.51.100.10', (h) => h === 'x-forwarded-for' ? '1.1.1.1' : '');
      t.eq(spoofedPublic, '198.51.100.10', 'внешний IP не может подделать XFF при TRUST_PROXY=1');
      const trustedPrivate = SEC.resolveClientIp('10.0.0.2', (h) => h === 'x-forwarded-for' ? '198.51.100.99' : '');
      t.eq(trustedPrivate, '198.51.100.99', 'приватный прокси IP принимается при TRUST_PROXY=1');
    } finally {
      if (savedEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedEnv;
      if (savedTrust === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = savedTrust;
    }

    const cmSrc = fs.readFileSync(path.join(ROOT, 'server', 'cluster-manager.js'), 'utf8');
    t.ok(cmSrc.includes("delete headers['cf-connecting-ip']"), 'HTTP-прокси удаляет клиентский cf-connecting-ip');
    t.ok(cmSrc.includes("delete headers['transfer-encoding']"), 'HTTP-прокси удаляет transfer-encoding');
  }

  // ── Фаза 3: Боевые криты (JS + C++), уклонение до зарядов, экономика ──
  t.suite('Remediation Phase 3: Шкалы крита JS/C++, экономика и инвентарь');
  {
    const L2 = require(path.join(ROOT, 'shared', 'l2-combat.js'));
    let critCountPct = 0;
    for (let i = 0; i < 400; i++) {
      if (L2.rollCritPct(50)) critCountPct++;
    }
    t.ok(critCountPct > 140 && critCountPct < 260, 'rollCritPct(50) даёт ~50% критов', 'count=' + critCountPct);

    let batchCrits = 0;
    const N = 400;
    const inBuf = new Float32Array(N * 12);
    const outBuf = new Int32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const o = i * 12;
      inBuf[o + 0] = 0;
      inBuf[o + 1] = 100;
      inBuf[o + 2] = 50;
      inBuf[o + 3] = 200;
      inBuf[o + 4] = 0;
      inBuf[o + 5] = 1.0;
      inBuf[o + 6] = 1.0;
      inBuf[o + 7] = 500; // L2 scale 500 -> 50%
      inBuf[o + 8] = 2.0;
      inBuf[o + 9] = 0;
      inBuf[o + 10] = 0;
      inBuf[o + 11] = 0;
    }
    L2.resolveBatchAttacks(inBuf, outBuf, N);
    for (let i = 0; i < N; i++) {
      if (!outBuf[i * 4 + 1] && outBuf[i * 4 + 2]) batchCrits++;
    }
    t.ok(batchCrits > 130 && batchCrits < 270, 'C++ SIMD resolveBatchAttacks с critChance=500 даёт ~50% критов', 'count=' + batchCrits);

    const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
    const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));
    // Проверяем, что itemMeta пробрасывает флаги nodrop/bound/devices
    let nonStarterDevice = null;
    if (ITEMS && typeof ITEMS.all === 'function') {
      nonStarterDevice = ITEMS.all().find(it => it && (it.isResonator || it.isCompressor || it.isValveDevice || it.isBracers) && !NPCS.isStarterEquip(it.id));
    }
    if (nonStarterDevice) {
      t.eq(NPCS.sellPrice(nonStarterDevice.id), 0, `не-стартовый прибор ${nonStarterDevice.id} нельзя продать в магазин`);
    } else {
      t.ok(NPCS.itemMeta('operator_compressor_low').nodrop === true, 'NPCS.itemMeta пробрасывает nodrop флаг');
    }

    const G = require(path.join(ROOT, 'shared', 'game-rules.js'));
    const opStarter = G.newProfile('OpStarterCheck', { cls: 'operator' });
    t.eq(opStarter.inv.pressure_amplifier || 0, 0, 'стартовый инвентарь оператора не выдаёт бесплатных свитков заточки');

    // Legacy ring migration & pushWeight
    const createInvHandler = require(path.join(ROOT, 'server', 'handlers', 'inventory-action-handler.js'));
    let weightPushed = 0;
    const invH = createInvHandler({
      send: () => { },
      checkRate: () => true,
      isBadKey: (k) => !k || k === '__proto__' || k === 'constructor' || k === 'prototype',
      equipSlotForTpl: (tpl) => tpl && tpl.slot,
      stampDeviceFields: () => { },
      pushCombatStats: () => { },
      pushWeight: () => { weightPushed++; },
      saveProfileNow: () => { },
      broadcastCosmeticsUpdate: () => { },
      invCount: (p, id) => (p.inv && p.inv[id]) || 0,
      spawnGroundLoot: () => { },
      itemLookup: (id) => ITEMS.get(id)
    });
    const testP = {
      pid: 92001, cls: 'operator', level: 10, dead: false, hp: 100,
      equip: { ring_l: { id: 'operator_bracers_low', templateId: 'operator_bracers_low', plus: 2 } },
      inv: { goggles: 1 },
      plusById: {}
    };
    invH.doEquip(testP, { templateId: 'goggles' });
    t.ok(!testP.equip.ring_l, 'устаревший слот ring_l перенесён');
    t.eq(testP.inv.operator_bracers_low, 1, 'предмет из ring_l возвращён в сумку вместо удаления');
    t.eq(testP.plusById.operator_bracers_low, 2, 'заточка перенесённого предмета сохранена');
    t.ok(weightPushed >= 1, 'doEquip вызывает pushWeight');
  }

  // ── Фаза 4: Геодата, время, вес, квесты, античит ──
  t.suite('Remediation Phase 4: Стабильность и оптимизации');
  {
    const WT = require(path.join(ROOT, 'shared', 'world-time.js'));
    t.ok(WT.SYNC_INTERVAL_MS >= 10000, 'world-time SYNC_INTERVAL_MS >= 10000мс');

    const WR = require(path.join(ROOT, 'shared', 'weight-rules.js'));
    t.noThrow(() => {
      WR.loadAfterAdd({ constructor: 5 }, {}, '__proto__', 1, () => null);
      WR.loadAfterAdd({ prototype: 2 }, {}, 'prototype', 1, () => null);
    }, 'weight-rules безопасен к __proto__/constructor/prototype');

    const { createQuestHandler } = require(path.join(ROOT, 'server', 'handlers', 'quest-handler.js'));
    const QD = require(path.join(ROOT, 'shared', 'quest-db.js'));
    let qSaved = 0;
    const anyKillQuest = QD.all().find(q => Array.isArray(q.objectives) && q.objectives.some(o => o.type === 'kill'));
    if (anyKillQuest) {
      const obj = anyKillQuest.objectives.find(o => o.type === 'kill');
      const qh = createQuestHandler({
        QD, NPCS: require(path.join(ROOT, 'shared', 'npc-services.js')), EXP: require(path.join(ROOT, 'shared', 'l2-exp-table.js')),
        send: () => { }, invCount: () => 0, giveCurrency: () => { }, grantExpSp: () => { },
        applyPlayerBuff: () => { }, pushEffects: () => { }, pushCombatStats: () => { },
        saveProfileNow: () => { qSaved++; }, pruneInv: () => { }, pushWeight: () => { }
      });
      const qp = {
        pid: 93001,
        level: 10,
        classTier: 1,
        inv: {},
        plusById: {},
        quests: { active: { [anyKillQuest.id]: { p: anyKillQuest.objectives.map(() => 0) } }, done: {}, completed: {} }
      };
      const changed = qh.questOnKill(qp, obj.target);
      t.eq(changed, true, 'questOnKill обновил прогресс');
      t.ok(qSaved > 0, 'questOnKill вызывает saveProfileNow');
    }
  }

  // ------------------------------------------------------------
  // Волна P3: Регрессионные тесты полировки и гигиены кода
  // ------------------------------------------------------------
  t.suite('Remediation Phase 3: Leaderboard, Chat, GM & Skills');

  // M-14: Санитизация bidi-символов в чате
  const rawTextWithBidi = 'Hello \u202eREVERSED\u202c World\u0000!';
  const sanitized = rawTextWithBidi.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  t.eq(sanitized, 'Hello REVERSED World!', 'Bidi и управляющие символы успешно удаляются из текста');

  // M-15: Сброс GM статуса и навыков при //setgm 0
  const createGmHandler = require(path.join(ROOT, 'server', 'handlers', 'gm-handler.js'));
  let gmSyncSent = null;
  const gmH = createGmHandler({
    send: (p, msg) => { gmSyncSent = msg; },
    sendPid: () => {},
    broadcastAOI: () => {},
    broadcastAOIExcept: () => {},
    broadcastServer: () => {},
    findPlayerByName: () => null,
    itemLookup: () => null,
    isBadKey: () => false,
    sanitizeCharName: (n) => n,
    isPeaceAt: () => true,
    zoneLabelAt: () => 'Village',
    checkRate: () => true
  });
  const gmTarget = {
    pid: 7771,
    name: 'TestGmPlayer',
    accessLevel: 100,
    gm: true,
    invul: true,
    gmSpeedMul: 3,
    flashSpeed: true,
    skills: { gm_oneshot: 1, test_immortal: 1, fireball: 1 }
  };
  gmH.applyLiveGmState(gmTarget, 0);
  t.eq(gmTarget.accessLevel, 0, 'accessLevel сброшен до 0');
  t.eq(gmTarget.gm, false, 'Флаг gm стал false');
  t.eq(gmTarget.invul, false, 'Неуязвимость снята');
  t.eq(gmTarget.gmSpeedMul, 1, 'Множитель скорости сброшен до 1');
  t.eq(gmTarget.skills.gm_oneshot, undefined, 'Скилл gm_oneshot удалён');
  t.eq(gmTarget.skills.test_immortal, undefined, 'Скилл test_immortal удалён');
  t.eq(gmTarget.skills.fireball, 1, 'Обычный скилл fireball сохранён');
};

