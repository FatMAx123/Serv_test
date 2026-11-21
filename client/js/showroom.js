// ============================================================
//  SHOWROOM.JS — Interactive 3D Character Showroom & Customization Lab
//  Project Steam: Origins (Three.js r185)
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from './libs/addons/controls/OrbitControls.js';

// Expose THREE globally for tooling and console inspection
window.THREE = THREE;

// Base Paths
const PATH_WOMAN = 'assets/Characters/engi/Woman/';
// Версия сборки scripts/build_woman_glb.py — сбрасывает HTTP-кеш (max-age) после пересборки
const WOMAN_ASSET_VER = '20261121m';
const PATH_MAN = 'assets/Characters/engi/man/';
const PATH_WEAPONS = 'assets/weapons/';

// Application State
const state = {
  character: 'engi_woman', // 'engi_woman' | 'engi_man'
  variant: 'modular',      // 'modular' | 'body_only' | 'hair_only' | 'hair2_only' | 'hair3_only' | 'hair4_only' | 'lod1' | 'lod2'
  atlas: 'main',           // 'main' | 'lod1' | 'lod2'
  hairVisible: true,
  hairStyle: 'hair1',      // 'hair1' | 'hair2' | 'hair3' | 'hair4'
  hairColor: 'original',
  partsVisibility: {
    Head: true,
    Accessory: true,
    tors: true,
    Shorts: true,
    hands: true,
    legs: true
  },
  weapon: 'none',
  enchant: 0,
  aura: 'none',
  animation: 'idle',
  animSpeed: 1.0,
  animPaused: false,
  animLoop: true,
  environment: 'studio',
  wireframe: false,
  showSkeleton: false,
  showBoneHelpers: false,
  selectedBoneName: null,
  pedestal: true,
  autorotate: false
};

// Texture Cache
const texCache = new Map();
function loadTexture(url) {
  if (texCache.has(url)) return Promise.resolve(texCache.get(url));
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.anisotropy = 8;
        texCache.set(url, tex);
        resolve(tex);
      },
      undefined,
      (err) => reject(err)
    );
  });
}

// ─── 3D Scene Core ──────────────────────────────────────────
const canvas = document.getElementById('webgl-canvas');
const container = document.getElementById('viewport-container');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true
});
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1116);

const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 50);
camera.position.set(0, 1.2, 2.8);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.95, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.25;
controls.maxDistance = 6.0;
controls.minPolarAngle = 0.1;
controls.maxPolarAngle = Math.PI / 2 + 0.05;

// Lighting Rig
const hemiLight = new THREE.HemisphereLight(0xfff4e6, 0x1a202c, 0.8);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xfffaed, 2.4);
keyLight.position.set(2.5, 4.0, 3.0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.width = 2048;
keyLight.shadow.mapSize.height = 2048;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 10;
keyLight.shadow.camera.left = -1.8;
keyLight.shadow.camera.right = 1.8;
keyLight.shadow.camera.top = 2.2;
keyLight.shadow.camera.bottom = -0.5;
keyLight.shadow.bias = -0.0005;
keyLight.shadow.normalBias = 0.015;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xcce7ff, 1.2);
fillLight.position.set(-3.0, 2.5, 1.5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x7dd3fc, 2.0);
rimLight.position.set(0, 3.5, -3.0);
scene.add(rimLight);

// Character Root Group
const charRoot = new THREE.Group();
charRoot.position.set(0, 0, 0);
scene.add(charRoot);

// Weapon Root
const weaponRoot = new THREE.Group();
charRoot.add(weaponRoot);

// Aura FX Root
const auraRoot = new THREE.Group();
charRoot.add(auraRoot);

// Pedestal & Floor
const pedestalGroup = new THREE.Group();
scene.add(pedestalGroup);

function buildPedestal() {
  pedestalGroup.clear();

  // 1. Concentric Brass/Marble Pedestal
  const baseGeo = new THREE.CylinderGeometry(1.2, 1.25, 0.08, 48);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x181c24,
    roughness: 0.35,
    metalness: 0.6
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.y = -0.04;
  baseMesh.receiveShadow = true;
  pedestalGroup.add(baseMesh);

  // Gold inlay ring
  const ringGeo = new THREE.TorusGeometry(1.18, 0.015, 16, 48);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xe0a953,
    roughness: 0.25,
    metalness: 0.9
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.y = 0.002;
  pedestalGroup.add(ringMesh);

  // Soft Contact Shadow Plane
  const shadowGeo = new THREE.PlaneGeometry(3.5, 3.5);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.45 });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.001;
  shadowMesh.receiveShadow = true;
  pedestalGroup.add(shadowMesh);
}
buildPedestal();

