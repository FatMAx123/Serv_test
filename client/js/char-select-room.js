// ============================================================
//  CHAR-SELECT-ROOM.JS
//  SELECT  → L2 hall (castle) + one 2D idle sprite
//  CREATE  → Talking Island village (spatial layout) + 4 sprites
//
//  Volumetric layout (CREATE, world units, 1u ≈ 1m):
//    Camera: eye ~2.4m, look slightly down, FOV 38
//    +X right, +Y up, −Z into village depth
//    NEAR  z∈[−1, 2]   grass + character row
//    MID   z∈[−4,−14]  path, fences, house clusters L/R
//    FAR   z∈[−18,−30] windmill hill, distant cottages, canopy trees
//    BG    sky dome + far hills
// ============================================================
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { loadCharacterModel, resolveModelDef, forceHumanWorldHeight } from './char-model.js?v=zero-freeze-7';

const CHAR_BASE = 'assets/Characters/';
const MENU_TEX = 'data/textures/menu/';
const VILL_TEX = 'data/textures/char-create/';
const SPRITE_TEX = 'assets/textures/webp/';
/** Village FBX props for create-character scene */
const MENU_MODEL = 'assets/menu/model/';
/** FBX texture basenames → files in *.fbm/ (loader drops folder from RelativeFilename) */
const MENU_MODEL_TEX = {
  'node_0_Default_Color_0_28304564.webp': 'dom1.fbm/node_0_Default_Color_0_28304564.webp',
  'node_0_Color_0_80068240.webp': 'dom2.fbm/node_0_Color_0_80068240.webp',
  'node_0_Color_1_17489858.webp': 'dom2.fbm/node_0_Color_1_17489858.webp',
  'node_0_NormalObject_2_28802628.webp': 'dom2.fbm/node_0_NormalObject_2_28802628.webp',
  'node_0_Roughness_3_48557388.webp': 'dom2.fbm/node_0_Roughness_3_48557388.webp',
  'texture_pbr_20250901.webp': 'dom2.fbm/texture_pbr_20250901.webp',
  'texture_pbr_20250901_metallic.webp': 'dom2.fbm/texture_pbr_20250901_metallic.webp',
  'texture_pbr_20250901_normal.webp': 'dom2.fbm/texture_pbr_20250901_normal.webp',
  'texture_pbr_20250901_roughness.webp': 'dom2.fbm/texture_pbr_20250901_roughness.webp',
  'node_0_Color_0_28997696.webp': 'mel.fbm/node_0_Color_0_28997696.webp'
};

/** Create-lineup: spaced ~2.2m, centered on path, clear of UI left panel */
// Character row on path (world X). Camera right-biased; panel semi-transparent.
const LINEUP = [
  { id: 'oper_m', cls: 'operator', gender: 'male',   label: 'Оператор · М', sheet: CHAR_BASE + 'oper/man/idle.webp',   meta: CHAR_BASE + 'oper/man/idle.json',   x: -2.4 },
  { id: 'oper_f', cls: 'operator', gender: 'female', label: 'Оператор · Ж', sheet: CHAR_BASE + 'oper/woman/idle.webp', meta: CHAR_BASE + 'oper/woman/idle.json', x: -0.2 },
  // engi_m: 3D Idle.fbx (see createLineupCharacter); sheet kept as fallback
  { id: 'engi_m', cls: 'engineer', gender: 'male',   label: 'Инженер · М',  sheet: CHAR_BASE + 'engi/man/idle.webp',   meta: CHAR_BASE + 'engi/man/idle.json',   x:  2.0, use3d: true },
  { id: 'engi_f', cls: 'engineer', gender: 'female', label: 'Инженер · Ж',  sheet: CHAR_BASE + 'engi/Woman/idle.webp', meta: CHAR_BASE + 'engi/Woman/Idle.json', x:  4.2 }
];

// ─── loaders ────────────────────────────────────────────────

function loadTex(loader, url, opts) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        if (opts && opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
        if (opts && opts.aniso) tex.anisotropy = opts.aniso;
        resolve(tex);
      },
      undefined,
      () => {
        const c = document.createElement('canvas');
        c.width = c.height = 8;
        const g = c.getContext('2d');
        g.fillStyle = (opts && opts.fallback) || '#666';
        g.fillRect(0, 0, 8, 8);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        if (opts && opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
        resolve(tex);
      }
    );
  });
}

async function fetchJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

function applyFrameUV(tex, frame, imgW, imgH) {
  // ONLY offset/repeat — never tex.needsUpdate (that re-uploads full atlas → freezes!)
  const u = frame.x / imgW;
  const v = 1 - (frame.y + frame.h) / imgH;
  tex.repeat.set(frame.w / imgW, frame.h / imgH);
  tex.offset.set(u, v);
}

function matStd(map, color, roughness, metalness, side) {
  return new THREE.MeshStandardMaterial({
    map: map || null,
    color: color != null ? color : 0xffffff,
    roughness: roughness != null ? roughness : 0.85,
    metalness: metalness != null ? metalness : 0.05,
    side: side || THREE.FrontSide
  });
}

// ─── 2D animated sprite character ───────────────────────────
// Sheet cache: load each PNG once; clones only for independent UV (no GPU re-upload)

const _sheetCache = new Map(); // url -> Promise<Texture>
const _metaCache = new Map();

function loadSheetTexture(loader, url, aniso) {
  if (_sheetCache.has(url)) return _sheetCache.get(url);
  const p = new Promise((resolve) => {
    loader.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.magFilter = THREE.LinearFilter;
        // no mipmaps for sprite atlases — cheaper + no thrash
        t.minFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        t.anisotropy = aniso || 1;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.userData.sharedSheet = true;
        resolve(t);
      },
      undefined,
      () => resolve(null)
    );
  });
  _sheetCache.set(url, p);
  return p;
}

async function loadAnimMeta(url) {
  if (_metaCache.has(url)) return _metaCache.get(url);
  const meta = (await fetchJson(url)) || {
    width: 2048, height: 2048, fps: 3,
    frames: [
      { x: 0, y: 0, w: 1024, h: 1024 },
      { x: 1024, y: 0, w: 1024, h: 1024 },
      { x: 0, y: 1024, w: 1024, h: 1024 },
      { x: 1024, y: 1024, w: 1024, h: 1024 }
    ]
  };
  _metaCache.set(url, meta);
  return meta;
}

/** Shared static mats for char shadow/ring (no per-char leak) */
let _charShadowMat = null;
let _charRingMat = null;
function getCharShadowMat() {
  if (!_charShadowMat) {
    _charShadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false
    });
  }
  return _charShadowMat;
}
function getCharRingMat() {
  if (!_charRingMat) {
    _charRingMat = new THREE.MeshBasicMaterial({
      color: 0xd4b060, transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, depthWrite: false
    });
  }
  return _charRingMat;
}

async function createSpriteCharacter(loader, def, aniso, opts) {
  opts = opts || {};
  const meta = await loadAnimMeta(def.meta);
  const tex = await loadSheetTexture(loader, def.sheet, aniso);

  const root = new THREE.Group();
  root.userData.cls = def.cls;
  root.userData.gender = def.gender;
  root.userData.id = def.id;
  root.userData.label = def.label;
  root.userData.pickable = true;

  if (!tex) {
    const fb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 1.1, 6, 10),
      matStd(null, 0x7a8a9a, 0.7, 0.1)
    );
    fb.position.y = 1.0;
    root.add(fb);
    root.userData.anim = null;
    return root;
  }

  const frames = meta.frames && meta.frames.length ? meta.frames : [{ x: 0, y: 0, w: 1024, h: 1024 }];
  const imgW = meta.width || tex.image.width || 2048;
  const imgH = meta.height || tex.image.height || 2048;
  const fps = meta.fps || 3;

  // clone for independent UV only — image GPU data stays shared; NEVER needsUpdate on frame tick
  const atlas = tex.clone();
  atlas.source = tex.source; // share GPU source (three r15x+)
  if (atlas.source === undefined) atlas.image = tex.image;
  atlas.userData.sharedSheet = true;
  atlas.userData.isUvClone = true;
  applyFrameUV(atlas, frames[0], imgW, imgH);

  const height = opts.height != null ? opts.height : 2.35;
  const widthMul = opts.widthMul != null ? opts.widthMul : 1.05;
  const width = height * widthMul;

  const mat = new THREE.MeshBasicMaterial({
    map: atlas,
    transparent: true,
    alphaTest: 0.32,
    side: THREE.DoubleSide,
    depthWrite: true
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  plane.position.y = height / 2;
  plane.userData.pickable = true;
  plane.userData.owner = root;
  root.add(plane);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 16),
    getCharShadowMat()
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  root.add(shadow);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.58, 0.78, 32),
    getCharRingMat()
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  root.add(ring);

  root.userData.ring = ring;
  root.userData.plane = plane;
  root.userData.anim = {
    frames, imgW, imgH, fps, tex: atlas,
    t: Math.random() * 2, idx: 0
  };
  return root;
}

function tickSprite(root, dt) {
  // 3D character (FBX mixer)
  if (root.userData.charInst && typeof root.userData.charInst.update === 'function') {
    root.userData.charInst.update(dt);
    return;
  }
  const a = root.userData.anim;
  if (!a || !a.frames.length) return;
  // keep original meta fps (character idle untouched)
  const fps = Math.max(0.5, a.fps || 3);
  a.t += dt;
  const frameDur = 1 / fps;
  while (a.t >= frameDur) {
    a.t -= frameDur;
    a.idx = (a.idx + 1) % a.frames.length;
    applyFrameUV(a.tex, a.frames[a.idx], a.imgW, a.imgH);
  }
}

/**
 * 3D lineup / hall character (engineer Idle.fbx).
 * Falls back to sprite if FBX missing.
 */
async function create3dCharacter(def, aniso, opts) {
  opts = opts || {};
  const modelDef = resolveModelDef(def.cls, def.gender);
  if (!modelDef) return null;
  try {
    // Same human scale as in-game (~1.85m). Old 2.15 + double forceHuman → giant.
    const height = opts.height != null ? opts.height : 1.85;
    const inst = await loadCharacterModel(modelDef, {
      height,
      aniso: aniso || 4,
      loadRun: false,
      loadExternalClips: true,
      appearance: opts.appearance || { hairId: 'none' }
    });
    if (!inst || !inst.root) return null;
    const root = inst.root;
    // Do NOT call forceHumanWorldHeight here — skinned AABB lies (0.38m / 930m)
    // and re-scales the already-correct fitToHeight (~106×) into a giant.
    // loadCharacterModel already fitted via geomH × Armature0.01.
    root.position.set(0, 0, 0);
    root.scale.set(1, 1, 1);
    root.updateMatrixWorld(true);
    // Ground feet using bind-pose geom corners only
    try {
      let minY = Infinity;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      const vt = new THREE.Vector3();
      root.traverse((n) => {
        if (!n.isSkinnedMesh || !n.geometry) return;
        const g = n.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        if (!g.boundingBox) return;
        const b = g.boundingBox;
        const pts = [
          [b.min.x, b.min.y, b.min.z], [b.min.x, b.min.y, b.max.z],
          [b.min.x, b.max.y, b.min.z], [b.min.x, b.max.y, b.max.z],
          [b.max.x, b.min.y, b.min.z], [b.max.x, b.min.y, b.max.z],
          [b.max.x, b.max.y, b.min.z], [b.max.x, b.max.y, b.max.z]
        ];
        for (let i = 0; i < 8; i++) {
          vt.set(pts[i][0], pts[i][1], pts[i][2]).applyMatrix4(n.matrixWorld);
          if (vt.y < minY) minY = vt.y;
          if (vt.x < minX) minX = vt.x;
          if (vt.x > maxX) maxX = vt.x;
          if (vt.z < minZ) minZ = vt.z;
          if (vt.z > maxZ) maxZ = vt.z;
        }
      });
      if (isFinite(minY)) {
        root.position.x -= (minX + maxX) * 0.5;
        root.position.z -= (minZ + maxZ) * 0.5;
        root.position.y -= minY;
      }
      console.log('[char-select] 3D ready', def.id, 'as-exported scale=1');
    } catch (eG) {
      console.warn('[char-select] 3D ground fail', eG);
    }

    root.userData.cls = def.cls;
    root.userData.gender = def.gender;
    root.userData.id = def.id;
    root.userData.label = def.label;
    root.userData.pickable = true;
    root.userData.charInst = inst;
    root.userData.is3d = true;
    // pickable proxy: invisible box for raycast
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, height, 0.7),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.y = height * 0.5;
    hit.userData.pickable = true;
    hit.userData.owner = root;
    root.add(hit);
    root.userData.plane = hit; // reuse pick path
    try {
      if (typeof inst.playIdle === 'function') inst.playIdle();
    } catch (e2) {
      console.warn('[char-select] playIdle fail', e2);
    }
    // Cam at +Z looking −Z → model must face +Z (yaw 0). Math.PI = спиной!
    const faceYaw = (modelDef.selectYaw != null) ? modelDef.selectYaw : 0;
    root.rotation.y = faceYaw;
    root.visible = true;
    return root;
  } catch (e) {
    console.warn('[char-select] 3D model fail', def.id, e);
    return null;
  }
}

