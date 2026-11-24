// ============================================================
//  CHAR-MODEL.JS — 3D персонажи (GLB preferred)
//
//  engi/man:
//    man.glb     — PRIMARY: mesh + skin (mixamorig) + 15 clips (Heal/skil/Vamp + mixamo)
//    T-Pose.fbx  — skinned fallback mesh
//    main.fbx    — optional anim library (idle-loop / walk-loop / run-loop)
//    Idle|Walking|Running.fbx — motion-only fallbacks
// ============================================================
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const CHAR_BASE = 'assets/Characters/';

/**
 * Один Draco-декодер на все GLB персонажей (man/woman/причёски/LOD — Draco).
 * Декодирует в воркерах, главный поток не блокирует. Путь — от страницы (client/).
 */
let _dracoLoader = null;
function sharedDracoLoader() {
  if (!_dracoLoader) {
    _dracoLoader = new DRACOLoader();
    _dracoLoader.setDecoderPath('js/libs/draco/');
    _dracoLoader.setDecoderConfig({ type: 'wasm' });
  }
  return _dracoLoader;
}

/**
 * man.glb (assets/Characters/engi/man/assets/man.glb) — 15 clips.
 * Resolve by NAME first (stable), index only as fallback.
 *
 *   Heal           — heal / buff cast
 *   mixamo.com     — T-pose static (skip)
 *   mixamo.com.001 — IDLE
 *   mixamo.com.002 — WALK
 *   mixamo.com.003 — RUN
 *   mixamo.com.004 — DIY / fall
 *   mixamo.com.008 — STAND (sit→stand)
 *   mixamo.com.009 — SIT-LOOP
 *   mixamo.com.011 — ATTACK ARM (AA)
 *   skil           — attack skill cast
 *   Vamp           — drain cast
 *
 * Sit-down clip is missing → reverse of STAND (see resolveRoleClips).
 */
const MAN_GLB_ANIM_INDEX = {
  heal: 0,
  idle: 2,
  walk: 3,
  run: 4,
  diy: 5,
  punch: 12,
  attack: 12,
  sit: null,
  sitLoop: 10,
  stand: 9,
  skill: 13,
  vamp: 14
};

/** Preferred clip basenames (order = preference). Names beat indices. */
const MAN_GLB_CLIP_NAMES = {
  heal: ['heal'],
  skill: ['skil', 'skill'],
  vamp: ['vamp'],
  punch: ['mixamo.com.011', 'attackarm', 'atackarm'],
  idle: ['mixamo.com.001', 'idle-loop', 'idle'],
  walk: ['mixamo.com.002', 'walk-loop', 'walk'],
  run: ['mixamo.com.003', 'run-loop', 'run'],
  diy: ['mixamo.com.004', 'diy', 'death', 'die'],
  stand: ['mixamo.com.008', 'stand'],
  sitLoop: ['mixamo.com.009', 'sit-loop', 'sitloop'],
  sit: ['sit']
};

/**
 * Modular hair catalog (files under def.dir + partsDir).
 * Hair GLB: skinned to mixamorig Head/Neck chain, no animations.
 */
export const HAIR_STYLES = [
  { id: 'none', name: 'Лысый', file: null },
  { id: 'hair1', name: 'Причёска 1', file: 'hair1.glb' },
  { id: 'hair2', name: 'Причёска 2', file: 'hair2.glb' },
  { id: 'hair3', name: 'Причёска 3', file: 'hair3.glb' },
  { id: 'hair4', name: 'Причёска 4', file: 'hair4.glb' }
];

/**
 * Face variants for engi/man (and future models with same UV head island).
 * Prebaked body atlases: Main_faceN.webp = Main + Head_N mask composite.
 * file: null → keep GLB embedded Main (face 1 / default).
 * Prefer external Main_face1.webp when present (WebP, smaller than embedded JPEG).
 */
export const FACE_STYLES = [
  { id: 'face1', name: 'Тип 1', file: 'Main_face1.webp' },
  { id: 'face2', name: 'Тип 2', file: 'Main_face2.webp' },
  { id: 'face3', name: 'Тип 3', file: 'Main_face3.webp' }
];

/**
 * 3D weapon visuals (rigid attach to hand bone — not skinned).
 * model: path under WEAPON_BASE; bone: Mixamo hand.
 * worldLen: target length in METERS after attach (self-corrects Armature×0.01).
 * pos: bone-local offset after scale (Mixamo cm-ish under 0.01 armature).
 * rot: Euler XYZ radians — long axis of mesh (authoring +Z) mapped to grip.
 * grip: which end of long axis is the handle ('min' | 'max' along longest axis).
 */
const WEAPON_BASE = 'assets/weapons/';

export const WEAPON_ALIASES = {
  operator_hammer_low: 'apprentice_wand',
  willow_coil: 'magic_mace',
  cedar_manifold: 'apprentice_wand',
  mage_staff: 'apprentice_wand',
  mace_prayer: 'magic_mace',
  crucifix_blood: 'magic_mace'
};

export const WEAPON_VISUALS = {
  // engineer_emitter_low = resonator icon only (no 3D mesh)
  // ── Weapon visual DB (F2 editor grips; unequip hand ≠ remove from catalog) ──
  // Ударник Ученика — стартовое 2H оружие инженера (novice)
  // pos/rot/worldLen: F2 grip (baked from editor-overrides weaponGrips)
  apprentice_wand: {
    id: 'apprentice_wand',
    model: 'models/novice.fbx',
    texture: 'textures/novice.webp',
    bone: 'mixamorig:RightHand',
    worldLen: 1.13,
    pos: [99.505, 5.091, -20.996],
    rot: [-0.10995574287564275, -1.3212142437597076, -1.0821041362364843],
    // GLB-риги (man/woman): рукоять — конец max длинной оси; кулак в 13 % длины от торца
    // (навершие с воротником выходит под мизинцем), ось — по кулаку (CHAR_MODELS.handGrip)
    rigM: { end: 'max', grip: 0.13 },
    scale: 1,
    grip: 'min'
  },
  // Стартовое оружие оператора (маппинг на ударник ученика)
  operator_hammer_low: {
    id: 'operator_hammer_low',
    model: 'models/novice.fbx',
    texture: 'textures/novice.webp',
    bone: 'mixamorig:RightHand',
    worldLen: 1.13,
    pos: [99.505, 5.091, -20.996],
    rot: [-0.10995574287564275, -1.3212142437597076, -1.0821041362364843],
    // GLB-риги (man/woman): рукоять — конец max длинной оси; кулак в 13 % длины от торца
    // (навершие с воротником выходит под мизинцем), ось — по кулаку (CHAR_MODELS.handGrip)
    rigM: { end: 'max', grip: 0.13 },
    scale: 1,
    grip: 'min'
  },
  // Импульсная Булава — Low D 1H
  magic_mace: {
    id: 'magic_mace',
    model: 'models/magic_mace.fbx',
    texture: 'textures/magic_mace.webp',
    bone: 'mixamorig:RightHand',
    worldLen: 0.74,
    pos: [-10.97, 2.47, 6.988],
    rot: [0.5305800926062761, 0.5393067388662478, -1.4102260356114182],
    rigM: { end: 'min', grip: 0.13 },
    scale: 1,
    grip: 'min'
  }
};

// Legacy: remove any attached resonator mesh from old builds
export function stripResonatorMesh(bodyRoot) {
  if (!bodyRoot) return;
  const toRemove = [];
  bodyRoot.traverse((o) => {
    if (o.name && String(o.name).indexOf('char_weapon_engineer_emitter') === 0) {
      toRemove.push(o);
    }
  });
  for (let i = 0; i < toRemove.length; i++) {
    if (toRemove[i].parent) toRemove[i].parent.remove(toRemove[i]);
  }
}

const WEAPON_GRIP_LS_KEY = 'ps_weapon_grips';
const EDITOR_OVERRIDES_LS_KEY = 'project_steam_editor_overrides';
/** Runtime grip overrides from F2 editor / localStorage: id → { pos, rot, worldLen, scale } */
const _weaponGripOverrides = Object.create(null);
/** Fast transform cache for weapon grip pivot offset and world scale to avoid repetitive Box3 CPU scans */
const _weaponGripTransformCache = new Map();

function _normalizeGripEntry(g) {
  if (!g || typeof g !== 'object') return null;
  return {
    pos: Array.isArray(g.pos) ? g.pos.map(Number) : [0, 0, 0],
    rot: Array.isArray(g.rot) ? g.rot.map(Number) : [0, 0, 0],
    worldLen: g.worldLen != null && isFinite(+g.worldLen) ? +g.worldLen : undefined,
    scale: g.scale != null && isFinite(+g.scale) ? +g.scale : undefined,
    grip: g.grip || undefined
  };
}

/** Bake grip into WEAPON_VISUALS catalog so attach always uses latest values. */
function _bakeGripIntoCatalog(weaponId, grip) {
  const base = WEAPON_VISUALS[weaponId];
  if (!base || !grip) return;
  if (Array.isArray(grip.pos)) base.pos = grip.pos.map(Number);
  if (Array.isArray(grip.rot)) base.rot = grip.rot.map(Number);
  if (grip.worldLen != null && isFinite(+grip.worldLen)) base.worldLen = +grip.worldLen;
  if (grip.scale != null && isFinite(+grip.scale)) base.scale = +grip.scale;
  if (grip.grip) base.grip = grip.grip;
}

function _mergeGripMap(data) {
  if (!data || typeof data !== 'object') return;
  Object.keys(data).forEach((k) => {
    if (!WEAPON_VISUALS[k]) return;
    const n = _normalizeGripEntry(data[k]);
    if (!n) return;
    _weaponGripOverrides[k] = n;
    _bakeGripIntoCatalog(k, n);
  });
}

function _hydrateWeaponGrips() {
  // Priority (later wins): dedicated LS → editor overrides LS → EDITOR_OVERRIDES_DATA (disk)
  try {
    const raw = localStorage.getItem(WEAPON_GRIP_LS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      _mergeGripMap(data);
    }
  } catch (e) { /* ignore */ }
  try {
    const raw2 = localStorage.getItem(EDITOR_OVERRIDES_LS_KEY);
    if (raw2) {
      const ov = JSON.parse(raw2);
      if (ov && ov.weaponGrips) _mergeGripMap(ov.weaponGrips);
    }
  } catch (e2) { /* ignore */ }
  try {
    if (typeof window !== 'undefined' && window.EDITOR_OVERRIDES_DATA &&
      window.EDITOR_OVERRIDES_DATA.weaponGrips) {
      _mergeGripMap(window.EDITOR_OVERRIDES_DATA.weaponGrips);
    }
  } catch (e3) { /* ignore */ }
}
_hydrateWeaponGrips();

/** Re-read grips after editor-overrides-data.js loads (may load after this module). */
export function rehydrateWeaponGrips() {
  _hydrateWeaponGrips();
}

/** Snapshot for editor save / disk. */
export function getAllWeaponGripOverrides() {
  const out = {};
  Object.keys(_weaponGripOverrides).forEach((k) => {
    const g = _weaponGripOverrides[k];
    if (!g) return;
    out[k] = {
      pos: Array.isArray(g.pos) ? g.pos.slice() : [0, 0, 0],
      rot: Array.isArray(g.rot) ? g.rot.slice() : [0, 0, 0],
      worldLen: g.worldLen,
      scale: g.scale,
      grip: g.grip
    };
  });
  // Also export catalog-baked weapons that differ from pure defaults
  Object.keys(WEAPON_VISUALS).forEach((k) => {
    if (out[k]) return;
    const b = WEAPON_VISUALS[k];
    if (!b) return;
    // always include if we have override-like non-zero pos or custom worldLen stored as override earlier
  });
  return out;
}

/** Apply a map of grips (from editor-overrides.json). */
export function applyWeaponGripOverridesBatch(map) {
  _mergeGripMap(map || {});
  try {
    localStorage.setItem(WEAPON_GRIP_LS_KEY, JSON.stringify(_weaponGripOverrides));
  } catch (e) { /* ignore */ }
  return true;
}

function _persistWeaponGripsToEditorOverrides() {
  try {
    const grips = getAllWeaponGripOverrides();
    // Never wipe existing saved grips with an empty map (race before hydrate / wrong page)
    if (!grips || !Object.keys(grips).length) return;
    let ov = {};
    const raw = localStorage.getItem(EDITOR_OVERRIDES_LS_KEY);
    if (raw) ov = JSON.parse(raw) || {};
    // Merge into existing — keep other weapons if we only updated one
    const prev = (ov.weaponGrips && typeof ov.weaponGrips === 'object') ? ov.weaponGrips : {};
    ov.weaponGrips = Object.assign({}, prev, grips);
    if (typeof window !== 'undefined' && window.EDITOR_OVERRIDES_DATA &&
      typeof window.EDITOR_OVERRIDES_DATA === 'object') {
      const prevW = window.EDITOR_OVERRIDES_DATA.weaponGrips || {};
      window.EDITOR_OVERRIDES_DATA.weaponGrips = Object.assign({}, prevW, grips);
    }
    // Do NOT bump savedAt here — would make incomplete scene saves "win" over disk forever
    localStorage.setItem(EDITOR_OVERRIDES_LS_KEY, JSON.stringify(ov));
  } catch (e) { /* ignore */ }
}

/**
 * Base catalog entry + editor override (pos/rot/worldLen/scale).
 * @param {string} weaponId
 * @returns {object|null}
 */
export function getWeaponVisual(weaponId) {
  if (!weaponId) return null;
  const canonicalId = (WEAPON_ALIASES && WEAPON_ALIASES[weaponId]) || weaponId;
  if (!WEAPON_VISUALS[canonicalId]) return null;
  const base = WEAPON_VISUALS[canonicalId];
  const o = _weaponGripOverrides[weaponId] || _weaponGripOverrides[canonicalId];
  if (!o) {
    return {
      id: base.id,
      model: base.model,
      texture: base.texture,
      bone: base.bone,
      grip: base.grip,
      pos: (base.pos || [0, 0, 0]).slice(),
      rot: (base.rot || [0, 0, 0]).slice(),
      worldLen: base.worldLen != null ? base.worldLen : 0.55,
      scale: base.scale != null ? base.scale : 1,
      rigM: base.rigM || null
    };
  }
  return {
    id: base.id,
    model: base.model,
    texture: base.texture,
    bone: base.bone,
    grip: o.grip != null ? o.grip : base.grip,
    pos: Array.isArray(o.pos) ? o.pos.slice() : (base.pos || [0, 0, 0]).slice(),
    rot: Array.isArray(o.rot) ? o.rot.slice() : (base.rot || [0, 0, 0]).slice(),
    worldLen: o.worldLen != null ? o.worldLen : (base.worldLen != null ? base.worldLen : 0.55),
    scale: o.scale != null ? o.scale : (base.scale != null ? base.scale : 1),
    rigM: base.rigM || null
  };
}

/**
 * Save grip override (F2 editor). Persists to:
 *  - ps_weapon_grips (dedicated LS)
 *  - project_steam_editor_overrides.weaponGrips (same bucket as scene save)
 *  - bakes into WEAPON_VISUALS for this session
 * @param {string} weaponId
 * @param {{ pos?: number[], rot?: number[], worldLen?: number, scale?: number }} grip
 */
export function setWeaponGripOverride(weaponId, grip) {
  if (!weaponId || !WEAPON_VISUALS[weaponId]) return false;
  const cur = getWeaponVisual(weaponId);
  const next = {
    pos: Array.isArray(grip.pos) ? grip.pos.map(Number) : cur.pos.slice(),
    rot: Array.isArray(grip.rot) ? grip.rot.map(Number) : cur.rot.slice(),
    worldLen: grip.worldLen != null ? Number(grip.worldLen) : cur.worldLen,
    scale: grip.scale != null ? Number(grip.scale) : cur.scale
  };
  _weaponGripOverrides[weaponId] = next;
  _weaponGripTransformCache.delete(weaponId);
  _bakeGripIntoCatalog(weaponId, next);
  try {
    localStorage.setItem(WEAPON_GRIP_LS_KEY, JSON.stringify(_weaponGripOverrides));
  } catch (e) { /* ignore */ }
  _persistWeaponGripsToEditorOverrides();
  return true;
}

/** Reset one weapon (or all if no id) to catalog defaults. */
export function clearWeaponGripOverride(weaponId) {
  if (weaponId) {
    delete _weaponGripOverrides[weaponId];
    _weaponGripTransformCache.delete(weaponId);
  } else {
    Object.keys(_weaponGripOverrides).forEach((k) => delete _weaponGripOverrides[k]);
    _weaponGripTransformCache.clear();
  }
  try {
    localStorage.setItem(WEAPON_GRIP_LS_KEY, JSON.stringify(_weaponGripOverrides));
  } catch (e) { /* ignore */ }
  _persistWeaponGripsToEditorOverrides();
}

/**
 * Live-apply grip to an already attached weapon holder (no reload).
 * @param {THREE.Object3D} bodyRoot
 * @param {string} weaponId
 * @returns {boolean}
 */
export function applyWeaponGripLive(bodyRoot, weaponId) {
  if (!bodyRoot || !weaponId) return false;
  const vis = getWeaponVisual(weaponId);
  if (!vis) return false;
  let holder = null;
  bodyRoot.traverse((o) => {
    if (holder) return;
    if (o.name === 'char_weapon_' + weaponId) holder = o;
  });
  if (!holder) return false;

  let orient = null;
  holder.traverse((o) => {
    if (o.name === 'char_weapon_orient') orient = o;
  });

  const rig = weaponRigFor(bodyRoot, vis);
  if (rig) {
    // GLB-риг: хват по оси кулака, геометрия рукояти — из кэша первого надевания
    const info = _rigWeaponInfo.get(rigWeaponKey(vis, rig));
    if (!info || !orient || !holder.parent) return false;
    placeRigWeapon(holder.parent, holder, orient, info, rig, vis);
    return true;
  }
  const r = vis.rot || [0, 0, 0];
  if (orient) {
    orient.rotation.set(r[0] || 0, r[1] || 0, r[2] || 0);
  }

  // Re-fit world length from identity scale of holder (preserve authoring scale inside)
  const p = vis.pos || [0, 0, 0];
  if (bodyRoot.updateMatrixWorld) bodyRoot.updateMatrixWorld(true);
  holder.position.set(0, 0, 0);
  holder.scale.set(1, 1, 1);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const sz = new THREE.Vector3();
  box.getSize(sz);
  const worldMax = Math.max(sz.x, sz.y, sz.z);
  const want = vis.worldLen != null ? vis.worldLen : 0.55;
  const cached = _weaponGripTransformCache.get(weaponId);
  const scaleMul = (worldMax > 1e-6) ? (want / worldMax) : ((cached && cached.scaleMul) || 1);
  if (scaleMul > 1e-6) holder.scale.setScalar(scaleMul);
  const pk = weaponPosScale(bodyRoot, holder.parent);
  holder.position.set((p[0] || 0) * pk, (p[1] || 0) * pk, (p[2] || 0) * pk);
  holder.updateMatrixWorld(true);
  return true;
}

/**
 * Хват для GLB-ригов (WEAPON_VISUALS[*].rigM + CHAR_MODELS[*].handGrip): модель — по
 * userData.modelId корня (ставит prepareModelParts, копируется в клоны).
 * null — старый риг (pos/rot из F2-редактора).
 * @returns {{ end: string, grip: number, roll: number, c: number[], d: number[] }|null}
 */
function weaponRigFor(bodyRoot, vis) {
  const id = bodyRoot && bodyRoot.userData && bodyRoot.userData.modelId;
  const def = id && CHAR_MODELS[id];
  if (!def || !def.handGrip || !vis || !vis.rigM) return null;
  return {
    end: vis.rigM.end === 'min' ? 'min' : 'max',
    grip: vis.rigM.grip != null ? +vis.rigM.grip : 0.13,
    roll: +vis.rigM.roll || 0,
    c: def.handGrip.c,
    d: def.handGrip.d
  };
}

/** Геометрия оружия для хвата (на модель-файл): смещение pivot, ось торец→боёк, длина. */
const _rigWeaponInfo = new Map();
function rigWeaponKey(vis, rig) {
  return vis.model + '|' + rig.end + '|' + rig.grip;
}

/**
 * Рукоять: длинная ось бокса; торец — rig.end; точка хвата — rig.grip·длины от торца.
 * Центр сечения берётся по вершинам рукояти (а не по боксу всего оружия), чтобы
 * несимметричный боёк не уводил рукоять из кулака.
 * @param {THREE.Object3D} pivot - контейнер оружия, ещё не повешенный на кость
 */
