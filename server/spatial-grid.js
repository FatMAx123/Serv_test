// ============================================================
//  SERVER / SPATIAL-GRID.JS — 2D Spatial Hash Grid для AOI & LoS
//
//  Оптимизация Риска 2 MMORPG аудита:
//  - Заменяет глобальный перебор O(P^2 + P*M) на локальный O(K)
//  - Размер клетки = AOI_LEAVE_RADIUS (108 м)
//  - При радиусе 108 м опрашиваются не более 3x3 = 9 ячеек
//  - Ключи ячеек упакованы в 32-битные целые (Zero-GC, без строк)
//  - Пул ячеек переиспользует массивы (length = 0) без сброса памяти
//  - Адаптивное суб-дробление (Adaptive Sub-Grid): при 100+ сущностях в ячейке
//    активируется 4x4 сетка суб-ячеек (27м), снижая перебор при ближнем бое в 10+ раз
// ============================================================
'use strict';

class SpatialGrid {
  /**
   * @param {number} cellSize Размер стороны клетки в метрах (по умолчанию 108)
   * @param {number} [subdivideThreshold=100] Порог сущностей для динамического дробления ячейки
   * @param {number} [subDivisions=4] Количество суб-делений по каждой оси (4x4 = 16 суб-ячеек)
   */
  constructor(cellSize = 108, subdivideThreshold = 100, subDivisions = 4) {
    this.cellSize = cellSize > 0 ? cellSize : 108;
    this.subdivideThreshold = subdivideThreshold > 0 ? subdivideThreshold : 100;
    this.subDivisions = subDivisions >= 2 ? subDivisions : 4;
    this.subCellSize = this.cellSize / this.subDivisions;
    this.cells = new Map(); // key (int32) -> Cell
    this.activeKeys = [];   // Список ключей ячеек, задействованных в текущем тике
    this.tickCount = 0;
  }

  get size() {
    return this.cells.size;
  }

  /**
   * Упаковка координат ячейки (cx, cz) в 32-битное целое число.
   * Диапазон мира: [-32000..+32000] м -> сдвиг 32768.
   */
  _key(cx, cz) {
    return (((cx + 32768) & 0xFFFF) << 16) | ((cz + 32768) & 0xFFFF);
  }

  /**
   * Быстрая очистка сетки между тиками без аллокаций памяти (Zero-GC).
   */
  clear() {
    for (let i = 0; i < this.activeKeys.length; i++) {
      const cell = this.cells.get(this.activeKeys[i]);
      if (cell) {
        cell.players.length = 0;
        cell.mobs.length = 0;
        if (cell.isSubdivided) {
          cell.isSubdivided = false;
          const subs = cell.subCells;
          for (let s = 0; s < subs.length; s++) {
            subs[s].players.length = 0;
            subs[s].mobs.length = 0;
          }
        }
      }
    }
    this.activeKeys.length = 0;
    this.tickCount++;
    if (this.tickCount % 6000 === 0 || this.cells.size > 2048) {
      this.prune(300000);
    }
  }

  /**
   * Эвикция неактивных ячеек сетки (PERF-GRID-01).
   * Удаляет из памяти пустые ячейки, не использовавшиеся более maxIdleMs (по умолчанию 10 минут).
   * @param {number} [maxIdleMs=600000] Время неактивности в мс
   * @returns {number} Количество удаленных ячеек
   */
  prune(maxIdleMs = 600000) {
    const now = Date.now();
    let pruned = 0;
    for (const [k, cell] of this.cells.entries()) {
      if (cell.players.length === 0 && cell.mobs.length === 0) {
        if ((now - (cell.lastActiveAt || 0)) >= maxIdleMs) {
          this.cells.delete(k);
          pruned++;
        }
      }
    }
    return pruned;
  }

  _createCell(cx, cz) {
    const subCells = [];
    const count = this.subDivisions * this.subDivisions;
    for (let i = 0; i < count; i++) {
      subCells.push({ players: [], mobs: [] });
    }
    return {
      cx,
      cz,
      players: [],
      mobs: [],
      isSubdivided: false,
      subCells,
      lastActiveAt: Date.now()
    };
  }

  _getOrCreate(cx, cz) {
    const k = this._key(cx, cz);
    let cell = this.cells.get(k);
    if (!cell) {
      cell = this._createCell(cx, cz);
      this.cells.set(k, cell);
    }
    cell.lastActiveAt = Date.now();
    if (cell.players.length === 0 && cell.mobs.length === 0 && !cell.isSubdivided) {
      this.activeKeys.push(k);
    }
    return cell;
  }

