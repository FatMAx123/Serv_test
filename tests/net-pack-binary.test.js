// ============================================================
//  TESTS / NET-PACK-BINARY.TEST.JS
//  Тестирование Zero-Copy бинарного кодека для high-frequency
//  пакетов `upd` и `move`.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NPB = require(path.join(ROOT, 'shared', 'net-pack-binary.js'));

module.exports = function (t) {
  t.suite('net-pack-binary: базовые константы и разбор ключей');
  t.eq(NPB.OP_UPD, 1, 'Opcode UPD = 1');
  t.eq(NPB.OP_MOVE, 2, 'Opcode MOVE = 2');
  t.eq(NPB.ENTITY_BYTE_SIZE, 17, '17 байт на сущность в upd');
  t.eq(NPB.MOVE_BYTE_SIZE, 12, '12 байт на пакет move');
  t.eq(NPB.MOVE_VEC_START_SIZE, 29, '29 байт на пакет move_vec_start');
  t.eq(NPB.MOVE_VEC_STOP_SIZE, 18, '18 байт на пакет move_vec_stop');

  t.eq(NPB.parseEntityKey('p102'), { kind: NPB.KIND_PLAYER, id: 102 }, 'p102 -> Player 102');
  t.eq(NPB.parseEntityKey('m4059'), { kind: NPB.KIND_MOB, id: 4059 }, 'm4059 -> Mob 4059');
  t.eq(NPB.parseEntityKey('p100000001'), { kind: NPB.KIND_PLAYER, id: 100000001 }, 'p100000001 -> Player 100M+ (32-bit)');
  t.eq(NPB.parseEntityKey('p0'), { kind: NPB.KIND_PLAYER, id: 0 }, 'p0 -> Player 0');
  t.eq(NPB.parseEntityKey('invalid'), { kind: NPB.KIND_MOB, id: 0 }, 'fallback на Mob 0');

  t.suite('net-pack-binary: кодирование и декодирование upd (Node.js Buffer)');
  const inputEntities = [
    { k: 'p1', x: 12.34, z: -56.78, hp: 450 },
    { k: 'm99', x: -105.12, z: 204.55, hp: 1200 },
    { k: 'p100000001', x: 0, z: 0, hp: 1 },
    { k: 'm5', x: -1800.5, z: 1800.25, hp: 50000 }
  ];

  const encBuf = NPB.encodeUpd(inputEntities);
  t.ok(Buffer.isBuffer(encBuf), 'кодируется в Buffer');
  t.eq(encBuf.length, 3 + 4 * 17, 'длина буфера = 3 + 4 * 17 = 71 байт');
  t.eq(NPB.getOpcode(encBuf), NPB.OP_UPD, 'getOpcode определяет UPD');

  const decoded = NPB.decodeUpd(encBuf);
  t.eq(decoded.length, 4, 'декодировано 4 сущности');
  t.eq(decoded[0], { k: 'p1', x: 12.34, z: -56.78, hp: 450 }, 'сущность 0 совпадает до сантиметра');
  t.eq(decoded[1], { k: 'm99', x: -105.12, z: 204.55, hp: 1200 }, 'сущность 1 совпадает');
  t.eq(decoded[2], { k: 'p100000001', x: 0, z: 0, hp: 1 }, 'сущность с 32-битным кластерным ID (100M+) без усечения');
  t.eq(decoded[3], { k: 'm5', x: -1800.5, z: 1800.25, hp: 50000 }, 'сущность на краю карты и с большим HP');

  // Проверка потокового колбэка
  const streamResults = [];
  NPB.decodeUpd(encBuf, (k, x, z, hp) => {
    streamResults.push({ k, x, z, hp });
  });
  t.eq(streamResults, decoded, 'декодирование через callback даёт тот же результат без промежуточных массивов');

  t.suite('net-pack-binary: кодирование и декодирование move (Node.js Buffer)');
  const moveBuf = NPB.encodeMove(145.67, -234.89, true, 42);
  t.ok(Buffer.isBuffer(moveBuf), 'move кодируется в Buffer');
  t.eq(moveBuf.length, 12, 'длина move буфера = 12 байт');
  t.eq(NPB.getOpcode(moveBuf), NPB.OP_MOVE, 'getOpcode определяет MOVE');

  const decodedMove = NPB.decodeMove(moveBuf);
  t.eq(decodedMove.t, 'move', 'тип пакета move');
  t.eq(decodedMove.seq, 42, 'seq совпадает');
  t.eq(decodedMove.x, 145.67, 'x совпадает до сантиметра');
  t.eq(decodedMove.z, -234.89, 'z совпадает до сантиметра');
  t.eq(decodedMove.walking, true, 'флаг walking передан');

  // Бег (walking: false)
  const runBuf = NPB.encodeMove(-50.0, 100.0, false, 43);
  const decodedRun = NPB.decodeMove(runBuf);
  t.eq(decodedRun.walking, false, 'флаг walking = false');

  t.suite('net-pack-binary: кросс-платформенная работа через DataView / ArrayBuffer');
  // Создаём имитацию браузерного ArrayBuffer
  const ab = new ArrayBuffer(encBuf.length);
  const u8 = new Uint8Array(ab);
  for (let i = 0; i < encBuf.length; i++) u8[i] = encBuf[i];

  const browserDecoded = NPB.decodeUpd(ab);
  t.eq(browserDecoded, decoded, 'декодирование ArrayBuffer через DataView идентично Node.js Buffer');

  const abMove = new ArrayBuffer(moveBuf.length);
  const u8Move = new Uint8Array(abMove);
  for (let i = 0; i < moveBuf.length; i++) u8Move[i] = moveBuf[i];

  const browserDecodedMove = NPB.decodeMove(abMove);
  t.eq(browserDecodedMove, decodedMove, 'декодирование DataView для move идентично');

  t.suite('net-pack-binary: производительность Zero-Copy');
  const perfBatch = [];
  for (let i = 0; i < 64; i++) {
    perfBatch.push({ k: 'm' + (i + 1), x: 100 + i * 0.5, z: -200 - i * 0.5, hp: 500 + i * 10 });
  }
  const t0 = Date.now();
  for (let iter = 0; iter < 10000; iter++) {
    const b = NPB.encodeUpd(perfBatch);
    NPB.decodeUpd(b, (k, x, z, hp) => {});
  }
  t.suite('net-pack-binary: Ring Buffer Pool (Zero Buffer Allocations)');
  t.eq(NPB.RING_SIZE, 4096, 'RING_SIZE = 4096 слотов');
  t.eq(NPB.RING_SLOT_SIZE, 8192, 'RING_SLOT_SIZE = 8192 байт (8 КБ)');
  const stats0 = NPB.getRingStats();
  t.ok(stats0 && typeof stats0.currentIdx === 'number', 'getRingStats возвращает статистику');

  // Проверка независимости слотов (буфер 1 не затирается буфером 2)
  const p1 = [{ k: 'p1', x: 10, z: 20, hp: 100 }];
  const p2 = [{ k: 'p2', x: 50, z: 60, hp: 200 }];
  const buf1 = NPB.encodeUpd(p1);
  const buf2 = NPB.encodeUpd(p2);
  t.ok(buf1 !== buf2, 'разные вызовы получают разные слоты пула');
  const d1 = NPB.decodeUpd(buf1);
  const d2 = NPB.decodeUpd(buf2);
  t.eq(d1[0].k, 'p1', 'первый буфер сохраняет данные');
  t.eq(d2[0].k, 'p2', 'второй буфер сохраняет данные');

  // Проверка fallback при превышении размера слота (> 8192 байт)
  const hugeBatch = [];
  for (let h = 0; h < 500; h++) {
    hugeBatch.push({ k: 'm' + h, x: h, z: h, hp: 100 });
  }
  const hugeLen = 3 + 500 * 17; // 8503 байта > 8192
  t.ok(hugeLen > NPB.RING_SLOT_SIZE, 'тестовая пачка превышает размер слота кольца');
  const hugeBuf = NPB.encodeUpd(hugeBatch);
  t.ok(Buffer.isBuffer(hugeBuf), 'hugeBuf кодируется в Buffer');
  t.eq(hugeBuf.length, hugeLen, 'длина hugeBuf соответствует полному объёму');
  const decodedHuge = NPB.decodeUpd(hugeBuf);
  t.eq(decodedHuge.length, 500, 'все 500 сущностей успешно декодированы');

  // Проверка прямого getRingSlot
  const directSlot = NPB.getRingSlot();
  t.ok(Buffer.isBuffer(directSlot), 'getRingSlot возвращает сырой Buffer слота');
  t.eq(directSlot.length, NPB.RING_SLOT_SIZE, 'размер слота равен RING_SLOT_SIZE');
};

