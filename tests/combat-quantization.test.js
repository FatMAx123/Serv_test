// ============================================================
//  TESTS / COMBAT-QUANTIZATION.TEST.JS
//  Тестирование квантования всех боевых эффектов тиком 100 мс (10 Hz):
//  - Дискретизация миллисекунд и секунд (quantizeCombatMs, quantizeCombatSec)
//  - Квантование времени замаха/автоатаки оружия (swingTimeMs)
//  - Квантование времени каста заклинаний (castTimeMs)
//  - Расписание тиков DoT/HoT (dotTickSchedule)
//  - Интеграция с combatPack и серверным таймингом автоатаки
// ============================================================
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const L2 = require(path.join(ROOT, 'shared', 'l2-combat.js'));

module.exports = function (t) {
  t.suite('combat-quantization: базовые константы и функции квантования');

  t.eq(L2.COMBAT_TICK_MS, 100, 'COMBAT_TICK_MS равен 100 мс (10 Hz тикрейт)');

  // 1. Проверка quantizeCombatMs
  t.eq(L2.quantizeCombatMs(0), 0, '0 мс квантуется в 0');
  t.eq(L2.quantizeCombatMs(1), 100, '1 мс квантуется в 100 мс (потолок)');
  t.eq(L2.quantizeCombatMs(50), 100, '50 мс квантуется в 100 мс');
  t.eq(L2.quantizeCombatMs(100), 100, '100 мс остаётся 100 мс');
  t.eq(L2.quantizeCombatMs(101), 200, '101 мс квантуется в 200 мс');
  t.eq(L2.quantizeCombatMs(1234), 1300, '1234 мс квантуется в 1300 мс');
  t.eq(L2.quantizeCombatMs(1500), 1500, '1500 мс остаётся 1500 мс');
  t.eq(L2.quantizeCombatMs(5999), 6000, '5999 мс квантуется в 6000 мс');

  // 2. Проверка quantizeCombatSec
  t.near(L2.quantizeCombatSec(0), 0, 0.001, '0 сек квантуется в 0');
  t.near(L2.quantizeCombatSec(0.04), 0.1, 0.001, '0.04 сек квантуется в 0.1 сек');
  t.near(L2.quantizeCombatSec(1.234), 1.3, 0.001, '1.234 сек квантуется в 1.3 сек');
  t.near(L2.quantizeCombatSec(5.0), 5.0, 0.001, '5.0 сек остаётся 5.0 сек');

  t.suite('combat-quantization: квантование времени каста заклинаний');
  {
    // Быстрый каст при высоком Cast.Spd (например, base = 1.0 сек, Cast.Spd = 333)
    const tFast = L2.castTimeMs(1.0, 333);
    t.eq(tFast, 1000, 'каст 1.0 сек при Cast.Spd 333 равен ровно 1000 мс');
    t.eq(tFast % 100, 0, 'время каста кратно 100 мс');

    // Медленный каст голого мага (base = 5.0 сек, Cast.Spd = 166)
    // 5 * 333 / 166 = 10.0301... сек -> 10030 мс -> 10100 мс
    const tSlow = L2.castTimeMs(5.0, 166);
    t.eq(tSlow, 10100, 'каст 5.0 сек при Cast.Spd 166 квантован в 10100 мс');
    t.eq(tSlow % 100, 0, 'время медленного каста строго кратно 100 мс');

    // Дробное время каста (base = 2.5 сек, Cast.Spd = 250)
    // 2.5 * 333 / 250 = 3.33 сек -> 3330 мс -> 3400 мс
    const tFractional = L2.castTimeMs(2.5, 250);
    t.eq(tFractional, 3400, 'дробный каст 3.33 сек квантован вверх до 3400 мс');
    t.eq(tFractional % 100, 0, 'дробный каст кратен 100 мс');
  }

  t.suite('combat-quantization: квантование интервала автоатаки оружия (swingTimeMs)');
  {
    const weapons = ['fist', 'dagger', '1h_blunt', '1h_sword', '2h_staff', 'bow', 'dual'];
    for (const w of weapons) {
      const spd = L2.atkSpdL2(w, 21, 1.0);
      const swingMs = L2.swingTimeMs(spd);
      t.ok(swingMs >= 100, 'интервал замаха для ' + w + ' (' + spd + ') не меньше 100 мс');
      t.eq(swingMs % 100, 0, 'интервал замаха для ' + w + ' (' + swingMs + ' мс) строго кратен 100 мс');
    }
  }

  t.suite('combat-quantization: расписание тиков DoT / HoT (dotTickSchedule)');
  {
    // Канонический яд: 30 секунд, 30 тиков
    const s1 = L2.dotTickSchedule(30000, 30);
    t.eq(s1.durationMs, 30000, 'длительность 30000 мс');
    t.eq(s1.ticks, 30, '30 тиков');
    t.eq(s1.everyMs, 1000, 'интервал каждого тика ровно 1000 мс');
    t.eq(s1.everyMs % 100, 0, 'интервал тика DoT кратен 100 мс');

    // Нестандартный дебафф: 7.3 секунды, 5 тиков
    // 7300 мс -> 7300 мс. rawEvery = 7300 / 5 = 1460 мс -> 1500 мс
    const s2 = L2.dotTickSchedule(7300, 5);
    t.eq(s2.durationMs, 7300, 'длительность 7300 мс квантована к 100 мс');
    t.eq(s2.ticks, 5, '5 тиков');
    t.eq(s2.everyMs, 1500, 'интервал 1460 мс квантован вверх до 1500 мс');
    t.eq(s2.everyMs % 100, 0, 'интервал тика строго кратен 100 мс');
  }

  t.suite('combat-quantization: проверка соответствия сетке 100 мс на 1000 случайных значений');
  {
    let seed = 42;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    let allAligned = true;
    for (let i = 0; i < 1000; i++) {
      const ms = rnd() * 60000; // от 0 до 60 секунд
      const q = L2.quantizeCombatMs(ms);
      if (q % 100 !== 0 || q < ms) {
        allAligned = false;
        break;
      }
    }
    t.ok(allAligned, 'все 1000 случайных миллисекундных таймингов квантованы вверх с шагом 100 мс');
  }
};
