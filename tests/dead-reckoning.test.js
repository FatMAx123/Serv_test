// ============================================================
//  TESTS / DEAD-RECKONING.TEST.JS
//  Модульное тестирование бинарных пакетов Dead Reckoning
//  (MOVE_VEC_START 0x03, MOVE_VEC_STOP 0x04).
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NPB = require(path.join(ROOT, 'shared', 'net-pack-binary.js'));

module.exports = async function (t) {
  t.suite('dead-reckoning: базовые константы и опкоды');

  t.eq(NPB.OP_MOVE_VEC_START, 3, 'Opcode MOVE_VEC_START = 3');
  t.eq(NPB.OP_MOVE_VEC_STOP, 4, 'Opcode MOVE_VEC_STOP = 4');
  t.eq(NPB.MOVE_VEC_START_SIZE, 29, 'Размер пакета MOVE_VEC_START ровно 29 байт');
  t.eq(NPB.MOVE_VEC_STOP_SIZE, 18, 'Размер пакета MOVE_VEC_STOP ровно 18 байт');

  t.suite('dead-reckoning: сериализация и десериализация MOVE_VEC_START (Node.js Buffer)');

  const startPacket = NPB.encodeMoveVecStart('p102', -107.55, 246.32, 500.12, -800.75, 7.5, 0, 123456789);
  t.ok(Buffer.isBuffer(startPacket), 'Результат кодирования — Buffer');
  t.eq(startPacket.length, 29, 'Длина буфера ровно 29 байт');
  t.eq(NPB.getOpcode(startPacket), 3, 'getOpcode возвращает 3 (MOVE_VEC_START)');

  const decStart = NPB.decodeMoveVecStart(startPacket);
  t.ok(decStart != null, 'Пакет успешно декодирован');
  t.eq(decStart.k, 'p102', 'Ключ сущности совпадает (p102)');
  t.eq(decStart.kind, 1, 'Тип — игрок (1)');
  t.eq(decStart.id, 102, 'Entity ID = 102');
  t.near(decStart.startX, -107.55, 0.01, 'startX совпадает до сантиметра (-107.55)');
  t.near(decStart.startZ, 246.32, 0.01, 'startZ совпадает до сантиметра (246.32)');
  t.near(decStart.targetX, 500.12, 0.01, 'targetX совпадает до сантиметра (500.12)');
  t.near(decStart.targetZ, -800.75, 0.01, 'targetZ совпадает до сантиметра (-800.75)');
  t.near(decStart.speed, 7.5, 0.01, 'speed совпадает (7.5 м/с)');
  t.eq(decStart.timestamp, 123456789, 'timestamp передан без искажений');
  t.eq(decStart.walking, false, 'walking = false');

  // Проверка флага ходьбы
  const walkPacket = NPB.encodeMoveVecStart('m55', 0, 0, 10, 20, 3.2, 1, 99999);
  const decWalk = NPB.decodeMoveVecStart(walkPacket);
  t.eq(decWalk.k, 'm55', 'Моб m55');
  t.eq(decWalk.kind, 2, 'Тип — моб (2)');
  t.eq(decWalk.id, 55, 'ID = 55');
  t.eq(decWalk.walking, true, 'walking = true при flag=1');

  t.suite('dead-reckoning: сериализация и десериализация MOVE_VEC_STOP (Node.js Buffer)');

  const stopPacket = NPB.encodeMoveVecStop('p102', 500.12, -800.75, 123456899);
  t.ok(Buffer.isBuffer(stopPacket), 'Результат кодирования — Buffer');
  t.eq(stopPacket.length, 18, 'Длина буфера ровно 18 байт');
  t.eq(NPB.getOpcode(stopPacket), 4, 'getOpcode возвращает 4 (MOVE_VEC_STOP)');

  const decStop = NPB.decodeMoveVecStop(stopPacket);
  t.ok(decStop != null, 'Пакет остановки успешно декодирован');
  t.eq(decStop.k, 'p102', 'Ключ совпадает (p102)');
  t.near(decStop.stopX, 500.12, 0.01, 'stopX совпадает (500.12)');
  t.near(decStop.stopZ, -800.75, 0.01, 'stopZ совпадает (-800.75)');
  t.eq(decStop.timestamp, 123456899, 'timestamp остановки совпадает');

  t.suite('dead-reckoning: кросс-платформенность DataView / ArrayBuffer (Браузер WebGL)');

  // Эмуляция браузера через Uint8Array.buffer (29 байт с 32-bit entity ID)
  const rawBuf = new ArrayBuffer(29);
  const rawView = new DataView(rawBuf);
  rawView.setUint8(0, 3);
  rawView.setUint8(1, 1);
  rawView.setUint32(2, 777, true);
  rawView.setInt32(6, Math.round(-123.45 * 100), true);
  rawView.setInt32(10, Math.round(678.90 * 100), true);
  rawView.setInt32(14, Math.round(100.00 * 100), true);
  rawView.setInt32(18, Math.round(-200.00 * 100), true);
  rawView.setUint16(22, Math.round(12.50 * 100), true);
  rawView.setUint32(24, 555555, true);
  rawView.setUint8(28, 0);

  const decBrowser = NPB.decodeMoveVecStart(rawBuf);
  t.ok(decBrowser != null, 'Браузерный DataView успешно декодирован');
  t.eq(decBrowser.k, 'p777', 'Ключ браузерного пакета p777');
  t.near(decBrowser.startX, -123.45, 0.01, 'startX совпадает в DataView');
  t.near(decBrowser.startZ, 678.90, 0.01, 'startZ совпадает в DataView');
  t.near(decBrowser.speed, 12.50, 0.01, 'speed совпадает в DataView');

  t.suite('dead-reckoning: производительность Zero-GC');

  const targetBuf = Buffer.allocUnsafe(29);
  const t0 = Date.now();
  for (let i = 0; i < 200000; i++) {
    NPB.encodeMoveVecStart('p1', 10, 20, 30, 40, 7.5, 0, 1000, targetBuf);
    NPB.decodeMoveVecStart(targetBuf);
  }
  const dt = Date.now() - t0;
  t.ok(dt < 500, '200 000 циклов кодирования/декодирования вектора быстрее 500 мс (' + dt + ' мс)');
};
