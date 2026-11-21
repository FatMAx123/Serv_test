// ============================================
// PROJECT STEAM: ORIGINS — MAP-RENDERER.JS
// Карта в духе классических MMO:
//   • Radar — круглый, +/−, стрелка, зона, coords, edge-pins
//   • World Map [M] — pan/zoom, scale bar, waypoint-флаг
//   • Иконки NPC (quest/shop/guard/tp/...)
// ============================================
class MapRenderer {
  constructor() {
    this.isOpen = false;
    const bounds = (typeof WORLD_BOUNDS !== 'undefined')
      ? WORLD_BOUNDS
      : (window.WorldMetrics
        ? window.WorldMetrics.worldBounds()
        : { minX: -2150, maxX: 2150, minZ: -2240, maxZ: 2240 });
    this.worldBounds = bounds;
    this.worldSizeX = bounds.maxX - bounds.minX;
    this.worldSizeZ = bounds.maxZ - bounds.minZ;
    this.worldSize = this.worldSizeX;

    // L2 radar zoom (half-range, world units)
    this.radarZooms = [40, 70, 110, 170, 260, 400];
    this.radarZoomIdx = 2;
    this.radarViewRange = this.radarZooms[this.radarZoomIdx];

    // World map view — canvas aspect = art aspect (без растягивания острова)
    // Реф-арт ~1104×928; мир 4300×4480 другой AR → маркеры по UV (0..1), не по метрам X/Z 1:1
    this.artAspect = 1104 / 928;
    this.CW = 900;
    this.CH = Math.max(400, Math.round(this.CW / this.artAspect));
    this.mapZoom = 1.0;
    // pan в UV-пространстве арта (0.5 = центр острова)
    this.mapPanU = 0.5;
    this.mapPanV = 0.5;
    // legacy world pan (для locatePlayer → UV)
    this.mapPanX = 0;
    this.mapPanZ = 0;
    this.mapDrawRect = { x: 0, y: 0, w: this.CW, h: this.CH };
    this._dragging = false;
    this._dragLast = null;
    this._dragMoved = false;
    this._cursorWorld = null;

    // L2 waypoint flag (right-click / Alt+LMB on map)
    this.waypoint = null; // { x, z } | null

    // UV-калибровка map_world.webp ↔ мир (scale=1, только сдвиг).
    // Тихая заводь u≈0.284 v≈0.792: raw на траве у домов, дорога к мосту восточнее/южнее.
    // ou>0 / ov>0 → маркер на грунтовой дороге перед мостом.
    this.mapUvOffsetU = 0.018;
    this.mapUvOffsetV = 0.012;
    this.mapUvScaleU = 1.0;
    this.mapUvScaleV = 1.0;

    this.islandArt = null;
    this.terrainArt = null;
    this._loadIslandArt();

    this.createBigMap();
    this.createRadarChrome();
    this.injectStyles();
    this.bindEvents();
    this._installCalMap();
  }

  /** Live: calMap(ou, ov) / calMap() — подогнать арт под мир. */
  _installCalMap() {
    const self = this;
    window.calMap = function (ou, ov, su, sv) {
      if (arguments.length === 0) {
        const cur = { ou: self.mapUvOffsetU, ov: self.mapUvOffsetV, su: self.mapUvScaleU, sv: self.mapUvScaleV };
        console.log('[calMap]', cur);
        return cur;
      }
      if (ou != null && isFinite(ou)) self.mapUvOffsetU = Number(ou);
      if (ov != null && isFinite(ov)) self.mapUvOffsetV = Number(ov);
      if (su != null && isFinite(su)) self.mapUvScaleU = Number(su);
      if (sv != null && isFinite(sv)) self.mapUvScaleV = Number(sv);
      if (self.isOpen) self.drawBigMap();
      console.log('[calMap] set', self.mapUvOffsetU, self.mapUvOffsetV, self.mapUvScaleU, self.mapUvScaleV);
      return { ou: self.mapUvOffsetU, ov: self.mapUvOffsetV, su: self.mapUvScaleU, sv: self.mapUvScaleV };
    };
    window.mapRenderer = this;
  }

  // ---------- assets ----------
  _loadIslandArt() {
    const tryLoad = (paths, onOk) => {
      let i = 0;
      const next = () => {
        if (i >= paths.length) return;
        const img = new Image();
        img.onload = () => onOk(img);
        img.onerror = () => { i++; next(); };
        img.src = paths[i++];
      };
      next();
    };
    // Канон: client/data/textures/ (не assets/)
    const WORLD_MAP = (window.texUrl
      ? window.texUrl(['map_world.webp', 'Map.webp', 'Map1.webp'])
      : [
        'data/textures/map_world.webp',
        'client/data/textures/map_world.webp',
        'data/textures/Map.webp',
        'client/data/textures/Map.webp'
      ]);
    tryLoad(
      WORLD_MAP,
      (img) => {
        this.islandArt = img;
        this.terrainArt = img; // радар и M-карта — одна карта, UV = мир
        this._applyArtAspect(img.naturalWidth, img.naturalHeight);
        if (this.isOpen) this.drawBigMap();
        console.log('[Map] world map loaded', img.naturalWidth + '×' + img.naturalHeight, img.src.split('/').pop());
      }
    );
  }

  /** Подогнать canvas под native aspect арта — остров не растягивается. */
  _applyArtAspect(aw, ah) {
    if (!aw || !ah) return;
    this.artAspect = aw / ah;
    const newCH = Math.max(400, Math.round(this.CW / this.artAspect));
    if (Math.abs(newCH - this.CH) < 2 && this.canvas && this.canvas.width === this.CW) return;
    this.CH = newCH;
    if (this.canvas) {
      this.canvas.width = this.CW;
      this.canvas.height = this.CH;
    }
    this.mapDrawRect = { x: 0, y: 0, w: this.CW, h: this.CH };
  }

