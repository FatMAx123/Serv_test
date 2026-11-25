// ============================================================
//  TESTS / PROPS-COLLISION.TEST.JS — коллизии пропсов.
//  Регресс: hitsPropXZ и standYAt линейно перебирали все 576 пропсов мира,
//  на каждом вызывая isCollidableProp + getPropBounds, а внутри —
//  PropsLibrary.getById с линейным find по 363 записям каталога.
//  Замер: 6.0 мс на вызов; при упоре в препятствие player._maxFreeStep делает
//  10 бисекций, camera3d._clipPropsDist — ещё 7 каждый кадр → до ~50 мс/кадр.
//  Тест проверяет и корректность (полная эквивалентность прежней логике), и
//  что линейный перебор не вернулся.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));

module.exports = function (t) {
  // Те же данные, что у клиента и сервера: позиции пропсов задаёт редактор.
  try {
    const f = path.join(ROOT, 'shared', 'editor-overrides.json');
    if (fs.existsSync(f)) WM.applyEditorOverrides(JSON.parse(fs.readFileSync(f, 'utf8')));
  } catch (e) { /* ignore */ }
  globalThis.WorldMetrics = WM;
  const PL = require(path.join(ROOT, 'client', 'js', 'props-library-data.js'));
  globalThis.PropsLibrary = PL;
  const PC = require(path.join(ROOT, 'client', 'js', 'props-collision.js'));
  const props = WM.CUSTOM_PROPS;

  t.suite('props-library: индекс каталога');
  t.ok(PL.getById('forest_Stump_2'), 'поиск по id');
  t.ok(PL.getById('Stump_2.fbx'), 'поиск по имени файла');
  t.ok(PL.getById('Stump_2'), 'поиск по имени файла без расширения');
  t.eq(PL.getById('нет_такого'), null, 'неизвестный id → null');
  t.eq(PL.getById(null), null, 'null → null');
  t.eq(PL.getById('__proto__'), null, 'prototype-ключ не запись каталога');
  // Индекс должен быть на порядки быстрее find по 363 записям
  const catN = 50000;
  const tCat0 = process.hrtime.bigint();
  for (let i = 0; i < catN; i++) PL.getById('forest_Stump_2');
  const catUs = Number(process.hrtime.bigint() - tCat0) / 1e3 / catN;
  t.ok(catUs < 1, 'getById быстрее 1 мкс (Map, а не линейный find)', catUs.toFixed(3) + ' мкс');

  t.suite('props-collision: индекс мира');
  const st = PC.stats();
  t.ok(st.bounds > 0 && st.bounds < props.length, 'в индексе только коллизионные пропсы',
    st.bounds + ' из ' + props.length);
  t.ok(st.cells > 0, 'spatial hash заполнен', 'ячеек: ' + st.cells);
  t.ok(PC.CELL_SIZE >= 4 && PC.CELL_SIZE <= 64, 'разумный размер ячейки', PC.CELL_SIZE + ' м');

  // ---- Эталон: прежняя реализация, линейный перебор (кешируем список bounds на один проход для эквивалентности) ----
  const PR = 0.35;
  function collectRefBounds() {
    const out = [];
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (!p || !PC.isCollidableProp(p)) continue;
      const b = PC.getPropBounds(p);
      if (b && b.collision) out.push(b);
    }
    return out;
  }
  let cachedRefBounds = collectRefBounds();
  function refHits(ax, az, bx, bz, playerY) {
    const py = (typeof playerY === 'number') ? playerY : 1.0;
    for (let i = 0; i < cachedRefBounds.length; i++) {
      const b = cachedRefBounds[i];
      const topY = b.py + b.height;
      if (py < b.py - 0.4 || py > topY + 0.3) continue;
      if (b.isWalkableSurface) {
        if (py >= topY - 0.45) continue;
        if (py + 1.8 <= b.py + 0.25) continue;
      }
      const midX = (ax + bx) * 0.5, midZ = (az + bz) * 0.5;
      if (Math.hypot(midX - b.px, midZ - b.pz) > b.maxRadius + PR + 1.0) continue;
      const cos = Math.cos(b.rotY), sin = Math.sin(b.rotY);
      const hx = b.halfX + PR, hz = b.halfZ + PR;
      for (let s = 0; s <= 4; s++) {
        const tt = s / 4;
        const sx = ax + (bx - ax) * tt, sz = az + (bz - az) * tt;
        const dx = sx - b.px, dz = sz - b.pz;
        const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
        if (b.shape === 'cylinder') {
          const r = b.halfX + PR;
          if (lx * lx + lz * lz <= r * r) return true;
        } else if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) return true;
      }
    }
    return false;
  }
  function refHitsUnindexed(ax, az, bx, bz, playerY) {
    const py = (typeof playerY === 'number') ? playerY : 1.0;
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (!p || !PC.isCollidableProp(p)) continue;
      const b = PC.getPropBounds(p);
      if (!b || !b.collision) continue;
      const topY = b.py + b.height;
      if (py < b.py - 0.4 || py > topY + 0.3) continue;
      if (b.isWalkableSurface) {
        if (py >= topY - 0.45) continue;
        if (py + 1.8 <= b.py + 0.25) continue;
      }
      const midX = (ax + bx) * 0.5, midZ = (az + bz) * 0.5;
      if (Math.hypot(midX - b.px, midZ - b.pz) > b.maxRadius + PR + 1.0) continue;
      const cos = Math.cos(b.rotY), sin = Math.sin(b.rotY);
      const hx = b.halfX + PR, hz = b.halfZ + PR;
      for (let s = 0; s <= 4; s++) {
        const tt = s / 4;
        const sx = ax + (bx - ax) * tt, sz = az + (bz - az) * tt;
        const dx = sx - b.px, dz = sz - b.pz;
        const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
        if (b.shape === 'cylinder') {
          const r = b.halfX + PR;
          if (lx * lx + lz * lz <= r * r) return true;
        } else if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) return true;
      }
    }
    return false;
  }
  function refStandY(x, z, playerY) {
    const py = (typeof playerY === 'number') ? playerY : 1.0;
    let bestY = null;
    for (let i = 0; i < cachedRefBounds.length; i++) {
      const b = cachedRefBounds[i];
      const cos = Math.cos(b.rotY), sin = Math.sin(b.rotY);
      const dx = x - b.px, dz = z - b.pz;
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      const top = b.py + b.height;
      const hit = b.shape === 'cylinder'
        ? (lx * lx + lz * lz <= b.halfX * b.halfX)
        : (Math.abs(lx) <= b.halfX && Math.abs(lz) <= b.halfZ);
      if (!hit) continue;
      if (b.isWalkableSurface) {
        if (py >= b.py - 0.4 && (bestY == null || Math.abs(py - top) < Math.abs(py - bestY))) bestY = top;
      } else {
        if (py >= b.py - 0.2 && top > (bestY == null ? -Infinity : bestY)) bestY = top;
      }
    }
    return bestY;
  }

  t.suite('props-collision: эквивалентность прежней логике');
  const collidable = props.filter(p => PC.isCollidableProp(p));
  let checked = 0, hitsDiff = 0, standDiff = 0, hitsTrue = 0, standNonNull = 0;
  const diffSamples = [];
  for (const p of collidable) {
    const pos = p.position || { x: 0, y: 0, z: 0 };
    for (let dx = -6; dx <= 6; dx += 2) {
      for (let dz = -6; dz <= 6; dz += 2) {
        const ax = pos.x + dx, az = pos.z + dz;
        const bx = ax + 0.8, bz = az + 0.3;
        const py = (pos.y || 0) + 1.5;
        const a1 = PC.hitsPropXZ(ax, az, bx, bz, py);
        const b1 = refHits(ax, az, bx, bz, py);
        if (a1 !== b1) {
          hitsDiff++;
          if (diffSamples.length < 3) diffSamples.push('hits ' + p.id + ' new=' + a1 + ' ref=' + b1);
        }
        if (b1) hitsTrue++;
        const a2 = PC.standYAt(ax, az, py);
        const b2 = refStandY(ax, az, py);
        const same = (a2 == null && b2 == null) || (a2 != null && b2 != null && Math.abs(a2 - b2) < 1e-9);
        if (!same) {
          standDiff++;
          if (diffSamples.length < 3) diffSamples.push('standY ' + p.id + ' new=' + a2 + ' ref=' + b2);
        }
        if (b2 != null) standNonNull++;
        checked++;
      }
    }
  }
  t.ok(hitsTrue > 100 && standNonNull > 50, 'выборка покрывает попадания, а не только пустоту',
    'точек ' + checked + ', попаданий ' + hitsTrue + ', standY≠null ' + standNonNull);
  t.eq(hitsDiff, 0, 'hitsPropXZ совпадает с линейным перебором на всей выборке',
    diffSamples.join(' | '));
  t.eq(standDiff, 0, 'standYAt совпадает с линейным перебором на всей выборке');

  // Случайные запросы по всему миру, включая высоты вне пропсов
  let randDiff = 0;
  let seed = 987654321;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 3000; i++) {
    const ax = -1850 + rnd() * 3700, az = -1850 + rnd() * 3700;
    const bx = ax + (rnd() - 0.5) * 4, bz = az + (rnd() - 0.5) * 4;
    const py = rnd() * 45 - 5;
    if (PC.hitsPropXZ(ax, az, bx, bz, py) !== refHits(ax, az, bx, bz, py)) randDiff++;
    const s1 = PC.standYAt(ax, az, py), s2 = refStandY(ax, az, py);
    const same = (s1 == null && s2 == null) || (s1 != null && s2 != null && Math.abs(s1 - s2) < 1e-9);
    if (!same) randDiff++;
  }
  t.eq(randDiff, 0, '3000 случайных запросов по миру без расхождений');

  t.suite('props-collision: производительность');
  // Плотная застройка деревни — худший реальный случай
  const px = -138, pz = -156;
  const warm = () => PC.hitsPropXZ(px, pz, px + 0.8, pz, 1.5);
  warm();
  const fastN = 20000;
  const tf0 = process.hrtime.bigint();
  for (let i = 0; i < fastN; i++) PC.hitsPropXZ(px + i * 0.0001, pz, px + 0.8, pz, 1.5);
  const fastMs = Number(process.hrtime.bigint() - tf0) / 1e6 / fastN;
  const slowN = 200;
  const ts0 = process.hrtime.bigint();
  for (let i = 0; i < slowN; i++) refHitsUnindexed(px + i * 0.0001, pz, px + 0.8, pz, 1.5);
  const slowMs = Number(process.hrtime.bigint() - ts0) / 1e6 / slowN;
  t.ok(fastMs * 20 < slowMs, 'быстрее линейного перебора минимум ×20',
    slowMs.toFixed(3) + ' мс → ' + fastMs.toFixed(4) + ' мс (×' + Math.round(slowMs / fastMs) + ')');
  // 18 вызовов — худший кадр (10 бисекций шага + 7 клипов камеры + запас)
  t.ok(fastMs * 18 < 1.0, 'худший кадр укладывается в 1 мс',
    (fastMs * 18).toFixed(3) + ' мс на 18 вызовов');
  const tsy0 = process.hrtime.bigint();
  for (let i = 0; i < fastN; i++) PC.standYAt(px + i * 0.0001, pz, 1.5);
  const standMs = Number(process.hrtime.bigint() - tsy0) / 1e6 / fastN;
  t.ok(standMs < 0.05, 'standYAt быстрее 0.05 мс', standMs.toFixed(4) + ' мс');

  t.suite('props-collision: инвалидация индекса');
  const probe = { x: 640, z: 640 };
  const before = PC.hitsPropXZ(probe.x, probe.z, probe.x + 1, probe.z, 1.5);
  t.eq(before, false, 'в пустой области попадания нет');
  props.push({
    id: 'prop_test_collision_box',
    meshType: 'collision_box',
    position: { x: probe.x + 0.5, y: 0, z: probe.z },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    collisionSize: { x: 4, y: 4, z: 4 }
  });
  t.eq(PC.hitsPropXZ(probe.x, probe.z, probe.x + 1, probe.z, 1.5), true,
    'добавленный проп виден сразу (индекс следит за длиной массива)');
  t.ok(PC.standYAt(probe.x + 0.5, probe.z, 1.5) != null, 'standYAt видит новый проп');
  props.pop();
  PC.invalidate();
  t.eq(PC.hitsPropXZ(probe.x, probe.z, probe.x + 1, probe.z, 1.5), false,
    'после удаления и invalidate() попадание исчезло');
  // Замена массива целиком (WM.CUSTOM_PROPS = […]) тоже должна ловиться
  const saved = props.slice();
  WM.CUSTOM_PROPS = [];
  t.eq(PC.hitsPropXZ(px, pz, px + 0.8, pz, 1.5), false, 'пустой мир → нет коллизий');
  WM.CUSTOM_PROPS = saved;
  t.eq(PC.hitsPropXZ(px, pz, px + 0.8, pz, 1.5), refHits(px, pz, px + 0.8, pz, 1.5),
    'возврат массива восстанавливает коллизии');

  // Ящик коллизии поворачивается так же, как модель (THREE.Object3D.rotation.y):
  // локальная ось X модели при rotY = θ смотрит в мир (cos θ, −sin θ).
  t.suite('props-collision: поворот как у three.js');
  const rotY = 0.6;
  const ox = 900, oz = 900;
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const live = WM.CUSTOM_PROPS; // выше массив заменяли целиком — берём текущий
  live.push({
    id: 'prop_test_rotated_wall',
    meshType: 'collision_box',
    position: { x: ox, y: 0, z: oz },
    rotation: { x: 0, y: rotY, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    // длинная тонкая стена 12 × 1 м со смещением 2 м вдоль своей оси X
    collisionSize: { x: 12, y: 4, z: 1 },
    collisionOffset: { x: 2, y: 0, z: 0 }
  });
  PC.invalidate();
  const along = (d) => ({ x: ox + (2 + d) * c, z: oz - (2 + d) * s });   // точка на оси стены
  const across = (d) => ({ x: ox + 2 * c + d * s, z: oz - 2 * s + d * c }); // поперёк стены
  const a1 = along(5.5);
  t.eq(PC.standYAt(a1.x, a1.z, 1.5) != null, true, 'конец стены (5.5 м по её оси) внутри ящика');
  const a2 = along(-5.5);
  t.eq(PC.standYAt(a2.x, a2.z, 1.5) != null, true, 'другой конец стены внутри ящика');
  const b1 = across(2.0);
  t.eq(PC.standYAt(b1.x, b1.z, 1.5), null, 'в 2 м поперёк стены — свободно');
  // зеркальный поворот (старая ошибка) поставил бы стену по оси (cos θ, +sin θ)
  const m1 = { x: ox + 7 * c, z: oz + 7 * s };
  t.eq(PC.standYAt(m1.x, m1.z, 1.5), null, 'зеркальное положение стены — свободно');
  live.pop();
  PC.invalidate();

  t.suite('props-collision: проходимый Бастион, террасы и Монумент Героя');
  const bastion = props.find(p => p && p.id === 'opt_bastion');
  t.ok(!!bastion, 'Бастион операторов размещён в мире');
  if (bastion) {
    const th0 = (bastion.rotation && bastion.rotation.y) || 0;
    const c0 = Math.cos(th0), s0 = Math.sin(th0);
    const bPt = (lx, lz) => ({ x: bastion.position.x + lx * c0 + lz * s0, z: bastion.position.z - lx * s0 + lz * c0 });
    const floorBase = bastion.position.y + 2.72; // y0=0.22 + PLINTH_TOP=2.50
    const pDeckT1 = bPt(0, 20.0);
    const pStep0 = bPt(0, 16.71), pStep5 = bPt(0, 12.62);
    const pDoor = bPt(0, 9.1), pHall = bPt(0, -1.0), pDais = bPt(0, -11.5), pWall = bPt(-9.0, 0);
    const t1Y = PC.standYAt(pDeckT1.x, pDeckT1.z, bastion.position.y + 1.5);
    t.ok(t1Y != null && Math.abs(t1Y - (bastion.position.y + 1.18)) < 0.08, 'верхняя терраса плаца смыкается с бастионом', 't1Y=' + t1Y);
    t.ok(Math.abs(PC.standYAt(pStep0.x, pStep0.z, t1Y + 0.5) - (bastion.position.y + 1.37)) < 0.05, 'ступень 0 даёт +0.19 м');
    t.ok(Math.abs(PC.standYAt(pStep5.x, pStep5.z, floorBase - 0.15) - (bastion.position.y + 2.495)) < 0.05, 'ступень 5 ниже пола зала на 0.225 м');
    t.ok(Math.abs(PC.standYAt(pHall.x, pHall.z, floorBase) - floorBase) < 0.05, 'внутри зала есть проходимый пол');
    t.ok(Math.abs(PC.standYAt(pDais.x, pDais.z, floorBase + 0.3) - (floorBase + 0.3)) < 0.05, 'на подиуме Командора пол +0.30 м');
    t.eq(PC.hitsPropXZ(pDeckT1.x, pDeckT1.z, pStep0.x, pStep0.z, t1Y + 0.5), false, 'подъём с площади на ступень 0 свободен');
    t.eq(PC.hitsPropXZ(pStep5.x, pStep5.z, pDoor.x, pDoor.z, floorBase + 0.5), false, 'подъём со ступени 5 через открытые ворота свободен');
    t.eq(PC.hitsPropXZ(pHall.x, pHall.z, pDais.x, pDais.z, floorBase + 0.5), false, 'передвижение внутри зала к подиуму свободно');
    t.eq(PC.hitsPropXZ(pHall.x, pHall.z, pWall.x, pWall.z, floorBase + 0.5), true, 'боковая стена Бастиона останавливает игрока');

    // Мелкие пропсы (скамейки, наковальни, точило, паллеты, фонари, баки, проломы плаца, руинный бой) БЕЗ коллизий — игрок свободно проходит!
    const smallIds = new Set([
      'opt_bench_camp', 'opt_chair', 'opt_heavy_anvil', 'opt_steam_grinder', 'opt_bookstand',
      'opt_chest', 'opt_cargo_pallet', 'opt_boulder_s', 'opt_signpost',
      'opt_debris', 'opt_lamp', 'opt_steam_brazier', 'opt_copper_tanks',
      'opt_plaza_breach', 'opt_ruin_archway_fallen',
      'opt_ruin_rubble_a', 'opt_ruin_rubble_b', 'opt_rubble_pile'
    ]);
    const collidingSmall = props.find(p => p && (smallIds.has(p.modelId) || /^bazaar\//.test(p.modelFile || '')) && p.collision === true);
    t.eq(collidingSmall, undefined, 'все мелкие пропсы не имеют коллизии и не цепляют игрока', collidingSmall && collidingSmall.id);
    const bench = props.find(p => p && p.id === 'opt_bench_camp_05') || props.find(p => p && p.modelId === 'opt_bench_camp');
    t.ok(!!bench, 'скамейка лагеря найдена для теста прохода');
    if (bench) {
      const bY = bench.position.y + 0.5;
      t.eq(PC.hitsPropXZ(bench.position.x - 0.55, bench.position.z - 0.55, bench.position.x + 0.55, bench.position.z + 0.55, bY), false,
        'скамейка свободно проходима игроком без коллизии');
    }

    // Путь на Мемориальную террасу с Монументом Героя (западный склон / арка) проходим
    const pMemStep = bPt(-24.2, 37.2), pMemDeck = bPt(-30.5, 37.2);
    t.ok(PC.standYAt(pMemStep.x, pMemStep.z, (t1Y || 87.6) + 0.8) != null, 'ступень на Мемориальную террасу даёт опору');
    t.ok(PC.standYAt(pMemDeck.x, pMemDeck.z, (t1Y || 87.6) + 1.2) > (t1Y || 87.6) + 0.7, 'Мемориальная терраса выше на 0.90 м');

    // Гео-движок GEO.moveAlong (серверная физика шага) проходит всю лестницу Бастиона без отката!
    const gEnv = globalThis;
    if (!gEnv.window) gEnv.window = gEnv;
    if (!gEnv.TerrainData) {
      new Function('window', fs.readFileSync(path.join(ROOT, 'client', 'js', 'terrain-data.js'), 'utf8'))(gEnv.window);
      gEnv.TerrainData = gEnv.window.TerrainData;
    }
    const TH = require(path.join(ROOT, 'client', 'js', 'terrain-height.js'));
    gEnv.TerrainHeight = TH;
    gEnv.PropsCollision = PC;
    const GEO = require(path.join(ROOT, 'shared', 'geo.js'));
    GEO.bind({ TerrainData: gEnv.TerrainData, TerrainHeight: TH, PropsCollision: PC, WorldMetrics: WM });
    const gStart = bPt(0, 21.0);
    const walkRoute = [bPt(0, 17.5), bPt(0, 15.8), bPt(0, 14.1), bPt(0, 12.5), bPt(0, 10.5), bPt(0, 2.0), bPt(0, -10.5)];
    let cur = { x: gStart.x, z: gStart.z, y: GEO.standY(gStart.x, gStart.z) };
    let geoBlocked = false;
    for (const wp of walkRoute) {
      for (let sub = 0; sub < 8; sub++) {
        const dx = wp.x - cur.x, dz = wp.z - cur.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) break;
        const step = Math.min(d, 0.8);
        const r = GEO.moveAlong(cur.x, cur.z, cur.x + dx / d * step, cur.z + dz / d * step, cur.y);
        cur = { x: r.x, z: r.z, y: r.y };
        if (r.blocked) { geoBlocked = true; break; }
      }
      if (geoBlocked) break;
    }
    t.eq(geoBlocked, false, 'серверный GEO.moveAlong проходит от плаца по лестнице внутрь зала и к подиуму без отката',
      'финал: (' + cur.x.toFixed(1) + ',' + cur.z.toFixed(1) + ') y=' + cur.y.toFixed(2));
    t.ok(Math.abs(GEO.standY(pHall.x, pHall.z) - floorBase) < 0.1, 'логин/телепорт внутрь зала без Y корректно ставит на пол зала');

    // Сквозной подъём с грунта у южного входа через opt_gate_steps -> Tier 2 -> Tier 1
    const gateStart = bPt(0, 78.5);
    const gateRoute = [bPt(0, 74.8), bPt(0, 72.0), bPt(0, 69.0), bPt(0, 62.0), bPt(0, 53.5), bPt(0, 51.3), bPt(0, 48.0), bPt(0, 35.0)];
    let gCur = { x: gateStart.x, z: gateStart.z, y: GEO.standY(gateStart.x, gateStart.z) };
    let gateBlocked = false;
    for (const wp of gateRoute) {
      for (let sub = 0; sub < 14; sub++) {
        const dx = wp.x - gCur.x, dz = wp.z - gCur.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) break;
        const step = Math.min(d, 0.75);
        const r = GEO.moveAlong(gCur.x, gCur.z, gCur.x + dx / d * step, gCur.z + dz / d * step, gCur.y);
        gCur = { x: r.x, z: r.z, y: r.y };
        if (r.blocked) { gateBlocked = true; break; }
      }
      if (gateBlocked) break;
    }
    t.eq(gateBlocked, false, 'серверный GEO.moveAlong проходит южную входную лестницу, Tier 2 и Tier 1 без отброса назад',
      'финал: y=' + gCur.y.toFixed(2));
  }
  const altarLeft = props.find(p => p && (p.modelId === 'opt_altar' || p.id.startsWith('opt_altar')));
  t.eq(altarLeft, undefined, 'религиозная/магическая модель святилища (opt_altar) полностью удалена');
  const fenceLeft = props.find(p => p && p.modelId === 'opt_palisade');
  t.eq(fenceLeft, undefined, 'деревенские заборчики (opt_palisade) заменены крепостными парапетами');
  const standLeft = props.find(p => p && p.modelId === 'opt_banner_stand');
  t.eq(standLeft, undefined, 'отдельно стоящие висящие штандарты (opt_banner_stand) заменены креплениями на колоннах и стенах');
  const heroMon = props.find(p => p && p.modelId === 'opt_hero_monument');
  t.ok(!!heroMon, 'Монумент Героя размещён вместо святилища');
  const heroReg = WM.regionAt(heroMon.position.x, heroMon.position.z);
  t.ok(heroReg && heroReg.peace === true, 'Монумент Героя находится внутри мирной зоны Базы операторов', heroReg && heroReg.name);
  const dummies = props.filter(p => p && p.modelId === 'opt_dummy');
  t.ok(dummies.length >= 8, 'на полигоне во дворе расставлены тренировочные манекены', 'шт: ' + dummies.length);
  const steamPieces = props.filter(p => p && /^opt_(boiler|pipe|steam|forge|copper)/.test(p.modelId || ''));
  t.ok(steamPieces.length >= 12, 'на Базе и в Бастионе развёрнута стимпанк-сеть медных труб и котлов', 'шт: ' + steamPieces.length);

  // Проверка 0: ни один NPC Операторов не стоит на столе/стуле/мебели!
  const furnBoxes = (PC.BOXES || []).filter(b => /table|chair|bench|crate|chest|book/i.test(String(b.id || '')));
  for (const n of (WM.REGION_NPCS || []).filter(x => /^op_/.test(x.id))) {
    const nx = WM.wx(n.np[0]), nz = WM.wz(n.np[1]);
    const hit = furnBoxes.find(b => {
      const dx = nx - b.x, dz = nz - b.z;
      const c = b.cos != null ? b.cos : 1, s = b.sin != null ? b.sin : 0;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      return Math.abs(lx) < (b.hw || 0) + 0.12 && Math.abs(lz) < (b.hd || 0) + 0.12;
    });
    t.eq(hit, undefined, n.id + ' стоит на чистом полу, не на мебели', hit && hit.id);
  }

  // Проверка 1: нулевой нахлёст плит каменных террас opt_plaza_deck* (0 z-fighting!)
  const decks = props.filter(p => p && /^opt_plaza_deck/.test(p.modelId || ''));
  let deckOverlap = null;
  for (let i = 0; i < decks.length && !deckOverlap; i++) {
    for (let j = i + 1; j < decks.length; j++) {
      const a = decks[i].position, b = decks[j].position;
      if (Math.abs(a.y - b.y) < 0.05) {
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < 7.95) { deckOverlap = decks[i].id + ' vs ' + decks[j].id + ' d=' + d.toFixed(2); break; }
      }
    }
  }
  t.eq(deckOverlap, null, 'плиты каменной террасы opt_plaza_deck* уложены без перекрытия и z-fighting');

  // Проверка 2: без эмблемного спама + логичная разреженная тропа + замкнутые BioShock-магистрали
  t.eq(props.filter(p => p && p.modelId === 'opt_banner_wall').length, 0, 'лишние квадратные гербы (opt_banner_wall) заменены вымпелами без спама');
  const slabCount = props.filter(p => p && p.modelId === 'opt_slab').length;
  t.ok(slabCount >= 12 && slabCount <= 40, 'разреженная изогнутая тропа из плит (opt_slab) без коридора-ограды', 'шт: ' + slabCount);
  t.ok(props.filter(p => p && /^opt_pipe_(bridge_east|wall_manifold|ground_riser|arch_ground)$/.test(p.modelId || '')).length >= 8, 'установлены гладкие медные трубы (0 децимации) из земли и вдоль котельной');

  // Проверка 3: удаление розовых палаток/кровельного хлама/серой ткани/мелкого спама + уникальные объекты Blender + чистые коллизии
  const removedIds = [
    'opt_ruin_house_shell', 'opt_ruin_house_gable', 'opt_brick_rubble',
    'opt_ruin_chimney', 'opt_ruin_wood_arch', 'opt_rock_crag_a', 'opt_rock_crag_b',
    'opt_ruin_stair', 'opt_boiler_unit', 'opt_roof_vent', 'opt_ruin_vault',
    'opt_wall_stone', 'opt_work_light', 'opt_switch_box', 'opt_gas_cylinder', 'opt_steam_condenser',
    'opt_bench_grinder', 'opt_pipe_arch', 'opt_pipe_mega_bend', 'opt_pipe_riser_big',
    'opt_pipe_trench_run', 'opt_pipe_straight', 'opt_pipe_vertical', 'xdhhddo',
    'opt_anvil', 'opt_whetstone', 'opt_workbench', 'opt_barrel', 'opt_crate', 'opt_crate_iron',
    'opt_cable_drum', 'opt_sack_grain', 'opt_wreck_wagon', 'opt_wreck_pushcart',
    'opt_cart_wheel', 'opt_wheelbarrow',
    'xdhhdfp', 'xf0kahv', 'xfxibbe', 'yccqdcq', 'yexjfhk', 'wlkiecl', 'tltvai3fa'
  ];
  for (const rid of removedIds) {
    t.eq(props.filter(p => p && (p.modelId === rid || p.modelFile === 'bazaar/' + rid + '.glb')).length, 0, 'удалённый/устаревший модуль отсутствует в мире: ' + rid);
  }
  for (const rglb of [
    'opt_boiler_unit', 'opt_roof_vent', 'opt_ruin_vault', 'opt_pipe_mega_bend',
    'opt_work_light', 'opt_switch_box', 'opt_gas_cylinder',
    'opt_anvil', 'opt_whetstone', 'opt_workbench', 'opt_barrel', 'opt_crate', 'opt_crate_iron',
    'opt_cable_drum', 'opt_sack_grain', 'opt_wreck_wagon', 'opt_wreck_pushcart',
    'opt_cart_wheel', 'opt_wheelbarrow', 'opt_wall_stone'
  ]) {
    t.eq(fs.existsSync(path.join(ROOT, 'client', 'assets', 'props', 'operators', rglb + '.glb')), false, 'удалённый файл не оставлен в operators/: ' + rglb);
  }
  t.ok(props.filter(p => p && p.modelId === 'opt_ruin_long').length <= 2, 'стены opt_ruin_long не заспамлены по периметру');
  t.eq(props.filter(p => p && p.modelId === 'opt_block').length, 0, 'одиночные кубики opt_block не заспамлены по карте');
  const outIds = [
    'opt_gate_steps',
    'opt_plaza_deck_cracked', 'opt_plaza_deck_scorched', 'opt_plaza_breach', 'opt_ruin_archway_fallen',
    'opt_heavy_workbench', 'opt_heavy_anvil', 'opt_steam_grinder', 'opt_cargo_pallet',
    'opt_wreck_steam_wagon', 'opt_wreck_caisson',
    'opt_ruin_tower', 'opt_ruin_bridge', 'opt_ruin_gear_wreck', 'opt_ruin_crater',
    'opt_ruin_gate_pylon', 'opt_ruin_viaduct_east', 'opt_ruin_foundry_shell',
    'opt_ruin_wall_breach', 'opt_ruin_wall_buttress', 'opt_ruin_wall_colonnade',
    'opt_ruin_crane_wreck', 'opt_ruin_boiler_wreck',
    'opt_ruin_smokestack', 'opt_ruin_vault_arch', 'opt_ruin_barracks_corner',
    'opt_ruin_aqueduct_pier', 'opt_ruin_turbine_pit', 'opt_ruin_watchpost',
    'opt_ruin_bastion_prow', 'opt_ruin_pipe_tangle',
    'opt_steam_boiler_tower', 'opt_steam_dynamo', 'opt_steam_cistern', 'opt_forge_hearth',
    'opt_dead_tree_a', 'opt_dead_tree_b',
    'opt_boulder_s', 'opt_boulder_m', 'opt_boulder_l'
  ];
  for (const oid of outIds) {
    t.ok(props.some(p => p && p.modelId === oid), 'в мире размещён уникальный объект ' + oid);
  }
  t.eq(props.filter(p => p && /^bazaar\//.test(p.modelFile || '')).length, 0, 'кукольные пропсы bazaar/*.glb полностью удалены из мира');
  const opMobSpots = (WM.MOB_SPOTS || []).filter(m => m && m.p);
  const outSet = new Set(outIds);
  let mobOverlap = null;
  for (const p of props) {
    if (!p || !outSet.has(p.modelId) || !p.position) continue;
    for (const m of opMobSpots) {
      const mx = WM.wx(m.p[0]), mz = WM.wz(m.p[1]);
      const d = Math.hypot(p.position.x - mx, p.position.z - mz);
      if (d < 5.5) { mobOverlap = p.id + ' -> mob(' + mx.toFixed(1) + ',' + mz.toFixed(1) + ') d=' + d.toFixed(2); break; }
    }
    if (mobOverlap) break;
  }
  t.eq(mobOverlap, null, 'руины, обломки и сухие деревья не перекрывают точки спавна мобов');
  const atlasPath = path.join(ROOT, 'client', 'assets', 'props', 'textures', 'opt_atlas.webp');
  t.ok(fs.existsSync(atlasPath) && fs.statSync(atlasPath).size > 80000, 'opt_atlas.webp собран (> 80 КБ)');
  const ruinsAtlasPath = path.join(ROOT, 'client', 'assets', 'props', 'textures', 'opt_ruins_atlas.webp');
  t.ok(fs.existsSync(ruinsAtlasPath) && fs.statSync(ruinsAtlasPath).size > 50000, 'opt_ruins_atlas.webp собран (> 50 КБ)');
};