function rigWeaponInfo(vis, pivot, rig) {
  const key = rigWeaponKey(vis, rig);
  const hit = _rigWeaponInfo.get(key);
  if (hit) return hit;
  let top = pivot;
  while (top.parent) top = top.parent;
  pivot.position.set(0, 0, 0);
  top.updateMatrixWorld(true);
  const toPivot = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const pts = [];
  pivot.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const m = new THREE.Matrix4().multiplyMatrices(toPivot, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      box.expandByPoint(v);
      pts.push(v.x, v.y, v.z);
    }
  });
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const ax = (size.x >= size.y && size.x >= size.z) ? 0 : ((size.y >= size.z) ? 1 : 2);
  const len = [size.x, size.y, size.z][ax];
  const lo = [box.min.x, box.min.y, box.min.z][ax];
  const hi = [box.max.x, box.max.y, box.max.z][ax];
  const sign = rig.end === 'min' ? 1 : -1;            // торец → боёк
  const endV = rig.end === 'min' ? lo : hi;
  const gripV = endV + sign * rig.grip * len;
  // сечение рукояти: вершины от торца до 2·grip
  const a0 = Math.min(endV, endV + sign * 2 * rig.grip * len);
  const a1 = Math.max(endV, endV + sign * 2 * rig.grip * len);
  const o1 = (ax + 1) % 3;
  const o2 = (ax + 2) % 3;
  let mn1 = Infinity, mx1 = -Infinity, mn2 = Infinity, mx2 = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const a = pts[i + ax];
    if (a < a0 || a > a1) continue;
    const p1 = pts[i + o1];
    const p2 = pts[i + o2];
    if (p1 < mn1) mn1 = p1;
    if (p1 > mx1) mx1 = p1;
    if (p2 < mn2) mn2 = p2;
    if (p2 > mx2) mx2 = p2;
  }
  const ctr = box.getCenter(new THREE.Vector3()).toArray();
  const g = ctr.slice();
  g[ax] = gripV;
  if (mn1 <= mx1) g[o1] = (mn1 + mx1) / 2;
  if (mn2 <= mx2) g[o2] = (mn2 + mx2) / 2;
  const axis = [0, 0, 0];
  axis[ax] = sign;
  const info = { pivotPos: [-g[0], -g[1], -g[2]], axis, len };
  _rigWeaponInfo.set(key, info);
  return info;
}

/**
 * Оружие в кулак: ось торец→боёк совпадает с осью кулака d (боёк со стороны
 * указательного), точка хвата — в центре кулака c; длина — vis.worldLen в мире.
 */
function placeRigWeapon(hand, holder, orient, info, rig, vis) {
  const d = new THREE.Vector3().fromArray(rig.d).normalize();
  orient.quaternion.setFromUnitVectors(new THREE.Vector3().fromArray(info.axis), d);
  if (rig.roll) orient.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(d, rig.roll));
  holder.position.fromArray(rig.c);
  hand.updateMatrixWorld(true);
  const hs = hand.getWorldScale(new THREE.Vector3()).x || 1;
  const want = vis.worldLen != null ? vis.worldLen : 0.55;
  holder.scale.setScalar(want / Math.max(1e-6, info.len * hs));
  holder.updateMatrixWorld(true);
}

/**
 * Множитель для WEAPON_VISUALS.pos: хваты сняты в единицах кости старого
 * мужчины (Armature ×0.01, см). Кость новых GLB (man/woman) — в метрах:
 * pos × 0.01 / (масштаб кисти относительно модели). Для рига ×0.01 → 1.
 */
function weaponPosScale(bodyRoot, hand) {
  if (!bodyRoot || !hand) return 1;
  const hs = new THREE.Vector3();
  const rs = new THREE.Vector3();
  bodyRoot.updateMatrixWorld(true);
  hand.getWorldScale(hs);
  bodyRoot.getWorldScale(rs);
  const rel = rs.x > 1e-9 ? hs.x / rs.x : hs.x;
  return rel > 1e-9 ? 0.01 / rel : 1;
}

/** JS snippet for pasting into WEAPON_VISUALS after tuning. */
export function exportWeaponGripSnippet(weaponId) {
  const vis = getWeaponVisual(weaponId);
  if (!vis) return '';
  const deg = (rad) => (rad * 180 / Math.PI);
  return (
    '  ' + weaponId + ': {\n' +
    '    id: \'' + weaponId + '\',\n' +
    '    model: \'' + (vis.model || '') + '\',\n' +
    '    texture: \'' + (vis.texture || '') + '\',\n' +
    '    bone: \'' + (vis.bone || 'mixamorig:RightHand') + '\',\n' +
    '    worldLen: ' + Number(vis.worldLen).toFixed(3) + ',\n' +
    '    pos: [' + vis.pos.map((v) => Number(v).toFixed(3)).join(', ') + '],\n' +
    '    rot: [' + vis.rot.map((v) => Number(v).toFixed(4)).join(', ') + '], // deg ≈ [' +
    vis.rot.map((v) => deg(v).toFixed(1)).join(', ') + ']\n' +
    '    scale: ' + Number(vis.scale).toFixed(3) + ',\n' +
    '    grip: \'' + (vis.grip || 'min') + '\'\n' +
    '  }'
  );
}

/**
 * Клипы обоих инженеров: man.glb и woman.glb собраны одним конвейером
 * (scripts/build_man_glb.py / build_woman_glb.py) — 31 клип с одинаковыми
 * именами в одном порядке. Роль → имена (по приоритету); индекс — запасной путь.
 */
const ENGI_ANIM_INDEX = {
  idle: 19, walk: 29, run: 16, punch: 6, attack: 28, slash: 28, heavy: 4, bow: 5,
  heal: 7, skill: 3, vamp: 8, diy: 12, sit: 22, sitLoop: 23, stand: 24
};
const ENGI_CLIP_NAMES = {
  idle: ['idle'],
  walk: ['walk'],
  run: ['fast_run', 'sword_run', 'run'],
  punch: ['boxing'],
  slash: ['sword_slash'],
  heavy: ['attack_2h'],
  bow: ['bow'],
  attack: ['sword_slash', 'attack_1h', 'boxing'],
  heal: ['cast_1h', 'cast_2h'],
  skill: ['attack_1h', 'attack_2h', 'area_attack_1'],
  vamp: ['cast_2h', 'great_sword_cast'],
  diy: ['death_back', 'death_front'],
  sit: ['sit_down', 'sit'],
  sitLoop: ['sit_loop', 'sitloop'],
  stand: ['stand_up', 'stand']
};

/**
 * Автоатака по типу оружия. hit — доля клипа в момент контакта (пик выноса кулака /
 * конца оружия относительно таза; замер по man.glb и woman.glb совпадает до 0.01).
 * Клип растягивается на период атаки (Atk.Spd), так что удар всегда приходится на
 * hit·период от начала замаха — в этот момент клиент показывает урон и вспышку.
 */
const ENGI_ATTACKS = {
  punch: { hit: 0.31 },  // boxing: прямой правой (следом короткий левой)
  slash: { hit: 0.42 },  // sword_slash: одноручное (пик выноса бойка, замер с оружием в руке)
  heavy: { hit: 0.59 },  // attack_2h: основной (второй) удар
  bow: { hit: 0.73 }     // bow: спуск тетивы
};

/**
 * Хват оружия (метры в системе кисти RightHand): ось рукояти по кругам, вписанным в
 * согнутые фаланги указательного…мизинца в позе хвата (первый кадр gripClip).
 *  c — центр кулака на оси, d — направление оси к указательному (туда смотрит
 *  боёк/клинок, навершие выходит под мизинцем).
 */
const ENGI_M_GRIP = { c: [0.0014, 0.0628, 0.0185], d: [0.9792, 0.1389, 0.148] };
const ENGI_F_GRIP = { c: [-0.0017, 0.0716, 0.0209], d: [0.9807, 0.1371, 0.1396] };

/**
 * Карта: класс+пол → ассеты. Пока у каждого пола одна модель на все классы.
 *  lodGlbs  — LOD1/LOD2 тем же скелетом без клипов; части сопоставляются по
 *             имени (Body_lod1 / Head.002 → Body / Head).
 *  hair     — styles: id → builtin (меш внутри тела) | file (модульный GLB
 *             на том же скелете) | ни того ни другого (лысый).
 *  faces    — id → текстура атласа тела (null — встроенная в GLB).
 *  hiddenMeshes — части GLB, которые в игре не показываются.
 */
export const CHAR_MODELS = {
  engi_m: {
    id: 'engi_m',
    cls: 'engineer',
    gender: 'male',
    dir: CHAR_BASE + 'engi/man/',
    texDir: 'Textures/',
    meshGlb: 'man.glb',
    lodGlbs: ['man_lod1.glb', 'man_lod2.glb'],
    meshFbx: null,
    meshFbxStatic: null,
    animLibFbx: null,
    animIndex: ENGI_ANIM_INDEX,
    clipNames: ENGI_CLIP_NAMES,
    attacks: ENGI_ATTACKS,
    gripClip: 'sword_slash',
    handGrip: ENGI_M_GRIP,
    hair: {
      styles: [
        { id: 'hair1', name: 'Тип A', builtin: 'Hair' },
        { id: 'none', name: 'Без волос' }
      ]
    },
    faces: [{ id: 'face1', name: 'Тип 1', file: null }],
    hiddenMeshes: [],
    defaultHair: 'hair1',
    defaultFace: 'face1',
    height: 1.85,
    yawOffset: 0,
    selectYaw: 0
  },
  engi_f: {
    id: 'engi_f',
    cls: 'engineer',
    gender: 'female',
    dir: CHAR_BASE + 'engi/Woman/',
    texDir: 'Textures/',
    meshGlb: 'woman.glb',
    lodGlbs: ['woman_lod1.glb', 'woman_lod2.glb'],
    meshFbx: null,
    meshFbxStatic: null,
    animLibFbx: null,
    animIndex: ENGI_ANIM_INDEX,
    clipNames: ENGI_CLIP_NAMES,
    attacks: ENGI_ATTACKS,
    gripClip: 'sword_slash',
    handGrip: ENGI_F_GRIP,
    hair: {
      styles: [
        { id: 'hair1', name: 'Тип A', file: 'hair.glb' },
        { id: 'hair2', name: 'Тип B', file: 'hair2.glb' },
        { id: 'hair3', name: 'Тип C', file: 'hair3.glb' },
        { id: 'hair4', name: 'Тип D', file: 'hair4.glb' }
      ]
    },
    // scripts/build_woman_faces.py: глаза+губы поверх Main.webp
    faces: [
      { id: 'face1', name: 'Тип 1', file: 'Main.webp' },
      { id: 'face2', name: 'Тип 2', file: 'Main_face2.webp' },
      { id: 'face3', name: 'Тип 3', file: 'Main_face3.webp' }
    ],
    /** атлас для причёсок (ячейка волос одинакова во всех вариантах лица) */
    hairAtlas: 'Main.webp',
    // встроенная причёска woman.glb заменена модульными hair*.glb
    hiddenMeshes: ['Haier'],
    defaultHair: 'hair1',
    defaultFace: 'face1',
    height: 1.75,
    yawOffset: 0,
    selectYaw: 0
  }
};

/** Пять красок волос (зеркало shared/cosmetics-db.js HAIR_COLOR_HEX). */
export const HAIR_COLORS = [
  { hex: '#121014', name: 'Чёрный' },
  { hex: '#6b3210', name: 'Каштан' },
  { hex: '#e03a12', name: 'Рыжий' },
  { hex: '#f2d060', name: 'Блонд' },
  { hex: '#c4c4d0', name: 'Пепельный' }
];

/**
 * Варианты внешности для класса и пола (экран создания, проверка appearance).
 * @returns {{ modelId: string, hair: {id:string,name:string}[], faces: {id:string,name:string}[], hairColors: {hex:string,name:string}[] }}
 */
export function getAppearanceOptions(cls, gender) {
  const def = resolveModelDef(cls, gender);
  const hair = ((def && def.hair && def.hair.styles) || []).map((h) => ({ id: h.id, name: h.name }));
  const faces = ((def && def.faces) || []).map((f) => ({ id: f.id, name: f.name }));
  return { modelId: def ? def.id : null, hair, faces, hairColors: HAIR_COLORS.slice() };
}

/**
 * appearance → значения, допустимые для модели (чужой пол / старый клиент → дефолт).
 * @returns {{ hairId: string, hairColor: string, faceId: string }}
 */
export function normalizeAppearanceFor(def, appearance) {
  const a = appearance || {};
  const styles = (def && def.hair && def.hair.styles) || [];
  const faces = (def && def.faces) || [];
  const hairId = styles.some((h) => h.id === a.hairId) ? a.hairId : ((def && def.defaultHair) || 'none');
  const faceId = faces.some((f) => f.id === a.faceId) ? a.faceId : ((def && def.defaultFace) || 'face1');
  const hairColor = (typeof a.hairColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(a.hairColor))
    ? a.hairColor.toLowerCase() : HAIR_COLORS[0].hex;
  return { hairId, hairColor, faceId };
}

/** ArrayBuffer cache — каждый parse() даёт независимый skinned mesh (без SkeletonUtils) */
const _bufCache = new Map(); // key -> Promise<ArrayBuffer>
/** Texture cache for face/eye WebP swaps */
const _texCache = new Map(); // url -> Promise<THREE.Texture>

function remapCharTexUrl(url, dir) {
  if (!url || typeof url !== 'string') return url;
  if (url.indexOf('blob:') === 0 || url.indexOf('data:') === 0) return url;
  let u = url.replace(/\\/g, '/');
  // absolute / Windows paths → basename
  let base = u.split('/').pop().split('?')[0];
  if (!base) return url;
  // known texture folder — all game rasters are WebP
  if (/\.(jpe?g|png|webp|tga|bmp)$/i.test(base)) {
    base = base.replace(/\.(jpe?g|png|tga|bmp)$/i, '.webp');
    // Main.webp / eye1.webp / Head_*.webp live in Textures/
    return dir + 'Textures/' + base;
  }
  return url;
}

/**
 * Load a texture once (shared GPU image; clone when assigning to materials).
 * @param {string} url
 * @param {number} [aniso]
 * @returns {Promise<THREE.Texture>}
 */
function loadSharedTexture(url, aniso) {
  if (_texCache.has(url)) return _texCache.get(url);
  const p = new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = aniso || 4;
        tex.flipY = false; // glTF UVs
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      (err) => reject(err || new Error('tex fail ' + url))
    );
  });
  _texCache.set(url, p);
  return p;
}

/**
 * Body material(s) that use the Main atlas (not eyes).
 * engi man: Material.001 = Main, Material.002 = eye1.
 */
function isHairOrHelperMesh(o) {
  const n = String(o.name || '');
  if (n.indexOf('char_hair_') === 0) return true;
  if (isRigHelperName(n)) return true;
  if (o.parent && isRigHelperName(o.parent.name)) return true;
  return false;
}

function collectBodyMaterials(root) {
  const mats = [];
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (isHairOrHelperMesh(o)) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < list.length; i++) {
      const mat = list[i];
      if (!mat || seen.has(mat)) continue;
      const n = String(mat.name || '');
      // Eye material is Material.002; skip pure eye maps by name heuristic
      if (/material\.002|eye/i.test(n)) continue;
      // Prefer materials that already have a color map (Main atlas)
      if (!mat.map && !/material\.001|main|body|skin/i.test(n)) continue;
      seen.add(mat);
      mats.push({ mesh: o, mat, index: i, multi: Array.isArray(o.material) });
    }
  });
  // Fallback: first body mesh material with a map (not hair)
  if (!mats.length) {
    root.traverse((o) => {
      if (!o.isMesh || !o.material || mats.length) return;
      if (isHairOrHelperMesh(o)) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (let i = 0; i < list.length; i++) {
        if (list[i] && list[i].map) {
          mats.push({ mesh: o, mat: list[i], index: i, multi: Array.isArray(o.material) });
          break;
        }
      }
    });
  }
  return mats;
}

/**
 * Apply prebaked face atlas (Main + face mask) to body materials.
 * @param {THREE.Object3D} bodyRoot
 * @param {object} def - CHAR_MODELS entry
 * @param {string} faceId - FACE_STYLES id
 * @param {number} [aniso]
 * @returns {Promise<boolean>}
 */
export async function applyFaceMap(bodyRoot, def, faceId, aniso) {
  if (!bodyRoot || !def) return false;
  if (def.faces) {
    // man.glb / woman.glb: лицо = общий материал атласа для всех частей тела
    let mat = null;
    try {
      mat = await getFaceMaterial(def, faceId, aniso);
    } catch (e) {
      console.warn('[CharModel] face tex fail', def.id, faceId, e);
      return false;
    }
    if (!mat) return false;   // атлас встроен в GLB (man.glb)
    bodyRoot.traverse((o) => { if (isBodyPartMesh(o)) o.material = mat; });
    return true;
  }
  const style = FACE_STYLES.find((f) => f.id === faceId) || FACE_STYLES[0];
  if (!style || !style.file) {
    console.log('[CharModel] face default / no file', faceId);
    return false;
  }
  const texDir = def.dir + (def.texDir || 'Textures/');
  const url = texDir + style.file;
  let shared;
  try {
    shared = await loadSharedTexture(url, aniso != null ? aniso : 4);
  } catch (e) {
    console.warn('[CharModel] face tex fail', url, e);
    return false;
  }

  const slots = collectBodyMaterials(bodyRoot);
  if (!slots.length) {
    console.warn('[CharModel] face: no body materials');
    return false;
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    // Clone material once so instances / hair don't share face map state
    let mat = slot.mat;
    if (!mat.userData || !mat.userData._faceOwned) {
      mat = mat.clone();
      mat.userData = mat.userData || {};
      mat.userData._faceOwned = true;
      if (slot.multi) {
        const arr = slot.mesh.material.slice();
        arr[slot.index] = mat;
        slot.mesh.material = arr;
      } else {
        slot.mesh.material = mat;
      }
    }
    // Each material gets its own Texture wrapper (same image source)
    const tex = shared.clone();
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso || 4;
    tex.flipY = false;
    tex.needsUpdate = true;
    mat.map = tex;
    mat.map.userData = mat.map.userData || {};
    mat.map.userData._sharedFace = true;
    mat.needsUpdate = true;
  }
  console.log('[CharModel] face applied', style.id, 'mats=', slots.length);
  return true;
}

/**
 * Prefer external eye1.webp over embedded PNG when available.
 */
async function applyEyeMap(bodyRoot, def, aniso) {
  if (!bodyRoot || !def || !def.eyeMap) return false;
  const texDir = def.dir + (def.texDir || 'Textures/');
  const url = texDir + def.eyeMap;
  let shared;
  try {
    shared = await loadSharedTexture(url, aniso != null ? aniso : 4);
  } catch (e) {
    return false;
  }
  let n = 0;
  bodyRoot.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    for (let i = 0; i < list.length; i++) {
      const mat = list[i];
      if (!mat) continue;
      const name = String(mat.name || '');
      if (!/material\.002|eye/i.test(name)) continue;
      const tex = shared.clone();
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = aniso || 4;
      tex.flipY = false;
      tex.needsUpdate = true;
      mat.map = tex;
      mat.needsUpdate = true;
      n++;
    }
  });
  if (n) console.log('[CharModel] eye map webp applied', n);
  return n > 0;
}

/**
 * Blender rig UI / bone widgets — не рендерим в игре.
 * cs_*, Ctrl_*, WGT_, bone shape helpers.
 */
function isRigHelperName(name) {
  const n = String(name || '');
  if (!n) return false;
  if (/^cs[_./]/i.test(n)) return true;
  if (/^ctrl[_./]/i.test(n)) return true;
  if (/wgt_|_widget|bone.?shape|rig.?ui/i.test(n)) return true;
  if (/^cs_user_/i.test(n)) return true;
  return false;
}

function stripRigHelpers(root) {
  // Только hide — НЕ remove из графа (иначе можно порвать skeleton / bone parents)
  let n = 0;
  root.traverse((o) => {
    if (o.isBone) return; // кости mixamorig / armature всегда оставляем
    if (o.isLight || o.isCamera) {
      o.visible = false;
      n++;
      return;
    }
    const name = o.name || (o.userData && o.userData.name) || '';
    if (isRigHelperName(name)) {
      o.visible = false;
      // helper mesh: не отбрасывать тень
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
      n++;
    }
  });
  if (n) console.log('[CharModel] hid rig helpers', n);
}

