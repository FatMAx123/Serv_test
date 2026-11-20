// ============================================================
//  TESTS / AUDIT_STAGE5_VERIFICATION.TEST.JS
//  Верификация Этапа 5 плана SERVER_AUDIT_ACTION_PLAN.md:
//    - Поведенческий регрессионный тест Anti-Combat-Log:
//      1) handleSocketClose + sweepZombiePlayers удерживают игрока в мире при _combatLogoutTimer
//      2) повторный вход (detachPlayer) сбрасывает _combatLogoutTimer
//      3) гибель персонажа во время _combatLogoutTimer (beginPlayerDeath) сбрасывает таймер,
//         сохраняет профиль и позволяет сборщику очистить тело
//    - Верификация tar-пакета deploy-vps.js (Задача 1.1 / Этап 5.3):
//      проверка tar -ztf на отсутствие боевых файлов data/players.json*,
//      characters.json*, clans.json*, gm-access.json*, moderation/*, local_*
// ============================================================
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { createDisconnectManager, sweepZombiePlayers } = require(path.join(ROOT, 'server', 'session', 'disconnect-manager.js'));
const { createDeathHandler } = require(path.join(ROOT, 'server', 'handlers', 'death-handler.js'));
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const L2 = require(path.join(ROOT, 'shared', 'l2-combat.js'));
const EXP = require(path.join(ROOT, 'shared', 'l2-exp-table.js'));
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));
const CS = require(path.join(ROOT, 'shared', 'class-system.js'));
const SK = require(path.join(ROOT, 'shared', 'skill-db.js'));
const BR = require(path.join(ROOT, 'shared', 'buff-rules.js'));

