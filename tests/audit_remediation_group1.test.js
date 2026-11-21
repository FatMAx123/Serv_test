// ============================================================
//  TESTS / AUDIT_REMEDIATION_GROUP1.TEST.JS
//  Аудит сервера (эталон L2 Classic), группа 1 — баги и эксплойты:
//   1) штраф EXP группы за разницу уровней применяется один раз;
//   2) стартовое оружие не выдаётся повторно чаще раза в сутки;
//   3) бонусы крита/уклонения в единицах шкалы L2 + потолок крита 50%;
//   4) таблица HP/MP Human Mystic (инженер) без опечатки;
//   5) время каста физических скиллов — от Atk.Spd, магии — от Casting Spd.
// ============================================================
'use strict';

const L2 = require('../shared/l2-combat.js');
const G = require('../shared/game-rules.js');
const EXP = require('../shared/l2-exp-table.js');
const SK = require('../shared/skill-db.js');
const { createPartyHandler } = require('../server/handlers/party-handler.js');
const { createSkillCaster } = require('../server/combat/skill-caster.js');
const { createSessionManager } = require('../server/session/session-manager.js');
const { Player } = require('../server/core/player.js');

module.exports = async function (t) {
  // ------------------------------------------------------------------
  t.suite('Группа 1.1: EXP группы — штраф уровня считается один раз (по старшему)');
  {
    const granted = [];
    const a = { pid: 1, level: 20, x: 0, z: 0, exp: 0, sp: 0, partyId: 'g1' };
    const b = { pid: 2, level: 20, x: 0, z: 0, exp: 0, sp: 0, partyId: 'g1' };
    const c = { pid: 3, level: 15, x: 0, z: 0, exp: 0, sp: 0, partyId: 'g2' };
    const d = { pid: 4, level: 20, x: 0, z: 0, exp: 0, sp: 0, partyId: 'g2' };
    const players = new Map([[1, a], [2, b], [3, c], [4, d]]);
    const parties = new Map([
      ['g1', { id: 'g1', leader: 1, members: new Set([1, 2]), lootMode: 'random' }],
      ['g2', { id: 'g2', leader: 4, members: new Set([3, 4]), lootMode: 'random' }]
    ]);
    const ph = createPartyHandler({
      parties, players,
      send: () => {},
      dist2: (x1, z1, x2, z2) => (x1 - x2) ** 2 + (z1 - z2) ** 2,
      checkRate: () => true,
      CS: {}, G, EXP,
      grantExpSp: (pl, exp) => { granted.push({ pid: pl.pid, exp }); return { exp, sp: 0 }; },
      getNextId: () => 1
    });

    // Равная группа 20+20, моб 13 (разница 7 → ×0.694 по L2)
    ph.splitExpToParty(a, 1000, 13, { mobId: 'm13' });
    const pot = Math.floor(1000 * EXP.partyExpBonus(2));
    const share = Math.floor(pot * 20 / 40);
    const mod = G.expModifier(20, 13);
    const want = Math.floor(share * mod);
    const gotA = granted.find(g => g.pid === 1);
    t.eq(gotA && gotA.exp, want, 'старший игрок: share × mod (без квадрата штрафа)');
    t.ok(gotA && gotA.exp > Math.floor(share * mod * mod), 'больше, чем при прежнем двойном штрафе');

    // Смешанная группа 15+20, моб 13: модификатор один — от старшего (20)
    granted.length = 0;
    ph.splitExpToParty(d, 1000, 13, { mobId: 'm13' });
    const pot2 = Math.floor(1000 * EXP.partyExpBonus(2));
    const shareLow = Math.floor(pot2 * 15 / 35);
    const gotC = granted.find(g => g.pid === 3);
    t.eq(gotC && gotC.exp, Math.floor(shareLow * mod), 'младший получает долю × модификатор старшего уровня');
  }

  // ------------------------------------------------------------------
  t.suite('Группа 1.2: стартовое оружие — выдаётся один раз, выкуп за 0');
  {
    const mkProfile = (extra) => Object.assign({
      name: 'Farmer', cls: 'operator', level: 5, exp: 100, sp: 0,
      starterGranted: true,
      inv: { copper_parts: 0 },
      wh: {},
      equip: {
        chest: { id: 'wooden_breastplate', templateId: 'wooden_breastplate' },
        necklace: { id: 'operator_compressor_low', templateId: 'operator_compressor_low' },
        bracelet: { id: 'operator_bracers_low', templateId: 'operator_bracers_low' }
      },
      skills: {}
    }, extra || {});

    let seq = 0;
    async function loginWith(profile) {
      seq++;
      const players = new Map();
      const wsByPid = new Map();
      const ws = { send: () => {}, readyState: 1 };
      const sm = createSessionManager({
        AUTH: { verifySignature: () => ({ ok: true }), parseLoginData: require('../server/auth.js').parseLoginData },
        AccountKeys: { isBanned: () => false },
        PlayerDb: { getProfile: () => ({ name: 'Farmer', level: 5 }), setOnline: () => {} },
        DB: { load: async () => JSON.parse(JSON.stringify(profile)), save: async () => {} },
        sanitizeCharName: (n) => n || 'Farmer',
        getNextPid: () => 700 + seq,
        players, wsByPid, pidByYid: new Map(), loggingIn: new Set(),
        detachPlayer: async () => {},
        sendJson: () => {},
        send: () => {},
        selfPayload: (p) => ({ t: 'self', pid: p.pid }),
        effectsPayload: () => ({ t: 'effects', buffs: [] }),
        questsPayload: () => ({ t: 'quests', active: {} }),
        syncPlayerRegionSubscription: () => {},
        recomputeAOI: () => {},
        isSyntheticBot: () => false
      });
      const data = Buffer.from(JSON.stringify({ uniqueID: 'farm_regrant_' + seq, publicName: 'Farmer' })).toString('base64url');
      await sm.doLogin(ws, { data, signature: '' });
      return players.get(ws.pid) || null;
    }

    // Существующий персонаж без оружия и без денег (отдал/продал) — новое не выдаётся
    const p1 = await loginWith(mkProfile());
    t.ok(p1 != null, 'вход существующего персонажа прошёл');
    t.ok(p1 && !(p1.equip && p1.equip.weapon), 'без оружия и без денег — повторной выдачи нет');
    const p2 = await loginWith(mkProfile());
    t.ok(p2 && !(p2.equip && p2.equip.weapon), 'и при следующем входе тоже нет');

    // Новый персонаж (профиля нет) — стартовое оружие выдаётся при создании
    seq++;
    {
      const players = new Map();
      const ws = { send: () => {}, readyState: 1 };
      const sm = createSessionManager({
        AUTH: { verifySignature: () => ({ ok: true }), parseLoginData: require('../server/auth.js').parseLoginData },
        AccountKeys: { isBanned: () => false },
        PlayerDb: { getProfile: () => null, setOnline: () => {} },
        DB: { load: async () => null, save: async () => {}, listChars: async () => [] },
        sanitizeCharName: (n) => n || 'Newbie',
        getNextPid: () => 800 + seq,
        players, wsByPid: new Map(), pidByYid: new Map(), loggingIn: new Set(),
        detachPlayer: async () => {},
        sendJson: () => {}, send: () => {},
        selfPayload: (p) => ({ t: 'self', pid: p.pid }),
        effectsPayload: () => ({ t: 'effects', buffs: [] }),
        questsPayload: () => ({ t: 'quests', active: {} }),
        syncPlayerRegionSubscription: () => {}, recomputeAOI: () => {},
        isSyntheticBot: () => false
      });
      const data = Buffer.from(JSON.stringify({ uniqueID: 'farm_newchar_' + seq, publicName: 'Newbie' })).toString('base64url');
      await sm.doLogin(ws, { data, signature: '' });
      const np = players.get(ws.pid) || null;
      t.ok(np && np.equip && np.equip.weapon, 'новый персонаж получает стартовое оружие при создании');
    }

    // Выкуп торговцем: принимает, платит 0
    const { createNpcServicesHandler } = require('../server/handlers/npc-services-handler.js');
    const NPCS = require('../shared/npc-services.js');
    const shopMsgs = [];
    const seller = { pid: 77, hp: 100, inv: { operator_hammer_low: 1, copper_parts: 5 }, plusById: {}, equip: {} };
    const nsh = createNpcServicesHandler({
      NPCS: Object.assign({}, NPCS, { getNpc: () => ({ id: 'vex', shop: ['operator_hammer_low'], position: { x: 0, z: 0 } }), inRange: () => true }),
      send: (_p, m) => shopMsgs.push(m),
      currencyOf: (pl) => Number(pl.inv.copper_parts) || 0,
      takeCurrency: () => true,
      giveCurrency: (pl, n) => { pl.inv.copper_parts = (Number(pl.inv.copper_parts) || 0) + n; },
      invCount: (pl, id) => Number(pl.inv[id]) || 0,
      pruneInv: (pl) => { for (const k of Object.keys(pl.inv)) if (!pl.inv[k]) delete pl.inv[k]; },
      canCarryMore: () => ({ ok: true }), pushWeight: () => {}, saveProfileNow: () => {},
      isBadKey: () => false
    });
    nsh.doShopSell(seller, { npcId: 'vex', itemId: 'operator_hammer_low', count: 1 });
    const ok = shopMsgs.find(m => m.t === 'shop_sell_ok');
    t.ok(ok && ok.total === 0, 'стартовый молот продан за 0', JSON.stringify(shopMsgs[shopMsgs.length - 1]));
    t.ok(!seller.inv.operator_hammer_low, 'молот ушёл из сумки');
    t.eq(seller.inv.copper_parts, 5, 'валюта не изменилась');
  }

  // ------------------------------------------------------------------
  t.suite('Группа 1.3: единицы крита и уклонения (шкала L2)');
  {
    t.eq(L2.critBonusToL2(0.15), 150, 'доля 0.15 = +15% → +150 промилле');
    t.eq(L2.critBonusToL2(3), 3, 'целое > 1 — уже пункты шкалы L2');
    t.eq(L2.critBonusToL2(0), 0, 'ноль — ноль');
    t.eq(L2.evasionBonusToPoints(0.2), Math.round(20 / L2.HIT_PER_DIFF), '+20% уклонения → пункты через цену пункта попадания');
    t.eq(L2.evasionBonusToPoints(5), 5, 'целое > 1 — уже пункты Evasion');

    // Пассивка «+5% крита за уровень» ×5 = +25% → +250 к critRate игрока
    const base = new Player(9301, 'local_crit_base', { name: 'CritBase', cls: 'operator', level: 10 }, { charId: 'c0' });
    const withPas = new Player(9302, 'local_crit_pas', { name: 'CritPas', cls: 'operator', level: 10, skills: { gun_deadly_aim: 5 } }, { charId: 'c0' });
    const diff = withPas.combatPack.critRate - base.combatPack.critRate;
    t.eq(diff, 250, 'пассивка critChance 0.05 × 5 рангов даёт +250 (25%), а не +25 (2.5%)');

    // Скилл: базовый бонус + рост за ранг
    const mb = SK.get('gun_mortal_blow');
    if (mb) {
      const r3 = SK.valueAtLevel(mb, 'critBonus', 3);
      t.near(L2.critBonusToL2(r3), (0.25 + 0.03 * 2) * 1000, 1e-6, 'Mortal Blow ранг 3: +31% крита');
    }

    // Потолок крита 50% (500) даже при завышенном critRate
    let crits = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const h = L2.resolveHit({ pAtk: 100, accuracy: 9999, critRate: 900 }, { pDef: 100, evasion: 0 }, { skillPower: 1.0, damageType: 'physical' });
      if (h.crit) crits++;
    }
    const rate = crits / N;
    t.ok(rate > 0.46 && rate < 0.54, 'критов около 50% при critRate 900 (потолок L2)', 'доля ' + rate.toFixed(3));
  }

  // ------------------------------------------------------------------
  t.suite('Группа 1.4: таблица HP/MP Human Mystic (инженер)');
  {
    const T = L2.VITALS_TABLES;
    t.eq(T.mage.mp[5], 77.2, 'MP на 6 ур. = 77.2 (было 97.28)');
    t.eq(T.mage.mp[19], 192, 'MP на 20 ур. = 192 (было 213)');
    t.eq(T.mage.hp[5], 180.05, 'HP на 6 ур. = 180.05 (было 178.0)');
    let same = true;
    for (let i = 0; i < 20; i++) {
      if (T.mage.mp[i] !== T.wizard.mp[i] || T.mage.hp[i] !== T.wizard.hp[i]) same = false;
    }
    t.ok(same, 'до 20 ур. таблица mage совпадает с wizard (общая база Human Mystic)');
    let monotone = true;
    for (let i = 1; i < T.mage.mp.length; i++) if (!(T.mage.mp[i] > T.mage.mp[i - 1])) monotone = false;
    t.ok(monotone, 'MP мага строго растёт по уровням');
  }

  // ------------------------------------------------------------------
  t.suite('Группа 1.5: время каста — физика от Atk.Spd, магия от Casting Spd');
  {
    function mkCaster(sent) {
      return createSkillCaster({
        send: (p, msg) => sent.push(msg),
        broadcastAOI: () => {},
        players: new Map(),
        mobs: new Map(),
        partyMembers: (p) => [p],
        playerWeightState: () => ({ canAttack: true }),
        checkRate: () => true,
        isGM: () => false
      });
    }
    function mkFighter(atkSpdL2) {
      return {
        pid: 41, name: 'Fighter', cls: 'operator', level: 10,
        hp: 300, maxHp: 300, energy: 200, maxEnergy: 200,
        skills: { op_steam_vent: 1 }, cd: {}, buffs: [], debuffs: [],
        devices: { valve: 6, wrist: 6, circuit: 6, nano: 6 },
        equip: {
          weapon: { id: 'operator_hammer_low', templateId: 'operator_hammer_low' },
          necklace: { id: 'operator_compressor_low', templateId: 'operator_compressor_low' },
          bracelet: { id: 'operator_bracers_low', templateId: 'operator_bracers_low' }
        },
        combatPack: { pAtk: 40, cAtk: 10, accuracy: 40, critRate: 40, weaponClass: '1h_blunt', atkSpdL2, primary: { WIT: 11, DEX: 30, MEN: 25 } },
        x: 0, z: 0
      };
    }
    const tpl = SK.get('op_steam_vent');
    const base = tpl.chargeTime;

    const sent1 = [];
    mkCaster(sent1).doCastBegin(mkFighter(333), { skillId: 'op_steam_vent' });
    const cs1 = sent1.find(m => m.t === 'cast_start');
    t.eq(cs1 && cs1.totalMs, L2.quantizeCombatMs(base * 333 / 333 * 1000, 100), 'Atk.Spd 333 → каст = база (' + base + ' с)');

    const sent2 = [];
    mkCaster(sent2).doCastBegin(mkFighter(166), { skillId: 'op_steam_vent' });
    const cs2 = sent2.find(m => m.t === 'cast_start');
    t.eq(cs2 && cs2.totalMs, L2.quantizeCombatMs(base * 333 / 166 * 1000, 100), 'Atk.Spd 166 → каст ×2');

    const oldMs = L2.quantizeCombatMs(base * 333 / L2.mAtkSpd(11, 0, 0) * 1000, 100);
    t.ok(cs1 && cs1.totalMs < oldMs, 'боец с WIT 11 больше не кастует от Casting Spd', 'было ' + oldMs + ' мс');
  }
};
