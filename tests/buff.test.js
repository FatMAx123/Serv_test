// ============================================================
//  TESTS / BUFF.TEST.JS — слоты, стакинг, диспел (PLAN 5.3 / L2 C1).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BR = require(path.join(ROOT, 'shared', 'buff-rules.js'));

function fx(id, extra) {
  extra = extra || {};
  return Object.assign({
    id: id,
    until: extra.until != null ? extra.until : Date.now() + 60000,
    appliedAt: extra.appliedAt
  }, extra);
}

module.exports = function (t) {
  t.suite('buff-rules: капы C1');
  t.eq(BR.MAX_BUFFS, 20, '20 слотов баффов (C1)');
  t.eq(BR.MAX_DEBUFFS, 10, '10 слотов дебаффов (C1)');

  t.suite('buff-rules: тот же id — refresh');
  const now = 1e12;
  let r = BR.apply([], fx('might', { attackMult: 1.08, until: now + 1000, appliedAt: now }), now);
  t.eq(r.list.length, 1, 'первый Might занял слот');
  r = BR.apply(r.list, fx('might', { attackMult: 1.12, until: now + 5000, appliedAt: now + 10 }), now);
  t.eq(r.list.length, 1, 'повторный Might не занимает второй слот');
  t.eq(r.replaced, 'might', 'id совпал — replaced');
  t.eq(r.list[0].attackMult, 1.12, 'статы взяты из нового каста');
  t.eq(r.list[0].until, now + 5000, 'длительность обновлена');
  t.eq(r.list[0].appliedAt, now, 'порядок слота (appliedAt) сохранён');

  t.suite('buff-rules: один stackGroup не стакается');
  r = BR.apply([], fx('op_overclock', { attackMult: 1.08, priority: 20, until: now + 1000 }), now);
  r = BR.apply(r.list, fx('npc_pressure_boost', { attackMult: 1.2, priority: 10, until: now + 2000 }), now);
  t.ok(!r.ok && r.reason === 'priority', 'слабый NPC Might не вытесняет скилл', r.reason);
  t.eq(r.list[0].id, 'op_overclock', 'скилл остался');
  r = BR.apply(r.list, fx('npc_pressure_boost', { attackMult: 1.2, priority: 30, until: now + 2000 }), now);
  t.ok(r.ok && r.replaced === 'op_overclock', 'более высокий приоритет вытесняет');
  t.eq(r.list.length, 1, 'после замены всё ещё один слот');
  t.eq(r.list[0].id, 'npc_pressure_boost', 'NPC занял слот PA_UP');

  t.suite('buff-rules: разные группы стакаются');
  r = BR.apply([], fx('might', { attackMult: 1.08, until: now + 1000 }), now);
  r = BR.apply(r.list, fx('shield', { defenseMult: 1.1, until: now + 1000 }), now);
  r = BR.apply(r.list, fx('wind', { speedMult: 1.3, until: now + 1000 }), now);
  t.eq(r.list.length, 3, 'Might + Shield + Wind Walk — три слота');

  t.suite('buff-rules: кап 20, выпадает самый старый');
  let list = [];
  for (let i = 0; i < 20; i++) {
    list = BR.apply(list, fx('b' + i, { until: now + 10000, appliedAt: now + i }), now).list;
  }
  t.eq(list.length, 20, 'ровно 20');
  r = BR.apply(list, fx('b20', { until: now + 10000, appliedAt: now + 20 }), now);
  t.ok(r.ok, '21-й бафф принят');
  t.eq(r.dropped[0] && r.dropped[0].id, 'b0', 'выпал самый старый b0');
  t.eq(r.list.length, 20, 'кап не превышен');
  t.ok(!r.list.some((e) => e.id === 'b0') && r.list.some((e) => e.id === 'b20'),
    'b0 нет, b20 есть');

  t.suite('buff-rules: sticky не выбивается капом');
  list = [BR.normalize(fx('test_immortal', { immortal: true, until: now + 99999, appliedAt: now }), now)];
  for (let i = 0; i < 19; i++) {
    list = BR.apply(list, fx('s' + i, { until: now + 10000, appliedAt: now + 1 + i }), now).list;
  }
  t.eq(list.length, 20, 'immortal + 19 = 20');
  r = BR.apply(list, fx('s19', { until: now + 10000, appliedAt: now + 50 }), now);
  t.ok(r.ok && r.dropped[0] && r.dropped[0].id !== 'test_immortal',
    'sticky immortal остался, выпал обычный',
    r.dropped[0] && r.dropped[0].id);
  t.ok(r.list.some((e) => e.id === 'test_immortal'), 'бессмертие на месте');

  t.suite('buff-rules: дебаффы кап 10, DoT стакается');
  list = [];
  for (let i = 0; i < 10; i++) {
    list = BR.apply(list, fx('d' + i, { kind: 'dot', dps: 0.05, until: now + 5000, appliedAt: now + i }), now).list;
  }
  t.eq(list.length, 10, '10 разных DoT стакаются');
  r = BR.apply(list, fx('d0', { kind: 'dot', dps: 0.08, until: now + 8000 }), now);
  t.eq(r.list.length, 10, 'тот же DoT id — refresh, не 11-й');
  const d0 = r.list.find((e) => e.id === 'd0');
  t.eq(d0 && d0.dps, 0.08, 'DoT обновил dps');
  r = BR.apply(r.list, fx('d10', { kind: 'dot', dps: 0.05, until: now + 5000, appliedAt: now + 99 }), now);
  t.eq(r.dropped[0] && r.dropped[0].id, 'd0', '11-й DoT выбивает самый старый');

  t.suite('buff-rules: slow/stun — один на группу');
  r = BR.apply([], fx('oil', { kind: 'slow', slowMult: 0.7, until: now + 1000 }), now);
  r = BR.apply(r.list, fx('root', { kind: 'slow', slowMult: 0.4, priority: 5, until: now + 2000 }), now);
  t.eq(r.list.length, 1, 'два slow не стакаются');
  t.eq(BR.slowMult(r.list, now), 0.4, 'остался более сильный slow');
  r = BR.apply(r.list, fx('stun1', { kind: 'stun', stun: true, until: now + 1000 }), now);
  t.eq(r.list.length, 2, 'stun — отдельный слот от slow');
  t.ok(BR.hasKind(r.list, 'stun', now), 'hasKind stun');

  t.suite('buff-rules: диспел');
  list = [
    BR.normalize(fx('a', { until: now + 1000, appliedAt: 1 }), now),
    BR.normalize(fx('b', { until: now + 1000, appliedAt: 2 }), now),
    BR.normalize(fx('c', { immortal: true, until: now + 1000, appliedAt: 3 }), now)
  ];
  const d1 = BR.dispel(list, { kind: 'buff', n: 1, now: now, rng: function () { return 0; } });
  t.eq(d1.removed.length, 1, 'снят один');
  t.ok(d1.list.some((e) => e.id === 'test_immortal' || e.sticky), 'sticky не тронут при n=1');
  const dAll = BR.dispel(list, { kind: 'buff', all: true, now: now });
  t.eq(dAll.removed.length, 2, 'all снимает оба не-sticky');
  t.eq(dAll.list.length, 1, 'immortal остался');
  t.eq(BR.clearDeath(list).length, 0, 'смерть снимает всё без persistOnDeath');
  const keep = [BR.normalize(fx('keep', { persistOnDeath: true, until: now + 1000 }), now)];
  t.eq(BR.clearDeath(keep).length, 1, 'persistOnDeath переживает смерть');

  t.suite('buff-rules: prune');
  t.eq(BR.prune([fx('x', { until: now - 1 }), fx('y', { until: now + 1 })], now).map((e) => e.id),
    ['y'], 'истёкшие вычищаются');

  t.suite('buff-rules: сервер зовёт apply/dispel/смерть');
  const srv = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  t.ok(/require\('\.\.\/shared\/buff-rules\.js'\)/.test(srv), 'server.js требует buff-rules');
  t.ok(/function applyPlayerBuff/.test(srv) && /BR\.apply/.test(srv), 'баффы через BR.apply');
  t.ok(/this\.debuffs = \[\]/.test(srv), 'дебаффы игрока — список');
  t.ok(/p\.buffs = BR\.clearDeath/.test(srv) && /p\.debuffs = BR\.clearDeath/.test(srv),
    'смерть снимает баффы и дебаффы');
  t.ok(/BR\.dots\(p\.debuffs/.test(srv), 'DoT игрока тикается со списка');
  t.ok(/case 'debug_buff'/.test(srv) && /case 'debug_dispel'/.test(srv),
    'dev-интенты для слотов и диспела');

  t.suite('buff-rules: publicView содержит множители статов');
  const pv = BR.publicView({
    id: 'energy_drink_skibidi',
    name: 'Энергетик «Скибиди-Пар»',
    kind: 'buff',
    stackGroup: 'item_energy_drink_skibidi',
    until: now + 60000,
    attackMult: 1.25,
    icon: 'energy_skibidi'
  }, now);
  t.eq(pv.id, 'energy_drink_skibidi', 'id передан');
  t.eq(pv.attackMult, 1.25, 'attackMult передан клиенту в publicView');
  t.eq(pv.kind, 'buff', 'kind = buff');

  t.suite('buff-rules: расходники в game-rules.js без хвостов и с иконками');
  const GR = require(path.join(ROOT, 'shared', 'game-rules.js'));
  t.ok(GR.CONSUMABLES.energy_drink_skibidi, 'energy_drink_skibidi в CONSUMABLES');
  t.eq(GR.CONSUMABLES.energy_drink_skibidi.damageBoost, 1.25, 'damageBoost 1.25');
  t.eq(GR.CONSUMABLES.energy_drink_skibidi.duration, 60, 'duration 60');
  t.eq(GR.CONSUMABLES.energy_drink_skibidi.icon, 'energy_skibidi', 'icon задан');
  t.ok(GR.CONSUMABLES.bluetooth_pairing_charm, 'bluetooth_pairing_charm в CONSUMABLES');
  t.eq(GR.CONSUMABLES.bluetooth_pairing_charm.damageBoost, 1.35, 'bluetooth damageBoost 1.35');
  t.eq(GR.CONSUMABLES.title_tralalero, undefined, 'старый хвост title_tralalero убран из CONSUMABLES');

  t.suite('buff-rules: player-regen-handler очищает истёкшие баффы');
  const { createPlayerRegenHandler } = require(path.join(ROOT, 'server', 'handlers', 'player-regen-handler.js'));
  let invalidated = false;
  let pushedEffects = false;
  let pushedStats = false;
  const regenH = createPlayerRegenHandler({
    BR,
    isPlayerImmortal: () => false,
    onPlayerHit: () => {},
    onPlayerDeath: () => {},
    send: () => {},
    playerWeightState: () => ({ noRegen: false }),
    passiveBonuses: () => ({}),
    L2: null,
    isNight: () => false,
    invalidateCombatPack: () => { invalidated = true; },
    pushEffects: () => { pushedEffects = true; },
    pushCombatStats: () => { pushedStats = true; }
  });
  const mockP = {
    hp: 100, maxHp: 100, energy: 50, maxEnergy: 50, level: 1,
    buffs: [{ id: 'old_buff', until: Date.now() - 1000 }],
    debuffs: []
  };
  regenH.tickPlayerRegen(mockP, 0.1);
  t.eq(mockP.buffs.length, 0, 'истёкший бафф удалён из p.buffs при тике');
  t.ok(invalidated, 'invalidateCombatPack вызван');
  t.ok(pushedEffects, 'pushEffects вызван');
  t.ok(pushedStats, 'pushCombatStats вызван');

  t.suite('buff-rules: тематические боевые бонусы боссов (стимпанк без магии) и SFX');
  // 1. foldAdd
  t.ok(typeof BR.foldAdd === 'function', 'BR.foldAdd экспортирован');
  const testNow = Date.now();
  const testBuffs = [
    { id: 'b1', vampiric: 0.08, until: testNow + 10000 },
    { id: 'b2', vampiric: 0.05, until: testNow + 10000 },
    { id: 'b3', vampiric: 0.20, until: testNow - 1000 } // expired
  ];
  t.near(BR.foldAdd(testBuffs, 'vampiric', testNow), 0.13, 0.001, 'foldAdd корректно суммирует активные баффы');

  // 2. Все 5 эликсиров в game-rules с сохранением при смерти (persistOnDeath)
  const auras = [
    { id: 'aura_tralala_neon', chk: (c) => c.atkSpdMult === 1.12 && c.critDamageBoost === 0.15 && c.speedMult === 1.08 },
    { id: 'aura_bombardiro_fire', chk: (c) => c.attackMult === 1.15 && c.vampiric === 0.08 && c.stunResist === 0.25 },
    { id: 'aura_vacuum_void', chk: (c) => c.defenseMult === 1.20 && c.maxEnergyBonus === 35 && c.energyRegenMult === 1.25 },
    { id: 'aura_cappuccino_gold', chk: (c) => c.adenaMult === 1.20 && c.dropMult === 1.15 && c.speedMult === 1.10 },
    { id: 'aura_skibidi_steam', chk: (c) => c.hpRegenFlat === 10 && c.energyRegenFlat === 5 && c.defenseMult === 1.10 }
  ];
  auras.forEach(({ id, chk }) => {
    const c = GR.CONSUMABLES[id];
    t.ok(c, id + ' присутствует в GR.CONSUMABLES');
    t.eq(c && c.persistOnDeath, true, id + ' сохраняется при смерти (persistOnDeath: true)');
    t.eq(c && c.duration, 1200, id + ' длится 20 минут (1200 сек)');
    t.ok(c && chk(c), id + ' обладает стимпанк-механическими бонусами без магии');
  });

  // 3. Предметы в item-db
  const itemDbContent = fs.readFileSync(path.join(ROOT, 'shared', 'item-db.js'), 'utf8');
  auras.forEach(({ id }) => {
    t.ok(itemDbContent.includes(id), id + ' описан в item-db.js с параметрами и лором');
  });

  // 4. Реалистичные звуки генерации ElevenLabs
  const drinkSfx = path.join(ROOT, 'client', 'assets', 'audio', 'sfx', 'potion_drink.ogg');
  const burstSfx = path.join(ROOT, 'client', 'assets', 'audio', 'sfx', 'aura_burst.ogg');
  t.ok(fs.existsSync(drinkSfx) && fs.statSync(drinkSfx).size > 1000, 'potion_drink.ogg от ElevenLabs существует и не пуст');
  t.ok(fs.existsSync(burstSfx) && fs.statSync(burstSfx).size > 1000, 'aura_burst.ogg от ElevenLabs существует и не пуст');

  const audioJsContent = fs.readFileSync(path.join(ROOT, 'client', 'js', 'audio.js'), 'utf8');
  t.ok(audioJsContent.includes('potion_drink') && audioJsContent.includes('aura_burst'), 'звуки зарегистрированы в audio.js');

  // 5. Проверка BR.publicView на сохранение всех статов эликсиров боссов
  const testElixirBuff = {
    id: 'aura_tralala_neon',
    name: 'Эликсир: Неон Tralala',
    kind: 'buff',
    until: testNow + 1200000,
    atkSpdMult: 1.12,
    critDamageBoost: 0.15,
    speedMult: 1.08,
    auraId: 'tralala_neon',
    vampiric: 0.08,
    stunResist: 0.25,
    maxEnergyBonus: 35,
    energyRegenMult: 1.25,
    hpRegenFlat: 10,
    energyRegenFlat: 5,
    adenaMult: 1.20,
    dropMult: 1.15
  };
  const pub = BR.publicView(testElixirBuff, testNow);
  t.eq(pub.atkSpdMult, 1.12, 'publicView сохраняет atkSpdMult');
  t.eq(pub.critDamageBoost, 0.15, 'publicView сохраняет critDamageBoost');
  t.eq(pub.speedMult, 1.08, 'publicView сохраняет speedMult');
  t.eq(pub.vampiric, 0.08, 'publicView сохраняет vampiric');
  t.eq(pub.stunResist, 0.25, 'publicView сохраняет stunResist');
  t.eq(pub.maxEnergyBonus, 35, 'publicView сохраняет maxEnergyBonus');
  t.eq(pub.energyRegenMult, 1.25, 'publicView сохраняет energyRegenMult');
  t.eq(pub.hpRegenFlat, 10, 'publicView сохраняет hpRegenFlat');
  t.eq(pub.energyRegenFlat, 5, 'publicView сохраняет energyRegenFlat');
  t.eq(pub.adenaMult, 1.20, 'publicView сохраняет adenaMult');
  t.eq(pub.dropMult, 1.15, 'publicView сохраняет dropMult');
  t.eq(pub.auraId, 'tralala_neon', 'publicView сохраняет auraId');

  // 6. Проверка player.js: отсутствие PointLight в spawnAuraBurstVfx (устранение фриза от рекомпиляции шейдеров)
  const playerJsContent = fs.readFileSync(path.join(ROOT, 'client', 'js', 'player.js'), 'utf8');
  const burstVfxCode = playerJsContent.slice(playerJsContent.indexOf('function spawnAuraBurstVfx'));
  t.ok(!burstVfxCode.includes('new THREE.PointLight'), 'В player.js spawnAuraBurstVfx больше нет PointLight (0 фризов)');
  t.ok(playerJsContent.includes('AuraBurstVfxAssets'), 'В player.js используется кэширующий синглтон AuraBurstVfxAssets');

  // 7. Проверка горячей панели (быстрый юз) и ПКМ
  const skillsUiContent = fs.readFileSync(path.join(ROOT, 'client', 'js', 'skills-ui.js'), 'utf8');
  t.ok(skillsUiContent.includes('assignItem'), 'В skills-ui.js реализован метод assignItem для быстрого юза предметов');
  t.ok(skillsUiContent.includes('_isItemSlot'), 'В skills-ui.js реализована проверка _isItemSlot');
  t.ok(skillsUiContent.includes('item-hotbar-count'), 'В skills-ui.js реализован бейдж количества предметов на хотбаре');

  const invUiContent = fs.readFileSync(path.join(ROOT, 'client', 'js', 'inventory-ui.js'), 'utf8');
  t.ok(invUiContent.includes('lastFastActionMs'), 'В inventory-ui.js ПКМ по расходнику поддержан через надежный дебаунсер');

  const uiContent = fs.readFileSync(path.join(ROOT, 'client', 'js', 'ui.js'), 'utf8');
  t.ok(!uiContent.includes('e.stopPropagation();\n      return false;\n    }, { capture: true'), 'В ui.js contextmenu больше не глушится глобально в capture фазе');
};