  /** Подтянуть bounds из WorldMetrics (после Terrain.applyBounds). */
  syncBounds() {
    const b = (window.WorldMetrics && window.WorldMetrics.worldBounds)
      ? window.WorldMetrics.worldBounds()
      : (typeof WORLD_BOUNDS !== 'undefined' ? WORLD_BOUNDS : null);
    if (!b) return;
    const minX = b.minX != null ? b.minX : b.MIN_X;
    const maxX = b.maxX != null ? b.maxX : b.MAX_X;
    const minZ = b.minZ != null ? b.minZ : b.MIN_Z;
    const maxZ = b.maxZ != null ? b.maxZ : b.MAX_Z;
    if (minX == null || maxX == null) return;
    this.worldBounds = { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
    this.worldSizeX = maxX - minX;
    this.worldSizeZ = maxZ - minZ;
    this.worldSize = this.worldSizeX;
    // освежить hunt zones / roads если редактор менял
    if (window.WorldMetrics) {
      if (window.WorldMetrics.buildHuntZones) {
        window.MAP_HUNT_ZONES = window.WorldMetrics.buildHuntZones();
      }
      if (window.WorldMetrics.buildRoads) {
        window.MAP_ROADS = window.WorldMetrics.buildRoads();
      }
      if (window.WorldMetrics.buildRivers) {
        window.MAP_RIVERS = window.WorldMetrics.buildRivers();
      }
      if (window.WorldMetrics.buildRegions) {
        window.MAP_REGIONS = window.WorldMetrics.buildRegions();
      }
    }
  }

  /**
   * World → UV карты.
   * Калибровка: если арт чуть съехал относительно FBX-мира — mapUvOffset/Scale.
   */
  worldToUV(x, z) {
    let u = (x - this.worldBounds.minX) / this.worldSizeX;
    let v = (z - this.worldBounds.minZ) / this.worldSizeZ;
    // лёгкая калибровка под hunt-zones / арт (подогнано под island art)
    const ou = this.mapUvOffsetU || 0;
    const ov = this.mapUvOffsetV || 0;
    const su = this.mapUvScaleU != null ? this.mapUvScaleU : 1;
    const sv = this.mapUvScaleV != null ? this.mapUvScaleV : 1;
    u = 0.5 + (u - 0.5 + ou) * su;
    v = 0.5 + (v - 0.5 + ov) * sv;
    return { u: u, v: v };
  }
  uvToWorld(u, v) {
    const ou = this.mapUvOffsetU || 0;
    const ov = this.mapUvOffsetV || 0;
    const su = this.mapUvScaleU != null ? this.mapUvScaleU : 1;
    const sv = this.mapUvScaleV != null ? this.mapUvScaleV : 1;
    // inverse of worldToUV
    let uu = 0.5 + (u - 0.5) / (su || 1) - ou;
    let vv = 0.5 + (v - 0.5) / (sv || 1) - ov;
    return {
      x: this.worldBounds.minX + uu * this.worldSizeX,
      z: this.worldBounds.minZ + vv * this.worldSizeZ
    };
  }

  /** Видимый UV-прямоугольник (квадрат в UV → crop арта без stretch). */
  visibleUVRect() {
    const half = 0.5 / this.mapZoom;
    let u0 = this.mapPanU - half;
    let v0 = this.mapPanV - half;
    let u1 = this.mapPanU + half;
    let v1 = this.mapPanV + half;
    // clamp к [0,1], сохраняя span
    const span = u1 - u0;
    if (u0 < 0) { u0 = 0; u1 = span; }
    if (v0 < 0) { v0 = 0; v1 = span; }
    if (u1 > 1) { u1 = 1; u0 = 1 - span; }
    if (v1 > 1) { v1 = 1; v0 = 1 - span; }
    u0 = Math.max(0, u0); v0 = Math.max(0, v0);
    u1 = Math.min(1, u1); v1 = Math.min(1, v1);
    return { u0, v0, u1, v1 };
  }

  // ---------- HUD radar chrome ----------
  createRadarChrome() {
    const host = document.getElementById('minimap');
    if (!host) return;
    host.innerHTML = `
      <div class="l2-radar-frame" id="l2-radar-frame">
        <div class="l2-radar-title" id="radar-title-bar">
          <span class="l2-radar-drag-handle" title="Потяните, чтобы переместить радар">⋮⋮</span>
          <span class="l2-radar-zone-txt" id="radar-zone-name">Остров Стали</span>
          <button type="button" class="l2-radar-min-btn" id="radar-toggle-min" title="Свернуть / Развернуть радар">−</button>
        </div>
        <div class="l2-radar-body" id="radar-body-wrap">
          <canvas id="minimap-canvas" width="168" height="168"></canvas>
          <div class="l2-radar-ring"></div>
          <div class="l2-radar-n">N</div>
        </div>
        <div class="l2-radar-footer" id="radar-footer-wrap">
          <button type="button" class="l2-radar-btn" id="radar-zoom-out" title="Отдалить">−</button>
          <span class="l2-radar-coords" id="radar-coords">0, 0</span>
          <button type="button" class="l2-radar-btn" id="radar-zoom-in" title="Приблизить">+</button>
        </div>
        <div class="l2-radar-wp" id="radar-wp-row" style="display:none">
          <span id="radar-wp-dist">⚑ —</span>
          <button type="button" class="l2-radar-btn l2-radar-btn-sm" id="radar-wp-clear" title="Снять флаг">✕</button>
        </div>
      </div>
    `;
    if (window.game && window.game.ui) {
      window.game.ui.minimapCanvas = document.getElementById('minimap-canvas');
    }
    const minBtn = document.getElementById('radar-toggle-min');
    const zin = document.getElementById('radar-zoom-in');
    const zout = document.getElementById('radar-zoom-out');
    const wpc = document.getElementById('radar-wp-clear');
    const titleBar = document.getElementById('radar-title-bar');
    const minimapCanvas = document.getElementById('minimap-canvas');

    let lastToggleTime = 0;
    const handleMinToggle = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const now = Date.now();
      if (now - lastToggleTime < 300) return;
      lastToggleTime = now;
      this.toggleMinimize();
    };

    if (minBtn) {
      minBtn.addEventListener('click', handleMinToggle);
      minBtn.addEventListener('touchend', handleMinToggle);
    }

    if (zin) {
      zin.addEventListener('click', (e) => { e.stopPropagation(); this.radarZoomIn(); });
    }

    if (zout) {
      zout.addEventListener('click', (e) => { e.stopPropagation(); this.radarZoomOut(); });
    }

    if (wpc) {
      wpc.addEventListener('click', (e) => { e.stopPropagation(); this.clearWaypoint(); });
    }

    if (titleBar) {
      titleBar.addEventListener('click', (e) => {
        if (e.target.closest('.l2-radar-min-btn, .l2-radar-btn')) return;
        const frame = document.getElementById('l2-radar-frame');
        if (frame && frame.classList.contains('minimized')) {
          this.toggleMinimize(false);
        } else {
          this.open();
        }
      });
    }

    if (minimapCanvas) {
      minimapCanvas.addEventListener('click', (e) => {
        e.stopPropagation();
        this.open();
      });
      minimapCanvas.addEventListener('touchend', (e) => {
        e.stopPropagation();
        this.open();
      });
    }

    host.removeAttribute('title');

    // Default to EXPANDED radar on load (clear stale minimized state)
    const frame = document.getElementById('l2-radar-frame');
    if (frame) {
      frame.classList.remove('minimized');
      if (minBtn) minBtn.textContent = '−';
    }
  }

  toggleMinimize(forceState) {
    const frame = document.getElementById('l2-radar-frame');
    if (!frame) return;
    let isMin;
    if (typeof forceState === 'boolean') {
      if (forceState) frame.classList.add('minimized');
      else frame.classList.remove('minimized');
      isMin = forceState;
    } else {
      isMin = frame.classList.toggle('minimized');
    }
    const minBtn = document.getElementById('radar-toggle-min');
    if (minBtn) minBtn.textContent = isMin ? '+' : '−';
    try {
      localStorage.setItem('ps_radar_min', isMin ? '1' : '0');
    } catch (e) {}
  }