// Atmospheric Dust/Steam Particles
const particleCount = 120;
const particleGeo = new THREE.BufferGeometry();
const particlePos = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
  particlePos[i * 3 + 0] = (Math.random() - 0.5) * 4.0;
  particlePos[i * 3 + 1] = Math.random() * 2.5;
  particlePos[i * 3 + 2] = (Math.random() - 0.5) * 4.0;
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
const particleMat = new THREE.PointsMaterial({
  color: 0xe0a953,
  size: 0.025,
  transparent: true,
  opacity: 0.35,
  blending: THREE.AdditiveBlending
});
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// ─── Character Management ────────────────────────────────────
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('js/libs/draco/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
const fbxLoader = new FBXLoader();

let activeCharacterModel = null;
let activeMixer = null;
let activeActions = {};
let currentClipName = null;
let womanHairMaterial = null;
let womanAtlasColorTex = null;
const womanHairMeshes = {
  hair1: null,
  hair2: null,
  hair3: null,
  hair4: null
};
let womanClipsCache = null;
let skeletonHelper = null;

// Expose internal state for debugging
window._sr = {
  get activeCharacterModel() { return activeCharacterModel; },
  get activeMixer() { return activeMixer; },
  get state() { return state; },
  get activeActions() { return activeActions; },
  get currentClipName() { return currentClipName; },
  get loadedClipsList() { return loadedClipsList; },
  get camera() { return camera; },
  get controls() { return controls; },
  get fbxLoader() { return fbxLoader; },
  get weaponRoot() { return weaponRoot; },
  get activeWeaponMesh() { return activeWeaponMesh; },
  get womanHairMeshes() { return womanHairMeshes; },
  get womanHairMaterial() { return womanHairMaterial; },
  get WEAPON_DEFINITIONS() { return WEAPON_DEFINITIONS; },
  get LOCKED_FIST_QUATERNIONS_MAN() { return LOCKED_FIST_QUATERNIONS_MAN; },
  get LOCKED_FIST_QUATERNIONS_WOMAN() { return LOCKED_FIST_QUATERNIONS_WOMAN; },
  eulerToQuat: (...args) => eulerToQuat(...args),
  loadWeapon: () => loadWeapon(),
  setCameraPreset: (...args) => setCameraPreset(...args),
  frameCamera: (...args) => frameCamera(...args)
};

function updateSkeletonHelper() {
  if (skeletonHelper) {
    if (skeletonHelper.parent) skeletonHelper.parent.remove(skeletonHelper);
    skeletonHelper.dispose && skeletonHelper.dispose();
    skeletonHelper = null;
  }
  if (state.showSkeleton && activeCharacterModel) {
    activeCharacterModel.updateMatrixWorld(true);
    const arm = activeCharacterModel.getObjectByName('Armature') ||
      activeCharacterModel.getObjectByName('mixamorig:Hips') ||
      activeCharacterModel;
    skeletonHelper = new THREE.SkeletonHelper(arm);
    skeletonHelper.material = new THREE.LineBasicMaterial({
      color: 0x00ff88,
      depthTest: false,
      depthWrite: false,
      transparent: true
    });
    skeletonHelper.renderOrder = 9999;
    charRoot.add(skeletonHelper);
    if (typeof skeletonHelper.updateMatrixWorld === 'function') {
      skeletonHelper.updateMatrixWorld(true);
    }
    console.log('[Showroom] SkeletonHelper target:', arm.name, 'bones count:', skeletonHelper.bones ? skeletonHelper.bones.length : 0);
  }
}

// ─── Interactive Skeleton Pose Helpers & Gizmos ───────────────
const CONTROLLABLE_BONES = [
  { id: 'mixamorig:Head', label: '👤 Голова (Head)', color: 0x38bdf8 },
  { id: 'mixamorig:Neck', label: '🦒 Шея (Neck)', color: 0x38bdf8 },
  { id: 'mixamorig:Spine2', label: '🫀 Верх груди (Chest)', color: 0xe0a953 },
  { id: 'mixamorig:Spine1', label: '🦴 Средний отдел позвоночника', color: 0xe0a953 },
  { id: 'mixamorig:Spine', label: ' Поясница (Spine)', color: 0xe0a953 },
  { id: 'mixamorig:Hips', label: '🧍 Таз / Корень (Hips)', color: 0xf59e0b },
  { id: 'mixamorig:LeftShoulder', label: '🎽 Левая ключица (L Shoulder)', color: 0x38bdf8 },
  { id: 'mixamorig:RightShoulder', label: '🎽 Правая ключица (R Shoulder)', color: 0x38bdf8 },
  { id: 'mixamorig:LeftArm', label: '💪 Левое плечо (L Upper Arm)', color: 0x38bdf8 },
  { id: 'mixamorig:RightArm', label: '💪 Правое плечо (R Upper Arm)', color: 0x38bdf8 },
  { id: 'mixamorig:LeftForeArm', label: '🦾 Левое предплечье / Локоть', color: 0x06b6d4 },
  { id: 'mixamorig:RightForeArm', label: '🦾 Правое предплечье / Локоть', color: 0x06b6d4 },
  { id: 'mixamorig:LeftHand', label: '✋ Левая кисть (L Hand)', color: 0x22c55e },
  { id: 'mixamorig:RightHand', label: '✋ Правая кисть (R Hand)', color: 0x22c55e },
  { id: 'mixamorig:LeftUpLeg', label: '🦵 Левое бедро (L Thigh)', color: 0xa855f7 },
  { id: 'mixamorig:RightUpLeg', label: '🦵 Правое бедро (R Thigh)', color: 0xa855f7 },
  { id: 'mixamorig:LeftLeg', label: '🦿 Левая голень / Колено', color: 0x8b5cf6 },
  { id: 'mixamorig:RightLeg', label: '🦿 Правая голень / Колено', color: 0x8b5cf6 },
  { id: 'mixamorig:LeftFoot', label: '👟 Левая ступня (L Foot)', color: 0xec4899 },
  { id: 'mixamorig:RightFoot', label: '👟 Правая ступня (R Foot)', color: 0xec4899 }
];

const BASE_IDLE_ROTATIONS = {
  'mixamorig:Hips': [0, 0, 0],
  'mixamorig:Spine': [0, 0, 0],
  'mixamorig:Spine1': [0, 0, 0],
  'mixamorig:Spine2': [0, 0, 0],
  'mixamorig:Neck': [0, 0, 0],
  'mixamorig:Head': [0, 0, 0],
  'mixamorig:LeftShoulder': [0, 0, -1],
  'mixamorig:RightShoulder': [0, 0, 1],
  'mixamorig:LeftArm': [78.5, 0, 1],
  'mixamorig:RightArm': [78.5, 0, -1],
  'mixamorig:LeftForeArm': [5, 20, 0],
  'mixamorig:RightForeArm': [5, -20, 0],
  'mixamorig:LeftHand': [2, 0, 0],
  'mixamorig:RightHand': [2, 0, 0],
  'mixamorig:LeftUpLeg': [0, 0, 0],
  'mixamorig:LeftLeg': [0, 0, 0],
  'mixamorig:LeftFoot': [0, 0, 8],
  'mixamorig:RightUpLeg': [0, 0, 0],
  'mixamorig:RightLeg': [0, 0, 0],
  'mixamorig:RightFoot': [0, 0, -8]
};

const boneHelpersMap = new Map();
let helpersRoot = new THREE.Group();
helpersRoot.name = 'helpersRoot';
charRoot.add(helpersRoot);

let selectedBoneObj = null;
let selectedBoneHandle = null;
let hoveredBoneHandle = null;
let isDraggingBone = false;
let boneDragStart = { x: 0, y: 0 };
const boneRaycaster = new THREE.Raycaster();
const boneMouse = new THREE.Vector2();
const _tempBoneVec = new THREE.Vector3();

// Robust bone locator supporting with/without colons and glTF sanitized names
function findBone(root, id) {
  if (!root || !id) return null;
  let b = root.getObjectByName(id);
  if (b) return b;
  const noColon = id.replace(/:/g, '');
  b = root.getObjectByName(noColon);
  if (b) return b;
  const underscore = id.replace(/:/g, '_');
  b = root.getObjectByName(underscore);
  if (b) return b;
  const targetNorm = id.replace(/[:_]/g, '').toLowerCase();
  root.traverse(o => {
    if (!b && (o.isBone || (o.type && o.type === 'Bone'))) {
      const oNorm = o.name.replace(/[:_]/g, '').toLowerCase();
      if (oNorm === targetNorm) {
        b = o;
      }
    }
  });
  return b;
}

function initBoneHelpers() {
  helpersRoot.clear();
  boneHelpersMap.clear();
  selectedBoneObj = null;
  selectedBoneHandle = null;
  hoveredBoneHandle = null;

  if (!activeCharacterModel) return;

  activeCharacterModel.updateMatrixWorld(true);

  CONTROLLABLE_BONES.forEach(item => {
    const bone = findBone(activeCharacterModel, item.id);
    if (!bone) {
      console.warn('[Showroom] Controllable bone not found in model:', item.id);
      return;
    }

    const group = new THREE.Group();
    group.name = 'helper_' + bone.name;

    // Glowing core sphere (3.5 cm)
    const sphereGeo = new THREE.SphereGeometry(0.035, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: item.color,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
      depthWrite: false
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.renderOrder = 99999;
    sphere.userData = { isBoneHandle: true, boneName: bone.name, baseId: item.id, baseColor: item.color };

    // Outer halo ring (facing camera)
    const ringGeo = new THREE.RingGeometry(0.040, 0.050, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.renderOrder = 100000;
    ring.userData = { isBoneHandle: true, boneName: bone.name, baseId: item.id, baseColor: item.color };

    group.add(sphere);
    group.add(ring);

    // Initial position in world space
    bone.getWorldPosition(_tempBoneVec);
    group.position.copy(_tempBoneVec);

    helpersRoot.add(group);

    const entry = { group, sphere, ring, bone, baseColor: item.color, id: item.id };
    boneHelpersMap.set(item.id, entry);
    boneHelpersMap.set(bone.name, entry);
  });

  helpersRoot.visible = state.showBoneHelpers;
  console.log(`[Showroom] Successfully initialized ${helpersRoot.children.length} visible joint helpers in helpersRoot.`);
}

function selectBone(boneName) {
  if (selectedBoneHandle) {
    selectedBoneHandle.material.color.setHex(selectedBoneHandle.userData.baseColor);
    selectedBoneHandle.scale.set(1, 1, 1);
    selectedBoneHandle = null;
    selectedBoneObj = null;
  }

  const entry = boneHelpersMap.get(boneName) ||
    boneHelpersMap.get(boneName.replace(/:/g, '')) ||
    boneHelpersMap.get('mixamorig:' + boneName);
  const rotPanel = document.getElementById('bone-rot-controls');
  const selBone = document.getElementById('sel-bone');

  if (!entry) {
    state.selectedBoneName = null;
    if (rotPanel) rotPanel.style.display = 'none';
    if (selBone) selBone.value = '';
    return;
  }

  state.selectedBoneName = entry.id;
  selectedBoneObj = entry.bone;
  selectedBoneHandle = entry.sphere;
  selectedBoneHandle.material.color.setHex(0xffaa00);
  selectedBoneHandle.scale.set(1.4, 1.4, 1.4);

  if (selBone) {
    for (let i = 0; i < selBone.options.length; i++) {
      const optVal = selBone.options[i].value;
      if (optVal === entry.id || optVal.replace(/:/g, '') === entry.bone.name.replace(/:/g, '')) {
        selBone.selectedIndex = i;
        break;
      }
    }
  }
  if (rotPanel) {
    rotPanel.style.display = 'block';
    setTimeout(() => {
      rotPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  }

  if (!state.animPaused) {
    state.animPaused = true;
    const btnPauseAnim = document.getElementById('btn-pause-anim');
    if (btnPauseAnim) btnPauseAnim.textContent = '▶️ Пуск (Пауза для позы)';
    if (activeMixer) activeMixer.timeScale = 0;
    showToast(`Кость: ${entry.id.replace('mixamorig:', '')} (Пауза для позы)`);
  }

  updateSlidersFromBone(selectedBoneObj);
}

function updateSlidersFromBone(bone) {
  if (!bone) return;
  const euler = new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ');
  const degX = Math.round(THREE.MathUtils.radToDeg(euler.x));
  const degY = Math.round(THREE.MathUtils.radToDeg(euler.y));
  const degZ = Math.round(THREE.MathUtils.radToDeg(euler.z));

  const sRx = document.getElementById('slider-bone-rx');
  const sRy = document.getElementById('slider-bone-ry');
  const sRz = document.getElementById('slider-bone-rz');
  const vRx = document.getElementById('bone-rx-val');
  const vRy = document.getElementById('bone-ry-val');
  const vRz = document.getElementById('bone-rz-val');

  if (sRx) { sRx.value = degX; vRx.textContent = degX + '°'; }
  if (sRy) { sRy.value = degY; vRy.textContent = degY + '°'; }
  if (sRz) { sRz.value = degZ; vRz.textContent = degZ + '°'; }
}

function applySlidersToBone() {
  if (!selectedBoneObj) return;
  const sRx = parseFloat(document.getElementById('slider-bone-rx').value) || 0;
  const sRy = parseFloat(document.getElementById('slider-bone-ry').value) || 0;
  const sRz = parseFloat(document.getElementById('slider-bone-rz').value) || 0;

  document.getElementById('bone-rx-val').textContent = Math.round(sRx) + '°';
  document.getElementById('bone-ry-val').textContent = Math.round(sRy) + '°';
  document.getElementById('bone-rz-val').textContent = Math.round(sRz) + '°';

  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(sRx),
    THREE.MathUtils.degToRad(sRy),
    THREE.MathUtils.degToRad(sRz),
    'XYZ'
  );
  selectedBoneObj.quaternion.setFromEuler(euler);
  if (activeCharacterModel) activeCharacterModel.updateMatrixWorld(true);
  if (skeletonHelper && typeof skeletonHelper.updateMatrixWorld === 'function') {
    skeletonHelper.updateMatrixWorld(true);
  }
}

// Atlas URL resolver
function getAtlasUrl(atlasType) {
  const tDir = PATH_WOMAN + 'Textures/';
  switch (atlasType) {
    case 'lod1': return tDir + 'Main_lod1.webp';
    case 'lod2': return tDir + 'Main_lod2.webp';
    case 'main':
    default:
      return tDir + 'Main.webp';
  }
}

// Load Character Model
async function loadCharacter() {
  // Clear previous model
  if (activeCharacterModel) {
    charRoot.remove(activeCharacterModel);
    activeCharacterModel.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    activeCharacterModel = null;
  }
  if (skeletonHelper) {
    scene.remove(skeletonHelper);
    skeletonHelper.dispose && skeletonHelper.dispose();
    skeletonHelper = null;
  }
  if (activeMixer) {
    activeMixer.stopAllAction();
    activeMixer = null;
    activeActions = {};
  }
  womanHairMaterial = null;
  for (const k of Object.keys(womanHairMeshes)) {
    if (womanHairMeshes[k]) {
      if (womanHairMeshes[k].parent) womanHairMeshes[k].parent.remove(womanHairMeshes[k]);
      if (womanHairMeshes[k].geometry) womanHairMeshes[k].geometry.dispose();
      womanHairMeshes[k] = null;
    }
  }

  showToast('Загрузка 3D модели...');

  if (state.character === 'engi_woman') {
    // woman.glb = LOD0 + скелет + все клипы; hairN.glb / woman_lodN.glb — тот же скелет без клипов
    const WOMAN_FILES = {
      hair_only: 'hair.glb',
      hair2_only: 'hair2.glb',
      hair3_only: 'hair3.glb',
      hair4_only: 'hair4.glb',
      lod1: 'woman_lod1.glb',
      lod2: 'woman_lod2.glb'
    };
    const file = WOMAN_FILES[state.variant] || 'woman.glb';

    try {
      const gltf = await gltfLoader.loadAsync(PATH_WOMAN + file + '?v=' + WOMAN_ASSET_VER);
      activeCharacterModel = gltf.scene || gltf.scenes[0];
      // LOD-меши называются Head_lod1 … — приводим к именам частей LOD0
      activeCharacterModel.traverse((o) => {
        if (o.isMesh) o.name = o.name.replace(/_lod\d+$/, '');
      });
      let clips = gltf.animations;
      if (!clips || !clips.length) {
        if (!womanClipsCache) {
          const base = await gltfLoader.loadAsync(PATH_WOMAN + 'woman.glb?v=' + WOMAN_ASSET_VER);
          womanClipsCache = base.animations;
        }
        clips = womanClipsCache.map((c) => c.clone());
      }

      // Load active texture atlas for character (contains body + 4-hair atlas in top-right cell)
      const atlasUrl = getAtlasUrl(state.atlas);
      womanAtlasColorTex = await loadTexture(atlasUrl + '?v=' + WOMAN_ASSET_VER);
      const atlasTex = womanAtlasColorTex;

      // Create primary shared atlas material
      const atlasMat = new THREE.MeshStandardMaterial({
        map: atlasTex,
        roughness: 0.5,
        metalness: 0.1
      });

      // Unified hair material (shares Main atlas with body)
      const isOriginal = (state.hairColor === 'original');
      const initialColor = isOriginal
        ? new THREE.Color(0xffffff)
        : new THREE.Color(state.hairColor);

      womanHairMaterial = new THREE.MeshStandardMaterial({
        map: atlasTex,
        color: initialColor,
        roughness: 0.5,
        metalness: 0.05
      });

      womanHairMaterial.customProgramCacheKey = function () {
        return 'womanHairShaderV2';
      };

      womanHairMaterial.onBeforeCompile = function (shader) {
        shader.uniforms.uHairColorMode = { value: isOriginal ? 0.0 : 1.0 };
        shader.uniforms.uHairTintColor = { value: initialColor.clone() };
        shader.uniforms.uHairIntensity = { value: 1.45 };

        womanHairMaterial.userData.shader = shader;

        shader.fragmentShader =
          'uniform float uHairColorMode;\n' +
          'uniform vec3 uHairTintColor;\n' +
          'uniform float uHairIntensity;\n' +
          shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `
          #ifdef USE_MAP
            vec4 sampledDiffuseColor = texture2D( map, vMapUv );
            if (uHairColorMode > 0.5) {
              // Extract luminance on GPU
              float luma = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
              
              // Calibrate curve: expand midtones, lift roots so dyes are bright and obvious
              float calibratedLuma = clamp(pow(luma, 0.70) * uHairIntensity + 0.12, 0.0, 1.0);
              
              // Pure, vivid dye color following strand depth
              diffuseColor.rgb = uHairTintColor * calibratedLuma;
            } else {
              diffuseColor *= sampledDiffuseColor;
            }
          #endif
          `
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `
          #include <emissivemap_fragment>
          if (uHairColorMode > 0.5) {
            // Subtle backlight pop for saturated dyes
            totalEmissiveRadiance += uHairTintColor * 0.07;
          }
          `
        );
      };

      updateHairColor();

      activeCharacterModel.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false; // Prevent SkinnedMesh parts (Head/Haier) from culling in sit/death poses
          if (state.wireframe) o.material.wireframe = true;

          // If standalone hair view (hair_only, hair2_only, hair3_only, hair4_only)
          if (state.variant.includes('hair')) {
            o.material = womanHairMaterial;
          } else if (o.name === 'Haier' || (o.parent && o.parent.name === 'Haier')) {
            // Embedded Haier in woman.glb is kept hidden in favor of modular hair meshes
            o.visible = false;
            o.material = womanHairMaterial;
          } else {
            o.material = atlasMat;
          }
        }
      });

      // If modular character (not standalone hair view), attach all 4 modular hair meshes
      if (!state.variant.includes('hair')) {
        const bodyBones = new Map();
        activeCharacterModel.traverse((o) => {
          if (o.isBone && o.name) bodyBones.set(o.name, o);
        });
        let attachArm = activeCharacterModel;
        activeCharacterModel.traverse((o) => {
          if (o.name === 'Armature') attachArm = o;
        });

        const hairConfigs = [
          { key: 'hair1', file: 'hair.glb' },
          { key: 'hair2', file: 'hair2.glb' },
          { key: 'hair3', file: 'hair3.glb' },
          { key: 'hair4', file: 'hair4.glb' }
        ];

        for (const cfg of hairConfigs) {
          try {
            const hGltf = await gltfLoader.loadAsync(PATH_WOMAN + cfg.file + '?v=' + WOMAN_ASSET_VER);
            const hScene = hGltf.scene || hGltf.scenes[0];

            let hMesh = null;
            hScene.traverse((o) => {
              if ((o.isSkinnedMesh || o.isMesh) && !hMesh) hMesh = o;
            });

            if (hMesh) {
              womanHairMeshes[cfg.key] = hMesh;
              hMesh.name = 'woman_' + cfg.key;
              hMesh.material = womanHairMaterial;
              hMesh.castShadow = true;
              hMesh.receiveShadow = true;
              hMesh.frustumCulled = false;
              if (state.wireframe) hMesh.material.wireframe = true;

              if (hMesh.isSkinnedMesh && hMesh.skeleton) {
                const oldBones = hMesh.skeleton.bones;
                const oldInverses = hMesh.skeleton.boneInverses || [];
                const newBones = [];
                const newInverses = [];
                for (let i = 0; i < oldBones.length; i++) {
                  const b = oldBones[i] && bodyBones.get(oldBones[i].name);
                  if (b) {
                    newBones.push(b);
                    newInverses.push(oldInverses[i] ? oldInverses[i].clone() : new THREE.Matrix4());
                  }
                }
                if (newBones.length) {
                  hMesh.bind(new THREE.Skeleton(newBones, newInverses), hMesh.bindMatrix);
                }
              }
              attachArm.add(hMesh);
            }
          } catch (errHair) {
            console.warn(`Could not load modular hair ${cfg.file}:`, errHair);
          }
        }
      }

      applyPartsVisibility();

      // Normalize model height / scale if needed
      activeCharacterModel.position.set(0, 0, 0);
      charRoot.add(activeCharacterModel);

      // Setup Animation Mixer
      setupCharacterAnimations(clips);

      updateSkeletonHelper();

      updateMetrics();
      showToast('Девушка-инженер успешно загружена!');
    } catch (err) {
      console.error('Failed to load woman model:', err);
      showToast('Ошибка загрузки модели женщины: ' + err.message);
    }
  } else if (state.character === 'engi_man') {
    try {
      const gltf = await gltfLoader.loadAsync(PATH_MAN + 'assets/man.glb');
      activeCharacterModel = gltf.scene || gltf.scenes[0];

      // Load man body atlas
      const mainTex = await loadTexture(PATH_MAN + 'Textures/Main.webp');
      const eyeTex = await loadTexture(PATH_MAN + 'Textures/eye1.webp');

      activeCharacterModel.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false; // Prevent SkinnedMesh parts from culling in crouched/sitting poses
          if (o.material) {
            if (/eye/i.test(o.material.name)) {
              o.material.map = eyeTex;
            } else {
              o.material.map = mainTex;
            }
            o.material.needsUpdate = true;
          }
        }
      });

      // Setup Animation Mixer
      setupCharacterAnimations(gltf.animations);

      // Load modular hair if enabled
      if (state.hairVisible) {
        try {
          const hairGltf = await gltfLoader.loadAsync(PATH_MAN + 'assets/hair1.glb');
          const hairMesh = hairGltf.scene;
          hairMesh.name = 'man_hair';
          activeCharacterModel.add(hairMesh);
        } catch (_) { }
      }

      charRoot.add(activeCharacterModel);
      updateSkeletonHelper();
      updateMetrics();
      showToast('Мужчина-инженер загружен!');
    } catch (err) {
      console.error('Failed to load man model:', err);
      showToast('Ошибка загрузки мужчины: ' + err.message);
    }
  }

  // Re-attach weapon & aura
  loadWeapon();
  updateAura();
  initBoneHelpers();
  frameCamera('full');
}