  /**
   * Вычисление индекса суб-ячейки внутри макро-ячейки.
   */
  _subIndex(x, z, cx, cz) {
    const scx = Math.max(0, Math.min(this.subDivisions - 1, Math.floor((x - cx * this.cellSize) / this.subCellSize)));
    const scz = Math.max(0, Math.min(this.subDivisions - 1, Math.floor((z - cz * this.cellSize) / this.subCellSize)));
    return scz * this.subDivisions + scx;
  }

  /**
   * Активация режима суб-дробления при превышении порога плотности.
   */
  _subdivide(cell) {
    cell.isSubdivided = true;
    const pls = cell.players;
    for (let i = 0; i < pls.length; i++) {
      const p = pls[i];
      const idx = this._subIndex(p.x, p.z, cell.cx, cell.cz);
      cell.subCells[idx].players.push(p);
    }
    pls.length = 0;

    const mbs = cell.mobs;
    for (let i = 0; i < mbs.length; i++) {
      const m = mbs[i];
      const idx = this._subIndex(m.x, m.z, cell.cx, cell.cz);
      cell.subCells[idx].mobs.push(m);
    }
    mbs.length = 0;
  }

  /**
   * Добавить игрока в ячейку сетки.
   */
  insertPlayer(p) {
    if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') return;
    const cx = Math.floor(p.x / this.cellSize);
    const cz = Math.floor(p.z / this.cellSize);
    const cell = this._getOrCreate(cx, cz);

    if (cell.isSubdivided) {
      const idx = this._subIndex(p.x, p.z, cx, cz);
      cell.subCells[idx].players.push(p);
    } else {
      cell.players.push(p);
      if (cell.players.length + cell.mobs.length >= this.subdivideThreshold) {
        this._subdivide(cell);
      }
    }
  }

  /**
   * Добавить моба в ячейку сетки.
   */
  insertMob(m) {
    if (!m || typeof m.x !== 'number' || typeof m.z !== 'number' || m.hp <= 0) return;
    const cx = Math.floor(m.x / this.cellSize);
    const cz = Math.floor(m.z / this.cellSize);
    const cell = this._getOrCreate(cx, cz);

    if (cell.isSubdivided) {
      const idx = this._subIndex(m.x, m.z, cx, cz);
      cell.subCells[idx].mobs.push(m);
    } else {
      cell.mobs.push(m);
      if (cell.players.length + cell.mobs.length >= this.subdivideThreshold) {
        this._subdivide(cell);
      }
    }
  }

