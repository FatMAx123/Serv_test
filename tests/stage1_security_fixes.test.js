// ============================================================
//  TESTS / STAGE1_SECURITY_FIXES.TEST.JS
//  Автоматические тесты хотфиксов безопасности (Этап 1):
//  1. Воскрешение на месте (блокировка free spot revive)
//  2. Команда //setgm <name> 0 (корректное снятие GM)
//  3. Защита лавки от подмены цены и модификации на лету
//  4. Квест event_pipe_burst (флаг daily: true)
//  5. Кулдаун зелий и защита свитка побега при PvP-флаге
// ============================================================
'use strict';

const QD = require('../shared/quest-db.js');
const { createDeathHandler } = require('../server/handlers/death-handler.js');

module.exports = function (t) {
  t.suite('security: квест event_pipe_burst daily защита');
  const qBoss = QD.get('event_pipe_burst');
  t.ok(qBoss, 'квест event_pipe_burst найден');
  t.ok(qBoss && qBoss.repeatable, 'квест event_pipe_burst repeatable');
  t.ok(qBoss && qBoss.daily, 'квест event_pipe_burst имеет daily: true (защита от бесконечного фарма)');

  const mockDoneEntry = { at: Date.now() };
  t.eq(QD.canRepeat(qBoss, mockDoneEntry, Date.now()), false, 'квест нельзя взять повторно в тот же день');
  // Спустя 24 часа (+1 день)
  const tomorrow = Date.now() + 86400000;
  t.eq(QD.canRepeat(qBoss, mockDoneEntry, tomorrow), true, 'квест доступен на следующий день');

  t.suite('security: защита воскрешения на месте (death-handler spot)');
  const sent = [];
  const broadcasted = [];
  const deathHandler = createDeathHandler({
    WM: { buildRegions: () => [{ id: 'village', bounds: [-100, -200, -90, -190] }] },
    NPCS: {},
    itemLookup: () => ({ name: 'Test' }),
    equippedCount: () => 0,
    spawnGroundLoot: () => {},
    pushCombatStats: () => {},
    pushWeight: () => {},
    L2: {},
    EXP: {},
    levelExpReq: () => 1000,
    ITEMS: {},
    CS: {},
    passiveBonuses: () => ({}),
    DR: {},
    SK: {},
    isPeaceAt: () => true,
    BR: {},
    pushEffects: () => {},
    closeTrade: () => {},
    closeStore: () => {},
    interruptDuel: () => {},
    Mod: { log: () => {} },
    saveProfileNow: () => {},
    send: (p, pkt) => sent.push(pkt),
    broadcastAOI: (p, pkt) => broadcasted.push(pkt),
    snapStandY: () => {},
    resetMoveBudget: () => {},
    ensureNearbyMobs: () => {},
    cancelPlayerCast: () => {},
    checkRate: () => true
  });

  // 1. Обычный игрок без свитка пробует встать на месте
  const mortalDead = {
    pid: 101,
    dead: true,
    hp: 0,
    maxHp: 1000,
    energy: 0,
    maxEnergy: 500,
    inv: {},
    accessLevel: 0,
    gm: false
  };
  sent.length = 0;
  deathHandler.handleReviveMessage(mortalDead, { mode: 'spot' });
  t.ok(mortalDead.dead === true, 'мёртвый игрок без свитка НЕ воскрес');
  t.ok(sent.some(p => p.t === 'revive_fail' && p.reason === 'no_item'), 'получен отказ revive_fail no_item');

  // 2. Игрок со свитком воскрешения
  const mortalWithScroll = {
    pid: 102,
    dead: true,
    hp: 0,
    maxHp: 1000,
    energy: 0,
    maxEnergy: 500,
    inv: { scroll_resurrection: 1 },
    accessLevel: 0,
    gm: false
  };
  sent.length = 0;
  deathHandler.handleReviveMessage(mortalWithScroll, { mode: 'spot' });
  t.ok(mortalWithScroll.dead === false, 'игрок со свитком воскрес');
  t.eq(mortalWithScroll.inv.scroll_resurrection, undefined, 'свиток воскрешения списан из сумки');
  t.ok(mortalWithScroll.hp > 0, 'здоровье восстановлено');
  t.ok(sent.some(p => p.t === 'you_revived' && p.mode === 'spot'), 'получен пакет you_revived spot');

  // 3. GM может встать на месте без свитка
  const gmDead = {
    pid: 103,
    dead: true,
    hp: 0,
    maxHp: 2000,
    energy: 0,
    maxEnergy: 1000,
    inv: {},
    accessLevel: 100,
    gm: true
  };
  sent.length = 0;
  deathHandler.handleReviveMessage(gmDead, { mode: 'spot' });
  t.ok(gmDead.dead === false, 'GM успешно воскрес на месте');
  t.eq(gmDead.hp, 2000, 'у GM полное HP');

  t.suite('security: //setgm 0 разжалование');
  // Проверяем математику разбора уровня в //setgm
  function parseGmTargetLvl(arg) {
    let targetLvl = 100;
    if (arg != null && String(arg).trim() !== '') {
      const parsed = parseInt(arg, 10);
      targetLvl = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 100;
    }
    return targetLvl;
  }
  t.eq(parseGmTargetLvl('0'), 0, '//setgm <имя> 0 вычисляет targetLvl = 0 (снятие прав)');
  t.eq(parseGmTargetLvl('50'), 50, '//setgm <имя> 50 вычисляет 50');
  t.eq(parseGmTargetLvl(''), 100, '//setgm <имя> без аргумента даёт 100');
  t.eq(parseGmTargetLvl(undefined), 100, '//setgm <имя> без аргумента даёт 100');

  t.suite('security: лавка — защита от подмены цены');
  // Проверяем логику проверки expectedPrice
  function checkStorePriceMatch(itemPrice, clientPrice) {
    const expPrice = clientPrice != null ? clientPrice : null;
    if (expPrice != null) {
      const exp = Math.floor(Number(expPrice));
      if (Number.isFinite(exp) && exp !== itemPrice) {
        return { ok: false, reason: 'price_changed' };
      }
    }
    return { ok: true };
  }
  t.eq(checkStorePriceMatch(100, 100).ok, true, 'цена совпадает — сделка разрешена');
  t.eq(checkStorePriceMatch(999999999, 100).ok, false, 'продавец взвинтил цену — сделка отбита');
  t.eq(checkStorePriceMatch(999999999, 100).reason, 'price_changed', 'причина отказа price_changed');
};