// ─── Hair Color Tinting ──────────────────────────────────────
function updateHairColor() {
  if (!womanHairMaterial) return;
  const isOriginal = (state.hairColor === 'original');
  const hex = isOriginal ? 0xffffff : state.hairColor;
  const col = new THREE.Color(hex);

  const shader = womanHairMaterial.userData && womanHairMaterial.userData.shader;
  if (shader && shader.uniforms) {
    if (shader.uniforms.uHairColorMode) {
      shader.uniforms.uHairColorMode.value = isOriginal ? 0.0 : 1.0;
    }
    if (shader.uniforms.uHairTintColor) {
      shader.uniforms.uHairTintColor.value.copy(col);
    }
  }

  womanHairMaterial.color.copy(col);
}

// ─── Parts Visibility ────────────────────────────────────────
function applyPartsVisibility() {
  if (!activeCharacterModel) return;

  const showHair = state.hairVisible && state.variant !== 'body_only';

  activeCharacterModel.traverse((o) => {
    if (o.isMesh) {
      const name = o.name;
      if (state.character === 'engi_woman') {
        if (name in state.partsVisibility) {
          o.visible = state.partsVisibility[name];
        }
        if (name === 'Haier') {
          // Embedded Haier in woman.glb is kept hidden in favor of modular hair meshes
          o.visible = false;
        }
      }
    }
  });

  // Modular hair meshes visibility (hair1, hair2, hair3, hair4)
  if (state.character === 'engi_woman') {
    for (const [key, mesh] of Object.entries(womanHairMeshes)) {
      if (mesh) {
        mesh.visible = showHair && (state.hairStyle === key);
      }
    }
  }

  updateMetrics();
}

// ─── Weapons & Enchant Glow ──────────────────────────────────
let activeWeaponMesh = null;
let weaponEnchantGlow = null;
let currentGripWeight = 0.0;