function prepareMaterials(root, aniso) {
  const meshLog = [];
  root.traverse((o) => {
    if (!o.isMesh) return;

    // rig widgets stay hidden even if still in graph
    if (isRigHelperName(o.name) || isRigHelperName(o.parent && o.parent.name)) {
      o.visible = false;
      o.castShadow = false;
      return;
    }

    o.visible = true;
    o.castShadow = true;
    o.receiveShadow = true;
    // skinned: never frustum-cull (arms/hands leave AABB and vanish)
    o.frustumCulled = false;

    if (o.isSkinnedMesh && o.skeleton) {
      try {
        if (typeof o.normalizeSkinWeights === 'function') o.normalizeSkinWeights();
      } catch (e) { /* ignore */ }
    }

    const srcList = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    if (!srcList.length) {
      o.material = new THREE.MeshStandardMaterial({
        color: 0xc4a070, side: THREE.DoubleSide, roughness: 0.8, metalness: 0.04
      });
    } else {
      // Keep original materials (GLB already has maps). Only tweak display flags —
      // full rebuild was breaking some glTF material/map bindings.
      for (let i = 0; i < srcList.length; i++) {
        const mat = srcList[i];
        if (!mat) continue;
        mat.side = THREE.DoubleSide;
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.anisotropy = aniso || 4;
          mat.map.needsUpdate = true;
        }
        if (mat.metalness != null && mat.metalness > 0.5) mat.metalness = 0.15;
        if (mat.roughness != null && mat.roughness < 0.2) mat.roughness = 0.55;
        mat.needsUpdate = true;
      }
    }

    try {
      if (o.geometry) o.geometry.computeBoundingBox();
      const bb = o.geometry && o.geometry.boundingBox;
      const sz = bb ? bb.getSize(new THREE.Vector3()) : null;
      const vc = o.geometry && o.geometry.attributes && o.geometry.attributes.position
        ? o.geometry.attributes.position.count : 0;
      meshLog.push({
        name: o.name || '(mesh)',
        skinned: !!o.isSkinnedMesh,
        verts: vc,
        size: sz ? [sz.x.toFixed(2), sz.y.toFixed(2), sz.z.toFixed(2)] : null
      });
    } catch (e) { /* ignore */ }
  });
  if (meshLog.length) {
    console.log('[CharModel] meshes', meshLog.length, meshLog);
  }
}

/**
 * True if clip actually moves bones (man.glb has many empty "T-pose" takes
 * with 2 identical keys — they look like animations but freeze the mesh).
 */
function clipHasMotion(clip) {
  if (!clip || !clip.tracks || !clip.tracks.length) return false;
  if (!(clip.duration > 0.05)) return false;
  for (let ti = 0; ti < clip.tracks.length; ti++) {
    const tr = clip.tracks[ti];
    const times = tr.times;
    const values = tr.values;
    if (!times || times.length < 2 || !values || values.length < 2) continue;
    // any non-constant keyframe values
    let min = values[0];
    let max = values[0];
    for (let i = 1; i < values.length; i++) {
      const v = values[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (max - min > 1e-4) return true;
  }
  return false;
}

/**
 * Normalize clip name: "Armature|idle-loop" → "idle-loop"
 */
function clipBaseName(clip) {
  let n = String((clip && clip.name) || '');
  n = n.replace(/\\/g, '/').split('/').pop();
  n = n.split('|').pop();
  return n.trim().toLowerCase();
}

/**
 * Pick clip by exact basename list (no fuzzy "idle" matching sit-loop etc).
 * @param {THREE.AnimationClip[]} clips
 * @param {string[]} names - preferred basenames in order
 */
function pickClipByNames(clips, names) {
  if (!clips || !clips.length || !names || !names.length) return null;
  const want = names.map((n) => String(n).toLowerCase());
  for (let w = 0; w < want.length; w++) {
    const hit = clips.find((c) => clipBaseName(c) === want[w]);
    if (hit) return hit;
  }
  return null;
}

/**
 * Remove Hips root translation so clips don't fling mesh under the map.
 * Mutates clip.tracks in place. Rotations stay.
 */
function stripHipsTranslation(clip) {
  if (!clip || !clip.tracks || !clip.tracks.length) return clip;
  const before = clip.tracks.length;
  clip.tracks = clip.tracks.filter((t) => {
    const n = String(t.name || '');
    if (/\bmixamorig:Hips\.(position|translation)$/i.test(n)) return false;
    if (/(^|[|/.])Hips\.(position|translation)$/i.test(n)) return false;
    return true;
  });
  if (before !== clip.tracks.length) {
    console.log('[CharModel] stripHips', clip.name || '?', 'removed', before - clip.tracks.length);
  }
  return clip;
}

/**
 * Resolve man.glb roles — simple:
 *  1) by name (Heal, skil, Vamp, mixamo.com.NNN)
 *  2) by fixed index fallback
 * Direct clip refs (no retarget / no clone) — same skeleton as mesh.
 * Only sit is cloned (reverse of stand).
 */
function resolveRoleClips(clips, def) {
  const roles = {
    idle: null, walk: null, run: null, punch: null,
    slash: null, heavy: null, bow: null,
    sit: null, sitLoop: null, stand: null, diy: null,
    heal: null, skill: null, vamp: null,
    sitIsReverse: false
  };
  if (!clips || !clips.length) return roles;

  const idx = (def && def.animIndex) || MAN_GLB_ANIM_INDEX;
  const names = (def && def.clipNames) || MAN_GLB_CLIP_NAMES;

  const byName = (key) => pickClipByNames(clips, names[key] || []);
  const byIndex = (i) => {
    if (i == null || i < 0 || i >= clips.length) return null;
    return clips[i] || null;
  };
  const take = (key) => {
    const c = byName(key) || byIndex(idx[key]);
    if (c) {
      console.log('[CharModel] map', key, '→', c.name || '?', 'd=', (c.duration || 0).toFixed(2));
    } else {
      console.log('[CharModel] map', key, '→ none (using fallback if available)');
    }
    return c;
  };

  roles.heal = take('heal');
  roles.skill = take('skill');
  roles.vamp = take('vamp');
  roles.punch = take('punch') || byIndex(idx.attack);
  // удары оружием — только у моделей с таблицей атак (иначе всё бьётся кулаком)
  if (def && def.attacks) {
    roles.slash = take('slash');
    roles.heavy = take('heavy');
    roles.bow = take('bow');
  }
  roles.idle = take('idle');
  roles.walk = take('walk');
  roles.run = take('run');
  roles.diy = take('diy');
  roles.stand = take('stand');
  roles.sitLoop = take('sitLoop');
  roles.sit = take('sit');

  if (!roles.sit && roles.stand) {
    const rev = roles.stand.clone();
    rev.name = 'sit-down(rev-stand)';
    roles.sit = rev;
    roles.sitIsReverse = true;
  }

  return roles;
}

/** Тип автоатаки по классу оружия (shared/item-db weaponClass). */
export function attackKindFor(weaponClass) {
  const wc = String(weaponClass || 'fist').toLowerCase();
  if (wc === 'fist' || wc === 'none') return 'punch';
  if (wc === 'bow') return 'bow';
  if (wc.indexOf('2h') === 0 || wc === 'pole') return 'heavy';
  return 'slash'; // 1h_blunt / 1h_sword / dagger
}

/** Порядок замены, если у модели нет клипа нужного типа. */
function attackKindChain(kind) {
  if (kind === 'punch') return ['punch'];
  if (kind === 'slash') return ['slash', 'punch'];
  return [kind, 'slash', 'punch'];
}

const ATTACK_TS_MIN = 0.6;
const ATTACK_TS_MAX = 4.0;

/**
 * Клип удара растягивается на период автоатаки: один замах на одну атаку.
 * @param {number} clipDur - длительность клипа, с
 * @param {number} hitFrac - доля клипа в момент контакта
 * @param {number} periodSec - период автоатаки (Atk.Spd), с
 * @returns {{ timeScale: number, impactSec: number, swingSec: number }}
 */
export function attackTiming(clipDur, hitFrac, periodSec) {
  const d = clipDur > 0.05 ? clipDur : 1;
  let ts = (periodSec > 0.05) ? d / periodSec : 1;
  ts = Math.max(ATTACK_TS_MIN, Math.min(ATTACK_TS_MAX, ts));
  return { timeScale: ts, impactSec: (d * hitFrac) / ts, swingSec: d / ts };
}

/** Вторая копия клипа удара (пара A/B): новый замах плавно сменяет предыдущий. */
const _attackClipTwin = new WeakMap();
function attackClipTwin(clip) {
  if (!clip) return null;
  let t = _attackClipTwin.get(clip);
  if (!t) {
    t = clip.clone();
    t.name = clip.name + '#b';
    _attackClipTwin.set(clip, t);
  }
  return t;
}

const GRIP_FINGER_BONES = [];
['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].forEach((f) => {
  for (let i = 1; i <= 3; i++) GRIP_FINGER_BONES.push('RightHand' + f + i);
});

/**
 * Поза хвата пальцев правой кисти — первый кадр def.gripClip (sword_slash: кулак
 * сжат на рукояти). @returns {Object<string, number[]>|null} суффикс кости → xyzw
 */
function gripPoseFromClips(clips, def) {
  if (!def || !def.gripClip || !clips) return null;
  const clip = clips.find((c) => c && c.name === def.gripClip);
  if (!clip) return null;
  const out = {};
  let n = 0;
  for (const tr of clip.tracks) {
    const name = String(tr.name || '');
    if (!name.endsWith('.quaternion') || !tr.values || tr.values.length < 4) continue;
    const node = name.slice(0, -'.quaternion'.length);
    for (const b of GRIP_FINGER_BONES) {
      if (node.endsWith(b)) {
        out[b] = [tr.values[0], tr.values[1], tr.values[2], tr.values[3]];
        n++;
        break;
      }
    }
  }
  return n ? out : null;
}

/**
 * Поза хвата на костях конкретного скелета. apply() — после mixer.update, пока в руке
 * оружие: в idle/беге/касте пальцы иначе раскрыты и рукоять висит вне кулака.
 */
function makeFingerGrip(root, pose) {
  if (!root || !pose) return null;
  const bones = [];
  const quats = [];
  root.traverse((o) => {
    if (!o.isBone) return;
    const nm = String(o.name || '');
    for (const b of GRIP_FINGER_BONES) {
      if (nm.endsWith(b) && pose[b]) {
        bones.push(o);
        quats.push(new THREE.Quaternion().fromArray(pose[b]));
        break;
      }
    }
  });
  if (!bones.length) return null;
  return {
    apply() {
      for (let i = 0; i < bones.length; i++) bones[i].quaternion.copy(quats[i]);
    }
  };
}

/**
 * Fetch bytes (cached).
 */
function fetchBuffer(url) {
  if (!_bufCache.has(url)) {
    _bufCache.set(url, fetch(url).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return r.arrayBuffer();
    }));
  }
  return _bufCache.get(url);
}

/**
 * Load GLB → { scene, animations }.
 * parseAsync gives independent instance each call (buffer cached).
 */
async function loadRawGlb(dir, fileName, aniso) {
  const url = dir + fileName;
  const buffer = await fetchBuffer(url);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(sharedDracoLoader());
  loader.setPath(dir);
  loader.setResourcePath(dir);
  const gltf = await loader.parseAsync(buffer, dir);
  const scene = gltf.scene || new THREE.Group();
  // attach clips on scene for unified API
  scene.animations = gltf.animations || [];
  stripRigHelpers(scene);
  prepareMaterials(scene, aniso);
  return scene;
}

/**
 * Fetch FBX bytes (cached) and parse a fresh scene graph each call.
 * @returns {Promise<THREE.Group>}
 */
async function loadRawFbx(dir, fileName, aniso) {
  const key = dir + fileName;
  let buffer;
  try {
    buffer = await fetchBuffer(key);
  } catch (err) {
    console.warn('[CharModel] FBX fetch fail', key, err);
    throw err;
  }

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => remapCharTexUrl(url, dir));
  const loader = new FBXLoader(manager);
  loader.setPath(dir);
  loader.setResourcePath(dir);

  // parse() → independent skeleton/meshes (safe multi-instance)
  const obj = loader.parse(buffer, dir);
  stripRigHelpers(obj);
  prepareMaterials(obj, aniso);
  return obj;
}

/**
 * World AABB of visible character (skeleton-precise for skinned).
 * man.glb: Armature scale 0.01 + geom ~1.8m — non-precise geom bbox ≈ 0.018m
 * → wrong scale. precise=true uses skinned vertex positions (real pose).
 */
function characterBounds(root) {
  const box = new THREE.Box3();
  let any = false;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (isRigHelperName(o.name) || isRigHelperName(o.parent && o.parent.name)) return;
    if (!o.visible && !o.isSkinnedMesh) return;

    let b = null;
    try {
      // r152+: second arg precise — skinned vertices via bones
      b = new THREE.Box3().setFromObject(o, true);
    } catch (e) {
      b = new THREE.Box3().setFromObject(o);
    }
    if (!b || !isFinite(b.min.x) || b.isEmpty()) return;
    const sz = new THREE.Vector3();
    b.getSize(sz);
    if (sz.y < 1e-6 && sz.x < 1e-6) return;
    // ignore sub-cm junk
    if (sz.y < 0.001 && sz.x < 0.001) return;
    if (!any) {
      box.copy(b);
      any = true;
    } else {
      box.union(b);
    }
  });
  return any ? box : null;
}

/**
 * Height of skinned mesh from LOCAL geometry (bind pose), ignoring bad parent scale.
 * man.glb geom Y ≈ 0…1.82 — reliable human height in meters.
 */
function skinnedGeomLocalHeight(root) {
  let best = 0;
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.geometry) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingBox || g.boundingBox.isEmpty()) return;
    const h = g.boundingBox.max.y - g.boundingBox.min.y;
    if (h > best) best = h;
  });
  return best;
}

/**
 * Wrap model as-exported. NO scale hacks.
 * Blender/glTF already has correct proportions (Armature 0.01 is part of the file).
 * Only centers XZ and puts bone feet on y=0.
 */
function fitToHeight(fbx, targetH) {
  const src = fbx;
  // targetH ignored — keep authoring scale

  src.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) {
      try {
        o.skeleton.pose();
        o.skeleton.update();
      } catch (e) { /* ignore */ }
    }
  });

  const wrapper = new THREE.Group();
  wrapper.name = 'char_fit';
  wrapper.add(src);
  wrapper.position.set(0, 0, 0);
  wrapper.scale.set(1, 1, 1);
  wrapper.updateMatrixWorld(true);

  // Feet on y=0, center XZ — bones only
  const vp = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let any = false;
  wrapper.traverse((o) => {
    if (!o.isBone) return;
    o.getWorldPosition(vp);
    any = true;
    if (vp.y < minY) minY = vp.y;
    if (vp.y > maxY) maxY = vp.y;
    if (vp.x < minX) minX = vp.x;
    if (vp.x > maxX) maxX = vp.x;
    if (vp.z < minZ) minZ = vp.z;
    if (vp.z > maxZ) maxZ = vp.z;
  });
  if (any && isFinite(minY)) {
    wrapper.position.x -= (minX + maxX) * 0.5;
    wrapper.position.z -= (minZ + maxZ) * 0.5;
    wrapper.position.y -= minY;
    wrapper.updateMatrixWorld(true);
  }

  wrapper.userData.fitScale = 1;
  wrapper.userData.fitSource = 'as-exported';
  const spanY = (any && isFinite(maxY) && isFinite(minY)) ? (maxY - minY) : 0;
  console.log('[CharModel] load as-exported (no scale), boneSpanY=', spanY.toFixed(4));
  return wrapper;
}

/**
 * Count skinned meshes (need >0 for Mixamo clips).
 */
function countSkinned(root) {
  let n = 0;
  root.traverse((o) => { if (o.isSkinnedMesh) n++; });
  return n;
}

/** Bone name → Bone under root */
function collectBonesMap(root) {
  const map = new Map();
  if (!root) return map;
  root.traverse((o) => {
    if (o.isBone && o.name) map.set(o.name, o);
  });
  return map;
}

/**
 * Remove previously attached modular hair.
 */
function removeAttachedHair(bodyRoot) {
  if (!bodyRoot) return;
  const toRemove = [];
  bodyRoot.traverse((o) => {
    // встроенная причёска — часть тела (man.glb Hair): скрывается, а не удаляется
    if (o.userData && o.userData.builtinHair) return;
    if (o.name && String(o.name).indexOf('char_hair_') === 0) toRemove.push(o);
  });
  for (let i = 0; i < toRemove.length; i++) {
    const o = toRemove[i];
    if (o.parent) o.parent.remove(o);
  }
}

/**
 * Global cache for hair grayscale map to eliminate synchronous CPU pixel processing loops on character spawn.
 */
let _cachedGrayscaleHairTex = null;
let _pinnedSpriteMaterial = null;

/**
 * Convert hair albedo map to grayscale once so dye colors read clearly
 * (baked brown texture otherwise muddies every tint).
 * Reuses single cached GPU texture across all character instances.
 */
function ensureHairGrayscaleMap(mat) {
  if (!mat || mat.userData._hairGrayDone) return;
  if (_cachedGrayscaleHairTex) {
    if (mat.map !== _cachedGrayscaleHairTex) {
      mat.map = _cachedGrayscaleHairTex;
    }
    mat.userData._hairGrayDone = true;
    return;
  }
  const map = mat.map;
  const img = map && map.image;
  if (!img || !(img.width > 0)) return;

  try {
    const w = img.width;
    const h = img.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      // luminance + slight lift so dark roots still take dye
      const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = Math.min(255, y * 1.2 + 28);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = map.colorSpace != null ? map.colorSpace : THREE.SRGBColorSpace;
    tex.flipY = map.flipY;
    tex.wrapS = map.wrapS;
    tex.wrapT = map.wrapT;
    tex.anisotropy = map.anisotropy || 4;
    tex.minFilter = map.minFilter;
    tex.magFilter = map.magFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    _cachedGrayscaleHairTex = tex;
    mat.map = tex;
    mat.userData._hairGrayDone = true;
  } catch (e) {
    console.warn('[CharModel] hair grayscale fail', e);
  }
}

/**
 * Apply vivid dye color to a hair material (grayscale map × color).
 * NOTE: Color and emissive are WebGL shader uniforms — they do NOT require
 * shader re-compilation (needsUpdate = true). Calling needsUpdate causes
 * a massive synchronous main thread hitch.
 * @param {THREE.Material} mat
 * @param {string|number} hex
 */
function tintHairMaterial(mat, hex) {
  if (!mat || hex == null || hex === '') return;
  if (!mat.userData) mat.userData = {};
  // атлас-причёски обесцвечиваются в шейдере (installHairTint) — CPU-проход не нужен
  if (!mat.userData._atlasTint) ensureHairGrayscaleMap(mat);
  if (mat.color) mat.color.set(hex);
  // soft self-tint so saturated dyes (red/blonde) read under lighting
  if (mat.emissive) {
    mat.emissive.set(hex);
    mat.emissiveIntensity = 0.08;
  }
}

const _hairMaterialPool = new Map();

/**
 * Tint already-attached modular hair (color swap without rebuild / blink).
 * Uses a global shared material pool per color key to completely eliminate
 * runtime shader recompilation and memory allocations.
 * @param {THREE.Object3D} bodyRoot
 * @param {string|number} hex
 * @returns {boolean}
 */
export function applyHairColorToRoot(bodyRoot, hex) {
  if (!bodyRoot || hex == null) return false;
  const colorKey = String(hex).toLowerCase();
  let n = 0;
  bodyRoot.traverse((o) => {
    if (!o.isMesh || !o.name || String(o.name).indexOf('char_hair_') !== 0) return;
    // атлас-причёска: общий материал из пула (map, цвет) — без клонов и перекомпиляции
    if (o.material && !Array.isArray(o.material) && o.material.userData && o.material.userData._atlasTint) {
      o.material = getHairTintMaterial(o.material.map, colorKey);
      n++;
      return;
    }
    const list = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (let i = 0; i < list.length; i++) {
      const baseMat = list[i];
      if (!baseMat) continue;
      let sharedMat = _hairMaterialPool.get(colorKey);
      if (!sharedMat) {
        sharedMat = baseMat.clone();
        sharedMat.userData = Object.assign({}, baseMat.userData, { _hairColorOwned: true, _hairColorKey: colorKey });
        tintHairMaterial(sharedMat, colorKey);
        _hairMaterialPool.set(colorKey, sharedMat);
      }
      if (Array.isArray(o.material)) o.material[i] = sharedMat;
      else o.material = sharedMat;
      n++;
    }
  });
  return n > 0;
}

/**
 * Find Mixamo (or plain) bone by name under character root.
 */
function findBoneByName(root, boneName) {
  if (!root || !boneName) return null;
  const want = String(boneName);
  const wantNoColon = want.replace(':', '');
  let hit = null;
  root.traverse((o) => {
    if (hit || !o.isBone) return;
    const n = o.name || '';
    if (n === want || n === wantNoColon || n.replace(':', '') === wantNoColon) {
      hit = o;
    }
  });
  return hit;
}