async function createLineupCharacter(loader, def, aniso, opts) {
  try {
    if (def.use3d || resolveModelDef(def.cls, def.gender)) {
      const c3 = await create3dCharacter(def, aniso, opts);
      if (c3) return c3;
      console.warn('[char-select] 3D missing, sprite fallback', def.id);
    }
    return await createSpriteCharacter(loader, def, aniso, opts);
  } catch (e) {
    console.warn('[char-select] lineup char fail', def.id, e);
    return createSpriteCharacter(loader, def, aniso, opts);
  }
}

// ─── alpha sprite materials (WebP, chroma-keyed) ────────────

function spriteMat(map, alphaTest, color, opacity) {
  return new THREE.MeshBasicMaterial({
    map,
    color: color != null ? color : 0xffffff,
    transparent: true,
    opacity: opacity != null ? opacity : 1,
    alphaTest: alphaTest != null ? alphaTest : 0.22,
    depthWrite: opacity == null || opacity >= 0.98,
    side: THREE.DoubleSide
  });
}

/** Camera look yaw for billboards — plane +Z faces camera at (cx,cz) from (x,z) */
function faceYawToCam(x, z, cx, cz) {
  return Math.atan2(cx - x, cz - z);
}

/**
 * Tree: 3D trunk + 3 canopy cards @ 60° facing camera (no edge-on flat look)
 */
function makeSpriteTree(mats, scale, texKey, worldX, worldZ, camX, camZ) {
  const s = scale || 1;
  const g = new THREE.Group();
  const maps = mats.treeMaps;
  if (!maps || !maps.length) return g;
  const idx = texKey % maps.length;
  const map = maps[idx];
  if (!mats.treeMats) mats.treeMats = [];
  if (!mats.treeMats[idx]) {
    mats.treeMats[idx] = spriteMat(map, 0.3, 0xffffff, 1);
  }
  const matCanopy = mats.treeMats[idx];
  const trunkMat = mats.barkSolid || mats.timberSolid;

  // ── 3D trunk ──
  const trunkH = (2.4 + (idx % 3) * 0.35) * s;
  const rTop = 0.12 * s;
  const rBot = 0.22 * s;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, trunkH, 8),
    trunkMat
  );
  trunk.position.y = trunkH * 0.5;
  g.add(trunk);
  const flare = new THREE.Mesh(
    new THREE.CylinderGeometry(rBot, rBot * 1.4, 0.2 * s, 8),
    trunkMat
  );
  flare.position.y = 0.09 * s;
  g.add(flare);
  for (let i = 0; i < 2; i++) {
    const ang = (i / 2) * Math.PI + 0.5;
    const br = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03 * s, 0.05 * s, 0.5 * s, 5),
      trunkMat
    );
    br.position.set(
      Math.cos(ang) * rTop * 1.2,
      trunkH * (0.72 + i * 0.08),
      Math.sin(ang) * rTop * 1.2
    );
    br.rotation.z = Math.cos(ang) * 0.85;
    br.rotation.x = Math.sin(ang) * 0.85;
    g.add(br);
  }

  // ── canopy: 3 vertical cards at 60° — always volume from create-cam ──
  const crownSize = (2.85 + (idx % 3) * 0.4) * s;
  const canopy = new THREE.Group();
  canopy.position.y = trunkH * 0.5 + crownSize * 0.42;

  const face =
    worldX != null && camX != null
      ? faceYawToCam(worldX, worldZ, camX, camZ)
      : 0;

  // 3 planes → no camera angle shows a paper edge
  for (let i = 0; i < 3; i++) {
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(crownSize, crownSize),
      matCanopy
    );
    card.rotation.y = face + (i * Math.PI) / 3;
    canopy.add(card);
  }
  g.add(canopy);

  g.userData.isTree = true;
  g.userData.canopy = canopy;
  g.userData.swayCanopy = true;
  g.userData.swayPhase = Math.random() * Math.PI * 2;
  g.userData.swayAmp = 0.02 + Math.random() * 0.012;
  g.userData.swaySpeed = 0.45 + Math.random() * 0.2;
  g.userData.radius = crownSize * 0.45;
  g.userData.faceY = face;
  return g;
}

/**
 * Bush: 3 cards @ 60° facing camera + light wind
 */
function makeSpriteBush(mats, scale, texKey, worldX, worldZ, camX, camZ) {
  const s = scale || 1;
  const g = new THREE.Group();
  const maps = mats.bushMaps;
  if (!maps || !maps.length) return g;
  const idx = texKey % maps.length;
  if (!mats.bushMats) mats.bushMats = [];
  if (!mats.bushMats[idx]) {
    mats.bushMats[idx] = spriteMat(maps[idx], 0.26, 0xffffff, 1);
  }
  const mat = mats.bushMats[idx];
  const h = (1.15 + (idx % 2) * 0.28) * s;
  const w = h * 1.2;

  const face =
    worldX != null && camX != null
      ? faceYawToCam(worldX, worldZ, camX, camZ)
      : 0;

  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    p.position.y = h * 0.48;
    p.rotation.y = face + (i * Math.PI) / 3;
    g.add(p);
  }
  g.userData.isBush = true;
  g.userData.sway = true;
  g.userData.swayPhase = Math.random() * Math.PI * 2;
  g.userData.swayAmp = 0.028 + Math.random() * 0.015;
  g.userData.swaySpeed = 0.6 + Math.random() * 0.3;
  g.userData.radius = w * 0.45;
  return g;
}

/**
 * Rock boulder — low-poly dodeca/ico variants, shared materials.
 * @param {object} mats
 * @param {number} scale
 * @param {number} variant 0..n
 */
function makeRock(mats, scale, variant) {
  const s = scale || 1;
  const v = (variant || 0) % 5;
  const g = new THREE.Group();
  // pick geometry style
  let geo;
  if (v === 0) geo = new THREE.DodecahedronGeometry(0.55 * s, 0);
  else if (v === 1) geo = new THREE.IcosahedronGeometry(0.5 * s, 0);
  else if (v === 2) geo = new THREE.OctahedronGeometry(0.52 * s, 0);
  else if (v === 3) geo = new THREE.DodecahedronGeometry(0.42 * s, 0);
  else geo = new THREE.IcosahedronGeometry(0.38 * s, 1);

  const mat = mats.rockMats
    ? mats.rockMats[v % mats.rockMats.length]
    : (mats.stoneSolid || matStd(null, 0x8a8480, 0.95, 0.04));
  const mesh = new THREE.Mesh(geo, mat);
  // squash & irregular scale → natural boulder
  const sx = 0.85 + (v % 3) * 0.12;
  const sy = 0.55 + (v % 2) * 0.18;
  const sz = 0.9 + ((v + 1) % 3) * 0.1;
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.set(
    (v * 0.7) % 1.2,
    (v * 1.3) % 6.28,
    (v * 0.4) % 0.8
  );
  mesh.position.y = 0.28 * s * sy;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);

  // optional smaller satellite rock
  if (v % 2 === 0 && s > 0.45) {
    const small = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.22 * s, 0),
      mat
    );
    small.scale.set(1.1, 0.65, 0.95);
    small.position.set(0.45 * s, 0.12 * s, 0.2 * s);
    small.rotation.y = v;
    small.castShadow = true;
    small.receiveShadow = true;
    g.add(small);
  }
  g.userData.isRock = true;
  g.userData.radius = 0.55 * s * Math.max(sx, sz);
  return g;
}

/**
 * Sky dome layout (canvas mapped on BackSide sphere):
 *  u = azimuth, v = elevation (0 top zenith → 1 bottom)
 * Clouds are PAINTED on the sky texture so they can never overdraw trees.
 */
const SKY_W = 512;
const SKY_H = 256;

/**
 * Soft cloud puffs baked into sky dome.
 * SphereGeometry UV: v≈1 at zenith (after flipY), v≈0 at nadir — so paint BOTH
 * y-bands (canvas top AND mid) so clouds show regardless of UV orientation.
 */