  /**
   * Обход всех сущностей в окрестности (x, z) радиуса radius через колбэки (без аллокаций массивов).
   * @param {number} x Координата центра X
   * @param {number} z Координата центра Z
   * @param {number} radius Радиус выборки (по умолчанию cellSize = 108)
   * @param {((p: object) => void)|null} onPlayer Колбэк для каждого найденного игрока
   * @param {((m: object) => void)|null} onMob Колбэк для каждого найденного моба
   */
  forEachCandidate(x, z, radius, onPlayer, onMob) {
    const r = radius > 0 ? radius : this.cellSize;
    const minCx = Math.floor((x - r) / this.cellSize);
    const maxCx = Math.floor((x + r) / this.cellSize);
    const minCz = Math.floor((z - r) / this.cellSize);
    const maxCz = Math.floor((z + r) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const cell = this.cells.get(this._key(cx, cz));
        if (!cell) continue;

        if (!cell.isSubdivided) {
          // Обычная ячейка
          if (onPlayer && cell.players.length > 0) {
            const pls = cell.players;
            for (let i = 0; i < pls.length; i++) {
              if (onPlayer(pls[i]) === false) return;
            }
          }
          if (onMob && cell.mobs.length > 0) {
            const mbs = cell.mobs;
            for (let i = 0; i < mbs.length; i++) {
              if (onMob(mbs[i]) === false) return;
            }
          }
        } else {
          // Раздробленная ячейка: проверяем только релевантные суб-ячейки
          if (r < this.cellSize) {
            const cellMinX = cx * this.cellSize;
            const cellMinZ = cz * this.cellSize;

            const boxMinX = Math.max(x - r, cellMinX);
            const boxMaxX = Math.min(x + r, cellMinX + this.cellSize);
            const boxMinZ = Math.max(z - r, cellMinZ);
            const boxMaxZ = Math.min(z + r, cellMinZ + this.cellSize);

            if (boxMinX <= boxMaxX && boxMinZ <= boxMaxZ) {
              const minScx = Math.max(0, Math.min(this.subDivisions - 1, Math.floor((boxMinX - cellMinX) / this.subCellSize)));
              const maxScx = Math.max(0, Math.min(this.subDivisions - 1, Math.floor((boxMaxX - cellMinX) / this.subCellSize)));
              const minScz = Math.max(0, Math.min(this.subDivisions - 1, Math.floor((boxMinZ - cellMinZ) / this.subCellSize)));
              const maxScz = Math.max(0, Math.min(this.subDivisions - 1, Math.floor((boxMaxZ - cellMinZ) / this.subCellSize)));

              for (let scz = minScz; scz <= maxScz; scz++) {
                const row = scz * this.subDivisions;
                for (let scx = minScx; scx <= maxScx; scx++) {
                  const sub = cell.subCells[row + scx];
                  if (onPlayer && sub.players.length > 0) {
                    const pls = sub.players;
                    for (let i = 0; i < pls.length; i++) {
                      if (onPlayer(pls[i]) === false) return;
                    }
                  }
                  if (onMob && sub.mobs.length > 0) {
                    const mbs = sub.mobs;
                    for (let i = 0; i < mbs.length; i++) {
                      if (onMob(mbs[i]) === false) return;
                    }
                  }
                }
              }
            }
          } else {
            // Радиус больше размера ячейки — обходим все суб-ячейки
            const subs = cell.subCells;
            for (let s = 0; s < subs.length; s++) {
              const sub = subs[s];
              if (onPlayer && sub.players.length > 0) {
                const pls = sub.players;
                for (let i = 0; i < pls.length; i++) {
                  if (onPlayer(pls[i]) === false) return;
                }
              }
              if (onMob && sub.mobs.length > 0) {
                const mbs = sub.mobs;
                for (let i = 0; i < mbs.length; i++) {
                  if (onMob(mbs[i]) === false) return;
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Сверхбыстрая проверка наличия живых игроков в радиусе (Zero-GC, без аллокаций замыканий).
   * Используется в tickMobs для мгновенного определения необходимости пробуждения моба.
   * @param {number} x Координата центра X
   * @param {number} z Координата центра Z
   * @param {number} radius Радиус выборки
   * @param {number} [r2] Квадрат радиуса (если передан, используется напрямую без повторного умножения)
   * @returns {boolean} true, если рядом есть хотя бы один живой игрок
   */
  hasPlayerNear(x, z, radius, r2, includeDead = false) {
    const r = radius > 0 ? radius : this.cellSize;
    const maxDist2 = r2 != null ? r2 : (r * r);
    const minCx = Math.floor((x - r) / this.cellSize);
    const maxCx = Math.floor((x + r) / this.cellSize);
    const minCz = Math.floor((z - r) / this.cellSize);
    const maxCz = Math.floor((z + r) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const cell = this.cells.get(this._key(cx, cz));
        if (!cell) continue;

        if (!cell.isSubdivided) {
          const pls = cell.players;
          const len = pls.length;
          for (let i = 0; i < len; i++) {
            const p = pls[i];
            if (!p || (!includeDead && (p.dead || (p.hp != null && p.hp <= 0)))) continue;
            const dx = p.x - x;
            const dz = p.z - z;
            if ((dx * dx + dz * dz) <= maxDist2) return true;
          }
        } else {
          const subs = cell.subCells;
          for (let s = 0; s < subs.length; s++) {
            const pls = subs[s].players;
            const len = pls.length;
            for (let i = 0; i < len; i++) {
              const p = pls[i];
              if (!p || (!includeDead && (p.dead || (p.hp != null && p.hp <= 0)))) continue;
              const dx = p.x - x;
              const dz = p.z - z;
              if ((dx * dx + dz * dz) <= maxDist2) return true;
            }
          }
        }
      }
    }
    return false;
  }

  /**
   * Возвращает списки сущностей в окрестности (x, z) радиуса radius.
   * @returns {{players: Array, mobs: Array}}
   */
  queryNearby(x, z, radius) {
    const players = [];
    const mobs = [];
    this.forEachCandidate(
      x, z, radius,
      p => players.push(p),
      m => mobs.push(m)
    );
    return { players, mobs };
  }
}

module.exports = {
  SpatialGrid
};