const WEAPON_DEFINITIONS = {
  apprentice_wand: {
    id: 'apprentice_wand',
    name: 'Ученический жезл (Apprentice Wand)',
    model: 'novice.glb',
    texture: 'novice.webp',
    fallbackModel: 'novice.fbx',
    worldLen: 0.94,
    pos: [-0.005, 0.044, 0.022],
    manPos: [-0.005, 0.070, 0.022],
    rot: [Math.PI * 0.5, -1.1345, 1.1345],
    manRot: [1.5075, -1.1728, 1.1151],
    isStaff: false
  },
  novice: {
    id: 'novice',
    name: 'Булава Послушника (Novice Mace)',
    model: 'novice.glb',
    texture: 'novice.webp',
    fallbackModel: 'novice.fbx',
    worldLen: 0.94,
    pos: [-0.005, 0.044, 0.022],
    manPos: [-0.005, 0.070, 0.022],
    rot: [Math.PI * 0.5, -1.1345, 1.1345],
    manRot: [1.5075, -1.1728, 1.1151],
    isStaff: false
  },
  magic_mace: {
    id: 'magic_mace',
    name: 'Магическая булава (Magic Mace)',
    model: 'magic_mace.glb',
    texture: 'magic_mace.webp',
    fallbackModel: 'magic_mace.fbx',
    worldLen: 0.88,
    pos: [-0.005, 0.044, 0.022],
    manPos: [-0.005, 0.070, 0.022],
    rot: [Math.PI * 0.5, -1.1345, 1.1345],
    manRot: [1.5075, -1.1728, 1.1151],
    isStaff: false
  },
  atuba_mace: {
    id: 'atuba_mace',
    name: 'Булава Атуба (Atuba Mace)',
    model: 'atuba_mace.glb',
    texture: 'atuba_mace.webp',
    fallbackModel: 'atuba_mace.fbx',
    worldLen: 0.96,
    pos: [-0.005, 0.044, 0.022],
    manPos: [-0.005, 0.070, 0.022],
    rot: [Math.PI * 0.5, -1.1345, 1.1345],
    manRot: [1.5075, -1.1728, 1.1151],
    isStaff: false
  },
  demon_staff: {
    id: 'demon_staff',
    name: 'Посох Демона (Demon Staff)',
    model: 'demon_staff.glb',
    texture: 'demon_staff.webp',
    fallbackModel: 'demon_staff.fbx',
    worldLen: 1.70,
    pos: [-0.005, 0.044, 0.022],
    manPos: [0.008, 0.060, 0.020],
    rot: [-Math.PI * 0.5, 0.52, -0.52],
    manRot: [-Math.PI * 0.5, 0.58, -0.50],
    isStaff: true
  },
  tears_fairy: {
    id: 'tears_fairy',
    name: 'Слёзы Феи (Tears of Fairy)',
    model: 'tears_fairy.glb',
    texture: 'tears_fairy.webp',
    fallbackModel: 'tears_fairy.fbx',
    worldLen: 0.92,
    pos: [-0.005, 0.044, 0.022],
    manPos: [-0.005, 0.070, 0.022],
    rot: [Math.PI * 0.5, -1.1345, 1.1345],
    manRot: [1.5075, -1.1728, 1.1151],
    isStaff: false
  }
};

let _weaponLoadGen = 0;
async function loadWeapon() {
  const currentGen = ++_weaponLoadGen;
  weaponRoot.clear();
  activeWeaponMesh = null;
  weaponEnchantGlow = null;

  if (state.weapon === 'none') {
    return;
  }

  const def = WEAPON_DEFINITIONS[state.weapon] || {
    id: state.weapon,
    model: state.weapon + '.glb',
    texture: state.weapon + '.webp',
    worldLen: 0.92,
    pos: [-0.005, 0.044, 0.022],
    manPos: [-0.005, 0.070, 0.022],
    rot: [Math.PI * 0.5, -1.1345, 1.1345],
    manRot: [1.5075, -1.1728, 1.1151]
  };

  const modelCandidates = [
    PATH_WEAPONS + state.weapon + '.glb',
    PATH_WEAPONS + (def.model || ''),
    PATH_WEAPONS + state.weapon + '_canon.fbx',
    PATH_WEAPONS + state.weapon + '.fbx'
  ].filter(Boolean);

  let weaponObj = null;
  for (const mPath of modelCandidates) {
    try {
      if (mPath.endsWith('.glb') || mPath.endsWith('.gltf')) {
        const gltf = await gltfLoader.loadAsync(mPath);
        if (gltf && gltf.scene) {
          weaponObj = gltf.scene;
          break;
        }
      } else if (mPath.endsWith('.fbx')) {
        const fbx = await fbxLoader.loadAsync(mPath);
        if (fbx) {
          weaponObj = fbx;
          break;
        }
      }
    } catch (_) { }
  }

  if (!weaponObj) {
    console.warn('[Showroom] Could not load weapon mesh for:', state.weapon);
    return;
  }
  activeWeaponMesh = weaponObj;

  // Load texture (.webp)
  const texCandidates = [
    PATH_WEAPONS + (def.texture || ''),
    PATH_WEAPONS + state.weapon + '.webp'
  ].filter(Boolean);

  for (const tPath of texCandidates) {
    try {
      const tex = await loadTexture(tPath);
      if (tex) {
        weaponObj.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.material = new THREE.MeshStandardMaterial({
              map: tex,
              roughness: 0.45,
              metalness: 0.65
            });
          }
        });
        break;
      }
    } catch (_) { }
  }

  // Strip junk objects
  const junk = [];
  weaponObj.traverse((o) => {
    if (o !== weaponObj && (o.name === 'Cube' || o.isCamera || o.isLight || /camera|light/i.test(o.name))) {
      junk.push(o);
    }
  });
  junk.forEach(j => { if (j.parent) j.parent.remove(j); });

  // Find hand bone and measure scaleInv
  const handBone = activeCharacterModel ? (
    activeCharacterModel.getObjectByName('mixamorig:RightHand') ||
    activeCharacterModel.getObjectByName('mixamorigRightHand') ||
    activeCharacterModel.getObjectByName('RightHand')
  ) : null;

  const boneWorldScale = new THREE.Vector3(1, 1, 1);
  if (handBone) {
    handBone.getWorldScale(boneWorldScale);
  }
  const boneScale = Math.max(boneWorldScale.x, boneWorldScale.y, boneWorldScale.z);
  const scaleInv = (boneScale > 1e-5) ? (1.0 / boneScale) : 100.0;

  // Since normalized models have origin at the grip point and are sized in real meters:
  weaponObj.position.set(0, 0, 0);
  weaponObj.rotation.set(0, 0, 0);
  weaponObj.scale.set(scaleInv, scaleInv, scaleInv);
  weaponObj.updateMatrix();

  // Hierarchy: handBone -> weaponRoot -> weaponOrient -> weaponPivot -> weaponObj
  const weaponPivot = new THREE.Group();
  weaponPivot.name = 'char_weapon_pivot';
  weaponPivot.add(weaponObj);

  const weaponOrient = new THREE.Group();
  weaponOrient.name = 'char_weapon_orient';
  const isMan = (state.character === 'engi_man');
  const basePos = (isMan && def.manPos) ? def.manPos : (def.pos || [-0.005, 0.044, 0.022]);
  const baseRot = (isMan && def.manRot) ? def.manRot : (def.rot || [Math.PI * 0.5, -1.1345, 1.1345]);
  const px = basePos[0] * scaleInv;
  const py = basePos[1] * scaleInv;
  const pz = basePos[2] * scaleInv;
  weaponOrient.position.set(px, py, pz);
  weaponOrient.rotation.set(baseRot[0], baseRot[1], baseRot[2]);
  weaponOrient.add(weaponPivot);

  if (window._sr) {
    window._sr.weaponOrient = weaponOrient;
    window._sr.weaponPivot = weaponPivot;
  }

  if (handBone) {
    if (weaponRoot.parent !== handBone) {
      if (weaponRoot.parent) weaponRoot.parent.remove(weaponRoot);
      handBone.add(weaponRoot);
    }
  } else {
    if (weaponRoot.parent !== charRoot) {
      if (weaponRoot.parent) weaponRoot.parent.remove(weaponRoot);
      charRoot.add(weaponRoot);
    }
  }

  // Guard against race conditions from concurrent character/weapon changes:
  if (currentGen !== _weaponLoadGen) return;

  weaponRoot.clear();
  weaponRoot.add(weaponOrient);
  weaponRoot.updateMatrixWorld(true);

  updateEnchantGlow();
}

// Anatomical Lineage 2 Clenched Fist Quaternions for Right Hand
// When holding a weapon, finger bones are locked into a fixed fist pose
// so they stay rock-solid and never wiggle/splay during walk, run, or attack animations.
const DEG2RAD = Math.PI / 180;
function eulerToQuat(x, y, z) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));
}

const LOCKED_FIST_QUATERNIONS_WOMAN = {
  RightHandIndex1: eulerToQuat(65, 0, -5),
  RightHandIndex2: eulerToQuat(85, 0, 0),
  RightHandIndex3: eulerToQuat(70, 0, 0),

  RightHandMiddle1: eulerToQuat(70, 0, 0),
  RightHandMiddle2: eulerToQuat(90, 0, 0),
  RightHandMiddle3: eulerToQuat(70, 0, 0),

  RightHandRing1: eulerToQuat(75, 0, 3),
  RightHandRing2: eulerToQuat(95, 0, 0),
  RightHandRing3: eulerToQuat(75, 0, 0),

  RightHandPinky1: eulerToQuat(80, 0, 8),
  RightHandPinky2: eulerToQuat(95, 0, 0),
  RightHandPinky3: eulerToQuat(75, 0, 0),

  // Woman thumb clasps across index and middle fingers
  RightHandThumb1: eulerToQuat(15, -45, 30),
  RightHandThumb2: eulerToQuat(25, 10, 45),
  RightHandThumb3: eulerToQuat(10, 0, 40)
};

const LOCKED_FIST_QUATERNIONS_MAN = {
  RightHandIndex1: new THREE.Quaternion(0.57274, -0.03487, 0.03333, 0.81831),
  RightHandIndex2: new THREE.Quaternion(0.59608, -3e-05, 0.06191, 0.80054),
  RightHandIndex3: new THREE.Quaternion(0.47219, 2e-05, 0.04899, 0.88014),

  RightHandMiddle1: new THREE.Quaternion(0.5862, -0.02563, 0.03538, 0.80899),
  RightHandMiddle2: new THREE.Quaternion(0.66697, 0.00049, 0.07965, 0.74082),
  RightHandMiddle3: new THREE.Quaternion(0.30434, -0.00016, 0.03806, 0.9518),

  RightHandRing1: new THREE.Quaternion(0.58711, -0.01992, 0.03113, 0.80867),
  RightHandRing2: new THREE.Quaternion(0.66639, 8e-05, 0.08265, 0.74101),
  RightHandRing3: new THREE.Quaternion(0.34331, -4e-05, 0.04302, 0.93824),

  RightHandPinky1: new THREE.Quaternion(0.55405, -0.00686, 0.02055, 0.8322),
  RightHandPinky2: new THREE.Quaternion(0.66539, 0.0011, 0.09212, 0.74079),
  RightHandPinky3: new THREE.Quaternion(0.30364, -0.00051, 0.04486, 0.95173),

  // Man thumb anatomically clasps over index and middle fingers (positive Z wraps across palm)
  RightHandThumb1: eulerToQuat(40, -40, 20),
  RightHandThumb2: eulerToQuat(35, 15, 50),
  RightHandThumb3: eulerToQuat(20, 10, 40)
};

