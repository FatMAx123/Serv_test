// ============================================================
//  SHARED / NET-PACK-BINARY.JS
//  Высокопроизводительный бинарный Zero-Copy кодек для MMO.
//  Упаковывает high-frequency пакеты `upd` (рассылка позиций)
//  и `move` (шаг игрока) в компактные ArrayBuffer / Buffer.
//
//  Opcode 0x01: UPD (Server -> Client)
//    [0]     Uint8: Opcode = 1
//    [1..2]  Uint16LE: Entity count N
//    Запись на сущность (17 байт):
//      [0]     Uint8: Kind (1 = Player 'p', 2 = Mob 'm')
//      [1..4]  Uint32LE: ID (pid / mid, 0..4294967295)
//      [5..8]  Int32LE: PosX * 100 (сантиметровая точность)
//      [9..12] Int32LE: PosZ * 100 (сантиметровая точность)
//      [13..16] Uint32LE: HP (до 4.2 млрд)
//
//  Opcode 0x02: MOVE (Client -> Server)
//    [0]     Uint8: Opcode = 2
//    [1..2]  Uint16LE: Seq
//    [3..6]  Int32LE: Target X * 100
//    [7..10] Int32LE: Target Z * 100
//    [11]    Uint8: Flags (bit 0 = walking)
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NET_PACK_BINARY = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var SCALE = 100;
  var OP_UPD = 0x01;
  var OP_MOVE = 0x02;
  var OP_MOVE_VEC_START = 0x03;
  var OP_MOVE_VEC_STOP = 0x04;

  var KIND_PLAYER = 1;
  var KIND_MOB = 2;

  var ENTITY_BYTE_SIZE = 17;
  var MOVE_BYTE_SIZE = 12;
  var MOVE_VEC_START_SIZE = 29;
  var MOVE_VEC_STOP_SIZE = 18;

  var isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

  // ============================================================
  // Кольцевой пул буферов для сервера (Zero Buffer Allocations при sendUpd)
  // 4096 слотов по 8 КБ (32 МБ суммарно). Вмещает до 481 сущности на пакет.
  // Исключает аллокации Buffer.allocUnsafe в горячем тике симуляции.
  // ============================================================
  var RING_SIZE = 4096;
  var RING_MASK = RING_SIZE - 1;
  var RING_SLOT_SIZE = 8192;
  var _ringBuffers = null;
  var _ringIdx = 0;

  if (isNode) {
    _ringBuffers = new Array(RING_SIZE);
    for (var r = 0; r < RING_SIZE; r++) {
      _ringBuffers[r] = Buffer.allocUnsafe(RING_SLOT_SIZE);
    }
  }

  function getRingStats() {
    return {
      size: RING_SIZE,
      slotSize: RING_SLOT_SIZE,
      currentIdx: _ringIdx
    };
  }

  function getRingSlot() {
    if (!isNode || !_ringBuffers) return null;
    var slot = _ringBuffers[_ringIdx];
    _ringIdx = (_ringIdx + 1) & RING_MASK;
    return slot;
  }

  /**
   * Разбор ключа сущности 'p102' -> { kind: 1, id: 102 }
   */
  function parseEntityKey(k) {
    if (typeof k !== 'string') return { kind: KIND_MOB, id: 0 };
    var first = k.charCodeAt(0);
    var id = parseInt(k.slice(1), 10) || 0;
    if (first === 112 /* 'p' */ || first === 80 /* 'P' */) {
      return { kind: KIND_PLAYER, id: id };
    }
    return { kind: KIND_MOB, id: id };
  }

  /**
   * Кодирование пачки `upd` в Buffer / ArrayBuffer.
   * При вызове без targetBuffer в Node.js использует кольцевой пул буферов (Zero-Allocations).
   * @param {Array<{k: string, x: number, z: number, hp: number}>} entities
   * @param {Buffer|Uint8Array} [targetBuffer] Опциональный целевой буфер
   * @returns {Buffer|ArrayBuffer|number} Бинарный кадр для сокета (или totalLen если передан targetBuffer)
   */
  function encodeUpd(entities, targetBuffer) {
    var count = entities ? entities.length : 0;
    if (count > 4000) count = 4000;
    var totalLen = 3 + count * ENTITY_BYTE_SIZE;

    if (isNode) {
      var buf;
      var useRing = false;
      if (targetBuffer) {
        buf = targetBuffer;
      } else if (_ringBuffers && totalLen <= RING_SLOT_SIZE) {
        buf = _ringBuffers[_ringIdx];
        _ringIdx = (_ringIdx + 1) & RING_MASK;
        useRing = true;
      } else {
        buf = Buffer.allocUnsafe(totalLen);
      }

      buf.writeUInt8(OP_UPD, 0);
      buf.writeUInt16LE(count, 1);

      var off = 3;
      for (var i = 0; i < count; i++) {
        var e = entities[i];
        var k = e.k;
        var first = k ? k.charCodeAt(0) : 0;
        var kind = (first === 112 || first === 80) ? KIND_PLAYER : KIND_MOB;
        var id = 0;
        if (k) {
          for (var idx = 1, klen = k.length; idx < klen; idx++) {
            var c = k.charCodeAt(idx);
            if (c >= 48 && c <= 57) id = id * 10 + (c - 48);
          }
        }
        buf.writeUInt8(kind, off);
        buf.writeUInt32LE(id >>> 0, off + 1);
        buf.writeInt32LE(Math.round((+e.x || 0) * SCALE), off + 5);
        buf.writeInt32LE(Math.round((+e.z || 0) * SCALE), off + 9);
        buf.writeUInt32LE(Math.max(0, Math.floor(+e.hp || 0)), off + 13);
        off += ENTITY_BYTE_SIZE;
      }

      if (targetBuffer) return totalLen;
      return useRing ? buf.subarray(0, totalLen) : buf;
    } else {
      // Browser WebGL client
      var ab = targetBuffer ? targetBuffer.buffer : new ArrayBuffer(totalLen);
      var view = new DataView(ab);
      view.setUint8(0, OP_UPD);
      view.setUint16(1, count, true);

      var off2 = 3;
      for (var j = 0; j < count; j++) {
        var e2 = entities[j];
        var k2 = e2.k;
        var first2 = k2 ? k2.charCodeAt(0) : 0;
        var kind2 = (first2 === 112 || first2 === 80) ? KIND_PLAYER : KIND_MOB;
        var id2 = 0;
        if (k2) {
          for (var idx2 = 1, klen2 = k2.length; idx2 < klen2; idx2++) {
            var c2 = k2.charCodeAt(idx2);
            if (c2 >= 48 && c2 <= 57) id2 = id2 * 10 + (c2 - 48);
          }
        }
        view.setUint8(off2, kind2);
        view.setUint32(off2 + 1, id2 >>> 0, true);
        view.setInt32(off2 + 5, Math.round((+e2.x || 0) * SCALE), true);
        view.setInt32(off2 + 9, Math.round((+e2.z || 0) * SCALE), true);
        view.setUint32(off2 + 13, Math.max(0, Math.floor(+e2.hp || 0)), true);
        off2 += ENTITY_BYTE_SIZE;
      }

      return ab;
    }
  }

  /**
   * Декодирование бинарного `upd` пакета.
   * @param {ArrayBuffer|Buffer|Uint8Array} data
   * @param {function(key: string, x: number, z: number, hp: number): void} [eachFn]
   * @returns {Array<{k: string, x: number, z: number, hp: number}>}
   */
  function decodeUpd(data, eachFn) {
    if (!data) return [];
    var results = eachFn ? null : [];

    if (isNode && Buffer.isBuffer(data)) {
      if (data.length < 3) return results || [];
      if (data.readUInt8(0) !== OP_UPD) return results || [];
      var count = data.readUInt16LE(1);
      var off = 3;
      for (var i = 0; i < count; i++) {
        if (off + ENTITY_BYTE_SIZE > data.length) break;
        var kind = data.readUInt8(off);
        var id = data.readUInt32LE(off + 1);
        var x = data.readInt32LE(off + 5) / SCALE;
        var z = data.readInt32LE(off + 9) / SCALE;
        var hp = data.readUInt32LE(off + 13);
        var key = (kind === KIND_PLAYER ? 'p' : 'm') + id;

        if (eachFn) {
          eachFn(key, x, z, hp);
        } else {
          results.push({ k: key, x: x, z: z, hp: hp });
        }
        off += ENTITY_BYTE_SIZE;
      }
      return results;
    } else {
      // Browser / DataView
      var view = data instanceof DataView ? data : new DataView(data instanceof ArrayBuffer ? data : data.buffer, data.byteOffset || 0, data.byteLength);
      if (view.byteLength < 3) return results || [];
      if (view.getUint8(0) !== OP_UPD) return results || [];
      var count2 = view.getUint16(1, true);
      var off2 = 3;
      for (var j = 0; j < count2; j++) {
        if (off2 + ENTITY_BYTE_SIZE > view.byteLength) break;
        var kind2 = view.getUint8(off2);
        var id2 = view.getUint32(off2 + 1, true);
        var x2 = view.getInt32(off2 + 5, true) / SCALE;
        var z2 = view.getInt32(off2 + 9, true) / SCALE;
        var hp2 = view.getUint32(off2 + 13, true);
        var key2 = (kind2 === KIND_PLAYER ? 'p' : 'm') + id2;

        if (eachFn) {
          eachFn(key2, x2, z2, hp2);
        } else {
          results.push({ k: key2, x: x2, z: z2, hp: hp2 });
        }
        off2 += ENTITY_BYTE_SIZE;
      }
      return results;
    }
  }

  /**
   * Кодирование пакета перемещения игрока `move` (Client -> Server).
   * @param {number} x
   * @param {number} z
   * @param {boolean} walking
   * @param {number} [seq]
   * @param {number} [destX]
   * @param {number} [destZ]
   * @returns {ArrayBuffer|Buffer}
   */
  function encodeMove(x, z, walking, seq, destX, destZ) {
    var s = (seq || 0) & 0xffff;
    var flags = walking ? 1 : 0;
    var hasDest = (destX != null && destZ != null && Number.isFinite(+destX) && Number.isFinite(+destZ));
    if (hasDest) flags |= 2;
    var byteLen = hasDest ? 20 : MOVE_BYTE_SIZE;

    if (isNode) {
      var buf = Buffer.allocUnsafe(byteLen);
      buf.writeUInt8(OP_MOVE, 0);
      buf.writeUInt16LE(s, 1);
      buf.writeInt32LE(Math.round((+x || 0) * SCALE), 3);
      buf.writeInt32LE(Math.round((+z || 0) * SCALE), 7);
      buf.writeUInt8(flags, 11);
      if (hasDest) {
        buf.writeInt32LE(Math.round((+destX || 0) * SCALE), 12);
        buf.writeInt32LE(Math.round((+destZ || 0) * SCALE), 16);
      }
      return buf;
    } else {
      var ab = new ArrayBuffer(byteLen);
      var view = new DataView(ab);
      view.setUint8(0, OP_MOVE);
      view.setUint16(1, s, true);
      view.setInt32(3, Math.round((+x || 0) * SCALE), true);
      view.setInt32(7, Math.round((+z || 0) * SCALE), true);
      view.setUint8(11, flags);
      if (hasDest) {
        view.setInt32(12, Math.round((+destX || 0) * SCALE), true);
        view.setInt32(16, Math.round((+destZ || 0) * SCALE), true);
      }
      return ab;
    }
  }

  /**
   * Декодирование пакета перемещения `move` (Server side).
   * @param {Buffer|ArrayBuffer|Uint8Array} data
   * @returns {{t: string, seq: number, x: number, z: number, walking: boolean, destX?: number, destZ?: number}|null}
   */
  function decodeMove(data) {
    if (!data) return null;

    if (isNode && Buffer.isBuffer(data)) {
      if (data.length < MOVE_BYTE_SIZE) return null;
      if (data.readUInt8(0) !== OP_MOVE) return null;
      var seq = data.readUInt16LE(1);
      var x = data.readInt32LE(3) / SCALE;
      var z = data.readInt32LE(7) / SCALE;
      var flags = data.readUInt8(11);
      var res = {
        t: 'move',
        seq: seq,
        x: x,
        z: z,
        walking: (flags & 1) !== 0
      };
      if ((flags & 2) !== 0 && data.length >= 20) {
        res.destX = data.readInt32LE(12) / SCALE;
        res.destZ = data.readInt32LE(16) / SCALE;
      }
      return res;
    } else {
      var view = data instanceof DataView ? data : new DataView(data instanceof ArrayBuffer ? data : data.buffer, data.byteOffset || 0, data.byteLength);
      if (view.byteLength < MOVE_BYTE_SIZE) return null;
      if (view.getUint8(0) !== OP_MOVE) return null;
      var seq2 = view.getUint16(1, true);
      var x2 = view.getInt32(3, true) / SCALE;
      var z2 = view.getInt32(7, true) / SCALE;
      var flags2 = view.getUint8(11);
      var res2 = {
        t: 'move',
        seq: seq2,
        x: x2,
        z: z2,
        walking: (flags2 & 1) !== 0
      };
      if ((flags2 & 2) !== 0 && view.byteLength >= 20) {
        res2.destX = view.getInt32(12, true) / SCALE;
        res2.destZ = view.getInt32(16, true) / SCALE;
      }
      return res2;
    }
  }

  /**
   * Кодирование пакета начала векторного движения MOVE_VEC_START (0x03, 27 байт).
   * @param {string|object} keyOrObj Ключ ('p102') или объект {k, startX, startZ, targetX, targetZ, speed, flags, timestamp}
   * @param {number} [startX]
   * @param {number} [startZ]
   * @param {number} [targetX]
   * @param {number} [targetZ]
   * @param {number} [speed]
   * @param {number|boolean} [flags]
   * @param {number} [timestamp]
   * @param {Buffer|Uint8Array} [targetBuffer]
   * @returns {Buffer|ArrayBuffer}
   */
  function encodeMoveVecStart(keyOrObj, startX, startZ, targetX, targetZ, speed, flags, timestamp, targetBuffer) {
    var k, sx, sz, tx, tz, spd, flg, ts, bufTarget;
    if (keyOrObj && typeof keyOrObj === 'object') {
      k = keyOrObj.k || keyOrObj.key || ('p' + (keyOrObj.id || 0));
      sx = keyOrObj.startX != null ? keyOrObj.startX : (keyOrObj.x || 0);
      sz = keyOrObj.startZ != null ? keyOrObj.startZ : (keyOrObj.z || 0);
      tx = keyOrObj.targetX != null ? keyOrObj.targetX : (keyOrObj.tx || 0);
      tz = keyOrObj.targetZ != null ? keyOrObj.targetZ : (keyOrObj.tz || 0);
      spd = keyOrObj.speed != null ? keyOrObj.speed : 7.5;
      flg = keyOrObj.flags != null ? keyOrObj.flags : (keyOrObj.walking ? 1 : 0);
      ts = keyOrObj.timestamp != null ? keyOrObj.timestamp : (Date.now() & 0xffffffff);
      bufTarget = startX;
    } else {
      k = keyOrObj;
      sx = startX;
      sz = startZ;
      tx = targetX;
      tz = targetZ;
      spd = speed != null ? speed : 7.5;
      flg = typeof flags === 'boolean' ? (flags ? 1 : 0) : (flags || 0);
      ts = timestamp != null ? timestamp : (Date.now() & 0xffffffff);
      bufTarget = targetBuffer;
    }

    var pk = parseEntityKey(k);
    var spdScaled = Math.min(65535, Math.max(0, Math.round((+spd || 0) * SCALE)));
    var tsUint = (+ts || 0) >>> 0;

    if (isNode) {
      var buf = bufTarget || Buffer.allocUnsafe(MOVE_VEC_START_SIZE);
      buf.writeUInt8(OP_MOVE_VEC_START, 0);
      buf.writeUInt8(pk.kind, 1);
      buf.writeUInt32LE(pk.id >>> 0, 2);
      buf.writeInt32LE(Math.round((+sx || 0) * SCALE), 6);
      buf.writeInt32LE(Math.round((+sz || 0) * SCALE), 10);
      buf.writeInt32LE(Math.round((+tx || 0) * SCALE), 14);
      buf.writeInt32LE(Math.round((+tz || 0) * SCALE), 18);
      buf.writeUInt16LE(spdScaled, 22);
      buf.writeUInt32LE(tsUint, 24);
      buf.writeUInt8(flg & 0xff, 28);
      return bufTarget ? MOVE_VEC_START_SIZE : buf;
    } else {
      var ab = bufTarget ? bufTarget.buffer : new ArrayBuffer(MOVE_VEC_START_SIZE);
      var view = new DataView(ab);
      view.setUint8(0, OP_MOVE_VEC_START);
      view.setUint8(1, pk.kind);
      view.setUint32(2, pk.id >>> 0, true);
      view.setInt32(6, Math.round((+sx || 0) * SCALE), true);
      view.setInt32(10, Math.round((+sz || 0) * SCALE), true);
      view.setInt32(14, Math.round((+tx || 0) * SCALE), true);
      view.setInt32(18, Math.round((+tz || 0) * SCALE), true);
      view.setUint16(22, spdScaled, true);
      view.setUint32(24, tsUint, true);
      view.setUint8(28, flg & 0xff);
      return ab;
    }
  }

  /**
   * Декодирование пакета начала векторного движения MOVE_VEC_START.
   * @param {Buffer|ArrayBuffer|Uint8Array} data
   * @returns {object|null}
   */
  function decodeMoveVecStart(data) {
    if (!data) return null;
    if (isNode && Buffer.isBuffer(data)) {
      if (data.length < MOVE_VEC_START_SIZE) return null;
      if (data.readUInt8(0) !== OP_MOVE_VEC_START) return null;
      var kind = data.readUInt8(1);
      var id = data.readUInt32LE(2);
      var sx = data.readInt32LE(6) / SCALE;
      var sz = data.readInt32LE(10) / SCALE;
      var tx = data.readInt32LE(14) / SCALE;
      var tz = data.readInt32LE(18) / SCALE;
      var spd = data.readUInt16LE(22) / SCALE;
      var ts = data.readUInt32LE(24);
      var flg = data.readUInt8(28);
      var key = (kind === KIND_PLAYER ? 'p' : 'm') + id;
      return {
        t: 'move_vec_start',
        k: key,
        kind: kind,
        id: id,
        startX: sx,
        startZ: sz,
        targetX: tx,
        targetZ: tz,
        speed: spd,
        timestamp: ts,
        flags: flg,
        walking: (flg & 1) !== 0
      };
    } else {
      var view = data instanceof DataView ? data : new DataView(data instanceof ArrayBuffer ? data : data.buffer, data.byteOffset || 0, data.byteLength);
      if (view.byteLength < MOVE_VEC_START_SIZE) return null;
      if (view.getUint8(0) !== OP_MOVE_VEC_START) return null;
      var kind2 = view.getUint8(1);
      var id2 = view.getUint32(2, true);
      var sx2 = view.getInt32(6, true) / SCALE;
      var sz2 = view.getInt32(10, true) / SCALE;
      var tx2 = view.getInt32(14, true) / SCALE;
      var tz2 = view.getInt32(18, true) / SCALE;
      var spd2 = view.getUint16(22, true) / SCALE;
      var ts2 = view.getUint32(24, true);
      var flg2 = view.getUint8(28);
      var key2 = (kind2 === KIND_PLAYER ? 'p' : 'm') + id2;
      return {
        t: 'move_vec_start',
        k: key2,
        kind: kind2,
        id: id2,
        startX: sx2,
        startZ: sz2,
        targetX: tx2,
        targetZ: tz2,
        speed: spd2,
        timestamp: ts2,
        flags: flg2,
        walking: (flg2 & 1) !== 0
      };
    }
  }

  /**
   * Кодирование пакета остановки векторного движения MOVE_VEC_STOP (0x04, 18 байт).
   * @param {string|object} keyOrObj
   * @param {number} [stopX]
   * @param {number} [stopZ]
   * @param {number} [timestamp]
   * @param {Buffer|Uint8Array} [targetBuffer]
   * @returns {Buffer|ArrayBuffer}
   */
  function encodeMoveVecStop(keyOrObj, stopX, stopZ, timestamp, targetBuffer) {
    var k, sx, sz, ts, bufTarget;
    if (keyOrObj && typeof keyOrObj === 'object') {
      k = keyOrObj.k || keyOrObj.key || ('p' + (keyOrObj.id || 0));
      sx = keyOrObj.stopX != null ? keyOrObj.stopX : (keyOrObj.x || 0);
      sz = keyOrObj.stopZ != null ? keyOrObj.stopZ : (keyOrObj.z || 0);
      ts = keyOrObj.timestamp != null ? keyOrObj.timestamp : (Date.now() & 0xffffffff);
      bufTarget = stopX;
    } else {
      k = keyOrObj;
      sx = stopX;
      sz = stopZ;
      ts = timestamp != null ? timestamp : (Date.now() & 0xffffffff);
      bufTarget = targetBuffer;
    }

    var pk = parseEntityKey(k);
    var tsUint = (+ts || 0) >>> 0;

    if (isNode) {
      var buf = bufTarget || Buffer.allocUnsafe(MOVE_VEC_STOP_SIZE);
      buf.writeUInt8(OP_MOVE_VEC_STOP, 0);
      buf.writeUInt8(pk.kind, 1);
      buf.writeUInt32LE(pk.id >>> 0, 2);
      buf.writeInt32LE(Math.round((+sx || 0) * SCALE), 6);
      buf.writeInt32LE(Math.round((+sz || 0) * SCALE), 10);
      buf.writeUInt32LE(tsUint, 14);
      return bufTarget ? MOVE_VEC_STOP_SIZE : buf;
    } else {
      var ab = bufTarget ? bufTarget.buffer : new ArrayBuffer(MOVE_VEC_STOP_SIZE);
      var view = new DataView(ab);
      view.setUint8(0, OP_MOVE_VEC_STOP);
      view.setUint8(1, pk.kind);
      view.setUint32(2, pk.id >>> 0, true);
      view.setInt32(6, Math.round((+sx || 0) * SCALE), true);
      view.setInt32(10, Math.round((+sz || 0) * SCALE), true);
      view.setUint32(14, tsUint, true);
      return ab;
    }
  }

  /**
   * Декодирование пакета остановки векторного движения MOVE_VEC_STOP.
   * @param {Buffer|ArrayBuffer|Uint8Array} data
   * @returns {object|null}
   */
  function decodeMoveVecStop(data) {
    if (!data) return null;
    if (isNode && Buffer.isBuffer(data)) {
      if (data.length < MOVE_VEC_STOP_SIZE) return null;
      if (data.readUInt8(0) !== OP_MOVE_VEC_STOP) return null;
      var kind = data.readUInt8(1);
      var id = data.readUInt32LE(2);
      var sx = data.readInt32LE(6) / SCALE;
      var sz = data.readInt32LE(10) / SCALE;
      var ts = data.readUInt32LE(14);
      var key = (kind === KIND_PLAYER ? 'p' : 'm') + id;
      return {
        t: 'move_vec_stop',
        k: key,
        kind: kind,
        id: id,
        stopX: sx,
        stopZ: sz,
        x: sx,
        z: sz,
        timestamp: ts
      };
    } else {
      var view = data instanceof DataView ? data : new DataView(data instanceof ArrayBuffer ? data : data.buffer, data.byteOffset || 0, data.byteLength);
      if (view.byteLength < MOVE_VEC_STOP_SIZE) return null;
      if (view.getUint8(0) !== OP_MOVE_VEC_STOP) return null;
      var kind2 = view.getUint8(1);
      var id2 = view.getUint32(2, true);
      var sx2 = view.getInt32(6, true) / SCALE;
      var sz2 = view.getInt32(10, true) / SCALE;
      var ts2 = view.getUint32(14, true);
      var key2 = (kind2 === KIND_PLAYER ? 'p' : 'm') + id2;
      return {
        t: 'move_vec_stop',
        k: key2,
        kind: kind2,
        id: id2,
        stopX: sx2,
        stopZ: sz2,
        x: sx2,
        z: sz2,
        timestamp: ts2
      };
    }
  }

  /**
   * Быстрая проверка: является ли сырой буфер бинарным пакетом нашего протокола.
   * @param {any} data
   * @returns {number} 0 если не бинарный пакет, иначе opcode (1=UPD, 2=MOVE, 3=MOVE_VEC_START, 4=MOVE_VEC_STOP)
   */
  function getOpcode(data) {
    if (!data) return 0;
    if (isNode && Buffer.isBuffer(data)) {
      return data.length > 0 ? data.readUInt8(0) : 0;
    }
    if (data instanceof ArrayBuffer) {
      return data.byteLength > 0 ? new Uint8Array(data)[0] : 0;
    }
    if (ArrayBuffer.isView(data)) {
      return data.byteLength > 0 ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)[0] : 0;
    }
    return 0;
  }

  return {
    SCALE: SCALE,
    OP_UPD: OP_UPD,
    OP_MOVE: OP_MOVE,
    OP_MOVE_VEC_START: OP_MOVE_VEC_START,
    OP_MOVE_VEC_STOP: OP_MOVE_VEC_STOP,
    KIND_PLAYER: KIND_PLAYER,
    KIND_MOB: KIND_MOB,
    ENTITY_BYTE_SIZE: ENTITY_BYTE_SIZE,
    MOVE_BYTE_SIZE: MOVE_BYTE_SIZE,
    MOVE_VEC_START_SIZE: MOVE_VEC_START_SIZE,
    MOVE_VEC_STOP_SIZE: MOVE_VEC_STOP_SIZE,
    parseEntityKey: parseEntityKey,
    encodeUpd: encodeUpd,
    decodeUpd: decodeUpd,
    encodeMove: encodeMove,
    decodeMove: decodeMove,
    encodeMoveVecStart: encodeMoveVecStart,
    decodeMoveVecStart: decodeMoveVecStart,
    encodeMoveVecStop: encodeMoveVecStop,
    decodeMoveVecStop: decodeMoveVecStop,
    getOpcode: getOpcode,
    RING_SIZE: RING_SIZE,
    RING_SLOT_SIZE: RING_SLOT_SIZE,
    getRingStats: getRingStats,
    getRingSlot: getRingSlot
  };
});