function paintSkyClouds(ctx, w, h, phase, nightAmt, driftU) {
  // readable opacity — previous 0.3× was invisible on blue sky
  const baseA = nightAmt > 0.75 ? 0.22 : (phase === 'golden' || phase === 'twilight' ? 0.62 : 0.72);
  if (baseA < 0.08) return;

  let rgb = '255,255,255';
  if (nightAmt > 0.55) rgb = '170,185,220';
  else if (phase === 'golden' || phase === 'twilight') rgb = '255,232,210';
  else rgb = '255,255,255';

  const drift = ((driftU % 1) + 1) % 1;

  // clusters: [u, v, radiusFrac, alphaMul] — v in 0..1 canvas Y
  // paint mid-upper sky (visible above tree line in create cam)
  const bands = [
    [0.10, 0.22, 0.11, 1.0],
    [0.22, 0.28, 0.13, 0.9],
    [0.38, 0.20, 0.12, 0.95],
    [0.52, 0.30, 0.14, 0.85],
    [0.66, 0.24, 0.12, 0.9],
    [0.80, 0.32, 0.13, 0.88],
    [0.92, 0.26, 0.10, 0.92],
    [0.15, 0.38, 0.09, 0.7],
    [0.48, 0.40, 0.11, 0.65],
    [0.75, 0.36, 0.10, 0.7],
    // also near canvas bottom (if UV inverted for sphere)
    [0.12, 0.72, 0.11, 0.85],
    [0.30, 0.68, 0.13, 0.8],
    [0.55, 0.74, 0.12, 0.82],
    [0.78, 0.70, 0.14, 0.78],
    [0.90, 0.76, 0.10, 0.8]
  ];

  function puffAt(px, py, r, a) {
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    g.addColorStop(0.35, 'rgba(' + rgb + ',' + (a * 0.55) + ')');
    g.addColorStop(0.7, 'rgba(' + rgb + ',' + (a * 0.18) + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function puff(ux, vy, rr, a) {
    const x = ((ux + drift) % 1) * w;
    const y = vy * h;
    const r = Math.max(8, rr * w);
    puffAt(x, y, r, a);
    // horizontal wrap
    if (x < r) puffAt(x + w, y, r, a);
    if (x > w - r) puffAt(x - w, y, r, a);
  }

  // slightly stronger composite so clouds read on bright day sky
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    puff(b[0], b[1], b[2], baseA * b[3]);
  }
  ctx.restore();
}

/**
 * Soft-edge gravel/dirt canvas texture (RGBA).
 * kind: 'pad' (radial ellipse) | 'road' (lengthwise strip with side fade)
 */
function makeSoftGroundTexture(kind, opts) {
  opts = opts || {};
  const W = opts.w || (kind === 'pad' ? 512 : 256);
  const H = opts.h || (kind === 'pad' ? 512 : 512);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // base gravel color + noise
  const col = opts.color || { r: 150, g: 130, b: 100 };
  const col2 = opts.color2 || { r: 120, g: 105, b: 80 };

  // fill with noisy gravel
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = ((x * 17 + y * 31) ^ (x * 7 + y * 13)) % 47 / 47;
      const n2 = ((x * 3 + y * 11) % 19) / 19;
      const t = n * 0.65 + n2 * 0.35;
      d[i] = (col.r * (1 - t) + col2.r * t) | 0;
      d[i + 1] = (col.g * (1 - t) + col2.g * t) | 0;
      d[i + 2] = (col.b * (1 - t) + col2.b * t) | 0;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // soft alpha mask
  ctx.globalCompositeOperation = 'destination-in';
  if (kind === 'pad') {
    // radial soft ellipse — platform under characters
    const g = ctx.createRadialGradient(W * 0.5, H * 0.5, W * 0.18, W * 0.5, H * 0.5, W * 0.48);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.92)');
    g.addColorStop(0.78, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else {
    // road: fade on left/right edges (u), mild fade on ends (v)
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.12, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.28, 'rgba(0,0,0,1)');
    g.addColorStop(0.72, 'rgba(0,0,0,1)');
    g.addColorStop(0.88, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // soften start/end along length
    ctx.globalCompositeOperation = 'destination-in';
    const g2 = ctx.createLinearGradient(0, 0, 0, H);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(0.06, 'rgba(0,0,0,0.7)');
    g2.addColorStop(0.12, 'rgba(0,0,0,1)');
    g2.addColorStop(0.88, 'rgba(0,0,0,1)');
    g2.addColorStop(0.94, 'rgba(0,0,0,0.7)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Soft-edge ground decal (pad / road) — transparent edges fade into grass */
function makeSoftGroundMesh(tex, width, depth, y) {
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    roughness: 0.94,
    metalness: 0.02,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y != null ? y : 0.03;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.receiveShadow = true;
  mesh.userData.noCast = true;
  mesh.renderOrder = 1;
  return mesh;
}

/** Soft moon disc texture (fallback if moon.webp missing) */
function makeMoonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  const g = ctx.createRadialGradient(118, 118, 18, 128, 128, 120);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(230,236,250,1)');
  g.addColorStop(0.8, 'rgba(190,200,230,0.95)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.fill();
  // soft craters
  ctx.fillStyle = 'rgba(160,170,200,0.18)';
  [[100, 110, 18], [145, 130, 12], [120, 155, 10]].forEach(([x, y, r]) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMoonMesh(tex) {
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    fog: false,
    sizeAttenuation: true
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(6.5, 6.5, 1);
  spr.renderOrder = 12;
  spr.frustumCulled = false;
  spr.name = 'cs_moon';
  spr.userData.noCast = true;
  return spr;
}

/** Paint sky gradient + far clouds on dome canvas (always behind scene) */
function paintSkyGradient(ctx, w, h, phase, nightAmt, driftU) {
  const gr = ctx.createLinearGradient(0, 0, 0, h);
  if (phase === 'night' || nightAmt > 0.85) {
    gr.addColorStop(0.0, '#050814');
    gr.addColorStop(0.35, '#0a1230');
    gr.addColorStop(0.55, '#12183a');
    gr.addColorStop(0.75, '#1a1840');
    gr.addColorStop(1.0, '#0c0a18');
  } else if (phase === 'twilight') {
    gr.addColorStop(0.0, '#1a2048');
    gr.addColorStop(0.3, '#3a3068');
    gr.addColorStop(0.5, '#8850a0');
    gr.addColorStop(0.7, '#e07050');
    gr.addColorStop(0.9, '#c05040');
    gr.addColorStop(1.0, '#402028');
  } else if (phase === 'golden') {
    gr.addColorStop(0.0, '#3a68a8');
    gr.addColorStop(0.28, '#88b0d8');
    gr.addColorStop(0.48, '#e8c090');
    gr.addColorStop(0.68, '#f0a060');
    gr.addColorStop(0.88, '#e07048');
    gr.addColorStop(1.0, '#b85840');
  } else {
    // day
    gr.addColorStop(0.0, '#2a6ab8');
    gr.addColorStop(0.35, '#6aa8e0');
    gr.addColorStop(0.55, '#a8cce8');
    gr.addColorStop(0.75, '#d0e0f0');
    gr.addColorStop(1.0, '#e8eef5');
  }
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, w, h);
  // far clouds baked into sky — never fight tree depth
  paintSkyClouds(ctx, w, h, phase, nightAmt, driftU || 0);
}

/**
 * Sync village lighting/sky/moon/clouds to WorldTime tod [0,1).
 * mutates village.userData atmosphere refs.
 */
function applyVillageTod(village, tod, camera) {
  if (!village || !village.userData) return;
  const ud = village.userData;
  const WT = (typeof window !== 'undefined' && (window.WorldTime || window.WORLD_TIME)) || null;
  const phase = WT && WT.phaseOfTod ? WT.phaseOfTod(tod) : 'day';
  // sinElev: day>0 night<0 (same convention as daynight.js)
  const sinElev = Math.sin((tod - 0.25) * Math.PI * 2);
  const dayAmt = Math.max(0, Math.min(1, (sinElev + 0.05) / 0.55));
  const nightAmt = Math.max(0, Math.min(1, (-sinElev + 0.05) / 0.45));
  const goldenAmt = phase === 'golden' ? 1 : (phase === 'twilight' ? 0.5 : 0);

  // sun / moon directions on sky dome
  const elev = (tod - 0.25) * Math.PI * 2;
  const sunDir = new THREE.Vector3(
    Math.cos(elev) * 0.85,
    Math.sin(elev),
    Math.sin(elev * 0.3) * 0.35
  ).normalize();
  const moonDir = sunDir.clone().multiplyScalar(-1);
  moonDir.y = Math.max(0.08, Math.abs(moonDir.y));
  moonDir.normalize();

  const R = 48; // sky body orbit radius (visible from create cam)
  if (ud.sun) {
    ud.sun.position.copy(sunDir).multiplyScalar(R);
    if (ud.sun.target) ud.sun.target.position.set(0, 0, -8);
    // intensity + color
    const sunI = 0.15 + dayAmt * 1.2 + goldenAmt * 0.15;
    ud.sun.intensity = sunI * (sinElev > -0.15 ? 1 : 0.05);
    if (phase === 'golden' || phase === 'twilight') {
      ud.sun.color.setHex(0xffa060);
    } else if (phase === 'night' || nightAmt > 0.7) {
      // soft lunar key — never nearly-off (village/chars stayed black)
      ud.sun.color.setHex(0x9ab4e0);
      ud.sun.intensity = 0.18 + nightAmt * 0.12;
    } else {
      ud.sun.color.setHex(0xffe0b0);
    }
    ud.sun.castShadow = dayAmt > 0.15;
  }
  if (ud.moonLight) {
    ud.moonLight.position.copy(moonDir).multiplyScalar(R);
    if (ud.moonLight.target) ud.moonLight.target.position.set(0, 0, -8);
    ud.moonLight.intensity = nightAmt * 1.25;
    ud.moonLight.color.setHex(0xc0d8ff);
  }
  if (ud.fillLight) {
    // front fill — faces / sprites readable at night
    ud.fillLight.intensity = 0.2 + dayAmt * 0.25 + nightAmt * 0.65;
    ud.fillLight.color.setHex(nightAmt > 0.5 ? 0x88a8e0 : 0xa8c8ff);
  }
  if (ud.ambient) {
    ud.ambient.intensity = 0.32 + dayAmt * 0.28 + nightAmt * 0.48;
    ud.ambient.color.setHex(nightAmt > 0.55 ? 0x5a78a8 : 0xffe8c8);
  }
  if (ud.hemi) {
    ud.hemi.intensity = 0.35 + dayAmt * 0.4 + nightAmt * 0.55;
    if (nightAmt > 0.55) {
      ud.hemi.color.setHex(0x6a88c8);
      ud.hemi.groundColor.setHex(0x2a3848);
    } else if (goldenAmt > 0.4) {
      ud.hemi.color.setHex(0xffd0a0);
      ud.hemi.groundColor.setHex(0x4a3828);
    } else {
      ud.hemi.color.setHex(0xffd0a0);
      ud.hemi.groundColor.setHex(0x3a5a28);
    }
  }
  // character key from create-cam side (faces stay lit at night)
  if (ud.charKeyLight) {
    ud.charKeyLight.intensity = nightAmt * 0.9;
    ud.charKeyLight.color.setHex(0xd8e8ff);
  }

  // Sky gradient + clouds: repaint only when lighting phase changes.
  // Continuous drift is done via skyTex.offset.x every frame (smooth, no canvas thrash).
  if (ud.skyCtx && ud.skyTex) {
    const sw = ud.skyCanvasW || SKY_W;
    const sh = ud.skyCanvasH || SKY_H;
    const prevPhase = ud._skyPaintPhase;
    const prevNight = ud._skyPaintNight;
    const needPaint =
      prevPhase !== phase ||
      prevNight == null ||
      Math.abs(prevNight - nightAmt) > 0.03;
    if (needPaint) {
      // driftU=0 — horizontal scroll is UV offset, not re-stamping puffs
      paintSkyGradient(ud.skyCtx, sw, sh, phase, nightAmt, 0);
      ud.skyTex.needsUpdate = true;
      ud._skyPaintPhase = phase;
      ud._skyPaintNight = nightAmt;
    }
  }

  // moon sprite
  if (ud.moon) {
    ud.moon.position.copy(moonDir).multiplyScalar(R * 0.92);
    ud.moon.material.opacity = Math.max(0, nightAmt * 0.95 - dayAmt * 0.3);
    ud.moon.visible = ud.moon.material.opacity > 0.04;
    // scale pulse slightly by elevation
    const ms = 5.5 + nightAmt * 2.2;
    ud.moon.scale.set(ms, ms, 1);
  }

  ud._todPhase = phase;
  ud._tod = tod;
  ud._nightAmt = nightAmt;
  ud._dayAmt = dayAmt;
}

/** After first failed server probe, stay offline (no 404 spam on :3000). */
let _worldTimeServerOk = null; // null=unknown, true/false

function localWorldTimeAnchor(dayLen, WT) {
  const realFrac = ((Date.now() / 1000) / dayLen) % 1;
  const tod = WT && WT.realFracToTod ? WT.realFracToTod(realFrac) : realFrac;
  return {
    tod,
    realFrac,
    dayLengthSec: dayLen,
    server: false,
    at: performance.now()
  };
}

/**
 * Fetch server world time with local WorldTime fallback.
 */
async function fetchWorldTimeAnchor() {
  const WT = (typeof window !== 'undefined' && (window.WorldTime || window.WORLD_TIME)) || null;
  const dayLen = (WT && WT.DAY_LENGTH_SEC) || 14400;

  // Already know server is down / offline mode
  if (_worldTimeServerOk === false) {
    return localWorldTimeAnchor(dayLen, WT);
  }

  // Probe game API host
  const bases = [];
  try {
    const proto = (typeof location !== 'undefined' && location.protocol === 'https:') ? 'https:' : 'http:';
    if (typeof location !== 'undefined' && location.origin && location.origin.indexOf('localhost:3000') !== -1) {
      bases.push(location.origin);
    }
    const fromConfig = (window.STEAM_CONFIG && window.STEAM_CONFIG.serverHost) ||
                       sessionStorage.getItem('ps_game_host') ||
                       localStorage.getItem('ps_game_host');
    if (fromConfig) {
      let cleanH = String(fromConfig).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (cleanH.indexOf('localhost:3000') === -1) cleanH = cleanH.replace(/:\d+$/, '');
      if (proto === 'https:' && (cleanH === window.PS_SERVER.host || cleanH === window.PS_SERVER.host + ':8080')) {
        cleanH = window.PS_SERVER.sslHost;
      }
      bases.push(proto + '//' + cleanH);
    }
    if (proto === 'https:') {
      bases.push('https://' + window.PS_SERVER.sslHost);
    } else {
      bases.push('http://' + window.PS_SERVER.host);
    }
  } catch (e) { /* */ }

  for (let i = 0; i < bases.length; i++) {
    const b = bases[i];
    try {
      const r = await fetch(b + '/api/world-time', { cache: 'no-store', mode: 'cors' });
      if (!r.ok) continue;
      const j = await r.json();
      if (j && typeof j.tod === 'number') {
        _worldTimeServerOk = true;
        return {
          tod: j.tod,
          realFrac: typeof j.realFrac === 'number' ? j.realFrac : null,
          dayLengthSec: j.dayLengthSec || dayLen,
          dayRealFrac: j.dayRealFrac,
          paused: !!j.paused,
          phase: j.phase,
          hour: j.hour,
          server: true,
          at: performance.now()
        };
      }
    } catch (e) { /* try next */ }
  }

  _worldTimeServerOk = false;
  // offline: wall-clock cycle (no console 404 spam)
  const off = localWorldTimeAnchor(dayLen, WT);
  off.paused = false;
  off.phase = WT && WT.phaseOfTod ? WT.phaseOfTod(off.tod) : 'day';
  off.hour = WT && WT.todToHour ? WT.todToHour(off.tod) : off.tod * 24;
  return off;
}

function extrapolateTod(anchor) {
  if (!anchor) return 0.35;
  if (anchor.paused) return anchor.tod;
  const WT = (typeof window !== 'undefined' && (window.WorldTime || window.WORLD_TIME)) || null;
  const elapsed = (performance.now() - anchor.at) / 1000;
  const dayLen = anchor.dayLengthSec || 14400;
  if (WT && WT.advanceRealFrac && WT.realFracToTod && typeof anchor.realFrac === 'number') {
    const f = WT.advanceRealFrac(anchor.realFrac, elapsed, dayLen);
    return WT.realFracToTod(f);
  }
  return ((anchor.tod + elapsed / dayLen) % 1 + 1) % 1;
}

/**
 * Soft grass tuft — fewer, smaller, desaturated (doesn't steal focus from characters)
 */
function makeSpriteGrass(mats, scale) {
  const s = (scale || 1) * 0.55; // much smaller
  const g = new THREE.Group();
  // dark-green tint + lower opacity → blends into ground, less "speckled"
  const mat = mats.grassMat || spriteMat(mats.grassMap, 0.25, 0x5a7048, 0.72);
  const h = (0.45 + Math.random() * 0.12) * s;
  const w = h * 1.15;
  // single plane only (was 2× crossed → too busy)
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  p.position.y = h * 0.45;
  g.add(p);
  g.userData.billboard = true;
  g.userData.sway = true;
  g.userData.billboard = true;
  g.userData.faceY = 0; // face camera default; set once, not every frame atan2
  g.userData.swayPhase = Math.random() * Math.PI * 2;
  g.userData.swayAmp = 0.045 + Math.random() * 0.02;
  g.userData.swaySpeed = 0.75 + Math.random() * 0.25;
  g.userData.radius = 0.25;
  return g;
}

// ─── HOUSE low draw-count (≤8 meshes) ───────────────────────
function makeHouse(m, opts) {
  const w = opts.w || 4.0;
  const d = opts.d || 3.4;
  const baseH = opts.baseH != null ? opts.baseH : 1.1;
  const upperH = opts.upperH != null ? opts.upperH : 1.25;
  const roofH = opts.roofH || 1.4;
  const totalWall = baseH + upperH;
  const g = new THREE.Group();
  g.userData.footprint = { halfW: w * 0.55, halfD: d * 0.55 };

  const plaster = m.wallSolid;
  const stone = m.stoneSolid;
  const wood = m.timberSolid;
  const roofMat = opts.slate ? m.roofSolid : (m.thatchSolid || m.roofSolid);
  const doorM = m.doorSolid;

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, totalWall, d), plaster);
  body.position.y = totalWall / 2;
  g.add(body);

  const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, baseH, 0.06), stone);
  band.position.set(0, baseH / 2, d / 2 + 0.01);
  g.add(band);

  const halfD = d / 2 + 0.18;
  const slopeLen = Math.hypot(halfD, roofH);
  const roofW = w + 0.4;
  const pitch = Math.atan2(roofH, halfD);
  const rA = new THREE.Mesh(new THREE.PlaneGeometry(roofW, slopeLen), roofMat);
  rA.position.set(0, totalWall + roofH * 0.5, halfD * 0.5);
  rA.rotation.x = -pitch;
  g.add(rA);
  const rB = new THREE.Mesh(new THREE.PlaneGeometry(roofW, slopeLen), roofMat);
  rB.position.set(0, totalWall + roofH * 0.5, -halfD * 0.5);
  rB.rotation.x = pitch;
  g.add(rB);

  const zF = d / 2 + 0.04;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.35, 0.06), doorM);
  door.position.set(0, 0.7, zF);
  g.add(door);

  const bt = 0.12;
  for (const sx of [-w / 2 + bt / 2, w / 2 - bt / 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(bt, totalWall, bt), wood);
    post.position.set(sx, totalWall / 2, zF);
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w, bt, bt), wood);
  beam.position.set(0, baseH + upperH * 0.4, zF);
  g.add(beam);

  return g;
}

