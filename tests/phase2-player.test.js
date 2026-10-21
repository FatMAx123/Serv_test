// ============================================================
//  TESTS / PHASE2-PLAYER.TEST.JS
//  Модульные тесты доменной модели Player (server/core/player.js):
//  - Инициализация, санитизация характеристик, GM-права
//  - Расчет combatPack, Atk.Spd, грейдов, скорости
//  - Сериализация profileOf, selfPayload, combatStatsPayload
//  - Управление приборами, баффами, дебаффами и весом
// ============================================================
'use strict';

const playerCore = require('../server/core/player.js');
const {
  Player,
  profileOf,
  selfPayload,
  combatStatsPayload,
  safeDevices,
  stampDeviceFields,
  syncDevicesToEquip,
  hasRobeSetEquipped,
  namedSetCastBonus,
  armorSetBonuses,
  SHOT_ITEMS,
  normalizeItemGrade,
  equippedWeaponGrade,
  equippedWeaponShotCount,
  toggleShotArm,
  consumeArmedShot,
  passiveBonuses,
  ensureStarterSkills,
  grantExpertiseSkills,
  equippedArmorGrade,
  isPlayerImmortal,
  effectsPayload,
  invalidateCombatPack,
  applyPlayerBuff,
  applyPlayerDebuff,
  playerStunned,
  playerSilenced,
  playerCon,
  playerWeightState,
  weightPayload,
  canCarryMore,
  invAfter,
  wouldExceedWeight,
  skillAllowedForClass,
  cosmeticsPublic,
  grantSkillFree,
  isBadKey,
  safeCountMap,
  safeEquipMap,
  safeSkillMap,
  safeFriendList,
  safeNum,
  tableGet,
  sanitizeCharName,
  sanitizeEquipSlots
} = playerCore;

module.exports = function(t) {
  t.suite('phase2: Player class instantiation and sanitization');

  const p1 = new Player(101, 'user_test_1', {
    name: '  ValidHero  ',
    level: 15,
    cls: 'operator',
    x: 100,
    z: 200,
    y: 10,
    inv: { synthetic_oil: 5, bad_val: -1, [ '__proto__' ]: 99 },
    equip: { weapon: { id: 'operator_hammer_low', templateId: 'operator_hammer_low' } }
  });

  t.eq(p1.pid, 101, 'pid инициализирован');
  t.eq(p1.yid, 'user_test_1', 'yid инициализирован');
  t.eq(p1.name, 'ValidHero', 'имя очищено от пробелов');
  t.eq(p1.level, 15, 'уровень сохранен');
  t.eq(p1.cls, 'operator', 'класс operator');
  t.eq(p1.inv.synthetic_oil, 5, 'инвентарь содержит 5 synthetic_oil');
  t.eq(p1.inv.bad_val, undefined, 'отрицательные предметы отфильтрованы');
  t.eq(Object.prototype.hasOwnProperty.call(p1.inv, '__proto__'), false, 'прототип не загрязнен');

  t.suite('phase2: combatPack and stats');
  const pack = p1.combatPack;
  t.ok(pack != null, 'combatPack вычислен');
  t.ok(pack.pAtk > 0, 'pAtk > 0');
  t.ok(pack.pDef > 0, 'pDef > 0');
  t.ok(pack.maxHp > 0, 'maxHp > 0');
  t.ok(pack.maxEnergy > 0, 'maxEnergy > 0');
  t.ok(pack.speed > 0, 'speed > 0');
  t.eq(p1.pAtk, pack.pAtk, 'геттер pAtk совпадает');
  t.eq(p1.pDef, pack.pDef, 'геттер pDef совпадает');

  t.suite('phase2: applyClassStats and ratios');
  p1.hp = Math.floor(p1.maxHp / 2);
  p1.energy = Math.floor(p1.maxEnergy / 4);
  const oldMaxHp = p1.maxHp;
  p1.applyClassStats();
  t.ok(Math.abs(p1.hp / p1.maxHp - 0.5) < 0.05, 'доля HP сохранена при пересчете статов');

  t.suite('phase2: movement budget');
  p1.resetMoveBudget();
  t.ok(p1._moveBudget > 0, 'resetMoveBudget восстановил бюджет');
  t.ok(p1._moveBudgetAt > 0, 'таймстамп бюджета обновлен');

  t.suite('phase2: profileOf and selfPayload');
  const prof = profileOf(p1);
  t.eq(prof.name, 'ValidHero', 'профиль содержит имя');
  t.eq(prof.level, 15, 'профиль содержит уровень');
  t.eq(prof.cls, 'operator', 'профиль содержит класс');
  t.ok(prof.inv != null, 'профиль содержит inv');

  const snap = selfPayload(p1, () => ({ clanId: 'cl_1', clanName: 'SteelWarriors', crestHash: 'crest_123' }));
  t.eq(snap.level, 15, 'selfPayload содержит уровень');
  t.eq(snap.clanName, 'SteelWarriors', 'selfPayload содержит клан');
  t.ok(snap.pAtk > 0, 'selfPayload содержит pAtk');

  const cStats = combatStatsPayload(p1);
  t.eq(cStats.t, 'combat_stats', 'combatStatsPayload тип combat_stats');
  t.ok(cStats.pAtk > 0, 'combatStatsPayload содержит pAtk');

  t.suite('phase2: devices and equip syncing');
  const dev = safeDevices({ circuit: 10, nano: 5, shell: 2, casing: 1 }, null, 25);
  t.ok(dev.circuit >= 1, 'safeDevices circuit установлен');
  t.ok(dev.nano >= 1, 'safeDevices nano установлен');

  t.suite('phase2: buffs and debuffs');
  const now = Date.now();
  applyPlayerBuff(p1, { id: 'test_might', attackMult: 1.15, duration: 60, until: now + 60000 });
  t.ok(p1.buffs.some(b => b.id === 'test_might'), 'бафф добавлен игроку');
  invalidateCombatPack(p1);
  t.ok(p1.combatPack.pAtk > pack.pAtk, 'бафф увеличил pAtk в combatPack');

  let cancelledReason = null;
  p1.casting = true;
  applyPlayerDebuff(p1, { id: 'test_stun', kind: 'stun', stun: true, until: now + 5000 }, now, (p, r) => {
    cancelledReason = r;
  });
  t.eq(playerStunned(p1, now), true, 'playerStunned возвращает true');
  t.eq(cancelledReason, 'stun', 'каст прерван при получении оглушения');

  t.suite('phase2: weight and load');
  const wSt = playerWeightState(p1);
  t.ok(wSt.load >= 0, 'вес вычислен');
  t.ok(wSt.max > 0, 'maxLoad вычислен');
  t.eq(canCarryMore(p1, 'synthetic_oil', 1).ok, true, 'может нести 1 банку');
  t.ok(wouldExceedWeight(p1, null, { synthetic_oil: 10000000 }).ok === false, 'перегруз детектируется');

  t.suite('phase2: soulshots toggling');
  p1.inv.soulshot_no_grade = 100;
  const toggleRes = toggleShotArm(p1, 'soulshot_no_grade');
  t.ok(toggleRes && toggleRes.ok && toggleRes.armed, 'заряд активирован');
  t.eq(p1.armedShot, 'soulshot_no_grade', 'armedShot проставлен');
  const shotHit = consumeArmedShot(p1, 'ss');
  t.ok(shotHit.shotMod >= 2.0, 'соулшот дал модификатор урона >= 2.0');
  t.eq(p1.inv.soulshot_no_grade, 99, 'заряд списан');
};
