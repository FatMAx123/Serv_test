// ============================================================
//  TESTS / L2-ECONOMY-RULES.TEST.JS — экономика по эталону L2 Classic:
//  клан-склад принимает только передаваемое, приборы не множатся через склад,
//  Spoil — шанс по разнице уровней (calcMagicSuccess) и агр моба.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const L2 = require(path.join(ROOT, 'shared', 'l2-combat.js'));
const { createSkillCaster } = require(path.join(ROOT, 'server', 'combat', 'skill-caster.js'));

function withRandom(fn, impl) {
  const orig = Math.random;
  Math.random = impl;
  try { return fn(); } finally { Math.random = orig; }
}

module.exports = function (t) {
  t.suite('L2 клан-склад: только передаваемые вещи');
  t.eq(NPCS.cwhStorable('engineer_emitter_low').reason, 'bound_item', 'классовый прибор не кладётся в клан-склад');
  t.eq(NPCS.cwhStorable('operator_bracers_low').reason, 'bound_item', 'наручи оператора не кладутся в клан-склад');
  t.eq(NPCS.cwhStorable('quest_copper_wire').reason, 'quest_item', 'квестовый предмет — как и раньше, нельзя');
  t.ok(NPCS.cwhStorable('synthetic_oil').ok, 'обычный расходник — можно');
  t.ok(NPCS.cwhStorable('copper_parts').ok, 'валюта — можно (как адена в L2)');
  t.ok(NPCS.whStorable('engineer_emitter_low').ok, 'личный склад прибор по-прежнему принимает');
  const clanSrc = fs.readFileSync(path.join(ROOT, 'server', 'handlers', 'clan-handler.js'), 'utf8');
  t.ok(/NPCS\.cwhStorable/.test(clanSrc), 'doClanWhPut проверяет cwhStorable');

  t.suite('L2 приборы: убранный в склад прибор не выдаётся заново');
  const smSrc = fs.readFileSync(path.join(ROOT, 'server', 'session', 'session-manager.js'), 'utf8');
  t.ok((smSrc.match(/pr\.wh && \(pr\.wh\[id\] \| 0\) > 0/g) || []).length >= 2,
    'проверка наличия прибора учитывает личный склад (инженер и оператор)');

  t.suite('L2 Spoil: шанс по разнице уровней (calcMagicSuccess)');
  t.near(L2.magicSuccessChance(20, 20), 0.99, 1e-9, 'равный уровень — 99 %');
  t.near(L2.magicSuccessChance(20, 25), 1 - Math.pow(1.3, 5) / 100, 1e-9, 'цель выше на 5 — ~96 %');
  t.ok(L2.magicSuccessChance(20, 35) < 0.55, 'цель выше на 15 — около половины', String(L2.magicSuccessChance(20, 35)));
  t.ok(L2.magicSuccessChance(20, 10) > 0.99, 'цель ниже — почти всегда');
  t.eq(L2.magicSuccessChance(20, 40), 0, 'цель выше на 20 — никогда (1.3^20 > 100 %)');

  t.suite('L2 Spoil: метка по броску и агр моба');
  {
    const hate = [];
    const mob = { mid: 5, mobId: 'scrapper', level: 30, hp: 100, maxHp: 100, x: 1, z: 0, y: 0 };
    const mobs = new Map([[5, mob]]);
    const sc = createSkillCaster({
      players: new Map(), mobs,
      addMobHate: (m, pid, amt) => hate.push({ mid: m.mid, pid, amt }),
      hateFromHit: () => 40
    });
    const mk = () => ({
      pid: 3, cls: 'operator', level: 20, hp: 300, maxHp: 300, energy: 100, maxEnergy: 100,
      x: 0, z: 0, y: 0, cd: {}, skills: { op_scrap_collect: 1 }, buffs: [], debuffs: [],
      devices: { wrist: 6, valve: 6 },
      equip: {
        weapon: { id: 'operator_hammer_low', templateId: 'operator_hammer_low' },
        bracelet: { id: 'operator_bracers_low', templateId: 'operator_bracers_low' }
      },
      combatPack: { weaponClass: '1h_blunt', atkSpdL2: 300, primary: { WIT: 12, MEN: 20 } }
    });
    const spoil = (p) => {
      sc.doCastBegin(p, { skillId: 'op_scrap_collect', mid: 5 });
      if (p.casting) p.casting.endsAt = Date.now() - 10;
      sc.doSkillCast(p, { skillId: 'op_scrap_collect', mid: 5 });
    };
    // Моб на 10 ур. выше: шанс ~86 %; rng 0.9 → провал
    withRandom(() => spoil(mk()), () => 0.9);
    t.ok(!mob.spoilMarked, 'на 10 ур. выше при неудачном броске метки нет');
    t.ok(hate.length >= 1 && hate[0].mid === 5, 'моб агрится на вскрывающего даже при провале');
    withRandom(() => spoil(mk()), () => 0);
    t.ok(mob.spoilMarked && mob.spoilBy === 3, 'при удачном броске корпус помечен');
  }
};
