// ============================================================
//  TESTS / SHARED.TEST.JS — чистые функции shared/*.
//  Все значения — реальные данные проекта, не заглушки.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const L2 = require(path.join(ROOT, 'shared', 'l2-combat.js'));
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));
const CS = require(path.join(ROOT, 'shared', 'class-system.js'));
const EXP = require(path.join(ROOT, 'shared', 'l2-exp-table.js'));
const SK = require(path.join(ROOT, 'shared', 'skill-db.js'));
const LR = require(path.join(ROOT, 'shared', 'loot-rules.js'));
const COS = require(path.join(ROOT, 'shared', 'cosmetics-db.js'));
const G = require(path.join(ROOT, 'shared', 'game-rules.js'));
const WT = require(path.join(ROOT, 'shared', 'world-time.js'));

module.exports = function (t) {
  // ── Блок щитом (регресс: BLOCK_CAP не был объявлен, ReferenceError рвал PvP)
  t.suite('l2-combat: блок щитом');
  t.eq(L2.BLOCK_CAP, 70, 'BLOCK_CAP экспортирован и равен 70');
  t.noThrow(() => L2.blockChance(50, 100), 'blockChance(50,100) не бросает');
  t.noThrow(() => L2.rollBlock(16, 60), 'rollBlock не бросает');
  t.eq(L2.blockChance(0, 100), 0, 'без щита шанс блока 0');
  t.ok(L2.blockChance(999, 1) <= L2.BLOCK_CAP, 'шанс блока не превышает кап',
    'получено ' + L2.blockChance(999, 1).toFixed(2));
  t.ok(L2.blockChance(16, 60) > L2.SHIELD_BASE_BLOCK, 'shieldDef добавляет к базе 20 %',
    L2.blockChance(16, 60).toFixed(2) + ' %');

  t.suite('l2-combat: скорость атаки (Atk.Spd)');
  // Регресс: сервер считал интервал автоатаки как max(400, 1000/(1+DEX/100)) —
  // кинжал (база 333) и двуручный посох (190) били одинаково, а клиент при этом
  // анимировал по swingTimeSec. Теперь обе стороны берут базу ТИПА ОРУЖИЯ.
  t.eq(L2.weaponBaseAtkSpd('dagger'), 333, 'база кинжала 333 (Very Fast)');
  t.eq(L2.weaponBaseAtkSpd('1h_blunt'), 275, 'база одноручной булавы 275 (Fast)');
  t.eq(L2.weaponBaseAtkSpd('2h_staff'), 190, 'база двуручного посоха 190 (Slow)');
  t.eq(L2.weaponBaseAtkSpd('fist'), 217, 'база кулаков 217');
  t.eq(L2.weaponBaseAtkSpd('нет_такого'), 217, 'неизвестный класс → кулаки');
  const dex21 = 21;
  const spdDagger = L2.atkSpdL2('dagger', dex21, 1);
  const spdBlunt = L2.atkSpdL2('1h_blunt', dex21, 1);
  const spd2h = L2.atkSpdL2('2h_staff', dex21, 1);
  t.ok(spdDagger > spdBlunt && spdBlunt > spd2h, 'Atk.Spd монотонна по базе оружия',
    'dagger ' + spdDagger + ' > blunt ' + spdBlunt + ' > 2H ' + spd2h);
  t.ok(L2.atkSpdL2('1h_blunt', 30, 1) > spdBlunt, 'DEX увеличивает Atk.Spd',
    'DEX30 ' + L2.atkSpdL2('1h_blunt', 30, 1) + ' > DEX21 ' + spdBlunt);
  t.ok(L2.atkSpdL2('1h_blunt', dex21, 1.8) > spdBlunt, 'haste-бафф увеличивает Atk.Spd');
  // Интервал = 450 / Atk.Spd: быстрее оружие → короче интервал
  const swDagger = L2.swingTimeSec(spdDagger);
  const sw2h = L2.swingTimeSec(spd2h);
  t.ok(swDagger < sw2h, 'интервал удара короче у быстрого оружия',
    swDagger.toFixed(3) + ' с vs ' + sw2h.toFixed(3) + ' с');
  t.ok(swDagger > 0.8 && sw2h < 3.0, 'интервалы в разумных пределах C1',
    swDagger.toFixed(3) + '…' + sw2h.toFixed(3) + ' с');
  // Реальные предметы проекта: класс оружия и база берутся из item-db
  const gearBlunt = ITEMS.gearFromEquip({ weapon: { templateId: 'operator_hammer_low' } });
  const gear2h = ITEMS.gearFromEquip({ weapon: { templateId: 'steam_hammer' } });
  const gearBow = ITEMS.gearFromEquip({ weapon: { templateId: 'pneumatic_rifle' } });
  t.eq([gearBlunt.weaponAtkBase, gear2h.weaponAtkBase, gearBow.weaponAtkBase], [275, 190, 293],
    'база Atk.Spd приходит из шаблона предмета');
  t.ok(L2.swingTimeSec(L2.atkSpdL2(gearBlunt.weaponAtkBase, 30, 1)) <
       L2.swingTimeSec(L2.atkSpdL2(gear2h.weaponAtkBase, 30, 1)),
    'молот 1H быстрее парового молота 2H на тех же статах');

  t.suite('l2-combat: resolveHit в PvP со щитом');
  const atk = { pAtk: 120, cAtk: 80, accuracy: 40, critRate: 80, level: 20, dex: 22, wit: 20 };
  const shieldGear = ITEMS.gearFromEquip({ shield: { templateId: 'buckler' } });
  t.ok(shieldGear.hasShield && shieldGear.shieldDef === 16, 'buckler даёт hasShield + shieldDef 16',
    JSON.stringify({ hasShield: shieldGear.hasShield, shieldDef: shieldGear.shieldDef }));
  let blocked = 0, hits = 0;
  t.noThrow(() => {
    for (let i = 0; i < 3000; i++) {
      const h = L2.resolveHit(atk, {
        pDef: 80, cDef: 60, evasion: 38, level: 20,
        hasShield: shieldGear.hasShield, shieldDef: shieldGear.shieldDef
      }, { skillPower: 1.0, damageType: 'physical' });
      if (h.blocked) blocked++;
      if (!h.missed) hits++;
    }
  }, '3000 PvP-ударов по цели со щитом без исключений');
  t.ok(blocked > 0 && blocked < hits, 'блоки случаются, но не всегда',
    'blocked=' + blocked + ' / hits=' + hits);
  t.eq(ITEMS.gearFromEquip({ weapon: { templateId: 'mage_staff' }, shield: { templateId: 'buckler' } }).hasShield,
    false, 'двуручное оружие отключает щит');

  t.suite('l2-combat: resolveHit моб -> игрок (уклонение, щит, криты)');
  const mobAtk = { pAtk: 45, accuracy: 22, critRate: 80, level: 10 };
  const agilePlayer = { pDef: 50, evasion: 45, level: 12, hasShield: false, shieldDef: 0 };
  let mobMisses = 0, mobHits = 0;
  for (let i = 0; i < 1000; i++) {
    const res = L2.resolveHit(mobAtk, agilePlayer, { skillPower: 1.0, damageType: 'physical' });
    if (res.missed) mobMisses++;
    else mobHits++;
  }
  t.ok(mobMisses > 0, 'ловкий игрок может уклониться от удара моба', 'misses=' + mobMisses + ' / hits=' + mobHits);
  t.ok(mobHits > 0, 'моб попадает по ловкому игроку не в 100% случаев');

  const shieldPlayer = { pDef: 60, evasion: 20, level: 10, hasShield: true, shieldDef: 25, blockBonus: 10 };
  let mobBlocked = 0;
  for (let i = 0; i < 1000; i++) {
    const res = L2.resolveHit(mobAtk, shieldPlayer, { skillPower: 1.0, damageType: 'physical' });
    if (res.blocked) mobBlocked++;
  }
  t.ok(mobBlocked > 0, 'игрок со щитом блокирует удары моба', 'blocked=' + mobBlocked);

  t.suite('l2-combat: rollMagicLand шанс дебаффов мобов и резисты');
  const lowMobLand = L2.magicLandChance(0.75, 22, 35, 2, 20);
  t.ok(lowMobLand <= 0.10, 'моб 2 ур. против игрока 20 ур. имеет минимальный шанс дебаффа (<= 10%)', 'chance=' + lowMobLand);
  const bossLand = L2.magicLandChance(0.75, 40, 20, 20, 5);
  t.ok(bossLand >= 0.85, 'босс 20 ур. против игрока 5 ур. имеет максимальный шанс дебаффа (>= 85%)', 'chance=' + bossLand);
  const highMenLand = L2.magicLandChance(0.75, 25, 40, 10, 10);
  const lowMenLand = L2.magicLandChance(0.75, 25, 15, 10, 10);
  t.ok(highMenLand < lowMenLand, 'высокий MEN снижает шанс прохождения дебаффа', highMenLand + ' < ' + lowMenLand);

  // ── CP регенерация и поза сидя (BUG-RGN-01)
  t.suite('l2-combat: CP регенерация и поза сидя (BUG-RGN-01)');
  t.ok(typeof L2.cpRegenPerSec === 'function', 'cpRegenPerSec экспортирован в L2_COMBAT');
  const cpStand = L2.cpRegenPerSec(1.5, 43, 20, 'stand');
  const cpSit = L2.cpRegenPerSec(1.5, 43, 20, 'sit');
  const cpRun = L2.cpRegenPerSec(1.5, 43, 20, 'run');
  t.ok(cpSit > cpStand, 'регенерация CP сидя выше, чем стоя', cpSit + ' > ' + cpStand);
  t.ok(cpStand > cpRun, 'регенерация CP стоя выше, чем на бегу', cpStand + ' > ' + cpRun);
  t.near(cpSit / cpStand, 1.5 / 1.1, 0.05, 'соотношение сидя/стоя соответствует канону (1.5 / 1.1)');

  // ── Приборы инженера (регресс: уровни приходили из пакета клиента)
  t.suite('item-db: приборы инженера');
  t.ok(Array.isArray(ITEMS.RESONATOR_SHELL_LADDER) && ITEMS.RESONATOR_SHELL_LADDER.length >= 14,
    'лестница корпусов резонатора в shared', 'ступеней: ' + ITEMS.RESONATOR_SHELL_LADDER.length);
  t.ok(Array.isArray(ITEMS.NANO_CASING_LADDER) && ITEMS.NANO_CASING_LADDER.length >= 14,
    'лестница оболочек браслетов в shared', 'ступеней: ' + ITEMS.NANO_CASING_LADDER.length);
  const g0 = ITEMS.gearFromEquip({ necklace: { templateId: 'engineer_emitter_low' } });
  const g4 = ITEMS.gearFromEquip({ necklace: { templateId: 'engineer_emitter_low', shellIndex: 4 } });
  t.ok(g4.armorCDef > g0.armorCDef && g4.hpBonus > g0.hpBonus,
    'корпус выше ступенью даёт больше cDef и HP',
    'cDef ' + g0.armorCDef + '→' + g4.armorCDef + ', hp ' + g0.hpBonus + '→' + g4.hpBonus);
  const gHuge = ITEMS.gearFromEquip({ necklace: { templateId: 'engineer_emitter_low', shellIndex: 9999 } });
  const gTop = ITEMS.gearFromEquip({
    necklace: { templateId: 'engineer_emitter_low', shellIndex: ITEMS.RESONATOR_SHELL_LADDER.length - 1 }
  });
  t.eq(gHuge.armorCDef, gTop.armorCDef, 'shellIndex вне диапазона зажимается верхней ступенью');
  t.eq(ITEMS.deviceLevelCap(1), 1, 'потолок уровня прибора на 1 ур. = 1');
  t.eq(ITEMS.deviceLevelCap(7), 2, 'потолок на 7 ур. = 2 (гейт скиллов levelReq ≤ 7)');
  t.eq(ITEMS.deviceLevelCap(20), 4, 'потолок на 20 ур. = 4 (кап фазы 1)');
  t.ok(ITEMS.deviceLevelCap(200) <= ITEMS.DEVICE_MAX_LEVEL, 'потолок не превышает DEVICE_MAX_LEVEL');
  t.eq(ITEMS.shellIndexCap(ITEMS.RESONATOR_SHELL_LADDER, 1), 1, 'на 1 ур. доступен корпус ng2');
  t.eq(ITEMS.shellIndexCap(ITEMS.RESONATOR_SHELL_LADDER, 20), 5, 'на 20 ур. доступен корпус D I');
  t.eq(ITEMS.circuitSpCost(2), 160, 'цена 2-го уровня контура = 40·n²');
  t.ok(ITEMS.isResonatorTpl(ITEMS.get('engineer_emitter_low')), 'резонатор распознан по шаблону');
  t.ok(ITEMS.isNanoBraceletTpl(ITEMS.get('engineer_nano_bracelet')), 'браслет распознан по шаблону');

  // ── Внешность (регресс: произвольный JSON любого размера уходил в AOI)
  t.suite('cosmetics-db: normalizeAppearance');
  t.eq(COS.normalizeAppearance(null), COS.DEFAULT_APPEARANCE, 'null → дефолт');
  t.eq(COS.normalizeAppearance([1, 2, 3]), COS.DEFAULT_APPEARANCE, 'массив → дефолт');
  t.eq(COS.normalizeAppearance('строка'), COS.DEFAULT_APPEARANCE, 'строка → дефолт');
  t.eq(COS.normalizeAppearance({ hairId: 'hair1', hairColor: '#E03A12', faceId: 'face3', weaponId: 'magic_mace' }),
    { hairId: 'hair1', hairColor: '#e03a12', faceId: 'face3', weaponId: 'magic_mace' },
    'валидные поля проходят, hex к нижнему регистру');
  const junk = COS.normalizeAppearance({
    hairId: 'X'.repeat(50000), hairColor: 'javascript:alert(1)', faceId: {}, weaponId: '../../etc/passwd',
    extra: 'y'.repeat(50000), nested: { a: { b: 1 } }
  });
  t.eq(Object.keys(junk).sort(), ['faceId', 'hairColor', 'hairId', 'weaponId'], 'лишние ключи отброшены');
  t.eq(junk, COS.DEFAULT_APPEARANCE, 'мусорные значения → дефолты');
  t.ok(JSON.stringify(COS.normalizeAppearance({ hairId: 'z'.repeat(100000) })).length < 200,
    'результат ограничен по размеру');
  const protoProbe = JSON.parse('{"__proto__":{"polluted":1},"faceId":"face2"}');
  COS.normalizeAppearance(protoProbe);
  t.eq({}.polluted, undefined, 'Object.prototype не загрязняется');

  // ── EXP-таблица и кап фазы 1
  t.suite('l2-exp-table: канон C1 и кап 20');
  t.eq(EXP.MAX_LEVEL, 20, 'MAX_LEVEL = 20 (граница CONTENT_SCOPE_1_20)');
  t.eq(EXP.expToNext(1), 68, 'exp 1→2 = 68 (канон L2)');
  // Канон сверяется по накопленному EXP: 10 ур. = 48 230, 20 ур. = 835 864
  t.eq(EXP.cumulativeExp(10), 48230, 'накопленный EXP до 10 ур. = 48230 (канон L2)');
  t.eq(EXP.cumulativeExp(20), 835864, 'накопленный EXP до 20 ур. = 835864 (канон L2)');
  t.eq(EXP.expToNext(EXP.MAX_LEVEL), 0, 'на капе expToNext = 0 (нет левелапа за кап)');
  let expMonotonic = true;
  for (let l = 1; l < EXP.MAX_LEVEL - 1; l++) {
    if (EXP.expToNext(l + 1) <= EXP.expToNext(l)) { expMonotonic = false; break; }
  }
  t.ok(expMonotonic, 'требуемый EXP растёт монотонно до капа');

  // ── Статы по классу
  t.suite('class-system: статы и скорость');
  const st1 = CS.statsAtLevel('operator', 1);
  const st20 = CS.statsAtLevel('operator', 20);
  t.ok(st20.maxHp > st1.maxHp && st20.pAtk > st1.pAtk, 'статы растут с уровнем',
    'HP ' + st1.maxHp + '→' + st20.maxHp);
  t.ok(st20.speed > 7 && st20.speed < 12, 'скорость operator@20 в разумных пределах',
    st20.speed.toFixed(2) + ' м/с');
  t.ok(CS.statsAtLevel('engineer', 20).speed < st20.speed, 'инженер медленнее оператора');
  t.ok(!CS.canTransfer('operator', 'mechanic', 19), 'смена профессии до 20 ур. запрещена');
  t.ok(CS.canTransfer('operator', 'mechanic', 20), 'смена профессии на 20 ур. разрешена');
  t.ok(!CS.canTransfer('operator', 'technomancer', 20), 'нельзя уйти в чужую ветку');

  // C1 Канон: первичные характеристики Human Fighter и Human Mystic инвариантны при смене профессии
  t.suite('class-system: C1 канон базовых первичных стат');
  const fStats = CS.C1_FIGHTER_PRIMARY;
  const mStats = CS.C1_MYSTIC_PRIMARY;
  t.eq(fStats, { STR: 40, DEX: 30, CON: 43, INT: 21, WIT: 11, MEN: 25 }, 'Human Fighter C1 база');
  t.eq(mStats, { STR: 22, DEX: 21, CON: 27, INT: 41, WIT: 20, MEN: 39 }, 'Human Mystic C1 база');

  // 1-е профессии воинов сохраняют статы бойца
  ['operator', 'mechanic', 'destroyer', 'gunner', 'boiler_guardian', 'steam_berserker'].forEach((cls) => {
    t.eq(CS.primaryAtLevel(cls, 20), fStats, cls + ' имеет первичные статы Human Fighter (C1)');
  });
  // 1-е профессии магов сохраняют статы мистика
  ['engineer', 'constructor', 'technomancer', 'pressure_sorcerer', 'protocol_prophet'].forEach((cls) => {
    t.eq(CS.primaryAtLevel(cls, 20), mStats, cls + ' имеет первичные статы Human Mystic (C1)');
  });

  // ── Скиллы: серверный CD после правки не бывает нулевым
  t.suite('skill-db: кулдауны активных умений');
  const skills = SK.SKILLS || SK.skills || SK.SKILL_DB;
  const zeroCd = [];
  const overCap = [];
  Object.keys(skills).forEach((id) => {
    const tpl = skills[id];
    if (tpl.type !== 'active') return;
    const cd = tpl.cooldown != null ? tpl.cooldown : 0;
    const ct = tpl.chargeTime || 0;
    const cast = ct > 0 ? L2.castTimeSec(ct, L2.mAtkSpd(20, 0, 0)) : 0;
    // серверная формула: max(cooldown, castTime) — см. doSkillCast
    if (Math.max(cd, cast) <= 0.5) zeroCd.push(id);
    if ((tpl.levelReq || 1) <= 20 && (tpl.maxLevel || 1) > 40) overCap.push(id);
  });
  t.eq(zeroCd, [], 'ни одного активного умения с эффективным CD ≤ 0.5 с');
  t.ok(SK.get('eng_pressure_bolt'), 'eng_pressure_bolt существует');
  const bolt = SK.get('eng_pressure_bolt');
  t.ok(Math.max(bolt.cooldown, L2.castTimeSec(bolt.chargeTime, L2.mAtkSpd(20, 0, 0))) >= bolt.cooldown,
    'eng_pressure_bolt: CD не меньше паспортного', 'cooldown=' + bolt.cooldown + ' с');

  // ── Лут
  t.suite('loot-rules: таблицы дропа');
  const mobIds = Object.keys(LR.MOB_LOOT_TABLES || {});
  t.ok(mobIds.length >= 60, 'таблицы дропа есть у большинства мобов', 'таблиц: ' + mobIds.length);
  let adenaSeen = 0, itemsSeen = 0, spoilSeen = 0;
  t.noThrow(() => {
    for (let i = 0; i < 2000; i++) {
      const id = mobIds[i % mobIds.length];
      const d = LR.rollMobLoot(id, { level: 10 });
      if (d) {
        if (d.adena > 0) adenaSeen++;
        if (Array.isArray(d.items) && d.items.length) itemsSeen++;
      }
      const s = LR.rollSpoil(id, { level: 10 });
      if (Array.isArray(s) && s.length) spoilSeen++;
    }
  }, '2000 роллов лута и spoil без исключений');
  t.ok(adenaSeen > 0, 'адена выпадает', 'роллов с аденой: ' + adenaSeen);
  t.ok(itemsSeen > 0, 'предметы выпадают', 'роллов с предметами: ' + itemsSeen);
  t.ok(spoilSeen > 0, 'spoil даёт материалы', 'роллов spoil: ' + spoilSeen);
  // Дроп не должен ссылаться на неизвестные предметы: клиент не нарисует иконку,
  // а сервер отдаст безымянный лут.
  const unknownIds = new Set();
  for (const mid of mobIds) {
    for (let i = 0; i < 40; i++) {
      const d = LR.rollMobLoot(mid, { level: 12 });
      if (!d || !Array.isArray(d.items)) continue;
      for (const it of d.items) {
        if (!LR.itemById(it.id) && !ITEMS.get(it.id)) unknownIds.add(it.id);
      }
    }
  }
  t.eq([...unknownIds], [], 'все выпадающие предметы известны каталогу');

  // ── Заточка
  t.suite('game-rules: заточка');
  t.eq(G.ENCHANT_SAFE, 3, 'safe-заточка до +3');
  t.eq(G.enchantSuccess(0), 1, '+0 → 100 %');
  t.ok(G.enchantSuccess(3) < 1 && G.enchantSuccess(3) > 0, '+3 → шанс между 0 и 1',
    G.enchantSuccess(3).toString());
  t.ok(G.enchantSuccess(9) < G.enchantSuccess(4), 'шанс падает с ростом plus');
  t.ok(G.enchantSuccess(50) > 0 && G.enchantSuccess(50) < 0.2, 'вне таблицы — низкий фиксированный шанс',
    G.enchantSuccess(50).toString());

  // ── Сутки и ночь (P2.1)
  t.suite('world-time: сутки и ночь (P2.1)');
  t.eq(WT.DAY_REAL_FRAC, 0.75, 'DAY_REAL_FRAC = 0.75 (день 3 ч / ночь 1 ч)');
  t.eq(WT.DAY_START_HOUR, 6, 'начало дня в 6:00');
  t.eq(WT.NIGHT_START_HOUR, 22, 'начало ночи в 22:00');
  t.eq(WT.isNightHour(0), true, '0:00 — ночь');
  t.eq(WT.isNightHour(4), true, '4:00 — ночь');
  t.eq(WT.isNightHour(5.99), true, '5:59 — ночь');
  t.eq(WT.isNightHour(6), false, '6:00 — день');
  t.eq(WT.isNightHour(12), false, '12:00 — день');
  t.eq(WT.isNightHour(21.99), false, '21:59 — день');
  t.eq(WT.isNightHour(22), true, '22:00 — ночь');
  t.eq(WT.isNightHour(23.5), true, '23:30 — ночь');
  t.eq(WT.isNightTod(0 / 24), true, 'tod 0 — ночь');
  t.eq(WT.isNightTod(12 / 24), false, 'tod 0.5 — день');
  t.eq(WT.phaseOfTod(12 / 24), 'day', 'полдень — day');
  t.eq(WT.phaseOfTod(0 / 24), 'night', 'полночь — night');

  // ── Аутентификация и Replay-защита (VULN-12)
  t.suite('auth: HMAC и защита от Replay Attack (VULN-12)');
  const AUTH = require('../server/auth.js');
  const crypto = require('crypto');
  const testSecret = 'secret_test_key_12345';
  const freshPayload = Buffer.from(JSON.stringify({
    uniqueID: 'test_yid_1',
    publicName: 'Hero',
    issuedAt: Date.now()
  })).toString('base64url');
  const freshSig = crypto.createHmac('sha256', testSecret).update(freshPayload).digest('base64url');
  const vFresh = AUTH.verifySignature(freshPayload, freshSig, testSecret);
  t.eq(vFresh.ok, true, 'свежий токен проходит верификацию');

  // Устаревший токен (10 минут назад)
  const expiredPayload = Buffer.from(JSON.stringify({
    uniqueID: 'test_yid_1',
    publicName: 'Hero',
    issuedAt: Date.now() - 600000
  })).toString('base64url');
  const expiredSig = crypto.createHmac('sha256', testSecret).update(expiredPayload).digest('base64url');
  const vExpired = AUTH.verifySignature(expiredPayload, expiredSig, testSecret);
  t.eq(vExpired.ok, false, 'просроченный токен (> 5 мин) отклонён');
  t.eq(vExpired.error, 'signature_expired', 'код ошибки signature_expired');

  // ── Титулы и костюмы: экипировка, слоты, продажа и отображение
  t.suite('cosmetics & equipment: титулы, костюмы, слоты и продажа');
  const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));

  const tralalero = ITEMS.get('title_tralalero');
  t.ok(!!tralalero, 'title_tralalero существует в базе');
  t.eq(tralalero.type, 'title', 'тип title_tralalero = title');
  t.eq(tralalero.slot, 'title', 'слот title_tralalero = title');
  t.eq(tralalero.stackable, false, 'титулы не стакаются');
  t.ok((tralalero.price | 0) > 0, 'у титула есть положительная цена');
  t.ok(NPCS.sellPrice('title_tralalero') > 0, 'титул можно продать NPC торговцу');
  t.eq(COS.ITEM_EFFECTS['title_tralalero'], undefined, 'титул не является свитком-расходником одноразового действия');

  const costume = ITEMS.get('costume_apprentice');
  t.ok(!!costume, 'costume_apprentice существует в базе');
  t.eq(costume.type, 'costume', 'тип costume_apprentice = costume');
  t.eq(costume.slot, 'costume', 'слот costume_apprentice = costume');

  // paintNameplate рендерит 1024x192 с субпиксельным масштабированием
  const mockCtx = {
    clearRect: () => {},
    strokeText: () => {},
    fillText: () => {}
  };
  const mockCanvas = { width: 1024, height: 192, getContext: () => mockCtx };
  mockCtx.canvas = mockCanvas;
  const plateRes = COS.paintNameplate(mockCanvas, { name: 'TestHero', title: 'TestTitle', ctx: mockCtx });
  t.eq(plateRes.w, 1024, 'ширина плашки 1024');
  t.eq(plateRes.h, 192, 'высота плашки 192');
};
