// ============================================================
//  SHARED / WORLD-TIME.JS — суточный цикл дня/ночи
//  Сервер = авторитет; клиент только отображает + экстраполирует.
//
//  Параметры цикла:
//    • полные сутки = 4 реальных часа
//    • день = 3 ч, ночь = 1 ч (wall-clock 75% / 25%)
//  Игровые часы 0..24: 0=полночь, 6=восход, 12=полдень, 18=закат, 22=ночь.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.WorldTime = api; root.WORLD_TIME = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /** Полный цикл day+night, реальных секунд (~4h). */
  var DAY_LENGTH_SEC = 4 * 3600; // 14400

  /**
   * Доля wall-clock на «день» (игровые 6:00–22:00).
   * 0.75 → 3 ч день / 1 ч ночь при DAY_LENGTH_SEC=4h.
   */
  var DAY_REAL_FRAC = 0.75;

  /** Игровые границы: день 6:00–22:00, ночь 22:00–6:00 */
  var DAY_START_HOUR = 6;
  var NIGHT_START_HOUR = 22;

  var SYNC_INTERVAL_MS = 1000;

  // --- helpers ---
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  /** Игровой час [0,24) → доля суток [0,1) линейно */
  function hourToTod(h) {
    var hh = ((Number(h) % 24) + 24) % 24;
    return hh / 24;
  }

  function todToHour(tod) {
    return (((Number(tod) % 1) + 1) % 1) * 24;
  }

  /**
   * Игровой час → доля wall-clock [0,1) с асимметрией день/ночь.
   * День (6→22, 16h game) занимает DAY_REAL_FRAC real.
   * Ночь (22→6, 8h game) занимает 1-DAY_REAL_FRAC real.
   */
  function gameHourToRealFrac(h) {
    var hh = ((Number(h) % 24) + 24) % 24;
    var dayH = (NIGHT_START_HOUR - DAY_START_HOUR + 24) % 24; // 16
    var nightH = 24 - dayH; // 8
    if (hh >= DAY_START_HOUR && hh < NIGHT_START_HOUR) {
      // day segment
      var u = (hh - DAY_START_HOUR) / dayH; // 0..1 within day
      return u * DAY_REAL_FRAC;
    }
    // night: 22..24 then 0..6
    var nh = hh >= NIGHT_START_HOUR ? (hh - NIGHT_START_HOUR) : (hh + (24 - NIGHT_START_HOUR));
    var v = nh / nightH; // 0..1 within night
    return DAY_REAL_FRAC + v * (1 - DAY_REAL_FRAC);
  }

  /** wall-clock frac [0,1) → игровой час [0,24) */
  function realFracToGameHour(f) {
    f = ((Number(f) % 1) + 1) % 1;
    var dayH = (NIGHT_START_HOUR - DAY_START_HOUR + 24) % 24;
    var nightH = 24 - dayH;
    if (f < DAY_REAL_FRAC) {
      var u = f / DAY_REAL_FRAC;
      return DAY_START_HOUR + u * dayH;
    }
    var v = (f - DAY_REAL_FRAC) / (1 - DAY_REAL_FRAC);
    var nh = v * nightH;
    var h = NIGHT_START_HOUR + nh;
    if (h >= 24) h -= 24;
    return h;
  }

  /** Игровой tod [0,1) (линейный час/24) → wall frac */
  function todToRealFrac(tod) {
    return gameHourToRealFrac(todToHour(tod));
  }

  /** wall frac → игровой tod [0,1) */
  function realFracToTod(f) {
    return realFracToGameHour(f) / 24;
  }

  /**
   * Сдвиг wall-clock на dtSec, вернуть новый игровой tod.
   * realFrac — внутренняя доля цикла [0,1).
   */
  function advanceRealFrac(realFrac, dtSec, dayLengthSec) {
    var L = dayLengthSec || DAY_LENGTH_SEC;
    var f = ((Number(realFrac) % 1) + 1) % 1;
    f = (f + Math.max(0, dtSec) / L) % 1;
    return f;
  }

  /**
   * Фаза (та же шкала sinElev, что daynight/visual):
   * day / golden / twilight / night
   */
  function phaseOfTod(tod) {
    var sinElev = Math.sin((tod - 0.25) * Math.PI * 2);
    if (sinElev > 0.25) return 'day';
    if (sinElev > 0.0) return 'golden';
    if (sinElev > -0.10) return 'twilight';
    return 'night';
  }

  /** isNight: игровые часы в [22, 24) U [0, 6) */
  function isNightHour(h) {
    var hh = ((Number(h) % 24) + 24) % 24;
    return hh >= NIGHT_START_HOUR || hh < DAY_START_HOUR;
  }

  function isNightTod(tod) {
    return isNightHour(todToHour(tod));
  }

  function formatHour(h) {
    var hh = Math.floor(((Number(h) % 24) + 24) % 24);
    var mm = Math.floor((((Number(h) % 24) + 24) % 24 - hh) * 60);
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  return {
    DAY_LENGTH_SEC: DAY_LENGTH_SEC,
    DAY_REAL_FRAC: DAY_REAL_FRAC,
    DAY_START_HOUR: DAY_START_HOUR,
    NIGHT_START_HOUR: NIGHT_START_HOUR,
    SYNC_INTERVAL_MS: SYNC_INTERVAL_MS,
    hourToTod: hourToTod,
    todToHour: todToHour,
    gameHourToRealFrac: gameHourToRealFrac,
    realFracToGameHour: realFracToGameHour,
    todToRealFrac: todToRealFrac,
    realFracToTod: realFracToTod,
    advanceRealFrac: advanceRealFrac,
    phaseOfTod: phaseOfTod,
    isNightHour: isNightHour,
    isNightTod: isNightTod,
    formatHour: formatHour
  };
});
