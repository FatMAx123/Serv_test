// SERVER / HANDLERS / COMBAT-HANDLER.JS
// Сетевой роутер боевых пакетов: attack, attack_player, cast_begin, cast_complete, skill, cast_cancel
'use strict';

function createCombatHandler(deps = {}) {
  const {
    combatResolver,
    skillCaster,
    checkRate = () => true
  } = deps;

  /**
   * Центральный обработчик входящих боевых сетевых команд
   */
  function handleCombatMessage(p, msg) {
    if (!p || !msg) return false;
    const type = msg.t;

    switch (type) {
      case 'attack': {
        return combatResolver.resolvePveAttack(p, msg);
      }
      case 'attack_player': {
        return combatResolver.resolvePvpAttack(p, msg);
      }
      case 'cast_begin': {
        if (!checkRate(p, 'skill')) return false;
        skillCaster.doCastBegin(p, msg);
        return true;
      }
      case 'cast_complete':
      case 'skill': {
        if (!checkRate(p, 'skill')) return false;
        skillCaster.doSkillCast(p, msg);
        return true;
      }
      case 'cast_cancel': {
        if (!checkRate(p, 'action')) return false;
        skillCaster.cancelPlayerCast(p, 'user');
        return true;
      }
      default:
        return false;
    }
  }

  return {
    handleCombatMessage,
    resolvePveAttack: (p, msg) => combatResolver.resolvePveAttack(p, msg),
    resolvePvpAttack: (p, msg) => combatResolver.resolvePvpAttack(p, msg),
    doCastBegin: (p, msg) => skillCaster.doCastBegin(p, msg),
    doSkillCast: (p, msg) => skillCaster.doSkillCast(p, msg),
    cancelPlayerCast: (p, reason) => skillCaster.cancelPlayerCast(p, reason),
    checkCastCancelOnDamage: (p, dmg) => skillCaster.checkCastCancelOnDamage(p, dmg),
    onPlayerHit: (p, dmg) => skillCaster.onPlayerHit(p, dmg)
  };
}

module.exports = {
  createCombatHandler
};
