// ============================================================
//  SHARED / NET-PACK.JS — Zero-Allocation квантизация и дельта позиций для пакета `upd`.
//
//  Квантизация координат: 2 знака = 1 см.
//  WebSocket по TCP надёжен, поэтому стоящую сущность не пересылаем —
//  клиент держит последний x/z/hp из aoi.enter или прошлого upd.
//  Zero-GC: исключены промежуточные конкатенации строк qx + ':' + qz + ':' + qh.
//  Числовое сравнение через компактный объект Sig(qx, qz, qh) с мономорфным скрытым классом V8.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NET_PACK = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var SCALE = 100;

  function qCoord(v) {
    var n = +v;
    if (!isFinite(n)) return 0;
    return Math.round(n * SCALE) / SCALE;
  }

  function qHp(v) {
    var n = Math.floor(+v || 0);
    return n < 0 ? 0 : n;
  }

  /**
   * Компактный дескриптор сигнатуры квантованной позиции (Zero-GC).
   * V8 присваивает единый скрытый класс (Hidden Class) для быстрого доступа к полям в регистрах CPU.
   */
  function Sig(qx, qz, qh) {
    this.qx = qx;
    this.qz = qz;
    this.qh = qh;
  }

  Sig.prototype.toString = function () {
    return this.qx + ':' + this.qz + ':' + this.qh;
  };

  function sig(x, z, hp) {
    var qx = Math.round((+x || 0) * SCALE);
    var qz = Math.round((+z || 0) * SCALE);
    var qh = Math.floor(+hp || 0);
    if (qh < 0) qh = 0;
    return new Sig(qx, qz, qh);
  }

  function pack(key, x, z, hp) {
    return { k: key, x: qCoord(x), z: qCoord(z), hp: qHp(hp) };
  }

  var _noChangeResult = { sig: null, pack: null };

  /**
   * Высокопроизводительная проверка изменений (Zero-GC Delta).
   * Если позиция и HP не изменились, возвращает _noChangeResult без единой аллокации.
   * @param {Sig|string|null} prevSig Предыдущая сигнатура (Sig или string fallback)
   * @param {string} key Ключ сущности ('p12', 'm40')
   * @param {number} x Координата X
   * @param {number} z Координата Z
   * @param {number} hp Здоровье
   * @returns {{sig: Sig|string, pack: object|null}}
   */
  function delta(prevSig, key, x, z, hp) {
    var qx = Math.round((+x || 0) * SCALE);
    var qz = Math.round((+z || 0) * SCALE);
    var qh = Math.floor(+hp || 0);
    if (qh < 0) qh = 0;

    // Быстрый путь: числовое сравнение через мономорфный объект Sig (Zero String Churn)
    if (prevSig && typeof prevSig === 'object') {
      if (prevSig.qx === qx && prevSig.qz === qz && prevSig.qh === qh) {
        _noChangeResult.sig = prevSig;
        return _noChangeResult;
      }
    } else if (typeof prevSig === 'string') {
      // Fallback для совместимости с устаревшими строковыми сигнатурами
      var s = qx + ':' + qz + ':' + qh;
      if (prevSig === s) {
        _noChangeResult.sig = prevSig;
        return _noChangeResult;
      }
    }

    var nextSig = new Sig(qx, qz, qh);
    return {
      sig: nextSig,
      pack: { k: key, x: qx / SCALE, z: qz / SCALE, hp: qh }
    };
  }

  return {
    SCALE: SCALE,
    qCoord: qCoord,
    qHp: qHp,
    Sig: Sig,
    sig: sig,
    pack: pack,
    delta: delta
  };
});