function updateHandGrip(delta) {
  if (!activeCharacterModel) return;

  const hasWeapon = (state.weapon && state.weapon !== 'none');
  const targetWeight = hasWeapon ? 1.0 : 0.0;
  if (currentGripWeight < targetWeight) {
    currentGripWeight = Math.min(targetWeight, currentGripWeight + delta * 12.0);
  } else if (currentGripWeight > targetWeight) {
    currentGripWeight = Math.max(targetWeight, currentGripWeight - delta * 12.0);
  }

  if (currentGripWeight <= 0.001) return;

  const w = currentGripWeight;
  const isMan = (state.character === 'engi_man');
  const fistQuats = isMan
    ? LOCKED_FIST_QUATERNIONS_MAN
    : LOCKED_FIST_QUATERNIONS_WOMAN;

  // Absolute Bone Masking: override finger animation tracks with solid fist quaternions
  for (const [boneName, fistQ] of Object.entries(fistQuats)) {
    const bone = activeCharacterModel.getObjectByName('mixamorig:' + boneName) ||
      activeCharacterModel.getObjectByName('mixamorig' + boneName) ||
      activeCharacterModel.getObjectByName(boneName);
    if (!bone) continue;

    if (w >= 0.999) {
      bone.quaternion.copy(fistQ);
    } else {
      bone.quaternion.slerp(fistQ, w);
    }
  }
}

function updateEnchantGlow() {
  if (!activeWeaponMesh) return;

  if (weaponEnchantGlow) {
    weaponRoot.remove(weaponEnchantGlow);
    weaponEnchantGlow = null;
  }

  const level = state.enchant;
  if (level <= 3) return; // +0 to +3 has no glow in L2

  // Determine glow color by enchant level
  let glowColor = 0x38bdf8; // +4..+8 Blue
  if (level >= 9 && level <= 14) glowColor = 0xa855f7; // +9..+14 Purple
  else if (level === 15) glowColor = 0xf59e0b;        // +15 Gold
  else if (level >= 16) glowColor = 0xef4444;        // +16 Red

  // Create ethereal enchant glow shell
  const glowGroup = new THREE.Group();

  const light = new THREE.PointLight(glowColor, (level / 16) * 3.5, 1.2);
  light.position.copy(activeWeaponMesh.position);
  glowGroup.add(light);

  weaponRoot.add(glowGroup);
  weaponEnchantGlow = glowGroup;
}

// ─── L2 Auras ────────────────────────────────────────────────
function updateAura() {
  auraRoot.clear();
  if (state.aura === 'none') return;

  const auraGroup = new THREE.Group();
  let auraCol = 0x38bdf8;
  if (state.aura === 'champion_red') auraCol = 0xef4444;
  if (state.aura === 'champion_gold') auraCol = 0xfbbf24;

  // Concentric tilted glowing orbit rings
  for (let i = 0; i < 3; i++) {
    const ringGeo = new THREE.TorusGeometry(0.7 + i * 0.2, 0.015, 16, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: auraCol,
      transparent: true,
      opacity: 0.7 - i * 0.15,
      blending: THREE.AdditiveBlending
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2 + (i - 1) * 0.35;
    ring.rotation.y = i * 0.5;
    ring.position.y = 0.95 + (i - 1) * 0.15;
    ring.userData.rotSpeed = 0.8 + i * 0.4;
    auraGroup.add(ring);
  }

  // Central rising light pillar
  const pillarGeo = new THREE.CylinderGeometry(0.4, 0.6, 2.2, 24, 1, true);
  const pillarMat = new THREE.MeshBasicMaterial({
    color: auraCol,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.y = 1.1;
  auraGroup.add(pillar);

  auraRoot.add(auraGroup);
}

// ─── Animations & Poses ──────────────────────────────────────
let loadedClipsList = [];
let loadedClipsMap = {};

const WOMAN_ANIM_METADATA = [
  {
    group: 'Передвижение и стойки',
    clips: [
      { id: 'idle', name: 'Ожидание: дыхание на месте' },
      { id: 'walk', name: 'Шаг вперед' },
      { id: 'fast_run', name: 'Быстрый бег вперед' },
      { id: 'sword_run', name: 'Бег с наклоном корпуса' }
    ]
  },
  {
    group: 'Удары и физические действия',
    clips: [
      { id: 'boxing', name: 'Серия ударов кулаками' },
      { id: 'sword_slash', name: 'Резкий рубящий мах сверху вниз' },
      { id: 'power_up', name: 'Приседание с разведением рук' }
    ]
  },
  {
    group: 'Движения рук и корпуса',
    clips: [
      { id: 'sword_cast_1', name: 'Круговые движения кистями' },
      { id: 'sword_cast_2', name: 'Плавный подъем рук снизу вверх' },
      { id: 'cast_1h', name: 'Взмах одной рукой с фиксацией' },
      { id: 'attack_1h', name: 'Резкий выпад одной рукой вперед' },
      { id: 'cast_2h', name: 'Подъем обеих рук над головой' },
      { id: 'attack_2h', name: 'Резкий выброс обеих рук с наклоном' },
      { id: 'area_attack_1', name: 'Разворот с приседанием и удар в землю' },
      { id: 'area_attack_2', name: 'Круговой разворот корпусом и выброс рук' },
      { id: 'great_sword_cast', name: 'Глубокая стойка с отведением плеч' }
    ]
  },
  {
    group: 'Падения и поражение',
    clips: [
      { id: 'death_back', name: 'Откидывание назад и падение на спину' },
      { id: 'death_front', name: 'Наклон вперед и падение ничком' },
      { id: 'death_sword_1', name: 'Оседание на колени и заваливание на бок' },
      { id: 'death_sword_2', name: 'Сгибание пополам и падение на плечо' }
    ]
  },
  {
    group: 'Эмоции и отдых',
    clips: [
      { id: 'sit_down', name: 'Сесть на землю (переход в отдых)' },
      { id: 'sit_loop', name: 'Отдых: скромно сидит на земле' },
      { id: 'stand_up', name: 'Подъем на ноги с земли' },
      { id: 'bow', name: 'Вежливый поклон' },
      { id: 'clap', name: 'Аплодисменты (хлопать в ладоши)' },
      { id: 'dance', name: 'Танец' },
      { id: 'heart_pose', name: 'Сердечко руками' },
      { id: 'laugh', name: 'Смех' },
      { id: 'complain', name: 'Возмущение и недовольство' },
      { id: 'afraid', name: 'Испуг и реакция страха' },
      { id: 'warm_up', name: 'Разминка перед боем' }
    ]
  }
];

const MAN_ANIM_METADATA = [
  {
    group: 'Передвижение и стойки',
    clips: [
      { id: 'idle', name: 'Ожидание: дыхание на месте' },
      { id: 'walk', name: 'Шаг вперед' },
      { id: 'run', name: 'Бег вперед' },
      { id: 'stand', name: 'Подъем на ноги' },
      { id: 'sitloop', name: 'Сидение на земле' }
    ]
  },
  {
    group: 'Удары и движения',
    clips: [
      { id: 'punch', name: 'Удар рукой' },
      { id: 'skill', name: 'Удар с разворота' },
      { id: 'heal', name: 'Подъем рук вверх' },
      { id: 'vamp', name: 'Вытягивание рук вперед' }
    ]
  },
  {
    group: 'Падения и поражение',
    clips: [
      { id: 'diy', name: 'Падение на землю' }
    ]
  }
];

function calibrateWomanClips(clips) {
  return; // Disabled: Native Idle.fbx armature coordinates are already authentic
  if (!clips || !clips.length) return;
  const EMOJI_CLIPS = new Set([
    'sit_down', 'sit_loop', 'stand_up', 'bow', 'clap', 'dance',
    'heart_pose', 'laugh', 'complain', 'afraid', 'warm_up'
  ]);

  const targetX = 0.002;
  const targetY = 0.564;
  const targetZ = -0.002;

  clips.forEach((clip) => {
    const key = (clip.name || '').toLowerCase();
    if (EMOJI_CLIPS.has(key)) return;

    if (clip.tracks) {
      clip.tracks = clip.tracks.filter(t => !t.name.includes('Armature.position'));
    }

    const hipTrack = clip.tracks ? clip.tracks.find(t => t.name.includes('Hips.position')) : null;
    if (!hipTrack || !hipTrack.values || !hipTrack.values.length) return;

    const startX = hipTrack.values[0];
    const startY = hipTrack.values[1];
    const startZ = hipTrack.values[2];

    // If already calibrated (startY near targetY and delta small), do nothing
    if (Math.abs(startY - targetY) < 0.1 && Math.abs(startX - targetX) < 0.05) {
      return;
    }

    for (let i = 0; i < hipTrack.values.length; i += 3) {
      const rawDy = hipTrack.values[i + 1] - startY;
      const scaleY = Math.abs(rawDy) > 2.0 ? 0.01 : 1.0;

      hipTrack.values[i] = targetX;
      hipTrack.values[i + 1] = Math.max(0.04, targetY + rawDy * scaleY);
      hipTrack.values[i + 2] = targetZ;
    }
  });
}

function calibrateLocomotionClips(clips, isMan) {
  if (!clips || !clips.length) return;
  const LOCO_KEYS = ['walk', 'run', 'fast_run', 'sword_run', 'mixamo.com.002', 'mixamo.com.003'];
  const DEG2RAD = Math.PI / 180;

  // Natural clearance and outward arm orientation:
  // - Premultiply qAbduct (shoulder parent space, Z-axis): lifts arm slightly away from hip/torso.
  // - Multiply qTwist (bone local space, Y-axis): rotates arm axially outward so hand and weapon
  //   point naturally to the outside and never cross behind the heels/between the legs.
  const abductAngle = isMan ? (7.5 * DEG2RAD) : (4.5 * DEG2RAD);
  const twistAngle = isMan ? (14.0 * DEG2RAD) : (0.0 * DEG2RAD);

  const qAbduct = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), abductAngle);
  const qTwist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), twistAngle);
  const tempQ = new THREE.Quaternion();

  clips.forEach(clip => {
    const name = (clip.name || '').toLowerCase();
    const isLoco = LOCO_KEYS.some(k => name === k || name.includes(k));
    if (!isLoco || clip._hasLocoAbduction) return;
    clip._hasLocoAbduction = true;

    const armTrack = clip.tracks.find(t => t.name.includes('RightArm.quaternion'));
    if (armTrack) {
      for (let i = 0; i < armTrack.values.length; i += 4) {
        tempQ.fromArray(armTrack.values, i);
        tempQ.premultiply(qAbduct); // Shoulder lateral clearance
        if (isMan) {
          tempQ.multiply(qTwist);   // Axial external rotation (turns arm outward)
        }
        tempQ.toArray(armTrack.values, i);
      }
    }
  });
}

