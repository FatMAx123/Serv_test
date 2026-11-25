// ============================================================
//  HERO AURA (дух ауры героя L2): мягкое сияние по силуэту,
//  тонкие нити-спирали с бегущими огоньками, восходящие искры,
//  лёгкий ореол у ног. Модель читается сквозь эффект.
//
//  Zero-Stutter:
//   - геометрии общие (создаются один раз, не удаляются);
//   - никаких CanvasTexture / PointLight на спавн (свет менял бы
//     число источников -> перекомпиляцию всех материалов сцены);
//   - вся анимация в шейдерах, CPU кадра = один общий uniform времени;
//   - программы прогреваются HeroAuraFX.warmup() со светом игровой сцены,
//     а наборы материалов не удаляются, а уходят в пул — уход/приход
//     игрока с аурой не пересобирает шейдеры.
//  Корень ауры ставится в точку ног; вращение/масштаб корня шейдеры
//  игнорируют (поворот героя не дёргает спирали).
// ============================================================
const HeroAuraFX = (function () {
  const U_TIME = { value: 0 };
  const U_VIEW_H = { value: 1080 }; // высота канваса в px (размер искр)
  let geoms = null;
  const pool = []; // свободные наборы материалов (держат скомпилированные GL-программы)
  const POOL_MAX = 48;
  let warmed = false;

  const NOISE_GLSL = [
    'float auraHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float auraNoise(vec2 p) {',
    '  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(auraHash(i), auraHash(i + vec2(1.0, 0.0)), f.x),',
    '             mix(auraHash(i + vec2(0.0, 1.0)), auraHash(i + vec2(1.0, 1.0)), f.x), f.y);',
    '}'
  ].join('\n');

  const COMMON_FRAG_UNIFORMS = [
    'uniform float uTime;',
    'uniform float uSeed;',
    'uniform float uOpacity;',
    'uniform vec3 uColor;',
    'uniform vec3 uInner;'
  ].join('\n');

  // 1. Сияние по силуэту: вертикальный билборд ЗА героем. Тело пишет глубину
  //    раньше прозрачных объектов, поэтому сияние видно только вокруг силуэта.
  const HALO_VS = [
    'uniform vec3 uSize; // x: ширина, y: высота, z: отступ назад',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  vec3 origin = modelMatrix[3].xyz;',
    '  vec3 toCam = cameraPosition - origin;',
    '  vec2 f = toCam.xz;',
    '  float fl = length(f);',
    '  f = fl > 0.0001 ? f / fl : vec2(0.0, 1.0);',
    '  vec3 fwd = vec3(f.x, 0.0, f.y);',
    '  vec3 right = vec3(f.y, 0.0, -f.x);',
    '  float tanP = clamp(toCam.y / max(fl, 0.001), 0.0, 1.5);',
    '  vec3 wp = origin - fwd * uSize.z + right * (position.x * uSize.x)',
    '          + vec3(0.0, (position.y + 0.5) * uSize.y - uSize.z * tanP * 0.6, 0.0);',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);',
    '}'
  ].join('\n');

  const HALO_FS = [
    COMMON_FRAG_UNIFORMS,
    'varying vec2 vUv;',
    NOISE_GLSL,
    'void main() {',
    '  float y = vUv.y;',
    '  float x = vUv.x * 2.0 - 1.0;',
    '  float t = uTime + uSeed * 37.0;',
    '  float w = mix(0.36, 0.62, smoothstep(0.02, 0.50, y));',
    '  w *= mix(1.0, 0.66, smoothstep(0.70, 0.95, y));',
    '  float n = auraNoise(vec2(x * 2.6 + uSeed * 9.0, y * 5.0 - t * 1.25)) * 0.6',
    '          + auraNoise(vec2(x * 6.0 - 4.0, y * 11.0 - t * 2.1)) * 0.4;',
    '  float d = abs(x) / (w * (0.75 + n * 0.55));',
    '  float glow = exp(-d * d * 2.4);',
    '  float vfade = smoothstep(0.0, 0.10, y) * (1.0 - smoothstep(0.66, 1.0, y));',
    '  float tongue = smoothstep(0.45, 0.95, auraNoise(vec2(x * 4.0 + 1.7, y * 2.4 - t * 1.6)));',
    '  float a = glow * vfade * (0.55 + 0.45 * tongue) * uOpacity;',
    '  vec3 col = mix(uColor, uInner, clamp(glow * glow * 0.5, 0.0, 1.0));',
    '  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  // 2. Нити-спирали: ленты, всегда повёрнутые к камере, путь считается в шейдере.
  const STRAND_VS = [
    'attribute float aU;',
    'attribute float aSide;',
    'attribute vec4 aStrand; // фаза, направление, масштаб радиуса, скорость вращения',
    'uniform float uTime;',
    'uniform float uSeed;',
    'uniform float uWidth;',
    'varying float vU;',
    'varying float vSide;',
    'varying float vPhase;',
    'void main() {',
    '  const float TAU = 6.2831853;',
    '  const float TURNS = 1.55;',
    '  vec3 origin = modelMatrix[3].xyz;',
    '  float h = mix(0.08, 2.05, aU);',
    '  float r = mix(0.50, 0.30, aU) * aStrand.z;',
    '  float ang = aStrand.x + uSeed * TAU + aStrand.y * (aU * TURNS * TAU + uTime * 0.45 * aStrand.w);',
    '  float ca = cos(ang);',
    '  float sa = sin(ang);',
    '  vec3 p = origin + vec3(ca * r, h, sa * r);',
    '  float dA = aStrand.y * TURNS * TAU;',
    '  float dr = -0.20 * aStrand.z;',
    '  vec3 tng = normalize(vec3(dr * ca - r * sa * dA, 1.97, dr * sa + r * ca * dA));',
    '  vec3 side = cross(tng, normalize(cameraPosition - p));',
    '  float sl = length(side);',
    '  side = sl > 0.0001 ? side / sl : vec3(1.0, 0.0, 0.0);',
    '  p += side * aSide * uWidth * 0.5 * (0.6 + 0.4 * sin(aU * 3.14159));',
    '  vU = aU;',
    '  vSide = aSide;',
    '  vPhase = aStrand.x * 0.159 + uSeed;',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);',
    '}'
  ].join('\n');

  const STRAND_FS = [
    COMMON_FRAG_UNIFORMS,
    'varying float vU;',
    'varying float vSide;',
    'varying float vPhase;',
    'void main() {',
    '  float s = vSide;',
    '  float core = exp(-s * s * 14.0);',
    '  float soft = exp(-s * s * 3.0) * 0.35;',
    '  float ph = fract(vU * 1.6 - uTime * 0.55 + vPhase);',
    '  float comet = pow(ph, 7.0) * (1.0 - smoothstep(0.965, 1.0, ph));',
    '  float ends = smoothstep(0.0, 0.14, vU) * (1.0 - smoothstep(0.72, 1.0, vU));',
    '  float a = (core + soft) * (0.11 + comet * 1.3) * ends * uOpacity;',
    '  vec3 col = mix(uColor, uInner, clamp(comet * core, 0.0, 1.0));',
    '  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  // 3. Восходящие искры (Points): жизнь, вращение и мерцание — в шейдере.
  const SPARK_VS = [
    'attribute vec4 aSeed;',
    'uniform float uTime;',
    'uniform float uSeed;',
    'uniform float uViewH;',
    'uniform float uSize;',
    'varying float vAlpha;',
    'varying float vStar;',
    'void main() {',
    '  const float TAU = 6.2831853;',
    '  vec3 origin = modelMatrix[3].xyz;',
    '  float life = 1.9 + aSeed.y * 1.5;',
    '  float t = fract(uTime / life + aSeed.x + uSeed);',
    '  float h = 0.05 + t * (1.7 + aSeed.z * 0.7);',
    '  float r = mix(0.18, 0.52, aSeed.w) * (1.0 - 0.35 * t);',
    '  float dir = aSeed.z > 0.5 ? 1.0 : -1.0;',
    '  float ang = aSeed.x * TAU * 7.0 + dir * t * (1.4 + aSeed.y * 1.6);',
    '  vec4 mv = viewMatrix * vec4(origin + vec3(cos(ang) * r, h, sin(ang) * r), 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  float fade = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.55, 1.0, t));',
    '  float tw = 0.6 + 0.4 * sin(uTime * (2.2 + aSeed.w * 2.5) + aSeed.y * TAU);',
    '  vAlpha = fade * tw;',
    '  vStar = step(0.72, aSeed.y);',
    '  float sz = uSize * (0.55 + aSeed.w * 0.6) * (1.0 + vStar * 0.8);',
    '  gl_PointSize = clamp(sz * projectionMatrix[1][1] * uViewH * 0.5 / max(0.1, -mv.z), 1.0, 28.0);',
    '}'
  ].join('\n');

  const SPARK_FS = [
    COMMON_FRAG_UNIFORMS,
    'varying float vAlpha;',
    'varying float vStar;',
    'void main() {',
    '  vec2 p = gl_PointCoord - 0.5;',
    '  float d2 = dot(p, p);',
    '  float core = exp(-d2 * 90.0);',
    '  float glow = exp(-d2 * 18.0) * 0.45;',
    '  float rays = (exp(-abs(p.x) * 34.0) * exp(-abs(p.y) * 5.0)',
    '             + exp(-abs(p.y) * 34.0) * exp(-abs(p.x) * 5.0)) * 0.7 * vStar;',
    '  float edge = 1.0 - smoothstep(0.20, 0.25, d2);',
    '  float a = (core + glow + rays) * edge * vAlpha * uOpacity;',
    '  vec3 col = mix(uColor, uInner, clamp(core * 1.2, 0.0, 1.0));',
    '  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  // 4. Ореол у ног: тонкое кольцо, мягкое пятно и редкая расходящаяся волна.
  const GROUND_VS = [
    'uniform float uRadius;',
    'varying vec2 vP;',
    'void main() {',
    '  vP = position.xy * 2.0;',
    '  vec3 origin = modelMatrix[3].xyz;',
    '  vec3 wp = origin + vec3(position.x * uRadius * 2.0, 0.05, position.y * uRadius * 2.0);',
    '  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);',
    '}'
  ].join('\n');

  const GROUND_FS = [
    COMMON_FRAG_UNIFORMS,
    'varying vec2 vP;',
    'void main() {',
    '  float r = length(vP);',
    '  float ang = atan(vP.y, vP.x + 0.00001);',
    '  float inner = exp(-r * r * 9.0) * 0.55;',
    '  float rr = (r - 0.52) / 0.035;',
    '  float ring = exp(-rr * rr);',
    '  float arcs = 0.55 + 0.45 * sin(ang * 3.0 + uTime * 0.9 + uSeed * 6.28);',
    '  float rp = fract(uTime * 0.32 + uSeed);',
    '  float pr = (r - mix(0.30, 0.92, rp)) / 0.045;',
    '  float ripple = exp(-pr * pr) * (1.0 - rp) * smoothstep(0.0, 0.15, rp) * 0.7;',
    '  float breathe = 0.85 + 0.15 * sin(uTime * 1.3 + uSeed * 4.0);',
    '  float a = (inner + ring * 0.6 * arcs + ripple) * breathe * uOpacity;',
    '  a *= 1.0 - smoothstep(0.92, 1.0, r);',
    '  vec3 col = mix(uColor, uInner, clamp(inner * 0.8 + ring * 0.25, 0.0, 1.0));',
    '  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  // Спирали: [фаза, направление, масштаб радиуса, скорость вращения]
  const STRANDS = [
    [0.0, 1, 1.0, 1.0],
    [Math.PI, 1, 1.0, 1.0],
    [Math.PI * 0.5, -1, 0.82, 1.3]
  ];
  const STRAND_SEGMENTS = 72;
  const SPARK_COUNT = 40;

  function getGeoms(THREE) {
    if (geoms) return geoms;
    const bounds = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), 1.7);

    const halo = new THREE.PlaneGeometry(1, 1, 1, 1);
    halo.boundingSphere = bounds.clone();
    const ground = new THREE.PlaneGeometry(1, 1, 1, 1);
    ground.boundingSphere = bounds.clone();

    const vCount = STRANDS.length * (STRAND_SEGMENTS + 1) * 2;
    const aU = new Float32Array(vCount);
    const aSide = new Float32Array(vCount);
    const aStrand = new Float32Array(vCount * 4);
    const index = [];
    let v = 0;
    for (let s = 0; s < STRANDS.length; s++) {
      const base = v;
      for (let i = 0; i <= STRAND_SEGMENTS; i++) {
        for (let k = 0; k < 2; k++) {
          aU[v] = i / STRAND_SEGMENTS;
          aSide[v] = k ? 1 : -1;
          aStrand.set(STRANDS[s], v * 4);
          v++;
        }
        if (i < STRAND_SEGMENTS) {
          const a = base + i * 2;
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
    const strands = new THREE.BufferGeometry();
    strands.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vCount * 3), 3));
    strands.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
    strands.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
    strands.setAttribute('aStrand', new THREE.BufferAttribute(aStrand, 4));
    strands.setIndex(index);
    strands.boundingSphere = bounds.clone();

    const aSeed = new Float32Array(SPARK_COUNT * 4);
    for (let i = 0; i < SPARK_COUNT * 4; i++) aSeed[i] = Math.random();
    const sparks = new THREE.BufferGeometry();
    sparks.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3));
    sparks.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 4));
    sparks.boundingSphere = bounds.clone();

    geoms = { halo, ground, strands, sparks };
    return geoms;
  }

  function noRaycast() {}

  function makeMaterial(THREE, vs, fs, common, extra) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: vs,
      fragmentShader: fs,
      uniforms: Object.assign({}, common, extra),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    return mat;
  }

  // Набор материалов одной ауры. Наборы не удаляются, а возвращаются в пул:
  // dispose() освободил бы GL-программы, и следующий герой с аурой снова
  // компилировал бы шейдеры посреди кадра. Материал в пуле хранит свои программы
  // (в т.ч. под другой свет — день/ночь), поэтому повторный спавн бесплатный.
  function makeMaterialSet(THREE) {
    const set = {
      seed: { value: 0 },
      color: { value: new THREE.Color() },
      inner: { value: new THREE.Color() }
    };
    const common = (opacity) => ({
      uTime: U_TIME,
      uSeed: set.seed,
      uOpacity: { value: opacity },
      uColor: set.color,
      uInner: set.inner
    });
    set.halo = makeMaterial(THREE, HALO_VS, HALO_FS, common(0.85), {
      uSize: { value: new THREE.Vector3(1.6, 2.5, 0.28) }
    });
    set.strands = makeMaterial(THREE, STRAND_VS, STRAND_FS, common(0.95), {
      uWidth: { value: 0.065 }
    });
    set.sparks = makeMaterial(THREE, SPARK_VS, SPARK_FS, common(1.0), {
      uViewH: U_VIEW_H,
      uSize: { value: 0.085 }
    });
    set.ground = makeMaterial(THREE, GROUND_VS, GROUND_FS, common(0.5), {
      uRadius: { value: 0.85 }
    });
    return set;
  }

  function create(THREE, def) {
    if (!THREE || typeof THREE.ShaderMaterial !== 'function') return null;
    const d = (def && typeof def === 'object') ? def : {};
    const G = getGeoms(THREE);
    const set = pool.length ? pool.pop() : makeMaterialSet(THREE);
    set.seed.value = Math.random();
    set.color.value.set(d.hex || '#00d4ff');
    set.inner.value.set(d.innerHex || '#ffffff');

    const root = new THREE.Group();
    root.name = 'champion_aura_group';
    root.userData.heroAuraSet = set;

    const halo = new THREE.Mesh(G.halo, set.halo);
    const strands = new THREE.Mesh(G.strands, set.strands);
    const sparks = new THREE.Points(G.sparks, set.sparks);
    const ground = new THREE.Mesh(G.ground, set.ground);
    halo.name = 'aura_halo';
    strands.name = 'aura_strands';
    sparks.name = 'aura_sparks';
    ground.name = 'aura_ground';
    [ground, halo, strands, sparks].forEach((o) => {
      o.userData.heroAura = true;
      o.raycast = noRaycast;
      root.add(o);
    });

    return { root: root, elapsedTime: 0 };
  }

  /** Один общий uniform времени на все ауры: вызов дешёвый, можно каждый кадр. */
  function update() {
    U_TIME.value = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) * 0.001;
    const r = (typeof window !== 'undefined' && window.game && window.game.renderer) || null;
    const h = r && r.domElement ? r.domElement.height : 0;
    if (h > 0) U_VIEW_H.value = h;
  }

  /** Убрать ауру: набор материалов уходит в пул, общие геометрии остаются. */
  function dispose(root) {
    if (!root) return;
    if (root.parent) root.parent.remove(root);
    const set = root.userData && root.userData.heroAuraSet;
    if (!set) return;
    root.userData.heroAuraSet = null;
    if (pool.indexOf(set) >= 0) return;
    if (pool.length < POOL_MAX) {
      pool.push(set);
    } else {
      set.halo.dispose(); set.strands.dispose(); set.sparks.dispose(); set.ground.dispose();
    }
  }

  /**
   * Прогрев GL-программ ауры (4 шейдера) до появления первого героя с аурой.
   * Компилируем со светом и тенями игровой сцены: в r185 число источников
   * входит в ключ программы даже у ShaderMaterial. Набор прогрева уходит в пул.
   */
  function warmup(renderer, camera, useAsync) {
    if (warmed || !renderer || !camera) return null;
    const THREE = (typeof window !== 'undefined') ? window.THREE : null;
    const scene = (typeof window !== 'undefined' && window.game && window.game.scene) || null;
    if (!THREE || !scene) return null;
    const ad = create(THREE, null);
    if (!ad) return null;
    warmed = true;
    const done = () => dispose(ad.root);
    try {
      if (useAsync && typeof renderer.compileAsync === 'function') {
        return renderer.compileAsync(ad.root, camera, scene).then(done, () => {
          try { renderer.compile(ad.root, camera, scene); } catch (_) {}
          done();
        });
      }
      if (typeof renderer.compile === 'function') renderer.compile(ad.root, camera, scene);
    } catch (_) {}
    done();
    return null;
  }

  return { create, update, dispose, warmup };
})();

