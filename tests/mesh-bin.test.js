// PLAN 4.7: бинарный меш декодируется в тот же объект, что JS-дамп.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const MeshBin = require(path.join(ROOT, 'client', 'js', 'mesh-bin.js'));

module.exports = function (t) {
  t.suite('mesh-bin: terrain');
  const binPath = path.join(ROOT, 'client', 'data', 'mesh', 'terrain.bin');
  t.ok(fs.existsSync(binPath), 'terrain.bin на месте');
  const D = MeshBin.loadFileSync(fs, binPath);
  t.ok(D && D.positions && D.indices, 'есть positions/indices');
  t.eq(D.positions.length, 72822, 'длина positions как у JS-дампа');
  t.eq(D.indices.length, 143958, 'длина indices как у JS-дампа');
  t.eq(D.bakedW, 256, 'bakedW');
  t.eq(D.gridWidth, 256, 'gridWidth');
  t.ok(D.positions[0] > 1700 && D.positions[0] < 1900, 'первая вершина в мире');

  t.ok(D.indices instanceof Uint32Array, 'terrain.indices декодирован как Uint32Array для WebGL');

  t.suite('mesh-bin: volcano / mountains');
  const V = MeshBin.loadFileSync(fs, path.join(ROOT, 'client', 'data', 'mesh', 'volcano.bin'));
  t.ok(V.lod1 && V.lod1.positions && V.lod1.positions.length > 100, 'вулкан lod1');
  t.ok(V.indices instanceof Uint32Array, 'volcano.indices — Uint32Array');
  const M = MeshBin.loadFileSync(fs, path.join(ROOT, 'client', 'data', 'mesh', 'mountains.bin'));
  t.ok(M.pieces && M.pieces.length >= 9, 'горы: куски гребней');
  t.ok(M.lod2 && M.lod2.indices && M.lod2.indices.length > 100, 'горы lod2');
  t.ok(M.indices instanceof Uint32Array, 'mountains.indices — Uint32Array');

  t.suite('mesh-bin: Three.js BufferGeometry compatibility');
  const THREE = require(path.join(ROOT, 'client', 'js', 'libs', 'three.core.js'));
  const gV = new THREE.BufferGeometry();
  gV.setAttribute('position', new THREE.Float32BufferAttribute(V.positions, 3));
  gV.setIndex(V.indices);
  t.ok(gV.index instanceof THREE.BufferAttribute, 'gV.index является BufferAttribute');
  t.ok(gV.index.array && gV.index.array.byteLength > 0, 'gV.index.array.byteLength валиден (не упадет в WebGL)');
  t.eq(gV.index.count, V.indices.length, 'gV.index.count совпадает с числом индексов');

  const gM = new THREE.BufferGeometry();
  gM.setAttribute('position', new THREE.Float32BufferAttribute(M.positions, 3));
  gM.setIndex(M.indices);
  t.ok(gM.index instanceof THREE.BufferAttribute, 'gM.index является BufferAttribute');
  t.ok(gM.index.array && gM.index.array.byteLength > 0, 'gM.index.array.byteLength валиден');
  t.eq(gM.index.count, M.indices.length, 'gM.index.count совпадает');
};