function setupCharacterAnimations(clips) {
  if (activeMixer) {
    activeMixer.stopAllAction();
    activeMixer = null;
  }
  activeActions = {};
  loadedClipsMap = {};
  loadedClipsList = [];

  if (state.character === 'engi_woman') {
    calibrateWomanClips(clips);
  }
  calibrateLocomotionClips(clips, state.character === 'engi_man');

  if (!clips || !clips.length) {
    const sel = document.getElementById('sel-animation');
    if (sel) sel.innerHTML = '<option value="">(Нет анимаций)</option>';
    const info = document.getElementById('anim-clip-info');
    if (info) info.textContent = '0 клипов';
    return;
  }

  activeMixer = new THREE.AnimationMixer(activeCharacterModel);
  clips.forEach((clip) => {
    const key = clip.name.toLowerCase();
    activeActions[key] = activeMixer.clipAction(clip);
    loadedClipsMap[key] = clip;
  });

  // Aliases for compatibility with standard actions
  if (state.character === 'engi_woman') {
    if (activeActions['fast_run']) activeActions['run'] = activeActions['fast_run'];
    if (activeActions['sword_slash']) activeActions['attack'] = activeActions['sword_slash'];
    if (activeActions['attack_1h']) activeActions['skill'] = activeActions['attack_1h'];
    if (activeActions['cast_1h']) activeActions['heal'] = activeActions['cast_1h'];
    if (activeActions['death_back']) activeActions['death'] = activeActions['death_back'];
    if (activeActions['great_sword_cast']) activeActions['heavy_slash'] = activeActions['great_sword_cast'];
  } else if (state.character === 'engi_man') {
    if (activeActions['mixamo.com.001']) activeActions['idle'] = activeActions['mixamo.com.001'];
    if (activeActions['mixamo.com.002']) activeActions['walk'] = activeActions['mixamo.com.002'];
    if (activeActions['mixamo.com.003']) activeActions['run'] = activeActions['mixamo.com.003'];
    if (activeActions['mixamo.com.004']) {
      activeActions['diy'] = activeActions['mixamo.com.004'];
      activeActions['death'] = activeActions['mixamo.com.004'];
    }
    if (activeActions['mixamo.com.008']) activeActions['stand'] = activeActions['mixamo.com.008'];
    if (activeActions['mixamo.com.009']) activeActions['sitloop'] = activeActions['mixamo.com.009'];
    if (activeActions['mixamo.com.011']) {
      activeActions['punch'] = activeActions['mixamo.com.011'];
      activeActions['attack'] = activeActions['mixamo.com.011'];
    }
    if (activeActions['skil']) activeActions['skill'] = activeActions['skil'];
    if (activeActions['heal']) activeActions['heal'] = activeActions['heal'];
    if (activeActions['vamp']) activeActions['vamp'] = activeActions['vamp'];
  }

  // Smooth L2-style state machine transitions (sit_down -> sit_loop, stand_up -> idle)
  activeMixer.addEventListener('finished', (e) => {
    const clip = e.action ? e.action.getClip() : null;
    const finishedClipName = clip ? clip.name.toLowerCase() : '';
    if (finishedClipName === 'sit_down') {
      playAnimation('sit_loop');
    } else if (finishedClipName === 'stand_up') {
      playAnimation('idle');
    }
  });

  populateAnimationSelector();

  let initial = state.animation || 'idle';
  if (!activeActions[initial]) initial = 'idle';
  if (!activeActions[initial]) initial = loadedClipsList[0] || Object.keys(activeActions)[0];
  playAnimation(initial);
}