function removeAttachedWeapon(bodyRoot) {
  if (!bodyRoot) return;
  const toRemove = [];
  bodyRoot.traverse((o) => {
    if (o.name && String(o.name).indexOf('char_weapon_') === 0) toRemove.push(o);
  });
  for (let i = 0; i < toRemove.length; i++) {
    const o = toRemove[i];
    if (o.parent) o.parent.remove(o);
  }
}

/**
 * Remap weapon FBX texture paths (absolute Windows / *.webp1 junk) → assets/weapons/textures/
 */
function remapWeaponTexUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.indexOf('blob:') === 0 || url.indexOf('data:') === 0) return url;
  let u = url.replace(/\\/g, '/');
  let base = u.split('/').pop().split('?')[0];
  if (!base) return url;
  // FBX sometimes appends "1" after extension
  base = base.replace(/(\.webp|\.png|\.jpe?g|\.tga)\d+$/i, '$1');
  if (/\.(jpe?g|png|webp|tga|bmp)$/i.test(base)) {
    base = base.replace(/\.(jpe?g|png|tga|bmp)$/i, '.webp');
    return WEAPON_BASE + 'textures/' + base;
  }
  return url;
}

/**
 * Weapon materials: DIFFUSE ONLY (no roughness / metalness / normal / AO maps).
 * FBX often ships PBR slots; we strip them for web cost + consistent look.
 * @param {THREE.Object3D} root
 * @param {THREE.Texture|null} [forceMap] - optional albedo override
 * @param {number} [aniso]
 */
function forceWeaponDiffuseOnly(root, forceMap, aniso) {
  if (!root) return;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    o.frustumCulled = false;
    const srcList = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    if (!srcList.length) return;
    const out = [];
    for (let i = 0; i < srcList.length; i++) {
      const src = srcList[i];
      if (!src) {
        out.push(src);
        continue;
      }
      // Prefer explicit albedo, else keep existing color map only
      let map = forceMap || src.map || null;
      if (map) {
        // Own texture instance so flip/colorSpace don't fight shared caches
        if (map !== forceMap && map.clone) {
          try {
            map = map.clone();
            map.needsUpdate = true;
          } catch (e) { /* keep shared */ }
        }
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = aniso || 4;
        map.flipY = true;
        map.needsUpdate = true;
      }
      const color = (src.color && src.color.isColor) ? src.color.clone() : new THREE.Color(0xffffff);
      // MeshLambert: one light response, no PBR maps — cheaper than Standard
      const mat = new THREE.MeshLambertMaterial({
        map: map,
        color: map ? 0xffffff : color,
        side: THREE.DoubleSide,
        transparent: !!src.transparent,
        opacity: src.opacity != null ? src.opacity : 1,
        alphaTest: src.alphaTest || 0,
        depthWrite: src.depthWrite !== false
      });
      // Explicitly no PBR channels
      mat.normalMap = null;
      mat.roughnessMap = null;
      mat.metalnessMap = null;
      mat.aoMap = null;
      mat.emissiveMap = null;
      mat.bumpMap = null;
      mat.displacementMap = null;
      out.push(mat);
      try {
        if (src !== mat && typeof src.dispose === 'function') src.dispose();
      } catch (e) { /* ignore */ }
    }
    o.material = out.length === 1 ? out[0] : out;
  });
}

/**
 * Procedural 3D weapon meshes (zero network fetch, instant parse, rich steampunk visuals).
 */
function buildProceduralWeapon(key) {
  const root = new THREE.Group();
  root.name = 'char_weapon_mesh_' + key;
  const isHammer = /hammer|operator/i.test(key);
  const isMace = /mace/i.test(key);

  const matShaft = new THREE.MeshStandardMaterial({
    color: 0x3d271f,
    roughness: 0.6,
    metalness: 0.1
  });
  const matBrass = new THREE.MeshStandardMaterial({
    color: 0xc8963e,
    roughness: 0.35,
    metalness: 0.75
  });
  const matSteel = new THREE.MeshStandardMaterial({
    color: 0x8a929a,
    roughness: 0.3,
    metalness: 0.85
  });
  const matGlow = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.9,
    roughness: 0.2
  });

  if (isHammer) {
    // Steampunk warhammer
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.95, 8), matShaft);
    shaft.rotation.x = Math.PI / 2;
    root.add(shaft);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.22), matSteel);
    head.position.set(0, 0, 0.45);
    root.add(head);

    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), matBrass);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0, 0.38);
    root.add(ring);

    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), matBrass);
    pommel.position.set(0, 0, -0.48);
    root.add(pommel);
  } else if (isMace) {
    // Magic mace
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.72, 8), matSteel);
    shaft.rotation.x = Math.PI / 2;
    root.add(shaft);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), matBrass);
    head.position.set(0, 0, 0.35);
    root.add(head);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), matGlow);
    core.position.set(0, 0, 0.35);
    root.add(core);

    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), matBrass);
    pommel.position.set(0, 0, -0.36);
    root.add(pommel);
  } else {
    // apprentice_wand (steampunk wand / resonator striker)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.05, 8), matShaft);
    shaft.rotation.x = Math.PI / 2;
    root.add(shaft);

    for (const z of [-0.2, 0.1, 0.35]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 8), matBrass);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0, z);
      root.add(ring);
    }

    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.026, 0.14, 6), matBrass);
    emitter.rotation.x = Math.PI / 2;
    emitter.position.set(0, 0, 0.5);
    root.add(emitter);

    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), matGlow);
    crystal.position.set(0, 0, 0.56);
    root.add(crystal);

    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), matBrass);
    pommel.position.set(0, 0, -0.52);
    root.add(pommel);
  }

  return root;
}

/**
 * Cache for parsed weapon FBX Object3D templates (instant clone, 0ms parse hitch).
 */
const _weaponFbxTemplates = new Map();

/**
 * Load weapon FBX once (buffer and parsed scene cached), return a fresh scene each call.
 * Materials forced to diffuse-only after parse.
 */
async function loadWeaponFbx(relPath, aniso) {
  if (_weaponFbxTemplates.has(relPath)) {
    return _weaponFbxTemplates.get(relPath).clone(true);
  }
  let obj;
  if (!relPath || relPath.startsWith('procedural:')) {
    const key = String(relPath || '').replace(/^procedural:/, '').replace(/^models\//, '').replace(/\.fbx$/i, '');
    obj = buildProceduralWeapon(key);
  } else {
    try {
      const url = WEAPON_BASE + relPath;
      const buffer = await fetchBuffer(url);
      const manager = new THREE.LoadingManager();
      // Block non-diffuse map URLs (rough/metal/normal) — only allow base color / known albedo names
      manager.setURLModifier((u) => {
        if (!u || typeof u !== 'string') return u;
        const low = u.replace(/\\/g, '/').toLowerCase();
        // Skip PBR companion maps entirely (empty → loader won't assign)
        if (/rough|metal|normal|orm|ao[_-]|specular|gloss/i.test(low) && !/base_?color|albedo|diffuse|magic_mace|novice|texture_pbr_20250901(?!_)/i.test(low)) {
          // allow texture_pbr_20250901.png (albedo) but not _metallic/_normal/_roughness
          if (/_(metallic|metalness|roughness|normal|orm|ao)\./i.test(low)) {
            return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
          }
        }
        if (/_(metallic|metalness|roughness|normal|orm|ao)\.(webp|png|jpe?g|tga)/i.test(low)) {
          return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        }
        return remapWeaponTexUrl(u);
      });
      const loader = new FBXLoader(manager);
      loader.setPath(WEAPON_BASE);
      loader.setResourcePath(WEAPON_BASE + 'textures/');
      obj = loader.parse(buffer, WEAPON_BASE);
      forceWeaponDiffuseOnly(obj, null, aniso);
    } catch (err) {
      console.warn('[CharModel] weapon load fallback', relPath, err && err.message);
      obj = buildProceduralWeapon(relPath);
    }
  }
  _weaponFbxTemplates.set(relPath, obj);
  return _weaponFbxTemplates.get(relPath).clone(true);
}

/**
 * Attach (or detach) a rigid weapon to the right-hand bone.
 * @param {THREE.Object3D} bodyRoot
 * @param {string|null} weaponId - WEAPON_VISUALS key, or null/'' to unequip visual
 * @param {number} [aniso]
 * @returns {Promise<THREE.Object3D|null>}
 */
export async function attachWeaponPart(bodyRoot, weaponId, aniso) {
  if (!bodyRoot) return null;

  if (!weaponId) {
    removeAttachedWeapon(bodyRoot);
    console.log('[CharModel] weapon unequipped (visual)');
    return null;
  }

  const vis = getWeaponVisual(weaponId);
  if (!vis || !vis.model) {
    console.warn('[CharModel] no weapon visual for', weaponId);
    removeAttachedWeapon(bodyRoot);
    return null;
  }

  const boneName = vis.bone || 'mixamorig:RightHand';
  const hand = findBoneByName(bodyRoot, boneName);
  if (!hand) {
    console.warn('[CharModel] weapon: bone not found', boneName);
    return null;
  }

  let weaponRoot;
  try {
    weaponRoot = await loadWeaponFbx(vis.model, aniso != null ? aniso : 4);
  } catch (e) {
    console.warn('[CharModel] weapon load fail', vis.model, e);
    return null;
  }

  // Catalog albedo as sole map (diff only — strip any residual PBR)
  if (vis.texture) {
    try {
      const tex = await loadSharedTexture(WEAPON_BASE + vis.texture, aniso);
      forceWeaponDiffuseOnly(weaponRoot, tex, aniso != null ? aniso : 4);
    } catch (e) {
      forceWeaponDiffuseOnly(weaponRoot, null, aniso != null ? aniso : 4);
    }
  } else {
    forceWeaponDiffuseOnly(weaponRoot, null, aniso != null ? aniso : 4);
  }

  // holder (bone child) → pivot (grip@0 + rot) → weaponRoot (FBX, keep authoring scale)
  const holder = new THREE.Group();
  holder.name = 'char_weapon_' + vis.id;
  const pivot = new THREE.Group();
  pivot.name = 'char_weapon_pivot';
  holder.add(pivot);
  pivot.add(weaponRoot);

  // ── GLB-риг (man/woman): рукоять по оси кулака ──
  const rig = weaponRigFor(bodyRoot, vis);
  if (rig) {
    const info = rigWeaponInfo(vis, pivot, rig);
    if (info) {
      pivot.position.fromArray(info.pivotPos);
      const orientR = new THREE.Group();
      orientR.name = 'char_weapon_orient';
      holder.remove(pivot);
      orientR.add(pivot);
      holder.add(orientR);
      removeAttachedWeapon(bodyRoot);
      hand.add(holder);
      holder.userData.weaponId = vis.id;
      placeRigWeapon(hand, holder, orientR, info, rig, vis);
      return holder;
    }
  }

  // ── Grip at pivot origin (handle end of longest axis, cached per weapon visual ID) ──
  const gripKey = vis.id;
  const cachedTransform = _weaponGripTransformCache.get(gripKey);
  if (cachedTransform) {
    pivot.position.set(cachedTransform.pivotPos[0], cachedTransform.pivotPos[1], cachedTransform.pivotPos[2]);
  } else {
    pivot.updateMatrixWorld(true);
    const preBox = new THREE.Box3().setFromObject(pivot);
    if (!preBox.isEmpty()) {
      const size0 = new THREE.Vector3();
      preBox.getSize(size0);
      const center = new THREE.Vector3();
      preBox.getCenter(center);
      let axis = 'z';
      if (size0.x >= size0.y && size0.x >= size0.z) axis = 'x';
      else if (size0.y >= size0.x && size0.y >= size0.z) axis = 'y';
      const useMax = vis.grip === 'max';
      const grip = center.clone();
      if (axis === 'x') grip.x = useMax ? preBox.max.x : preBox.min.x;
      else if (axis === 'y') grip.y = useMax ? preBox.max.y : preBox.min.y;
      else grip.z = useMax ? preBox.max.z : preBox.min.z;
      // Shift content so grip is at pivot 0 (works with FBX scale≠1)
      pivot.position.set(-grip.x, -grip.y, -grip.z);
    }
  }

  // Orientation in bone space: tip toward fingers, not into pelvis
  const r = vis.rot || [0, 0, 0];
  // Apply rot on a child of pivot-offset so grip stays at holder origin
  const orient = new THREE.Group();
  orient.name = 'char_weapon_orient';
  // re-parent: holder → orient → pivot → weapon
  holder.remove(pivot);
  orient.add(pivot);
  holder.add(orient);
  orient.rotation.set(r[0] || 0, r[1] || 0, r[2] || 0);
  if (vis.scale != null && vis.scale !== 1) {
    orient.scale.multiplyScalar(vis.scale);
  }

  // Atomic swap onto RightHand
  removeAttachedWeapon(bodyRoot);
  hand.add(holder);
  holder.userData.weaponId = vis.id;
  hand.updateMatrixWorld(true);
  holder.updateMatrixWorld(true);

  // ── Scale to target WORLD meters (Armature×0.01 safe) ──
  if (cachedTransform) {
    if (cachedTransform.scaleMul !== 1) {
      holder.scale.multiplyScalar(cachedTransform.scaleMul);
    }
  } else {
    const worldBox = new THREE.Box3().setFromObject(holder);
    const wsz = new THREE.Vector3();
    worldBox.getSize(wsz);
    const worldMax = Math.max(wsz.x, wsz.y, wsz.z);
    const want = vis.worldLen != null ? vis.worldLen : 0.55;
    const scaleMul = (worldMax > 1e-6) ? (want / worldMax) : 1;
    if (scaleMul !== 1) {
      holder.scale.multiplyScalar(scaleMul);
    }
    _weaponGripTransformCache.set(gripKey, {
      pivotPos: [pivot.position.x, pivot.position.y, pivot.position.z],
      scaleMul: scaleMul
    });
  }
  holder.updateMatrixWorld(true);

  // Palm offset in bone-local (small — grip is already at hand origin)
  const p = vis.pos || [0, 0, 0];
  const pk = weaponPosScale(bodyRoot, hand);
  holder.position.set((p[0] || 0) * pk, (p[1] || 0) * pk, (p[2] || 0) * pk);

  // Second pass: re-apply grip from catalog/override (stable after skeleton matrix settles)
  try {
    applyWeaponGripLive(bodyRoot, vis.id);
  } catch (eLive) { /* ignore */ }

  return holder;
}

/**
 * Attach modular hair GLB to body: rebind skin to body's mixamorig bones
 * (same names), parent mesh under body Armature. No separate mixer.
 *
 * Atomic swap: old hair stays visible until new mesh is ready (no bald blink).
 *
 * @param {THREE.Object3D} bodyRoot - body glTF scene (Armature + skinned man)
 * @param {object} def - CHAR_MODELS entry
 * @param {string} hairId - HAIR_STYLES id
 * @param {number} aniso
 * @param {object} [opts] - { color: '#rrggbb' }
 * @returns {Promise<THREE.SkinnedMesh[]|null>}
 */
// ─── Модели с атласом (man.glb / woman.glb): части, лицо, причёски ──────────

/** Имя части без суффикса LOD: Body_lod1 / Head.002 → Body / Head */
function partNameOf(name) {
  return String(name || '').replace(/(_lod\d+|\.\d{3})$/i, '');
}

/** Карта атласа причёсок по модели (не в userData: SkeletonUtils.clone сериализует его в JSON). */
const _hairAtlasByModel = new Map();

/**
 * Разметка свежезагруженной модели: userData.part у каждой части, скрытые части
 * удаляются, встроенная причёска переименовывается в char_hair_<id>.
 */
function prepareModelParts(meshRaw, def) {
  if (!meshRaw || !def) return;
  meshRaw.userData.modelId = def.id;   // строка: SkeletonUtils.clone копирует в клоны
  const hidden = new Set(def.hiddenMeshes || []);
  const builtin = new Map();
  ((def.hair && def.hair.styles) || []).forEach((h) => { if (h.builtin) builtin.set(h.builtin, h.id); });
  const drop = [];
  meshRaw.traverse((o) => {
    if (!o.isMesh || (o.userData && o.userData.part)) return;
    const part = partNameOf(o.name);
    if (hidden.has(part)) { drop.push(o); return; }
    o.userData.part = part;
    if (builtin.has(part)) {
      if (!_hairAtlasByModel.has(def.id) && o.material && o.material.map) {
        _hairAtlasByModel.set(def.id, o.material.map);
      }
      o.name = 'char_hair_' + builtin.get(part);
      o.userData.builtinHair = true;
    }
  });
  drop.forEach((o) => { if (o.parent) o.parent.remove(o); });
}

/** Карта для материала причёски: def.hairAtlas или атлас встроенной причёски. */
async function hairAtlasMap(def, aniso) {
  if (def.hairAtlas) {
    return loadSharedTexture(def.dir + (def.texDir || 'Textures/') + def.hairAtlas, aniso != null ? aniso : 4);
  }
  return _hairAtlasByModel.get(def.id) || null;
}

/** Общая программа для всех причёсок: краска × яркость атласа (как в шоуруме). */
const HAIR_TINT_PROGRAM_KEY = 'ps_hair_tint_v1';
function installHairTint(mat) {
  mat.userData._atlasTint = true;
  mat.customProgramCacheKey = function () { return HAIR_TINT_PROGRAM_KEY; };
  mat.onBeforeCompile = function (shader) {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', [
      '#ifdef USE_MAP',
      '  vec4 psHairTexel = texture2D( map, vMapUv );',
      '  float psHairLum = dot( psHairTexel.rgb, vec3( 0.299, 0.587, 0.114 ) );',
      '  diffuseColor.rgb *= clamp( pow( psHairLum, 0.70 ) * 1.45 + 0.12, 0.0, 1.0 );',
      '#endif'
    ].join('\n'));
  };
}

/**
 * Материал причёски из пула (карта, краска). Краска — uniform color/emissive:
 * одна программа на все цвета, смена цвета без перекомпиляции и без копий.
 */
const _hairTintPool = new Map();
function getHairTintMaterial(map, hex) {
  const colorKey = String(hex || HAIR_COLORS[0].hex).toLowerCase();
  const key = (map ? map.uuid : 'nomap') + '|' + colorKey;
  let m = _hairTintPool.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ map: map || null, roughness: 0.75, metalness: 0.0, side: THREE.DoubleSide });
  m.name = 'char_hair_tint';
  m.userData = { _hairColorOwned: true, _hairColorKey: colorKey };
  installHairTint(m);
  tintHairMaterial(m, colorKey);
  m.emissiveIntensity = 0.07;
  _hairTintPool.set(key, m);
  return m;
}

/** Материал тела для варианта лица (общий для всех с этим лицом); null — встроенный в GLB. */
const _faceMatPool = new Map();
function getFaceMaterial(def, faceId, aniso) {
  const face = ((def && def.faces) || []).find((f) => f.id === faceId) || ((def && def.faces) || [])[0];
  if (!face || !face.file) return Promise.resolve(null);
  const key = def.id + '|' + face.id;
  if (!_faceMatPool.has(key)) {
    _faceMatPool.set(key, loadSharedTexture(def.dir + (def.texDir || 'Textures/') + face.file, aniso != null ? aniso : 4)
      .then((tex) => {
        const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide });
        m.name = 'char_body_' + key;
        return m;
      }));
  }
  return _faceMatPool.get(key);
}

function isBodyPartMesh(o) {
  return !!(o && o.isMesh && o.userData && o.userData.part && !o.userData.builtinHair &&
    String(o.name || '').indexOf('char_hair_') !== 0);
}

/**
 * Модульная причёска (GLB на том же скелете) → SkinnedMesh, привязанный к костям тела.
 * В граф не добавляется.
 */
async function loadModularHairMesh(def, style, bodyRoot, aniso) {
  const scene = await loadRawGlb(def.dir, style.file, aniso != null ? aniso : 4);
  let hairMesh = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && !hairMesh) hairMesh = o; });
  if (!hairMesh || !hairMesh.skeleton) return null;
  const bodyBones = collectBonesMap(bodyRoot);
  const head = bodyBones.get('mixamorig:Head') || bodyBones.get('mixamorigHead');
  const oldBones = hairMesh.skeleton.bones;
  const oldInv = hairMesh.skeleton.boneInverses || [];
  const bones = [];
  const inv = [];
  for (let i = 0; i < oldBones.length; i++) {
    const b = oldBones[i] && bodyBones.get(oldBones[i].name);
    bones.push(b || head || oldBones[i]);
    inv.push(oldInv[i] ? oldInv[i].clone() : new THREE.Matrix4());
  }
  hairMesh.bind(new THREE.Skeleton(bones, inv), hairMesh.bindMatrix ? hairMesh.bindMatrix.clone() : new THREE.Matrix4());
  if (hairMesh.parent) hairMesh.parent.remove(hairMesh);
  hairMesh.position.set(0, 0, 0);
  hairMesh.rotation.set(0, 0, 0);
  hairMesh.scale.set(1, 1, 1);
  hairMesh.frustumCulled = false;
  hairMesh.name = 'char_hair_' + style.id;
  hairMesh.userData = { modularHair: style.id };
  return hairMesh;
}