/**
 * Load menu FBX (dom1/dom2/mel), fix textures, ground-align, target height.
 * @returns {Promise<THREE.Group|null>}
 */
function loadMenuFbx(fileName, opts) {
  opts = opts || {};
  const targetH = opts.height != null ? opts.height : 3.6;
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (!url || typeof url !== 'string') return url;
    // blob/data — leave
    if (url.indexOf('blob:') === 0 || url.indexOf('data:') === 0) return url;
    // absolute-ish Windows path from FBX — take basename
    let base = url.replace(/\\/g, '/').split('/').pop();
    // strip query
    base = base.split('?')[0];
    // FBX still embeds .png/.jpg names — all rasters are WebP on disk
    const baseWebp = base.replace(/\.(jpe?g|png|tga|bmp)$/i, '.webp');
    const rel = MENU_MODEL_TEX[base] || MENU_MODEL_TEX[baseWebp];
    if (rel) return MENU_MODEL + rel;
    // already under model folder → force webp ext
    if (url.indexOf(MENU_MODEL) === 0) {
      return url.replace(/\.(jpe?g|png|tga|bmp)(\?|$)/i, '.webp$2');
    }
    // basename only next to fbx dir → try fbm guess by fileName
    if (base && base.indexOf('.') > 0 && url.indexOf('/') < 0 && url.indexOf('\\') < 0) {
      if (MENU_MODEL_TEX[baseWebp]) return MENU_MODEL + MENU_MODEL_TEX[baseWebp];
    }
    if (/\.(jpe?g|png|tga|bmp)$/i.test(base)) return MENU_MODEL + baseWebp;
    return url;
  });

  const fbxLoader = new FBXLoader(manager);
  fbxLoader.setPath(MENU_MODEL);
  fbxLoader.setResourcePath(MENU_MODEL);

  return new Promise((resolve) => {
    fbxLoader.load(
      fileName,
      (obj) => {
        try {
          // materials: ONLY diffuse/color map — strip normal/rough/metal/AO/etc.
          obj.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = true;
            const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
            for (let i = 0; i < mats.length; i++) {
              const mat = mats[i];
              if (!mat) continue;
              // keep only albedo (map / color)
              if (mat.map) {
                mat.map.colorSpace = THREE.SRGBColorSpace;
                mat.map.anisotropy = opts.aniso || 2;
              }
              // turn off every other texture slot
              const kill = [
                'normalMap', 'bumpMap', 'displacementMap', 'roughnessMap', 'metalnessMap',
                'aoMap', 'emissiveMap', 'specularMap', 'alphaMap', 'lightMap', 'envMap',
                'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
                'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap',
                'iridescenceMap', 'iridescenceThicknessMap', 'anisotropyMap'
              ];
              for (let k = 0; k < kill.length; k++) {
                if (mat[kill[k]] != null) mat[kill[k]] = null;
              }
              if (mat.normalScale) mat.normalScale.set(1, 1);
              if (mat.bumpScale != null) mat.bumpScale = 0;
              if (mat.displacementScale != null) mat.displacementScale = 0;
              if (mat.metalness != null) mat.metalness = 0;
              if (mat.roughness != null) mat.roughness = 0.85;
              if (mat.emissiveIntensity != null) mat.emissiveIntensity = 0;
              if (mat.emissive && mat.emissive.setHex) mat.emissive.setHex(0x000000);
              if (mat.shininess != null) mat.shininess = 8;
              if (mat.specular && mat.specular.setHex) mat.specular.setHex(0x222222);
              mat.needsUpdate = true;
            }
          });

          // Fit: pivot bottom-center, scale to target height
          obj.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(obj);
          if (!isFinite(box.min.x) || box.isEmpty()) {
            console.warn('[village-fbx] empty bounds', fileName);
            resolve(null);
            return;
          }
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);
          // move mesh so feet at y=0 and xz centered
          obj.position.x += -center.x;
          obj.position.y += -box.min.y;
          obj.position.z += -center.z;

          const wrapper = new THREE.Group();
          wrapper.name = 'fbx_' + fileName.replace(/\.fbx$/i, '');
          wrapper.add(obj);
          const s = targetH / Math.max(size.y, 0.01);
          wrapper.scale.setScalar(s);

          // footprint after scale
          const halfW = Math.max(size.x, size.z) * s * 0.52;
          const halfD = Math.max(size.x, size.z) * s * 0.52;
          wrapper.userData.footprint = { halfW: halfW, halfD: halfD };
          wrapper.userData.sourceFile = fileName;

          // optional sail node for mill rotation
          let sails = null;
          obj.traverse((o) => {
            const n = String(o.name || o.userData.originalName || '').toLowerCase();
            if (/sail|blade|крыл|wing|rotor|prop|мельн|fan|lopast|lopast/.test(n)) {
              if (!sails || (o.children && o.children.length > (sails.children ? sails.children.length : 0))) {
                sails = o;
              }
            }
          });
          // fallback: largest rotating candidate — child group near top third of mill
          if (!sails && /mel/i.test(fileName)) {
            let best = null;
            let bestScore = -1;
            obj.traverse((o) => {
              if (!o.isMesh && o.type !== 'Group' && o.type !== 'Object3D') return;
              if (o === obj) return;
              o.updateWorldMatrix(true, false);
              const wb = new THREE.Box3().setFromObject(o);
              const h = wb.max.y - wb.min.y;
              const w = Math.max(wb.max.x - wb.min.x, wb.max.z - wb.min.z);
              // flat-ish wide object higher up = sails
              if (w > h * 1.2 && wb.min.y > size.y * 0.35) {
                const score = w * (wb.min.y / Math.max(size.y, 1));
                if (score > bestScore) {
                  bestScore = score;
                  best = o;
                }
              }
            });
            sails = best;
          }
          if (sails) {
            wrapper.userData.sails = sails;
            wrapper.userData.sailSpeed = 0.45;
          }

          resolve(wrapper);
        } catch (e) {
          console.warn('[village-fbx] prepare failed', fileName, e);
          resolve(null);
        }
      },
      undefined,
      (err) => {
        console.warn('[village-fbx] load failed', fileName, err);
        resolve(null);
      }
    );
  });
}

/**
 * Windmill from ref (stone base + wood tower + cloth sails)
 * Smooth continuous sail rotation via userData.sailAngle
 * @deprecated procedural fallback if mel.fbx missing
 */
function makeWindmill(m) {
  const g = new THREE.Group();
  g.userData.footprint = { halfW: 3.2, halfD: 3.2 };

  // ground pad
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.7, 0.28, 18),
    m.stoneSolid
  );
  pad.position.y = 0.12;
  pad.receiveShadow = true;
  g.add(pad);

  // stone base cylinder (taller lower third)
  const baseH = 2.4;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.55, 1.75, baseH, 16),
    m.stoneSolid
  );
  base.position.y = 0.28 + baseH / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  // arched door opening (dark recess + door leaf — not filled by beams)
  const doorRecess = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 1.55, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 1 })
  );
  doorRecess.position.set(0, 0.28 + 0.85, 1.55);
  g.add(doorRecess);
  const doorLeaf = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 1.35, 0.08),
    m.doorSolid
  );
  doorLeaf.position.set(0.15, 0.28 + 0.78, 1.72);
  doorLeaf.rotation.y = -0.35;
  g.add(doorLeaf);

  // wooden upper tower
  const woodH = 2.8;
  const wood = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.5, woodH, 14),
    m.timberSolid
  );
  wood.position.y = 0.28 + baseH + woodH / 2;
  wood.castShadow = true;
  g.add(wood);

  // conical roof (shingles)
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.85, 1.7, 14),
    m.roofSolid
  );
  roof.position.y = 0.28 + baseH + woodH + 0.75;
  roof.castShadow = true;
  g.add(roof);
  // spire
  const spire = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.55, 6),
    m.timberSolid
  );
  spire.position.y = roof.position.y + 0.95;
  g.add(spire);

  // hub + sails (smooth group)
  const hubY = 0.28 + baseH + woodH * 0.62;
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.55, 12),
    m.stoneSolid
  );
  hub.rotation.z = Math.PI / 2;
  hub.position.set(0, hubY, 1.55);
  g.add(hub);

  // sails — 2 meshes per blade only (was 8+) so rotation stays cheap
  const sails = new THREE.Group();
  sails.position.set(0, hubY, 1.72);
  const sailLen = 3.6;
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Group();
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, sailLen, 0.12),
      m.timberSolid
    );
    arm.position.y = sailLen * 0.42;
    arm.castShadow = false;
    blade.add(arm);
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, sailLen * 0.75),
      m.sail
    );
    cloth.position.set(0.3, sailLen * 0.42, 0.02);
    cloth.castShadow = false;
    blade.add(cloth);
    blade.rotation.z = (i * Math.PI) / 2;
    sails.add(blade);
  }
  g.add(sails);
  g.userData.sails = sails;
  g.userData.sailAngle = 0;
  g.userData.sailSpeed = 0.5;
  return g;
}

function makeFence(m, length, posts) {
  const g = new THREE.Group();
  const n = posts || Math.max(2, Math.round(length / 1.35) + 1);
  const wood = m.timberSolid;
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), wood);
    p.position.set((i / (n - 1)) * length, 0.45, 0);
    p.castShadow = true;
    g.add(p);
  }
  for (const y of [0.55, 0.32]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.07, 0.07), wood);
    rail.position.set(length / 2, y, 0);
    g.add(rail);
  }
  return g;
}

/** Axis-aligned footprint collision (world XZ) */
function overlapsFootprint(x, z, r, footprints) {
  for (const f of footprints) {
    const dx = Math.abs(x - f.x);
    const dz = Math.abs(z - f.z);
    if (dx < f.halfW + r && dz < f.halfD + r) return true;
  }
  return false;
}

// ─── HALL (select mode) ─────────────────────────────────────

