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
      const midX = (ax + bx) * 0.5, midZ = (az + bz) * 0.5;
      if (Math.hypot(midX - b.px, midZ - b.pz) > b.maxRadius + PR + 1.0) continue;
      const cos = Math.cos(-b.rotY), sin = Math.sin(-b.rotY);
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
      const cos = Math.cos(-b.rotY), sin = Math.sin(-b.rotY);
      const dx = x - b.px, dz = z - b.pz;
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      if (b.shape === 'cylinder') {
        if (lx * lx + lz * lz <= b.halfX * b.halfX) {
          const top = b.py + b.height;
          if (py >= b.py - 0.2 && top > (bestY == null ? -Infinity : bestY)) bestY = top;
        }
      } else if (Math.abs(lx) <= b.halfX && Math.abs(lz) <= b.halfZ) {
        const top = b.py + b.height;
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
};