  radarZoomIn() {
    if (this.radarZoomIdx <= 0) return;
    this.radarZoomIdx--;
    this.radarViewRange = this.radarZooms[this.radarZoomIdx];
  }
  radarZoomOut() {
    if (this.radarZoomIdx >= this.radarZooms.length - 1) return;
    this.radarZoomIdx++;
    this.radarViewRange = this.radarZooms[this.radarZoomIdx];
  }

  setWaypoint(x, z) {
    this.waypoint = { x, z };
    this._updateWaypointHud();
    if (window.game && game.addChatMessage) {
      game.addChatMessage(
        'Флаг: X ' + Math.round(x) + ', Y ' + Math.round(z) + ' · ПКМ/кнопка — снять',
        'system'
      );
    }
    if (this.isOpen) this.drawBigMap();
  }
  clearWaypoint() {
    this.waypoint = null;
    this._updateWaypointHud();
    if (this.isOpen) this.drawBigMap();
  }
  _updateWaypointHud() {
    const row = document.getElementById('radar-wp-row');
    const distEl = document.getElementById('radar-wp-dist');
    if (!row) return;
    if (!this.waypoint) {
      row.style.display = 'none';
      return;
    }
    row.style.display = 'flex';
    if (distEl && window.game && game.player && game.player.mesh) {
      const p = game.player.mesh.position;
      const d = Math.hypot(this.waypoint.x - p.x, this.waypoint.z - p.z);
      distEl.textContent = '⚑ ' + Math.round(d) + ' м';
    } else if (distEl) {
      distEl.textContent = '⚑ флаг';
    }
  }