module.exports = async function (t) {
  // ------------------------------------------------------------------
  // 1. Поведенческий тест Anti-Combat-Log: zombiePlayerSweeper, reconnect, death
  // ------------------------------------------------------------------
  t.suite('Stage 5.2: Anti-Combat-Log (handleSocketClose, sweepZombiePlayers, deathHandler)');
  {
    const players = new Map();
    const wsByPid = new Map();
    const pidByYid = new Map();
    const sessions = new Set();
    const savedCalls = [];

    const dm = createDisconnectManager({
      players,
      wsByPid,
      pidByYid,
      DB: {
        save: async (yid, pr) => { savedCalls.push({ kind: 'db_save', yid, dead: !!pr.dead }); }
      },
      PlayerDb: { setOnline: () => {} }
    });

    const dh = createDeathHandler({
      WM,
      NPCS,
      itemLookup: () => null,
      equippedCount: () => 0,
      spawnGroundLoot: () => {},
      pushCombatStats: () => {},
      pushWeight: () => {},
      L2,
      EXP,
      levelExpReq: () => 1000,
      ITEMS,
      CS,
      passiveBonuses: () => ({}),
      DR: { luckyUntil: () => 4, rollDeathDrops: () => ({ dropped: [] }) },
      SK,
      isPeaceAt: () => false,
      BR,
      pushEffects: () => {},
      closeTrade: () => {},
      closeStore: () => {},
      interruptDuel: () => {},
      Mod: { log: () => {} },
      saveProfileNow: (p) => { savedCalls.push({ kind: 'saveProfileNow', yid: p.yid, dead: !!p.dead }); },
      send: () => {},
      broadcastAOI: () => {},
      snapStandY: () => {},
      updatePlayerRegion: () => true,
      resetMoveBudget: () => {},
      ensureNearbyMobs: () => {},
      cancelPlayerCast: () => {},
      checkRate: () => true
    });

    // (a) Игрок в состоянии боя закрывает сокет -> остаётся в players и НЕ выкидывается sweepZombiePlayers
    const combatPlayer = {
      pid: 7001,
      yid: 's5_combat_user',
      charId: 'c0',
      name: 'CombatLogger',
      level: 15,
      exp: 1000,
      hp: 300,
      maxHp: 300,
      energy: 100,
      maxEnergy: 100,
      x: 50,
      z: 50,
      dead: false,
      buffs: [],
      debuffs: [],
      inv: {},
      equip: {},
      _lastCombatAt: Date.now()
    };
    const ws1 = { pid: 7001, readyState: 3 };
    players.set(7001, combatPlayer);
    wsByPid.set(7001, ws1);
    pidByYid.set('s5_combat_user', 7001);
    sessions.add(ws1);

    await dm.handleSocketClose(ws1, sessions);
    t.eq(wsByPid.has(7001), false, 'wsByPid удалён после закрытия сокета');
    t.ok(!!combatPlayer._combatLogoutTimer, 'запущен 15-секундный _combatLogoutTimer');
    t.eq(players.has(7001), true, 'боевой персонаж остался в players после Alt+F4');

    // Запускаем сборщик зомби-игроков (имитация 10-секундного интервала)
    const swept1 = sweepZombiePlayers({ players, wsByPid, sessions, detachPlayer: dm.detachPlayer });
    t.eq(swept1, [], 'sweepZombiePlayers НЕ трогает игрока с активным _combatLogoutTimer');
    t.eq(players.has(7001), true, 'игрок остался в мире после прохода zombiePlayerSweeper');

    // (b) Повторный вход до истечения 15 с: detachPlayer сбрасывает таймер и сохраняет профиль
    await dm.detachPlayer(7001);
    t.eq(combatPlayer._combatLogoutTimer, null, 'detachPlayer при повторном входе очистил _combatLogoutTimer');
    t.eq(players.has(7001), false, 'старая сессия игрока чисто отсоединена');
    t.ok(savedCalls.some(c => c.kind === 'db_save' && c.yid === 's5_combat_user'), 'профиль сохранён при detachPlayer');

    // (c) Игрок без боя в списке зомби (без ws) корректно очищается сборщиком
    const idleZombie = { pid: 7002, yid: 's5_idle_zombie', charId: 'c0', name: 'IdleZombie', dead: false };
    players.set(7002, idleZombie);
    pidByYid.set('s5_idle_zombie', 7002);
    const swept2 = sweepZombiePlayers({ players, wsByPid, sessions, detachPlayer: dm.detachPlayer });
    await new Promise(r => setImmediate(r));
    t.eq(swept2, [7002], 'обычный оффлайн-зомби без _combatLogoutTimer удаляется сборщиком');
    t.eq(players.has(7002), false, 'зомби удалён из players');

    // (d) Смерть персонажа во время активного _combatLogoutTimer сбрасывает таймер и сохраняет профиль
    savedCalls.length = 0;
    combatPlayer.dead = false;
    combatPlayer.hp = 100;
    combatPlayer._lastCombatAt = Date.now();
    const ws2 = { pid: 7001, readyState: 3 };
    players.set(7001, combatPlayer);
    wsByPid.set(7001, ws2);
    pidByYid.set('s5_combat_user', 7001);
    sessions.add(ws2);

    await dm.handleSocketClose(ws2, sessions);
    t.ok(!!combatPlayer._combatLogoutTimer, 'повторно установлен _combatLogoutTimer');

    dh.beginPlayerDeath(combatPlayer, { byPlayer: true, killerName: 'Hunter', killerPid: 99 });
    t.eq(combatPlayer.dead, true, 'персонаж убит во время _combatLogoutTimer');
    t.eq(combatPlayer._combatLogoutTimer, null, 'beginPlayerDeath очистил _combatLogoutTimer');
    t.ok(savedCalls.some(c => c.kind === 'saveProfileNow' && c.yid === 's5_combat_user' && c.dead === true),
      'beginPlayerDeath немедленно сохранил профиль погибшего оффлайн-игрока');

    const sweptAfterDeath = sweepZombiePlayers({ players, wsByPid, sessions, detachPlayer: dm.detachPlayer });
    await new Promise(r => setImmediate(r));
    t.eq(sweptAfterDeath, [7001], 'после смерти оффлайн-тело очищается сборщиком');
    t.eq(players.has(7001), false, 'мёртвый оффлайн-персонаж удалён из players');
  }

  // ------------------------------------------------------------------
  // 2. Верификация tar-архива deploy-vps.js (Задача 1.1 / Этап 5.3)
  // ------------------------------------------------------------------
  t.suite('Stage 5.3: архив deploy-vps.js (tar -ztf) не содержит live БД игроков/кланов/санкций');
  {
    const deploySrc = fs.readFileSync(path.join(ROOT, 'scripts', 'deploy-vps.js'), 'utf8');
    const exMatch = deploySrc.match(/const excludes = \[([\s\S]*?)\]\.join\(' '\);/);
    const tgMatch = deploySrc.match(/const targets = \[([\s\S]*?)\]\.join\(' '\);/);
    t.ok(!!exMatch && !!tgMatch, 'excludes и targets прочитаны из scripts/deploy-vps.js');

    const extractQuoted = (block) => [...block.matchAll(/'([^']+)'/g)].map(m => m[1]);
    const excludesStr = extractQuoted(exMatch[1]).join(' ');
    const targetsStr = extractQuoted(tgMatch[1]).join(' ');

    // Относительное имя архива в корне репозитория (как в deploy-vps.js): абсолютный путь вида
    // «D:/...» GNU tar (Git for Windows) принимает за удалённый хост «D:» и падает.
    const tmpTarName = 'ps-stage5-deploy-verify-' + process.pid + '.tar.gz';
    const tmpTar = path.join(ROOT, tmpTarName);
    try {
      execSync(`tar ${excludesStr} -czf ${tmpTarName} ${targetsStr}`, { cwd: ROOT, stdio: 'pipe' });
      const listing = execSync(`tar -ztf ${tmpTarName}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
      const files = listing.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      t.ok(files.length > 50, `архив содержит ${files.length} записей`);

      const forbiddenPatterns = [
        /^data\/players\.json/i,
        /^data\/characters\.json/i,
        /^data\/clans\.json/i,
        /^data\/clans\//i,
        /^data\/gm-access\.json/i,
        /^data\/moderation\//i,
        /^data\/local_.*\.json/i,
        /^data\/account_keys.*\.json/i,
        /\.secrets\.env$/i,
        /(^|\/)\.env(\.|$)/i
      ];
      const leaked = files.filter(f => forbiddenPatterns.some(rx => rx.test(f)));
      t.eq(leaked, [], 'в deploy-архиве нет пользовательских БД, кланов, GM-доступа, санкций и секретов');
      t.ok(files.some(f => f === 'native/src/combat_engine.h'), 'в архиве присутствует native/src/combat_engine.h');
      t.ok(files.some(f => f === 'binding.gyp'), 'в архиве присутствует binding.gyp');
    } finally {
      try { if (fs.existsSync(tmpTar)) fs.unlinkSync(tmpTar); } catch (_) {}
    }
  }
};