async function buildHall(scene, loader, aniso) {
  const root = new THREE.Group();
  root.name = 'hall';

  const enc = (f) => MENU_TEX + encodeURIComponent(f);
  const [
    texFloor, texWall, texWall2, texWood, texTrim, texTapA, texTapB, texWin
  ] = await Promise.all([
    loadTex(loader, MENU_TEX + 'dlv_slateflr5b.webp', { repeat: [8, 8], aniso, fallback: '#5a5040' }),
    loadTex(loader, MENU_TEX + 'dlv_stonebrk1a.webp', { repeat: [4, 3], aniso, fallback: '#6a6050' }),
    loadTex(loader, MENU_TEX + 'dlv_stonebrk4b.webp', { repeat: [3, 2], aniso, fallback: '#5a5048' }),
    loadTex(loader, MENU_TEX + 'dlv_woodgen1.webp', { repeat: [2, 2], aniso, fallback: '#4a3020' }),
    loadTex(loader, MENU_TEX + 'dlv_stonetrm2b.webp', { repeat: [2, 1], aniso, fallback: '#7a7058' }),
    loadTex(loader, enc('{dlv_tapestry3b.webp'), { repeat: [1, 1], aniso, fallback: '#5a2030' }),
    loadTex(loader, enc('{dlv_tapestry3c.webp'), { repeat: [1, 1], aniso, fallback: '#3a3050' }),
    loadTex(loader, MENU_TEX + 'dlv_window1b.webp', { repeat: [1, 1], aniso, fallback: '#88aacc' })
  ]);

  const matFloor = matStd(texFloor, 0xffffff, 0.88, 0.08);
  const matWall = matStd(texWall, 0xffffff, 0.92, 0.05);
  const matWall2 = matStd(texWall2, 0xffffff, 0.9, 0.06);
  const matWood = matStd(texWood, 0xffffff, 0.85, 0.1);
  const matTrim = matStd(texTrim, 0xddd0a0, 0.7, 0.25);
  const matGold = matStd(null, 0xc9a84c, 0.4, 0.85);
  const matMetal = matStd(null, 0x6a6058, 0.5, 0.7);
  const matTapA = new THREE.MeshStandardMaterial({ map: texTapA, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
  const matTapB = new THREE.MeshStandardMaterial({ map: texTapB, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
  const matWin = new THREE.MeshStandardMaterial({
    map: texWin, roughness: 0.35, metalness: 0.2,
    emissive: 0x223344, emissiveIntensity: 0.25, side: THREE.DoubleSide
  });

  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.85, 64), matGold);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  root.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 48), matTrim);
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 0.025;
  root.add(ring2);

  const hallW = 18, hallD = 20, hallH = 8;
  const back = new THREE.Mesh(new THREE.BoxGeometry(hallW, hallH, 0.6), matWall);
  back.position.set(0, hallH / 2, -hallD / 2);
  back.receiveShadow = true;
  root.add(back);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.6, hallH, hallD), matWall2);
  left.position.set(-hallW / 2, hallH / 2, 0);
  left.receiveShadow = true;
  root.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.6, hallH, hallD), matWall2);
  right.position.set(hallW / 2, hallH / 2, 0);
  right.receiveShadow = true;
  root.add(right);

  const ceil = new THREE.Mesh(
    new THREE.BoxGeometry(hallW, 0.4, hallD),
    matStd(texWood, 0x2a2420, 0.95, 0.05)
  );
  ceil.position.y = hallH;
  root.add(ceil);

  const dais = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 4), matTrim);
  dais.position.set(0, 0.3, -7.2);
  dais.receiveShadow = true;
  root.add(dais);

  // pillars
  function pillar(h) {
    const g = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, h, 12), matWall);
    col.position.y = h / 2;
    col.castShadow = true;
    g.add(col);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 1.3), matWood);
    base.position.y = 0.18;
    g.add(base);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 1.2), matWood);
    cap.position.y = h + 0.1;
    g.add(cap);
    return g;
  }
  for (const x of [-5.5, 5.5]) {
    for (const z of [-3, 3]) {
      const p = pillar(6.5);
      p.position.set(x, 0, z);
      root.add(p);
    }
  }

  // banners
  for (const [x, mat] of [[-7.2, matTapA], [7.2, matTapB], [-5, matTapA], [5, matTapB]]) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 4.5, 6),
      matStd(null, 0x3a2a18, 0.8, 0.2)
    );
    pole.position.y = 2.25;
    g.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.15), mat);
    cloth.position.set(0.55, 2.5, 0);
    g.add(cloth);
    g.position.set(x, 2.2, -8.2);
    if (x > 0) g.rotation.y = Math.PI;
    root.add(g);
  }

  for (const x of [-6, -2, 2, 6]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), matWin);
    win.position.set(x, 4.5, -hallD / 2 + 0.35);
    root.add(win);
  }

  // torches — visual only, NO PointLights (6 point lights froze the scene)
  const torches = [];
  for (const [x, z] of [[-7.5, -3], [7.5, -3], [-4, -7.5], [4, -7.5]]) {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 6), matMetal);
    stick.position.y = 0.35;
    stick.castShadow = false;
    g.add(stick);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.14, 6), matMetal);
    bowl.position.y = 0.75;
    g.add(bowl);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.85 })
    );
    flame.position.y = 0.92;
    flame.scale.set(0.7, 1.3, 0.7);
    g.add(flame);
    g.userData.flame = flame;
    g.userData.light = null;
    g.position.set(x, 2.6, z);
    if (Math.abs(x) > 6) g.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    root.add(g);
    torches.push(g);
  }

  // lights — soft, no shadow maps
  root.add(new THREE.AmbientLight(0x6a6058, 0.55));
  root.add(new THREE.HemisphereLight(0xffe0b0, 0x2a2018, 0.65));
  const key = new THREE.DirectionalLight(0xffe2b8, 1.2);
  key.position.set(4, 12, 6);
  key.castShadow = false;
  root.add(key);
  const rim = new THREE.DirectionalLight(0xaaccff, 0.4);
  rim.position.set(0, 6, -10);
  rim.castShadow = false;
  root.add(rim);

  // character socket on emblem
  const charSocket = new THREE.Group();
  charSocket.position.set(0, 0, 0.2);
  root.add(charSocket);

  root.userData.torches = torches;
  root.userData.charSocket = charSocket;
  scene.add(root);
  return root;
}

// ─── VILLAGE (create mode) — spatial layout ─────────────────

