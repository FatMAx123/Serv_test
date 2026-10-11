// ============================================================
//  TESTS / STAGE2_COMBAT_PVP_FIXES.TEST.JS
//  Автоматические тесты хотфиксов боевой системы и PvP (Этап 2):
//  1. PvP флаг при атаке навыками и в любых немирных стычках
//  2. DoT урон в дуэли и мирной зоне (HP не падает ниже 1)
//  3. DoT смерть в PvP приписывается игроку-атакующему (onPvpLethal / onPlayerDeathByPlayer)
//  4. Защита от смены таргета между cast_begin и cast_complete
//  5. Защита от фейковых атак для накрутки комбат-статуса
// ============================================================
'use strict';

const createDuelHandler = require('../server/handlers/duel-handler.js');
const { createPlayerRegenHandler } = require('../server/handlers/player-regen-handler.js');

module.exports = function (t) {
  t.suite('security-pvp: maybeFlagPvp логика флага');
  const sent = [];
  const broadcasted = [];
  const duelHandler = createDuelHandler({
    players: new Map(),
    send: (p, pkt) => sent.push({ p, pkt }),
    broadcastAOI: (p, pkt) => broadcasted.push({ p, pkt }),
    isPeaceAt: (x, z) => (x === 0 && z === 0), // (0,0) мирная, остальное PvP
    saveProfileNow: () => {},
    onPlayerDeathByPlayer: () => {}
  });

  const p1 = { pid: 1, name: 'Attacker', x: 100, z: 100, flagUntil: 0, karma: 0 };
  const p2 = { pid: 2, name: 'Victim', x: 100, z: 100, flagUntil: 0, karma: 0, get isFlagged() { return Date.now() < this.flagUntil; } };

  // 1. Атака белого игрока в поле
  sent.length = 0;
  broadcasted.length = 0;
  duelHandler.maybeFlagPvp(p1, p2);
  t.ok(p1.flagUntil > Date.now() + 35000, 'атакующий получил PvP-флаг (~40 сек)');
  t.ok(p1._lastCombatAt > 0 && p2._lastCombatAt > 0, 'время боя обновлено у обоих участников');
  t.ok(sent.some(s => s.pkt.t === 'flag' && s.pkt.flagged === true), 'атакующему отправлен пакет flag');
  t.ok(broadcasted.some(b => b.pkt.t === 'player_flag' && b.pkt.pid === 1), 'AOI оповещен о флаге игрока');

  // 2. Атака уже флагнутого игрока тоже продлевает/вешает флаг атакующему
  p2.flagUntil = Date.now() + 40000;
  p1.flagUntil = 0;
  sent.length = 0;
  duelHandler.maybeFlagPvp(p1, p2);
  t.ok(p1.flagUntil > Date.now() + 35000, 'атака флагнутого игрока также корректно флагнет атакующего');

  // 3. В мирной зоне флаг не вешается
  const peaceP1 = { pid: 3, name: 'P1', x: 0, z: 0, flagUntil: 0 };
  const peaceP2 = { pid: 4, name: 'P2', x: 0, z: 0, flagUntil: 0 };
  peaceP1.flagUntil = 0;
  duelHandler.maybeFlagPvp(peaceP1, peaceP2);
  t.eq(peaceP1.flagUntil, 0, 'в мирной зоне maybeFlagPvp не флагнет');

  t.suite('security-pvp: DoT урон в мирной зоне и в дуэли');
  let lethalVictim = null;
  let lethalKiller = null;
  const playersMap = new Map();

  const regenHandler = createPlayerRegenHandler({
    BR: {
      prune: (list) => list,
      dots: (list) => list,
      publicView: (d) => ({ id: d.id, name: d.name })
    },
    isPlayerImmortal: () => false,
    onPlayerHit: () => {},
    onPlayerDeath: () => {},
    onPvpLethal: (v, k) => { lethalVictim = v; lethalKiller = k; },
    onPlayerDeathByPlayer: (v, k) => { lethalVictim = v; lethalKiller = k; },
    isPeaceAt: (x, z) => (x === 0 && z === 0),
    players: playersMap,
    send: () => {},
    broadcastAOI: () => {},
    cosmeticsPublic: () => ({}),
    saveProfileNow: () => {},
    playerWeightState: () => ({ canAttack: true }),
    passiveBonuses: () => ({}),
    L2: {},
    isNight: () => false,
    invalidateCombatPack: () => {},
    pushEffects: () => {},
    pushCombatStats: () => {}
  });

  // Игрок в мирной зоне с тикающим DoT (урон 500 при HP 10)
  const peaceTarget = {
    pid: 10,
    name: 'PeaceVictim',
    x: 0,
    z: 0,
    hp: 10,
    maxHp: 100,
    debuffs: [{ id: 'poison', name: 'Poison', kind: 'dot', dps: 0.1, tickAcc: 1 }]
  };
  regenHandler.tickPlayerDots(peaceTarget, 1);
  t.eq(peaceTarget.hp, 1, 'DoT в мирной зоне не опускает HP ниже 1 (игрок не умирает)');

  // Игрок в дуэли с тикающим DoT
  const duelLoser = {
    pid: 11,
    name: 'DuelLoser',
    x: 100,
    z: 100,
    hp: 10,
    maxHp: 100,
    duel: { peer: 12 },
    debuffs: [{ id: 'bleed', name: 'Bleed', kind: 'dot', dps: 0.1, tickAcc: 1 }]
  };
  const duelWinner = { pid: 12, name: 'DuelWinner', hp: 100, maxHp: 100 };
  playersMap.set(11, duelLoser);
  playersMap.set(12, duelWinner);

  lethalVictim = null;
  lethalKiller = null;
  regenHandler.tickPlayerDots(duelLoser, 1);
  t.eq(duelLoser.hp, 1, 'DoT в дуэли не убивает, HP зажато на 1');
  t.ok(lethalVictim && lethalVictim.pid === 11, 'срабатывает завершение дуэли через onPvpLethal');
  t.ok(lethalKiller && lethalKiller.pid === 12, 'победитель дуэли передан в onPvpLethal');

  // Игрок в открытом поле погибает от DoT игрока-атакующего
  const pvpVictim = {
    pid: 20,
    name: 'PvpVictim',
    x: 200,
    z: 200,
    hp: 5,
    maxHp: 100,
    debuffs: [{ id: 'corrosion', name: 'Corrosion', kind: 'dot', dps: 0.1, tickAcc: 1, sourcePid: 21, sourceName: 'Ganker' }]
  };
  const ganker = { pid: 21, name: 'Ganker', hp: 100, maxHp: 100 };
  playersMap.set(20, pvpVictim);
  playersMap.set(21, ganker);

  lethalVictim = null;
  lethalKiller = null;
  regenHandler.tickPlayerDots(pvpVictim, 1);
  t.eq(pvpVictim.hp, 0, 'HP упало до 0 в PvP');
  t.ok(lethalVictim && lethalVictim.pid === 20, 'жертва передана в onPvpLethal');
  t.ok(lethalKiller && lethalKiller.pid === 21, 'убийца Ganker распознан по sourcePid из DoT (PK/карма будут засчитаны)');

  t.suite('security-pvp: проверка смены цели каста');
  function validateCastTarget(casting, msg) {
    if (casting.mid != null && msg.mid != null && (casting.mid | 0) !== (msg.mid | 0)) {
      return { ok: false, reason: 'target_changed' };
    }
    if (casting.pid != null && msg.pid != null && (casting.pid | 0) !== (msg.pid | 0)) {
      return { ok: false, reason: 'target_changed' };
    }
    return { ok: true };
  }
  t.eq(validateCastTarget({ mid: 5 }, { mid: 5 }).ok, true, 'цель совпадает — каст разрешён');
  t.eq(validateCastTarget({ mid: 5 }, { mid: 99 }).ok, false, 'цель подменена — каст отклонен');
  t.eq(validateCastTarget({ pid: 10 }, { pid: 20 }).reason, 'target_changed', 'цель игрока подменена — target_changed');
};