function armatureOf(root) {
  let arm = root;
  root.traverse((o) => { if (o.name === 'Armature') arm = o; });
  return arm;
}

export async function attachHairPart(bodyRoot, def, hairId, aniso, opts) {
  opts = opts || {};
  if (!bodyRoot || !def) return null;

  if (def.hair) {
    // man.glb / woman.glb: встроенная причёска скрывается/показывается, модульная грузится
    const style = def.hair.styles.find((h) => h.id === hairId) || null;
    const map = await hairAtlasMap(def, aniso);
    const mat = getHairTintMaterial(map, opts.color || HAIR_COLORS[0].hex);
    const shown = [];
    let modular = null;
    if (style && style.file) {
      try {
        modular = await loadModularHairMesh(def, style, bodyRoot, aniso);
      } catch (e) {
        console.warn('[CharModel] hair load fail', def.dir + style.file, e);
        return null;
      }
    }
    bodyRoot.traverse((o) => {
      if (!o.isMesh || !o.userData || !o.userData.builtinHair) return;
      o.visible = !!(style && style.builtin && o.name === 'char_hair_' + style.id);
      if (o.visible) { o.material = mat; shown.push(o); }
    });
    removeAttachedHair(bodyRoot);   // прежняя модульная (встроенную не трогает)
    if (modular) {
      modular.material = mat;
      armatureOf(bodyRoot).add(modular);
      shown.push(modular);
    }
    return shown.length ? shown : null;
  }

  // Explicit id only — do not fall back to default when user chose "none"
  const style = HAIR_STYLES.find((h) => h.id === hairId) || null;
  if (!style) {
    console.log('[CharModel] hair unknown id', hairId);
    removeAttachedHair(bodyRoot);
    return null;
  }
  if (!style.file) {
    console.log('[CharModel] hair none (bald)', hairId);
    removeAttachedHair(bodyRoot);
    return null;
  }

  const partsDir = def.dir + (def.partsDir || 'assets/');
  let hairScene;
  try {
    // Load FIRST — keep current hair on head until ready (no blink)
    hairScene = await loadRawGlb(partsDir, style.file, aniso != null ? aniso : 4);
  } catch (e) {
    console.warn('[CharModel] hair load fail', partsDir + style.file, e);
    return null;
  }

  // Keep hair Armature 0.01 — only rebind mesh to body bones (body Armature stays 0.01)
  const bodyBones = collectBonesMap(bodyRoot);
  if (!bodyBones.size) {
    console.warn('[CharModel] hair: body has no bones');
    return null;
  }

  // Prefer body Armature as parent (same local space as body mesh)
  let attachParent = bodyRoot;
  bodyRoot.traverse((o) => {
    if (o.name === 'Armature') attachParent = o;
  });

  const prepared = [];
  const hairMeshes = [];
  hairScene.traverse((o) => {
    if (o.isSkinnedMesh) hairMeshes.push(o);
  });

  for (let mi = 0; mi < hairMeshes.length; mi++) {
    const hairMesh = hairMeshes[mi];
    if (!hairMesh.skeleton || !hairMesh.skeleton.bones) continue;

    const oldBones = hairMesh.skeleton.bones;
    const oldInverses = hairMesh.skeleton.boneInverses || [];
    const newBones = [];
    const newInverses = [];
    let miss = 0;
    for (let i = 0; i < oldBones.length; i++) {
      const bName = oldBones[i] && oldBones[i].name;
      const bodyBone = bName ? bodyBones.get(bName) : null;
      if (bodyBone) {
        newBones.push(bodyBone);
        newInverses.push(
          oldInverses[i] ? oldInverses[i].clone() : new THREE.Matrix4()
        );
      } else {
        miss++;
        // keep inverse slot but skip invalid bone — use Head as fallback
        const head = bodyBones.get('mixamorig:Head') || bodyBones.get('mixamorigHead');
        newBones.push(head || oldBones[i]);
        newInverses.push(
          oldInverses[i] ? oldInverses[i].clone() : new THREE.Matrix4()
        );
      }
    }
    if (miss) console.warn('[CharModel] hair bones missing on body:', miss);

    const bindMatrix = hairMesh.bindMatrix
      ? hairMesh.bindMatrix.clone()
      : new THREE.Matrix4();
    const newSkel = new THREE.Skeleton(newBones, newInverses);
    hairMesh.bind(newSkel, bindMatrix);
    hairMesh.normalizeSkinWeights && hairMesh.normalizeSkinWeights();
    hairMesh.frustumCulled = false;
    hairMesh.castShadow = true;
    hairMesh.receiveShadow = true;
    hairMesh.name = 'char_hair_' + style.id + (mi ? '_' + mi : '');

    // Detach from hair Armature.001 hierarchy (not yet parented to body)
    if (hairMesh.parent) hairMesh.parent.remove(hairMesh);
    hairMesh.position.set(0, 0, 0);
    hairMesh.rotation.set(0, 0, 0);
    hairMesh.scale.set(1, 1, 1);

    // Clone materials + vivid dye (grayscale map × color)
    if (hairMesh.material) {
      const mats = Array.isArray(hairMesh.material)
        ? hairMesh.material.slice()
        : [hairMesh.material];
      for (let j = 0; j < mats.length; j++) {
        if (!mats[j]) continue;
        mats[j] = mats[j].clone();
        mats[j].userData = mats[j].userData || {};
        mats[j].userData._hairColorOwned = true;
        if (opts.color) tintHairMaterial(mats[j], opts.color);
      }
      hairMesh.material = Array.isArray(hairMesh.material) ? mats : mats[0];
    }

    prepared.push(hairMesh);
  }

  // Atomic swap: remove old only after new is ready
  removeAttachedHair(bodyRoot);
  for (let i = 0; i < prepared.length; i++) {
    attachParent.add(prepared[i]);
  }

  console.log('[CharModel] hair attached', style.id, 'meshes=', prepared.length,
    'parent=', attachParent.name || 'root');
  return prepared.length ? prepared : null;
}

/**
 * Collect node names under root (for track retarget).
 */
function collectNodeNames(root) {
  const set = new Set();
  root.traverse((o) => {
    if (o.name) set.add(o.name);
  });
  return set;
}

/**
 * Retarget FBX/GLTF clip tracks onto a scene graph by bone name.
 * Strips path prefixes (Armature|, mixamorig paths) so PropertyBinding finds bones.
 */
function retargetClipToRoot(clip, root) {
  if (!clip || !root) return clip;
  const names = collectNodeNames(root);
  const tracks = [];
  let miss = 0;
  for (let i = 0; i < clip.tracks.length; i++) {
    const src = clip.tracks[i];
    const raw = src.name || '';
    const dot = raw.lastIndexOf('.');
    if (dot < 0) continue;
    const prop = raw.slice(dot + 1);
    let bone = raw.slice(0, dot);
    // strip hierarchy prefixes: "Armature|mixamorig:Hips" / "foo/bar/Hips"
    bone = bone.replace(/\\/g, '/').split('/').pop();
    bone = bone.split('|').pop();
    // try exact, then common Mixamo variants
    let target = null;
    if (names.has(bone)) target = bone;
    else if (names.has('mixamorig:' + bone)) target = 'mixamorig:' + bone;
    else if (bone.indexOf('mixamorig:') === 0 && names.has(bone.replace('mixamorig:', ''))) {
      target = bone.replace('mixamorig:', '');
    } else {
      // case-insensitive
      const low = bone.toLowerCase();
      for (const n of names) {
        if (n.toLowerCase() === low) { target = n; break; }
      }
    }
    if (!target) {
      miss++;
      continue;
    }
    const tr = src.clone();
    tr.name = target + '.' + prop;
    tracks.push(tr);
  }
  if (!tracks.length) {
    console.warn('[CharModel] retarget: 0 tracks bound, miss=', miss, 'clip=', clip.name);
    return null;
  }
  const out = new THREE.AnimationClip(clip.name || 'retarget', clip.duration, tracks);
  if (miss) console.log('[CharModel] retarget', clip.name, 'ok', tracks.length, 'miss', miss);
  return out;
}

/**
 * Load first available AnimationClip from a (possibly motion-only) FBX.
 * @returns {Promise<THREE.AnimationClip|null>}
 */
async function loadClipFromFbx(dir, fileName, aniso) {
  if (!fileName) return null;
  try {
    const obj = await loadRawFbx(dir, fileName, aniso);
    const clips = obj.animations || [];
    if (!clips.length) {
      console.warn('[CharModel] no clips in', fileName);
      return null;
    }
    // prefer first clip that actually moves
    let clip = clips.find(clipHasMotion) || clips[0];
    console.log('[CharModel] clip', fileName, '→', clip.name || '(unnamed)',
      'dur', (clip.duration || 0).toFixed(2), 'tracks', clip.tracks.length,
      'motion=', clipHasMotion(clip), 'totalInFile', clips.length);
    return clip;
  } catch (e) {
    console.warn('[CharModel] clip load fail', fileName, e);
    return null;
  }
}

/**
 * Load all clips from anim library FBX (main.fbx). Mesh graph discarded.
 * @returns {Promise<THREE.AnimationClip[]>}
 */
async function loadAnimLibrary(dir, fileName, aniso) {
  if (!fileName) return [];
  try {
    const obj = await loadRawFbx(dir, fileName, aniso);
    const clips = (obj.animations || []).slice();
    console.log('[CharModel] animLib', fileName, 'clips=', clips.length,
      clips.map((c) => (c.name || '?') + (clipHasMotion(c) ? '+' : '')));
    return clips;
  } catch (e) {
    console.warn('[CharModel] animLib fail', fileName, e);
    return [];
  }
}

/**
 * Pick clip from library by regex (legacy helper).
 */
function pickNamedClip(clips, re) {
  if (!clips || !clips.length || !re) return null;
  const hit = clips.find((c) => re.test(c.name || ''));
  return hit || null;
}

/**
 * Build playable character instance from def.
 * Mesh = T-Pose.fbx (skinned). Anims = main.fbx library (idle/walk/run-loop).
 * @param {object} def - CHAR_MODELS entry
 * @param {object} opts - { height, aniso, loadRun, loadExternalClips }
 * @returns {Promise<CharInstance>}
 */