  // ---------- World Map UI ----------
  createBigMap() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'big-map-overlay';
    this.overlay.innerHTML = `
      <div class="l2-map-window">
        <div class="l2-map-titlebar">
          <div class="l2-map-ornament left"></div>
          <h2 id="bigmap-title">ОСТРОВ СТАЛИ</h2>
          <div class="l2-map-ornament right"></div>
          <button id="bigmap-close" class="l2-map-close">✕</button>
        </div>
        <div class="l2-map-toolbar">
          <button type="button" id="bigmap-zoom-out" class="l2-tool-btn">−</button>
          <button type="button" id="bigmap-zoom-in" class="l2-tool-btn">+</button>
          <button type="button" id="bigmap-reset" class="l2-tool-btn">Весь остров</button>
          <button type="button" id="bigmap-locate" class="l2-tool-btn">◎ Найти меня</button>
          <button type="button" id="bigmap-clear-wp" class="l2-tool-btn">Снять флаг</button>
          <span class="l2-map-hint">ЛКМ — drag · ПКМ / Alt+ЛКМ — флаг · колёсико — зум</span>
          <span class="l2-map-cursor" id="bigmap-cursor">—</span>
        </div>
        <div class="l2-map-canvas-wrap">
          <canvas id="bigmap-canvas"></canvas>
        </div>
        <div class="l2-map-legend">
          <span class="lg-you">▲ Вы</span>
          <span class="lg-party">● Партия</span>
          <span class="lg-quest">? Квест</span>
          <span class="lg-shop">$ Торговец</span>
          <span class="lg-guard">▲ Страж</span>
          <span class="lg-tp">◎ Телепорт</span>
          <span class="lg-mob">● Мобы</span>
          <span class="lg-wp">⚑ Флаг</span>
          <span class="lg-boss">● RB</span>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);
    this.canvas = document.getElementById('bigmap-canvas');
    this.canvas.width = this.CW;
    this.canvas.height = this.CH;
    this.ctx = this.canvas.getContext('2d');
  }

  injectStyles() {
    if (document.getElementById('l2-map-styles')) return;
    const s = document.createElement('style');
    s.id = 'l2-map-styles';
    s.textContent = `
/* ===== L2 Circular Radar ===== */
#minimap {
  position: absolute;
  top: var(--hud-top, 8px);
  right: var(--hud-right, 8px);
  width: auto;
  height: auto;
  background: transparent;
  border: none;
  border-radius: 0;
  pointer-events: auto;
  z-index: 120;
}
.l2-radar-frame {
  width: var(--radar-frame-width, 196px);
  max-width: calc(100vw - 16px);
  background: linear-gradient(160deg, #2a2218 0%, #1a1510 55%, #0e0c0a 100%);
  border: 2px solid #8a6a2a;
  box-shadow:
    0 0 0 1px #3a2a10,
    inset 0 0 0 1px #c9a24a44,
    0 6px 18px rgba(0,0,0,.65);
  padding: clamp(3px, 0.6vh, 5px) clamp(5px, 0.8vw, 8px) clamp(4px, 0.8vh, 7px);
  font-family: 'Georgia', 'Times New Roman', serif;
  user-select: none;
  box-sizing: border-box;
}
.l2-radar-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  color: #e8c86a;
  font-size: clamp(9px, 1.05vw, 11px);
  letter-spacing: .4px;
  text-shadow: 0 1px 2px #000;
  padding: 1px 0 clamp(2px, 0.4vh, 4px);
  border-bottom: 1px solid #5a4420;
  margin-bottom: clamp(3px, 0.6vh, 6px);
  cursor: grab;
  user-select: none;
}
.l2-radar-title:active { cursor: grabbing; }
.l2-radar-drag-handle {
  color: #c8b070;
  font-size: 10px;
  letter-spacing: -2px;
  opacity: 0.6;
  padding: 0 2px;
}
.l2-radar-zone-txt {
  flex: 1;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.l2-radar-min-btn {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid #5a4420;
  border-radius: 2px;
  color: #f0d080;
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
  padding: 1px 4px;
  cursor: pointer;
}
.l2-radar-min-btn:hover {
  border-color: #c8a040;
  color: #fff;
  background: rgba(80, 60, 20, 0.5);
}
.l2-radar-frame.minimized .l2-radar-body,
.l2-radar-frame.minimized .l2-radar-footer,
.l2-radar-frame.minimized .l2-radar-wp {
  display: none !important;
}
.l2-radar-frame.minimized {
  width: auto !important;
  min-width: 120px;
  padding: 3px 6px;
}
.l2-radar-frame.minimized .l2-radar-title {
  border-bottom: none;
  margin-bottom: 0;
  padding: 0;
}
.l2-radar-body {
  position: relative;
  width: var(--radar-size, 168px);
  height: var(--radar-size, 168px);
  margin: 0 auto;
  border-radius: 50%;
  overflow: hidden;
  background: #0a0c10;
  box-shadow:
    0 0 0 2px #6a5428,
    0 0 0 4px #2a1e0c,
    inset 0 0 16px rgba(0,0,0,.75);
}
#minimap-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: pointer;
  border-radius: 50%;
}
.l2-radar-ring {
  pointer-events: none;
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow:
    inset 0 0 0 2px rgba(201,162,74,.55),
    inset 0 0 18px rgba(0,0,0,.45);
}
.l2-radar-n {
  position: absolute;
  top: clamp(2px, 0.5vh, 6px);
  left: 50%;
  transform: translateX(-50%);
  color: #ffdd88;
  font-size: clamp(8.5px, 1vw, 10px);
  font-weight: bold;
  text-shadow: 0 0 3px #000, 0 1px 2px #000;
  pointer-events: none;
  z-index: 2;
}
.l2-radar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: clamp(3px, 0.6vh, 6px);
  gap: 3px;
}
.l2-radar-wp {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
  gap: 3px;
  color: #ff8866;
  font-size: clamp(8px, 0.9vw, 10px);
  font-family: 'Courier New', monospace;
}
.l2-radar-btn {
  width: clamp(18px, 2.2vw, 24px);
  height: clamp(16px, 2vh, 20px);
  background: linear-gradient(180deg, #4a3a1a, #2a1e0c);
  border: 1px solid #9a7a30;
  color: #f0d080;
  font-size: clamp(11px, 1.3vw, 14px);
  line-height: 1;
  cursor: pointer;
  border-radius: 2px;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.l2-radar-btn-sm {
  width: clamp(16px, 1.8vw, 20px);
  height: clamp(14px, 1.6vh, 18px);
  font-size: clamp(9px, 1vw, 11px);
}
.l2-radar-btn:hover { filter: brightness(1.25); }
.l2-radar-coords {
  flex: 1;
  text-align: center;
  color: #9ad0c0;
  font-size: clamp(8px, 0.9vw, 10px);
  font-family: 'Courier New', monospace;
  text-shadow: 0 1px 1px #000;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== L2 World Map window ===== */
#big-map-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.82);
  display: none; align-items: center; justify-content: center;
  z-index: 9999;
  font-family: 'Georgia', 'Times New Roman', serif;
  touch-action: none;
}
#big-map-overlay.open { display: flex !important; }
.l2-map-window {
  width: min(920px, 96vw);
  background: linear-gradient(180deg, #2c2418 0%, #1a1510 40%, #12100c 100%);
  border: 3px solid #9a7a32;
  box-shadow:
    0 0 0 1px #3a2a12,
    inset 0 0 0 1px #d4b06055,
    0 12px 40px rgba(0,0,0,.75);
  padding: 0 0 8px;
  border-radius: 2px;
}
.l2-map-titlebar {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px 8px;
  border-bottom: 1px solid #5a4420;
  background: linear-gradient(180deg, #3a2e1a, #241c12);
}
.l2-map-titlebar h2 {
  margin: 0; flex: 1; text-align: center;
  color: #f0d070; font-size: 18px; letter-spacing: 2px;
  font-weight: normal; text-shadow: 0 1px 3px #000;
}
.l2-map-ornament {
  width: 48px; height: 2px;
  background: linear-gradient(90deg, transparent, #c9a24a, transparent);
}
.l2-map-close {
  background: #3a2010; border: 1px solid #9a6a30;
  color: #f0d080; width: 28px; height: 28px;
  cursor: pointer; font-size: 14px; border-radius: 2px;
}
.l2-map-close:hover { background: #5a3020; }
.l2-map-toolbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding: 8px 12px; color: #aaa;
  border-bottom: 1px solid #3a3020;
}
.l2-tool-btn {
  background: linear-gradient(180deg, #4a3a1a, #2a1e0c);
  border: 1px solid #9a7a30; color: #f0d080;
  padding: 4px 10px; cursor: pointer; border-radius: 2px;
  font-family: inherit; font-size: 12px;
}
.l2-tool-btn:hover { filter: brightness(1.2); }
.l2-map-hint { color: #777; font-size: 11px; margin-left: 4px; }
.l2-map-cursor {
  margin-left: auto; color: #9ad0c0;
  font-family: 'Courier New', monospace; font-size: 11px;
}
.l2-map-canvas-wrap {
  margin: 8px 12px;
  border: 1px solid #6a5428;
  box-shadow: inset 0 0 20px rgba(0,0,0,.5);
  background: #0a1020;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}
#bigmap-canvas {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 70vh;
  /* aspect из intrinsic canvas — без width:100% (оно растягивало остров) */
  cursor: grab;
  background: #0d0d12;
}
#bigmap-canvas.dragging { cursor: grabbing; }
.l2-map-legend {
  display: flex; flex-wrap: wrap; gap: 12px;
  padding: 4px 14px 2px; font-size: 11px; color: #aaa;
}
.lg-you { color: #ffee55; } .lg-party { color: #44aaff; }
.lg-quest { color: #ffdd44; } .lg-shop { color: #ff9944; }
.lg-guard { color: #88aaff; } .lg-tp { color: #44ffff; }
.lg-mob { color: #ff5555; } .lg-wp { color: #ff6644; }
.lg-boss { color: #ff2200; }

@media (max-width: 768px) {
  .l2-radar-frame { width: 150px; }
  .l2-radar-body, #minimap-canvas { width: 120px; height: 120px; }
}
`;
    document.head.appendChild(s);
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (window.isSceneEditorActive && window.isSceneEditorActive()) return;
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    const closeBtn = document.getElementById('bigmap-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const zin = document.getElementById('bigmap-zoom-in');
    const zout = document.getElementById('bigmap-zoom-out');
    const reset = document.getElementById('bigmap-reset');
    const locate = document.getElementById('bigmap-locate');
    const cwp = document.getElementById('bigmap-clear-wp');
    if (zin) zin.addEventListener('click', () => this.worldZoom(1.25));
    if (zout) zout.addEventListener('click', () => this.worldZoom(0.8));
    if (reset) reset.addEventListener('click', () => this.resetWorldView());
    if (locate) locate.addEventListener('click', () => this.locatePlayer());
    if (cwp) cwp.addEventListener('click', () => this.clearWaypoint());

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.isOpen) return;
      const w = this._eventToWorld(e);
      if (!w) return;
      // toggle: click near existing clears
      if (this.waypoint && Math.hypot(this.waypoint.x - w.x, this.waypoint.z - w.z) < 30) {
        this.clearWaypoint();
      } else {
        this.setWaypoint(w.x, w.z);
      }
    });

    this.canvas.addEventListener('click', (e) => this.onBigMapClick(e));
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.12;
      this.worldZoomAtEvent(e, factor);
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this._dragging = true;
      this._dragMoved = false;
      this._dragLast = { x: e.clientX, y: e.clientY };
      this.canvas.classList.add('dragging');
    });
    window.addEventListener('mouseup', () => {
      this._dragging = false;
      this._dragLast = null;
      if (this.canvas) this.canvas.classList.remove('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (this._dragging && this._dragLast && this.isOpen) {
        const dx = e.clientX - this._dragLast.x;
        const dy = e.clientY - this._dragLast.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this._dragMoved = true;
        this._dragLast = { x: e.clientX, y: e.clientY };
        const rect = this.canvas.getBoundingClientRect();
        // pan в UV: одинаковый span по u/v (квадрат UV = crop арта без stretch)
        const uv = this.visibleUVRect();
        const du = (uv.u1 - uv.u0);
        const dv = (uv.v1 - uv.v0);
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        this.mapPanU -= (dx * scaleX / this.CW) * du;
        this.mapPanV -= (dy * scaleY / this.CH) * dv;
        this.clampPan();
      } else if (this.isOpen) {
        this.updateCursorReadout(e);
      }
    });

    // Mobile Touch handlers for Big Map
    let touchPinchDist = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this._dragging = true;
        this._dragMoved = false;
        this._dragLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        this._dragging = false;
        touchPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!this.isOpen) return;
      if (e.touches.length === 1 && this._dragging && this._dragLast) {
        const dx = e.touches[0].clientX - this._dragLast.x;
        const dy = e.touches[0].clientY - this._dragLast.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this._dragMoved = true;
        this._dragLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const rect = this.canvas.getBoundingClientRect();
        const uv = this.visibleUVRect();
        const du = (uv.u1 - uv.u0);
        const dv = (uv.v1 - uv.v0);
        const scaleX = this.canvas.width / (rect.width || 1);
        const scaleY = this.canvas.height / (rect.height || 1);
        this.mapPanU -= (dx * scaleX / this.CW) * du;
        this.mapPanV -= (dy * scaleY / this.CH) * dv;
        this.clampPan();
        this.drawBigMap();
        if (e.cancelable) e.preventDefault();
      } else if (e.touches.length === 2) {
        const newDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (touchPinchDist > 0) {
          const ratio = newDist / touchPinchDist;
          this.worldZoom(ratio);
        }
        touchPinchDist = newDist;
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    window.addEventListener('touchend', () => {
      this._dragging = false;
      this._dragLast = null;
      touchPinchDist = 0;
    });
    window.addEventListener('touchcancel', () => {
      this._dragging = false;
      this._dragLast = null;
      touchPinchDist = 0;
    });
  }

  _eventToWorld(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    if (px < 0 || py < 0 || px > this.CW || py > this.CH) return null;
    return this.canvasToWorldView(px, py);
  }

  toggle() { this.isOpen ? this.close() : this.open(); }
  open() {
    this.isOpen = true;
    if (this.overlay) {
      this.overlay.classList.add('open');
      this.overlay.style.display = 'flex';
    }
    if (!this.canvas) this.canvas = document.getElementById('bigmap-canvas');
    if (this.canvas && !this.ctx) this.ctx = this.canvas.getContext('2d');
    this.drawBigMap();
  }
  close() {
    this.isOpen = false;
    if (this.overlay) {
      this.overlay.classList.remove('open');
      this.overlay.style.display = 'none';
    }
  }

  resetWorldView() {
    this.mapZoom = 1;
    this.mapPanU = 0.5;
    this.mapPanV = 0.5;
    this.mapPanX = 0;
    this.mapPanZ = 0;
    this.drawBigMap();
  }
  locatePlayer() {
    if (!window.game || !game.player || !game.player.mesh) return;
    const p = game.player.mesh.position;
    const uv = this.worldToUV(p.x, p.z);
    this.mapPanU = uv.u;
    this.mapPanV = uv.v;
    this.mapPanX = p.x;
    this.mapPanZ = p.z;
    this.mapZoom = Math.max(this.mapZoom, 2.2);
    this.clampPan();
    this.drawBigMap();
  }
  worldZoom(factor) {
    this.mapZoom = Math.max(1, Math.min(8, this.mapZoom * factor));
    this.clampPan();
    this.drawBigMap();
  }
  worldZoomAtEvent(e, factor) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const before = this.canvasToUV(px, py);
    this.mapZoom = Math.max(1, Math.min(8, this.mapZoom * factor));
    const after = this.canvasToUV(px, py);
    this.mapPanU += before.u - after.u;
    this.mapPanV += before.v - after.v;
    this.clampPan();
    this.drawBigMap();
  }
  viewCenter() {
    return this.uvToWorld(this.mapPanU, this.mapPanV);
  }
  clampPan() {
    if (this.mapZoom <= 1.001) {
      this.mapPanU = 0.5;
      this.mapPanV = 0.5;
      return;
    }
    const half = 0.5 / this.mapZoom;
    this.mapPanU = Math.max(half, Math.min(1 - half, this.mapPanU));
    this.mapPanV = Math.max(half, Math.min(1 - half, this.mapPanV));
  }

  /** World rect approx for scale bar (метры по X). */
  visibleWorldRect() {
    const uv = this.visibleUVRect();
    const a = this.uvToWorld(uv.u0, uv.v0);
    const b = this.uvToWorld(uv.u1, uv.v1);
    return { minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z };
  }

  worldToCanvas(x, z, size) {
    const u = (x - this.worldBounds.minX) / this.worldSizeX;
    const v = (z - this.worldBounds.minZ) / this.worldSizeZ;
    return { px: u * size, py: v * size * (this.CH / this.CW) };
  }
  /** Мир → canvas через UV-видимую область (1:1 с артом, без stretch). */
  worldToCanvasView(x, z) {
    const { u, v } = this.worldToUV(x, z);
    const uv = this.visibleUVRect();
    const r = this.mapDrawRect;
    const px = r.x + ((u - uv.u0) / (uv.u1 - uv.u0)) * r.w;
    const py = r.y + ((v - uv.v0) / (uv.v1 - uv.v0)) * r.h;
    return { px, py };
  }
  canvasToUV(px, py) {
    const uv = this.visibleUVRect();
    const r = this.mapDrawRect;
    const u = uv.u0 + ((px - r.x) / r.w) * (uv.u1 - uv.u0);
    const v = uv.v0 + ((py - r.y) / r.h) * (uv.v1 - uv.v0);
    return { u, v };
  }
  canvasToWorldView(px, py) {
    const { u, v } = this.canvasToUV(px, py);
    return this.uvToWorld(u, v);
  }
  canvasToWorld(px, py, size) {
    const u = px / size;
    const v = py / (size * (this.CH / this.CW));
    return this.uvToWorld(u, v);
  }

  /**
   * Нарисовать арт в dest без искажения aspect.
   * Возвращает {x,y,w,h} куда реально попала картинка (letterbox).
   */
  drawArtContain(ctx, art, sx, sy, sw, sh, destX, destY, destW, destH) {
    if (!art || sw <= 0 || sh <= 0) return { x: destX, y: destY, w: destW, h: destH };
    const srcAr = sw / sh;
    const dstAr = destW / destH;
    let dx = destX, dy = destY, dw = destW, dh = destH;
    if (srcAr > dstAr) {
      // source wider → full width, letterbox top/bottom
      dh = destW / srcAr;
      dy = destY + (destH - dh) / 2;
    } else {
      dw = destH * srcAr;
      dx = destX + (destW - dw) / 2;
    }
    try {
      ctx.drawImage(art, sx, sy, sw, sh, dx, dy, dw, dh);
    } catch (e) { /* ignore */ }
    return { x: dx, y: dy, w: dw, h: dh };
  }

  spotCount(sp) { return (sp && (sp.n != null ? sp.n : sp.count)) || 0; }

  drawPolylineView(ctx, poly, stroke, width) {
    if (!poly || poly.length < 2) return;
    ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    const a = this.worldToCanvasView(poly[0].x, poly[0].z);
    ctx.moveTo(a.px, a.py);
    for (let i = 1; i < poly.length; i++) {
      const p = this.worldToCanvasView(poly[i].x, poly[i].z);
      ctx.lineTo(p.px, p.py);
    }
    ctx.stroke();
  }

  /**
   * Crop арта по UV-квадрату (одинаковый span u/v) → dest без stretch.
   * Если dest квадрат (радар), letterbox через drawArtContain.
   */
  drawArtUVCrop(ctx, art, u0, v0, u1, v1, destX, destY, destW, destH) {
    if (!art || !art.complete || !art.naturalWidth) return null;
    const aw = art.naturalWidth, ah = art.naturalHeight;
    let sx = u0 * aw, sy = v0 * ah;
    let sw = (u1 - u0) * aw, sh = (v1 - v0) * ah;
    if (sw < 1 || sh < 1) return null;
    // clamp source
    if (sx < 0) { sw += sx; sx = 0; }
    if (sy < 0) { sh += sy; sy = 0; }
    if (sx + sw > aw) sw = aw - sx;
    if (sy + sh > ah) sh = ah - sy;
    if (sw < 1 || sh < 1) return null;
    return this.drawArtContain(ctx, art, sx, sy, sw, sh, destX, destY, destW, destH);
  }

  /** @deprecated use drawArtUVCrop — оставлен как thin wrapper */
  drawWorldCrop(ctx, art, minX, maxX, minZ, maxZ, destW, destH) {
    const a = this.worldToUV(minX, minZ);
    const b = this.worldToUV(maxX, maxZ);
    // square UV crop around center to avoid stretch
    const cu = (a.u + b.u) / 2, cv = (a.v + b.v) / 2;
    const half = Math.max(Math.abs(b.u - a.u), Math.abs(b.v - a.v)) / 2;
    return this.drawArtUVCrop(ctx, art, cu - half, cv - half, cu + half, cv + half, 0, 0, destW, destH);
  }

  /**
   * L2 yellow player arrow — нос = направление facing.
   * facing = atan2(dir.x, dir.z): 0 = +Z (юг), +π/2 = +X (восток).
   * Canvas: +Y вниз, rotate() по часовой → rotate(-facing).
   * Локально: нос в +Y (юг при facing=0).
   */
  drawPlayerArrow(ctx, px, py, facing, size) {
    const s = size || 8;
    ctx.save();
    ctx.translate(px, py);
    // canvas CW vs math CCW yaw
    ctx.rotate(-(facing || 0));
    ctx.beginPath();
    // нос (направление движения)
    ctx.moveTo(0, s * 1.15);
    // задние крылья
    ctx.lineTo(-s * 0.72, -s * 0.75);
    // вырез сзади (L2-ish chevron)
    ctx.lineTo(0, -s * 0.28);
    ctx.lineTo(s * 0.72, -s * 0.75);
    ctx.closePath();
    ctx.fillStyle = '#ffee44';
    ctx.strokeStyle = '#221100';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * L2-style NPC map icons (typed glyphs on colored disc).
   * size: pixel radius of disc.
   */
  drawNpcIcon(ctx, px, py, type, size) {
    const s = size || 5;
    const col = this.npcColor(type);
    // disc
    ctx.beginPath();
    ctx.arc(px, py, s, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.max(8, Math.round(s * 1.35)) + 'px Georgia';

    if (type === 'teleport') {
      // gate ring
      ctx.strokeStyle = '#062222';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, s * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#062222';
      ctx.beginPath(); ctx.arc(px, py, s * 0.22, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'quest') {
      ctx.fillText('?', px, py + 0.5);
    } else if (type === 'shop') {
      ctx.fillText('$', px, py + 0.5);
    } else if (type === 'guard') {
      // chevron / shield tip
      ctx.beginPath();
      ctx.moveTo(px, py - s * 0.55);
      ctx.lineTo(px - s * 0.45, py + s * 0.35);
      ctx.lineTo(px + s * 0.45, py + s * 0.35);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'warehouse') {
      ctx.fillText('W', px, py + 0.5);
    } else if (type === 'trainer') {
      ctx.fillText('K', px, py + 0.5);
    } else if (type === 'buff') {
      ctx.fillText('+', px, py + 0.5);
    } else if (type === 'craft') {
      ctx.fillText('⚒', px, py + 0.5);
    } else if (type === 'flavor') {
      // plain disc only
    } else {
      ctx.fillText('•', px, py + 0.5);
    }
    ctx.restore();
  }

  // L2 red flag waypoint
  drawWaypointFlag(ctx, px, py, scale) {
    const s = scale || 1;
    ctx.save();
    // pole
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py - 16 * s);
    ctx.stroke();
    // flag
    ctx.beginPath();
    ctx.moveTo(px, py - 16 * s);
    ctx.lineTo(px + 12 * s, py - 12 * s);
    ctx.lineTo(px, py - 8 * s);
    ctx.closePath();
    ctx.fillStyle = '#ff4422';
    ctx.strokeStyle = '#220000';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    // base dot
    ctx.fillStyle = '#ffee44';
    ctx.beginPath();
    ctx.arc(px, py, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Pin on edge of circular radar when target is off-screen (L2 edge marker).
   */
  drawEdgePin(ctx, cx, cy, radius, tx, ty, color, glyph) {
    const dx = tx - cx;
    const dy = ty - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < radius - 4) return false; // inside — caller draws normally
    const ang = Math.atan2(dy, dx);
    const ex = cx + Math.cos(ang) * (radius - 8);
    const ey = cy + Math.sin(ang) * (radius - 8);
    ctx.save();
    ctx.fillStyle = color || '#ff6644';
    ctx.beginPath();
    ctx.arc(ex, ey, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (glyph) {
      ctx.fillStyle = '#111';
      ctx.font = 'bold 9px Georgia';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, ex, ey + 0.5);
    }
    // chevron pointing outward
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.fillStyle = color || '#ff6644';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(2, -4);
    ctx.lineTo(2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return true;
  }

  // L2 scale bar (bottom-left of world map)
  drawScaleBar(ctx, canvasW, canvasH) {
    const vis = this.visibleWorldRect();
    const r = this.mapDrawRect || { w: canvasW };
    const worldPerPx = (vis.maxX - vis.minX) / Math.max(1, r.w);
    // pick nice round meters
    const targets = [50, 100, 200, 500, 1000, 2000, 5000];
    let best = 100;
    let bestPx = best / worldPerPx;
    for (let i = 0; i < targets.length; i++) {
      const px = targets[i] / worldPerPx;
      if (px >= 50 && px <= 160) { best = targets[i]; bestPx = px; break; }
      if (Math.abs(px - 100) < Math.abs(bestPx - 100)) {
        best = targets[i]; bestPx = px;
      }
    }
    bestPx = Math.max(40, Math.min(180, bestPx));
    const x0 = 14;
    const y0 = canvasH - 18;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x0 - 6, y0 - 16, bestPx + 50, 22);
    ctx.strokeStyle = '#e8c86a';
    ctx.fillStyle = '#e8c86a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + bestPx, y0);
    ctx.moveTo(x0, y0 - 4);
    ctx.lineTo(x0, y0 + 4);
    ctx.moveTo(x0 + bestPx, y0 - 4);
    ctx.lineTo(x0 + bestPx, y0 + 4);
    ctx.stroke();
    // ticks
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + bestPx * 0.5, y0 - 3);
    ctx.lineTo(x0 + bestPx * 0.5, y0 + 3);
    ctx.stroke();
    ctx.font = '10px Courier New';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const label = best >= 1000 ? (best / 1000) + ' км' : best + ' м';
    ctx.fillText(label, x0 + bestPx + 6, y0 + 4);
    ctx.restore();
  }

  currentZoneName(x, z) {
    // regionAt: hunt → деревня/territory → wild
    if (window.WorldMetrics && window.WorldMetrics.regionAt) {
      const r = window.WorldMetrics.regionAt(x, z);
      if (r) {
        // мирные / деревня / territory — только имя
        if (r.peace || r.id === 'village' || r.kind === 'territory') {
          return r.name || 'Деревня';
        }
        // боевые hunt — имя + диапазон уровней
        if (r.hunt) {
          const l0 = (r.levelRange && r.levelRange[0] != null) ? r.levelRange[0]
            : (r.lvl && r.lvl[0] != null) ? r.lvl[0] : null;
          const l1 = (r.levelRange && r.levelRange[1] != null) ? r.levelRange[1]
            : (r.lvl && r.lvl[1] != null) ? r.lvl[1] : null;
          if (l0 != null && l1 != null) return (r.name || 'Зона') + ' (ур.' + l0 + '–' + l1 + ')';
          return r.name || 'Зона';
        }
        // wild — имя острова без 1–40
        return r.name || 'Остров поющей стали';
      }
    }
    return 'Остров поющей стали';
  }

  // ============================================
  // WORLD MAP (M)
  // ============================================
  drawBigMap() {
    this.syncBounds();
    const ctx = this.ctx;
    const S = this.CW;
    const H = this.CH;
    ctx.clearRect(0, 0, S, H);

    const uv = this.visibleUVRect();
    const art = this.islandArt || this.terrainArt;

    // фон-поля (letterbox / ocean)
    ctx.fillStyle = '#0a1520';
    ctx.fillRect(0, 0, S, H);

    if (art && art.complete && art.naturalWidth > 0) {
      // canvas уже под aspect арта → crop UV-квадрата заполняет canvas 1:1 без stretch
      const r = this.drawArtUVCrop(ctx, art, uv.u0, uv.v0, uv.u1, uv.v1, 0, 0, S, H);
      this.mapDrawRect = r || { x: 0, y: 0, w: S, h: H };
      ctx.fillStyle = 'rgba(6,6,10,0.12)';
      ctx.fillRect(this.mapDrawRect.x, this.mapDrawRect.y, this.mapDrawRect.w, this.mapDrawRect.h);
    } else {
      this.mapDrawRect = { x: 0, y: 0, w: S, h: H };
      ctx.fillStyle = '#0d0d12';
      ctx.fillRect(0, 0, S, H);
    }
    // Только арт + игрок (без зон/подписей/компаса/шкалы)
    this._bigMapMarkers = [];

    if (window.game && game.player && game.player.mesh) {
      const pp = game.player.mesh.position;
      const p = this.worldToCanvasView(pp.x, pp.z);
      const facing = (typeof game.player.facing === 'number') ? game.player.facing : 0;
      this.drawPlayerArrow(ctx, p.px, p.py, facing, 9);
    }

    const title = document.getElementById('bigmap-title');
    if (title) title.textContent = 'ОСТРОВ СТАЛИ';
  }

  updateCursorReadout(e) {
    if (!this.canvas) return;
    const el = document.getElementById('bigmap-cursor');
    if (!el) return;
    const w = this._eventToWorld(e);
    if (!w) {
      el.textContent = '—';
      return;
    }
    el.textContent = 'X: ' + Math.round(w.x) + '  Y: ' + Math.round(w.z);
    this._cursorWorld = w;
  }

  npcColor(type) {
    return {
      quest: '#ffdd44', shop: '#ff8844', buff: '#4488ff', teleport: '#44ffff',
      warehouse: '#c8c050', trainer: '#66dd66', craft: '#ff8844', guard: '#88aaff',
      flavor: '#aaaaaa'
    }[type] || '#cccccc';
  }

  onBigMapClick(e) {
    if (this._dragMoved) return;
    // Alt+LMB = set waypoint
    if (e.altKey) {
      const w = this._eventToWorld(e);
      if (w) {
        if (this.waypoint && Math.hypot(this.waypoint.x - w.x, this.waypoint.z - w.z) < 30) {
          this.clearWaypoint();
        } else {
          this.setWaypoint(w.x, w.z);
        }
      }
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    for (const m of (this._bigMapMarkers || [])) {
      if (Math.hypot(px - m.px, py - m.py) < 12) {
        this.teleportMenu(m.npc);
        return;
      }
    }
  }

  /**
   * Телепорт через NPC. Раньше здесь списывалась валюта локально
   * (`spendCurrency`) и позиция ставилась напрямую в `player.mesh.position` —
   * сервер об этом не знал, стягивал игрока назад через clampSpeed, а списание
   * откатывалось первой же синхронизацией инвентаря.
   * Теперь это только UI-запрос: авторитет цены, дистанции до диспетчера и
   * перемещения — на сервере (интент npc_teleport → teleport_ok + self_sync).
   * Основной вход в меню — диалог NPC (npc-ui.js showTeleportView).
   */
  async teleportMenu(npc) {
    if (!npc || !npc.teleports || !npc.teleports.length) return;
    const net = game && game.net;
    if (!net || typeof net.intentTeleport !== 'function') {
      game.addChatMessage('Телепорт недоступен: нет связи с сервером.', 'system');
      return;
    }
    const list = npc.teleports.map((t, i) => `[${i + 1}] ${t.name} — ${t.cost}⚙️`).join('\n');
    let choice = null;
    if (window.GameDialog && window.GameDialog.prompt) {
      choice = await window.GameDialog.prompt(
        'ТЕЛЕПОРТ (' + npc.name + '):\n' + list + '\n\nНомер направления:',
        '1',
        { title: 'Телепорт', okLabel: 'Телепорт', cancelLabel: 'Отмена' }
      );
    }
    if (choice == null || choice === '') return;
    const idx = parseInt(choice, 10) - 1;
    if (!(idx >= 0) || !npc.teleports[idx]) return;
    // Ответ придёт пакетом teleport_ok / teleport_fail (net-ws.js).
    net.intentTeleport(npc.id, idx);
  }

  // ============================================
  // L2 CIRCULAR RADAR
  // ============================================
  renderMinimap(canvas, playerPos, enemies) {
    if (!canvas) return;
    this.syncBounds();
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const R = Math.min(W, H) / 2;
    const cx = W / 2;
    const cy = H / 2;
    const viewRange = this.radarViewRange;
    const px = playerPos.x;
    const pz = playerPos.z;

    const zoneEl = document.getElementById('radar-zone-name');
    if (zoneEl) zoneEl.textContent = this.currentZoneName(px, pz);
    const coordEl = document.getElementById('radar-coords');
    if (coordEl) coordEl.textContent = Math.round(px) + ', ' + Math.round(pz);
    this._updateWaypointHud();

    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // circular clip
    ctx.beginPath();
    ctx.arc(cx, cy, R - 0.5, 0, Math.PI * 2);
    ctx.clip();

    // terrain: crop МЕТРОВ вокруг игрока 1:1 с toMini (без letterbox → не было рассинхрона)
    const art = this.terrainArt || this.islandArt;
    ctx.fillStyle = '#1a3048';
    ctx.fillRect(0, 0, W, H);
    if (art && art.complete && art.naturalWidth > 0) {
      const a = this.worldToUV(px - viewRange, pz - viewRange);
      const b = this.worldToUV(px + viewRange, pz + viewRange);
      const aw = art.naturalWidth, ah = art.naturalHeight;
      let sx = Math.min(a.u, b.u) * aw;
      let sy = Math.min(a.v, b.v) * ah;
      let sw = Math.abs(b.u - a.u) * aw;
      let sh = Math.abs(b.v - a.v) * ah;
      if (sx < 0) { sw += sx; sx = 0; }
      if (sy < 0) { sh += sy; sy = 0; }
      if (sx + sw > aw) sw = aw - sx;
      if (sy + sh > ah) sh = ah - sy;
      if (sw > 1 && sh > 1) {
        // fill canvas: метры ↔ пиксели совпадают с toMini
        try { ctx.drawImage(art, sx, sy, sw, sh, 0, 0, W, H); } catch (e) { /* */ }
      }
    }

    // маркеры: равный масштаб метров по X/Z (как L2 radar) — 1:1 с артом выше
    const toMini = (x, z) => ({
      mx: cx + ((x - px) / viewRange) * R,
      my: cy + ((z - pz) / viewRange) * R
    });
    const inCircle = (mx, my, pad) => Math.hypot(mx - cx, my - cy) <= R - (pad || 2);

    // (дороги/реки/мобы на радаре отключены — только арт + игрок; зоны — на M-карте)

    // Camera Frustum View Sector on Radar (L2 Camera Cone)
    const cam = window.game && (window.game.camera || window.game.cam);
    if (cam && THREE) {
      try {
        const camDir = new THREE.Vector3();
        cam.getWorldDirection(camDir);
        const camAngle = Math.atan2(camDir.x, camDir.z);
        const fovH = (cam.fov || 60) * (Math.PI / 180) * (cam.aspect || 1) * 0.48;

        ctx.save();
        ctx.fillStyle = 'rgba(68, 170, 255, 0.12)';
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const a1 = camAngle - fovH;
        const a2 = camAngle + fovH;
        const steps = 16;
        for (let s = 0; s <= steps; s++) {
          const curA = a1 + (a2 - a1) * (s / steps);
          ctx.lineTo(cx + Math.sin(curA) * R, cy + Math.cos(curA) * R);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } catch (e) { /* ignore */ }
    }

    // live enemies only (минимально)
    if (window.game && game.spawnManager && game.spawnManager.enemies) {
      game.spawnManager.enemies.forEach(en => {
        if (!en || !en.mesh) return;
        const m = toMini(en.mesh.position.x, en.mesh.position.z);
        if (!inCircle(m.mx, m.my, 2)) return;
        ctx.fillStyle = en.boss ? '#ff2200' : '#ff4444';
        ctx.beginPath(); ctx.arc(m.mx, m.my, en.boss ? 3 : 2, 0, Math.PI * 2); ctx.fill();
      });
    }
    const ents = (enemies instanceof Map) ? [...enemies.values()] : (enemies || []);
    ents.forEach(en => {
      const ex = en.mesh ? en.mesh.position.x : en.x;
      const ez = en.mesh ? en.mesh.position.z : en.z;
      if (ex == null || ez == null) return;
      const m = toMini(ex, ez);
      const isP = en.type === 'p' || en.type === 'player';
      if (!inCircle(m.mx, m.my, 2)) {
        if (isP) this.drawEdgePin(ctx, cx, cy, R, m.mx, m.my, '#44aaff', null);
        return;
      }

      ctx.save();
      // Индикация состояния видимости (Frustum/Distance/Cap culling)
      if (en._visState === 'culled_frustum') {
        ctx.globalAlpha = 0.35;
      } else if (en._visState === 'culled_limit') {
        ctx.globalAlpha = 0.45;
      } else if (en._visState === 'culled_distance') {
        ctx.globalAlpha = 0.25;
      } else {
        ctx.globalAlpha = 1.0;
      }

      if (isP) {
        ctx.fillStyle = '#44aaff';
        ctx.beginPath(); ctx.arc(m.mx, m.my, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      } else {
        ctx.fillStyle = en.boss ? '#ff2200' : (en.named || en.champion ? '#ff9900' : '#ff4444');
        ctx.beginPath(); ctx.arc(m.mx, m.my, en.boss ? 3.5 : (en.named ? 2.8 : 2), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });

    // NPCs — L2 icons
    [...(CITY_NPCS || []), ...(REGION_NPCS || [])].forEach(n => {
      if (!n || !n.position) return;
      const m = toMini(n.position.x, n.position.z);
      if (!inCircle(m.mx, m.my, 4)) {
        if (n.type === 'teleport' || n.type === 'quest') {
          this.drawEdgePin(ctx, cx, cy, R, m.mx, m.my, this.npcColor(n.type),
            n.type === 'quest' ? '?' : '◎');
        }
        return;
      }
      this.drawNpcIcon(ctx, m.mx, m.my, n.type || 'flavor', n.type === 'teleport' ? 5 : 4);
    });

    // target ring
    if (window.game && game.player && game.player.target && game.player.target.mesh) {
      const t = game.player.target.mesh.position;
      const m = toMini(t.x, t.z);
      if (inCircle(m.mx, m.my, 2)) {
        ctx.strokeStyle = '#ff6622';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(m.mx, m.my, 5, 0, Math.PI * 2); ctx.stroke();
      } else {
        this.drawEdgePin(ctx, cx, cy, R, m.mx, m.my, '#ff6622', '!');
      }
    }

    // waypoint on radar (flag or edge pin)
    if (this.waypoint) {
      const m = toMini(this.waypoint.x, this.waypoint.z);
      if (inCircle(m.mx, m.my, 6)) {
        this.drawWaypointFlag(ctx, m.mx, m.my, 0.75);
      } else {
        this.drawEdgePin(ctx, cx, cy, R, m.mx, m.my, '#ff4422', '⚑');
      }
    }

    // player arrow center
    const facing = (window.game && game.player && typeof game.player.facing === 'number')
      ? game.player.facing : 0;
    this.drawPlayerArrow(ctx, cx, cy, facing, 7);

    // soft vignette inside circle
    const grd = ctx.createRadialGradient(cx, cy, R * 0.45, cx, cy, R);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // gold ring outside clip
    ctx.save();
    ctx.strokeStyle = 'rgba(201,162,74,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
window.MapRenderer = MapRenderer;