function createChampionAuraGroup(THREE, def) {
  return HeroAuraFX.create(THREE, def);
}
function updateChampionAuraGroup(ad, delta) {
  if (ad) HeroAuraFX.update(ad, delta);
}
function disposeChampionAuraGroup(root) {
  HeroAuraFX.dispose(root);
}
if (typeof window !== 'undefined') {
  window.HeroAuraFX = HeroAuraFX;
  window.createChampionAuraGroup = createChampionAuraGroup;
  window.updateChampionAuraGroup = updateChampionAuraGroup;
  window.disposeChampionAuraGroup = disposeChampionAuraGroup;
}

class Player {
  constructor(scene) {
    this.scene = scene; this.name = 'Оператор #402'; this.uid = 'player_' + Date.now();
    this.level = 1; this.exp = 0; this.playerClass = 'operator'; this.className = 'Оператор';
    this.race = 'human'; this.gender = 'male';
    this.maxHp = 100; this.hp = 100; this.maxEnergy = 50; this.energy = 50;
    this.attackPower = 10; this.defense = 2; this.moveSpeed = 8; this.critChance = 0.15;
    // L2 C1 combat pack
    this.pAtk = 10; this.pDef = 5; this.cAtk = 6; this.cDef = 5;
    this.mAtk = 6; this.mDef = 5; // aliases → cAtk/cDef
    this.accuracy = 22; this.evasion = 16; this.critRate = 15; this.critDamage = 2.0;
    this.primary = { STR: 40, DEX: 30, CON: 43, INT: 21, WIT: 11, MEN: 25 };
    this.passiveBonuses = {};
    this.target = null; this.isMoving = false; this.moveTarget = new THREE.Vector3();
    this.continuousMove = { active: false, x: 0, z: 0 };
    this._continuousNetTimer = 0;
    /** true = walk anim + slower speed (toggle «Бег / Ходьба») */
    this.isWalking = false;
    this._baseMoveSpeed = 8;
    this.autoAttacking = false;
    this._skillHoldAA = false;
    /** L2 corpse: true until village revive (movement/combat locked) */
    this.isDead = false;
    this.facing = 0; // yaw (рад): 0 = +Z (юг на L2-карте север-вверх), для стрелки радара
    // C1 melee = L2 range 40 → GAME_MELEE 3.5 (skills.js).
    // Server MELEE_RANGE 4.0 = тот же якорь + slack, чтобы тик/пинг не давал «слишком далеко».
    this.attackCooldown = 0; this.attackRange = 3.5;
    this.buffs = []; this.tempDamageBoost = 1; this.tempBoostTimer = 0;
    this.classChangePending = false;
    // L2-like cosmetics (title / name color / aura) — from brainrot secret bosses
    this.cosmetics = { title: null, titleName: null, titleColor: null, nameColor: null, aura: null };
    this.nameTag = null;
    this._auraRoot = null;
    this._auraPulse = 0;
    // данные с экрана выбора персонажа
    try {
      const ch = JSON.parse(sessionStorage.getItem('ps_selected_char') || 'null');
      if (ch) {
        if (ch.name) this.name = String(ch.name).slice(0, 16);
        if (ch.cls) this.playerClass = ch.cls;
        if (ch.className) this.className = ch.className;
        else if (window.CLASS_SYSTEM) this.className = window.CLASS_SYSTEM.getClassName(this.playerClass);
        if (ch.race) this.race = ch.race;
        if (ch.gender) this.gender = ch.gender;
        if (ch.maxHp) { this.maxHp = ch.maxHp; this.hp = ch.hp != null ? ch.hp : ch.maxHp; }
        if (ch.maxEnergy) { this.maxEnergy = ch.maxEnergy; this.energy = ch.energy != null ? ch.energy : ch.maxEnergy; }
      }
    } catch (e) {}
    this.createMesh();
    if (window.SkillManager) this.skillManager = new SkillManager(this);
    if (window.LevelSystem) this.levelSystem = new LevelSystem(this);
    if (this.levelSystem) {
      this.levelSystem.currentClass = this.playerClass || 'operator';
      this.levelSystem.classTier = 0;
      this.levelSystem.classHistory = [this.playerClass || 'operator'];
      if (typeof this.levelSystem.recalculateStats === 'function') this.levelSystem.recalculateStats();
      this.syncFromLevelSystem();
    }
    const badge = document.getElementById('class-name');
    if (badge) badge.textContent = this.className || 'Оператор';
  }
  syncFromLevelSystem() {
    const ls = this.levelSystem;
    this.level = ls.level; this.exp = ls.exp; this.sp = ls.sp;
    this.playerClass = ls.currentClass; this.className = ls.getClassName();
    this.pullL2Stats();
  }
  /**
   * Собрать бонусы экипировки для CLASS_SYSTEM.statsAtLevel(gear).
   * Инвентарь НЕ должен перезаписывать статы — только отдавать gear.
   */
  collectGearBonuses() {
    // Prefer shared ITEM_DB (same as server authority)
    if (window.ITEM_DB && typeof window.ITEM_DB.gearFromEquip === 'function') {
      const inv = (typeof window !== 'undefined' && window.game && window.game.inventory)
        ? window.game.inventory : null;
      if (inv && inv.equipment) {
        const equip = {};
        Object.keys(inv.equipment).forEach((slot) => {
          const item = inv.equipment[slot];
          if (!item) return;
          equip[slot] = {
            id: item.templateId || (item.template && item.template.id) || item.id,
            templateId: item.templateId || (item.template && item.template.id) || item.id,
            template: item.template,
            plus: item.enchantLevel || item.plus || 0,
            shellIndex: item.shellIndex != null ? item.shellIndex : (item.template && item.template.shellIndex),
            casingIndex: item.casingIndex != null ? item.casingIndex : (item.template && item.template.casingIndex),
            isCircuit: item.template && (item.template.isCircuit || item.template.isMagical)
          };
        });
        const isMage = !!(this.isEngineerClass && this.isEngineerClass()) ||
          (this.classId === 'engineer') || (this.cls === 'engineer');
        return window.ITEM_DB.gearFromEquip(equip, { isMagePath: isMage });
      }
    }
    const gear = {
      weaponAtk: 0, armorDef: 0, toolAtk: 0, armorCDef: 0,
      nakedPDefSub: 0, nakedMDefSub: 0,
      speedBonus: 0, critBonus: 0, accuracyBonus: 0, evasionBonus: 0,
      hpBonus: 0, energyBonus: 0, primary: null,
      weaponClass: 'fist',
      weaponAtkBase: null,
      hasShield: false,
      shieldDef: 0,
      blockBonus: 0
    };
    const inv = (typeof window !== 'undefined' && window.game && window.game.inventory)
      ? window.game.inventory
      : null;
    if (!inv || !inv.equipment) return gear;
    const prim = { STR: 0, DEX: 0, CON: 0, INT: 0, WIT: 0, MEN: 0 };
    let hasPrim = false;
    const w = inv.equipment.weapon;
    const wt = w && (w.template || w);
    const twoHanded = !!(wt && (wt.twoHanded ||
      wt.weaponClass === '2h_staff' || wt.weaponClass === '2h_blunt' || wt.weaponClass === '2h_sword'));
    Object.keys(inv.equipment).forEach((slot) => {
      const item = inv.equipment[slot];
      if (!item) return;
      const tpl = item.template || item;
      const atk = (item.attack || tpl.attack || 0) + (item.attackBonus || 0);
      const def = item.defense || tpl.defense || 0;
      const isWeapon = slot === 'weapon' || slot === 'ranged' || tpl.type === 'weapon' || item.type === 'weapon';
      const isShield = slot === 'shield' || tpl.isShield || tpl.slot === 'shield';
      if (isWeapon) {
        gear.weaponAtk += atk;
        if (slot === 'weapon' || !gear.weaponClass || gear.weaponClass === 'fist') {
          gear.weaponClass = tpl.weaponClass || (tpl.ranged ? 'bow' : '1h_blunt');
          if (tpl.baseAtkSpd != null) gear.weaponAtkBase = tpl.baseAtkSpd;
          else if (window.L2_COMBAT && window.L2_COMBAT.weaponBaseAtkSpd) {
            gear.weaponAtkBase = window.L2_COMBAT.weaponBaseAtkSpd(gear.weaponClass);
          }
        }
        if (tpl.isCircuit || tpl.isMagical || item.isCircuit || item.damageType === 'circuit') {
          const c = (item.cAtk != null && typeof item.cAtk === 'number')
            ? item.cAtk
            : (tpl.cAtk != null ? tpl.cAtk : atk);
          gear.toolAtk += c;
        }
      } else if (tpl.isResonator || tpl.isCircuitDevice) {
        // Корпус: cDef / HP / пар. Контур не даёт статов и не cAtk.
        const shell = typeof item.getShellStats === 'function' ? item.getShellStats() : null;
        gear.armorCDef += shell ? shell.cDef : (item.cDef || tpl.cDef || 0);
        gear.hpBonus += shell ? shell.hpBonus : (item.hpBonus || tpl.hpBonus || 0);
        gear.energyBonus += shell ? shell.energyBonus : (item.energyBonus || tpl.energyBonus || 0);
      } else if (tpl.type === 'tool' || slot === 'tool') {
        gear.toolAtk += atk;
        gear.hpBonus += item.hpBonus || tpl.hpBonus || 0;
        gear.energyBonus += item.energyBonus || tpl.energyBonus || 0;
      } else if (isShield) {
        if (!twoHanded) {
          gear.hasShield = true;
          gear.shieldDef += def;
          // L2 Canon: shield P.Def applies ONLY on successful shield block in combat (rollBlock)
          gear.armorCDef += item.cDef || tpl.cDef || tpl.mDef || 0;
          gear.blockBonus += item.blockRate || tpl.blockRate || 0;
        }
        gear.hpBonus += item.hpBonus || tpl.hpBonus || 0;
        gear.energyBonus += item.energyBonus || tpl.energyBonus || 0;
      } else {
        const isJewelry = (slot === 'earring_l' || slot === 'earring_r' || slot === 'necklace' || slot === 'bracelet' || tpl.type === 'accessory' || item.type === 'accessory');
        if (isJewelry && !tpl.isResonator && !tpl.isCircuitDevice && !tpl.isNanoBracelet) {
          const jewelCDef = item.cDef != null ? item.cDef : (tpl.cDef != null ? tpl.cDef : (item.mDef || tpl.mDef || def || 0));
          gear.armorCDef += jewelCDef;
        } else {
          if (atk > 0) gear.weaponAtk += Math.floor(atk * 0.25);
          gear.armorDef += def;
          gear.armorCDef += item.cDef || tpl.cDef || item.mDef || Math.floor(def * 0.6);
        }
        gear.hpBonus += item.hpBonus || tpl.hpBonus || 0;
        gear.energyBonus += item.energyBonus || tpl.energyBonus || 0;
      }
      if (isWeapon) {
        gear.hpBonus += item.hpBonus || tpl.hpBonus || 0;
        gear.energyBonus += item.energyBonus || tpl.energyBonus || 0;
      }
      gear.speedBonus += item.speedBonus || tpl.speedBonus || 0;
      gear.critBonus += item.critBonus || tpl.critBonus || 0;
      gear.accuracyBonus += item.accuracyBonus || tpl.accuracyBonus || 0;
      gear.evasionBonus += item.evasionBonus || tpl.evasionBonus || 0;
      if (item.statBonuses) {
        Object.keys(prim).forEach((k) => {
          if (item.statBonuses[k]) { prim[k] += item.statBonuses[k]; hasPrim = true; }
        });
      }
    });
    if (hasPrim) gear.primary = prim;
    return gear;
  }

  /**
   * C1 weapon profile — оружие НИКОГДА не меняет Casting Spd в статах.
   * Влияет только «feel»: анимация замаха / recovery (Atk.Spd) и 2H stick.
   *  - 1h blunt/sword/staff: нейтрально (чистый бонус брони)
   *  - dagger: короткая анимация → быстрее переход AA↔cast
   *  - 2h_staff: долгая анимация → «застревание» после удара/сбоя каста
   * В C1 нет SA, weapon-type passives для магов, shadow weapons.
   */
  getWeaponProfile() {
    const inv = (typeof window !== 'undefined' && window.game && window.game.inventory)
      ? window.game.inventory : null;
    const w = inv && inv.equipment && inv.equipment.weapon;
    const t = w && (w.template || w);
    const cls = t
      ? (t.weaponClass || (t.ranged ? 'bow' : '1h_blunt'))
      : 'fist';
    const baseAtk = t && t.baseAtkSpd != null
      ? t.baseAtkSpd
      : (window.L2_COMBAT && window.L2_COMBAT.weaponBaseAtkSpd
        ? window.L2_COMBAT.weaponBaseAtkSpd(cls) : 217);
    // anim from live Atk.Spd (weapon base × DEX), not fixed table
    const atkSpd = this.atkSpdL2 || 242;
    const animSec = window.L2_COMBAT && window.L2_COMBAT.swingTimeSec
      ? window.L2_COMBAT.swingTimeSec(atkSpd)
      : (450 / Math.max(1, atkSpd));
    return {
      weaponClass: cls,
      baseAtkSpd: baseAtk,
      animSec: animSec,
      isMagical: !!(t && (t.isMagical || t.isCircuit)),
      twoHanded: !!(t && (t.twoHanded || cls === '2h_staff'))
    };
  }

  hasShieldEquipped() {
    if (this.hasShield) return true;
    const inv = (typeof window !== 'undefined' && window.game && window.game.inventory)
      ? window.game.inventory : null;
    if (!inv || !inv.equipment || !inv.equipment.shield) return false;
    // 2H weapon disables shield even if slot still filled
    const w = inv.equipment.weapon;
    const wt = w && (w.template || w);
    if (wt && (wt.twoHanded || wt.weaponClass === '2h_staff' ||
        wt.weaponClass === '2h_blunt' || wt.weaponClass === '2h_sword')) {
      return false;
    }
    return true;
  }

  isEngineerClass() {
    const cls = this.playerClass || 'operator';
    if (window.CLASS_SYSTEM && window.CLASS_SYSTEM.rootClass) {
      return window.CLASS_SYSTEM.rootClass(cls) === 'engineer';
    }
    return cls === 'engineer' || cls === 'constructor' || cls === 'technomancer' ||
        cls === 'pressure_sorcerer' || cls === 'machine_warlock' || cls === 'circuit_necro' ||
        cls === 'overhaul_master' || cls === 'protocol_prophet';
  }

  /** Боец с нагнетателем и наручами: Оператор и Мастеровой (не Инженер). */
  usesFighterDevices() {
    const cls = this.playerClass || 'operator';
    if (window.CLASS_SYSTEM && window.CLASS_SYSTEM.usesFighterDevices) {
      return window.CLASS_SYSTEM.usesFighterDevices(cls);
    }
    return !this.isEngineerClass();
  }

  isOperatorClass() {
    const cls = this.playerClass || 'operator';
    if (window.CLASS_SYSTEM && window.CLASS_SYSTEM.rootClass) {
      return window.CLASS_SYSTEM.rootClass(cls) === 'operator';
    }
    return cls === 'operator' || cls === 'mechanic' || cls === 'destroyer' || cls === 'gunner' ||
        cls === 'repair_engineer' || cls === 'boiler_guardian' || cls === 'demolitionist' ||
        cls === 'steam_berserker' || cls === 'pneumatic_sniper' || cls === 'artillery_engineer';
  }

