// ============================================================
//  TESTS / TRADE.TEST.JS — правила обмена игрок ↔ игрок.
//  Регресс, который тут закрывается: до обмена вещь можно было передать только
//  выбросив её на землю. Опасность обмена — дюп: перенос идёт между ДВУМЯ
//  профилями, поэтому проверки «влезет ли», «что вообще передаётся» и «сколько
//  слотов останется» должны быть чистыми функциями и считаться одинаково у
//  сервера и клиента.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TR = require(path.join(ROOT, 'shared', 'trade-rules.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));

module.exports = function (t) {
  t.suite('trade-rules: что можно передать');
  t.eq(TR.tradable('synthetic_oil').ok, true, 'расходник передаётся');
  t.eq(TR.tradable('operator_hammer_low').ok, true, 'оружие передаётся');
  t.eq(TR.tradable('copper_parts').ok, true, 'валюта передаётся (обмен адены — основной сценарий)');
  t.eq(TR.tradable('audio_log_01').reason, 'quest_item', 'квестовые предметы не передаются');
  t.eq(TR.tradable('нет_такого').reason, 'unknown_item', 'неизвестный предмет не передаётся');
  t.eq(TR.tradable('__proto__').reason, 'args', 'prototype-ключ отбит на входе');
  t.eq(TR.tradable(null).reason, 'args', 'null → отказ');

  t.suite('trade-rules: окно обмена');
  t.eq(TR.MAX_TRADE_SLOTS, 8, 'позиций на сторону 8 (как ячеек в окне L2 C1)');
  t.eq(TR.TRADE_RANGE, 50, 'дистанция обмена 50 м (как приглашение в группу)');
  t.ok(TR.TRADE_TTL_MS >= 30000, 'у брошенного окна есть таймаут', TR.TRADE_TTL_MS + ' мс');
  t.eq(TR.offerSlots({}), 0, 'пустое предложение — 0 позиций');
  t.eq(TR.offerSlots({ a: 1, b: 5, c: 0 }), 2, 'нулевые позиции не считаются');
  t.ok(TR.inRange(0, 0, 49, 0), '49 м — в радиусе');
  t.ok(!TR.inRange(0, 0, 51, 0), '51 м — вне радиуса');
  t.ok(!TR.inRange(0, 0, 40, 40), 'дистанция считается по обеим осям');

  t.suite('trade-rules: слоты после обмена');
  // Полная сумка (80 слотов одним ключом), отдаёт стак и получает вещь: обмен
  // обязан пройти. По одному предмету наивная проверка «влезет ли чужое» это
  // запрещала бы, а два разных предмета по отдельности пролезли бы в один слот.
  const full = { synthetic_oil: 999 * 80 };
  t.eq(NPCS.invSlotsUsed(full), 80, 'сумка забита под потолок');
  t.eq(TR.canSwap(full, { synthetic_oil: 999 }, { iron_hammer: 1 }).ok, true,
    'отдал стак — освободил слот под чужую вещь');
  t.eq(TR.canSwap(full, {}, { iron_hammer: 1 }).ok, false,
    'ничего не отдал — чужая вещь не влезает');
  t.eq(TR.canSwap({}, {}, { iron_hammer: 1, buckler: 1, steam_hammer: 1 }).ok, true,
    'в пустую сумку влезает набор');
  // Набор из 81 нестакуемой позиции не влезает даже в пустую сумку
  const many = {};
  for (let i = 0; i < 81; i++) many['x' + i] = 1;
  t.eq(TR.slotsAfterSwap({}, {}, many), 0,
    'неизвестные id слотов не занимают (метаданных нет — предмета нет)');
  const bigTake = { synthetic_oil: 999 * 81 };
  t.eq(TR.canSwap({}, {}, bigTake).ok, false, '81 стак масла в пустую сумку не влезает');
  t.eq(TR.canSwap({}, {}, { synthetic_oil: 999 * 80 }).ok, true, '80 стаков влезают ровно');
  // Валюта слотов не занимает — иначе обмен адены упирался бы в лимит
  t.eq(TR.canSwap(full, {}, { copper_parts: 1000000 }).ok, true, 'адена слотов не занимает');
  t.eq(TR.slotsAfterSwap({ synthetic_oil: 500 }, { synthetic_oil: 500 }, {}), 0,
    'отдал всё — сумка пуста');
  t.eq(TR.slotsAfterSwap({ synthetic_oil: 500 }, { synthetic_oil: 900 }, {}), 0,
    'отрицательный остаток не превращается в слоты');

  t.suite('trade-rules: prototype-ключи в предложении');
  const dirty = Object.create(null);
  dirty.synthetic_oil = 10;
  t.eq(TR.slotsAfterSwap(dirty, { __proto__: 5 }, { constructor: 5 }), 1,
    'служебные ключи игнорируются, реальный стак остаётся');
  t.eq({}.synthetic_oil, undefined, 'Object.prototype не загрязнён');
};
