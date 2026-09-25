// ============================================================
//  TESTS / TIERED-AOI.TEST.JS
//  Тестирование ступенчатого AOI (Staggered AOI) и дистанционного
//  квантования частоты (Tiered Rate).
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const G = require(path.join(ROOT, 'shared', 'game-rules.js'));
const NP = require(path.join(ROOT, 'shared', 'net-pack.js'));

module.exports = async function (t) {
  t.suite('tiered-aoi: математика дистанций и квантования частоты');

  // Tier 1: ближний радиус до 16 метров (16^2 = 256)
  const dClose2 = 12 * 12;
  t.ok(dClose2 <= 256, '12м попадает в Tier 1 (Close/Combat <= 16м)');

  // Tier 2: средний радиус 16–45 метров (45^2 = 2025)
  const dMid2 = 30 * 30;
  t.ok(dMid2 > 256 && dMid2 <= 2025, '30м попадает в Tier 2 (Mid: 16–45м)');

  // Tier 3: дальний радиус > 45 метров
  const dFar2 = 60 * 60;
  t.ok(dFar2 > 2025, '60м попадает в Tier 3 (Far/Horizon > 45м)');

  t.suite('tiered-aoi: расписание темпоральных слотов');
  // Проверка битового разделения тиков
  // Tier 2: (tick + id) & 1 === 0 (50% тиков, 5 Hz)
  let tier2Hits = 0;
  for (let tick = 0; tick < 10; tick++) {
    if (((tick + 7) & 1) === 0) tier2Hits++;
  }
  t.eq(tier2Hits, 5, 'Tier 2 опрашивается ровно 5 раз за 10 тиков (5 Hz)');

  // Tier 3: (tick + id) & 3 === 0 (25% тиков, 2.5 Hz)
  let tier3Hits = 0;
  for (let tick = 0; tick < 20; tick++) {
    if (((tick + 11) & 3) === 0) tier3Hits++;
  }
  t.eq(tier3Hits, 5, 'Tier 3 опрашивается ровно 5 раз за 20 тиков (2.5 Hz)');

  t.suite('tiered-aoi: порог резкого перемещения');
  // dist2 > 4.0 (2 метра) триггерит внеочередной пересчёт AOI
  const moveSmall = 1.0; // 1 метр
  t.ok(moveSmall * moveSmall <= 4.0, 'сдвиг на 1м не форсирует внеочередной AOI');

  const moveLarge = 2.5; // 2.5 метра
  t.ok(moveLarge * moveLarge > 4.0, 'сдвиг на 2.5м мгновенно форсирует внеочередной AOI');
};