export async function loadCharacterModel(def, opts) {
  opts = opts || {};
  const height = opts.height != null ? opts.height : def.height || 1.9;
  const aniso = opts.aniso != null ? opts.aniso : 4;
  const loadRun = opts.loadRun !== false;
  const loadExternal = opts.loadExternalClips !== false;

  // ── 1) mesh: GLB first (man.glb), then skinned FBX. Never main.fbx as mesh. ─
  let meshRaw = null;
  let meshName = def.meshGlb || def.meshFbx || 'man.glb';
  let sourceKind = 'glb';

  const meshCandidates = [];
  if (def.meshGlb) meshCandidates.push({ name: def.meshGlb, kind: 'glb' });
  if (def.meshFbx) meshCandidates.push({ name: def.meshFbx, kind: 'fbx' });
  if (def.meshFbxStatic) meshCandidates.push({ name: def.meshFbxStatic, kind: 'fbx' });

  for (let i = 0; i < meshCandidates.length; i++) {
    const c = meshCandidates[i];
    if (/^main\.fbx$/i.test(c.name)) continue; // anim library only
    try {
      if (c.kind === 'glb') {
        meshRaw = await loadRawGlb(def.dir, c.name, aniso);
      } else {
        meshRaw = await loadRawFbx(def.dir, c.name, aniso);
      }
      meshName = c.name;
      sourceKind = c.kind;
      if (countSkinned(meshRaw) > 0) break;
      if (i < meshCandidates.length - 1) {
        console.warn('[CharModel] mesh', c.name, 'has no skin, try next');
        meshRaw = null;
      }
    } catch (e) {
      console.warn('[CharModel] mesh fail', c.name, e);
      meshRaw = null;
    }
  }
  if (!meshRaw) throw new Error('[CharModel] no mesh for ' + def.id);

  // man.glb / woman.glb: разметка частей + appearance, допустимый для этой модели
  let appearance = opts.appearance || {};
  if (def.hair) {
    prepareModelParts(meshRaw, def);
    appearance = Object.assign({}, appearance, normalizeAppearanceFor(def, appearance));
  }
  const hairId = appearance.hairId != null
    ? appearance.hairId
    : (def.defaultHair || 'hair1');
  const faceId = appearance.faceId != null
    ? appearance.faceId
    : (def.defaultFace || 'face1');
  const weaponId = appearance.weaponId != null ? appearance.weaponId : null;
  try {
    await attachHairPart(meshRaw, def, hairId, aniso, {
      color: appearance.hairColor || null
    });
  } catch (hairErr) {
    console.warn('[CharModel] hair attach failed (body kept)', hairErr);
  }
  // Face via prebaked Main + mask atlas (WebP)
  try {
    await applyFaceMap(meshRaw, def, faceId, aniso);
  } catch (faceErr) {
    console.warn('[CharModel] face apply failed (body kept)', faceErr);
  }
  // Prefer external eye WebP over embedded PNG
  try {
    await applyEyeMap(meshRaw, def, aniso);
  } catch (eyeErr) {
    /* optional */
  }
  // Weapon on RightHand (only if equipped id provided)
  if (weaponId) {
    try {
      await attachWeaponPart(meshRaw, weaponId, aniso);
    } catch (wErr) {
      console.warn('[CharModel] weapon attach failed', wErr);
    }
  }

  const skinned = countSkinned(meshRaw);
  const embedded = meshRaw.animations || [];
  console.log('[CharModel] mesh', meshName, '(' + sourceKind + ')',
    'skinnedMeshes=', skinned,
    'embeddedClips=', embedded.length,
    embedded.map((c) => (c.name || '?') + (clipHasMotion(c) ? '+' : '')));

  const model = fitToHeight(meshRaw, height);

  // ── 2) clips by FIXED INDEX map (man.glb) ─
  let idleClip = null;
  let walkClip = null;
  let runClip = null;
  let punchClip = null;
  /** удары оружием по типу (def.attacks) */
  let slashClip = null;
  let heavyClip = null;
  let bowClip = null;
  let sitClip = null;
  let sitLoopClip = null;
  let standClip = null;
  let diyClip = null;
  let healClip = null;
  let skillClip = null;
  let vampClip = null;

  /** sit-down is reverse playback of stand when no dedicated clip */
  let sitIsReverse = false;

  try {
    console.log('[CharModel] glb clips:', embedded.map((c, i) =>
      i + ':' + (c.name || '?') + ' d=' + (c.duration || 0).toFixed(2)));

    const r = resolveRoleClips(embedded, def);
    idleClip = r.idle;
    walkClip = r.walk;
    runClip = r.run;
    punchClip = r.punch;
    slashClip = r.slash;
    heavyClip = r.heavy;
    bowClip = r.bow;
    sitClip = r.sit;
    sitLoopClip = r.sitLoop;
    standClip = r.stand;
    diyClip = r.diy;
    healClip = r.heal;
    skillClip = r.skill;
    vampClip = r.vamp;
    sitIsReverse = !!r.sitIsReverse;

    // Strip hips root-motion only (keep tracks as-is for skeleton binding)
    const pin = (c) => (c ? stripHipsTranslation(c) : null);
    idleClip = pin(idleClip);
    walkClip = pin(walkClip);
    runClip = pin(runClip);
    punchClip = pin(punchClip);
    slashClip = pin(slashClip);
    heavyClip = pin(heavyClip);
    bowClip = pin(bowClip);
    sitClip = pin(sitClip);
    sitLoopClip = pin(sitLoopClip);
    standClip = pin(standClip);
    diyClip = pin(diyClip);
    healClip = pin(healClip);
    skillClip = pin(skillClip);
    vampClip = pin(vampClip);

    console.log('[CharModel] ROLE→CLIP',
      '\n  idle   =', idleClip && (idleClip.name + ' d=' + idleClip.duration.toFixed(2)),
      '\n  walk   =', walkClip && (walkClip.name + ' d=' + walkClip.duration.toFixed(2)),
      '\n  run    =', runClip && (runClip.name + ' d=' + runClip.duration.toFixed(2)),
      '\n  punch  =', punchClip && (punchClip.name + ' d=' + punchClip.duration.toFixed(2)),
      '\n  heal   =', healClip && (healClip.name + ' d=' + healClip.duration.toFixed(2)),
      '\n  skill  =', skillClip && (skillClip.name + ' d=' + skillClip.duration.toFixed(2)),
      '\n  vamp   =', vampClip && (vampClip.name + ' d=' + vampClip.duration.toFixed(2)));
  } catch (animErr) {
    console.warn('[CharModel] anim stage failed (mesh kept)', animErr);
    idleClip = walkClip = runClip = punchClip = null;
    slashClip = heavyClip = bowClip = null;
    sitClip = sitLoopClip = standClip = diyClip = null;
    healClip = skillClip = vampClip = null;
    sitIsReverse = false;
  }

  const root = new THREE.Group();
  root.name = 'char_' + def.id;
  root.userData.cls = def.cls;
  root.userData.gender = def.gender;
  root.userData.id = def.id;
  root.userData.isCharModel = true;
  root.userData.pickable = true;
  root.add(model);

  // No flat circle blob under character (select ring only when needed)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.52, 0.72, 32),
    new THREE.MeshBasicMaterial({
      color: 0xd4b060, transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  ring.visible = false;
  root.add(ring);
  root.userData.ring = ring;

  // Mixer on glTF/FBX scene root (bones searched by name under it)
  const mixerRoot = meshRaw;
  const mixer = (skinned > 0 || embedded.length || idleClip || punchClip)
    ? new THREE.AnimationMixer(mixerRoot) : null;

  /** @type {Record<string, THREE.AnimationAction|null>} */
  const actions = {
    idle: null, walk: null, run: null,
    punch: null, sit: null, sitLoop: null, stand: null, diy: null,
    heal: null, skill: null, vamp: null
  };

  function makeAction(clip, weight, loopOnce) {
    if (!mixer || !clip) return null;
    try {
      // man.glb clips: use AS-IS (same skeleton). No retarget, no clone.
      const a = mixer.clipAction(clip);
      a.enabled = true;
      a.weight = weight != null ? weight : 0;
      a.setEffectiveTimeScale(1);
      a.setEffectiveWeight(weight != null ? weight : 0);
      if (loopOnce) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      } else {
        a.setLoop(THREE.LoopRepeat, Infinity);
        a.clampWhenFinished = false;
      }
      a.stop();
      return a;
    } catch (e) {
      console.warn('[CharModel] clipAction fail', clip && clip.name, e);
      return null;
    }
  }

  actions.idle = makeAction(idleClip, 0, false);
  actions.walk = makeAction(walkClip, 0, false);
  actions.run = makeAction(runClip, 0, false);
  actions.punch = makeAction(punchClip, 0, true);
  actions.sit = makeAction(sitClip, 0, true);
  actions.sitLoop = makeAction(sitLoopClip, 0, false);
  actions.stand = makeAction(standClip, 0, true);
  actions.diy = makeAction(diyClip, 0, true);
  // Cast one-shots: Heal[0], skil[13], Vamp[14]
  actions.heal = makeAction(healClip, 0, true);
  actions.skill = makeAction(skillClip, 0, true);
  actions.vamp = makeAction(vampClip, 0, true);

  // ── Автоатака: клип по типу оружия, пара A/B (новый замах сменяет прошлый кроссфейдом) ──
  const attackHits = def.attacks || { punch: { hit: 0.31 } };
  /** @type {Record<string, THREE.AnimationAction[]>} kind → [A, B] */
  const attackActs = {};
  const attackList = [];
  [['punch', punchClip], ['slash', slashClip], ['heavy', heavyClip], ['bow', bowClip]].forEach(([k, c]) => {
    if (!c) return;
    const a = (k === 'punch' && actions.punch) ? actions.punch : makeAction(c, 0, true);
    const b = makeAction(attackClipTwin(c), 0, true);
    if (!a || !b) return;
    attackActs[k] = [a, b];
    attackList.push(a, b);
  });
  /** текущий замах (одна из пар) */
  let curAttack = null;
  /** performance.now() конца замаха; после паузы — обратно в стойку */
  let attackEndsAt = 0;
  let attackFinishing = false;

  // Пальцы правой кисти держат рукоять, пока в руке оружие (поза хвата из def.gripClip)
  const fingerGrip = makeFingerGrip(meshRaw, gripPoseFromClips(embedded, def));
  let gripOn = false;
  if (weaponId) {
    meshRaw.traverse((o) => {
      if (o.name && String(o.name).indexOf('char_weapon_') === 0) gripOn = true;
    });
  }

  if (!actions.idle && skinned > 0) {
    console.warn('[CharModel] no idle action — bind pose only');
  } else if (actions.idle) {
    actions.idle.setEffectiveWeight(1);
    actions.idle.play();
  }

  const yawOff = def.yawOffset || 0;
  /** loco | attack | cast | sitDown | sitting | standUp | dead */
  let state = 'loco';
  let moving = false;
  /** @type {'walk'|'run'|null} which loco clip is intended */
  let locoKind = null;
  let finishHandler = null;
  /**
   * Cast bar scrub: map wall-clock progress → clip.time so body never outruns the cast bar.
   * @type {null|{ action: THREE.AnimationAction, startMs: number, durationMs: number, clipDur: number }}
   */
  let castSync = null;

  const baseActions = [
    actions.idle, actions.walk, actions.run,
    actions.punch, actions.sit, actions.sitLoop, actions.stand, actions.diy,
    actions.heal, actions.skill, actions.vamp
  ];
  const allActionsList = baseActions.concat(attackList.filter((a) => baseActions.indexOf(a) < 0));
  function allActions() {
    return allActionsList;
  }

  /** True if action is effectively the current playing clip */
  function isActive(action) {
    if (!action) return false;
    try {
      return action.isRunning() && action.getEffectiveWeight() > 0.45;
    } catch (e) {
      return false;
    }
  }

  /** Hard-stop action (no fade) — used for attack→run instant cut */
  function hardStop(action) {
    if (!action) return;
    try {
      action.stop();
      action.setEffectiveWeight(0);
      action.setEffectiveTimeScale(1);
      action.paused = false;
    } catch (e) { /* ignore */ }
  }

  /**
   * Switch to target clip.
   * CRITICAL: activate target at weight=1 FIRST, then fade others —
   * otherwise one frame with all weights ~0 → bind/vanish under map.
   * opts: { forceRestart, loopOnce, timeScale, startAtEnd, snap }
   */
  function crossTo(target, fade, opts) {
    opts = opts || {};
    if (!target) return false;
    const snap = !!opts.snap || (fade != null && fade <= 0);
    const f = snap ? 0 : (fade != null ? fade : 0.08);

    // Already on this clip — do not reset/restart
    if (!opts.forceRestart && target.isRunning() && target.getEffectiveWeight() > 0.5) {
      const list0 = allActions();
      for (let i = 0; i < list0.length; i++) {
        const a = list0[i];
        if (!a || a === target) continue;
        if (a.getEffectiveWeight() > 0.01) {
          if (snap) hardStop(a);
          else a.fadeOut(f);
        }
      }
      // ensure target stays solid
      target.setEffectiveWeight(1);
      return false;
    }

    // 1) Bring target up immediately (no empty-weight gap)
    target.enabled = true;
    target.paused = false;
    target.reset();
    if (opts.loopOnce) {
      target.setLoop(THREE.LoopOnce, 1);
      target.clampWhenFinished = true;
    } else {
      target.setLoop(THREE.LoopRepeat, Infinity);
      target.clampWhenFinished = false;
    }
    const ts = opts.timeScale != null ? opts.timeScale : 1;
    target.setEffectiveTimeScale(ts);
    if (opts.startAtEnd || ts < 0) {
      const clip = target.getClip ? target.getClip() : null;
      const dur = clip && clip.duration > 0 ? clip.duration : 0;
      target.time = Math.max(0, dur - 1e-4);
    }
    target.setEffectiveWeight(1);
    target.weight = 1;
    target.play();

    // 2) Only then kill / fade others
    const list = allActions();
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a || a === target) continue;
      if (snap) hardStop(a);
      else {
        a.fadeOut(Math.max(f, 0.05));
        try { a.setEffectiveTimeScale(1); } catch (e) { /* ignore */ }
      }
    }
    return true;
  }

  function onFinished(e) {
    const finished = e && e.action;
    if (!finished) return;
    if (finishHandler) {
      const fn = finishHandler;
      finishHandler = null;
      fn(finished);
    }
  }
  if (mixer) mixer.addEventListener('finished', onFinished);

  function playOneShot(action, nextState, onDone, fade, timeScale) {
    if (!action) {
      if (onDone) onDone();
      return false;
    }
    // already playing this one-shot — don't restart
    if (state === nextState && isActive(action)) return true;
    state = nextState;
    finishHandler = function (fin) {
      if (fin !== action) return;
      if (onDone) onDone();
    };
    crossTo(action, fade != null ? fade : 0.1, {
      loopOnce: true,
      forceRestart: true,
      timeScale: timeScale != null ? timeScale : 1
    });
    return true;
  }

  const inst = {
    root,
    mixer,
    model,
    /** body glTF scene (Armature + meshes) — hair attaches here */
    meshRaw,
    def,
    height,
    actions,
    appearance: {
      hairId: hairId,
      hairColor: appearance.hairColor || null,
      faceId: faceId,
      weaponId: appearance.weaponId || null
    },
    _moving: false,
    _yawOff: yawOff,
    _state: 'loco',
    _weaponGen: 0,

    get state() { return state; },
    get isSitting() { return state === 'sitting' || state === 'sitDown'; },
    get isDead() { return state === 'dead'; },
    get isBusy() {
      return state === 'attack' || state === 'cast' ||
        state === 'sitDown' || state === 'standUp' || state === 'dead';
    },

    _hairGen: 0,

    /**
     * Hot-swap modular hair (char-create / barber).
     * Color-only → tint in place (no blink). Style change → load first, then atomic swap.
     * @param {string} id - HAIR_STYLES id
     * @param {object} [hairOpts] - { color }
     */
    async setHair(id, hairOpts) {
      hairOpts = hairOpts || {};
      const nextId = id || 'none';
      const nextColor = hairOpts.color != null ? hairOpts.color : (this.appearance.hairColor || null);
      // Skip if nothing changed
      if (this.appearance.hairId === nextId && this.appearance.hairColor === nextColor) {
        return null;
      }

      // Color-only: keep mesh, re-dye materials (instant, no blink)
      if (this.appearance.hairId === nextId && nextId !== 'none') {
        this.appearance.hairColor = nextColor;
        applyHairColorToRoot(meshRaw, nextColor);
        return true;
      }

      const gen = ++this._hairGen;
      this.appearance.hairId = nextId;
      this.appearance.hairColor = nextColor;
      const result = await attachHairPart(meshRaw, def, nextId, aniso, {
        color: nextColor
      });
      // Stale request (user clicked faster than load) — ignore result
      if (gen !== this._hairGen) return null;
      return result;
    },

    /**
     * Hot-swap face atlas (char-create). Uses prebaked Main + Head mask WebP.
     * @param {string} id - FACE_STYLES id (face1|face2|face3)
     */
    async setFace(id) {
      const nextId = id || def.defaultFace || 'face1';
      if (this.appearance.faceId === nextId) return true;
      this.appearance.faceId = nextId;
      return applyFaceMap(meshRaw, def, nextId, aniso);
    },

    /**
     * Equip / unequip 3D weapon visual on right hand.
     * @param {string|null} weaponId - WEAPON_VISUALS id, or null to hide
     * @param {{ force?: boolean }} [opts] - force re-attach even if id unchanged
     */
    async setWeapon(weaponId, opts) {
      const nextId = weaponId || null;
      const force = !!(opts && opts.force);
      const reload = !!(opts && opts.reload);
      // Skip only if same id AND mesh is actually on the skeleton (avoids stuck bare hands)
      let hasMesh = false;
      if (nextId && meshRaw) {
        meshRaw.traverse((o) => {
          if (hasMesh) return;
          if (o.name === 'char_weapon_' + nextId) hasMesh = true;
        });
      }
      if (!force && this.appearance.weaponId === nextId) {
        if (!nextId) { gripOn = false; return true; }
        if (hasMesh && !reload) {
          gripOn = true;
          try { applyWeaponGripLive(meshRaw, nextId); } catch (e) { }
          return true;
        }
      }
      const gen = ++this._weaponGen;
      this.appearance.weaponId = nextId;
      const result = await attachWeaponPart(meshRaw, nextId, aniso);
      if (gen !== this._weaponGen) return null;
      gripOn = !!result;
      return result;
    },

    playIdle() {
      if (state === 'dead' || state === 'sitDown' || state === 'standUp') return;
      if (state === 'sitting') return;
      // already truly on idle clip — do NOT re-crossTo (avoids per-frame reset)
      if (state === 'loco' && !this._moving && isActive(actions.idle)) return;

      finishHandler = null;
      castSync = null;
      const softLeave = (state === 'attack' || state === 'cast');
      state = 'loco';
      moving = false;
      this._moving = false;
      locoKind = null;
      this._state = state;
      // soft leave punch/cast → idle
      if (actions.idle) crossTo(actions.idle, softLeave ? 0.15 : 0.08);
      else if (actions.walk) crossTo(actions.walk, 0.08);
    },

    playWalk() {
      if (state === 'dead' || state === 'sitting' || state === 'sitDown' || state === 'standUp') return;
      if (state === 'cast') return; // cast owns body
      // already walking — no restart
      if (this._moving && state === 'loco' && locoKind === 'walk' && isActive(actions.walk)) return;

      finishHandler = null;
      state = 'loco';
      moving = true;
      this._moving = true;
      locoKind = 'walk';
      this._state = state;
      if (actions.walk) crossTo(actions.walk, 0, { snap: true });
      else if (actions.run) {
        locoKind = 'run';
        crossTo(actions.run, 0, { snap: true });
      }
    },

    playRun() {
      if (state === 'dead') return;
      if (state === 'sitting' || state === 'sitDown' || state === 'standUp') return;
      if (state === 'cast') return; // cast owns body

      // already running — no restart
      if (this._moving && state === 'loco' && locoKind === 'run' && isActive(actions.run)) return;

      finishHandler = null;
      state = 'loco';
      moving = true;
      this._moving = true;
      locoKind = 'run';
      this._state = state;
      if (actions.run) crossTo(actions.run, 0, { snap: true });
      else if (actions.walk) {
        locoKind = 'walk';
        crossTo(actions.walk, 0, { snap: true });
      }
    },

    /**
     * @param {boolean} isMoving
     * @param {'walk'|'run'} [mode] - loco clip; default 'run'
     */
    setMoving(isMoving, mode) {
      if (state === 'dead') return;
      if (state === 'sitting' || state === 'sitDown' || state === 'standUp') return;
      // cast bar owns body — SkillManager cancels cast on real move
      if (state === 'cast') {
        if (!isMoving) {
          this._moving = false;
          moving = false;
        }
        return;
      }
      const on = !!isMoving;

      if (on) {
        if (mode === 'walk') this.playWalk();
        else this.playRun();
        return;
      }

      // stopped: if mid-attack, leave punch alone (standing AA)
      if (state === 'attack') {
        this._moving = false;
        moving = false;
        return;
      }
      // already on idle clip
      if (!this._moving && state === 'loco' && isActive(actions.idle)) return;
      this.playIdle();
    },

    /**
     * Автоатака: ОДИН замах на одну атаку. Клип по типу оружия (opts.weaponClass:
     * кулак → boxing, 1H → sword_slash, 2H → attack_2h, лук → bow) растягивается на
     * период атаки durationSec, так что контакт приходит через hit·период.
     * @param {number} [durationSec] - период автоатаки (Atk.Spd), с
     * @param {Function|object} [onDone]
     * @param {{ weaponClass?: string }} [opts]
     * @returns {number} задержка до контакта, с (0 — замах не начат)
     */
    playAttack(durationSec, onDone, opts) {
      if (typeof durationSec === 'function') {
        onDone = durationSec;
        durationSec = null;
      }
      if (onDone && typeof onDone === 'object' && opts == null) {
        opts = onDone;
        onDone = null;
      }
      opts = opts || {};

      if (state === 'dead' || state === 'sitDown' || state === 'standUp') return 0;
      // skill cast owns the body — do not interrupt with AA swing
      if (state === 'cast') return 0;

      if (state === 'sitting') {
        this.playStand(function () {
          inst.playAttack(durationSec, onDone, opts);
        });
        return 0;
      }

      const chain = attackKindChain(attackKindFor(opts.weaponClass));
      let kind = null;
      for (let i = 0; i < chain.length; i++) {
        if (attackActs[chain[i]]) { kind = chain[i]; break; }
      }
      if (!kind) {
        if (onDone) onDone();
        return 0;
      }
      const pair = attackActs[kind];
      const next = (curAttack === pair[0]) ? pair[1] : pair[0];
      const clip = next.getClip();
      const hit = (attackHits[kind] && attackHits[kind].hit) || 0.35;
      const tm = attackTiming(clip.duration, hit, durationSec);

      moving = false;
      this._moving = false;
      finishHandler = null;
      castSync = null;
      const fromSwing = state === 'attack' && curAttack && curAttack.getEffectiveWeight() > 0.2;
      state = 'attack';
      this._state = state;
      attackFinishing = false;
      attackEndsAt = performance.now() + tm.swingSec * 1000;
      crossTo(next, fromSwing ? 0.08 : 0.12, {
        loopOnce: true,
        forceRestart: true,
        timeScale: tm.timeScale
      });
      curAttack = next;
      this._attackKind = kind;
      if (onDone) onDone();
      return tm.impactSec;
    },

    /** Конец автоатаки: замах доигрывает до конца, потом стойка (не обрываем удар). */
    finishAttack() {
      if (state !== 'attack') return;
      if (curAttack && performance.now() < attackEndsAt) {
        attackFinishing = true;
        return;
      }
      this.playIdle();
    },

    /**
     * Skill cast: heal | skill | vamp.
     * Charged (hold + durationSec): scrub clip by cast bar progress (exact sync).
     * Instant: normal one-shot playback.
     */
    playCast(kind, onDone, opts) {
      if (onDone && typeof onDone === 'object' && opts == null) {
        opts = onDone;
        onDone = null;
      }
      opts = opts || {};
      if (state === 'dead' || state === 'sitDown' || state === 'standUp') return false;

      const k = String(kind || 'skill').toLowerCase();
      let action = null;
      if (k === 'heal' || k === 'buff') action = actions.heal || actions.skill;
      else if (k === 'vamp' || k === 'drain' || k === 'lifesteal') action = actions.vamp || actions.skill;
      else action = actions.skill || actions.heal || actions.vamp;

      if (!action) {
        if (onDone) onDone();
        return false;
      }

      if (state === 'sitting') {
        this.playStand(function () {
          inst.playCast(kind, onDone, opts);
        });
        return true;
      }

      moving = false;
      this._moving = false;

      const clip = action.getClip ? action.getClip() : null;
      const clipDur = (clip && clip.duration > 0.05) ? clip.duration : 2.5;
      const castSec = opts.durationSec != null ? +opts.durationSec : 0;
      const hold = opts.hold === true || opts.loop === true;

      state = 'cast';
      this._state = state;
      finishHandler = null;
      castSync = null;

      // Charged cast: drive pose from cast bar (wall clock), not free-running timeScale
      if (hold && castSec > 0.05) {
        // Start clip at t=0, paused — update() will scrub time each frame
        crossTo(action, 0.1, {
          loopOnce: true,
          forceRestart: true,
          timeScale: 0 // no free advance; scrub sets .time
        });
        try {
          action.paused = true;
          action.clampWhenFinished = true;
          action.time = 0;
          action.setEffectiveWeight(1);
          action.enabled = true;
          action.play();
        } catch (e) { /* ignore */ }
        // Base feel at ~4s cast: cover ~0.55 (slightly brisk).
        // Faster cast (shorter castSec) → higher cover → anim runs faster & uses more of the clip.
        // Slower cast → lower cover → more deliberate motion.
        const REF_CAST_SEC = 4.0;
        const BASE_COVER = 0.55;
        const speedRatio = REF_CAST_SEC / Math.max(0.2, castSec);
        // soft curve so 2× cast spd ≈ noticeably faster, not telegraphed
        let cover = BASE_COVER * Math.pow(speedRatio, 0.9);
        cover = Math.max(0.38, Math.min(1.0, cover));

        castSync = {
          action: action,
          startMs: performance.now(),
          durationMs: castSec * 1000,
          clipDur: clipDur,
          cover: cover,
          // live bar sync (SkillManager may own the clock)
          endsAt: performance.now() + castSec * 1000
        };
        if (mixer) mixer.update(0);
        return true;
      }

      // Instant: slightly brisk one-shot
      const ts = opts.timeScale != null ? opts.timeScale : 0.95;
      finishHandler = function (fin) {
        if (fin !== action) return;
        if (onDone) onDone();
      };
      crossTo(action, 0.12, {
        loopOnce: true,
        forceRestart: true,
        timeScale: ts
      });
      return true;
    },

    /** Heal / buff cast — man.glb Heal */
    playHeal(onDone, opts) {
      return this.playCast('heal', onDone, opts);
    },

    /** Attack skill cast — man.glb skil */
    playSkill(onDone, opts) {
      return this.playCast('skill', onDone, opts);
    },

    /** Drain / life-steal cast — man.glb Vamp */
    playVamp(onDone, opts) {
      return this.playCast('vamp', onDone, opts);
    },

    /** Sit down → sit-loop (rest). man.glb: sit = reverse of stand. */
    playSit(onDone) {
      if (state === 'dead' || state === 'sitting' || state === 'sitDown') return false;
      if (state === 'standUp') return false;
      moving = false;
      this._moving = false;
      if (actions.sit) {
        state = 'sitDown';
        this._state = state;
        finishHandler = function (fin) {
          if (fin !== actions.sit) return;
          if (actions.sit) actions.sit.setEffectiveTimeScale(1);
          state = 'sitting';
          inst._state = state;
          if (actions.sitLoop) crossTo(actions.sitLoop, 0.12);
          else if (actions.idle) crossTo(actions.idle, 0.12);
          if (onDone) onDone();
        };
        crossTo(actions.sit, 0.12, {
          loopOnce: true,
          forceRestart: true,
          timeScale: sitIsReverse ? -1 : 1,
          startAtEnd: sitIsReverse
        });
        return true;
      }
      // no sit-down clip — jump to sit-loop
      state = 'sitting';
      this._state = state;
      if (actions.sitLoop) crossTo(actions.sitLoop, 0.15);
      if (onDone) onDone();
      return !!(actions.sitLoop || actions.sit);
    },

    /** Stand up after rest → idle. */
    playStand(onDone) {
      if (state === 'dead') return false;
      if (state !== 'sitting' && state !== 'sitDown') {
        if (onDone) onDone();
        return false;
      }
      if (actions.stand) {
        // ensure forward playback (sit may have used reverse clone, not this action)
        actions.stand.setEffectiveTimeScale(1);
        return playOneShot(actions.stand, 'standUp', function () {
          state = 'loco';
          inst._state = state;
          if (actions.idle) crossTo(actions.idle, 0.12);
          if (onDone) onDone();
        }, 0.12, 1);
      }
      state = 'loco';
      this._state = state;
      if (actions.idle) crossTo(actions.idle, 0.15);
      if (onDone) onDone();
      return true;
    },

    /** Toggle sit / stand. */
    toggleSit(onDone) {
      if (state === 'sitting' || state === 'sitDown') return this.playStand(onDone);
      return this.playSit(onDone);
    },

    /** Death (diy) — one-shot, stays on last frame. */
    playDeath(onDone) {
      moving = false;
      this._moving = false;
      const ok = playOneShot(actions.diy, 'dead', function () {
        state = 'dead';
        inst._state = state;
        // hold last frame
        if (actions.diy) {
          actions.diy.paused = true;
        }
        if (onDone) onDone();
      }, 0.1);
      if (!ok) {
        state = 'dead';
        this._state = state;
        if (onDone) onDone();
      }
      return ok;
    },

    /** After respawn — back to idle. */
    playRevive() {
      state = 'loco';
      this._state = state;
      moving = false;
      this._moving = false;
      allActions().forEach((a) => {
        if (!a) return;
        a.paused = false;
        a.stop();
      });
      if (actions.idle) {
        actions.idle.reset().setEffectiveWeight(1).play();
      }
    },

    /** facing: 0 = +Z (как player.facing) */
    setFacing(facingRad) {
      root.rotation.y = (facingRad || 0) + yawOff;
    },

    update(dt) {
      // Scrub cast pose by cast bar progress.
      // cover scales with cast speed: short cast → higher cover → faster body motion.
      if (castSync && state === 'cast' && castSync.action) {
        const now = performance.now();
        let pct = 0;
        // Prefer live SkillManager cast bar (same clock as UI)
        try {
          const sm = (typeof window !== 'undefined' && window.game && window.game.player)
            ? window.game.player.skillManager : null;
          const c = sm && sm.casting;
          if (c && c.totalMs > 0 && c.endsAt != null) {
            const left = Math.max(0, c.endsAt - now);
            pct = 1 - left / c.totalMs;
          } else {
            const elapsed = now - castSync.startMs;
            pct = elapsed / Math.max(1, castSync.durationMs);
          }
        } catch (e0) {
          const elapsed = now - castSync.startMs;
          pct = elapsed / Math.max(1, castSync.durationMs);
        }
        pct = Math.min(1, Math.max(0, pct));

        // Recalc cover from actual remaining total if available (cast speed already baked into totalMs)
        let cover = castSync.cover != null ? castSync.cover : 0.55;
        try {
          const sm = (typeof window !== 'undefined' && window.game && window.game.player)
            ? window.game.player.skillManager : null;
          const c = sm && sm.casting;
          if (c && c.totalMs > 50) {
            const castSecLive = c.totalMs / 1000;
            const REF = 4.0;
            const BASE = 0.55;
            const ratio = REF / Math.max(0.2, castSecLive);
            cover = Math.max(0.38, Math.min(1.0, BASE * Math.pow(ratio, 0.9)));
            castSync.cover = cover;
          }
        } catch (e1) { /* keep stored cover */ }

        try {
          const a = castSync.action;
          a.paused = true;
          a.enabled = true;
          a.time = Math.min(castSync.clipDur - 1e-4, pct * castSync.clipDur * cover);
          a.setEffectiveWeight(1);
          a.weight = 1;
          if (!a.isRunning()) a.play();
        } catch (e) { /* ignore */ }
      }
      if (mixer) mixer.update(dt || 0);
      if (gripOn && fingerGrip) fingerGrip.apply();
      // замах доигран: короткая пауза в конечной позе (ждём следующую атаку), затем стойка
      if (state === 'attack' && attackEndsAt &&
          performance.now() > attackEndsAt + (attackFinishing ? 0 : 450)) {
        attackEndsAt = 0;
        attackFinishing = false;
        this.playIdle();
      }
    },

    dispose() {
      if (mixer) {
        mixer.removeEventListener('finished', onFinished);
        mixer.stopAllAction();
      }
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose?.();
      });
    }
  };

  if (actions.idle) {
    actions.idle.reset().setEffectiveWeight(1).play();
    mixer && mixer.update(0);
  }
  return inst;
}

