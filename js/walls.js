// ============================================================
//  WALLS.JS — Iwals.fbx
//  Прозрачные стены + XZ-коллизия (сегменты).
//  Камеру / Y игрока НЕ трогает.
// ============================================================
(function () {
  'use strict';
  var THREE = window.THREE;
  var WD = window.WallsData;

  var wallsRoot = null;
  var wallMesh = null;
  var segments = [];

  function seaY() {
    if (window.Terrain && typeof window.Terrain.seaLevel === 'number') {
      return window.Terrain.seaLevel;
    }
    return -35.0;
  }

  /** Пересекает ли шаг (ax,az)->(bx,bz) сегмент стены */
  function hitsBarrier(ax, az, bx, bz) {
    var i, w, dax, daz, dbx, dbz, den, t, u;
    dax = bx - ax;
    daz = bz - az;
    for (i = 0; i < segments.length; i++) {
      w = segments[i];
      dbx = w.x1 - w.x0;
      dbz = w.z1 - w.z0;
      den = dax * dbz - daz * dbx;
      if (Math.abs(den) < 1e-9) continue;
      t = ((w.x0 - ax) * dbz - (w.z0 - az) * dbx) / den;
      u = ((w.x0 - ax) * daz - (w.z0 - az) * dax) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
    }
    return false;
  }

  function build(scene) {
    if (window.WorldMetrics && window.WorldMetrics.isWorldObjectDeleted &&
        window.WorldMetrics.isWorldObjectDeleted('walls')) {
      console.log('[Walls] skip — deleted in editor');
      return null;
    }
    if (!THREE || !WD || !WD.positions || !WD.indices) {
      console.warn('[Walls] no WallsData');
      return null;
    }
    if (wallsRoot) {
      if (wallsRoot.parent) wallsRoot.parent.remove(wallsRoot);
      wallsRoot = null;
      wallMesh = null;
    }

    segments = Array.isArray(WD.segments) ? WD.segments.slice() : [];

    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(WD.positions);
    var idx = WD.indices.length > 65535
      ? new Uint32Array(WD.indices)
      : new Uint16Array(WD.indices);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    // Прозрачная «стекло-стена» — видно, но сквозь неё нельзя пройти
    var mat = new THREE.MeshBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: true
    });

    wallMesh = new THREE.Mesh(geo, mat);
    wallMesh.name = 'IwalsWalls';
    wallMesh.frustumCulled = true;
    wallMesh.renderOrder = 2;

    wallsRoot = new THREE.Group();
    wallsRoot.name = 'WallsRoot';
    // yMin в data = 0; сажаем низ стены у уровня моря
    wallsRoot.position.y = seaY();
    wallsRoot.add(wallMesh);

    if (scene) scene.add(wallsRoot);

    console.log(
      '[Walls] Iwals.fbx mesh +',
      segments.length,
      'collision segments; bounds',
      WD.bounds
    );
    return wallsRoot;
  }

  function dispose() {
    if (wallsRoot && wallsRoot.parent) wallsRoot.parent.remove(wallsRoot);
    if (wallMesh) {
      if (wallMesh.geometry) wallMesh.geometry.dispose();
      if (wallMesh.material) wallMesh.material.dispose();
    }
    wallsRoot = null;
    wallMesh = null;
    segments = [];
  }

  window.Walls = {
    build: build,
    dispose: dispose,
    hitsBarrier: hitsBarrier,
    get root() { return wallsRoot; },
    get mesh() { return wallMesh; },
    get segmentCount() { return segments.length; }
  };
})();
