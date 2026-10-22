// SERVER / SESSION / SESSION-MANAGER.JS
// Управление сессиями игроков, аутентификацией, созданием персонажей и входом в игру (doLogin)
'use strict';

const CS = require('../../shared/class-system.js');
const EXP = require('../../shared/l2-exp-table.js');
const QD = require('../../shared/quest-db.js');
const COS = require('../../shared/cosmetics-db.js');
const CH = require('../../shared/char-rules.js');
const G = require('../../shared/game-rules.js');
const ITEMS = require('../../shared/item-db.js');
const SEC = require('../security-config.js');
const GuestAuth = require('../guest-auth.js');
const Mod = require('../moderation.js');
const { Player, itemLookup, cosmeticsPublic } = require('../core/player.js');
const { TYPE_PLAYER } = require('../../shared/entity-transform-table.js');

let _cachedBaseClasses = null;

function createSessionManager(ctx) {
  const {
    AUTH = require('../auth.js'),
    YANDEX_SECRET = '',
    AccountKeys = require('../account-keys.js'),
    DB,
    PlayerDb,
    sanitizeCharName = (n) => String(n || '').trim(),
    getNextPid = () => 1,
    entityTransforms = null,
    players,
    wsByPid,
    pidByYid,
    loggingIn = new Set(),
    detachPlayer = async () => {},
    isSyntheticBot = () => false,
    snapStandY = () => {},
    saveProfileNow = () => {},
    resetMoveBudget = () => {},
    isGM = () => false,
    EditorGuard = null,
    zoneLabelAt = () => '',
    isPeaceAt = () => false,
    selfPayload = () => ({}),
    deathSelfPayload = () => ({}),
    effectsPayload = () => ({}),
    getActiveOnlineCount = () => 0,
    worldTimePayload = () => ({}),
    ensureNearbyMobs = () => {},
    sendNearbyLoot = () => {},
    friendsPayload = () => ({}),
    notifyFriends = () => {},
    Clans = null,
    bindClan = () => {},
    clanPayload = () => ({}),
    sendCrest = () => {},
    notifyClan = () => {},
    syncQuestCollect = () => false,
    activeEvents = new Map(),
    eventStartPayload = () => ({}),
    send = () => {},
    sendJson = () => {},
    GEO = null,
    IS_CLUSTER = false,
    clusterIpc = null,
    CURRENT_WORKER_ID = 0,
    MSG_GATEWAY_SEND = 'gateway:send',
    ZS = null,
    TOTAL_WORKERS = 1,
    initiateClusterHandoff = () => {}
  } = ctx;

  const recentLoginSignatures = new Map();

  function checkSignatureReplay(sig) {
    if (!sig || typeof sig !== 'string') return true;
    const now = Date.now();
    if (recentLoginSignatures.has(sig)) {
      return false; // Повторное использование перехваченной подписи запрещено
    }
    recentLoginSignatures.set(sig, now);
    if (recentLoginSignatures.size > 20000) {
      for (const [s, t] of recentLoginSignatures) if (now - t > 300000) recentLoginSignatures.delete(s);
    }
    return true;
  }

  async function doLogin(ws, msg) {
    if (!msg || typeof msg !== 'object') {
      sendJson(ws, { t: 'login_fail', reason: 'empty_payload' });
      try { ws.close(4000, 'empty_payload'); } catch (_) {}
      return;
    }
    const isStressSig = msg.signature && (msg.signature === (process.env.STRESS_SECRET || 'ps-stress-perf-2026') || msg.signature === 'ps-stress-perf-2026');
    if (msg.signature && !isStressSig && !(ws && ws.isStressAllowed) && !checkSignatureReplay(msg.signature)) {
      const ip = (ws && (ws.remoteAddress || (ws._socket && ws._socket.remoteAddress))) || '';
      Mod.log('auth_fail', { reason: 'signature_replay', ip: ip });
      ws.close(4003, 'replay detected');
      return;
    }
    const v = AUTH.verifySignature(msg.data, msg.signature, YANDEX_SECRET, {
      isStress: !!(ws && ws.isStressAllowed),
      stressKey: (ws && (ws.stressKey || ws._stressKey)) || ''
    });
    if (!v.ok) {
      const ip = (ws && (ws.remoteAddress || (ws._socket && ws._socket.remoteAddress))) || '';
      Mod.log('auth_fail', { reason: v.error, ip: ip, age: v.age, diff: v.diff });
      ws.close(4003, 'bad signature');
      return;
    }
    const parsed = AUTH.parseLoginData(msg.data);
    const yid = parsed.yid;
    const name = parsed.name;

    // SEC: неканоничный yid (local_X.Y, LOCAL_x, …) сводился safeName() к чужому/тому же файлу профиля.
    if (!GuestAuth.isValidYid(yid)) {
      Mod.log('auth_fail', { reason: 'bad_yid', yid: String(yid).slice(0, 80) });
      sendJson(ws, { t: 'login_fail', reason: 'bad_credentials' });
      try { ws.close(4003, 'bad yid'); } catch (_) {}
      return;
    }

    // SEC: владение гостевым аккаунтом проверяется ДО вытеснения старой сессии и для всех
    // персонажей аккаунта (раньше — только для загружаемого слота, новый слот не проверялся).
    let guestOwn = null;
    if (GuestAuth.isGuestYid(yid)) {
      guestOwn = await GuestAuth.verifyGuestOwnership(DB, AccountKeys, yid, parsed.guestToken);
      if (!guestOwn.ok) {
        Mod.log('auth_fail', { yid, reason: 'guest_' + guestOwn.reason, ip: (ws && (ws.remoteAddress || (ws._socket && ws._socket.remoteAddress))) || '' });
        sendJson(ws, { t: 'login_fail', reason: 'bad_credentials' });
        try { ws.close(4003, 'bad guest token'); } catch (_) {}
        return;
      }
      if (guestOwn.tofu && guestOwn.profiles && guestOwn.profiles.length) {
        Mod.log('guest_tofu', { yid, ip: (ws && (ws.remoteAddress || (ws._socket && ws._socket.remoteAddress))) || '' });
      }
    }
    const clientIp = (ws && (ws.clientIp || ws._ip || ws.remoteAddress || (ws._socket && ws._socket.remoteAddress))) || '';
    const ban = Mod.banInfo(yid) || (clientIp ? Mod.banIpInfo(clientIp) : null);
    if (ban) {
      sendJson(ws, { t: 'login_fail', reason: 'banned', until: ban.until, why: ban.reason });
      try { ws.close(4012, 'banned'); } catch (_) {}
      Mod.log('login', { yid: yid, name: String(name || '').slice(0, 16), ok: false, reason: 'banned', ip: clientIp });
      return;
    }

    // Один yid = одна сессия. Иначе две сессии пишут в один файл профиля
    // и последний DB.save затирает инвентарь другой (классический дюп).
    // H3: старый вычисляемый токен принят (окно миграции) — сразу выдаём случайный.
    // До вытеснения старой сессии: её игрок в памяти получает новый хэш и не затрёт его сохранением.
    if (guestOwn && guestOwn.legacy) {
      try {
        const rot = await GuestAuth.issueToken(DB, yid, { dropHash: guestOwn.tokenHash });
        guestOwn.newToken = rot.token;
        guestOwn.tokenHash = rot.tokenHash;
      } catch (e) { console.error('[login] rotate guest token', yid, e && e.message); }
    }

    // Барьер на время await DB.load и detaching: параллельный логин тем же yid
    // обязан дождаться завершения предыдущей операции
    if (loggingIn.has(yid)) {
      // Ждем до 2000мс завершения параллельного логина/детача вместо мгновенного закрытия 4009
      for (let retry = 0; retry < 20; retry++) {
        await new Promise(r => setTimeout(r, 100));
        if (!loggingIn.has(yid)) break;
      }
      if (loggingIn.has(yid)) {
        try { ws.close(4009, 'login in progress'); } catch (_) {}
        return;
      }
    }
    loggingIn.add(yid);
    try {
      const prevPid = pidByYid.get(yid);
      if (prevPid != null) {
        const prevPlayer = players.get(prevPid);
        // SEC: онлайн-сессия гостя — токен нового входа обязан совпасть с токеном сессии
        // (или быть производным от ключа). TOFU здесь не допускается.
        if (guestOwn && prevPlayer && GuestAuth.tokenHashesOf(prevPlayer).length &&
            !GuestAuth.tokenMatches(prevPlayer, guestOwn.tokenHash) && !guestOwn.legacy) {
          Mod.log('auth_fail', { yid, reason: 'guest_token_mismatch', ip: (ws && (ws.remoteAddress || (ws._socket && ws._socket.remoteAddress))) || '' });
          sendJson(ws, { t: 'login_fail', reason: 'bad_credentials' });
          try { ws.close(4003, 'bad guest token'); } catch (_) {}
          return;
        }
        const prevWs = wsByPid.get(prevPid);
        await detachPlayer(prevPid);
        if (prevWs && prevWs !== ws) {
          try { prevWs.pid = null; prevWs.close(4008, 'logged in elsewhere'); } catch (_) {}
        }
      }
      await doLoginInner(ws, msg, v, parsed, yid, name, guestOwn, clientIp);
    } finally {
      loggingIn.delete(yid);
    }
  }

  async function doLoginInner(ws, msg, v, parsed, yid, name, guestOwn, clientIp) {
    clientIp = clientIp || (ws && (ws.clientIp || ws._ip || ws.remoteAddress || (ws._socket && ws._socket.remoteAddress))) || '';
    // char payload: из login data ИЛИ из msg.char (клиент character-select)
    const charIn = (msg.char && typeof msg.char === 'object' && !Array.isArray(msg.char)) ? msg.char : {};
    const charId = CH.normalizeCharId(charIn.id || charIn.charId || parsed.charId);
    const createOpts = {
      name: sanitizeCharName(charIn.name) || sanitizeCharName(name) || 'Operator',
      race: charIn.race || parsed.race || 'human',
      gender: charIn.gender || parsed.gender || 'male',
      cls: charIn.cls || charIn.classId || parsed.cls || 'operator'
    };

    // Битый профиль: DB.load бросает. Отказываем в логине вместо выдачи
    // нового персонажа 1 уровня поверх потерянного прогресса.
    let pr = null;
    let createdNew = false;
    const isStressBot = isSyntheticBot(yid);
    if (!isStressBot) {
      try {
        pr = await DB.load(yid, charId);
      } catch (e) {
        console.error('[login] отказ по повреждённому профилю', yid, charId, e && e.message);
        sendJson(ws, { t: 'login_fail', reason: 'profile_corrupted' });
        ws.close(4010, 'profile corrupted');
        return;
      }
      // Защита P1-C: владение уже проверено в doLogin (GuestAuth.verifyGuestOwnership) для всего аккаунта.
      if (pr && guestOwn && guestOwn.ok && guestOwn.tofu && !GuestAuth.tokenHashesOf(pr).length) {
        pr.guestTokenHashes = [guestOwn.tokenHash];
        try { const sr = DB.save(yid, pr, charId); if (sr && sr.catch) sr.catch(e => console.error('[DB] save', yid, e && e.message)); } catch (e) { console.error('[DB] save', yid, e && e.message); }
      }
    }
    if (!pr) {
      let existing = [];
      if (!isStressBot) {
        try { existing = await DB.listChars(yid); } catch (_) { existing = []; }
        if (existing.length >= CH.MAX_SLOTS) {
          sendJson(ws, { t: 'login_fail', reason: 'slots' });
          try { ws.close(4005, 'no slots'); } catch (_) {}
          return;
        }
        // H5: смесь латиницы и кириллицы в новом имени — гомоглифы
        const mixedName = (n) => /[A-Za-z]/.test(n) && /[\u0400-\u04FF]/.test(n);
        if (charIn.name && mixedName(createOpts.name)) {
          sendJson(ws, { t: 'login_fail', reason: 'name_mixed' });
          try { ws.close(4006, 'name mixed'); } catch (_) {}
          return;
        }
        if (charIn.name && CS && typeof CS.isReservedCharName === 'function' && CS.isReservedCharName(createOpts.name)) {
          sendJson(ws, { t: 'login_fail', reason: 'name_reserved' });
          try { ws.close(4006, 'name reserved'); } catch (_) {}
          return;
        }
        if (!charIn.name && mixedName(createOpts.name)) createOpts.name = 'Operator';
        if (!charIn.name) {
          let base = createOpts.name || 'Operator';
          let candidate = base;
          let counter = 1;
          while (PlayerDb && typeof PlayerDb.isNameTaken === 'function' && PlayerDb.isNameTaken(candidate, yid)) {
            candidate = `${base}_${++counter}`;
          }
          createOpts.name = candidate;
        } else if (PlayerDb && typeof PlayerDb.isNameTaken === 'function' && PlayerDb.isNameTaken(createOpts.name, yid)) {
          sendJson(ws, { t: 'login_fail', reason: 'name_taken' });
          try { ws.close(4006, 'name taken'); } catch (_) {}
          return;
        }
      }
      if (charIn.appearance) createOpts.appearance = COS.normalizeAppearance(charIn.appearance);
      pr = G.newProfile(createOpts.name, createOpts);
      pr.charId = charId;
      pr.createdAt = Date.now();
      if (guestOwn && guestOwn.tokenHash) {
        // новый слот принимает те же токены устройств, что и остальные персонажи аккаунта
        let hs = [];
        try { hs = await GuestAuth.accountTokenHashes(DB, yid); } catch (_) {}
        pr.guestTokenHashes = [guestOwn.tokenHash].concat(hs.filter(h => h !== guestOwn.tokenHash)).slice(0, 5);
      }
      createdNew = true;
    } else {
      // миграция старых профилей без race/gender
      if (!pr.race) pr.race = 'human';
      if (!pr.gender) pr.gender = 'male';
      if (!pr.cls || !CS.getClass(pr.cls)) pr.cls = 'operator';
      if (!Array.isArray(pr.classHistory) || !pr.classHistory.length) pr.classHistory = [pr.cls];
      if (pr.classTier == null) pr.classTier = (CS.getClass(pr.cls) || {}).tier || 0;
      // Имя из сохранённого профиля тоже прогоняем: старые сейвы могли получить
      // 5000 символов с HTML до появления валидации.
      pr.name = sanitizeCharName(pr.name) || createOpts.name;
    }

    // Индивидуальная настройка уникальных ботов нагрузочного тестирования
    if (isSyntheticBot(yid)) {
      if (Number.isFinite(charIn.x) && Number.isFinite(charIn.z)) {
        pr.x = charIn.x;
        pr.z = charIn.z;
        pr.y = Number.isFinite(charIn.y) ? charIn.y : (GEO && GEO.ready() ? GEO.standY(pr.x, pr.z, null) : 0);
      }
      if (charIn.race) pr.race = String(charIn.race).toLowerCase();
      if (charIn.gender) pr.gender = String(charIn.gender).toLowerCase();
      if (charIn.cls) pr.cls = String(charIn.cls).toLowerCase();
      if (charIn.name) pr.name = sanitizeCharName(charIn.name);
      if (charIn.appearance) pr.appearance = COS.normalizeAppearance(charIn.appearance);
      pr.skills = Object.assign(pr.skills || {}, {
        op_power_strike: 1,
        op_iron_punch: 1,
        op_steam_vent: 1,
        op_emergency_repair: 1,
        op_shield_stun: 1,
        eng_pressure_bolt: 1,
        eng_curse_corrode: 1,
        eng_pressure_drain: 1,
        eng_self_repair: 1,
        eng_might: 1,
        eng_shield: 1
      });
      if (!pr.equip) pr.equip = {};
      if (pr.cls === 'operator') {
        if (!pr.equip.weapon) pr.equip.weapon = { id: 'operator_hammer_low', templateId: 'operator_hammer_low' };
        if (!pr.equip.chest) pr.equip.chest = { id: 'wooden_breastplate', templateId: 'wooden_breastplate' };
        if (!pr.equip.legs) pr.equip.legs = { id: 'wooden_gaiters', templateId: 'wooden_gaiters' };
        if (!pr.equip.necklace) pr.equip.necklace = { id: 'operator_compressor_low', templateId: 'operator_compressor_low' };
        if (!pr.equip.bracelet) pr.equip.bracelet = { id: 'operator_bracers_low', templateId: 'operator_bracers_low' };
      } else {
        if (!pr.equip.weapon) pr.equip.weapon = { id: 'apprentice_wand', templateId: 'apprentice_wand' };
        if (!pr.equip.chest) pr.equip.chest = { id: 'circuit_robe_jacket', templateId: 'circuit_robe_jacket' };
        if (!pr.equip.legs) pr.equip.legs = { id: 'circuit_robe_pants', templateId: 'circuit_robe_pants' };
        if (!pr.equip.necklace) pr.equip.necklace = { id: 'engineer_emitter_low', templateId: 'engineer_emitter_low' };
        if (!pr.equip.bracelet) pr.equip.bracelet = { id: 'engineer_nano_bracelet', templateId: 'engineer_nano_bracelet' };
      }
      if (!pr.inv) pr.inv = {};
      if (Object.keys(pr.inv).length === 0) {
        pr.inv = {
          synthetic_oil: 50,
          pressure_canister: 50,
          soulshot_no_grade: 500,
          spiritshot_no_grade: 500,
          potion_alacrity: 5,
          potion_wind_walk: 5,
          copper_parts: 25000,
          gear_scrap: 15,
          copper_ore: 10
        };
      }
    }

    // appearance приходит из клиентского localStorage. Раньше писался как есть —
    // произвольный JSON любого размера (проверено 50 КБ) уходил в профиль и в
    // AOI-снапшот всем рядом. Теперь только 4 известных поля (allow-list).
    if (charIn.appearance || parsed.appearance || pr.appearance) {
      pr.appearance = COS.normalizeAppearance(charIn.appearance || parsed.appearance || pr.appearance);
    }

    // Миграция старого инвентаря и экипировки
    if (!pr.equip) pr.equip = {};
    if (!pr.inv) pr.inv = {};
    const isEng = pr.cls === 'engineer' || (CS.rootClass && CS.rootClass(pr.cls) === 'engineer');
    delete pr.inv.wrench_short;

    // weapon → necklace: только резонатор (не apprentice_wand — это оружие в руке)
    // ring_l/ring_r → bracelet: нано-браслеты вместо колец
    const migrateResonatorSlot = (equip) => {
      if (!equip) return;
      const w = equip.weapon;
      const wt = w && String(w.templateId || w.id || '').toLowerCase();
      if (wt === 'engineer_emitter_low') {
        if (!equip.necklace) {
          equip.necklace = {
            id: 'engineer_emitter_low',
            templateId: 'engineer_emitter_low',
            plus: w.plus || 0,
            circuitLevel: w.circuitLevel,
            shellIndex: w.shellIndex
          };
        }
        equip.weapon = { id: 'apprentice_wand', templateId: 'apprentice_wand', plus: 0 };
      }
      // necklace с legacy wand id → резонатор (wand остаётся в weapon, если там)
      if (equip.necklace) {
        const nt = String(equip.necklace.templateId || equip.necklace.id || '').toLowerCase();
        if (nt === 'apprentice_wand') {
          equip.necklace.id = 'engineer_emitter_low';
          equip.necklace.templateId = 'engineer_emitter_low';
        }
      }
      // rings → bracelet (drop junk rings; keep if somehow nano)
      ['ring_l', 'ring_r', 'ring'].forEach((rs) => {
        if (!equip[rs]) return;
        const r = equip[rs];
        const rt = String(r.templateId || r.id || '').toLowerCase();
        if (rt === 'engineer_nano_bracelet' && !equip.bracelet) {
          equip.bracelet = {
            id: 'engineer_nano_bracelet',
            templateId: 'engineer_nano_bracelet',
            nanoLevel: r.nanoLevel,
            casingIndex: r.casingIndex
          };
        }
        delete equip[rs];
      });
    };
    migrateResonatorSlot(pr.equip);

    if (isEng) {
      delete pr.inv.circuit_robe_jacket;
      delete pr.inv.circuit_robe_pants;
      const engLvl = pr.level || 1;
      const engStarterInvOnly = engLvl <= 1 && (pr.exp || 0) === 0;
      if (engStarterInvOnly) {
        const stripStarterJunk = [
          'pressure_amplifier', 'pressure_amplifier_d', 'blessed_pressure_amplifier',
          'goggles', 'leather_gloves', 'work_boots',
          'synthetic_oil', 'pressure_canister', 'high_pressure_tank', 'emergency_repair_kit',
          'steam_hammer', 'pneumatic_rifle', 'hydraulic_blade', 'branch_staff',
          'copper_plate', 'hydraulic_armor', 'devotion_jacket', 'devotion_pants'
        ];
        stripStarterJunk.forEach((id) => { delete pr.inv[id]; });
        pr.inv.copper_parts = 0;
        pr.equip.necklace = { id: 'engineer_emitter_low', templateId: 'engineer_emitter_low' };
        pr.equip.bracelet = { id: 'engineer_nano_bracelet', templateId: 'engineer_nano_bracelet' };
        pr.equip.weapon = { id: 'apprentice_wand', templateId: 'apprentice_wand' };
        pr.equip.chest = { id: 'engineer_jacket_low', templateId: 'engineer_jacket_low' };
        pr.equip.legs = { id: 'engineer_pants_low', templateId: 'engineer_pants_low' };
      } else if (createdNew) {
        pr.equip.necklace = { id: 'engineer_emitter_low', templateId: 'engineer_emitter_low' };
        pr.equip.bracelet = { id: 'engineer_nano_bracelet', templateId: 'engineer_nano_bracelet' };
        pr.equip.weapon = { id: 'apprentice_wand', templateId: 'apprentice_wand' };
        pr.equip.chest = { id: 'engineer_jacket_low', templateId: 'engineer_jacket_low' };
        pr.equip.legs = { id: 'engineer_pants_low', templateId: 'engineer_pants_low' };
      } else {
        const hasEmitter = !!pr.equip.necklace || (pr.inv && (pr.inv.engineer_emitter_low | 0) > 0);
        if (!hasEmitter) {
          pr.equip.necklace = { id: 'engineer_emitter_low', templateId: 'engineer_emitter_low' };
        }
        const hasNano = !!pr.equip.bracelet || (pr.inv && (pr.inv.engineer_nano_bracelet | 0) > 0);
        if (!hasNano) {
          pr.equip.bracelet = { id: 'engineer_nano_bracelet', templateId: 'engineer_nano_bracelet' };
        }
      }
    } else {
      if (createdNew) {
        pr.equip.weapon = { id: 'operator_hammer_low', templateId: 'operator_hammer_low' };
        pr.equip.chest = { id: 'wooden_breastplate', templateId: 'wooden_breastplate' };
        pr.equip.legs = { id: 'wooden_gaiters', templateId: 'wooden_gaiters' };
        pr.equip.necklace = { id: 'operator_compressor_low', templateId: 'operator_compressor_low' };
        pr.equip.bracelet = { id: 'operator_bracers_low', templateId: 'operator_bracers_low' };
      } else {
        const hasComp = !!pr.equip.necklace || (pr.inv && (pr.inv.operator_compressor_low | 0) > 0);
        if (!hasComp) {
          pr.equip.necklace = { id: 'operator_compressor_low', templateId: 'operator_compressor_low' };
        }
        const hasBrac = !!pr.equip.bracelet || (pr.inv && (pr.inv.operator_bracers_low | 0) > 0);
        if (!hasBrac) {
          pr.equip.bracelet = { id: 'operator_bracers_low', templateId: 'operator_bracers_low' };
        }
      }
    }

    const hasWeaponEverywhere = (equip, inv) => {
      if (equip && equip.weapon) {
        const wid = String(equip.weapon.templateId || equip.weapon.id || '').toLowerCase();
        if (wid && wid !== 'engineer_emitter_low' && wid !== 'operator_compressor_low') return true;
      }
      if (inv) {
        for (const k of Object.keys(inv)) {
          if ((inv[k] | 0) > 0) {
            const meta = itemLookup(k);
            if (meta && (meta.type === 'weapon' || meta.slot === 'weapon')) return true;
          }
        }
      }
      return false;
    };
    if (!hasWeaponEverywhere(pr.equip, pr.inv)) {
      if (isEng) {
        pr.equip.weapon = { id: 'apprentice_wand', templateId: 'apprentice_wand', plus: 0 };
      } else {
        pr.equip.weapon = { id: 'operator_hammer_low', templateId: 'operator_hammer_low', plus: 0 };
      }
    }

    const isDevSession = SEC.insecureDev() && !!v.dev;
    const pid = getNextPid();
    const p = new Player(pid, yid, pr, { dev: isDevSession, charId: charId, clientIp: clientIp });
    p.clientIp = clientIp;
    if (msg.binary || msg.proto === 'bin') p.binaryProto = true;
    if (entityTransforms && p.transformSlot < 0) {
      p.transformSlot = entityTransforms.allocate(p.pid, TYPE_PLAYER, p.x, p.y, p.z, p.hp, p.maxHp, p.speedBase);
    }
    players.set(p.pid, p);
    if (wsByPid) wsByPid.set(p.pid, ws);
    if (pidByYid) pidByYid.set(yid, p.pid);
    ws.pid = p.pid;

    if (IS_CLUSTER && clusterIpc) {
      clusterIpc.updatePlayerDirectory(yid, p.pid, p.name, true, CURRENT_WORKER_ID, p.charId);
      if (ws && ws.connId != null) {
        clusterIpc.sendToPrimary(MSG_GATEWAY_SEND, {
          connId: ws.connId,
          pid: p.pid,
          yid: yid,
          charId: p.charId
        });
      }
      if (typeof ZS !== 'undefined' && TOTAL_WORKERS > 1 && !isSyntheticBot(yid)) {
        const targetWorker = ZS.getWorkerForCoords(p.x, p.z, TOTAL_WORKERS, CURRENT_WORKER_ID);
        if (targetWorker !== CURRENT_WORKER_ID) {
          initiateClusterHandoff(p, targetWorker);
          return;
        }
      }
    }

    try {
      if (!isSyntheticBot(yid)) {
        if (PlayerDb && typeof PlayerDb.touch === 'function') PlayerDb.touch(pr, yid, charId);
        if (PlayerDb && typeof PlayerDb.setOnline === 'function') PlayerDb.setOnline(yid, charId, true);
      }
    } catch (_) {}

    snapStandY(p);
    p.applyClassStats();
    if (createdNew) saveProfileNow(p);
    resetMoveBudget(p);

    if (p.maxEnergy > 0 && (p.energy == null || p.energy < 1) && !p.dead) {
      p.energy = p.maxEnergy;
    }
    if (p.dead) {
      p.hp = 0;
    } else if (p.maxHp > 0 && (p.hp == null || p.hp < 1)) {
      p.hp = p.maxHp;
    }

    // Миграция старого титула в слот экипа, если ещё не мигрирован
    if (p.cosmetics && (p.cosmetics.title || p.cosmetics.titleName) && (!p.equip || !p.equip.title)) {
      const legTitle = p.cosmetics.title || p.cosmetics.titleName;
      const s = String(legTitle).toLowerCase();
      let itemId = 'title_tralalero';
      if (s.includes('bombardi')) itemId = 'title_bombardiro';
      else if (s.includes('tung')) itemId = 'title_tung_tung';
      else if (s.includes('ballerina') || s.includes('cappuccino')) itemId = 'title_ballerina_cap';
      else if (s.includes('skibidi')) itemId = 'title_skibidi_steam';
      else if (s.includes('pioneer')) itemId = 'title_pioneer';
      else if (s.includes('master')) itemId = 'title_master';
      else if (ITEMS && typeof ITEMS.get === 'function' && ITEMS.get('title_' + s)) itemId = 'title_' + s;
      if (!p.equip) p.equip = Object.create(null);
      p.equip.title = { id: itemId, templateId: itemId };
      p.cosmetics.title = null;
      p.cosmetics.titleName = null;
      saveProfileNow(p);
    }

    const gmNow = isGM(p);
    const editorKey = gmNow && EditorGuard ? EditorGuard.issue(p) : '';
    if (!gmNow && EditorGuard) EditorGuard.revokePid(p.pid);

    if (typeof ws.subscribe === 'function') {
      try {
        ws.subscribe('world');
        if (p.region) ws.subscribe('region:' + p.region);
      } catch (_) {}
    }

    send(p, {
      t: 'welcome', pid: p.pid, region: p.region, dev: isDevSession, gm: gmNow,
      editorKey: editorKey || undefined,
      guestToken: (guestOwn && guestOwn.newToken) || undefined,
      accessLevel: p.accessLevel || 0,
      charId: p.charId,
      zoneName: zoneLabelAt(p.x, p.z),
      peace: isPeaceAt(p.x, p.z),
      self: selfPayload(p),
      inv: p.inv, equip: p.equip, learned: p.learned ? [...p.learned] : [],
      skills: p.skills || {},
      cosmetics: cosmeticsPublic(p),
      cosmeticsFull: COS.normalize(p.cosmetics || null),
      quests: QD.snapshot(p.quests, p.level, Date.now(), p.cls),
      leaderboardScore: p.level * 1000 + p.exp,
      online: getActiveOnlineCount(),
      effects: effectsPayload(p),
      worldTime: worldTimePayload(),
      expTable: { maxLevel: EXP.MAX_LEVEL, expToNext: EXP.expToNext(p.level) },
      classTree: {
        base: (_cachedBaseClasses || (_cachedBaseClasses = CS.listBaseClasses().map(c => ({ id: c.id, name: c.name, path: c.path, description: c.description })))),
        current: CS.getClass(p.cls),
        next: CS.availableTransfers(p.cls, p.level).map(c => ({
          id: c.id, name: c.name, description: c.description, levelReq: c.levelReq, role: c.role
        }))
      }
    });

    if (p.dead) {
      send(p, {
        t: 'you_died',
        loss: 0,
        delevels: 0,
        killer: null,
        canVillage: true,
        villageName: 'Город',
        reconnect: true,
        self: deathSelfPayload(p),
        inv: p.inv
      });
    }

    ensureNearbyMobs(p);

    if (!isSyntheticBot(p.yid)) {
      sendNearbyLoot(p);
      send(p, friendsPayload(p));
      notifyFriends(p, true);

      const myClan = Clans ? Clans.ofPlayer(p) : null;
      bindClan(p, myClan);
      if (myClan) {
        const mem = Clans.memberOf(myClan, p.yid, p.charId);
        if (mem) mem.name = p.name;
        send(p, clanPayload(myClan));
        sendCrest(p, myClan);
        notifyClan(p, true);
      } else {
        send(p, { t: 'clan', clan: null });
      }

      Mod.log('login', { yid: p.yid, charId: p.charId, name: p.name, ok: true, level: p.level });
      if (syncQuestCollect(p)) saveProfileNow(p);
    }

    for (const [, ae] of activeEvents) {
      if (!ae) continue;
      send(p, eventStartPayload(ae));
    }
  }

  return {
    doLogin,
    doLoginInner,
    checkSignatureReplay
  };
}

module.exports = {
  createSessionManager
};