  /**
   * Паровой нагнетатель оператора (слот necklace).
   */
  getEquippedCompressor() {
    const inv = (typeof window !== 'undefined' && window.game && window.game.inventory)
      ? window.game.inventory : null;
    if (!inv || !inv.equipment) return null;
    const it = inv.equipment.necklace;
    if (!it) return null;
    const t = it.template || it;
    if (t.isCompressor || t.isOperatorDevice || t.id === 'operator_compressor_low' || it.templateId === 'operator_compressor_low') return it;
    return null;
  }

  hasCompressorEquipped() {
    return !!this.getEquippedCompressor();
  }

  /**
   * Гидравлические наручи оператора (слот bracelet).
   */
  getEquippedOperatorBracers() {
    const inv = (typeof window !== 'undefined' && window.game && window.game.inventory)
      ? window.game.inventory : null;
    if (!inv || !inv.equipment) return null;
    const slots = ['bracelet', 'ring_l', 'ring_r'];
    for (let i = 0; i < slots.length; i++) {
      const it = inv.equipment[slots[i]];
      if (!it) continue;
      const t = it.template || it;
      if (t.isBracers || t.isOperatorBracers || t.id === 'operator_bracers_low' || it.templateId === 'operator_bracers_low') return it;
    }
    return null;
  }

  hasOperatorBracersEquipped() {
    return !!this.getEquippedOperatorBracers();
  }

  /**
   * Паровой резонатор. circuitLevel → атакующие навыки; shell → защита/HP/пар.
   */
  getEquippedResonator() {
    const inv = (typeof window !== 'undefined' && window.game && window.game.inventory)
      ? window.game.inventory : null;
    if (!inv || !inv.equipment) return null;
    const slots = ['necklace', 'weapon'];
    for (let i = 0; i < slots.length; i++) {
      const it = inv.equipment[slots[i]];
      if (!it) continue;
      const t = it.template || it;
      if (t.isResonator || t.isCircuitDevice) return it;
      if (t.id === 'engineer_emitter_low' || it.templateId === 'engineer_emitter_low') return it;
    }
    return null;
  }

  hasCircuitResonatorEquipped() {
    return !!this.getEquippedResonator();
  }

  /** Уровень контура (атаки), 0 = нет прибора. */
  getValveLevel() {
    const it = this.getEquippedCompressor();
    if (!it) return 0;
    if (typeof it.getValveLevel === 'function') return it.getValveLevel();
    if (typeof it.getCircuitLevel === 'function') return it.getCircuitLevel();
    return it.valveLevel || it.circuitLevel || 1;
  }

  getCircuitLevel() {
    const it = this.getEquippedResonator() || this.getEquippedCompressor();
    if (!it) return 0;
    if (typeof it.getValveLevel === 'function' && (it.isCompressor || it.isOperatorDevice || it.id === 'operator_compressor_low')) return it.getValveLevel();
    if (typeof it.getCircuitLevel === 'function') return it.getCircuitLevel();
    if (typeof it.getResonatorLevel === 'function') return it.getResonatorLevel();
    return it.circuitLevel || it.valveLevel || it.resonatorLevel || 1;
  }

  /** @deprecated → getCircuitLevel */
  getResonatorLevel() {
    return this.getCircuitLevel();
  }

  /**
   * Нано-браслеты. nanoLevel → heal / drain / buff / debuff; casing → пар/HP.
   */
  getEquippedNanoBracelet() {
    const inv = (typeof window !== 'undefined' && window.game && window.game.inventory)
      ? window.game.inventory : null;
    if (!inv || !inv.equipment) return null;
    const slots = ['bracelet', 'ring_l', 'ring_r'];
    for (let i = 0; i < slots.length; i++) {
      const it = inv.equipment[slots[i]];
      if (!it) continue;
      const t = it.template || it;
      if (t.isNanoBracelet || t.isBraceletDevice) return it;
      if (t.id === 'engineer_nano_bracelet' || it.templateId === 'engineer_nano_bracelet') return it;
    }
    return null;
  }

  hasNanoBraceletEquipped() {
    return !!this.getEquippedNanoBracelet();
  }

  /** Уровень нано-сети (heal/drain/buff/debuff), 0 = нет браслетов. */
  getWristLevel() {
    const it = this.getEquippedOperatorBracers();
    if (!it) return 0;
    if (typeof it.getWristLevel === 'function') return it.getWristLevel();
    if (typeof it.getNanoLevel === 'function') return it.getNanoLevel();
    return it.wristLevel || it.nanoLevel || 1;
  }

  getNanoLevel() {
    const it = this.getEquippedNanoBracelet() || this.getEquippedOperatorBracers();
    if (!it) return 0;
    if (typeof it.getWristLevel === 'function' && (it.isBracers || it.isOperatorBracers || it.id === 'operator_bracers_low')) return it.getWristLevel();
    if (typeof it.getNanoLevel === 'function') return it.getNanoLevel();
    return it.nanoLevel || it.wristLevel || 1;
  }

  /**
   * Мин. circuit/nano level по levelReq навыка.
   * 1–1→1, 2–7→2, 8–14→3, 15–20→4, 21–28→5, 29+→6
   */
  _deviceReqForSkill(template, skillLevel) {
    if (!template) return 1;
    let lr = template.levelReq || 1;
    if (template.ranks && skillLevel != null && template.ranks[skillLevel - 1]) {
      lr = template.ranks[skillLevel - 1].levelReq || lr;
    }
    if (template.resonatorReq != null) return template.resonatorReq | 0;
    if (template.circuitReq != null) return template.circuitReq | 0;
    if (template.nanoReq != null) return template.nanoReq | 0;
    if (template.braceletReq != null) return template.braceletReq | 0;
    if (lr <= 1) return 1;
    if (lr <= 7) return 2;
    if (lr <= 14) return 3;
    if (lr <= 20) return 4;
    if (lr <= 28) return 5;
    return 6;
  }

  /**
   * Мин. circuitLevel для атакующего навыка.
   */
  resonatorReqForSkill(template, skillLevel) {
    return this._deviceReqForSkill(template, skillLevel);
  }

  /** Мин. nanoLevel для heal / drain / buff / debuff. */
  nanoReqForSkill(template, skillLevel) {
    return this._deviceReqForSkill(template, skillLevel);
  }

  /**
   * Приборное разделение умений:
   * Инженер: 'bracelet' (нано-браслеты) vs 'resonator' (резонатор контура).
   * Оператор: 'bracers' (наручи-компенсаторы) vs 'compressor' (паровой нагнетатель).
   * @returns {'bracelet'|'resonator'|'compressor'|'bracers'|null}
   */
  skillDeviceGate(template) {
    if (!template) return null;
    if (template.deviceReq && template.deviceReq.type) {
      return template.deviceReq.type; // 'compressor' | 'bracers' | 'resonator' | 'bracelet'
    }
    const isOp = typeof this.usesFighterDevices === 'function' ? this.usesFighterDevices() : (this.playerClass === 'operator');
    if (isOp) {
      if (template.type === 'passive') return null;
      return template.category === 'attack' ? 'compressor' : 'bracers';
    }
    const cat = template.category;
    // Нано-браслеты: heal / buff / debuff / drain
    if (cat === 'heal' || cat === 'buff' || cat === 'debuff') return 'bracelet';
    const ls = template.lifeSteal != null ? +template.lifeSteal : 0;
    if (ls > 0) return 'bracelet';
    const id = String(template.id || '');
    if (/drain|vamp|absorb|leech/i.test(id)) return 'bracelet';
    // Паровой резонатор: только атакующие (без drain)
    if (cat === 'attack') return 'resonator';
    return null;
  }

  /**
   * Оружие инженера в слоте weapon (катушка / staff / blunt circuit…).
   * Резонатор (necklace) — не оружие.
   */
  getEquippedEngineerWeapon() {
    const inv = (typeof window !== 'undefined' && window.game && window.game.inventory)
      ? window.game.inventory : null;
    if (!inv || !inv.equipment) return null;
    const w = inv.equipment.weapon;
    if (!w) return null;
    const t = w.template || w;
    // прибор в слоте weapon (legacy) — не считается «оружием в руке»
    if (t.isResonator || t.isCircuitDevice) return null;
    if (t.isEngineerWeapon) return w;
    if (t.type === 'weapon' && (t.isCircuit || t.isMagical)) return w;
    const id = String(w.templateId || t.id || '').toLowerCase();
    if (t.type === 'weapon' && t.isCircuit) return w;
    // каталог: apprentice_wand, *_coil, *_manifold, bone_resonator, …
    if (/^(apprentice_wand|willow_coil|cedar_manifold|bone_resonator|blood_gauge|slag_mace|ghost_manifold|life_manifold|branch_staff)/i.test(id)) {
      return w;
    }
    if (window.ITEM_DB && typeof window.ITEM_DB.get === 'function') {
      const db = window.ITEM_DB.get(id);
      if (db && db.isEngineerWeapon) return w;
      if (db && db.type === 'weapon' && (db.isCircuit || db.isMagical)) return w;
    }
    return null;
  }

  /** Любое контурное/инженерное оружие в руке. */
  hasEngineerWeaponEquipped() {
    return !!this.getEquippedEngineerWeapon();
  }

  /** Seconds until cast allowed after physical swing / post-cast recovery. */
  getWeaponCastLockRemaining() {
    if (!this.castLockUntil) return 0;
    return Math.max(0, (this.castLockUntil - performance.now()) / 1000);
  }

  /**
   * C1: recovery от Atk.Spd (база оружия × DEX), НЕ от Casting Spd.
   * kind 'swing' — полный интервал AA; 'cast' — короткий откат после каста.
   * dagger 371 → короткий; 2H 211 → длинный; fists 242; blunt 306.
   */
  applyWeaponRecovery(kind) {
    let atkSpd = this.atkSpdL2 || 242;
    // buffs: Magician's Movement already in atkSpdL2 via pullL2Stats;
    // temporary attackSpeedMult (haste skills) scale further
    if (this.buffs && this.buffs.forEach) {
      this.buffs.forEach((b) => {
        if (b.effect && b.effect.attackSpeedMult) atkSpd *= b.effect.attackSpeedMult;
      });
    }
    let anim;
    if (window.L2_COMBAT && window.L2_COMBAT.swingTimeSec) {
      anim = window.L2_COMBAT.swingTimeSec(atkSpd);
    } else {
      anim = 450 / Math.max(1, atkSpd);
    }
    // post-cast recovery = fraction of full swing
    if (kind === 'cast') anim *= 0.28;
    const floor = kind === 'cast' ? 0.05 : 0.22;
    anim = Math.max(floor, anim);
    this.castLockUntil = Math.max(this.castLockUntil || 0, performance.now() + anim * 1000);
    return anim;
  }

