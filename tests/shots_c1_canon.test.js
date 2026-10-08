// ============================================================
//  TESTS / SHOTS_C1_CANON.TEST.JS — проверка канона расхода зарядов
//  и сдачи трофеев по Аудиту 38 (Lineage 2 C1 Classic x1).
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const weaponsDbRaw = require(path.join(ROOT, 'data', 'weapons_db.json'));
const weaponsDb = Array.isArray(weaponsDbRaw) ? Object.fromEntries(weaponsDbRaw.map(w => [w.id, w])) : weaponsDbRaw;

module.exports = function (t) {
  t.suite('shots-canon: база данных оружия (item-db.js & weapons_db.json)');

  // 1. Луки: расход соулшотов
  const springBow = ITEMS.get('spring_bow');
  t.ok(springBow, 'spring_bow найден в item-db');
  t.eq(springBow && springBow.soulshotUse, 2, 'spring_bow расходует 2 SS (item-db)');
  t.eq(weaponsDb.spring_bow && weaponsDb.spring_bow.soulshotUse, 2, 'spring_bow расходует 2 SS (weapons_db.json)');

  const compositeBow = ITEMS.get('composite_bow');
  t.ok(compositeBow, 'composite_bow найден в item-db');
  t.eq(compositeBow && compositeBow.soulshotUse, 4, 'composite_bow расходует 4 SS (item-db)');
  t.eq(weaponsDb.composite_bow && weaponsDb.composite_bow.soulshotUse, 4, 'composite_bow расходует 4 SS (weapons_db.json)');

  const reinforcedBow = ITEMS.get('reinforced_bow');
  t.ok(reinforcedBow, 'reinforced_bow найден в item-db');
  t.eq(reinforcedBow && reinforcedBow.soulshotUse, 6, 'reinforced_bow расходует 6 SS (item-db)');
  t.eq(weaponsDb.reinforced_bow && weaponsDb.reinforced_bow.soulshotUse, 6, 'reinforced_bow расходует 6 SS (weapons_db.json)');

  // 2. Двуручные молоты
  const steamHammer = ITEMS.get('steam_hammer');
  t.ok(steamHammer, 'steam_hammer найден в item-db');
  t.eq(steamHammer && steamHammer.soulshotUse, 3, 'steam_hammer расходует 3 SS (item-db)');
  t.eq(weaponsDb.steam_hammer && weaponsDb.steam_hammer.soulshotUse, 3, 'steam_hammer расходует 3 SS (weapons_db.json)');

  const heavyDoomHammer = ITEMS.get('heavy_doom_hammer');
  t.ok(heavyDoomHammer, 'heavy_doom_hammer найден в item-db');
  t.eq(heavyDoomHammer && heavyDoomHammer.soulshotUse, 3, 'heavy_doom_hammer расходует 3 SS (item-db)');
  t.eq(weaponsDb.heavy_doom_hammer && weaponsDb.heavy_doom_hammer.soulshotUse, 3, 'heavy_doom_hammer расходует 3 SS (weapons_db.json)');

  // 3. Жезлы и булавы инженера (SPS/BSPS)
  const appWand = ITEMS.get('apprentice_wand');
  t.ok(appWand, 'apprentice_wand найден в item-db');
  t.eq(appWand && appWand.spiritshotUse, 1, 'apprentice_wand расходует 1 SPS');

  const mageStaff = ITEMS.get('mage_staff');
  t.ok(mageStaff, 'mage_staff найден в item-db');
  t.eq(mageStaff && mageStaff.spiritshotUse, 2, 'mage_staff расходует 2 SPS');

  const macePrayer = ITEMS.get('mace_prayer');
  t.ok(macePrayer, 'mace_prayer найден в item-db');
  t.eq(macePrayer && macePrayer.spiritshotUse, 3, 'mace_prayer расходует 3 SPS');

  // 4. Обычные мечи / кинжалы: 1 SS
  const assassinKnife = ITEMS.get('assassin_knife');
  t.ok(assassinKnife, 'assassin_knife найден в item-db');
  t.eq(assassinKnife && assassinKnife.soulshotUse, 1, 'assassin_knife расходует 1 SS');

  t.suite('shots-canon: логика расхода зарядов (equippedWeaponShotCount)');
  function calcShotCount(equipWeapon, shotKind) {
    if (!equipWeapon) return 1;
    const isMagical = (shotKind === 'sps' || shotKind === 'bsps');
    if (isMagical) {
      const sps = equipWeapon.spiritshotUse ?? equipWeapon.spiritShotUse;
      return (typeof sps === 'number' && sps > 0) ? Math.floor(sps) : 1;
    }
    const ss = equipWeapon.soulshotUse ?? equipWeapon.soulShotUse;
    return (typeof ss === 'number' && ss > 0) ? Math.floor(ss) : 1;
  }

  t.eq(calcShotCount(null, 'ss'), 1, 'без оружия расходуется 1 заряд');
  t.eq(calcShotCount(springBow, 'ss'), 2, 'spring_bow требует 2 соулшота');
  t.eq(calcShotCount(compositeBow, 'ss'), 4, 'composite_bow требует 4 соулшота');
  t.eq(calcShotCount(reinforcedBow, 'ss'), 6, 'reinforced_bow требует 6 соулшотов');
  t.eq(calcShotCount(steamHammer, 'ss'), 3, 'steam_hammer требует 3 соулшота');
  t.eq(calcShotCount(mageStaff, 'sps'), 2, 'mage_staff требует 2 спиритшота');
  t.eq(calcShotCount(macePrayer, 'sps'), 3, 'mace_prayer требует 3 спиритшота');
  t.eq(calcShotCount(assassinKnife, 'ss'), 1, 'assassin_knife требует 1 соулшот');

  t.suite('biotin-trophies: сдача трофеев Биотину и в магазин (Аудит 38)');
  t.eq(NPCS.sellPrice('quest_memory_gear'), 120, 'Шестерня Памяти: 120 шестерёнок');
  t.eq(NPCS.sellPrice('quest_acid_valve'), 180, 'Кислотный Клапан: 180 шестерёнок');
  t.eq(NPCS.sellPrice('quest_corrupted_chip'), 500, 'Испорченный Чип: 500 шестерёнок');
};
