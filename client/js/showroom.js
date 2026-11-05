// ============================================================
//  SHOWROOM.JS — Interactive 3D Character Showroom & Customization Lab
//  Project Steam: Origins (Three.js r185)
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from './libs/addons/controls/OrbitControls.js';

// Base Paths
const PATH_WOMAN = 'assets/Characters/engi/Woman/';
const PATH_MAN = 'assets/Characters/engi/man/';
const PATH_WEAPONS = 'assets/weapons/';

// Application State
const state = {
  character: 'engi_woman', // 'engi_woman' | 'engi_man'
  variant: 'modular',      // 'modular' | 'merged' | 'body_only' | 'hair_only'
  atlas: 'webp_2k',        // 'webp_2k' | 'webp_4k' | 'png_4k' | 'main_webp'
  hairVisible: true,
  hairColor: '#e8c872',
  partsVisibility: {
    head: true,
    Haier: true,
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
  environment: 'studio',
  wireframe: false,
  showSkeleton: false,
  showBoneHelpers: true,
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
controls.minDistance = 0.5;
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
let skeletonHelper = null;

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
  { id: 'mixamorig:LeftBreast', label: '🌸 Левая грудь (L Breast)', color: 0xf43f5e },
  { id: 'mixamorig:RightBreast', label: '🌸 Правая грудь (R Breast)', color: 0xf43f5e },
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
  'mixamorig:LeftBreast': [0, 0, 0],
  'mixamorig:RightBreast': [0, 0, 0],
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
let selectedBoneObj = null;
let selectedBoneHandle = null;
let hoveredBoneHandle = null;
let isDraggingBone = false;
let boneDragStart = { x: 0, y: 0 };
const boneRaycaster = new THREE.Raycaster();
const boneMouse = new THREE.Vector2();

function initBoneHelpers() {
  boneHelpersMap.forEach(entry => {
    if (entry.group.parent) entry.group.parent.remove(entry.group);
    if (entry.sphere.geometry) entry.sphere.geometry.dispose();
    if (entry.sphere.material) entry.sphere.material.dispose();
    if (entry.ring.geometry) entry.ring.geometry.dispose();
    if (entry.ring.material) entry.ring.material.dispose();
  });
  boneHelpersMap.clear();
  selectedBoneObj = null;
  selectedBoneHandle = null;
  hoveredBoneHandle = null;

  if (!activeCharacterModel) return;

  CONTROLLABLE_BONES.forEach(item => {
    const bone = activeCharacterModel.getObjectByName(item.id);
    if (!bone) return;

    const group = new THREE.Group();
    group.name = 'helper_' + bone.name;

    const sphereGeo = new THREE.SphereGeometry(0.024, 14, 14);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: item.color,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.renderOrder = 9999;
    sphere.userData = { isBoneHandle: true, boneName: bone.name, baseColor: item.color };

    const ringGeo = new THREE.RingGeometry(0.028, 0.035, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.renderOrder = 10000;
    ring.userData = { isBoneHandle: true, boneName: bone.name, baseColor: item.color };

    group.add(sphere);
    group.add(ring);
    group.visible = state.showBoneHelpers;

    bone.add(group);
    boneHelpersMap.set(bone.name, { group, sphere, ring, bone, baseColor: item.color });
  });

  console.log(`[Showroom] Initialized ${boneHelpersMap.size} interactive bone helpers.`);
}

function selectBone(boneName) {
  if (selectedBoneHandle) {
    selectedBoneHandle.material.color.setHex(selectedBoneHandle.userData.baseColor);
    selectedBoneHandle.scale.set(1, 1, 1);
    selectedBoneHandle = null;
    selectedBoneObj = null;
  }

  const entry = boneHelpersMap.get(boneName);
  const rotPanel = document.getElementById('bone-rot-controls');
  const selBone = document.getElementById('sel-bone');

  if (!entry) {
    state.selectedBoneName = null;
    if (rotPanel) rotPanel.style.display = 'none';
    if (selBone) selBone.value = '';
    return;
  }

  state.selectedBoneName = boneName;
  selectedBoneObj = entry.bone;
  selectedBoneHandle = entry.sphere;
  selectedBoneHandle.material.color.setHex(0xffaa00);
  selectedBoneHandle.scale.set(1.4, 1.4, 1.4);

  if (selBone) selBone.value = boneName;
  if (rotPanel) rotPanel.style.display = 'block';

  if (!state.animPaused) {
    state.animPaused = true;
    const btnPauseAnim = document.getElementById('btn-pause-anim');
    if (btnPauseAnim) btnPauseAnim.textContent = '▶️ Пуск (Пауза для позы)';
    if (activeMixer) activeMixer.timeScale = 0;
    showToast(`Кость: ${boneName.replace('mixamorig:', '')} (Пауза для позы)`);
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
    case 'webp_4k': return tDir + 'woman_atlas.webp';
    case 'png_4k': return tDir + 'woman_atlas.png';
    case 'main_webp': return tDir + 'Main.webp';
    case 'webp_2k':
    default:
      return tDir + 'woman_atlas_2k.webp';
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

  showToast('Загрузка 3D модели...');

  if (state.character === 'engi_woman') {
    let file = 'woman.glb';
    if (state.variant === 'merged') file = 'woman_merged.glb';
    else if (state.variant === 'body_only') file = 'woman_body.glb';
    else if (state.variant === 'hair_only') file = 'hair.glb';

    try {
      const gltf = await gltfLoader.loadAsync(PATH_WOMAN + file);
      activeCharacterModel = gltf.scene || gltf.scenes[0];

      // Load active texture atlas
      const atlasUrl = getAtlasUrl(state.atlas);
      const atlasTex = await loadTexture(atlasUrl);

      // Create primary shared atlas material
      const atlasMat = new THREE.MeshStandardMaterial({
        map: atlasTex,
        roughness: 0.5,
        metalness: 0.1
      });

      // Special clone for hair to support color tinting
      womanHairMaterial = atlasMat.clone();
      updateHairColor();

      activeCharacterModel.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (state.wireframe) o.material.wireframe = true;

          // If part is hair, assign tintable hair material
          if (o.name === 'Haier' || (o.parent && o.parent.name === 'Haier')) {
            o.material = womanHairMaterial;
          } else {
            o.material = atlasMat;
          }
        }
      });

      applyPartsVisibility();

      // Normalize model height / scale if needed
      activeCharacterModel.position.set(0, 0, 0);
      charRoot.add(activeCharacterModel);

      // Setup Animation Mixer
      if (gltf.animations && gltf.animations.length) {
        activeMixer = new THREE.AnimationMixer(activeCharacterModel);
        gltf.animations.forEach((clip) => {
          activeActions[clip.name.toLowerCase()] = activeMixer.clipAction(clip);
        });
        playAnimation(state.animation);
      }

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
      if (gltf.animations && gltf.animations.length) {
        activeMixer = new THREE.AnimationMixer(activeCharacterModel);
        gltf.animations.forEach((clip) => {
          activeActions[clip.name.toLowerCase()] = activeMixer.clipAction(clip);
        });
        playAnimation(state.animation);
      }

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
}

// ─── Hair Color Tinting ──────────────────────────────────────
function updateHairColor() {
  if (womanHairMaterial) {
    const col = new THREE.Color(state.hairColor);
    // Multiply color into material tint
    womanHairMaterial.color.copy(col);
    womanHairMaterial.needsUpdate = true;
  }
}

// ─── Parts Visibility ────────────────────────────────────────
function applyPartsVisibility() {
  if (!activeCharacterModel) return;

  activeCharacterModel.traverse((o) => {
    if (o.isMesh) {
      const name = o.name;
      if (state.variant === 'modular' && state.character === 'engi_woman') {
        if (name in state.partsVisibility) {
          o.visible = state.partsVisibility[name];
        }
        if (name === 'Haier') {
          o.visible = state.hairVisible && state.partsVisibility.Haier;
        }
      }
    }
  });
  updateMetrics();
}

// ─── Weapons & Enchant Glow ──────────────────────────────────
let activeWeaponMesh = null;
let weaponEnchantGlow = null;

async function loadWeapon() {
  weaponRoot.clear();
  activeWeaponMesh = null;
  weaponEnchantGlow = null;

  if (state.weapon === 'none') {
    return;
  }

  const fbxPath = PATH_WEAPONS + state.weapon + '.fbx';
  try {
    const fbx = await fbxLoader.loadAsync(fbxPath);
    activeWeaponMesh = fbx;

    // Load weapon texture if exists
    try {
      const tex = await loadTexture(PATH_WEAPONS + state.weapon + '.webp');
      fbx.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.material = new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.4,
            metalness: 0.7
          });
        }
      });
    } catch (_) { }

    // Position weapon in right hand socket
    // Position roughly at hand height (y ≈ 0.95, x ≈ 0.35, z ≈ 0.1)
    fbx.scale.setScalar(0.012);
    fbx.position.set(0.38, 0.95, 0.08);
    fbx.rotation.set(0, Math.PI / 2, 0);

    weaponRoot.add(fbx);
    updateEnchantGlow();
  } catch (err) {
    console.warn('Could not load weapon:', fbxPath, err);
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
function playAnimation(animName) {
  state.animation = animName;
  if (!activeMixer) return;

  const action = activeActions[animName] || activeActions['idle'] || Object.values(activeActions)[0];
  if (action) {
    if (currentClipName && activeActions[currentClipName]) {
      activeActions[currentClipName].fadeOut(0.25);
    }
    action.reset().fadeIn(0.25).play();
    currentClipName = animName;
  }
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
function frameCamera(preset) {
  document.querySelectorAll('.preset-grid .btn').forEach(b => b.classList.remove('active'));

  if (preset === 'portrait') {
    controls.setCameraTarget(new THREE.Vector3(0, 1.55, 0), 1.15, Math.PI / 2.05, 0);
    document.getElementById('cam-portrait').classList.add('active');
  } else if (preset === 'full') {
    controls.setCameraTarget(new THREE.Vector3(0, 0.95, 0), 2.9, Math.PI / 2.15, 0);
    document.getElementById('cam-full').classList.add('active');
  } else if (preset === 'weapon') {
    controls.setCameraTarget(new THREE.Vector3(0.35, 1.05, 0.1), 1.25, Math.PI / 2.1, 0.5);
    document.getElementById('cam-weapon').classList.add('active');
  } else if (preset === 'mmo') {
    controls.setCameraTarget(new THREE.Vector3(0, 0.95, 0), 3.4, Math.PI / 3.2, 0.75);
    document.getElementById('cam-mmo').classList.add('active');
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

  // Hair Visibility Toggle
  document.getElementById('chk-hair-visible').addEventListener('change', (e) => {
    state.hairVisible = e.target.checked;
    applyPartsVisibility();
  });

  // Hair Color Picker
  document.getElementById('picker-hair-color').addEventListener('input', (e) => {
    state.hairColor = e.target.value;
    updateHairColor();
  });

  // Hair Color Swatches
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      state.hairColor = sw.dataset.color;
      document.getElementById('picker-hair-color').value = state.hairColor;
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
  document.getElementById('sel-animation').addEventListener('change', (e) => {
    playAnimation(e.target.value);
  });

  // Anim Speed Slider
  const sliderAnimSpeed = document.getElementById('slider-anim-speed');
  const animSpeedVal = document.getElementById('anim-speed-val');
  sliderAnimSpeed.addEventListener('input', (e) => {
    state.animSpeed = parseFloat(e.target.value);
    animSpeedVal.textContent = `${state.animSpeed.toFixed(1)}x`;
    if (activeMixer) activeMixer.timeScale = state.animPaused ? 0 : state.animSpeed;
  });

  // Pause Anim Button
  const btnPauseAnim = document.getElementById('btn-pause-anim');
  btnPauseAnim.addEventListener('click', () => {
    state.animPaused = !state.animPaused;
    btnPauseAnim.textContent = state.animPaused ? '▶️ Пуск' : '⏸️ Пауза';
    if (activeMixer) activeMixer.timeScale = state.animPaused ? 0 : state.animSpeed;
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
      boneHelpersMap.forEach(entry => {
        entry.group.visible = state.showBoneHelpers;
      });
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
  canvas.addEventListener('pointerdown', (e) => {
    if (!state.showBoneHelpers || e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    boneMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    boneMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    boneRaycaster.setFromCamera(boneMouse, camera);

    const handles = [];
    boneHelpersMap.forEach(v => {
      if (v.group.visible) handles.push(v.sphere);
    });
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

    const handles = [];
    boneHelpersMap.forEach(v => {
      if (v.group.visible) handles.push(v.sphere);
    });
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

  // Orient bone helper halo rings towards camera
  if (state.showBoneHelpers && boneHelpersMap.size > 0) {
    boneHelpersMap.forEach((entry) => {
      if (entry.ring) entry.ring.lookAt(camera.position);
    });
  }

  // Update Animation Mixer (for rigged models)
  if (activeMixer && !state.animPaused) {
    activeMixer.update(delta * state.animSpeed);
  }

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