/** Resolve def by class + gender */
export function resolveModelDef(cls, gender) {
  // Своих моделей у классов пока нет: модель инженера нужного пола для всех классов
  return gender === 'female' ? CHAR_MODELS.engi_f : CHAR_MODELS.engi_m;
}

/**
 * For in-game player: mesh Group uses PLAYER_FOOT convention (y ≈ center).
 * Model feet at local y = -footOffset so world feet sit on ground.
 */
export async function attachPlayerModel(meshGroup, cls, gender, opts) {
  opts = opts || {};
  const def = resolveModelDef(cls, gender);
  if (!def) return null;

  const foot = opts.footOffset != null
    ? opts.footOffset
    : (typeof window !== 'undefined' && window.Terrain && window.Terrain.PLAYER_FOOT != null
      ? window.Terrain.PLAYER_FOOT
      : 0.95);

  const inst = await loadCharacterModel(def, {
    height: opts.height != null ? opts.height : def.height,
    aniso: opts.aniso,
    loadRun: true,
    appearance: opts.appearance || null
  });

  // hide built-in select ring in world
  if (inst.root.userData.ring) inst.root.userData.ring.visible = false;
  // hide contact shadow if player already has one
  if (opts.hideShadow) {
    inst.root.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.type === 'CircleGeometry' && o.material && o.material.opacity < 0.5) {
        o.visible = false;
      }
    });
  }

  // As-exported scale only. Place feet: bone minY → 0, then −PLAYER_FOOT.
  inst.root.position.set(0, 0, 0);
  inst.root.scale.set(1, 1, 1);
  inst.root.updateMatrixWorld(true);
  try {
    const vp = new THREE.Vector3();
    let minY = Infinity;
    inst.root.traverse((o) => {
      if (!o.isBone) return;
      o.getWorldPosition(vp);
      if (vp.y < minY) minY = vp.y;
    });
    if (isFinite(minY)) {
      inst.root.position.y = -minY - foot;
    } else {
      inst.root.position.y = -foot;
    }
  } catch (e) {
    inst.root.position.y = -foot;
  }
  // store so player can re-ground if needed
  inst.root.userData.footOffset = foot;
  inst.footOffset = foot;

  meshGroup.add(inst.root);
  meshGroup.userData.charModel = inst;
  return inst;
}

/**
 * Ground-loot / world prop: load weapon FBX scaled for drop pile (not hand attach).
 * @param {string} weaponId - WEAPON_VISUALS key
 * @param {{ aniso?: number, scale?: number }} [opts]
 *   scale — fraction of worldLen (default 0.55)
 * @returns {Promise<THREE.Object3D|null>}
 */
export async function createWeaponWorldMesh(weaponId, opts) {
  opts = opts || {};
  const vis = getWeaponVisual(weaponId);
  if (!vis || !vis.model) return null;

  let weaponRoot;
  try {
    weaponRoot = await loadWeaponFbx(vis.model, opts.aniso != null ? opts.aniso : 2);
  } catch (e) {
    console.warn('[CharModel] createWeaponWorldMesh load fail', vis.model, e);
    return null;
  }

  // Diffuse-only albedo from catalog (or FBX base_color)
  if (vis.texture) {
    try {
      const tex = await loadSharedTexture(WEAPON_BASE + vis.texture, opts.aniso != null ? opts.aniso : 2);
      forceWeaponDiffuseOnly(weaponRoot, tex, opts.aniso != null ? opts.aniso : 2);
    } catch (e) {
      forceWeaponDiffuseOnly(weaponRoot, null, opts.aniso != null ? opts.aniso : 2);
    }
  } else {
    forceWeaponDiffuseOnly(weaponRoot, null, opts.aniso != null ? opts.aniso : 2);
  }

  const holder = new THREE.Group();
  holder.name = 'drop_weapon_' + weaponId;
  holder.add(weaponRoot);
  holder.updateMatrixWorld(true);

  // Lay flat on ground (readable silhouette, no hover anim)
  // Long axis along XZ; slight random yaw applied by caller optional
  holder.rotation.x = Math.PI / 2; // tip along ground plane
  holder.rotation.z = Math.PI * 0.12;
  holder.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(holder);
  const sz = new THREE.Vector3();
  box.getSize(sz);
  const maxDim = Math.max(sz.x, sz.y, sz.z);
  // Bigger on ground so weapon type is obvious (default ~ full hand worldLen)
  const want = (vis.worldLen != null ? vis.worldLen : 0.7) * (opts.scale != null ? opts.scale : 0.95);
  if (maxDim > 1e-6) {
    holder.scale.multiplyScalar(want / maxDim);
  }
  // sit on ground: bottom of bbox at y=0 of holder
  holder.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(holder);
  holder.position.y -= box2.min.y;
  holder.userData.weaponId = weaponId;
  holder.userData.dropWeapon = true;
  holder.userData.staticDrop = true; // no spin / bob
  return holder;
}

/**
 * No-op kept for API compat. Scaling was destroying Mixamo skin — never re-scale.
 */
export function forceHumanWorldHeight(obj, want) {
  if (obj) {
    console.log('[CharModel] forceHuman disabled (as-exported scale)');
  }
}

/** Мастер-шаблоны по модели: modelId → Promise<template> */
const _masterTemplates = new Map();
const LOD_TIERS = 3;

/**
 * Тёплый шаблон модели (engi_m / engi_f) для мгновенного клонирования:
 * тело + все причёски модели (видна причёска по умолчанию) + стартовое оружие,
 * роли клипов, геометрия LOD по частям, материалы лиц.
 * @param {string} modelId
 * @returns {Promise<{ meshRaw: THREE.Object3D, def: object, roleClips: object, footOffset: number, lods: object[], hairMap: THREE.Texture|null, faceMats: object }>}
 */
export async function getMasterTemplate(modelId) {
  const def = CHAR_MODELS[modelId] || CHAR_MODELS.engi_m;
  if (_masterTemplates.has(def.id)) return _masterTemplates.get(def.id);

  const p = (async () => {
    const aniso = 2; // Optimal anisotropic filtering for crowd rendering
    const meshRaw = await loadRawGlb(def.dir, def.meshGlb, aniso);
    prepareModelParts(meshRaw, def);

    // Лица: общий материал на вариант (woman — Main/Main_face2/Main_face3; man — встроенный)
    const faceMats = {};
    for (const f of (def.faces || [])) {
      try { faceMats[f.id] = await getFaceMaterial(def, f.id, aniso); } catch (e) { faceMats[f.id] = null; }
    }
    const defFace = faceMats[def.defaultFace];
    if (defFace) meshRaw.traverse((o) => { if (isBodyPartMesh(o)) o.material = defFace; });

    // Все причёски модели внутри шаблона (клон показывает нужную): общий материал из пула
    const hairMap = await hairAtlasMap(def, aniso);
    const hairMat = getHairTintMaterial(hairMap, HAIR_COLORS[0].hex);
    const arm = armatureOf(meshRaw);
    for (const style of ((def.hair && def.hair.styles) || [])) {
      if (!style.file) continue;
      try {
        const hm = await loadModularHairMesh(def, style, meshRaw, aniso);
        if (hm) arm.add(hm);
      } catch (e) {
        console.warn('[CharModel] template hair warn:', def.id, style.id, e);
      }
    }
    meshRaw.traverse((o) => {
      if (!o.isMesh || String(o.name || '').indexOf('char_hair_') !== 0) return;
      o.material = hairMat;
      o.visible = o.name === 'char_hair_' + def.defaultHair;
    });

    // Attach starter 3D weapon visual
    try {
      await attachWeaponPart(meshRaw, 'apprentice_wand', aniso);
    } catch (e) {
      console.warn('[CharModel] template weapon attach warn:', e);
    }

    // Pre-resolve clips into normalized role clips
    const roleClips = resolveRoleClips(meshRaw.animations || [], def);
    const pin = (c) => (c ? stripHipsTranslation(c) : null);
    Object.keys(roleClips).forEach((k) => {
      if (roleClips[k] && typeof roleClips[k] === 'object' && roleClips[k].isAnimationClip) {
        roleClips[k] = pin(roleClips[k]);
      }
    });

    // Calculate ground foot offset (minY of bones -> 0 -> -PLAYER_FOOT)
    meshRaw.updateMatrixWorld(true);
    let minY = Infinity;
    const vp = new THREE.Vector3();
    meshRaw.traverse((o) => {
      if (o.isBone) {
        o.getWorldPosition(vp);
        if (vp.y < minY) minY = vp.y;
      }
    });
    const footOffset = isFinite(minY) ? -minY - 0.95 : -0.95;

    // ── 3-Tier Geometric LODs: геометрия по имени части (Body, Head, Hair …) ──
    const lods = [];
    const lod0 = {};
    meshRaw.traverse((o) => { if (o.isMesh && o.userData.part) lod0[o.userData.part] = o.geometry; });
    lods.push(lod0);
    const raws = await Promise.all((def.lodGlbs || []).map((f) => loadRawGlb(def.dir, f, aniso).catch(() => null)));
    for (let t = 1; t < LOD_TIERS; t++) {
      const tier = {};
      const raw = raws[t - 1];
      if (raw) {
        raw.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          tier[partNameOf(o.name)] = o.geometry;
          // атлас из LOD-файла не нужен: у клона материал шаблона
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { if (m) { if (m.map) m.map.dispose(); m.dispose(); } });
        });
      }
      lods.push(tier);
    }

    // поза хвата пальцев (оружие в руке у клонов есть всегда)
    const gripPose = gripPoseFromClips(meshRaw.animations || [], def);

    return { meshRaw, def, roleClips, footOffset, lods, hairMap, faceMats, gripPose };
  })();
  _masterTemplates.set(def.id, p);
  p.catch(() => _masterTemplates.delete(def.id));
  return p;
}

/** Совместимость: шаблон мужского инженера. */
export async function getMasterEngineerTemplate() {
  return getMasterTemplate('engi_m');
}

/**
 * Lightning-fast clone of the 3D Engineer model via SkeletonUtils (<1ms per character).
 * Reuses GPU geometries and textures while giving each clone an independent skeleton hierarchy and AnimationMixer.
 * Модель по полу, причёска/краска/лицо — из appearance (общие материалы из пулов).
 * @param {THREE.Group} meshGroup - parent group (e.g. remote player group)
 * @param {object} [opts] - { cls, gender, appearance:{hairId,hairColor,faceId}, hairColor, weaponId, initialAnim, animSpeed, initialDist }
 * @returns {Promise<object|null>}
 */
export async function fastClonePlayerModel(meshGroup, opts) {
  opts = opts || {};
  const def = resolveModelDef(opts.cls, opts.gender);
  const tpl = await getMasterTemplate(def.id);
  if (!tpl || !meshGroup) return null;
  const app = normalizeAppearanceFor(def, Object.assign(
    { hairColor: opts.hairColor || null }, opts.appearance || {}));

  const clonedScene = SkeletonUtils.clone(tpl.meshRaw);
  clonedScene.position.set(0, 0, 0);
  clonedScene.scale.set(1, 1, 1);
  clonedScene.updateMatrixWorld(true);

  let weaponHolder = null;
  let hairMesh = null;
  const skeletons = [];
  const lodMeshes = [];   // части, у которых есть LOD-геометрия (тело + встроенная причёска)
  const hairMat = getHairTintMaterial(tpl.hairMap, app.hairColor);
  const faceMat = tpl.faceMats && tpl.faceMats[app.faceId];
  clonedScene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false; // Disable expensive dynamic shadow map sampling on crowd
    }
    if (o.isSkinnedMesh && o.skeleton) {
      if (!skeletons.includes(o.skeleton)) skeletons.push(o.skeleton);
    }
    if (o.name && o.name === 'char_weapon_holder') {
      weaponHolder = o;
    }
    if (o.isMesh && String(o.name || '').indexOf('char_hair_') === 0) {
      o.visible = o.name === 'char_hair_' + app.hairId;
      if (o.visible) {
        o.material = hairMat;
        hairMesh = o;
      }
    } else if (faceMat && isBodyPartMesh(o)) {
      o.material = faceMat;
    }
    if (o.isMesh && o.userData && o.userData.part) lodMeshes.push(o);
  });

  let skelDirty = true;
  skeletons.forEach((sk) => {
    const origUpdate = sk.update;
    sk.update = function () {
      if (!skelDirty) return;
      origUpdate.call(this);
    };
  });

  // Pre-initialize bone textures to prevent first-render frame drops
  const rend = opts.renderer || _warmupRenderer || (typeof window !== 'undefined' && window.game && window.game.renderer) || (typeof window !== 'undefined' && window.CharModel && window.CharModel.renderer);
  skeletons.forEach((sk) => {
    if (sk && typeof sk.computeBoneTexture === 'function') {
      if (sk.boneTexture === null) sk.computeBoneTexture();
      if (rend && typeof rend.initTexture === 'function' && sk.boneTexture) {
        try { rend.initTexture(sk.boneTexture); } catch (e) { }
      }
    }
  });

  function applyLod(tier) {
    const geoms = tpl.lods && tpl.lods[tier];
    if (!geoms) return;
    for (let i = 0; i < lodMeshes.length; i++) {
      const m = lodMeshes[i];
      const g = geoms[m.userData.part] || tpl.lods[0][m.userData.part];
      if (g && m.geometry !== g) m.geometry = g;
    }
  }

  // ─── Initial Geometric LOD from spawn distance (avoids geometry swap on frame 0) ───
  let startLod = 0;
  const startDist = (opts.initialDist != null && isFinite(opts.initialDist)) ? opts.initialDist : 0;
  if (startDist > 35.0) startLod = 2;
  else if (startDist > 12.0) startLod = 1;
  if (startLod > 0) applyLod(startLod);

  // Independent AnimationMixer on cloned skeleton
  const mixer = new THREE.AnimationMixer(clonedScene);
  const actions = {};
  const roleClips = tpl.roleClips || {};
  const animSpeed = opts.animSpeed != null ? opts.animSpeed : (0.92 + Math.random() * 0.16);

  function makeAction(clip, loopOnce) {
    if (!clip) return null;
    try {
      const a = mixer.clipAction(clip);
      a.enabled = true;
      a.setEffectiveTimeScale(animSpeed);
      if (loopOnce) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      } else {
        a.setLoop(THREE.LoopRepeat);
      }
      return a;
    } catch (e) {
      return null;
    }
  }

  // Lazy action getter: binds KeyframeTracks and bones on demand
  function getAction(name) {
    if (!name) return null;
    if (actions[name]) return actions[name];
    const loopOnce = (name === 'punch' || name === 'heal' || name === 'skill' || name === 'vamp' || name === 'sit' || name === 'stand' || name === 'diy');
    const clip = roleClips[name];
    if (!clip) return null;
    const a = makeAction(clip, loopOnce);
    if (a) actions[name] = a;
    return a;
  }

  // Автоатака: пара A/B на тип удара (лениво), клип по оружию, один замах на атаку
  const attackHits = def.attacks || { punch: { hit: 0.31 } };
  const attackPairs = {};
  function attackPair(kind) {
    if (attackPairs[kind] !== undefined) return attackPairs[kind];
    const clip = roleClips[kind];
    let pair = null;
    if (clip) {
      const a = (kind === 'punch') ? getAction('punch') : makeAction(clip, true);
      const b = makeAction(attackClipTwin(clip), true);
      if (a && b) pair = [a, b];
    }
    attackPairs[kind] = pair;
    return pair;
  }
  function isAttackAction(a) {
    if (!a) return false;
    for (const k in attackPairs) {
      const p = attackPairs[k];
      if (p && (p[0] === a || p[1] === a)) return true;
    }
    return false;
  }
  let attackEndsAt = 0;

  // Пальцы правой кисти сжаты на рукояти, пока в руке оружие (шаблон — с ударником)
  const fingerGrip = makeFingerGrip(clonedScene, tpl.gripPose);
  let gripOn = true;

  const root = new THREE.Group();
  root.name = 'char_clone_' + def.id;
  root.add(clonedScene);
  root.position.y = tpl.footOffset;

  let currentAction = null;

  function playAction(next, fade) {
    if (!next) return;
    if (currentAction === next && next.isRunning()) return;
    const f = (fade != null) ? fade : 0.18;
    if (currentAction && currentAction !== next) {
      currentAction.fadeOut(f);
    }
    next.reset().fadeIn(f).play();
    currentAction = next;
    skelDirty = true;
  }

  // Pre-bind core locomotor & combat actions so first run/walk/attack has 0 track-binding hitch
  const coreActions = ['idle', 'walk', 'run', 'punch'];
  for (let i = 0; i < coreActions.length; i++) {
    getAction(coreActions[i]);
  }

  const initialAnim = opts.initialAnim || 'idle';
  const startAct = actions[initialAnim] || actions.idle;
  if (startAct) playAction(startAct);
  mixer.update(0);
  skelDirty = true;

  const inst = {
    root: root,
    meshGroup: meshGroup,
    clonedScene: clonedScene,
    mixer: mixer,
    actions: actions,
    def: def,
    appearance: app,
    playIdle() { const a = getAction('idle'); if (a) playAction(a); },
    playWalk() { const a = getAction('walk'); if (a) playAction(a); },
    playRun() { const a = getAction('run'); if (a) playAction(a); },
    playPunch() { return this.playAttack(0, { weaponClass: 'fist' }); },
    /**
     * Один замах на атаку: клип по типу оружия, растянут на период durationSec.
     * @returns {number} задержка до контакта, с
     */
    playAttack(durationSec, opts) {
      if (opts && typeof opts === 'function') opts = null;
      opts = opts || {};
      const chain = attackKindChain(attackKindFor(opts.weaponClass || this._weaponClass));
      let kind = null;
      let pair = null;
      for (let i = 0; i < chain.length && !pair; i++) {
        pair = attackPair(chain[i]);
        if (pair) kind = chain[i];
      }
      if (!pair) return 0;
      const next = (currentAction === pair[0]) ? pair[1] : pair[0];
      const hit = (attackHits[kind] && attackHits[kind].hit) || 0.35;
      const tm = attackTiming(next.getClip().duration, hit, durationSec);
      const fade = isAttackAction(currentAction) ? 0.08 : 0.12;
      if (currentAction && currentAction !== next) currentAction.fadeOut(fade);
      next.reset();
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.setEffectiveTimeScale(tm.timeScale);
      next.setEffectiveWeight(1);
      next.fadeIn(fade).play();
      currentAction = next;
      skelDirty = true;
      attackEndsAt = performance.now() + tm.swingSec * 1000;
      return tm.impactSec;
    },
    /** Тип оружия в руке (shared/item-db weaponClass) — для выбора клипа удара. */
    setWeaponClass(wc) { this._weaponClass = wc || null; },
    get state() {
      if (isAttackAction(currentAction)) return 'attack';
      const runAct = actions.run;
      const walkAct = actions.walk;
      return ((runAct && runAct.isRunning && runAct.isRunning()) ? 'run'
          : ((walkAct && walkAct.isRunning && walkAct.isRunning()) ? 'walk' : 'loco'));
    },
    playCast(which) {
      const act = getAction(which) || getAction('heal') || getAction('skill');
      if (act) playAction(act, 0.08);
    },
    playDeath(onDone) {
      const act = getAction('diy') || getAction('punch');
      if (act) {
        playAction(act, 0.08);
        if (onDone) setTimeout(onDone, 1200);
      }
    },
    setMoving(isMoving, mode) {
      if (isMoving) {
        if (mode === 'run') {
          const a = getAction('run');
          if (a) playAction(a);
        } else {
          const a = getAction('walk');
          if (a) playAction(a);
        }
      } else {
        const a = getAction('idle');
        if (a) playAction(a);
      }
    },
    setFacing(rad) {
      root.rotation.y = rad || 0;
      skelDirty = true;
    },
    _weaponHolder: weaponHolder,
    _hairMesh: hairMesh,
    _staggerPhase: opts.staggerPhase || 0,
    _tickCount: 0,
    _currentGeomLod: startLod,
    _visibleGraceFrames: 15,
    _currentWeaponId: 'apprentice_wand',
    /** @param {string|null} nextWeaponId - null: пустые руки (шаблон несёт ударник ученика) */
    async setWeapon(nextWeaponId) {
      const next = nextWeaponId || null;
      if (this._currentWeaponId === next) return;
      this._currentWeaponId = next;
      if (!next) {
        removeAttachedWeapon(clonedScene);
        gripOn = false;
        return;
      }
      try {
        const h = await attachWeaponPart(clonedScene, next, 2);
        gripOn = !!h;
      } catch (e) {
        console.warn('[CharModel] fastClone setWeapon fail:', e);
      }
    },
    setGeomLod(lodTier) {
      if (this._currentGeomLod === lodTier) return;
      this._currentGeomLod = lodTier;
      applyLod(lodTier);
    },
    update(dt, dist, isTarget) {
      if (!mixer) return;
      this._tickCount = (this._tickCount || 0) + 1;
      const d = (dist != null) ? dist : (meshGroup && meshGroup.position && window.game && window.game.player && window.game.player.mesh
        ? meshGroup.position.distanceTo(window.game.player.mesh.position)
        : 10);
      const gFrame = (typeof window !== 'undefined' && window.game && window.game._frameCount) || this._tickCount;
      const phase = this._staggerPhase || 0;
      const isEditor = (typeof window.isSceneEditorActive === 'function' && window.isSceneEditorActive());

      let targetLod = this._currentGeomLod || 0;
      // ─── 3-Tier Geometric LOD with Hysteresis & Visibility Grace Period ───
      if (this._visibleGraceFrames > 0) {
        this._visibleGraceFrames--;
      } else {
        const cur = targetLod;
        const isHeroOrClose = isTarget || (isEditor ? (d <= 20.0) : (d <= 12.0));
        if (isHeroOrClose) {
          targetLod = 0;
        } else if (cur === 0) {
          if (d > 16.0) targetLod = (d > 40.0) ? 2 : 1;
        } else if (cur === 1) {
          if (d <= 10.0) targetLod = 0;
          else if (d > 40.0) targetLod = 2;
        } else if (cur === 2) {
          if (d <= 10.0) targetLod = 0;
          else if (d <= 32.0) targetLod = 1;
        }
        if (targetLod !== cur) {
          this.setGeomLod(targetLod);
        }
      }

      // ─── Geometric Submesh LOD ───
      if (weaponHolder) weaponHolder.visible = (isTarget || d <= 25.0);

      // ─── Staggered Skeletal Animation LOD ───
      skelDirty = false;
      if (targetLod === 0) {
        mixer.update(dt || 0);
        skelDirty = true;
      } else if (targetLod === 1) {
        if (((gFrame + phase) % 2) === 0) {
          mixer.update((dt || 0) * 2);
          skelDirty = true;
        }
      } else {
        if (((gFrame + phase) % 4) === 0) {
          mixer.update((dt || 0) * 4);
          skelDirty = true;
        }
      }
      // пальцы на рукояти (только когда поза пересчитана; дальний LOD — без кистей)
      if (skelDirty && gripOn && fingerGrip && targetLod < 2) fingerGrip.apply();
      // замах доигран и новой атаки нет — обратно в стойку
      if (attackEndsAt && performance.now() > attackEndsAt + 450 && isAttackAction(currentAction)) {
        attackEndsAt = 0;
        this.playIdle();
      }
    },
    dispose() {
      if (mixer) mixer.stopAllAction();
      if (root.parent) root.parent.remove(root);
      meshGroup.remove(root);
    }
  };

  // Оружие из снапшота: другое — перевесить, null — убрать стартовое из шаблона
  if (opts.weaponId !== undefined && opts.weaponId !== 'apprentice_wand') {
    try {
      await inst.setWeapon(opts.weaponId);
    } catch (e) {
      console.warn('[CharModel] fastClone setWeapon fail:', e);
    }
  }

  meshGroup.add(root);
  meshGroup.userData.charModel = inst;
  return inst;
}

