// SCRIPTS / GENERATE_CSV_TABLES.JS
const fs = require('fs');
const path = require('path');

const engData = require('../data/engineer_skills_db.json');
const itemData = require('../data/item_buffs_db.json');

function escapeCsv(val) {
  if (val == null) return '';
  const s = String(val).replace(/"/g, '""');
  return '"' + s + '"';
}

// 1. Generate CSV for Engineer Skills (100% Steampunk, 0% Fantasy/L2)
const engHeaders = [
  'ID',
  'Название программы / умения',
  'Тип',
  'Категория',
  'Элемент / Среда',
  'Ур. Персонажа',
  'Макс. Ранг',
  'Время активации (сек)',
  'Откат (сек)',
  'Дистанция применения',
  'Дистанция действия',
  'Прибор',
  'Мин. Ур. Прибора',
  'Требуемое оружие',
  'Мощность (1 ранг)',
  'Расход пара (1 ранг: Нач+Осн=Итого)',
  'Затраты SP (1 ранг)',
  'Описание',
  'Механика'
];

const engRows = [engHeaders.join(';')];

engData.skills.forEach(s => {
  const r1 = (s.ranks && s.ranks[0]) || {};
  let pwr = s.skillPower || s.healPower || r1.power || r1.healPower || r1.dotDamage || (r1.slowPercent ? '-20% бег' : '') || (r1.attackBoost ? '+8% P.Atk' : '') || (r1.defenseBoost ? '+8% P.Def' : '') || (r1.pDefFlat ? '+' + r1.pDefFlat + ' P.Def' : '') || (r1.cDefFlat ? '+' + r1.cDefFlat + ' C.Def' : '') || (r1.chargeSpeed ? 'x2.0 Модуляция' : '') || '-';
  let mpStr = r1.mpCostTotal != null ? (r1.mpInitialConsume || 0) + ' + ' + (r1.mpConsume || 0) + ' = ' + r1.mpCostTotal : '-';
  let spStr = r1.spCost != null ? r1.spCost : (s.spCost || 0);
  let devType = s.deviceReq ? s.deviceReq.name : 'Нет';
  let devMin = s.deviceReq ? s.deviceReq.minLevel : '-';

  engRows.push([
    escapeCsv(s.id),
    escapeCsv(s.nameRu),
    escapeCsv(s.type === 'passive' ? 'Пассивный' : 'Активный'),
    escapeCsv(s.category),
    escapeCsv(s.element || 'Технический'),
    escapeCsv(s.levelReq),
    escapeCsv(s.maxLevel),
    escapeCsv(s.castTimeBaseSec != null ? s.castTimeBaseSec + 'с' : '-'),
    escapeCsv(s.cooldownBaseSec != null ? s.cooldownBaseSec + 'с' : '-'),
    escapeCsv(s.rangeGame ? s.rangeGame + 'м' : '-'),
    escapeCsv(s.effectRangeGame ? s.effectRangeGame + 'м' : '-'),
    escapeCsv(devType),
    escapeCsv(devMin),
    escapeCsv(s.weaponReq || '-'),
    escapeCsv(pwr),
    escapeCsv(mpStr),
    escapeCsv(spStr),
    escapeCsv(s.description),
    escapeCsv(s.mechanics)
  ].join(';'));
});

fs.writeFileSync(path.join(__dirname, '../data/engineer_skills_table.csv'), '\uFEFF' + engRows.join('\r\n'), 'utf8');
console.log('Saved data/engineer_skills_table.csv with rows:', engRows.length);

// 2. Generate CSV for Item Buffs & Tactical Manuals
const itemHeaders = [
  'ID',
  'Название предмета / чертежа',
  'Тип',
  'Грейд',
  'Длительность (сек)',
  'Сохраняется при гибели',
  'Стак-группа',
  'Технический эффект / Модификаторы',
  'Описание'
];

const itemRows = [itemHeaders.join(';')];

(itemData.project_steam_items || []).forEach(it => {
  let dur = (it.buff && it.buff.durationSec) || (it.effects && it.effects.durationSec) || 0;
  let persist = (it.buff && it.buff.persistOnDeath) ? 'ДА' : 'НЕТ';
  let grp = (it.buff && it.buff.stackGroup) || '-';
  let fx = [];
  if (it.effects && it.effects.healHpInstant) fx.push('+' + it.effects.healHpInstant + ' HP мгновенно');
  if (it.effects && it.effects.healEnergyInstant) fx.push('+' + it.effects.healEnergyInstant + ' пара мгновенно');
  if (it.mechanics && it.mechanics.multiplier) fx.push('x' + it.mechanics.multiplier + ' урона (' + it.mechanics.shotKind + ')');
  if (it.buff) {
    if (it.buff.attackMult) fx.push('Физ. атака x' + it.buff.attackMult);
    if (it.buff.defenseMult) fx.push('Физ. защита x' + it.buff.defenseMult);
    if (it.buff.speedFlat) fx.push('Скорость +' + it.buff.speedFlat);
    if (it.buff.hpRegenFlat) fx.push('HP реген +' + it.buff.hpRegenFlat + '/сек');
    if (it.buff.energyRegenFlat) fx.push('Пар реген +' + it.buff.energyRegenFlat + '/сек');
  }

  itemRows.push([
    escapeCsv(it.id),
    escapeCsv(it.nameRu),
    escapeCsv(it.type),
    escapeCsv(it.grade || 'No-Grade'),
    escapeCsv(dur ? dur + 'с' : 'Мгновенно'),
    escapeCsv(persist),
    escapeCsv(grp),
    escapeCsv(fx.join(', ') || '-'),
    escapeCsv(it.description)
  ].join(';'));
});

(itemData.tactical_manuals_and_consumables || []).forEach(it => {
  let dur = it.durationSec || (it.buff && it.buff.durationSec) || 0;
  let persist = (it.buff && it.buff.persistOnDeath) ? 'ДА' : 'НЕТ';
  let grp = (it.buff && it.buff.stackGroup) || '-';

  itemRows.push([
    escapeCsv(it.id),
    escapeCsv(it.nameRu),
    escapeCsv(it.type === 'manual' ? 'Тактическая инструкция' : 'Расходный материал'),
    escapeCsv('Специальный'),
    escapeCsv(dur ? dur + 'с (' + (dur/60) + 'м)' : 'Мгновенно'),
    escapeCsv(persist),
    escapeCsv(grp),
    escapeCsv(it.effect || '-'),
    escapeCsv(it.effect || '-')
  ].join(';'));
});

fs.writeFileSync(path.join(__dirname, '../data/item_buffs_table.csv'), '\uFEFF' + itemRows.join('\r\n'), 'utf8');
console.log('Saved data/item_buffs_table.csv with rows:', itemRows.length);

// 3. Generate CSV for Weapons
const weaponsData = require('../data/weapons_db.json');
const weaponHeaders = [
  'ID',
  'Название оружия',
  'Ранг (Грейд)',
  'Класс оружия',
  'Хват (1H/2H)',
  'Физ. атака (P.Atk)',
  'Схемная атака (C.Atk)',
  'Базовая скорость атак',
  'Градация скорости',
  'Вес',
  'Цена (медные детали ⚙️)',
  'Требуемый уровень',
  'Кристаллы при кристаллизации',
  'Тип кристаллов',
  'Расход соулшотов',
  'Расход спиритшотов',
  'Описание'
];

const weaponRows = [weaponHeaders.join(';')];
weaponsData.forEach(w => {
  weaponRows.push([
    escapeCsv(w.id),
    escapeCsv(w.name),
    escapeCsv(w.gradeRu || w.grade),
    escapeCsv(w.classRu || w.weaponClass),
    escapeCsv(w.twoHanded ? '2H (Двуручное)' : '1H (Одноручное)'),
    escapeCsv(w.attack),
    escapeCsv(w.cAtk || 0),
    escapeCsv(w.baseAtkSpd),
    escapeCsv(w.speedRu || w.atkSpdGrade),
    escapeCsv(w.weight),
    escapeCsv(w.price),
    escapeCsv(w.levelReq),
    escapeCsv(w.crystalCount),
    escapeCsv(w.crystalName || '-'),
    escapeCsv(w.soulshotUse),
    escapeCsv(w.spiritshotUse),
    escapeCsv(w.description)
  ].join(';'));
});

fs.writeFileSync(path.join(__dirname, '../data/weapons_table.csv'), '\uFEFF' + weaponRows.join('\r\n'), 'utf8');
console.log('Saved data/weapons_table.csv with rows:', weaponRows.length);