function populateAnimationSelector() {
  const sel = document.getElementById('sel-animation');
  const info = document.getElementById('anim-clip-info');
  if (!sel) return;

  sel.innerHTML = '';
  loadedClipsList = [];

  const metaGroups = state.character === 'engi_woman' ? WOMAN_ANIM_METADATA : MAN_ANIM_METADATA;
  let totalCount = 0;

  metaGroups.forEach((g) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = g.group;

    g.clips.forEach((c) => {
      if (activeActions[c.id]) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} (${c.id})`;
        optgroup.appendChild(opt);
        loadedClipsList.push(c.id);
        totalCount++;
      }
    });

    if (optgroup.children.length > 0) {
      sel.appendChild(optgroup);
    }
  });

  const remainingKeys = Object.keys(activeActions).filter(k =>
    !loadedClipsList.includes(k) && !['run', 'attack', 'skill', 'heal', 'death', 'heavy_slash'].includes(k)
  );
  if (remainingKeys.length > 0) {
    const extraGroup = document.createElement('optgroup');
    extraGroup.label = 'Другие клипы';
    remainingKeys.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      extraGroup.appendChild(opt);
      loadedClipsList.push(k);
      totalCount++;
    });
    sel.appendChild(extraGroup);
  }

  if (info) info.textContent = `${totalCount} клипов`;
}

function playAnimation(animName) {
  state.animation = animName;
  if (!activeMixer) return;

  const action = activeActions[animName] || activeActions['idle'] || Object.values(activeActions)[0];
  if (!action) return;

  const clip = action.getClip();
  const clipId = clip ? clip.name.toLowerCase() : animName;

  // Update Timing UI
  const metaEl = document.getElementById('anim-meta-info');
  if (metaEl && clip) {
    const durSec = clip.duration.toFixed(2);
    const frames = Math.round(clip.duration * 30);
    metaEl.textContent = `${durSec}с · ${frames} кадров`;
  }

  // Set looping behavior
  const isDeath = clipId.startsWith('death') || clipId === 'diy';
  const isTransition = clipId === 'sit_down' || clipId === 'stand_up';
  if (isDeath || isTransition) {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  } else if (!state.animLoop) {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
  } else {
    action.setLoop(THREE.LoopRepeat);
    action.clampWhenFinished = false;
  }

  if (currentClipName && activeActions[currentClipName] && currentClipName !== animName) {
    activeActions[currentClipName].fadeOut(0.2);
  }

  action.reset().fadeIn(0.2).play();
  currentClipName = animName;

  // Sync select element if needed
  const sel = document.getElementById('sel-animation');
  if (sel && sel.value !== animName) {
    sel.value = animName;
  }
}

function stepAnimation(direction) {
  if (!loadedClipsList.length) return;
  const currentIdx = loadedClipsList.indexOf(state.animation);
  let nextIdx = 0;
  if (currentIdx !== -1) {
    nextIdx = (currentIdx + direction + loadedClipsList.length) % loadedClipsList.length;
  } else {
    nextIdx = direction > 0 ? 0 : loadedClipsList.length - 1;
  }
  const nextClipId = loadedClipsList[nextIdx];
  playAnimation(nextClipId);
}

function restartCurrentAnimation() {
  if (!activeMixer || !currentClipName || !activeActions[currentClipName]) return;
  const action = activeActions[currentClipName];
  action.reset().play();
  if (state.animPaused) {
    state.animPaused = false;
    const btnPause = document.getElementById('btn-pause-anim');
    if (btnPause) btnPause.textContent = '⏸️ Пауза [Space]';
    activeMixer.timeScale = state.animSpeed;
  }
}

function toggleAnimPause() {
  state.animPaused = !state.animPaused;
  const btnPause = document.getElementById('btn-pause-anim');
  if (btnPause) btnPause.textContent = state.animPaused ? '▶️ Пуск [Space]' : '⏸️ Пауза [Space]';
  if (activeMixer) activeMixer.timeScale = state.animPaused ? 0 : state.animSpeed;
}

// ─── Environments ────────────────────────────────────────────
function updateEnvironment() {
  const env = state.environment;
  if (env === 'studio') {
    scene.background.set(0x0e1116);
    hemiLight.color.set(0xfff4e6);
    hemiLight.groundColor.set(0x1a202c);
    hemiLight.intensity = 0.8;
    keyLight.color.set(0xfffaed);
    keyLight.intensity = 2.4;
    fillLight.color.set(0xcce7ff);
    rimLight.color.set(0x7dd3fc);
  } else if (env === 'forge') {
    scene.background.set(0x1a0f0a);
    hemiLight.color.set(0xff8c42);
    hemiLight.groundColor.set(0x2a1208);
    hemiLight.intensity = 0.9;
    keyLight.color.set(0xffaa44);
    keyLight.intensity = 2.8;
    fillLight.color.set(0xef4444);
    rimLight.color.set(0xffdd55);
  } else if (env === 'sunset') {
    scene.background.set(0x221318);
    hemiLight.color.set(0xfb923c);
    hemiLight.groundColor.set(0x431407);
    hemiLight.intensity = 0.9;
    keyLight.color.set(0xf59e0b);
    keyLight.intensity = 2.6;
    fillLight.color.set(0xec4899);
    rimLight.color.set(0x60a5fa);
  } else if (env === 'void') {
    scene.background.set(0x050508);
    hemiLight.color.set(0x38bdf8);
    hemiLight.groundColor.set(0x000000);
    hemiLight.intensity = 0.4;
    keyLight.color.set(0xffffff);
    keyLight.intensity = 1.6;
    fillLight.color.set(0xa855f7);
    rimLight.color.set(0x06b6d4);
  }
}

// ─── Camera Framing Presets ──────────────────────────────────
function setCameraPreset(targetY, dist, elevationAngle = 0.2, azimuthAngle = 0, targetX = 0, targetZ = 0) {
  const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
  const phi = Math.max(controls.minPolarAngle || 0.1, Math.min(controls.maxPolarAngle || Math.PI, Math.PI * 0.5 - elevationAngle));
  const theta = azimuthAngle;
  const r = Math.max(controls.minDistance || 0.2, Math.min(controls.maxDistance || 6.0, dist));

  if (typeof controls.setCameraTarget === 'function') {
    controls.setCameraTarget(targetPos, r, phi, theta);
  }
  if (controls._spherical) {
    controls._spherical.radius = r;
    controls._spherical.phi = phi;
    controls._spherical.theta = theta;
  }
  if (controls._targetActual) {
    controls._targetActual.copy(targetPos);
  }
  controls.target.copy(targetPos);
  controls.update(0.016);
}

function frameCamera(preset) {
  document.querySelectorAll('.preset-grid .btn').forEach(b => b.classList.remove('active'));

  const isWoman = state.character === 'engi_woman';
  const isStandaloneHair = isWoman && state.variant.includes('hair');
  // Девушка: кадр по реальной высоте модели (пропорции как у мужского пресета)
  let wh = 1.75;
  if (isWoman && activeCharacterModel && !isStandaloneHair) {
    const box = new THREE.Box3().setFromObject(activeCharacterModel);
    if (isFinite(box.max.y) && box.max.y - box.min.y > 0.3) wh = box.max.y - box.min.y;
  }
  const targetH = isStandaloneHair ? 1.45 : (isWoman ? wh * 0.55 : 0.95);
  const portraitH = isStandaloneHair ? 1.45 : (isWoman ? wh * 0.92 : 1.55);
  const fullDist = isStandaloneHair ? 0.70 : (isWoman ? wh * 1.75 : 2.9);
  const portraitDist = isStandaloneHair ? 0.48 : (isWoman ? wh * 0.42 : 1.15);

  if (preset === 'portrait') {
    setCameraPreset(portraitH, portraitDist, 0.12, 0);
    const btn = document.getElementById('cam-portrait');
    if (btn) btn.classList.add('active');
  } else if (preset === 'full') {
    setCameraPreset(targetH, fullDist, 0.18, 0);
    const btn = document.getElementById('cam-full');
    if (btn) btn.classList.add('active');
  } else if (preset === 'weapon') {
    const tx = isWoman ? -0.20 * wh : -0.35;
    const ty = isWoman ? 0.62 * wh : 1.10;
    const tz = 0.02;
    setCameraPreset(ty, isWoman ? 0.55 * wh : 0.90, 0.14, 0.65, tx, tz);
    const btn = document.getElementById('cam-weapon');
    if (btn) btn.classList.add('active');
  } else if (preset === 'mmo') {
    setCameraPreset(targetH, isWoman ? wh * 2.1 : 3.4, 0.45, 0.75);
    const btn = document.getElementById('cam-mmo');
    if (btn) btn.classList.add('active');
  }
}

// ─── Metrics Calculation ─────────────────────────────────────
function updateMetrics() {
  let tris = 0;
  let verts = 0;
  let drawCalls = 0;

  if (activeCharacterModel) {
    activeCharacterModel.traverse((o) => {
      if (o.isMesh && o.visible && o.geometry) {
        drawCalls++;
        const g = o.geometry;
        if (g.index) tris += g.index.count / 3;
        else if (g.attributes.position) tris += g.attributes.position.count / 3;
        if (g.attributes.position) verts += g.attributes.position.count;
      }
    });

    const box = new THREE.Box3().setFromObject(activeCharacterModel);
    const h = box.max.y - box.min.y;
    const elHeight = document.getElementById('m-height');
    if (elHeight) elHeight.textContent = `${h.toFixed(2)} м`;
  }

  document.getElementById('m-tris').textContent = Math.round(tris).toLocaleString();
  document.getElementById('m-verts').textContent = Math.round(verts).toLocaleString();
  document.getElementById('m-drawcalls').textContent = `${drawCalls} ${drawCalls === 1 ? 'Draw Call' : 'Draw Calls'}`;

  // Atlas label
  let atlasText = '2048×2048 WebP (218 KB)';
  if (state.atlas === 'webp_4k') atlasText = '4096×4096 WebP (756 KB)';
  else if (state.atlas === 'png_4k') atlasText = '4096×4096 PNG (13.2 MB)';
  else if (state.atlas === 'main_webp') atlasText = '2048×2048 WebP Main (218 KB)';
  document.getElementById('m-atlas').textContent = atlasText;
}

// ─── UI Event Binding ────────────────────────────────────────
function initUI() {
  // Character Selector
  document.getElementById('sel-character').addEventListener('change', (e) => {
    state.character = e.target.value;
    const isWoman = state.character === 'engi_woman';
    document.getElementById('sel-model-variant').disabled = !isWoman;
    document.getElementById('sel-texture-atlas').disabled = !isWoman;
    document.getElementById('card-customization').style.display = isWoman ? 'block' : 'none';
    loadCharacter();
  });

  // Variant Selector
  document.getElementById('sel-model-variant').addEventListener('change', (e) => {
    state.variant = e.target.value;
    loadCharacter();
  });

  // Atlas Selector
  document.getElementById('sel-texture-atlas').addEventListener('change', (e) => {
    state.atlas = e.target.value;
    loadCharacter();
  });

  // Hair Style Selector
  const selHairStyle = document.getElementById('sel-hair-style');
  if (selHairStyle) {
    selHairStyle.addEventListener('change', (e) => {
      state.hairStyle = e.target.value;
      applyPartsVisibility();
    });
  }

  // Hair Visibility Toggle
  document.getElementById('chk-hair-visible').addEventListener('change', (e) => {
    state.hairVisible = e.target.checked;
    applyPartsVisibility();
  });

  // Hair Color Picker
  const pickerHairColor = document.getElementById('picker-hair-color');
  if (pickerHairColor) {
    pickerHairColor.addEventListener('input', (e) => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      state.hairColor = e.target.value;
      updateHairColor();
    });
  }

  // Hair Color Swatches
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      state.hairColor = sw.dataset.color;
      if (state.hairColor !== 'original' && pickerHairColor) {
        pickerHairColor.value = state.hairColor;
      }
      updateHairColor();
    });
  });

  // Modular Parts Visibility
  document.querySelectorAll('#parts-toggles input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', () => {
      const part = chk.dataset.part;
      state.partsVisibility[part] = chk.checked;
      applyPartsVisibility();
    });
  });

  // Weapon Selector
  document.getElementById('sel-weapon').addEventListener('change', (e) => {
    state.weapon = e.target.value;
    loadWeapon();
  });

  // Enchant Slider
  const sliderEnchant = document.getElementById('slider-enchant');
  const enchantVal = document.getElementById('enchant-val');
  sliderEnchant.addEventListener('input', (e) => {
    state.enchant = parseInt(e.target.value, 10);
    enchantVal.textContent = `+${state.enchant}`;
    updateEnchantGlow();
  });

  // Aura Selector
  document.getElementById('sel-aura').addEventListener('change', (e) => {
    state.aura = e.target.value;
    updateAura();
  });

  // Camera Presets
  document.getElementById('cam-portrait').addEventListener('click', () => frameCamera('portrait'));
  document.getElementById('cam-full').addEventListener('click', () => frameCamera('full'));
  document.getElementById('cam-weapon').addEventListener('click', () => frameCamera('weapon'));
  document.getElementById('cam-mmo').addEventListener('click', () => frameCamera('mmo'));

  // Autorotate Toggle
  document.getElementById('chk-autorotate').addEventListener('change', (e) => {
    state.autorotate = e.target.checked;
    controls.autoRotate = state.autorotate;
  });

  // Animation Selector
  const selAnim = document.getElementById('sel-animation');
  if (selAnim) {
    selAnim.addEventListener('change', (e) => {
      playAnimation(e.target.value);
    });
  }

  // Prev / Next Animation Buttons
  const btnPrevAnim = document.getElementById('btn-prev-anim');
  if (btnPrevAnim) {
    btnPrevAnim.addEventListener('click', () => stepAnimation(-1));
  }
  const btnNextAnim = document.getElementById('btn-next-anim');
  if (btnNextAnim) {
    btnNextAnim.addEventListener('click', () => stepAnimation(1));
  }

  // Restart Animation Button
  const btnRestartAnim = document.getElementById('btn-restart-anim');
  if (btnRestartAnim) {
    btnRestartAnim.addEventListener('click', restartCurrentAnimation);
  }

  // Animation Loop Toggle
  const chkAnimLoop = document.getElementById('chk-anim-loop');
  if (chkAnimLoop) {
    chkAnimLoop.addEventListener('change', (e) => {
      state.animLoop = e.target.checked;
      if (currentClipName) {
        playAnimation(currentClipName);
      }
    });
  }

  // Anim Speed Slider
  const sliderAnimSpeed = document.getElementById('slider-anim-speed');
  const animSpeedVal = document.getElementById('anim-speed-val');
  if (sliderAnimSpeed) {
    sliderAnimSpeed.addEventListener('input', (e) => {
      state.animSpeed = parseFloat(e.target.value);
      if (animSpeedVal) animSpeedVal.textContent = `${state.animSpeed.toFixed(1)}x`;
      if (activeMixer) activeMixer.timeScale = state.animPaused ? 0 : state.animSpeed;
    });
  }

  // Pause Anim Button
  const btnPauseAnim = document.getElementById('btn-pause-anim');
  if (btnPauseAnim) {
    btnPauseAnim.addEventListener('click', toggleAnimPause);
  }

  // Global Keyboard Navigation for Animations
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' && e.target.type === 'text' || e.target.tagName === 'TEXTAREA')) {
      return;
    }
    if (e.key === '[' || e.key === '<') {
      stepAnimation(-1);
    } else if (e.key === ']' || e.key === '>') {
      stepAnimation(1);
    } else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
      restartCurrentAnimation();
    } else if (e.code === 'Space') {
      e.preventDefault();
      toggleAnimPause();
    }
  });

  // Environment Selector
  document.getElementById('sel-environment').addEventListener('change', (e) => {
    state.environment = e.target.value;
    updateEnvironment();
  });

  // Wireframe Toggle
  document.getElementById('chk-wireframe').addEventListener('change', (e) => {
    state.wireframe = e.target.checked;
    if (activeCharacterModel) {
      activeCharacterModel.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material.wireframe = state.wireframe;
          o.material.needsUpdate = true;
        }
      });
    }
  });

  // Skeleton Helper Toggle
  const chkSkeleton = document.getElementById('chk-skeleton');
  if (chkSkeleton) {
    chkSkeleton.addEventListener('change', (e) => {
      state.showSkeleton = e.target.checked;
      updateSkeletonHelper();
    });
  }

  // Bone Helpers Visibility Toggle
  const chkBoneHelpers = document.getElementById('chk-bone-helpers');
  if (chkBoneHelpers) {
    chkBoneHelpers.addEventListener('change', (e) => {
      state.showBoneHelpers = e.target.checked;
      helpersRoot.visible = state.showBoneHelpers;
    });
  }

  // Bone Dropdown Selector
  const selBone = document.getElementById('sel-bone');
  if (selBone) {
    selBone.addEventListener('change', (e) => {
      selectBone(e.target.value);
    });
  }

  // Bone Rotation Sliders
  ['slider-bone-rx', 'slider-bone-ry', 'slider-bone-rz'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', applySlidersToBone);
    }
  });

  // Reset Single Bone Button
  const btnResetBone = document.getElementById('btn-reset-bone');
  if (btnResetBone) {
    btnResetBone.addEventListener('click', () => {
      if (!selectedBoneObj) return;
      const base = BASE_IDLE_ROTATIONS[selectedBoneObj.name] || [0, 0, 0];
      const euler = new THREE.Euler(
        THREE.MathUtils.degToRad(base[0]),
        THREE.MathUtils.degToRad(base[1]),
        THREE.MathUtils.degToRad(base[2]),
        'XYZ'
      );
      selectedBoneObj.quaternion.setFromEuler(euler);
      if (activeCharacterModel) activeCharacterModel.updateMatrixWorld(true);
      if (skeletonHelper && typeof skeletonHelper.updateMatrixWorld === 'function') {
        skeletonHelper.updateMatrixWorld(true);
      }
      updateSlidersFromBone(selectedBoneObj);
      showToast(`Кость ${selectedBoneObj.name.replace('mixamorig:', '')} сброшена`);
    });
  }

  // Reset All Bones to Idle 1:1
  const btnResetAll = document.getElementById('btn-reset-all-pose');
  if (btnResetAll) {
    btnResetAll.addEventListener('click', () => {
      if (!activeCharacterModel) return;
      Object.entries(BASE_IDLE_ROTATIONS).forEach(([bName, [rx, ry, rz]]) => {
        const bone = activeCharacterModel.getObjectByName(bName);
        if (bone) {
          const euler = new THREE.Euler(
            THREE.MathUtils.degToRad(rx),
            THREE.MathUtils.degToRad(ry),
            THREE.MathUtils.degToRad(rz),
            'XYZ'
          );
          bone.quaternion.setFromEuler(euler);
        }
      });
      if (activeCharacterModel) activeCharacterModel.updateMatrixWorld(true);
      if (skeletonHelper && typeof skeletonHelper.updateMatrixWorld === 'function') {
        skeletonHelper.updateMatrixWorld(true);
      }
      if (selectedBoneObj) updateSlidersFromBone(selectedBoneObj);
      showToast('Вся поза сброшена в эталонный Idle (1:1)');
    });
  }

  // Copy Pose JSON Button
  const btnCopyJson = document.getElementById('btn-copy-pose-json');
  if (btnCopyJson) {
    btnCopyJson.addEventListener('click', () => {
      if (!activeCharacterModel) return;
      const poseData = {};
      CONTROLLABLE_BONES.forEach(def => {
        const bone = activeCharacterModel.getObjectByName(def.id);
        if (bone) {
          const euler = new THREE.Euler().setFromQuaternion(bone.quaternion, 'XYZ');
          poseData[def.id] = [
            Math.round(THREE.MathUtils.radToDeg(euler.x) * 10) / 10,
            Math.round(THREE.MathUtils.radToDeg(euler.y) * 10) / 10,
            Math.round(THREE.MathUtils.radToDeg(euler.z) * 10) / 10
          ];
        }
      });
      const jsonStr = JSON.stringify(poseData, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(jsonStr).then(() => {
          showToast('📋 Поза скопирована в буфер обмена!');
        }).catch(() => {
          console.log('[Pose JSON]', jsonStr);
          showToast('JSON выведен в консоль F12');
        });
      } else {
        console.log('[Pose JSON]', jsonStr);
        showToast('JSON выведен в консоль F12');
      }
    });
  }

  // Interactive 3D Viewport Raycasting & Dragging on Joint Handles
  function getActiveSpheres() {
    if (!state.showBoneHelpers || !helpersRoot.visible) return [];
    const arr = [];
    helpersRoot.children.forEach(g => {
      if (g.children && g.children.length > 0) arr.push(g.children[0]);
    });
    return arr;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!state.showBoneHelpers || e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    boneMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    boneMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    boneRaycaster.setFromCamera(boneMouse, camera);

    const handles = getActiveSpheres();
    const hits = boneRaycaster.intersectObjects(handles, false);

    if (hits.length > 0) {
      const clickedSphere = hits[0].object;
      const bName = clickedSphere.userData.boneName;
      selectBone(bName);
      isDraggingBone = true;
      boneDragStart = { x: e.clientX, y: e.clientY };
      controls.enabled = false;
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (isDraggingBone && selectedBoneObj) {
      const dx = (e.clientX - boneDragStart.x) * 0.02;
      const dy = (e.clientY - boneDragStart.y) * 0.02;
      boneDragStart = { x: e.clientX, y: e.clientY };

      const euler = new THREE.Euler().setFromQuaternion(selectedBoneObj.quaternion, 'XYZ');
      euler.y += dx;
      euler.x += dy;
      selectedBoneObj.quaternion.setFromEuler(euler);
      if (activeCharacterModel) activeCharacterModel.updateMatrixWorld(true);
      if (skeletonHelper && typeof skeletonHelper.updateMatrixWorld === 'function') {
        skeletonHelper.updateMatrixWorld(true);
      }
      updateSlidersFromBone(selectedBoneObj);
      return;
    }

    if (!state.showBoneHelpers) return;
    const rect = canvas.getBoundingClientRect();
    boneMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    boneMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    boneRaycaster.setFromCamera(boneMouse, camera);

    const handles = getActiveSpheres();
    const hits = boneRaycaster.intersectObjects(handles, false);

    if (hits.length > 0) {
      const h = hits[0].object;
      if (hoveredBoneHandle !== h) {
        if (hoveredBoneHandle && hoveredBoneHandle !== selectedBoneHandle) {
          hoveredBoneHandle.material.color.setHex(hoveredBoneHandle.userData.baseColor);
          hoveredBoneHandle.scale.set(1, 1, 1);
        }
        hoveredBoneHandle = h;
        canvas.style.cursor = 'grab';
        if (hoveredBoneHandle !== selectedBoneHandle) {
          hoveredBoneHandle.material.color.setHex(0xffea00);
          hoveredBoneHandle.scale.set(1.3, 1.3, 1.3);
        }
      }
    } else {
      if (hoveredBoneHandle && hoveredBoneHandle !== selectedBoneHandle) {
        hoveredBoneHandle.material.color.setHex(hoveredBoneHandle.userData.baseColor);
        hoveredBoneHandle.scale.set(1, 1, 1);
      }
      hoveredBoneHandle = null;
      if (!isDraggingBone) canvas.style.cursor = 'default';
    }
  });

  window.addEventListener('pointerup', () => {
    if (isDraggingBone) {
      isDraggingBone = false;
      controls.enabled = true;
      canvas.style.cursor = 'default';
    }
  });

  // Pedestal Toggle
  document.getElementById('chk-pedestal').addEventListener('change', (e) => {
    state.pedestal = e.target.checked;
    pedestalGroup.visible = state.pedestal;
  });

  // Screenshot Button
  document.getElementById('btn-screenshot').addEventListener('click', takeScreenshot);

  // Toggle UI Visibility
  const uiOverlay = document.getElementById('ui-overlay');
  const btnToggleUi = document.getElementById('btn-toggle-ui');
  const btnUnhideUi = document.getElementById('btn-unhide-ui');

  function toggleUI() {
    uiOverlay.classList.toggle('ui-hidden');
  }

  btnToggleUi.addEventListener('click', toggleUI);
  btnUnhideUi.addEventListener('click', toggleUI);

  // Hotkey 'H' to toggle UI
  window.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') {
      toggleUI();
    }
  });

  // Window Resize
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// ─── Screenshot Tool ─────────────────────────────────────────
function takeScreenshot() {
  renderer.render(scene, camera);
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.download = `project_steam_showroom_${Date.now()}.png`;
  a.href = dataUrl;
  a.click();
  showToast('Скриншот успешно сохранен!');
}

function showToast(msg) {
  const toast = document.getElementById('showroom-toast');
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2800);
}

// ─── Main Render Loop & FPS Counter ──────────────────────────
let lastTime = performance.now();
let frameCount = 0;
let lastFpsUpdate = lastTime;
const fpsElem = document.getElementById('m-fps');

function animate(now) {
  requestAnimationFrame(animate);

  const delta = (now - lastTime) / 1000;
  lastTime = now;

  // FPS Counter
  frameCount++;
  if (now - lastFpsUpdate >= 500) {
    const fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
    const frameMs = (1000 / Math.max(fps, 1)).toFixed(1);
    fpsElem.textContent = `${fps} FPS · ${frameMs} ms`;
    frameCount = 0;
    lastFpsUpdate = now;
  }

  // Update Controls
  controls.update(delta);

  // Update and orient bone helpers in world space
  if (state.showBoneHelpers && helpersRoot.visible && boneHelpersMap.size > 0) {
    boneHelpersMap.forEach((entry) => {
      if (entry.bone && entry.group) {
        entry.bone.getWorldPosition(_tempBoneVec);
        entry.group.position.copy(_tempBoneVec);
        if (entry.ring) entry.ring.lookAt(camera.position);
      }
    });
  }

  // Update Animation Mixer (for rigged models)
  if (activeMixer && !state.animPaused) {
    activeMixer.update(delta * state.animSpeed);
  }

  // Procedural Lineage 2 Weapon Grip (clenches fist when holding weapon)
  updateHandGrip(delta);

  // Update Skeleton Helper if active (Three.js SkeletonHelper updates matrix automatically)
  if (skeletonHelper && typeof skeletonHelper.updateMatrixWorld === 'function') {
    skeletonHelper.updateMatrixWorld();
  }

  // Procedural subtle breathing idle only for unrigged models
  if (state.character === 'engi_woman' && activeCharacterModel && !state.animPaused && !activeMixer) {
    const breathe = Math.sin(now * 0.002) * 0.005;
    activeCharacterModel.position.y = breathe;
  }

  // Animate Aura Rings
  if (auraRoot.children.length > 0) {
    const auraGroup = auraRoot.children[0];
    auraGroup.children.forEach((child) => {
      if (child.userData && child.userData.rotSpeed) {
        child.rotation.z += child.userData.rotSpeed * delta;
      }
    });
  }

  // Animate Ambient Dust Particles
  const posArr = particleGeo.attributes.position.array;
  for (let i = 0; i < particleCount; i++) {
    posArr[i * 3 + 1] += 0.002;
    if (posArr[i * 3 + 1] > 2.5) {
      posArr[i * 3 + 1] = 0.0;
    }
  }
  particleGeo.attributes.position.needsUpdate = true;

  renderer.render(scene, camera);
}

// Initialize Application
initUI();
loadCharacter();
requestAnimationFrame(animate);