async function buildVillage(scene, loader, aniso) {
  const root = new THREE.Group();
  root.name = 'village';

  function makeProceduralFoliage(type, variant, aniso) {
    const c = document.createElement('canvas');
    c.width = type === 'grass' ? 128 : 256;
    c.height = type === 'grass' ? 128 : 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);

    if (type === 'grass') {
      const blades = 14;
      for (let i = 0; i < blades; i++) {
        const bx = 64 + (Math.random() - 0.5) * 44;
        const by = 128;
        const tipX = bx + (Math.random() - 0.5) * 52;
        const tipY = 16 + Math.random() * 55;
        ctx.beginPath();
        ctx.moveTo(bx - 3.5, by);
        ctx.quadraticCurveTo(bx + (tipX - bx) * 0.5, by - 40, tipX, tipY);
        ctx.quadraticCurveTo(bx + (tipX - bx) * 0.5 + 4, by - 40, bx + 3.5, by);
        ctx.fillStyle = i % 2 === 0 ? '#4d8a35' : '#62a644';
        ctx.fill();
      }
    } else if (type === 'bush') {
      const g = ctx.createRadialGradient(128, 140, 20, 128, 140, 100);
      g.addColorStop(0, '#5a9632');
      g.addColorStop(0.7, '#3d7022');
      g.addColorStop(1, 'rgba(30,60,15,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(128, 140, 95, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // tree canopy
      const g = ctx.createRadialGradient(128, 110, 25, 128, 120, 110);
      g.addColorStop(0, '#66a836');
      g.addColorStop(0.65, '#3d7522');
      g.addColorStop(1, 'rgba(25,55,15,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(128, 110, 105, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = aniso || 4;
    return tex;
  }

  function loadSprite(url, fallbackType, fallbackVariant) {
    return new Promise((resolve) => {
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.magFilter = THREE.LinearFilter;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.anisotropy = aniso || 4;
          resolve(tex);
        },
        undefined,
        () => {
          if (fallbackType) {
            resolve(makeProceduralFoliage(fallbackType, fallbackVariant, aniso));
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  const [
    texGrass, texDirt, texRockA, texRockB,
    t1, t2, t3, t4, k1, k2, g1
  ] = await Promise.all([
    loadTex(loader, 'data/textures/020_Dense_Green_grass_BaseColor.webp', {
      repeat: [16, 16], aniso, fallback: '#5a8a38'
    }),
    loadTex(loader, VILL_TEX + 'dirt.webp', { repeat: [3, 8], aniso, fallback: '#8a7048' }),
    loadTex(loader, 'data/textures/Icelandic_Rock_Detail_ucukfhycw_1K_BaseColor.webp', {
      repeat: [1, 1], aniso, fallback: '#7a7568'
    }),
    loadTex(loader, 'data/textures/Hawaiian_Lava_Stone_tjmledzr_1K_BaseColor.webp', {
      repeat: [1, 1], aniso, fallback: '#6a6560'
    }),
    loadSprite(SPRITE_TEX + 'tree1.webp?v=alpha-1', 'tree', 0),
    loadSprite(SPRITE_TEX + 'tree2.webp?v=alpha-1', 'tree', 1),
    loadSprite(SPRITE_TEX + 'tree3.webp?v=alpha-1', 'tree', 2),
    loadSprite(SPRITE_TEX + 'tree4.webp?v=alpha-1', 'tree', 3),
    loadSprite(SPRITE_TEX + 'kust.webp?v=alpha-1', 'bush', 0),
    loadSprite(SPRITE_TEX + 'kust2.webp?v=alpha-1', 'bush', 1),
    loadSprite(SPRITE_TEX + 'grass1.webp?v=alpha-1', 'grass', 0)
  ]);

  const treeMaps = [t1, t2, t3, t4].filter(Boolean);
  const bushMaps = [k1, k2].filter(Boolean);

  // rock materials (diffuse only, slight tint variants)
  const rockMats = [
    matStd(texRockA, 0xc8c2b4, 0.96, 0.02),
    matStd(texRockB, 0xb0aaa0, 0.95, 0.03),
    matStd(texRockA, 0x9a9588, 0.97, 0.02),
    matStd(texRockB, 0xd0c8b8, 0.94, 0.02),
    matStd(null, 0x8a8680, 0.96, 0.04)
  ];

  // Solid house palette — ref L2 cottage (no UV maps on roofs)
  const m = {
    grass: matStd(texGrass, 0xa8c858, 0.92, 0.02),
    dirt: matStd(texDirt, 0xc4ae88, 0.9, 0.04),
    hill: matStd(texGrass, 0x7aa040, 0.93, 0.02),
    wallSolid: matStd(null, 0xe8dcc0, 0.9, 0.04),
    roofSolid: matStd(null, 0x6a6870, 0.88, 0.05, THREE.DoubleSide), // slate
    thatchSolid: matStd(null, 0xb89048, 0.9, 0.03, THREE.DoubleSide),
    timberSolid: matStd(null, 0x5a3a1c, 0.85, 0.08),
    barkSolid: matStd(null, 0x4a3420, 0.92, 0.04),
    doorSolid: matStd(null, 0x3a2410, 0.88, 0.1),
    stoneSolid: matStd(null, 0x8a8480, 0.92, 0.06),
    rockMats: rockMats,
    glass: new THREE.MeshStandardMaterial({
      color: 0x88b0d0, roughness: 0.2, metalness: 0.25,
      emissive: 0x334455, emissiveIntensity: 0.18
    }),
    sail: new THREE.MeshStandardMaterial({
      color: 0xd8c8a8, roughness: 0.75, metalness: 0.02,
      side: THREE.DoubleSide, transparent: true, opacity: 0.92
    }),
    treeMaps,
    bushMaps,
    grassMap: g1,
    // shared muted grass material (one draw style)
    grassMat: g1 ? spriteMat(g1, 0.28, 0x4a6040, 0.7) : null
  };

  // sky dome (gradient + far clouds baked in — always behind all scene meshes)
  const skyC = document.createElement('canvas');
  skyC.width = SKY_W;
  skyC.height = SKY_H;
  const skyCtx = skyC.getContext('2d');
  paintSkyGradient(skyCtx, SKY_W, SKY_H, 'day', 0, 0);
  const skyTex = new THREE.CanvasTexture(skyC);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  // Repeat on U so offset.x scrolls clouds smoothly without re-paint
  skyTex.wrapS = THREE.RepeatWrapping;
  skyTex.wrapT = THREE.ClampToEdgeWrapping;
  skyTex.offset.set(0, 0);
  skyTex.repeat.set(1, 1);
  skyTex.matrixAutoUpdate = true;
  const skyMesh = new THREE.Mesh(
    new THREE.SphereGeometry(180, 48, 24),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  skyMesh.castShadow = false;
  skyMesh.receiveShadow = false;
  skyMesh.userData.noCast = true;
  skyMesh.renderOrder = -20;
  root.add(skyMesh);
  root.userData.skyCtx = skyCtx;
  root.userData.skyTex = skyTex;
  root.userData.skyMesh = skyMesh;
  root.userData.skyCanvasW = SKY_W;
  root.userData.skyCanvasH = SKY_H;
  root.userData.cloudDrift = 0;
  root.userData._skyPaintPhase = 'day';
  root.userData._skyPaintNight = 0;

  // ground
  const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 72), m.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.castShadow = false;
  ground.userData.receiveShadow = true;
  ground.userData.noCast = true;
  root.add(ground);

  // ── soft gravel: character platform + road to mill (fade edges, no hard cut) ──
  const texPad = makeSoftGroundTexture('pad', {
    w: 512, h: 512,
    color: { r: 145, g: 125, b: 95 },
    color2: { r: 110, g: 95, b: 72 }
  });
  const texRoad = makeSoftGroundTexture('road', {
    w: 256, h: 512,
    color: { r: 138, g: 118, b: 90 },
    color2: { r: 105, g: 90, b: 68 }
  });
  // wide pad under lineup (was hard brown rectangle)
  const pad = makeSoftGroundMesh(texPad, 14.5, 8.5, 0.028);
  pad.position.set(0.9, 0.028, 0.35);
  root.add(pad);
  // road toward windmill (z negative)
  const road = makeSoftGroundMesh(texRoad, 4.2, 22, 0.032);
  road.position.set(0, 0.032, -9.5);
  root.add(road);
  // small soft apron at mill base
  const texMillPad = makeSoftGroundTexture('pad', {
    w: 256, h: 256,
    color: { r: 130, g: 112, b: 88 },
    color2: { r: 100, g: 88, b: 68 }
  });
  const millPad = makeSoftGroundMesh(texMillPad, 9.0, 9.0, 0.034);
  millPad.position.set(0, 0.034, -19.5);
  root.add(millPad);

  // far empty hills
  for (const [x, z, r, sy] of [
    [-28, -34, 12, 0.36],
    [30, -36, 13, 0.34],
    [0, -44, 16, 0.3]
  ]) {
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      m.hill
    );
    hill.position.set(x, -0.4, z);
    hill.scale.y = sy;
    hill.receiveShadow = true;
    root.add(hill);
  }

  // ── houses + mill: FBX from assets/menu/model (dom1, dom2, mel) ──
  const houseDefs = [
    { x: -9.5, z: -5.0, rot: 0.12, file: 'dom1.fbx', height: 3.8 },
    { x: -10.5, z: -13.5, rot: -0.15, file: 'dom2.fbx', height: 3.5 },
    { x: 9.0, z: -5.5, rot: -0.18, file: 'dom2.fbx', height: 3.9 },
    { x: 10.5, z: -14.0, rot: 0.12, file: 'dom1.fbx', height: 3.55 }
  ];
  const footprints = [];

  // template cache: load each unique FBX once, then clone
  const fbxCache = Object.create(null);
  async function getFbxTemplate(file, height) {
    const key = file + '@' + height;
    if (fbxCache[key]) return fbxCache[key];
    const p = loadMenuFbx(file, { height: height, aniso: aniso });
    fbxCache[key] = p;
    return p;
  }

  for (const H of houseDefs) {
    let house = await getFbxTemplate(H.file, H.height);
    if (house) {
      house = house.clone(true);
      // re-bind sails ref after clone (not needed for houses)
      house.userData.sails = null;
    } else {
      // procedural fallback
      house = makeHouse(m, {
        w: 4.0, d: 3.4, roofH: 1.4, slate: H.file.indexOf('dom2') >= 0
      });
    }
    house.position.set(H.x, 0, H.z);
    house.rotation.y = H.rot;
    root.add(house);
    const fp = house.userData.footprint || { halfW: 2.2, halfD: 2.2 };
    footprints.push({
      x: H.x, z: H.z,
      halfW: fp.halfW + 0.45,
      halfD: fp.halfD + 0.45
    });
  }

  // Windmill — FBX mel.fbx at path end
  let windmill = await loadMenuFbx('mel.fbx', { height: 7.2, aniso: aniso });
  if (!windmill) {
    windmill = makeWindmill(m);
  }
  windmill.position.set(0, 0, -19.5);
  root.add(windmill);
  {
    const fp = windmill.userData.footprint || { halfW: 3.5, halfD: 3.5 };
    footprints.push({ x: 0, z: -19.5, halfW: fp.halfW + 0.5, halfD: fp.halfD + 0.5 });
  }

  // fences
  const f1 = makeFence(m, 4.0, 5);
  f1.position.set(2.0, 0, -7.0);
  f1.rotation.y = 0.35;
  root.add(f1);
  const f2 = makeFence(m, 3.0, 4);
  f2.position.set(5.0, 0, -8.5);
  f2.rotation.y = -0.2;
  root.add(f2);

  // create-cam XZ (must match CREATE_CAM) — orient sprites toward viewer
  const CAM_X = 0.9;
  const CAM_Z = 9.8;

  // ── trees: dense ring + groves + far forest ──
  const treeCandidates = [
    // near frame L
    [-11.0, 2.5, 1.15], [-12.5, 0.5, 1.25], [-13.5, -2.0, 1.35],
    [-14.0, -5.0, 1.3], [-13.2, -8.5, 1.4], [-12.5, -12.0, 1.25],
    [-11.0, -15.5, 1.2], [-8.5, -18.0, 1.2],
    [-15.5, -3.0, 1.2], [-15.8, -7.0, 1.35], [-14.8, -10.5, 1.15],
    [-16.0, -14.0, 1.4], [-12.0, -17.5, 1.3], [-9.5, -20.0, 1.15],
    // near frame R
    [11.5, 2.2, 1.15], [13.0, 0.2, 1.25], [14.0, -2.2, 1.35],
    [14.5, -5.2, 1.3], [13.8, -8.8, 1.4], [12.8, -12.5, 1.25],
    [11.2, -16.0, 1.2], [8.5, -18.2, 1.2],
    [15.8, -3.2, 1.2], [16.0, -7.2, 1.35], [15.0, -11.0, 1.15],
    [16.2, -14.5, 1.4], [12.5, -18.0, 1.3], [9.8, -20.2, 1.15],
    // mid fill between houses
    [-9.5, -4.0, 1.05], [9.8, -4.5, 1.05],
    [-9.0, -10.0, 1.1], [9.2, -10.5, 1.1],
    [-8.0, -7.0, 0.95], [8.2, -7.5, 0.95],
    [-8.5, -15.5, 1.05], [8.8, -16.0, 1.05],
    // behind mill (depth forest)
    [-6.5, -22.5, 1.35], [6.5, -22.5, 1.35],
    [-3.0, -24.5, 1.4], [3.0, -24.5, 1.4],
    [0.0, -26.5, 1.55],
    [-8.5, -26.0, 1.45], [8.5, -26.5, 1.45],
    [-5.0, -29.0, 1.5], [5.5, -29.5, 1.5],
    [-10.0, -30.0, 1.4], [10.0, -30.5, 1.4],
    [0.0, -32.0, 1.6],
    [-12.5, -24.0, 1.5], [12.5, -24.5, 1.5],
    [-7.0, -31.5, 1.55], [7.0, -32.0, 1.55],
    [-2.5, -28.0, 1.35], [2.5, -28.5, 1.35],
    [-14.0, -28.0, 1.45], [14.0, -28.5, 1.45],
    [0.0, -35.0, 1.7], [-9.0, -34.0, 1.55], [9.0, -34.5, 1.55],
    // front corners (frame)
    [-10.0, 3.8, 1.05], [10.5, 3.5, 1.05],
    [-13.5, 4.0, 1.2], [14.0, 3.8, 1.2]
  ];
  const treeList = [];
  const swayList = [];
  let ti = 0;
  for (const [x, z, s] of treeCandidates) {
    const r = 1.5 * s;
    if (overlapsFootprint(x, z, r, footprints)) continue;
    if (Math.abs(x) < 5.5 && z > -1.5 && z < 2.5) continue;
    if (!treeMaps.length) break;
    const tree = makeSpriteTree(m, s, ti++, x, z, CAM_X, CAM_Z);
    tree.position.set(x, 0, z);
    // trunk casts, canopy soft-casts
    tree.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = false;
    });
    root.add(tree);
    treeList.push(tree);
    footprints.push({ x, z, halfW: r * 0.48, halfD: r * 0.48 });
  }
  root.userData.treeList = treeList;

  // ── rocks: path edges, house corners, mill base, far field ──
  const rockCandidates = [
    // path sides
    [-2.2, -2.0, 0.55, 0], [2.4, -3.5, 0.45, 1], [-2.6, -6.0, 0.7, 2],
    [2.8, -8.5, 0.5, 3], [-2.4, -11.0, 0.6, 4], [2.5, -13.5, 0.48, 0],
    [-2.0, -16.0, 0.55, 1], [2.2, -18.0, 0.65, 2],
    // near houses L
    [-7.2, -4.2, 0.85, 3], [-6.5, -6.8, 0.5, 1], [-8.0, -12.0, 0.7, 0],
    [-7.5, -14.5, 0.55, 4], [-5.5, -5.0, 0.4, 2],
    // near houses R
    [7.0, -4.5, 0.8, 2], [6.8, -7.0, 0.5, 0], [8.2, -12.5, 0.72, 1],
    [7.5, -15.0, 0.55, 3], [5.8, -5.5, 0.42, 4],
    // mill pad
    [-2.8, -18.5, 0.9, 1], [3.0, -19.0, 0.75, 3], [-1.5, -21.0, 0.55, 0],
    [1.8, -21.2, 0.6, 2], [-3.5, -20.5, 0.45, 4], [3.6, -20.8, 0.5, 1],
    // front frame
    [-5.5, 1.5, 0.65, 2], [5.8, 1.2, 0.55, 0], [-4.0, 2.5, 0.4, 3],
    [4.2, 2.2, 0.48, 1], [-6.5, 0.2, 0.7, 4], [6.8, 0.0, 0.6, 2],
    // scattered mid field
    [-12.0, -6.5, 1.0, 0], [12.5, -7.0, 0.95, 1],
    [-11.5, -16.0, 0.85, 2], [11.8, -16.5, 0.8, 3],
    [-4.5, -9.0, 0.45, 4], [4.8, -9.5, 0.5, 0],
    [-15.0, -20.0, 1.1, 1], [15.2, -20.5, 1.05, 2],
    [0.0, -23.5, 0.7, 3], [-5.5, -25.0, 0.9, 0], [5.5, -25.5, 0.85, 1]
  ];
  let ri = 0;
  for (const [x, z, s, v] of rockCandidates) {
    const r = 0.55 * s;
    if (overlapsFootprint(x, z, r, footprints)) continue;
    if (Math.abs(x) < 3.2 && z > -1.0 && z < 2.2) continue; // clear character row
    const rock = makeRock(m, s, v != null ? v : ri);
    rock.position.set(x, 0, z);
    rock.rotation.y = (ri * 0.9) % (Math.PI * 2);
    root.add(rock);
    footprints.push({ x, z, halfW: r + 0.15, halfD: r + 0.15 });
    ri++;
  }

  // ── bushes: many along path, houses, mill ──
  const bushCandidates = [
    [-7.2, -1.5, 1.0], [-7.8, -3.5, 0.95], [-8.0, -6.0, 1.05],
    [-7.0, -8.5, 0.9], [-6.5, -11.0, 1.0], [-5.8, -13.5, 0.95],
    [-5.2, -16.0, 0.9], [-4.8, -18.5, 0.85], [-6.0, -20.5, 0.9],
    [7.4, -1.8, 1.0], [8.0, -3.8, 0.95], [8.2, -6.2, 1.05],
    [7.2, -8.8, 0.9], [6.8, -11.2, 1.0], [6.0, -13.8, 0.95],
    [5.4, -16.2, 0.9], [5.0, -18.8, 0.85], [6.2, -20.8, 0.9],
    [-10.5, 0.5, 0.95], [-11.0, -5.5, 1.0], [-10.0, -14.0, 0.95],
    [10.8, 0.2, 0.95], [11.2, -5.8, 1.0], [10.2, -14.5, 0.95],
    [-3.8, -7.5, 0.85], [3.8, -7.8, 0.85],
    [-3.5, -12.0, 0.8], [3.5, -12.5, 0.8],
    [-4.0, -22.0, 0.95], [4.0, -22.2, 0.95],
    [-2.0, -25.0, 0.9], [2.0, -25.2, 0.9],
    // extra fill
    [-9.0, -2.0, 0.9], [9.2, -2.5, 0.9],
    [-12.5, -9.0, 1.0], [12.8, -9.5, 1.0],
    [-6.5, -23.5, 0.95], [6.5, -24.0, 0.95],
    [-1.5, -4.5, 0.7], [1.6, -5.0, 0.7]
  ];
  let bi = 0;
  for (const [x, z, s] of bushCandidates) {
    if (overlapsFootprint(x, z, 0.75 * s, footprints)) continue;
    if (Math.abs(x) < 4.2 && z > -1.2 && z < 2.2) continue;
    if (!bushMaps.length) break;
    const bush = makeSpriteBush(m, s, bi++, x, z, CAM_X, CAM_Z);
    bush.position.set(x, 0, z);
    bush.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
    });
    root.add(bush);
    swayList.push(bush);
    footprints.push({ x, z, halfW: 0.55 * s, halfD: 0.55 * s });
  }
  root.userData.billboards = [];
  root.userData.swayList = swayList;

  // clouds: baked into sky dome texture (see paintSkyClouds) — no 3D planes
  root.userData.cloudList = [];

  // ── moon (WorldTime night) ──
  let moonTex = makeMoonTexture();
  // prefer real asset if available
  try {
    const ml = new THREE.TextureLoader();
    ml.load('data/textures/moon.webp', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      if (root.userData.moon && root.userData.moon.material) {
        root.userData.moon.material.map = tex;
        root.userData.moon.material.needsUpdate = true;
      }
      moonTex = tex;
    }, undefined, () => { /* keep canvas fallback */ });
  } catch (e) { /* */ }
  const moon = makeMoonMesh(moonTex);
  moon.position.set(-20, 18, -20);
  moon.visible = false;
  root.add(moon);
  root.userData.moon = moon;

  // lights + soft shadows (driven by applyVillageTod / WorldTime)
  const ambient = new THREE.AmbientLight(0xffe8c8, 0.52);
  root.add(ambient);
  root.userData.ambient = ambient;
  const hemi = new THREE.HemisphereLight(0xffd0a0, 0x3a5a28, 0.62);
  root.add(hemi);
  root.userData.hemi = hemi;

  const sun = new THREE.DirectionalLight(0xffe0b0, 1.25);
  sun.position.set(-14, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 70;
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2.5;
  sun.target.position.set(0, 0, -8);
  root.add(sun);
  root.add(sun.target);
  root.userData.sun = sun;

  const moonLight = new THREE.DirectionalLight(0xa8c8ff, 0);
  moonLight.position.set(14, 18, -10);
  moonLight.castShadow = false;
  moonLight.target.position.set(0, 0, -8);
  root.add(moonLight);
  root.add(moonLight.target);
  root.userData.moonLight = moonLight;

  const fill = new THREE.DirectionalLight(0xa8c8ff, 0.35);
  fill.position.set(12, 8, 12);
  fill.castShadow = false;
  root.add(fill);
  root.userData.fillLight = fill;

  // Front key for lineup characters (boosted at night in applyVillageTod)
  const charKey = new THREE.DirectionalLight(0xd0e4ff, 0);
  charKey.position.set(0.5, 4.5, 8);
  charKey.target.position.set(0.8, 1.0, 0);
  charKey.castShadow = false;
  root.add(charKey);
  root.add(charKey.target);
  root.userData.charKeyLight = charKey;

  const lineupRoot = new THREE.Group();
  lineupRoot.position.set(0, 0, 0.5);
  root.add(lineupRoot);

  // houses / mill cast shadows
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.noCast) {
      o.castShadow = false;
      return;
    }
    // FBX houses/mill, rocks, trees already set; ensure
    if (o.material && o.material.map && o.material.transparent && o.material.opacity < 0.95) {
      // canopy/bush sprites: cast
      o.castShadow = true;
    }
  });
  // force FBX props
  for (const ch of root.children) {
    if (ch.name && (ch.name.indexOf('fbx_') === 0 || ch === windmill)) {
      ch.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
    }
  }

  root.userData.windmill = windmill;
  root.userData.lineupRoot = lineupRoot;
  scene.add(root);
  return root;
}