  /**
   * Подтянуть статы L2 C1: PRIMARY → combat (CLASS_SYSTEM) + gear + пассивки.
   * Источник истины: shared/class-system.js + shared/l2-combat.js
   */
  pullL2Stats() {
    if (!window.CLASS_SYSTEM || !window.CLASS_SYSTEM.statsAtLevel) return;
    const gear = this.collectGearBonuses();
    const st = window.CLASS_SYSTEM.statsAtLevel(this.playerClass || 'operator', this.level || 1, gear);
    const pb = this.passiveBonuses || {};

    // Active buffs fold
    let atkM = 1, defM = 1, spdM = 1, atkSpdM = 1, buffMaxEnergy = 0, buffCritDmg = 0;
    const now = Date.now();
    const BR = window.BUFF_RULES;
    if (Array.isArray(this.buffs) && this.buffs.length) {
      if (BR) {
        atkM = BR.foldMult(this.buffs, 'attackMult', now);
        defM = BR.foldMult(this.buffs, 'defenseMult', now);
        spdM = BR.foldMult(this.buffs, 'speedMult', now);
        atkSpdM = BR.foldMult(this.buffs, 'atkSpdMult', now);
        buffMaxEnergy = BR.foldAdd ? BR.foldAdd(this.buffs, 'maxEnergyBonus', now) : 0;
        buffCritDmg = BR.foldAdd ? BR.foldAdd(this.buffs, 'critDamageBoost', now) : 0;
        this.vampiric = BR.foldAdd ? BR.foldAdd(this.buffs, 'vampiric', now) : 0;
        this.stunResist = BR.foldAdd ? BR.foldAdd(this.buffs, 'stunResist', now) : 0;
        this.hpRegenFlat = BR.foldAdd ? BR.foldAdd(this.buffs, 'hpRegenFlat', now) : 0;
        this.energyRegenFlat = BR.foldAdd ? BR.foldAdd(this.buffs, 'energyRegenFlat', now) : 0;
        this.energyRegenMult = BR.foldMult ? BR.foldMult(this.buffs, 'energyRegenMult', now) : 1;
        this.adenaMult = BR.foldMult ? BR.foldMult(this.buffs, 'adenaMult', now) : 1;
        this.dropMult = BR.foldMult ? BR.foldMult(this.buffs, 'dropMult', now) : 1;
      } else {
        for (let i = 0; i < this.buffs.length; i++) {
          const b = this.buffs[i];
          if (!b || !(b.until > now)) continue;
          if (b.attackMult) atkM *= +b.attackMult;
          if (b.defenseMult) defM *= +b.defenseMult;
          if (b.speedMult) spdM *= +b.speedMult;
          if (b.atkSpdMult) atkSpdM *= +b.atkSpdMult;
          if (b.maxEnergyBonus) buffMaxEnergy += +b.maxEnergyBonus;
          if (b.critDamageBoost) buffCritDmg += +b.critDamageBoost;
        }
      }
    }

    this.primary = st.primary || this.primary;
    // % passives + C1 flat mastery (Weapon/Armor/Anti Magic) + active buffs
    this.pAtk = Math.floor((st.pAtk * (1 + (pb.attackPercent || 0)) + (pb.pAtkFlat || 0)) * atkM);
    this.pDef = Math.floor((st.pDef * (1 + (pb.defensePercent || 0)) + (pb.pDefFlat || 0)) * defM);
    this.cAtk = Math.floor(((st.cAtk != null ? st.cAtk : st.mAtk) * (1 + (pb.cAtkPercent || 0)) + (pb.cAtkFlat || 0)) * atkM);
    this.cDef = Math.floor(((st.cDef != null ? st.cDef : st.mDef) * (1 + (pb.cDefPercent || 0)) + (pb.cDefFlat || 0)) * defM);
    this.mAtk = this.cAtk; this.mDef = this.cDef;
    this.attackPower = this.pAtk; this.defense = this.pDef;
    this.baseAttackPower = st.pAtk; this.baseDefense = st.pDef;

    // gear.hpBonus includes set hpFlat (Demon −270); energyBonus includes set energyFlat only if
    // not already in maxEnergyFlat — Blue Wolf +206 goes via maxEnergyFlat from passives.
    const baseHp = st.maxHp + (gear.hpBonus || 0);
    // avoid double-count: energyFlat from set is in pb.maxEnergyFlat; piece energyBonus on gear
    const setEnergyInPb = (pb.maxEnergyFlat || 0);
    const baseEn = st.maxEnergy + setEnergyInPb + (gear.energyBonus || 0) + buffMaxEnergy;
    this.maxHp = Math.max(1, Math.floor(baseHp * (1 + (pb.hpPercent || 0))));
    this.maxEnergy = Math.max(1, Math.floor(baseEn * (1 + (pb.energyPercent || 0))));
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    if (this.energy > this.maxEnergy) this.energy = this.maxEnergy;
    this.activeSets = pb.activeSets || gear.activeSets || [];
    this.setLabels = pb.setLabels || [];

    this.accuracy = st.accuracy;
    // Те же единицы, что на сервере (shared/l2-combat.js): доля = проценты.
    const L2C = window.L2_COMBAT || null;
    const evPts = pb.evasion
      ? (L2C && L2C.evasionBonusToPoints ? L2C.evasionBonusToPoints(pb.evasion) : (pb.evasion <= 1 ? Math.round(pb.evasion * 100 / 5) : pb.evasion))
      : 0;
    this.evasion = st.evasion + evPts;
    // critRate — шкала L2 в промилле (40 = 4%); пассивки: доля 0.04 = +4% → +40
    const critAdd = pb.critChance
      ? (L2C && L2C.critBonusToL2 ? L2C.critBonusToL2(pb.critChance) : (pb.critChance <= 1 ? pb.critChance * 1000 : pb.critChance))
      : 0;
    this.critRate = Math.min(500, (st.critRate || 4) + critAdd);
    this.critChance = this.critRate / 100;
    this.critDamage = 2.0 + (pb.critDamage || 0) + buffCritDmg;
    this._baseMoveSpeed = Math.max(1, (+st.speed || 7.5));
    this.moveSpeed = Math.max(1, this._baseMoveSpeed * spdM);
    if (this.gmSpeedMul && this.gmSpeedMul > 1) {
      this.moveSpeed *= this.gmSpeedMul;
    }
    this.speedL2 = Math.round(this.moveSpeed * 16);
    if (this.isWalking) this.moveSpeed = this.moveSpeed * 0.55;
    // C1 Atk.Spd = Floor(WeaponBase × DEX_Mod) × (1 + Magician's Movement…) × buffs
    // fists 242 | blunt 306 | dagger 371 | sword 275 | 2H 211 @ DEX21
    const dex = (this.primary && this.primary.DEX) || 21;
    const wClass = gear.weaponClass || st.weaponClass || 'fist';
    const wBase = gear.weaponAtkBase != null ? gear.weaponAtkBase
      : (window.L2_COMBAT && window.L2_COMBAT.weaponBaseAtkSpd
        ? window.L2_COMBAT.weaponBaseAtkSpd(wClass) : 217);
    const isFist = (wClass === 'fist');
    const atkBuff = 1 + (isFist ? (pb.attackSpeed || 0) : 0); // Magician's Movement +0.25 in robe only for bare hands (fists)
    if (window.L2_COMBAT && window.L2_COMBAT.atkSpdL2) {
      this.atkSpdL2 = window.L2_COMBAT.atkSpdL2(wBase, dex, atkBuff * atkSpdM);
    } else {
      this.atkSpdL2 = Math.floor((st.atkSpdL2 || 242) * atkBuff * atkSpdM);
    }
    this.weaponClass = wClass;
    this.weaponAtkBase = wBase;
    // normalized mult for legacy code: Atk.Spd/333
    this.atkSpeed = this.atkSpdL2 / 333;
    // C1 Casting_Spd = Floor(183×WIT_Mod) × (1+Spellcraft%) × (1+Devotion%)
    // bare 166 | robe +25% → 208 | Devotion +15% → 240  — weapon NEVER changes this
    const wit = (this.primary && this.primary.WIT) || 20;
    // Spellcraft chargeSpeed: 0 bare | 1.0 robe set (+100%). setPct: full Devotion +0.15 only with robe set.
    const spellPct = pb.chargeSpeed || 0;
    const setPct = (spellPct > 0) ? (pb.castSpeedSet || 0) : 0;
    if (window.L2_COMBAT && window.L2_COMBAT.mAtkSpd) {
      this.castingSpd = window.L2_COMBAT.mAtkSpd(wit, spellPct, setPct);
    } else {
      const base = Math.floor(183 * Math.pow(1.009, wit - 30.88));
      this.castingSpd = Math.round(base * (1 + spellPct) * (1 + setPct));
    }
    this.mAtkSpd = this.castingSpd;
    this.chargeSpeed = this.castingSpd / 333;
    // aCis CharTemplate: baseHpReg 1.5 / baseMpReg 0.9; energyRegen % applied on server tick
    this.baseHpReg = st.baseHpReg != null ? st.baseHpReg : 1.5;
    const baseMp = st.baseMpReg != null ? st.baseMpReg : 0.9;
    // display: bare class base × set/skill % (actual regen uses Formulas on server)
    this.baseMpReg = Math.max(0.05, baseMp * (1 + (pb.energyRegen || 0)));
    if (pb.range) this.attackRange = 3.5 + pb.range;
    // Shield: def + block from gear; passives add to blockBonus
    this.hasShield = !!gear.hasShield;
    this.shieldDef = gear.shieldDef || 0;
    let blockB = gear.blockBonus || 0;
    if (pb.blockRate) blockB += (pb.blockRate <= 1 ? pb.blockRate * 100 : pb.blockRate);
    this.blockBonus = blockB;
  }
  createMesh() {
    // Логическая точка игрока — Group:
    // Y = PLAYER_FOOT + ground. 3D-модель с offset −PLAYER_FOOT (ноги на земле).
    // Без 2D-«болванчика»: пока 3D грузится — только тень + зелёный маркер.
    this.mesh = new THREE.Group();
    this.mesh.name = 'player';
    this.mesh.position.set(0, 0.9, 0);
    this.scene.add(this.mesh);
    this._charModel = null;
    this._spriteFallback = null;


    // No flat circle blob under feet (real sun shadows / none — L2 clean look)
    this.shadow = null;

    this.youMarker = null;
    this._youPulse = 0;

    // L2-style nameplate (title + name + color) over local player (Crisp 1024x256 Power-of-Two + LinearFilter)
    this._nameCanvas = document.createElement('canvas');
    this._nameCanvas.width = 1024;
    this._nameCanvas.height = 256;
    this._nameTex = new THREE.CanvasTexture(this._nameCanvas);
    this._nameTex.generateMipmaps = true;
    this._nameTex.minFilter = THREE.LinearFilter;
    this._nameTex.magFilter = THREE.LinearFilter;
    if (this.game && this.game.renderer && this.game.renderer.capabilities) {
      this._nameTex.anisotropy = Math.min(4, this.game.renderer.capabilities.getMaxAnisotropy() || 1);
    }
    this.nameTag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._nameTex, transparent: true, depthTest: false, depthWrite: false
    }));
    this.nameTag.scale.set(5.2, 1.3, 1);
    this.nameTag.position.set(0, 1.68, 0);
    this.nameTag.renderOrder = 998;
    this.scene.add(this.nameTag);
    this.refreshNameplate();

    this.isSitting = false;
    this._standingUp = false;
    this._pendingMove = null;

    // 3D-модель персонажа: единый 3D-пайплайн для всех классов и полов
    this._loadEngineerModel();
  }

  _loadEngineerModel() {
    const CM = window.CharModel;
    if (!CM || typeof CM.attachPlayerModel !== 'function') {
      console.warn('[Player] CharModel not ready — no sprite fallback');
      return;
    }
    const self = this;
    let appearance = null;
    try {
      const ch = JSON.parse(sessionStorage.getItem('ps_selected_char') || 'null');
      if (ch && ch.appearance) appearance = ch.appearance;
    } catch (e) { /* ignore */ }
    if (!appearance) appearance = { hairId: 'hair1' };
    // Резонатор — только иконка (necklace); hand mesh — equip.weapon через syncWeaponVisual
    if (appearance.weaponId === 'engineer_emitter_low') {
      delete appearance.weaponId;
    }

    CM.attachPlayerModel(this.mesh, this.playerClass || 'engineer', this.gender || 'male', {
      height: 1.85,
      aniso: 4,
      hideShadow: true,
      appearance: appearance
    }).then((inst) => {
      if (!inst || !self.mesh) return;
      self._charModel = inst;
      if (typeof inst.playIdle === 'function') inst.playIdle();
      // Оружие в руке = слот equip.weapon (синк с inventory / server), не appearance.weaponId
      // force: re-attach even if load used stale appearance.weaponId
      if (typeof self.syncWeaponVisual === 'function') {
        self.syncWeaponVisual({ force: true });
        // Second pass after welcome/applyInv may finish late
        setTimeout(() => {
          if (self._charModel) self.syncWeaponVisual({ force: true });
        }, 600);
      }
      console.log('[Player] engineer 3D model loaded, fitScale=',
        inst.root && inst.model && inst.model.userData && inst.model.userData.fitScale);
    }).catch((e) => {
      console.warn('[Player] engineer model failed — no sprite fallback', e);
    });
  }

  /**
   * 3D only for real weapons (not resonator). Resonator = icon only.
   * Falls back to catalog alias when item has no own mesh.
   */
  _equippedGearVisualId() {
    try {
      const inv = (typeof window !== 'undefined' && window.game && window.game.inventory)
        || this.inventory || null;
      if (!inv || !inv.equipment) return null;
      const CM = window.CharModel;
      const catalog = (CM && CM.WEAPON_VISUALS) || (CM && CM.default && CM.default.WEAPON_VISUALS);
      const w = inv.equipment.weapon;
      // слот оружия пуст — пустые руки: бьём кулаками (boxing), не «невидимым» оружием
      if (!w) return null;
      const t = w.template || w;
      if (t.isResonator || t.isCircuitDevice) return null;
      const id = String(w.templateId || t.id || '').toLowerCase();
      if (!id || id === 'engineer_emitter_low') return null;
      if (catalog && catalog[id]) return id;
      // Aliases: starter hammers / blunt without own FBX → closest catalog mesh
      const ALIAS = {
        operator_hammer_low: 'apprentice_wand',
        willow_coil: 'magic_mace',
        cedar_manifold: 'apprentice_wand',
        mage_staff: 'apprentice_wand',
        mace_prayer: 'magic_mace',
        crucifix_blood: 'magic_mace',
        voodoo_doll: 'magic_mace',
        demon_fangs: 'magic_mace',
        tears_fairy: 'magic_mace',
        bone_resonator: 'apprentice_wand',
        life_manifold: 'apprentice_wand',
        ghost_manifold: 'apprentice_wand',
        atuba_mace: 'magic_mace'
      };
      if (ALIAS[id] && catalog && catalog[ALIAS[id]]) return ALIAS[id];
      return null;
    } catch (e) {
      return null;
    }
  }

  _equippedWeaponVisualId() {
    return this._equippedGearVisualId();
  }

  /** Sync hand weapon mesh only (resonator has no 3D). */
  syncWeaponVisual(opts) {
    const inst = this._charModel;
    if (!inst || typeof inst.setWeapon !== 'function') {
      // Model not ready — try again shortly (welcome/equip often arrives first)
      if (!this._weaponSyncRetry && typeof window !== 'undefined') {
        this._weaponSyncRetry = true;
        setTimeout(() => {
          this._weaponSyncRetry = false;
          if (this._charModel) this.syncWeaponVisual({ force: true });
        }, 400);
      }
      return;
    }
    // Ensure F2 grips are loaded before attach (LS / editor-overrides)
    try {
      const CM = window.CharModel;
      if (CM && typeof CM.rehydrateWeaponGrips === 'function') CM.rehydrateWeaponGrips();
    } catch (eH) { /* ignore */ }
    const id = this._equippedGearVisualId();
    const force = !!(opts && opts.force);
    inst.setWeapon(id, { force: force }).then(() => {
      // Re-apply grip after skeleton matrices settle (one frame later)
      try {
        const CM = window.CharModel;
        const body = inst.meshRaw || inst.root;
        if (id && body && CM && typeof CM.applyWeaponGripLive === 'function') {
          requestAnimationFrame(() => {
            try { CM.applyWeaponGripLive(body, id); } catch (e2) { /* ignore */ }
          });
        }
      } catch (eA) { /* ignore */ }
    }).catch((e) => {
      console.warn('[Player] syncWeaponVisual fail', e);
    });
  }
  setTarget(e) {
    if (this.isDead) return;
    if (e !== this.target) this.stopFollowing();
    if (e && (e.type === 'p' || e.pid != null)) {
      this.stopAutoAttack();
    }
    this.target = e;
  }
  startFollowing(target) {
    if (this.isDead || !target) return;
    this.setTarget(target);
    this.followingTarget = target;
    this.autoAttacking = false;
  }
  stopFollowing() {
    this.followingTarget = null;
  }
  startAutoAttack(t) {
    if (this.isDead || this.hp <= 0) return;
    this.stopFollowing();
    if (t) this.setTarget(t);
    this.autoAttacking = true;
    this._skillHoldAA = false;
    if (this.skillManager) this.skillManager.pendingSkill = null;
  }
  /** L2: скилл ставит AA на паузу, не выключает её. */
  pauseAutoAttackForSkill() {
    this._skillHoldAA = true;
    this.castLockUntil = 0;
  }
  releaseSkillHoldAA() {
    this._skillHoldAA = false;
  }
  stopAutoAttack() {
    this.autoAttacking = false;
    this._skillHoldAA = false;
    // замах доигрывает до конца (удар не обрывается), каст — сразу в стойку
    if (!this.isMoving && this._charModel && typeof this._charModel.playIdle === 'function') {
      const st = this._charModel.state;
      if (st === 'attack' && typeof this._charModel.finishAttack === 'function') this._charModel.finishAttack();
      else if (st === 'attack' || st === 'cast') this._charModel.playIdle();
    }
  }
  /**
   * Loco anim: walk clip if isWalking, else run.
   * Safe to call every move / mode toggle.
   */
  playLocoAnim() {
    if (!this._charModel) return;
    if (this.isWalking) {
      if (typeof this._charModel.playWalk === 'function') this._charModel.playWalk();
      else if (typeof this._charModel.setMoving === 'function') this._charModel.setMoving(true, 'walk');
    } else {
      if (typeof this._charModel.playRun === 'function') this._charModel.playRun();
      else if (typeof this._charModel.setMoving === 'function') this._charModel.setMoving(true, 'run');
    }
  }

  /** Toggle walk/run (Actions → «Бег / Ходьба»). Sync pose → server regen. */
  setWalkingMode(walking) {
    this.isWalking = !!walking;
    const base = this._baseMoveSpeed || this.moveSpeed || 8;
    this._baseMoveSpeed = base;
    this.moveSpeed = this.isWalking ? base * 0.55 : base;
    if (this.isMoving) this.playLocoAnim();
    if (window.game && window.game.net && typeof window.game.net.intentPose === 'function') {
      window.game.net.intentPose({ walking: this.isWalking });
    }
  }

  /** Movement blocked while sitting, standing up, or dead (L2 corpse). */
  isMoveLocked() {
    return !!(this.isDead || this.isSitting || this._standingUp);
  }

  /**
   * Непрерывное перемещение от виртуального джойстика (мобильное управление).
   */
  setContinuousMovement(vx, vz) {
    if (this.isDead || this.hp <= 0) return;
    if (this.isSitting && !this._standingUp) this.standUp();
    this.stopFollowing();
    const len = Math.hypot(vx, vz);
    if (len < 0.05) {
      this.stopContinuousMovement();
      return;
    }
    this.continuousMove.active = true;
    this.continuousMove.x = vx / len;
    this.continuousMove.z = vz / len;
    this.isMoving = true;
    this.facing = Math.atan2(this.continuousMove.x, this.continuousMove.z);
    this.playLocoAnim();
  }

  stopContinuousMovement() {
    if (!this.continuousMove || !this.continuousMove.active) return;
    this.continuousMove.active = false;
    this.continuousMove.x = 0;
    this.continuousMove.z = 0;
    this.isMoving = false;
    this.playLocoAnim();
    if (window.game && window.game.net && this.mesh) {
      window.game.net.intentMove(this.mesh.position.x, this.mesh.position.z);
    }
  }

  /**
   * Стрим позиции на сервер во время бега.
   * Регресс: клик-ту-мув отправлял `move` ТОЛЬКО по прибытии. Сервер видел весь
   * путь одним прыжком, обрезал его бюджетом перемещения (speed × 1.25, окно
   * 0.7 с ≈ 6.6 м) и оставался у точки старта: соседи видели телепорт в конце
   * забега, а reconciliation тянула игрока назад к старой серверной позиции.
   * Кадансом 0.12 с шаг между пакетами ≈ 1 м — бюджет его принимает.
   */
  _streamMoveToServer(delta, force) {
    this._netMoveAcc = (this._netMoveAcc || 0) + (+delta || 0);
    const interval = (this.gmSpeedMul && this.gmSpeedMul > 1) ? Math.max(0.04, 0.12 / this.gmSpeedMul) : 0.12;
    if (!force && this._netMoveAcc < interval) return;
    this._netMoveAcc = 0;
    if (this.mesh && window.game && window.game.net) {
      const destX = (this.moveTarget && this.isMoving) ? this.moveTarget.x : null;
      const destZ = (this.moveTarget && this.isMoving) ? this.moveTarget.z : null;
      window.game.net.intentMove(this.mesh.position.x, this.mesh.position.z, destX, destZ);
    }
  }

  // Цель клика — любая (суша или вода). Блок только при шаге.
  moveTo(p) {
    if (this.continuousMove) this.continuousMove.active = false;
    if (this.isDead || this.hp <= 0) return;
    this.stopFollowing();
    // Rest: no walk until stand-up anim fully ends
    if (this._standingUp) {
      // re-queue latest click; start moving only after anim done
      this._pendingMove = new THREE.Vector3(p.x, 0, p.z);
      return;
    }
    if (this.isSitting) {
      this._pendingMove = new THREE.Vector3(p.x, 0, p.z);
      this.standUp();
      return;
    }
    // Инвариант «moveTarget всегда Vector3» исторически ломали (редактор и
    // серверная коррекция позиции обнуляли поле), а клик по земле — самое
    // частое действие в игре: пусть лечит, а не падает.
    if (!this.moveTarget) this.moveTarget = new THREE.Vector3();
    this.moveTarget.copy(p);
    this.moveTarget.y = 0;
    this.isMoving = true;
    // walk or run depending on mode (hard-cut attack if fleeing)
    this.playLocoAnim();
    // сразу повернуть стрелку карты к цели
    if (this.mesh) {
      const dx = p.x - this.mesh.position.x;
      const dz = p.z - this.mesh.position.z;
      if (dx * dx + dz * dz > 0.0001) this.facing = Math.atan2(dx, dz);
    }
    // L2-style click marker on ground
    this.showMoveClickMarker(p.x, p.z);
  }

  /**
   * L2 click-to-move: expanding yellow ring that fades out.
   */
  showMoveClickMarker(x, z) {
    if (!this.scene || !window.THREE) return;
    const THREE = window.THREE;
    // remove previous
    if (this._clickMarker) {
      try {
        this.scene.remove(this._clickMarker);
        if (this._clickMarker.geometry) this._clickMarker.geometry.dispose();
        if (this._clickMarker.material) this._clickMarker.material.dispose();
      } catch (e) { /* ignore */ }
      this._clickMarker = null;
    }
    let gy = 0.08;
    if (window.Terrain) {
      if (typeof window.Terrain.heightAt === 'function') {
        gy = window.Terrain.heightAt(x, z) + 0.06;
      }
    }
    // Ring (torus flat) + small center disc — classic L2 vibe
    const group = new THREE.Group();
    group.name = 'l2_click_marker';
    const ringGeo = new THREE.RingGeometry(0.22, 0.38, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffee66,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    const discGeo = new THREE.CircleGeometry(0.12, 20);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0xffcc33,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.01;
    group.add(disc);
    group.position.set(x, gy, z);
    this.scene.add(group);
    this._clickMarker = group;

    const t0 = performance.now();
    const life = 650; // ms
    const self = this;
    const tick = function (now) {
      if (self._clickMarker !== group) return;
      const u = Math.min(1, (now - t0) / life);
      const s = 1 + u * 1.35;
      group.scale.set(s, 1, s);
      ringMat.opacity = 0.95 * (1 - u);
      discMat.opacity = 0.75 * (1 - u * u);
      if (u < 1) {
        requestAnimationFrame(tick);
      } else {
        try {
          self.scene.remove(group);
          ringGeo.dispose();
          ringMat.dispose();
          discGeo.dispose();
          discMat.dispose();
        } catch (e) { /* ignore */ }
        if (self._clickMarker === group) self._clickMarker = null;
      }
    };
    requestAnimationFrame(tick);
  }

  /**
   * Шаг (nx,nz) запрещён?
   * - под воду (h < SEA) нельзя;
   * - если УЖЕ под водой — можно только ВВЕРХ (к берегу), чтобы вылезти.
   * Клик не трогаем.
   */
  _stepBlocked(ox, oz, nx, nz) {
    const T = window.Terrain;
    if (!T) return false;
    const sea = (typeof T.seaLevel === 'number') ? T.seaLevel : -35;
    const hAt = T.groundH || T.heightAt || T.heightAtRaw;
    const oh = hAt ? hAt.call(T, ox, oz) : 0;
    const nh = hAt ? hAt.call(T, nx, nz) : 0;
    const underNow = oh < sea - 0.5;
    const underNext = nh < sea - 0.5;

    if (underNow) {
      // уже на дне: только подъём / выход на сушу, не глубже
      if (underNext && nh <= oh + 0.05) return true;
      // shore-барьер НЕ мешает вылезти на берег
      if (window.Walls && window.Walls.hitsBarrier && window.Walls.hitsBarrier(ox, oz, nx, nz)) return true;
      if (window.VillageFort && window.VillageFort.hitsBarrier && window.VillageFort.hitsBarrier(ox, oz, nx, nz)) return true;
      return false;
    }
    // с суши — в воду нельзя
    if (underNext) return true;
    if (T.canWalkAt && !T.canWalkAt(nx, nz)) return true;
    if (window.Walls && window.Walls.hitsBarrier && window.Walls.hitsBarrier(ox, oz, nx, nz)) return true;
    if (window.VillageFort && window.VillageFort.hitsBarrier && window.VillageFort.hitsBarrier(ox, oz, nx, nz)) return true;
    if (T.hitsShoreBarrier && T.hitsShoreBarrier(ox, oz, nx, nz)) return true;
    // BSP additive brushes with collision
    if (window.BspBrushes && window.BspBrushes.hitsBrushXZ) {
      const py = (this.mesh && this.mesh.position) ? this.mesh.position.y : 1;
      if (window.BspBrushes.hitsBrushXZ(ox, oz, nx, nz, py + 0.5)) return true;
    }
    // Custom Props / 3D models with collision
    if (window.PropsCollision && window.PropsCollision.hitsPropXZ) {
      const py = (this.mesh && this.mesh.position) ? this.mesh.position.y : 1;
      if (window.PropsCollision.hitsPropXZ(ox, oz, nx, nz, py + 0.5)) return true;
    }
    return false;
  }
  /** Макс. длина шага до упора в воду/стену */
  _maxFreeStep(ox, oz, dx, dz, maxDist) {
    const nx = ox + dx * maxDist;
    const nz = oz + dz * maxDist;
    if (!this._stepBlocked(ox, oz, nx, nz)) return maxDist;
    let lo = 0, hi = maxDist, i;
    for (i = 0; i < 10; i++) {
      const mid = (lo + hi) * 0.5;
      const mx = ox + dx * mid, mz = oz + dz * mid;
      if (this._stepBlocked(ox, oz, mx, mz)) hi = mid;
      else lo = mid;
    }
    return lo;
  }
  /**
   * Дальность AA (C1):
   *  - bow → 30
   *  - melee 3.5 (L2 weapon 40); server принимает до 4.0
   */
  getAutoAttackRange() {
    const wProf = this.getWeaponProfile ? this.getWeaponProfile() : null;
    if (wProf && (wProf.weaponClass === 'bow' || (wProf.ranged && wProf.weaponClass !== 'wand'))) {
      return 30;
    }
    return this.attackRange || 3.5;
  }

  /**
   * XZ distance to target (server combat uses XZ only).
   * 3D distanceTo over-counts on hills / tall billboard centers.
   */
  distToTargetXZ(target) {
    if (!this.mesh || !target || !target.mesh) return Infinity;
    const a = this.mesh.position;
    const b = target.mesh.position;
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.hypot(dx, dz);
  }

  /** AA reach to START swing — no body-slack (that made stick flail mid-air). */
  getAutoAttackReach(_target) {
    return this.getAutoAttackRange();
  }

  attack() {
    if (this.isDead || this.hp <= 0) return;
    if (!this.target || this.attackCooldown > 0) return;
    // Мирное действие: игроки не атакуются обычной автоатакой
    if (this.target.type === 'p' || this.target.pid != null) return;
    // L2: во время каста AA заморожена — НЕ срываем каст своим ударом
    if (this.skillManager && this.skillManager.casting) return;
    // нельзя бить сидя / пока встаём — только встать (удар после анимации)
    if (this.isSitting || this._standingUp) {
      if (this.isSitting && !this._standingUp) this.standUp();
      return;
    }
    const tm = this.target.mesh ? this.target.mesh.position : null; if (!tm) return;
    const d = this.distToTargetXZ(this.target);
    const aaRange = this.getAutoAttackReach(this.target);
    if (d > aaRange) { this.moveTo(tm); return; }
    // сразу разворот к цели (L2)
    if (tm) {
      const dx = tm.x - this.mesh.position.x;
      const dz = tm.z - this.mesh.position.z;
      if (dx * dx + dz * dz > 0.0001) this.facing = Math.atan2(dx, dz);
    }
    // C1: Atk.Spd / anim — полный цикл AA (как L2)
    const anim = this.applyWeaponRecovery('swing');
    // Локальный кулдаун не короче серверного интервала (combat_stats
    // atkIntervalMs): иначе лишние пакеты атаки сервер молча отбрасывал.
    this.attackCooldown = this.atkIntervalMs > 0
      ? Math.max(anim, this.atkIntervalMs / 1000)
      : anim;
    // 3D: один замах на атаку — клип по типу оружия растянут на период атаки,
    // контакт кулака/оружия через impactSec (в этот момент net-ws покажет урон)
    const wProf = this.getWeaponProfile ? this.getWeaponProfile() : null;
    let impactSec = 0;
    if (this._charModel && typeof this._charModel.playAttack === 'function') {
      impactSec = +this._charModel.playAttack(this.attackCooldown, {
        weaponClass: wProf ? wProf.weaponClass : 'fist'
      }) || 0;
    }
    const now = performance.now();
    this._aaSwing = { start: now, impactAt: now + impactSec * 1000 };
    const online = !!(window.game && window.game.net && window.game.net.status === 'online');
    if (!online) {
      // офлайн урона от сервера нет — вспышка сама, в момент контакта
      const tgt = this.target;
      setTimeout(() => { if (this.target === tgt) this.createAttackEffect(); }, Math.round(impactSec * 1000));
    }
    if (!window.game || !window.game.net || this.target.mid == null) return;
    const isBow = !!(wProf && wProf.weaponClass === 'bow');
    window.game.net.intentAttack(this.target.mid, isBow);
  }

  /**
   * Задержка показа урона своей автоатаки до контакта последнего замаха, мс.
   * Пакет dmg приходит через RTT после начала замаха; один пакет — один замах.
   */
  takeAaImpactDelayMs() {
    const sw = this._aaSwing;
    if (!sw) return 0;
    this._aaSwing = null;
    const now = performance.now();
    if (now - sw.start > 3000) return 0;
    return Math.max(0, Math.round(sw.impactAt - now));
  }

  /** Сесть / встать (действие «Отдых»). Sit ×1.5 HP/MP regen (L2 Formulas). */
  toggleSit() {
    if (this.isDead || this.hp <= 0) return;
    if (this._standingUp) return; // wait for stand anim
    if (this.isSitting) {
      this.standUp();
      return;
    }
    // при посадке — стоп движения и AA, lock move
    this.isMoving = false;
    this._pendingMove = null;
    this.stopAutoAttack();
    this.isSitting = true;
    this._standingUp = false;
    if (this._charModel && typeof this._charModel.playSit === 'function') {
      this._charModel.playSit();
    }
    if (window.game && window.game.net && typeof window.game.net.intentPose === 'function') {
      window.game.net.intentPose({ sitting: true });
    }
    if (window.game && window.game.addChatMessage) {
      window.game.addChatMessage('Вы садитесь отдохнуть. (реген HP/Пар ×1.5)', 'system');
    }
  }

  /**
   * Stand up from rest. Movement stays locked until stand anim finishes.
   * Optional pending move (from ground click) runs after onDone.
   */
  standUp() {
    if (!this.isSitting || this._standingUp) return;
    this._standingUp = true;
    this.isMoving = false;
    // keep isSitting=true until anim ends → isMoveLocked()
    if (window.game && window.game.addChatMessage) {
      window.game.addChatMessage('Вы встаёте.', 'system');
    }
    // server: leave sit pose immediately (stand ×1.1)
    if (window.game && window.game.net && typeof window.game.net.intentPose === 'function') {
      window.game.net.intentPose({ sitting: false });
    }
    const self = this;
    const finishStand = function () {
      self._standingUp = false;
      self.isSitting = false;
      const pending = self._pendingMove;
      self._pendingMove = null;
      if (pending && self.hp > 0) {
        self.moveTo(pending);
      }
    };
    if (this._charModel && typeof this._charModel.playStand === 'function') {
      const ok = this._charModel.playStand(finishStand);
      if (!ok) finishStand();
    } else if (this._charModel && typeof this._charModel.playIdle === 'function') {
      this._charModel.playIdle();
      finishStand();
    } else {
      finishStand();
    }
  }
  createAttackEffect() {
    if (!this.target || !this.target.mesh) return;
    const e = new THREE.Mesh(new THREE.SphereGeometry(.3, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: .8 }));
    e.position.copy(this.target.mesh.position); e.position.y = 0.9; this.scene.add(e); let s = 1;
    const a = () => { s += .1; e.scale.set(s, s, s); e.material.opacity -= .05; if (e.material.opacity > 0) requestAnimationFrame(a); else this.scene.remove(e); }; a();
  }
  /** Убийства/лут/EXP — только сервер (mob_dead / reward_exp). */
  onTargetKilled() {
    // Keep target ref briefly with hp=0 so UI can flash empty bar
    if (this.target) this.target.hp = 0;
    this.stopAutoAttack();
    const t = this.target;
    this.target = null;
    if (window.game && window.game.ui) {
      if (typeof window.game.ui.showTargetDead === 'function' && t) {
        window.game.ui.showTargetDead(t);
      } else if (window.game.ui.hideTargetStatus) {
        window.game.ui.hideTargetStatus();
      }
    }
  }
  gainExp(amount, mobLevel) {
    if (this.levelSystem) {
      const r = this.levelSystem.gainExp(amount, mobLevel);
      this.syncFromLevelSystem();
      return r;
    }
    this.exp = (this.exp || 0) + amount;
    return { exp: amount, sp: 0 };
  }
  changeClass(idx) { if (!this.classChangePending || !this.levelSystem) return; if (this.levelSystem.performClassTransfer(idx)) { this.syncFromLevelSystem(); if (window.game.skillsUI) window.game.skillsUI.autoFillSkillBar(); } }
  applyBuff(id, duration, effect = {}) { this.buffs = this.buffs.filter(b => b.id !== id); this.buffs.push({ id, duration, effect, startTime: Date.now() }); }
  updateBuffs(delta) { const now = Date.now(); this.buffs = this.buffs.filter(b => (now - b.startTime) / 1000 < b.duration);
    if (this.tempBoostTimer > 0) { this.tempBoostTimer -= delta; if (this.tempBoostTimer <= 0) this.tempDamageBoost = 1; } }
  getAttackPower() { let p = this.attackPower; this.buffs.forEach(b => { if (b.effect.attackMult) p *= b.effect.attackMult; }); return Math.floor(p * this.tempDamageBoost); }
  useSkill(name) {
    if (name === 'repair') {
      // Только сервер: локальный heal + intentUse без списания ломали синхронизацию
      const net = window.game && window.game.net;
      if (net && net.status === 'online') {
        const inv = window.game.inventory;
        if (inv && typeof inv.hasItem === 'function' && !inv.hasItem('synthetic_oil', 1)) {
          if (window.game.addChatMessage) {
            window.game.addChatMessage('Нет синтетического масла.', 'system');
          }
          return;
        }
        net.intentUse('synthetic_oil');
        return;
      }
      if (this.energy < 10) return;
      this.energy -= 10;
      this.hp = Math.min(this.maxHp, this.hp + 30);
      return;
    }
    if (name === 'dash') {
      if (this.energy < 10) return;
      this.energy -= 10;
      const dir = new THREE.Vector3();
      if (this.target && this.target.mesh) dir.subVectors(this.target.mesh.position, this.mesh.position).normalize();
      else dir.set(1, 0, 0);
      this.mesh.position.add(dir.multiplyScalar(5));
      return;
    }
  }
  /**
   * L2 Formulas.calcAtkBreak: шанс срыва каста от входящего урона.
   * cancelResist (бафф/пассивка) снижает шанс.
   */
  _rollCastBreak(dmg) {
    dmg = Math.max(0, +dmg || 0);
    if (dmg <= 0) return false;
    const men = (this.primary && this.primary.MEN != null) ? +this.primary.MEN : 25;
    const maxHp = this.maxHp || 100;
    let cancel = false;
    if (window.L2_COMBAT && window.L2_COMBAT.calcCastCancel) {
      const r = window.L2_COMBAT.calcCastCancel(dmg, men, maxHp);
      let ch = r.chance || 0;
      const resist = (this.passiveBonuses && this.passiveBonuses.cancelResist) || 0;
      // active buffs (Протокол фокуса и т.п.)
      if (this.buffs && this.buffs.length) {
        this.buffs.forEach((b) => {
          if (b.effect && b.effect.cancelResist) ch *= (1 - Math.min(0.9, +b.effect.cancelResist));
        });
      }
      if (resist > 0) ch *= (1 - Math.min(0.9, +resist));
      cancel = Math.random() * 100 < Math.max(0.5, Math.min(99, ch));
    } else if (window.L2_COMBAT && window.L2_COMBAT.rollCastCancel) {
      cancel = window.L2_COMBAT.rollCastCancel(dmg, men, maxHp);
    } else {
      const menB = Math.pow(1.01, men + 0.06);
      let ch = 15 + Math.sqrt(13 * dmg) - (menB * 100 - 100);
      if (maxHp > 0 && dmg / maxHp < 0.03) ch *= 0.35;
      else if (maxHp > 0 && dmg / maxHp < 0.08) ch *= 0.55;
      ch = Math.max(0.5, Math.min(99, ch));
      cancel = Math.random() * 100 < ch;
    }
    return !!cancel;
  }

  takeDamage(a, opts) {
    opts = opts || {};
    let dmg = Math.max(1, a - this.defense);
    // C1 Shield Block Delay: щит + 1H → при блоке micro-stun, каст срывается.
    // Маги в C1 часто ходят без щита именно из‑за этого.
    let blocked = false;
    if (this.hasShieldEquipped() && this.skillManager && this.skillManager.casting) {
      const blockChance = Math.min(0.55, 0.18 + (this.blockBonus || 0));
      if (Math.random() < blockChance) {
        blocked = true;
        dmg = Math.max(1, Math.floor(dmg * 0.5));
        this.skillManager.cancelCast('блок щита');
        // Shield Block Delay ~0.35с + лёгкий weapon recovery
        this.castLockUntil = Math.max(this.castLockUntil || 0, performance.now() + 350);
        this.applyWeaponRecovery('cast');
        if (window.game && window.game.addChatMessage) {
          window.game.addChatMessage('Блок щита — каст сбит (задержка щита).', 'system');
        }
      }
    }
    this.hp -= dmg;
    if (window.game && window.game.ui && window.game.ui.chatDamage) {
      window.game.ui.chatDamage({
        dmg: dmg,
        incoming: true,
        sourceName: opts.sourceName || (opts.attacker && opts.attacker.name) || null,
        crit: !!opts.crit,
        blocked: blocked
      });
    }
    // L2: срыв каста — calcAtkBreak (dmg + MEN), не 100%
    if (!blocked && this.skillManager && this.skillManager.casting) {
      if (this._rollCastBreak(dmg)) {
        this.skillManager.cancelCast('урон');
      }
    }
    if (this.hp <= 0) this.die();
    return { damage: dmg, blocked: blocked };
  }
  /**
   * Enter L2 corpse state: block move/combat, death anim, death UI.
   * Online: called from you_died (penalty already on server).
   * Offline: applies local penalty then shows same dialog.
   * @param {object} [info] - death dialog info from server
   */
  enterDeathState(info) {
    info = info || {};
    if (this.isDead) {
      // already corpse — just refresh UI
      if (window.game && window.game.ui && typeof window.game.ui.showDeathDialog === 'function') {
        window.game.ui.showDeathDialog(info);
      }
      return;
    }
    this.isDead = true;
    this.hp = 0;
    this.isMoving = false;
    this.isSitting = false;
    this._standingUp = false;
    this._pendingMove = null;
    this.stopAutoAttack();
    this.target = null;
    if (this.skillManager && this.skillManager.casting) {
      try { this.skillManager.cancelCast('смерть'); } catch (e) { /* ignore */ }
    }
    if (window.game && window.game.ui) {
      if (typeof window.game.ui.hideTargetStatus === 'function') window.game.ui.hideTargetStatus();
      if (typeof window.game.ui.showDeathDialog === 'function') window.game.ui.showDeathDialog(info);
    }
    // 3D: diy death pose (hold last frame)
    if (this._charModel && typeof this._charModel.playDeath === 'function') {
      try { this._charModel.playDeath(); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Leave corpse after village revive (or offline).
   * @param {{ x?: number, z?: number, hp?: number, maxHp?: number, energy?: number, maxEnergy?: number }} [self]
   */
  leaveDeathState(self) {
    self = self || {};
    this.isDead = false;
    if (self.maxHp != null) this.maxHp = self.maxHp;
    if (self.maxEnergy != null) this.maxEnergy = self.maxEnergy;
    this.hp = self.hp != null ? self.hp : this.maxHp;
    this.energy = self.energy != null ? self.energy : this.maxEnergy;
    if (self.maxCp != null) this.maxCp = Math.max(0, +self.maxCp || 0);
    if (self.cp != null) this.cp = Math.max(0, +self.cp || 0);
    if (self.x != null && this.mesh) {
      this.mesh.position.x = self.x;
      this.mesh.position.z = self.z;
    }
    this.isMoving = false;
    this._pendingMove = null;
    this.target = null;
    if (window.game && window.game.ui) {
      if (typeof window.game.ui.hideDeathDialog === 'function') window.game.ui.hideDeathDialog();
      if (typeof window.game.ui.hideTargetStatus === 'function') window.game.ui.hideTargetStatus();
    }
    if (this._charModel && typeof this._charModel.playRevive === 'function') {
      try { this._charModel.playRevive(); } catch (e) { /* ignore */ }
    } else if (this._charModel && typeof this._charModel.playIdle === 'function') {
      try { this._charModel.playIdle(); } catch (e) { /* ignore */ }
    }
    if (typeof this.pullL2Stats === 'function') {
      try { this.pullL2Stats(); } catch (e) { /* ignore */ }
    }
  }

  /** Offline: village respawn after death dialog. */
  reviveOfflineVillage() {
    if (!this.isDead) return;
    // village-ish spawn (same as server default)
    const x = -107.5;
    const z = -246.4;
    this.leaveDeathState({ x: x, z: z, hp: this.maxHp, maxHp: this.maxHp, energy: this.maxEnergy, maxEnergy: this.maxEnergy });
    if (window.game && window.game.addChatMessage) {
      window.game.addChatMessage('Медики доставили вас в город.', 'system');
    }
  }

  die() {
    // Online: server owns death packet (you_died). Local visual if packet is late.
    const net = window.game && window.game.net;
    if (net && (net.status === 'online' || net.connected)) {
      this.isMoving = false;
      this._pendingMove = null;
      this.stopAutoAttack();
      this.hp = 0;
      // Don't open dialog twice — wait for you_died (penalty + UI).
      // If already dead from packet, keep anim.
      if (!this.isDead && this._charModel && typeof this._charModel.playDeath === 'function') {
        try { this._charModel.playDeath(); } catch (e) { /* ignore */ }
      }
      return;
    }

    // Offline: local penalty + L2 death UI (no auto-teleport)
    this.isMoving = false;
    this.isSitting = false;
    this._standingUp = false;
    this._pendingMove = null;
    this.stopAutoAttack();
    if (window.game.dungeonManager) window.game.dungeonManager.onPlayerDeath();
    let info = { loss: 0, delevels: 0, villageName: 'Деревню' };
    if (window.game.lootManager) {
      // lootManager mutates levelSystem; capture before/after for dialog
      const ls = this.levelSystem;
      const lv0 = ls ? ls.level : this.level;
      const exp0 = ls ? ls.exp : this.exp;
      window.game.lootManager.onPlayerDeath(this);
      if (ls) {
        info.loss = Math.max(0, exp0 - (ls.exp | 0)); // approximate if same level
        info.delevels = Math.max(0, lv0 - (ls.level | 0));
        if (info.delevels > 0 && window.L2_EXP_TABLE && window.L2_EXP_TABLE.applyDeathExpLoss) {
          // loss already applied; recompute for display
          const lossPct = (window.L2_COMBAT && typeof window.L2_COMBAT.deathExpLossPct === 'function')
            ? window.L2_COMBAT.deathExpLossPct(lv0) : 0.04;
          const r = window.L2_EXP_TABLE.applyDeathExpLoss(lv0, exp0, lossPct);
          info.loss = r.loss;
          info.delevels = r.delevels;
        }
      }
    }
    this.enterDeathState(info);
  }
  /** L2-style level-up VFX (pillar + rings + sparks + banner). */
  createLevelUpEffect(level) {
    const lv = level != null ? level : this.level;
    if (window.SkillVFX && window.SkillVFX.playLevelUp) {
      window.SkillVFX.playLevelUp(this, { level: lv });
      return;
    }
    // fallback: simple gold ring if VFX module missing
    if (!this.scene || !window.THREE) return;
    const r = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    r.rotation.x = -Math.PI / 2;
    r.position.copy(this.mesh.position);
    r.position.y = 0.1;
    this.scene.add(r);
    let s = 1;
    const a = () => {
      s += 0.05;
      r.scale.set(s, s, s);
      r.material.opacity -= 0.02;
      if (r.material.opacity > 0) requestAnimationFrame(a);
      else this.scene.remove(r);
    };
    a();
  }
  update(delta) {
    if (this.attackCooldown > 0) this.attackCooldown -= delta;
    // HP/Energy регенит только сервер (vitals / skill_ok).
    this.updateBuffs(delta);
    if (this.skillManager) this.skillManager.update(delta);
    if (this.levelSystem) this.levelSystem.update(delta);
    // rest lock: never path while sitting / standing up
    if (this.isMoveLocked && this.isMoveLocked() && this.isMoving) {
      this.isMoving = false;
    }
    if (this.isMoving && !this.isMoveLocked()) {
      // stun from mob skills — cannot path
      if (this.stunUntil && this.stunUntil > Date.now()) {
        this.isMoving = false;
      }
    }
    // Auto-follow active target (L2 /follow)
    if (this.followingTarget && !this.isMoveLocked()) {
      const ft = this.followingTarget;
      if (this.target !== ft) {
        this.followingTarget = null;
      } else {
        const g = window.game;
        let tx = null, tz = null;
        if (ft.pid != null && g && g.net) {
          const rem = g.net.remote.get('p' + ft.pid);
          if (rem) { tx = rem.x; tz = rem.z; }
        } else if (ft.mid != null && g && g.net) {
          const rem = g.net.remote.get('m' + ft.mid);
          if (rem) { tx = rem.x; tz = rem.z; }
        } else if (ft.mesh && ft.mesh.position) {
          tx = ft.mesh.position.x;
          tz = ft.mesh.position.z;
        }
        if (tx != null && tz != null) {
          const dx = tx - this.mesh.position.x;
          const dz = tz - this.mesh.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 2.4) {
            const dirX = dx / dist;
            const dirZ = dz / dist;
            let spd = this.moveSpeed || 8;
            if (this.slowUntil && this.slowUntil > Date.now() && this.slowMult != null && this.slowMult < 1) {
              spd *= Math.max(0.35, +this.slowMult);
            }
            const step = Math.min(spd * delta, dist - 2.0);
            const ox = this.mesh.position.x, oz = this.mesh.position.z;
            const free = this._maxFreeStep(ox, oz, dirX, dirZ, step);
            if (free > 0.01) {
              this.mesh.position.x = ox + dirX * free;
              this.mesh.position.z = oz + dirZ * free;
              this.facing = Math.atan2(dirX, dirZ);
              if (!this.isMoving) {
                this.isMoving = true;
                this.playLocoAnim();
              }
              this._streamMoveToServer(delta);
            }
          } else {
            if (this.isMoving) {
              this.isMoving = false;
              this.playLocoAnim();
              this._streamMoveToServer(0, true);
            }
          }
        } else {
          this.followingTarget = null;
        }
      }
    } else if (this.continuousMove && this.continuousMove.active && !this.isMoveLocked()) {
      const dirX = this.continuousMove.x;
      const dirZ = this.continuousMove.z;
      let spd = this.moveSpeed;
      if (this.slowUntil && this.slowUntil > Date.now() && this.slowMult != null && this.slowMult < 1) {
        spd *= Math.max(0.35, +this.slowMult);
      }
      const want = spd * delta;
      const ox = this.mesh.position.x, oz = this.mesh.position.z;
      const free = this._maxFreeStep(ox, oz, dirX, dirZ, want);
      if (free > 0.01) {
        this.mesh.position.x = ox + dirX * free;
        this.mesh.position.z = oz + dirZ * free;
        this.facing = Math.atan2(dirX, dirZ);
        if (!this.isMoving) {
          this.isMoving = true;
          this.playLocoAnim();
        }
      }
      this._streamMoveToServer(delta);
    } else if (this.isMoving && !this.isMoveLocked()) {
      const dir = new THREE.Vector3().subVectors(this.moveTarget, this.mesh.position); dir.y = 0;
      const d = dir.length();
      if (d < .5) {
        this.isMoving = false;
        this._streamMoveToServer(0, true);
      } else {
        dir.normalize();
        let spd = this.moveSpeed;
        if (this.slowUntil && this.slowUntil > Date.now() && this.slowMult != null && this.slowMult < 1) {
          spd *= Math.max(0.35, +this.slowMult);
        }
        const want = Math.min(spd * delta, d);
        const ox = this.mesh.position.x, oz = this.mesh.position.z;
        // Клик может быть в воду — цель ок. Шаг в воду/стену — упор, дальше не идём.
        const free = this._maxFreeStep(ox, oz, dir.x, dir.z, want);
        if (free < 0.02) {
          this.isMoving = false;
          this._streamMoveToServer(0, true);
        } else {
          this.mesh.position.x = ox + dir.x * free;
          this.mesh.position.z = oz + dir.z * free;
          // yaw для стрелки карты/радара: 0=+Z(юг), +π/2=+X(восток)
          if (free > 0.01) this.facing = Math.atan2(dir.x, dir.z);
          // упёрлись в кромку воды/стену — стоп, даже если цель дальше (в море)
          if (free < want - 0.01) {
            this.isMoving = false;
            this._streamMoveToServer(0, true);
          } else {
            // Стрим по пути, а не один пакет по прибытии (см. _streamMoveToServer)
            this._streamMoveToServer(delta);
          }
        }
      }
    }
    // Speed Force VFX while running or active
    if (((this.gmSpeedMul && this.gmSpeedMul > 1) || this._flashIdleAura || this._flashStreamers) && window.SkillVFX && typeof window.SkillVFX.updateFlashRunEffects === 'function') {
      window.SkillVFX.updateFlashRunEffects(this, delta);
    }

    // L2 corpse: no combat / loco overrides while dead
    if (this.isDead) {
      this.isMoving = false;
      this.autoAttacking = false;
      if (this._charModel && typeof this._charModel.update === 'function') {
        this._charModel.update(delta);
      }
      return;
    }

    // L2: каст блокирует AA (AA возобновится после endsAt)
    const castingNow = !!(this.skillManager && this.skillManager.casting);
    const isMobTarget = !!(this.target && (this.target.mid != null || this.target.type === 'm'));
    // Safety: AA without living target (mob_dead race / mesh removed) → idle
    if (this.autoAttacking) {
      const t = this.target;
      const net = window.game && window.game.net;
      const remMob = (net && t && t.mid != null) ? net.remote.get('m' + t.mid) : null;
      const isMobDead = !!(t && (t.dead || t.isDead || t.isDying || (remMob && (remMob.isDying || remMob.dead))));
      const mobStillExists = !net || (t && t.mid != null ? net.remote.has('m' + t.mid) : true);
      const hasLiveTarget = !!(t && isMobTarget && t.mesh && !isMobDead && mobStillExists);
      if (!hasLiveTarget) {
        this.stopAutoAttack();
        if (t && !isMobTarget) { /* keep player target, just stop AA */ }
        else if (t) this.target = null;
      }
    }
    if (!castingNow && !this._skillHoldAA && this.autoAttacking && isMobTarget && this.target && this.target.mesh) {
      const t = this.target;
      const net = window.game && window.game.net;
      const remMob = (net && t && t.mid != null) ? net.remote.get('m' + t.mid) : null;
      const isMobDead = !!(t.dead || t.isDead || t.isDying || (remMob && (remMob.isDying || remMob.dead)));
      const mobStillExists = !net || (t.mid != null ? net.remote.has('m' + t.mid) : true);
      const alive = !isMobDead && mobStillExists;
      if (!alive) {
        this.onTargetKilled();
      } else {
        const d = this.distToTargetXZ(this.target);
        const aaRange = this.getAutoAttackReach(this.target);
        if (d <= aaRange) {
          this.isMoving = false;
          if (this.attackCooldown <= 0) this.attack();
        } else {
          // If outside auto-attack reach: approach target
          if (!this.isMoving) this.moveTo(this.target.mesh.position);
          else {
            // update move target quietly without re-triggering anim
            this.moveTarget.copy(this.target.mesh.position);
            this.moveTarget.y = 0;
          }
        }
      }
    }
    // Y = mesh surface (L2): плотно к ландшафту, лёгкое сглаживание против micro-jitter
    // + поверхность BSP-брашей (платформы / ступени)
    if (window.Terrain) {
      const T = window.Terrain;
      const x = this.mesh.position.x;
      const z = this.mesh.position.z;
      if (typeof T.standY === 'function') {
        const s = T.standY(x, z);
        let targetY = s.y;
        let shadowY = s.shadowY;
        const footNow = (this._smoothY != null && isFinite(this._smoothY)) ? (this._smoothY - 0.95) : (targetY - 0.95);
        let onBsp = false;
        if (window.BspBrushes && window.BspBrushes.standYAt) {
          const by = window.BspBrushes.standYAt(x, z);
          if (by != null && by + 0.95 > targetY) {
            targetY = by + 0.95;
            shadowY = by + 0.02;
            onBsp = true;
          }
        }
        if (!onBsp && window.PropsCollision && window.PropsCollision.standYAt) {
          const pyTop = window.PropsCollision.standYAt(x, z, footNow);
          if (pyTop != null && isFinite(pyTop)) {
            if (pyTop > s.ground || Math.abs(footNow - pyTop) <= Math.abs(footNow - s.ground) || pyTop >= footNow - 0.5) {
              const pTarget = pyTop + 0.95;
              if (pTarget > targetY) {
                targetY = pTarget;
                shadowY = pyTop + 0.02;
              }
            }
          }
        }
        if (this._smoothY == null || !isFinite(this._smoothY)) this._smoothY = targetY;
        const err = targetY - this._smoothY;
        // snap на телепорте; иначе быстрый follow (меш уже точный — не «плыть»)
        if (Math.abs(err) > 2.5) this._smoothY = targetY;
        else this._smoothY += err * Math.min(1, delta * 28);
        this.mesh.position.y = this._smoothY;
        if (this.shadow) this.shadow.position.y = shadowY;
      } else {
        const gh = T.heightAt(x, z);
        let y = 0.95 + gh;
        let shadowFloorY = gh;
        if (window.BspBrushes && window.BspBrushes.standYAt) {
          const by = window.BspBrushes.standYAt(x, z);
          if (by != null && by + 0.95 > y) { y = by + 0.95; shadowFloorY = by; }
        }
        if (window.PropsCollision && window.PropsCollision.standYAt) {
          const pyTop = window.PropsCollision.standYAt(x, z, (this.mesh.position.y || y) - 0.95);
          if (pyTop != null && isFinite(pyTop) && pyTop + 0.95 > y) {
            y = pyTop + 0.95;
            shadowFloorY = pyTop;
          }
        }
        this.mesh.position.y = y;
        if (this.shadow) this.shadow.position.y = shadowFloorY + 0.02;
      }
    }
    if (this.shadow) {
      this.shadow.position.x = this.mesh.position.x;
      this.shadow.position.z = this.mesh.position.z;
    }
    if (this.youMarker) { this._youPulse += delta * 4; const s = 1 + Math.sin(this._youPulse) * 0.18;
      this.youMarker.scale.set(0.85 * s, 0.85 * s, 1);
      this.youMarker.position.x = this.mesh.position.x; this.youMarker.position.z = this.mesh.position.z; this.youMarker.position.y = this.mesh.position.y + 2.12; }
    if (this.nameTag && this.mesh) {
      this.nameTag.position.x = this.mesh.position.x;
      this.nameTag.position.z = this.mesh.position.z;
      this.nameTag.position.y = this.mesh.position.y + 1.68;
      const cam = (typeof window !== 'undefined' && window.game && (window.game.camera || window.game.cam)) || null;
      if (cam && cam.position) {
        const d = cam.position.distanceTo(this.nameTag.position);
        let k = d / 12;
        if (k < 0.55) k = 0.55;
        if (k > 1.45) k = 1.45;
        this.nameTag.scale.set(5.2 * k, 1.3 * k, 1);
      }
    }
    if (this._auraRoot && this.mesh) {
      const groundY = (this.shadow && isFinite(this.shadow.position.y))
        ? this.shadow.position.y
        : (this.mesh.position.y - 0.95);
      this._auraRoot.position.set(this.mesh.position.x, groundY + 0.02, this.mesh.position.z);
      // вся анимация ауры — в шейдерах; здесь только общий uniform времени
      if (this._auraData) updateChampionAuraGroup(this._auraData, delta);
    }

    // L2: при автоатаке / ударе / касте ВСЕГДА смотреть на цель (игнор направления бега)
    if (this.target && this.target.mesh) {
      const alive = (this.target.hp === undefined) || this.target.hp > 0;
      const st = this._charModel && this._charModel.state;
      const faceTarget = alive && (
        this.autoAttacking ||
        st === 'attack' || st === 'cast' ||
        (st === 'loco' && this.autoAttacking)
      );
      if (faceTarget) {
        const dx = this.target.mesh.position.x - this.mesh.position.x;
        const dz = this.target.mesh.position.z - this.mesh.position.z;
        if (dx * dx + dz * dz > 0.0001) this.facing = Math.atan2(dx, dz);
      }
    }

    // 3D char: loco / attack / cast / sit + yaw
    if (this._charModel) {
      if (!this.isSitting && this._charModel.state !== 'dead') {
        const st = this._charModel.state;
        const charging = !!(this.skillManager && this.skillManager.casting);
        if (st === 'cast' && charging) {
          // charged cast owns body until bar ends / cancelCast
        } else if (st === 'cast' && this.isMoving) {
          // instant skill recovery — allow walk/run to cut cast pose
          this.playLocoAnim();
        } else if (st !== 'attack' && st !== 'cast') {
          if (this.isMoving) {
            // keep walk/run in sync (mode may change while moving)
            this.playLocoAnim();
          } else if (typeof this._charModel.setMoving === 'function') {
            this._charModel.setMoving(false);
          }
        } else if (this.isMoving) {
          // flee mid-AA → loco (walk or run by mode)
          this.playLocoAnim();
        } else {
          // leave punch loop only when truly out of melee combat
          let inMelee = false;
          if (this.target && this.target.mesh) {
            const alive = (this.target.hp === undefined) || this.target.hp > 0;
            if (alive) {
              const dd = this.mesh.position.distanceTo(this.target.mesh.position);
              inMelee = dd <= this.getAutoAttackRange() + 0.35;
            }
          }
          const wantCombat = this.autoAttacking || inMelee;
          // after last swing cooldown, if no combat — soft idle
          if (!wantCombat && this.attackCooldown <= 0
              && typeof this._charModel.playIdle === 'function') {
            this._charModel.playIdle();
          }
        }
      }
      if (typeof this._charModel.setFacing === 'function') this._charModel.setFacing(this.facing || 0);
      if (typeof this._charModel.update === 'function') this._charModel.update(delta);
    }
  }

  /**
   * Apply cosmetics from server (title / name color / aura).
   * @param {object} cos - public cosmetics or full
   */
  applyCosmetics(cos) {
    cos = cos || {};
    const isGm = !!this.gm || (this.accessLevel != null && this.accessLevel >= 50);
    const titleId = cos.title || null;
    let titleName = cos.titleName || null;
    let titleColor = cos.titleColor || null;
    const COSDB = window.COSMETICS_DB;
    if (COSDB) {
      if (titleId && !titleName) titleName = COSDB.titleLabel(titleId);
      if (titleId && !titleColor) titleColor = COSDB.titleColor(titleId);
    }
    let effAura = (cos && cos.aura) || null;
    if (!effAura && isGm) effAura = 'gm_champion';
    if (effAura === 'none' || effAura === 'off') effAura = null;
    this.cosmetics = {
      title: titleId,
      titleName: titleName,
      titleColor: titleColor,
      nameColor: (cos && cos.nameColor) || (isGm ? '#00f0ff' : null),
      aura: effAura
    };
    // full unlocks (for future UI)
    if (cos.titles || cos.nameColors || cos.auras) {
      this.cosmeticsFull = cos;
    }
    this.refreshNameplate();
    this.setAura(this.cosmetics.aura);
  }

  refreshNameplate() {
    if (!this._nameCanvas || !this._nameTex) return;
    const COSDB = window.COSMETICS_DB;
    const c = this.cosmetics || {};
    const isGm = !!this.gm || (this.accessLevel != null && this.accessLevel >= 50);

    // Читаем титул строго из слота экипировки (title) инвентаря
    const inv = (this.game && this.game.inventory) || (typeof window !== 'undefined' && window.game && window.game.inventory) || null;
    const eqTitle = inv && inv.equipment && inv.equipment.title;
    let resolvedTitle = null;
    let resolvedTitleColor = null;
    let resolvedTitleId = null;

    if (eqTitle) {
      const tpl = eqTitle.template || eqTitle;
      resolvedTitle = tpl.titleText || tpl.name || null;
      resolvedTitleColor = tpl.titleColor || '#ffd700';
      resolvedTitleId = eqTitle.templateId || eqTitle.id || null;
    } else if (c.titleName) {
      resolvedTitle = c.titleName;
      resolvedTitleColor = c.titleColor || null;
      resolvedTitleId = c.title || null;
    }

    if (isGm && !resolvedTitle) {
      resolvedTitle = 'GM';
      resolvedTitleColor = '#ffd700';
    }

    const isDueling = !!(typeof window !== 'undefined' && window.game && window.game.net && window.game.net.dueling);
    if (COSDB && typeof COSDB.paintNameplate === 'function') {
      COSDB.paintNameplate(this._nameCanvas, {
        name: this.name,
        titleId: resolvedTitleId,
        titleName: resolvedTitle,
        titleColor: resolvedTitleColor,
        nameColor: c.nameColor,
        flagged: !!this.isFlagged,
        karma: this.karma || 0,
        dueling: isDueling,
        gm: isGm,
        accessLevel: this.accessLevel || (isGm ? 100 : 0),
        clanName: this.clanName || null,
        crestImage: this._clanCrestImage || null
      });
    } else {
      const ctx = this._nameCanvas.getContext('2d');
      const w = this._nameCanvas.width, h = this._nameCanvas.height;
      const sc = h / 96;
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (resolvedTitle) {
        ctx.font = `bold ${Math.round(18 * sc)}px Tahoma, Arial, sans-serif`;
        ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(2, Math.round(2.4 * sc));
        ctx.fillStyle = resolvedTitleColor || (isGm ? '#ffd700' : '#c9a227');
        ctx.strokeText(resolvedTitle, w / 2, h * 0.32);
        ctx.fillText(resolvedTitle, w / 2, h * 0.32);
      }
      ctx.font = `bold ${Math.round(25 * sc)}px Tahoma, Arial, sans-serif`;
      ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(3, Math.round(3.2 * sc));
      ctx.fillStyle = (this.karma > 0) ? '#ff4444' : ((this.isFlagged || isDueling) ? '#d060ff' : (c.nameColor || (isGm ? '#00f0ff' : '#ffffff')));
      const ny = resolvedTitle ? h * 0.70 : h * 0.52;
      ctx.strokeText(this.name || '?', w / 2, ny);
      ctx.fillText(this.name || '?', w / 2, ny);
    }
    this._nameTex.needsUpdate = true;
  }

  setAura(auraId) {
    if (this._auraRoot) {
      // общие геометрии ауры не удаляем — только материалы экземпляра
      disposeChampionAuraGroup(this._auraRoot);
      this._auraRoot = null;
      this._auraData = null;
    }
    if (!auraId || !window.THREE) return;
    const COSDB = window.COSMETICS_DB;
    const def = (COSDB && COSDB.AURAS && COSDB.AURAS[auraId]) || {
      id: auraId,
      name: auraId,
      color: 0x00d4ff,
      hex: '#00d4ff',
      innerHex: '#ffffff'
    };

    const ad = createChampionAuraGroup(window.THREE, def, auraId);
    if (ad) {
      this.scene.add(ad.root);
      this._auraRoot = ad.root;
      this._auraData = ad;
      const groundY = (this.shadow && isFinite(this.shadow.position.y))
        ? this.shadow.position.y
        : (this.mesh ? (this.mesh.position.y - 0.95) : 0);
      if (this.mesh) {
        ad.root.position.set(this.mesh.position.x, groundY + 0.02, this.mesh.position.z);
      }
    }
  }

  playAuraBurstVfx(def) {
    if (!this.scene || !this.mesh || !window.THREE) return;
    const groundY = (this.shadow && isFinite(this.shadow.position.y))
      ? this.shadow.position.y
      : (this.mesh ? (this.mesh.position.y - 0.95) : 0);
    spawnAuraBurstVfx(this.scene, { x: this.mesh.position.x, y: groundY, z: this.mesh.position.z }, def);
  }
}

// ============================================================
//  AURA BURST VFX SYSTEM — AAA Korean MMORPG (Lineage 2 / BDO style)
//  Zero-freeze: Pre-cached textures, shared geometries, NO PointLight (0 shader recompile).
//  Multi-phase layered burst:
//   1. Flash Starburst: Anamorphic lens flare at core (0-240ms)
//   2. Sacred Runic Mandala: High-res expanding ground decal with celestial rotating glyphs (0-1200ms)
//   3. Ascension Pillar: Dual counter-rotating cylindrical energy columns (0-800ms)
//   4. Dual Shockwave Rings: Fast inner burst ring + wide outer dissipation wave (0-650ms)
//   5. Sparkling Nova & Steam Embers: 28 diamond stars + 14 rising buoyant motes with physics (0-1200ms)
// ============================================================
const AuraBurstVfxAssets = {
  _initialized: false,
  _texMandala: null,
  _texShockwave: null,
  _texFlare: null,
  _texBeam: null,
  _texSparkle: null,
  _texEmber: null,
  _geomPlane: null,
  _geomPillarOuter: null,
  _geomPillarInner: null,

  init(THREE) {
    if (this._initialized || !THREE) return;
    this._initialized = true;

    // 1. High-Res Sacred Runic Ground Mandala (512x512)
    const cMandala = document.createElement('canvas');
    cMandala.width = 512; cMandala.height = 512;
    const ctxM = cMandala.getContext('2d');
    if (ctxM) {
      const cx = 256, cy = 256;
      ctxM.clearRect(0, 0, 512, 512);

      // Core radial energy bloom
      const gCore = ctxM.createRadialGradient(cx, cy, 10, cx, cy, 240);
      gCore.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      gCore.addColorStop(0.2, 'rgba(255, 255, 255, 0.45)');
      gCore.addColorStop(0.5, 'rgba(255, 255, 255, 0.18)');
      gCore.addColorStop(0.85, 'rgba(255, 255, 255, 0.05)');
      gCore.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
      ctxM.fillStyle = gCore;
      ctxM.beginPath(); ctxM.arc(cx, cy, 240, 0, Math.PI * 2); ctxM.fill();

      // Outer ornate concentric rings
      ctxM.strokeStyle = '#ffffff';
      ctxM.lineWidth = 3.5;
      ctxM.beginPath(); ctxM.arc(cx, cy, 230, 0, Math.PI * 2); ctxM.stroke();
      ctxM.lineWidth = 1.8;
      ctxM.beginPath(); ctxM.arc(cx, cy, 218, 0, Math.PI * 2); ctxM.stroke();
      ctxM.lineWidth = 2.0;
      ctxM.beginPath(); ctxM.arc(cx, cy, 175, 0, Math.PI * 2); ctxM.stroke();
      ctxM.lineWidth = 1.5;
      ctxM.beginPath(); ctxM.arc(cx, cy, 110, 0, Math.PI * 2); ctxM.stroke();
      ctxM.beginPath(); ctxM.arc(cx, cy, 45, 0, Math.PI * 2); ctxM.stroke();

      // Outer radial tick marks (48 ticks)
      for (let i = 0; i < 48; i++) {
        const rad = (i / 48) * Math.PI * 2;
        const r1 = (i % 4 === 0) ? 218 : (i % 2 === 0 ? 222 : 225);
        const r2 = 230;
        ctxM.lineWidth = (i % 4 === 0) ? 2.5 : 1.2;
        ctxM.beginPath();
        ctxM.moveTo(cx + Math.cos(rad) * r1, cy + Math.sin(rad) * r1);
        ctxM.lineTo(cx + Math.cos(rad) * r2, cy + Math.sin(rad) * r2);
        ctxM.stroke();
      }

      // Sacred 8-pointed interlaced geometric star
      ctxM.lineWidth = 2.2;
      for (let p = 0; p < 2; p++) {
        const offset = (p * Math.PI) / 4;
        ctxM.beginPath();
        for (let j = 0; j < 4; j++) {
          const ang = offset + (j * Math.PI) / 2;
          const px = cx + Math.cos(ang) * 175;
          const py = cy + Math.sin(ang) * 175;
          if (j === 0) ctxM.moveTo(px, py);
          else ctxM.lineTo(px, py);
        }
        ctxM.closePath();
        ctxM.stroke();
      }

      // 8 Runic Sigil diamond nodes
      for (let k = 0; k < 8; k++) {
        const aNode = (k / 8) * Math.PI * 2;
        const nx = cx + Math.cos(aNode) * 196;
        const ny = cy + Math.sin(aNode) * 196;
        ctxM.fillStyle = '#ffffff';
        ctxM.beginPath();
        ctxM.arc(nx, ny, 4.5, 0, Math.PI * 2);
        ctxM.fill();
        ctxM.beginPath();
        ctxM.moveTo(nx, ny - 10);
        ctxM.lineTo(nx + 8, ny);
        ctxM.lineTo(nx, ny + 10);
        ctxM.lineTo(nx - 8, ny);
        ctxM.closePath();
        ctxM.stroke();
      }

      // Center sun rays (16 spokes)
      ctxM.lineWidth = 1.5;
      for (let s = 0; s < 16; s++) {
        const aSpoke = (s / 16) * Math.PI * 2;
        ctxM.beginPath();
        ctxM.moveTo(cx + Math.cos(aSpoke) * 45, cy + Math.sin(aSpoke) * 45);
        ctxM.lineTo(cx + Math.cos(aSpoke) * 110, cy + Math.sin(aSpoke) * 110);
        ctxM.stroke();
      }
    }
    this._texMandala = new THREE.CanvasTexture(cMandala);
    this._texMandala.generateMipmaps = true;

    // 2. High-Intensity Shockwave Ring (256x256)
    const cShock = document.createElement('canvas');
    cShock.width = 256; cShock.height = 256;
    const ctxS = cShock.getContext('2d');
    if (ctxS) {
      const cx = 128, cy = 128;
      const g = ctxS.createRadialGradient(cx, cy, 75, cx, cy, 125);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.65, 'rgba(255,255,255,0.25)');
      g.addColorStop(0.88, 'rgba(255,255,255,1.0)');
      g.addColorStop(0.96, 'rgba(255,255,255,0.7)');
      g.addColorStop(1.0, 'rgba(255,255,255,0)');
      ctxS.fillStyle = g;
      ctxS.beginPath(); ctxS.arc(cx, cy, 125, 0, Math.PI * 2); ctxS.fill();
    }
    this._texShockwave = new THREE.CanvasTexture(cShock);

    // 3. Anamorphic Lens Flare Starburst (256x256)
    const cFlare = document.createElement('canvas');
    cFlare.width = 256; cFlare.height = 256;
    const ctxF = cFlare.getContext('2d');
    if (ctxF) {
      const cx = 128, cy = 128;
      // Central hot bloom
      const gCore = ctxF.createRadialGradient(cx, cy, 4, cx, cy, 54);
      gCore.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      gCore.addColorStop(0.2, 'rgba(255, 255, 255, 0.85)');
      gCore.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
      gCore.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
      ctxF.fillStyle = gCore;
      ctxF.beginPath(); ctxF.arc(cx, cy, 54, 0, Math.PI * 2); ctxF.fill();

      // Long horizontal flare streak
      const gHoriz = ctxF.createLinearGradient(0, cy, 256, cy);
      gHoriz.addColorStop(0, 'rgba(255, 255, 255, 0)');
      gHoriz.addColorStop(0.38, 'rgba(255, 255, 255, 0.5)');
      gHoriz.addColorStop(0.5, 'rgba(255, 255, 255, 1.0)');
      gHoriz.addColorStop(0.62, 'rgba(255, 255, 255, 0.5)');
      gHoriz.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
      ctxF.fillStyle = gHoriz;
      ctxF.fillRect(0, cy - 3, 256, 6);

      // Vertical streak
      const gVert = ctxF.createLinearGradient(cx, 16, cx, 240);
      gVert.addColorStop(0, 'rgba(255, 255, 255, 0)');
      gVert.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
      gVert.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
      gVert.addColorStop(0.6, 'rgba(255, 255, 255, 0.5)');
      gVert.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
      ctxF.fillStyle = gVert;
      ctxF.fillRect(cx - 3, 16, 6, 224);

      // Diagonal diamond spikes
      ctxF.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctxF.beginPath();
      ctxF.moveTo(cx, cy - 65); ctxF.lineTo(cx + 8, cy); ctxF.lineTo(cx, cy + 65); ctxF.lineTo(cx - 8, cy);
      ctxF.closePath(); ctxF.fill();
      ctxF.beginPath();
      ctxF.moveTo(cx - 65, cy); ctxF.lineTo(cx, cy - 8); ctxF.lineTo(cx + 65, cy); ctxF.lineTo(cx, cy + 8);
      ctxF.closePath(); ctxF.fill();
    }
    this._texFlare = new THREE.CanvasTexture(cFlare);

    // 4. Vertical Energy Beam Gradient (128x256)
    const cBeam = document.createElement('canvas');
    cBeam.width = 128; cBeam.height = 256;
    const ctxB = cBeam.getContext('2d');
    if (ctxB) {
      const gV = ctxB.createLinearGradient(0, 0, 0, 256);
      gV.addColorStop(0, 'rgba(255, 255, 255, 0)');
      gV.addColorStop(0.12, 'rgba(255, 255, 255, 0.5)');
      gV.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
      gV.addColorStop(0.85, 'rgba(255, 255, 255, 0.7)');
      gV.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
      ctxB.fillStyle = gV;
      ctxB.fillRect(0, 0, 128, 256);
    }
    this._texBeam = new THREE.CanvasTexture(cBeam);

    // 5. Crisp Diamond Sparkle Star (64x64)
    const cSpark = document.createElement('canvas');
    cSpark.width = 64; cSpark.height = 64;
    const ctxSp = cSpark.getContext('2d');
    if (ctxSp) {
      const cx = 32, cy = 32;
      ctxSp.fillStyle = '#ffffff';
      ctxSp.beginPath();
      ctxSp.moveTo(cx - 30, cy); ctxSp.lineTo(cx, cy - 3); ctxSp.lineTo(cx + 30, cy); ctxSp.lineTo(cx, cy + 3);
      ctxSp.closePath(); ctxSp.fill();
      ctxSp.beginPath();
      ctxSp.moveTo(cx, cy - 30); ctxSp.lineTo(cx + 3, cy); ctxSp.lineTo(cx, cy + 30); ctxSp.lineTo(cx - 3, cy);
      ctxSp.closePath(); ctxSp.fill();
      ctxSp.beginPath();
      ctxSp.moveTo(cx - 14, cy - 14); ctxSp.lineTo(cx, cy); ctxSp.lineTo(cx + 14, cy + 14); ctxSp.lineTo(cx, cy);
      ctxSp.closePath(); ctxSp.fill();
      ctxSp.beginPath();
      ctxSp.moveTo(cx - 14, cy + 14); ctxSp.lineTo(cx, cy); ctxSp.lineTo(cx + 14, cy - 14); ctxSp.lineTo(cx, cy);
      ctxSp.closePath(); ctxSp.fill();
    }
    this._texSparkle = new THREE.CanvasTexture(cSpark);

    // 6. Glowing Steam / Ember Particle (64x64)
    const cEmber = document.createElement('canvas');
    cEmber.width = 64; cEmber.height = 64;
    const ctxE = cEmber.getContext('2d');
    if (ctxE) {
      const cx = 32, cy = 32;
      const gE = ctxE.createRadialGradient(cx, cy, 3, cx, cy, 28);
      gE.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      gE.addColorStop(0.35, 'rgba(255, 255, 255, 0.7)');
      gE.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
      gE.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
      ctxE.fillStyle = gE;
      ctxE.beginPath(); ctxE.arc(cx, cy, 28, 0, Math.PI * 2); ctxE.fill();
    }
    this._texEmber = new THREE.CanvasTexture(cEmber);

    // Shared reusable geometries
    this._geomPlane = new THREE.PlaneGeometry(1, 1);
    this._geomPillarOuter = new THREE.CylinderGeometry(0.85, 0.65, 3.8, 32, 1, true);
    this._geomPillarInner = new THREE.CylinderGeometry(0.48, 0.35, 4.2, 24, 1, true);
  }
};