const _yieldFrame = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => setTimeout(resolve, 10));
  } else {
    setTimeout(resolve, 10);
  }
});

let _warmupDone = false;
let _warmupPromise = null;
let _warmupRenderer = null;

/**
 * Preloads master templates and secondary weapons asynchronously in background.
 */
export function preloadAssets() {
  try { sharedDracoLoader().preload(); } catch (e) { /* декодер догрузится при первом GLB */ }
  getMasterTemplate('engi_m').catch(() => { });
  getMasterTemplate('engi_f').catch(() => { });
  loadWeaponFbx('models/novice.fbx', 2).catch(() => { });
  loadSharedTexture(WEAPON_BASE + 'textures/novice.webp', 2).catch(() => { });
  loadWeaponFbx('models/magic_mace.fbx', 2).catch(() => { });
  loadSharedTexture(WEAPON_BASE + 'textures/magic_mace.webp', 2).catch(() => { });
}

/**
 * Pre-warms the character pipeline (models, textures, WebGL shaders, GPU buffers)
 * to completely eliminate in-game stutter when another player appears.
 * Обе модели (мужчина и женщина): тело, лица, краска волос (одна программа), LOD 0–2.
 * @param {THREE.WebGLRenderer} [renderer]
 * @param {THREE.Camera} [camera]
 * @param {THREE.Scene} [scene]
 * @param {boolean} [force]
 * @returns {Promise<boolean>}
 */
export async function warmupPipeline(renderer, camera, scene, force) {
  if (_warmupDone && !force) return true;
  if (_warmupPromise && !force) return _warmupPromise;

  _warmupPromise = (async () => {
    try {
      console.log('[CharModel] warmupPipeline: preloading master templates...');
      const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

      // 1. Master templates for both models (body + hair styles + apprentice_wand + clips + lods)
      const tpls = (await Promise.all(['engi_m', 'engi_f'].map((id) => getMasterTemplate(id).catch((e) => {
        console.warn('[CharModel] warmupPipeline: template fail', id, e);
        return null;
      })))).filter((t) => t && t.meshRaw);
      await _yieldFrame();
      if (!tpls.length) {
        console.warn('[CharModel] warmupPipeline: master templates unavailable');
        return false;
      }

      // 2. Preload secondary weapons into cache
      let maceObj = null;
      try {
        const maceTex = await loadSharedTexture(WEAPON_BASE + 'textures/magic_mace.webp', 2);
        maceObj = await loadWeaponFbx('models/magic_mace.fbx', 2);
        if (maceObj && maceTex) {
          forceWeaponDiffuseOnly(maceObj, maceTex, 2);
        }
      } catch (eMace) {
        console.warn('[CharModel] warmup weapon preload warn:', eMace);
      }

      // 3. Hair dye materials for canonical colors (shared program, uniforms only) + GPU texture upload
      const commonHairColors = HAIR_COLORS.map((c) => c.hex).concat(['#c49a45', '#2b1d0c', '#8a2218', '#d9d9d9']);
      tpls.forEach((tpl) => commonHairColors.forEach((hex) => getHairTintMaterial(tpl.hairMap, hex)));

      if (renderer && typeof renderer.initTexture === 'function') {
        const initMap = (m) => { if (m && m.map) { try { renderer.initTexture(m.map); } catch (e) { } } };
        const preInit = (obj) => {
          if (!obj) return;
          obj.traverse((o) => {
            if (o.isMesh && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(initMap);
          });
        };
        tpls.forEach((tpl) => {
          preInit(tpl.meshRaw);
          Object.values(tpl.faceMats || {}).forEach(initMap);
          if (tpl.hairMap) { try { renderer.initTexture(tpl.hairMap); } catch (e) { } }
        });
        if (maceObj) preInit(maceObj);
      }

      // 4. Pre-compile WebGL shaders with isolated microScene (Zero-Stutter, zero main-thread lock)
      if (renderer && camera && scene) {
        _warmupRenderer = renderer;
        try {
          if (typeof window !== 'undefined' && window.CharModel && !Object.isFrozen(window.CharModel)) {
            window.CharModel.renderer = renderer;
          }
        } catch (eRend) { }
        const warmupGroup = new THREE.Group();
        warmupGroup.name = 'char_pipeline_warmup';
        warmupGroup.position.set(0, -9999, 0);

        // Клон каждого шаблона: части для LOD, все причёски видимы (одна программа на всех)
        const warm = tpls.map((tpl, i) => {
          const clone = SkeletonUtils.clone(tpl.meshRaw);
          clone.position.x = i * 1.5;
          warmupGroup.add(clone);
          const lodMeshes = [];
          const bodyMeshes = [];
          clone.traverse((o) => {
            if (o.isMesh && o.userData && o.userData.part) lodMeshes.push(o);
            if (isBodyPartMesh(o)) bodyMeshes.push(o);
            if (o.isMesh && String(o.name || '').indexOf('char_hair_') === 0) o.visible = true;
            if (o.isSkinnedMesh && o.skeleton && typeof o.skeleton.computeBoneTexture === 'function') {
              // Pre-compute bone textures for clone skeletons and upload to GPU VRAM
              if (o.skeleton.boneTexture === null) o.skeleton.computeBoneTexture();
              if (typeof renderer.initTexture === 'function' && o.skeleton.boneTexture) {
                try { renderer.initTexture(o.skeleton.boneTexture); } catch (e) { }
              }
            }
          });
          const setLod = (tier) => {
            const geoms = tpl.lods && tpl.lods[tier];
            if (!geoms) return;
            lodMeshes.forEach((m) => {
              const g = geoms[m.userData.part] || tpl.lods[0][m.userData.part];
              if (g && m.geometry !== g) m.geometry = g;
            });
          };
          return { tpl, clone, bodyMeshes, setLod };
        });
        const setWarmupLod = (tier) => warm.forEach((w) => w.setLod(tier));

        if (maceObj) {
          warmupGroup.add(maceObj);
        }

        // Dummy nameplate sprite with depthTest: false to pre-compile sprite shader matching remote players
        const dummyCanvas = document.createElement('canvas');
        dummyCanvas.width = 16; dummyCanvas.height = 16;
        const dummyTex = new THREE.CanvasTexture(dummyCanvas);
        dummyTex.generateMipmaps = false;
        dummyTex.minFilter = THREE.LinearFilter;
        dummyTex.magFilter = THREE.LinearFilter;
        if (renderer && typeof renderer.initTexture === 'function') {
          try { renderer.initTexture(dummyTex); } catch (e) { }
        }
        const dummySpriteMat = new THREE.SpriteMaterial({
          map: dummyTex,
          transparent: true,
          depthTest: false,
          depthWrite: false
        });
        _pinnedSpriteMaterial = dummySpriteMat;
        const dummySprite = new THREE.Sprite(dummySpriteMat);
        warmupGroup.add(dummySprite);

        // Изолированная микро-сцена: содержит ТОЛЬКО warmupGroup и базовое освещение/туман,
        // что исключает обход сотен мешей мира (ранее вызывавший фриз на 3.8с).
        const microScene = new THREE.Scene();
        if (scene.fog) microScene.fog = scene.fog;
        if (scene.environment) microScene.environment = scene.environment;
        const microAmb = new THREE.AmbientLight(0xffffff, 1.0);
        microScene.add(microAmb);
        microScene.add(warmupGroup);

        const sun = (typeof window !== 'undefined' && window.game && window.game.sun) || scene.getObjectByName('SunKey');
        const moon = (typeof window !== 'undefined' && window.game && window.game.dayNight && window.game.dayNight.moon) || scene.getObjectByName('MoonKey');
        let microSun = null;
        let microMoon = null;
        if (sun) {
          microSun = sun.clone();
          if (sun.shadow && sun.shadow.map) microSun.shadow.map = sun.shadow.map;
          microScene.add(microSun);
        }
        if (moon) {
          microMoon = moon.clone();
          if (moon.shadow && moon.shadow.map) microMoon.shadow.map = moon.shadow.map;
          microScene.add(microMoon);
        }

        const warmupCam = new THREE.PerspectiveCamera(60, 1, 0.1, 50);
        warmupCam.position.set(0, -9999, 4);
        warmupCam.lookAt(0, -9999, 0);
        warmupCam.updateMatrixWorld(true);

        const compileNow = async () => {
          if (typeof renderer.compileAsync === 'function') {
            await renderer.compileAsync(warmupGroup, warmupCam, microScene);
          } else if (typeof renderer.compile === 'function') {
            renderer.compile(warmupGroup, warmupCam, microScene);
          }
        };
        const setShadows = (on) => warm.forEach((w) => w.clone.traverse((o) => {
          if (o.isMesh) { o.castShadow = on; o.receiveShadow = on; }
        }));

        await _yieldFrame();
        // Variant A: receiveShadow = true (local player style)
        setShadows(true);
        await compileNow();

        await _yieldFrame();
        // Variant B: receiveShadow = false, castShadow = false (remote player & crowd clone style)
        setShadows(false);
        await compileNow();

        // Face variants (woman): same program as body, material uniforms only
        for (const w of warm) {
          const faces = Object.values(w.tpl.faceMats || {}).filter(Boolean);
          for (const fm of faces) {
            await _yieldFrame();
            w.bodyMeshes.forEach((m) => { m.material = fm; });
            await compileNow();
          }
        }

        // Precompile LOD 1 and LOD 2 permutations
        for (let lodTier = 1; lodTier <= 2; lodTier++) {
          await _yieldFrame();
          setWarmupLod(lodTier);
          await compileNow();
        }
        setWarmupLod(0);

        // Day / Night shadow permutations warmup
        if (microSun && microMoon && renderer.shadowMap && renderer.shadowMap.enabled) {
          await _yieldFrame();
          microSun.castShadow = true; microMoon.castShadow = false;
          if (typeof renderer.compile === 'function') renderer.compile(warmupGroup, warmupCam, microScene);

          await _yieldFrame();
          microSun.castShadow = false; microMoon.castShadow = true;
          if (typeof renderer.compile === 'function') renderer.compile(warmupGroup, warmupCam, microScene);
        }

        // 5. Zero-freeze 1x1 GPU Hardware Pipeline Pass:
        // Renders directly to default framebuffer (canvas) using 1x1 scissor viewport.
        // Guarantees exact toneMapping, outputColorSpace, and fog match without offscreen target mismatch.
        // Forces GPU driver to allocate VBOs, VAOs, programs, and sampler states in VRAM.
        // CRITICAL: Executed strictly synchronously (<0.2ms) without yielding frames!
        // Yielding frames while scissor=(0,0,1,1) and autoClear=false caused the main game loop
        // in main.js to render into 1x1 pixel, resulting in black screen blinking.
        let prevSunCast = false;
        let prevMoonCast = false;
        let prevTarget = null;
        let prevScissorTest = false;
        const prevViewport = new THREE.Vector4();
        const prevScissor = new THREE.Vector4();
        let prevAutoClear = true;
        let prevShadowAuto = false;

        try {
          prevTarget = renderer.getRenderTarget();
          prevScissorTest = renderer.getScissorTest();
          renderer.getViewport(prevViewport);
          renderer.getScissor(prevScissor);
          prevAutoClear = renderer.autoClear;
          prevShadowAuto = renderer.shadowMap ? renderer.shadowMap.autoUpdate : false;

          // Disable redundant 2048x2048 shadow passes during 1x1 scissor micro pass
          if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
          renderer.autoClear = false;
          renderer.setRenderTarget(null);
          renderer.setScissorTest(true);
          renderer.setScissor(0, 0, 1, 1);
          renderer.setViewport(0, 0, 1, 1);

          // GL_INVALID_OPERATION Guard:
          // During the 1x1 micro pass, if lights lack rendered depth shadow maps,
          // disable shadow casting to avoid sampler2DShadow format mismatch with fallback dummy textures
          prevSunCast = microSun ? microSun.castShadow : false;
          prevMoonCast = microMoon ? microMoon.castShadow : false;
          const hasSunDepthMap = Boolean(microSun && microSun.shadow && microSun.shadow.map && (microSun.shadow.map.depthTexture || microSun.shadow.map.texture));
          const hasMoonDepthMap = Boolean(microMoon && microMoon.shadow && microMoon.shadow.map && (microMoon.shadow.map.depthTexture || microMoon.shadow.map.texture));
          if (microSun) microSun.castShadow = hasSunDepthMap;
          if (microMoon) microMoon.castShadow = hasMoonDepthMap;

          // Synchronous execution (<0.2ms total) — zero event loop yield while scissor=(0,0,1,1):
          // Draw LOD 0, 1, 2 of both models (VAO/VBO per geometry allocated in VRAM)
          renderer.render(microScene, warmupCam);
          setWarmupLod(1);
          renderer.render(microScene, warmupCam);
          setWarmupLod(2);
          renderer.render(microScene, warmupCam);
          setWarmupLod(0);

          dummyTex.dispose();
          // NOTE: dummySpriteMat is intentionally pinned in _pinnedSpriteMaterial without calling .dispose()
          // to prevent WebGLProgramCache from releasing and deleting the compiled sprite shader!
        } catch (eScratch) {
          console.warn('[CharModel] warmup micro pass warn:', eScratch);
        } finally {
          // Guaranteed restoration of renderer state in all cases before next frame:
          try {
            renderer.setScissorTest(prevScissorTest);
            renderer.setScissor(prevScissor.x, prevScissor.y, prevScissor.z, prevScissor.w);
            renderer.setViewport(prevViewport.x, prevViewport.y, prevViewport.z, prevViewport.w);
            renderer.autoClear = prevAutoClear;
            if (renderer.shadowMap) renderer.shadowMap.autoUpdate = prevShadowAuto;
            renderer.setRenderTarget(prevTarget || null);
          } catch (eRestore) { }
          if (microSun) microSun.castShadow = prevSunCast;
          if (microMoon) microMoon.castShadow = prevMoonCast;
          if (warmupGroup.parent) warmupGroup.parent.remove(warmupGroup);
        }
      }

      _warmupDone = true;
      const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      console.log(`[CharModel] warmupPipeline finished in ${(t1 - t0).toFixed(1)}ms (0-freeze ready)`);
      return true;
    } catch (err) {
      console.warn('[CharModel] warmupPipeline error:', err);
      return false;
    }
  })();

  return _warmupPromise;
}

export default {
  CHAR_MODELS,
  HAIR_STYLES,
  FACE_STYLES,
  WEAPON_VISUALS,
  getWeaponVisual,
  setWeaponGripOverride,
  clearWeaponGripOverride,
  applyWeaponGripLive,
  exportWeaponGripSnippet,
  getAllWeaponGripOverrides,
  applyWeaponGripOverridesBatch,
  rehydrateWeaponGrips,
  createWeaponWorldMesh,
  loadCharacterModel,
  resolveModelDef,
  attachPlayerModel,
  attachHairPart,
  attachWeaponPart,
  applyHairColorToRoot,
  applyFaceMap,
  forceHumanWorldHeight,
  getMasterEngineerTemplate,
  getMasterTemplate,
  getAppearanceOptions,
  normalizeAppearanceFor,
  HAIR_COLORS,
  fastClonePlayerModel,
  preloadAssets,
  warmupPipeline
};