// ─── main ───────────────────────────────────────────────────

export async function createCharSelectRoom(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // big win on weak GPUs; scene is soft-lit anyway
    powerPreference: 'high-performance',
    alpha: false
  });
  // DPR 1 on low-end, max 1.25 otherwise
  const dpr = Math.min(devicePixelRatio || 1, 1.25);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // cheaper than ACES
  renderer.toneMappingExposure = 1;
  // soft shadows for create-village (enabled only in create mode)
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.15, 250);

  const loader = new THREE.TextureLoader();
  const aniso = Math.min(2, renderer.capabilities.getMaxAnisotropy());

  // build both worlds; only one attached to scene at a time
  const hall = await buildHall(scene, loader, aniso);
  const village = await buildVillage(scene, loader, aniso);
  // start in select: village detached until create
  if (village.parent) scene.remove(village);

  // freeze static meshes — less matrix work per frame
  function isUnder(obj, roots) {
    let p = obj;
    while (p) {
      if (roots.indexOf(p) >= 0) return true;
      p = p.parent;
    }
    return false;
  }
  function freezeExcept(root, keepRoots, opts) {
    opts = opts || {};
    const keepShadows = !!opts.keepShadows;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (!keepShadows) {
        o.castShadow = false;
        o.receiveShadow = false;
      } else {
        // preserve build-time flags; ground receives only
        if (o.userData.noCast) o.castShadow = false;
        if (o.userData.receiveShadow) o.receiveShadow = true;
      }
      o.matrixAutoUpdate = isUnder(o, keepRoots);
    });
  }
  const hallLive = (hall.userData.torches || []).concat(
    hall.userData.charSocket ? [hall.userData.charSocket] : []
  );
  freezeExcept(hall, hallLive, { keepShadows: false });
  const villageLive = [];
  if (village.userData.windmill) villageLive.push(village.userData.windmill);
  if (village.userData.lineupRoot) villageLive.push(village.userData.lineupRoot);
  const sl = village.userData.swayList || [];
  for (let i = 0; i < sl.length; i++) villageLive.push(sl[i]);
  const tl = village.userData.treeList || [];
  for (let i = 0; i < tl.length; i++) villageLive.push(tl[i]);
  freezeExcept(village, villageLive, { keepShadows: true });

  // characters (2D sprites + 3D engi_m FBX)
  const lineupChars = [];
  for (const def of LINEUP) {
    const appear = { hairId: 'none' };
    // Engineer male: hair + starter hand weapon (resonator = icon only, no 3D)
    if (def.id === 'engi_m' || (def.cls === 'engineer' && def.gender === 'male' && def.use3d)) {
      appear.hairId = 'hair1';
      appear.weaponId = 'apprentice_wand';
    } else if (def.cls === 'engineer') {
      appear.weaponId = 'apprentice_wand';
    }
    const c = await createLineupCharacter(loader, def, aniso, {
      height: def.use3d ? 1.85 : 2.4,
      widthMul: 1.08, // was ~0.68 — stretch width so body isn't squashed
      appearance: appear
    });
    c.position.set(def.x, 0, 0);
    // 3D: face +Z toward camera (do NOT apply π — that shows the back)
    if (c.userData.is3d && c.userData.charInst && c.userData.charInst.def) {
      const sy = c.userData.charInst.def.selectYaw;
      c.rotation.y = sy != null ? sy : 0;
    }
    village.userData.lineupRoot.add(c);
    lineupChars.push(c);
  }

  // hall character pool — never dispose/recreate sheets (was leaking + GPU thrash)
  const hallCharPool = new Map(); // id -> Group
  let hallChar = null;

  async function ensureHallChar(cls, gender, appearance) {
    const def = LINEUP.find((d) => d.cls === (cls || 'operator') && d.gender === (gender || 'male'))
      || LINEUP[0];
    const key = def.id;
    if (hallChar && hallChar.userData.id === key) {
      if (hallChar.userData.ring) hallChar.userData.ring.visible = true;
      // still apply hair (pool char may be bald from first create)
      await applyAppearanceToChar(hallChar, appearance);
      return hallChar;
    }
    if (hallChar && hallChar.parent) hallChar.parent.remove(hallChar);

    if (!hallCharPool.has(key)) {
      const ch = await createLineupCharacter(loader, def, aniso, {
        height: def.use3d ? 1.85 : 2.55,
        widthMul: 1.1,
        appearance: appearance || { hairId: 'none' }
      });
      ch.matrixAutoUpdate = true;
      ch.traverse((o) => { o.matrixAutoUpdate = true; });
      // hall: face +Z toward camera
      if (ch.userData.is3d && ch.userData.charInst && ch.userData.charInst.def) {
        const sy = ch.userData.charInst.def.selectYaw;
        ch.rotation.y = sy != null ? sy : 0;
      } else if (ch.userData.is3d) {
        ch.rotation.y = 0;
      }
      hallCharPool.set(key, ch);
    }
    hallChar = hallCharPool.get(key);
    hallChar.position.set(0, 0, 0);
    if (hallChar.userData.ring) hallChar.userData.ring.visible = true;
    hall.userData.charSocket.add(hallChar);
    await applyAppearanceToChar(hallChar, appearance);
    return hallChar;
  }

  async function applyAppearanceToChar(charRoot, appearance) {
    if (!charRoot || !appearance) return;
    const inst = charRoot.userData.charInst;
    if (!inst) return;
    try {
      if (typeof inst.setHair === 'function') {
        await inst.setHair(appearance.hairId || 'none', {
          color: appearance.hairColor || null
        });
      }
      if (typeof inst.setFace === 'function' && appearance.faceId) {
        await inst.setFace(appearance.faceId);
      }
      // Hand weapon from equip/appearance (resonator has no 3D mesh)
      if (typeof inst.setWeapon === 'function') {
        let wId = appearance.weaponId && appearance.weaponId !== 'engineer_emitter_low'
          ? appearance.weaponId
          : null;
        // equip.weapon snapshot from char card (after gameplay)
        if (!wId && appearance.equip && appearance.equip.weapon) {
          const e = appearance.equip.weapon;
          const tid = String(e.templateId || e.id || '').toLowerCase();
          if (tid && tid !== 'engineer_emitter_low') wId = tid;
        }
        await inst.setWeapon(wId);
      }
    } catch (e) {
      console.warn('[char-select] applyAppearance fail', e);
    }
  }

  let mode = 'select'; // 'select' | 'create'
  let selectedId = LINEUP[0].id;
  let pickCb = null;
  let camT = 0;

  function setSelectedVisual(id) {
    selectedId = id;
    for (const c of lineupChars) {
      const on = c.userData.id === id;
      if (c.userData.ring) c.userData.ring.visible = on && mode === 'create';
      c.scale.setScalar(on && mode === 'create' ? 1.05 : 1.0);
    }
  }

  // reuse fog/bg — don't allocate Color/Fog every switch (GC spikes)
  const bgCreate = new THREE.Color(0xe8a868);
  const bgSelect = new THREE.Color(0x1a1814);
  const fogCreate = new THREE.FogExp2(0xd8a878, 0.006);
  const fogSelect = new THREE.FogExp2(0x2a2218, 0.018);
  const CREATE_CAM = { x: 0.9, y: 2.55, z: 9.8, lx: 0.8, ly: 1.15, lz: -2 };

  // WorldTime anchor (server /api/world-time or local fallback)
  let timeAnchor = null;
  let timeSyncAcc = 0;
  fetchWorldTimeAnchor().then((a) => {
    timeAnchor = a;
    if (mode === 'create') {
      applyVillageTod(village, extrapolateTod(timeAnchor), camera);
      syncCreateAtmosphere();
    }
  });

  function syncCreateAtmosphere() {
    const tod = extrapolateTod(timeAnchor);
    applyVillageTod(village, tod, camera);
    const night = village.userData._nightAmt || 0;
    const phase = village.userData._todPhase || 'day';
    // scene bg + fog follow phase
    if (phase === 'night' || night > 0.7) {
      bgCreate.setHex(0x0a1020);
      fogCreate.color.setHex(0x182438);
      // lighter fog so village/chars don't sink into black
      fogCreate.density = 0.006;
    } else if (phase === 'twilight') {
      bgCreate.setHex(0x402838);
      fogCreate.color.setHex(0x503040);
      fogCreate.density = 0.009;
    } else if (phase === 'golden') {
      bgCreate.setHex(0xe8a868);
      fogCreate.color.setHex(0xd8a878);
      fogCreate.density = 0.006;
    } else {
      bgCreate.setHex(0xa8c8e0);
      fogCreate.color.setHex(0xc0d4e8);
      fogCreate.density = 0.0045;
    }
    if (mode === 'create') {
      scene.background = bgCreate;
      scene.fog = fogCreate;
      // night: slightly brighter exposure so materials stay readable
      renderer.toneMappingExposure = night > 0.5 ? 1.08 : 1.0;
    }
  }

  function applyModeCam() {
    if (mode === 'create') {
      syncCreateAtmosphere();
      scene.background = bgCreate;
      scene.fog = fogCreate;
      camera.fov = 38;
      camera.position.set(CREATE_CAM.x, CREATE_CAM.y, CREATE_CAM.z);
      camera.lookAt(CREATE_CAM.lx, CREATE_CAM.ly, CREATE_CAM.lz);
    } else {
      scene.background = bgSelect;
      scene.fog = fogSelect;
      camera.fov = 42;
      camera.position.set(0, 2.35, 7.2);
      camera.lookAt(0, 1.15, 0);
      renderer.toneMappingExposure = 1.0;
    }
    camera.updateProjectionMatrix();
  }

  function setCreateMode(on) {
    mode = on ? 'create' : 'select';
    // detach inactive world — don't traverse/render 300 meshes of the other scene
    if (on) {
      if (hall.parent) scene.remove(hall);
      if (!village.parent) scene.add(village);
      village.visible = true;
      renderer.shadowMap.enabled = true;
      for (const c of lineupChars) {
        const def = LINEUP.find((d) => d.id === c.userData.id);
        c.position.set(def ? def.x : 0, 0, 0);
        c.visible = true;
        // soft contact shadow from character sprites
        c.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = false;
          }
        });
      }
      setSelectedVisual(selectedId);
      // refresh time when entering create
      fetchWorldTimeAnchor().then((a) => {
        timeAnchor = a;
        syncCreateAtmosphere();
      });
    } else {
      if (village.parent) scene.remove(village);
      if (!hall.parent) scene.add(hall);
      hall.visible = true;
      renderer.shadowMap.enabled = false;
      for (const c of lineupChars) {
        if (c.userData.ring) c.userData.ring.visible = false;
      }
    }
    applyModeCam();
  }

  async function setCharacter(cls, gender, appearance) {
    setCreateMode(false);
    await ensureHallChar(cls, gender, appearance || null);
  }

  function clearCharacter() {
    setCreateMode(false);
    if (hallChar) {
      hall.userData.charSocket.remove(hallChar);
      hallChar = null;
    }
  }

  function setCreateSelection(cls, gender) {
    if (mode !== 'create') setCreateMode(true);
    const match = lineupChars.find(
      (c) => c.userData.cls === cls && c.userData.gender === (gender || 'male')
    );
    if (match) setSelectedVisual(match.userData.id);
  }

  /**
   * Live hair / face / starter weapon preview on 3D engineer (male) in create lineup.
   * @param {{ hairId?: string, hairColor?: string, faceId?: string, weaponId?: string }} appearance
   */
  /** Serialize appearance applies so rapid face/hair clicks don't race/blink. */
  let _appearSeq = 0;

  async function setCreateAppearance(appearance) {
    appearance = appearance || {};
    const hairId = appearance.hairId || 'none';
    const hairColor = appearance.hairColor || null;
    const faceId = appearance.faceId || 'face1';
    // Starter / preview weapon (engineer staff). Resonator has no mesh.
    let wId = appearance.weaponId && appearance.weaponId !== 'engineer_emitter_low'
      ? appearance.weaponId
      : null;
    // When create form is engineer, always show starter hand weapon if none set
    if (!wId) wId = 'apprentice_wand';
    const engi = lineupChars.find((c) => c.userData.id === 'engi_m');
    if (!engi) {
      console.warn('[char-select] setCreateAppearance: no engi_m in lineup');
      return;
    }
    const inst = engi.userData.charInst;
    if (!inst) {
      console.warn('[char-select] setCreateAppearance: engi_m has no charInst (3D failed?)');
      return;
    }
    const seq = ++_appearSeq;
    try {
      // Face first (texture swap only — no hair rebuild)
      if (typeof inst.setFace === 'function') {
        await inst.setFace(faceId);
      }
      if (seq !== _appearSeq) return;
      // Hair: color-only is sync; style change is atomic (no bald frame)
      if (typeof inst.setHair === 'function') {
        await inst.setHair(hairId, { color: hairColor });
      }
      if (seq !== _appearSeq) return;
      // Hand equip visual (starter Ударник / later magic_mace etc.)
      if (typeof inst.setWeapon === 'function') {
        await inst.setWeapon(wId);
      }
      if (seq !== _appearSeq) return;
      engi.updateMatrixWorld(true);
    } catch (e) {
      console.warn('[char-select] setCreateAppearance fail', e);
    }
  }

  function getCreateSelection() {
    const c = lineupChars.find((x) => x.userData.id === selectedId);
    return c
      ? { cls: c.userData.cls, gender: c.userData.gender, id: c.userData.id, label: c.userData.label }
      : { cls: 'operator', gender: 'male', id: 'oper_m', label: 'Оператор · М' };
  }

  function onCharacterPick(fn) {
    pickCb = typeof fn === 'function' ? fn : null;
  }

  // raycast pick (create only)
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pickAt(clientX, clientY) {
    if (mode !== 'create') return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const targets = lineupChars.map((c) => c.userData.plane).filter(Boolean);
    const hits = raycaster.intersectObjects(targets, false);
    if (!hits.length) return;
    const owner = hits[0].object.userData.owner;
    if (!owner) return;
    setSelectedVisual(owner.userData.id);
    if (pickCb) {
      pickCb({
        cls: owner.userData.cls,
        gender: owner.userData.gender,
        id: owner.userData.id,
        label: owner.userData.label
      });
    }
  }
  function onPointerDown(e) {
    if (e.button === 0) pickAt(e.clientX, e.clientY);
  }
  canvas.addEventListener('pointerdown', onPointerDown);

  // default: select hall empty until setCharacter
  setCreateMode(false);
  applyModeCam();

  function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  }
  window.addEventListener('resize', onResize);

  let last = performance.now();
  let running = true;

  // integrated phases (delta-time) — same speed on 30/60/144 Hz
  let millAngle = 0;
  let hallCamPhase = 0;
  let torchPhase = 0;
  // max step: after tab pause don't simulate a huge catch-up jump
  const MAX_DT = 0.05; // 20 FPS floor for sim; slower devices just drop frames, not speed

  // ── debug FPS UI + freeze/drop graph ──
  const fpsEl = document.getElementById('cs-debug-fps');
  const fpsTextEl = document.getElementById('cs-debug-fps-text') || fpsEl;
  const fpsGraph = document.getElementById('cs-debug-fps-graph');
  const gctx = fpsGraph ? fpsGraph.getContext('2d') : null;
  const GRAPH_N = 120; // ~2s history at 60fps sample rate (we push every frame)
  const histFps = new Float32Array(GRAPH_N);
  const histMs = new Float32Array(GRAPH_N);
  let histWrite = 0;
  let histCount = 0;
  let spikeCount = 0; // frames > 33ms since start
  let maxSpikeMs = 0;

  let fpsFrames = 0;
  let fpsAcc = 0;
  let fpsLastShow = performance.now();
  let fpsSmoothed = 0;
  let fpsMsSmoothed = 0;

  function pushSample(fpsInst, msInst) {
    histFps[histWrite] = fpsInst;
    histMs[histWrite] = msInst;
    histWrite = (histWrite + 1) % GRAPH_N;
    if (histCount < GRAPH_N) histCount++;
    if (msInst > 33) {
      spikeCount++;
      if (msInst > maxSpikeMs) maxSpikeMs = msInst;
    }
  }

  let graphDirty = true;
  let lastGraphDraw = 0;

  function drawFpsGraph(now) {
    if (!gctx || !fpsGraph) return;
    // redraw graph at ~12 Hz, not every frame
    if (now - lastGraphDraw < 80 && !graphDirty) return;
    lastGraphDraw = now;
    graphDirty = false;
    const w = fpsGraph.width;
    const h = fpsGraph.height;
    gctx.clearRect(0, 0, w, h);

    // background bands: 60 / 30 / 15 fps
    gctx.fillStyle = 'rgba(0,0,0,0.35)';
    gctx.fillRect(0, 0, w, h);

    const y60 = h * (1 - 60 / 90);
    const y30 = h * (1 - 30 / 90);
    const y15 = h * (1 - 15 / 90);
    gctx.strokeStyle = 'rgba(255,255,255,0.08)';
    gctx.lineWidth = 1;
    gctx.beginPath();
    gctx.moveTo(0, y60); gctx.lineTo(w, y60);
    gctx.moveTo(0, y30); gctx.lineTo(w, y30);
    gctx.moveTo(0, y15); gctx.lineTo(w, y15);
    gctx.stroke();

    // labels
    gctx.fillStyle = 'rgba(255,255,255,0.25)';
    gctx.font = '9px monospace';
    gctx.fillText('60', 2, y60 - 2);
    gctx.fillText('30', 2, y30 - 2);

    if (histCount < 2) return;

    // frame-ms bars (spikes) — blue fill under 50ms scale, red if spike
    const maxMsScale = 50;
    for (let i = 0; i < histCount; i++) {
      const idx = (histWrite - histCount + i + GRAPH_N) % GRAPH_N;
      const ms = histMs[idx];
      const x = (i / (GRAPH_N - 1)) * (w - 1);
      const bh = Math.min(h, (ms / maxMsScale) * h);
      gctx.fillStyle = ms > 33 ? 'rgba(255,70,60,0.55)' : 'rgba(80,150,255,0.22)';
      gctx.fillRect(x, h - bh, Math.max(1, w / GRAPH_N), bh);
    }

    // FPS curve — green line, scale 0..90
    gctx.beginPath();
    gctx.strokeStyle = '#6dce5a';
    gctx.lineWidth = 1.5;
    gctx.lineJoin = 'round';
    for (let i = 0; i < histCount; i++) {
      const idx = (histWrite - histCount + i + GRAPH_N) % GRAPH_N;
      const fps = Math.min(90, histFps[idx]);
      const x = (i / (GRAPH_N - 1)) * (w - 1);
      const y = h * (1 - fps / 90);
      if (i === 0) gctx.moveTo(x, y);
      else gctx.lineTo(x, y);
    }
    gctx.stroke();

    // 33ms spike markers on top of FPS line
    gctx.fillStyle = '#ff6a5a';
    for (let i = 0; i < histCount; i++) {
      const idx = (histWrite - histCount + i + GRAPH_N) % GRAPH_N;
      if (histMs[idx] <= 33) continue;
      const x = (i / (GRAPH_N - 1)) * (w - 1);
      const fps = Math.min(90, histFps[idx]);
      const y = h * (1 - fps / 90);
      gctx.fillRect(x - 1, y - 1, 3, 3);
    }
  }

  function updateDebugFps(now, frameMs) {
    if (!fpsEl) return;

    // per-frame sample for graph (instantaneous)
    const msInst = frameMs > 0 && frameMs < 500 ? frameMs : 16.7;
    const fpsInst = msInst > 0 ? 1000 / msInst : 0;
    pushSample(fpsInst, msInst);
    graphDirty = true;
    drawFpsGraph(now);

    // text refresh ~4×/s
    fpsFrames++;
    fpsAcc += msInst;
    const elapsed = now - fpsLastShow;
    if (elapsed < 250) return;
    const fps = (fpsFrames * 1000) / elapsed;
    const ms = fpsAcc / fpsFrames;
    fpsSmoothed = fpsSmoothed ? fpsSmoothed * 0.55 + fps * 0.45 : fps;
    fpsMsSmoothed = fpsMsSmoothed ? fpsMsSmoothed * 0.55 + ms * 0.45 : ms;
    fpsFrames = 0;
    fpsAcc = 0;
    fpsLastShow = now;

    const info = renderer.info;
    const calls = info.render.calls;
    const tris = info.render.triangles;
    const geo = info.memory.geometries;
    const tex = info.memory.textures;
    const dpr = renderer.getPixelRatio().toFixed(2);
    const modeStr = mode === 'create' ? 'create' : 'select';

    fpsEl.classList.remove('ok', 'warn', 'bad');
    if (fpsSmoothed >= 55) fpsEl.classList.add('ok');
    else if (fpsSmoothed >= 30) fpsEl.classList.add('warn');
    else fpsEl.classList.add('bad');

    const text =
      'FPS  ' + fpsSmoothed.toFixed(0) +
      '  (' + fpsMsSmoothed.toFixed(1) + ' ms)\n' +
      'mode ' + modeStr + '  dpr ' + dpr + '\n' +
      'draw ' + calls + '  tris ' + tris + '\n' +
      'geo  ' + geo + '  tex ' + tex + '\n' +
      'spikes>33ms  ' + spikeCount +
      '  max ' + maxSpikeMs.toFixed(0) + 'ms';

    if (fpsTextEl) fpsTextEl.textContent = text;
    else fpsEl.textContent = text;
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);

    // ── delta time (seconds) ──
    let dt = (now - last) * 0.001;
    const rawMs = (now - last);
    last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    if (dt > MAX_DT) dt = MAX_DT; // clamp spike only; do NOT replace with 1/60

    if (mode === 'create') {
      // camera fixed once in applyModeCam — no lookAt/set every frame

      const wm = village.userData.windmill;
      if (wm && wm.userData.sails) {
        const spd = wm.userData.sailSpeed != null ? wm.userData.sailSpeed : 0.5;
        millAngle += spd * dt;
        wm.userData.sails.rotation.z = millAngle;
      }

      for (const c of lineupChars) {
        if (c.visible) tickSprite(c, dt);
      }

      // light wind (delta time) — bushes + tree canopies
      const swayList = village.userData.swayList || [];
      for (let i = 0; i < swayList.length; i++) {
        const b = swayList[i];
        if (!b.userData.sway) continue;
        const amp = b.userData.swayAmp != null ? b.userData.swayAmp : 0.03;
        const spd = b.userData.swaySpeed != null ? b.userData.swaySpeed : 0.7;
        if (b.userData.swayPhase == null) b.userData.swayPhase = 0;
        b.userData.swayPhase += spd * dt;
        b.rotation.z = Math.sin(b.userData.swayPhase) * amp;
      }
      const trees = village.userData.treeList || [];
      for (let i = 0; i < trees.length; i++) {
        const tr = trees[i];
        const can = tr.userData.canopy;
        if (!can || !tr.userData.swayCanopy) continue;
        const amp = tr.userData.swayAmp != null ? tr.userData.swayAmp : 0.022;
        const spd = tr.userData.swaySpeed != null ? tr.userData.swaySpeed : 0.5;
        if (tr.userData.swayPhase == null) tr.userData.swayPhase = 0;
        tr.userData.swayPhase += spd * dt;
        const w = Math.sin(tr.userData.swayPhase);
        can.rotation.z = w * amp;
        can.rotation.y = Math.sin(tr.userData.swayPhase * 0.65) * amp * 0.45;
      }

      // Smooth cloud drift via UV offset (every frame) — no canvas re-stamp
      if (village.userData.cloudDrift == null) village.userData.cloudDrift = 0;
      // ~full sky cycle ~100s; continuous, not stepped by TOD sync
      village.userData.cloudDrift = (village.userData.cloudDrift + dt * 0.01) % 1;
      const skyTex = village.userData.skyTex;
      if (skyTex) {
        skyTex.offset.x = village.userData.cloudDrift;
      }

      // WorldTime: sun/moon/lights (~4 Hz). Sky canvas only repaints on phase change.
      timeSyncAcc += dt;
      if (timeSyncAcc > 0.25) {
        timeSyncAcc = 0;
        syncCreateAtmosphere();
      }
      // re-fetch server anchor every 30s
      if (timeAnchor && (performance.now() - timeAnchor.at) > 30000) {
        fetchWorldTimeAnchor().then((a) => { timeAnchor = a; });
      }
    } else {
      hallCamPhase += 0.1 * dt;
      camera.position.x = Math.sin(hallCamPhase) * 0.12;
      // y/z fixed; skip lookAt every frame — set once when entering select
      torchPhase += dt;
      const torches = hall.userData.torches || [];
      for (let i = 0; i < torches.length; i++) {
        const tch = torches[i];
        const f = 0.92 + Math.sin(torchPhase * 3.2 + i * 1.7) * 0.08;
        if (tch.userData.flame) tch.userData.flame.scale.set(0.7 * f, 1.15 * f, 0.7 * f);
      }
      if (hallChar) tickSprite(hallChar, dt);
    }

    renderer.render(scene, camera);
    updateDebugFps(now, rawMs > 0 && rawMs < 500 ? rawMs : dt * 1000);
  }
  requestAnimationFrame(frame);

  return {
    setCharacter,
    clearCharacter,
    setCreateMode,
    setCreateSelection,
    setCreateAppearance,
    getCreateSelection,
    onCharacterPick,
    setMode(m) {
      setCreateMode(m === 'create' || m === 'lineup');
    },
    dispose() {
      running = false;
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      renderer.dispose();
    }
  };
}

// single boot — double script inject = double rAF = freeze/leak
const canvas = document.getElementById('cs-canvas');
if (canvas && !window.__csRoomBooting) {
  window.__csRoomBooting = true;
  createCharSelectRoom(canvas)
    .then((api) => {
      window.CharSelectRoom = api;
      window.dispatchEvent(new CustomEvent('cs-room-ready'));
    })
    .catch((e) => {
      window.__csRoomBooting = false;
      console.error('[char-select-room]', e);
    });
}