function spawnAuraBurstVfx(scene, position, def) {
  if (!scene || !position || !window.THREE) return;
  const THREE = window.THREE;
  AuraBurstVfxAssets.init(THREE);

  const hex = (def && def.hex) ? def.hex : '#00f0ff';
  const innerHex = (def && def.innerHex) ? def.innerHex : '#ffffff';
  const primaryColor = new THREE.Color(hex);
  const coreColor = new THREE.Color(innerHex);

  const group = new THREE.Group();
  group.name = 'aura_burst_vfx';
  group.position.set(position.x, (position.y != null ? position.y : 0) + 0.04, position.z);
  scene.add(group);

  // 1. Sacred Runic Ground Mandala (expanding & slowly rotating)
  const mandalaMat = new THREE.MeshBasicMaterial({
    map: AuraBurstVfxAssets._texMandala,
    color: primaryColor,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.95
  });
  const mandalaMesh = new THREE.Mesh(AuraBurstVfxAssets._geomPlane, mandalaMat);
  mandalaMesh.rotation.x = -Math.PI / 2;
  group.add(mandalaMesh);

  // 2. Dual Shockwave Rings (sharp ground rings)
  const shockMat1 = new THREE.MeshBasicMaterial({
    map: AuraBurstVfxAssets._texShockwave,
    color: primaryColor,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 1.0
  });
  const shockMesh1 = new THREE.Mesh(AuraBurstVfxAssets._geomPlane, shockMat1);
  shockMesh1.rotation.x = -Math.PI / 2;
  group.add(shockMesh1);

  const shockMat2 = new THREE.MeshBasicMaterial({
    map: AuraBurstVfxAssets._texShockwave,
    color: coreColor,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.0
  });
  const shockMesh2 = new THREE.Mesh(AuraBurstVfxAssets._geomPlane, shockMat2);
  shockMesh2.rotation.x = -Math.PI / 2;
  group.add(shockMesh2);

  // 3. Ascension Pillar (Twin Counter-Rotating Cylinders)
  const pillarOuterMat = new THREE.MeshBasicMaterial({
    map: AuraBurstVfxAssets._texBeam,
    color: primaryColor,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    opacity: 0.8
  });
  const pillarOuterMesh = new THREE.Mesh(AuraBurstVfxAssets._geomPillarOuter, pillarOuterMat);
  pillarOuterMesh.position.y = 1.9;
  group.add(pillarOuterMesh);

  const pillarInnerMat = new THREE.MeshBasicMaterial({
    map: AuraBurstVfxAssets._texBeam,
    color: coreColor,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    opacity: 0.95
  });
  const pillarInnerMesh = new THREE.Mesh(AuraBurstVfxAssets._geomPillarInner, pillarInnerMat);
  pillarInnerMesh.position.y = 2.1;
  group.add(pillarInnerMesh);

  // 4. Anamorphic Core Flare Flash Sprite (NO PointLight → ZERO shader recompile freeze!)
  const flareMat = new THREE.SpriteMaterial({
    map: AuraBurstVfxAssets._texFlare,
    color: coreColor,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 1.0
  });
  const flareSprite = new THREE.Sprite(flareMat);
  flareSprite.position.set(0, 1.15, 0);
  flareSprite.scale.set(0.1, 0.1, 1);
  group.add(flareSprite);

  // 5. Particle Systems: 28 Diamond Sparkles + 14 Rising Steam Embers
  const particles = [];
  const countDiamonds = 28;
  for (let i = 0; i < countDiamonds; i++) {
    const spMat = new THREE.SpriteMaterial({
      map: AuraBurstVfxAssets._texSparkle,
      color: (i % 3 === 0) ? coreColor : primaryColor,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 1.0
    });
    const sp = new THREE.Sprite(spMat);
    const size = 0.25 + Math.random() * 0.35;
    sp.scale.set(size, size, 1);
    const angle = (i / countDiamonds) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const speedH = 1.5 + Math.random() * 2.8;
    const speedV = 1.6 + Math.random() * 3.2;
    sp.position.set(0, 0.4 + Math.random() * 0.5, 0);
    sp.userData = {
      isDiamond: true,
      vx: Math.cos(angle) * speedH,
      vy: speedV,
      vz: Math.sin(angle) * speedH,
      rotSpeed: (Math.random() - 0.5) * 8
    };
    group.add(sp);
    particles.push(sp);
  }

  const countEmbers = 14;
  for (let j = 0; j < countEmbers; j++) {
    const embMat = new THREE.SpriteMaterial({
      map: AuraBurstVfxAssets._texEmber,
      color: primaryColor,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85
    });
    const emb = new THREE.Sprite(embMat);
    const sz = 0.2 + Math.random() * 0.25;
    emb.scale.set(sz, sz, 1);
    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnRadius = 0.3 + Math.random() * 0.8;
    emb.position.set(Math.cos(spawnAngle) * spawnRadius, 0.1 + Math.random() * 0.3, Math.sin(spawnAngle) * spawnRadius);
    emb.userData = {
      isEmber: true,
      vy: 1.8 + Math.random() * 2.0,
      orbitRadius: spawnRadius,
      orbitAngle: spawnAngle,
      orbitSpeed: 2.0 + Math.random() * 3.0
    };
    group.add(emb);
    particles.push(emb);
  }

  // Play Audio immediately
  if (window.GameAudio && typeof window.GameAudio.play === 'function') {
    window.GameAudio.play('potion_drink', group.position);
    window.GameAudio.play('aura_burst', group.position);
  }

  // High-performance 60 FPS animation loop
  const startTime = performance.now();
  const duration = 1200; // ms

  function animBurst() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(1.0, elapsed / duration);

    // Easing curves
    const easeOutCubic = 1 - Math.pow(1 - progress, 3);
    const easeOutQuad = 1 - Math.pow(1 - progress, 2);

    // 1. Sacred Runic Mandala: expands 0.8m -> 3.4m, rotates, smooth fade
    const mandalaScale = 0.8 + easeOutCubic * 2.6;
    mandalaMesh.scale.set(mandalaScale, mandalaScale, 1);
    mandalaMesh.rotation.z = progress * 0.5;
    mandalaMat.opacity = Math.max(0, (1.0 - progress) * 0.95);

    // 2. Shockwave Ring 1 (fast explosive expansion 0.4m -> 4.4m)
    const s1Scale = 0.4 + easeOutQuad * 4.0;
    shockMesh1.scale.set(s1Scale, s1Scale, 1);
    shockMat1.opacity = Math.max(0, (1.0 - progress * 1.8) * 1.0);

    // Shockwave Ring 2 (delayed wave 0.8m -> 5.2m)
    if (progress > 0.08) {
      const p2 = (progress - 0.08) / 0.92;
      const s2Scale = 0.8 + (1 - Math.pow(1 - p2, 2)) * 4.4;
      shockMesh2.scale.set(s2Scale, s2Scale, 1);
      shockMat2.opacity = Math.max(0, (1.0 - p2 * 1.5) * 0.65);
    }

    // 3. Ascension Pillar: shoots up in 120ms, rotates counter-wise, fades by 750ms
    const pillarHeightScale = Math.min(1.0, progress / 0.12);
    const pillarWidthScale = 1.0 + easeOutQuad * 0.6;
    pillarOuterMesh.scale.set(pillarWidthScale, pillarHeightScale, pillarWidthScale);
    pillarOuterMesh.rotation.y += 0.035;
    pillarOuterMat.opacity = Math.max(0, (1.0 - progress * 1.35) * 0.85);

    pillarInnerMesh.scale.set(pillarWidthScale * 0.7, pillarHeightScale * 1.1, pillarWidthScale * 0.7);
    pillarInnerMesh.rotation.y -= 0.045;
    pillarInnerMat.opacity = Math.max(0, (1.0 - progress * 1.8) * 0.95);

    // 4. Anamorphic Flash Starburst at core (instant 0 -> 240ms bloom flash)
    if (progress < 0.22) {
      const flashP = progress / 0.22;
      const fScale = (flashP < 0.35) ? (flashP / 0.35) * 2.8 : (1.0 - (flashP - 0.35) / 0.65) * 2.8;
      flareSprite.scale.set(fScale, fScale, 1);
      flareMat.opacity = Math.max(0, (1.0 - flashP) * 1.0);
    } else {
      flareMat.opacity = 0;
    }

    // 5. Particles Physics (dt = 0.016s)
    const dt = 0.016;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.userData.isDiamond) {
        p.position.x += p.userData.vx * dt;
        p.position.y += p.userData.vy * dt;
        p.position.z += p.userData.vz * dt;
        p.userData.vx *= 0.96; // drag
        p.userData.vz *= 0.96;
        p.userData.vy -= 4.2 * dt; // gravity
        p.material.opacity = Math.max(0, (1.0 - progress * 1.1) * 0.95);
        p.material.rotation += p.userData.rotSpeed * dt;
      } else if (p.userData.isEmber) {
        p.position.y += p.userData.vy * dt;
        p.userData.orbitAngle += p.userData.orbitSpeed * dt;
        p.position.x = Math.cos(p.userData.orbitAngle) * p.userData.orbitRadius;
        p.position.z = Math.sin(p.userData.orbitAngle) * p.userData.orbitRadius;
        p.material.opacity = Math.max(0, (1.0 - progress * 1.05) * 0.85);
      }
    }

    if (progress < 1.0) {
      requestAnimationFrame(animBurst);
    } else {
      // Clean disposal (shared textures & geometries stay preserved in AuraBurstVfxAssets)
      scene.remove(group);
      mandalaMat.dispose();
      shockMat1.dispose();
      shockMat2.dispose();
      pillarOuterMat.dispose();
      pillarInnerMat.dispose();
      flareMat.dispose();
      for (let i = 0; i < particles.length; i++) {
        if (particles[i].material) particles[i].material.dispose();
      }
    }
  }
  requestAnimationFrame(animBurst);
}

window.spawnAuraBurstVfx = spawnAuraBurstVfx;
window.Player = Player;
