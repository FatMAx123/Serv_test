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

  // ---- Эталон: прежняя реализация, линейный перебор ----
  const PR = 0.35;
  function refHits(ax, az, bx, bz, playerY) {
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
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (!p || !PC.isCollidableProp(p)) continue;
      const b = PC.getPropBounds(p);
      if (!b || !b.collision) continue;
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
  for (let i = 0; i < slowN; i++) refHits(px + i * 0.0001, pz, px + 0.8, pz, 1.5);
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

  t.suite('props-collision: проходимый Бастион и Монумент Героя');
  const bastion = props.find(p => p && p.id === 'opt_bastion');
  t.ok(!!bastion, 'Бастион операторов размещён в мире');
  if (bastion) {
    const th0 = (bastion.rotation && bastion.rotation.y) || 0;
    const c0 = Math.cos(th0), s0 = Math.sin(th0);
    const bPt = (lx, lz) => ({ x: bastion.position.x + lx * c0 + lz * s0, z: bastion.position.z - lx * s0 + lz * c0 });
    const floorBase = bastion.position.y + 2.5;
    const pOutside = bPt(0, 18.0), pStep1 = bPt(0, 15.6), pStep2 = bPt(0, 14.8), pStep3 = bPt(0, 14.0);
    const pDoor = bPt(0, 9.1), pHall = bPt(0, -1.0), pDais = bPt(0, -10.25), pWall = bPt(-9.0, 0);
    t.ok(PC.standYAt(pStep1.x, pStep1.z, bastion.position.y + 1.3) != null, 'ступень 1 даёт опору');
    t.ok(Math.abs(PC.standYAt(pStep3.x, pStep3.z, floorBase) - (bastion.position.y + 2.2)) < 0.05, 'ступень 3 ниже пола зала на 0.30 м');
    t.ok(Math.abs(PC.standYAt(pHall.x, pHall.z, floorBase) - floorBase) < 0.05, 'внутри зала есть проходимый пол');
    t.ok(Math.abs(PC.standYAt(pDais.x, pDais.z, floorBase + 0.3) - (floorBase + 0.3)) < 0.05, 'на подиуме Командора пол +0.30 м');
    t.eq(PC.hitsPropXZ(pOutside.x, pOutside.z, pStep1.x, pStep1.z, bastion.position.y + 1.8), false, 'подъём на 1-ю ступень не заблокирован');
    t.eq(PC.hitsPropXZ(pStep3.x, pStep3.z, pDoor.x, pDoor.z, bastion.position.y + 2.65), false, 'проход через открытые ворота в зал свободен');
    t.eq(PC.hitsPropXZ(pHall.x, pHall.z, pDais.x, pDais.z, floorBase + 0.5), false, 'передвижение внутри зала к подиуму свободно');
    t.eq(PC.hitsPropXZ(pHall.x, pHall.z, pWall.x, pWall.z, floorBase + 0.5), true, 'боковая стена Бастиона останавливает игрока');
  }
  const altarLeft = props.find(p => p && (p.modelId === 'opt_altar' || p.id.startsWith('opt_altar')));
  t.eq(altarLeft, undefined, 'религиозная/магическая модель святилища (opt_altar) полностью удалена');
  const heroMon = props.find(p => p && p.modelId === 'opt_hero_monument');
  t.ok(!!heroMon, 'Монумент Героя размещён вместо святилища');
  const dummies = props.filter(p => p && p.modelId === 'opt_dummy');
  t.ok(dummies.length >= 8, 'на полигоне во дворе расставлены тренировочные манекены', 'шт: ' + dummies.length);
};
