// ============================================================
//  CLIENT / JS / WORLD-CONTENT.JS
//  Автономный загрузчик и менеджер игрового контента сцены (Level / World Content):
//  1. Аппаратный инстансинг всей растительности (FoliageInstancer, 3-Tier Quad-Preserved LOD)
//  2. Спавн, позиционирование и коллизии всех 3D-декораций (CUSTOM_PROPS из editor-overrides)
//  3. Полная независимость мира от наличия редактора сцены (SceneEditor)
// ============================================================
(function () {
  'use strict';
  const THREE = window.THREE;

  // ============================================================
  //  FOLIAGE INSTANCER (Hardware InstancedMesh 3-Tier Quad-Preserved LOD for 60 FPS)
  // ============================================================
  class FoliageInstancer {
    constructor(worldContent) {
      this.worldContent = worldContent;
      this.scene = worldContent.scene;
      this.batches = new Map(); // fileName -> { fileName, subMeshes, lod1SubMeshes, lod2SubMeshes, capacity, instances: [], isTree, isGroundcover }
      this.instanceMap = new Map(); // id -> { fileName, index }
      this.dummy = new THREE.Object3D();
      this._pendingFbxLoads = new Set();
      this._batchPromises = new Map(); // fileName -> { promise, resolve }
    }

    _getBatchLoadPromise(fileName) {
      let rec = this._batchPromises.get(fileName);
      if (!rec) {
        let resolveFn = null;
        const promise = (typeof Promise !== 'undefined') ? new Promise(r => { resolveFn = r; }) : null;
        rec = { promise, resolve: resolveFn || (() => {}), done: false };
        this._batchPromises.set(fileName, rec);
      }
      return rec;
    }

    _resolveBatchLoad(fileName) {
      const rec = this._batchPromises.get(fileName);
      if (rec && !rec.done) {
        rec.done = true;
        rec.resolve();
      }
    }

    isFoliageProp(p) {
      if (!p) return false;
      // Статичный кит (руины, колонны, здания с LOD в файле): тот же аппаратный
      // InstancedMesh, но как твёрдое тело — без ветра, с тенью и коллизией.
      if (p.instanced === true) return true;
      if (p.isFoliage) return true;
      if (typeof p.id === 'string' && p.id.startsWith('foliage_')) return true;
      const modelId = String(p.modelId || '').toLowerCase();
      const fileName = String(p.modelFile || '').toLowerCase();
      const meshType = String(p.meshType || '').toLowerCase();
      const pattern = /^(tree|bush|dead_tree|small_tree|fern|plant|mushroom|grass|stump|sm_rp_rock|field_poppy|matted_pratia|poppy|pratia|flower|spruce|spurce|pine|retro_)/i;
      return pattern.test(modelId) || pattern.test(fileName) || pattern.test(meshType);
    }

    getResolvedFileName(p) {
      const lib = window.PropsLibrary;
      const lookupKey = p.modelId || p.modelFile || p.file || ((p.meshType && p.meshType !== 'fbx' && p.meshType !== 'glb' && p.meshType !== 'gltf') ? p.meshType : '') || p.id;
      const libItem = lib ? lib.getById(lookupKey) : null;
      let fileName = p.modelFile || p.file || (libItem && libItem.file) || (p.modelId ? p.modelId : (p.meshType || 'tree01'));
      if (!/\.(fbx|glb|gltf|obj)$/i.test(fileName)) fileName += '.fbx';
      return fileName;
    }

    registerInstance(p) {
      if (!p || !p.position) return;
      const fileName = this.getResolvedFileName(p);
      let batch = this.batches.get(fileName);
      if (!batch) {
        const isTree = !!((/tree|spruce|pine/i.test(fileName) || (p && /tree|spruce|pine/i.test(p.modelId || p.meshType || ''))) && !/bush/i.test(fileName));
        const isGroundcover = /pratia|poppy|flower|grass/i.test(fileName);
        const isSolidKit = p.instanced === true && !p.isFoliage;
        batch = {
          fileName: fileName,
          subMeshes: [],
          lod1SubMeshes: [],
          lod2SubMeshes: [],
          capacity: 0,
          instances: [],
          isTree: isSolidKit ? false : isTree,
          isGroundcover: isSolidKit ? false : isGroundcover,
          isSolidKit: isSolidKit,
          // класс дальности l2-visibility: building | prop | doodad
          distClass: isSolidKit ? (p.distClass || 'prop') : null,
          drawDist: 0,
          lodDist: null
        };
        this.batches.set(fileName, batch);
      }
      if (batch.isSolidKit) {
        if (typeof p.drawDist === 'number' && p.drawDist > batch.drawDist) batch.drawDist = p.drawDist;
        if (Array.isArray(p.lodDist) && p.lodDist.length === 2) batch.lodDist = p.lodDist;
        if (p.castShadow === false) batch.noShadow = true;
      }
      const existingIdx = batch.instances.findIndex(it => it.id === p.id);
      if (existingIdx !== -1) {
        batch.instances[existingIdx] = p;
      } else {
        batch.instances.push(p);
      }
      this.instanceMap.set(p.id, { fileName: fileName, index: batch.instances.length - 1 });
    }

    addInstance(p) {
      this.registerInstance(p);
      const fileName = this.getResolvedFileName(p);
      const batch = this.batches.get(fileName);
      if (batch) {
        this._ensureModelAndSync(batch);
      }
    }

    removeInstance(propId) {
      const info = this.instanceMap.get(propId);
      if (!info) return;
      const batch = this.batches.get(info.fileName);
      this.instanceMap.delete(propId);
      if (!batch) return;
      const idx = batch.instances.findIndex(it => it.id === propId);
      if (idx !== -1) {
        batch.instances.splice(idx, 1);
        this._syncBatch(batch);
      }
    }

    findPropByHit(hitMesh, instanceId, hitPoint) {
      if (!hitMesh) return null;
      for (const [, batch] of this.batches) {
        if (!batch) continue;
        const tiers = [
          { list: batch.subMeshes, map: batch._lod0Map },
          { list: batch.lod1SubMeshes, map: batch._lod1Map },
          { list: batch.lod2SubMeshes, map: batch._lod2Map }
        ];
        for (let t = 0; t < tiers.length; t++) {
          const { list, map } = tiers[t];
          if (list) {
            for (let s = 0; s < list.length; s++) {
              if (list[s].instancedMesh === hitMesh) {
                // 1. Попытка восстановить реальный индекс экземпляра по карте видимости
                let candidate = null;
                if (map && typeof instanceId === 'number' && instanceId >= 0 && instanceId < map.length) {
                  const realIdx = map[instanceId];
                  if (typeof realIdx === 'number' && realIdx >= 0 && realIdx < batch.instances.length) {
                    candidate = batch.instances[realIdx];
                  }
                }
                if (!candidate && typeof instanceId === 'number' && instanceId >= 0 && instanceId < batch.instances.length) {
                  candidate = batch.instances[instanceId];
                }

                // 2. Если есть hitPoint — ищем ближайший экземпляр к точке клика в batch
                // Это 100% гарантия попадания: клик произошел прямо по конкретному дереву
                if (hitPoint && batch.instances && batch.instances.length > 0) {
                  let bestInst = candidate;
                  let bestDistSq = Infinity;
                  if (candidate && candidate.position) {
                    const cpos = candidate.position;
                    bestDistSq = (cpos.x - hitPoint.x) ** 2 + ((cpos.y || 0) - hitPoint.y) ** 2 + (cpos.z - hitPoint.z) ** 2;
                  }

                  // Если кандидат дальше 5 метров от точки клика — ищем точный экземпляр среди всех в batch
                  if (bestDistSq > 25) {
                    for (let bi = 0; bi < batch.instances.length; bi++) {
                      const inst = batch.instances[bi];
                      if (!inst || !inst.position) continue;
                      const ipos = inst.position;
                      const d2 = (ipos.x - hitPoint.x) ** 2 + ((ipos.y || 0) - hitPoint.y) ** 2 + (ipos.z - hitPoint.z) ** 2;
                      if (d2 < bestDistSq) {
                        bestDistSq = d2;
                        bestInst = inst;
                      }
                    }
                  }
                  return bestInst || candidate;
                }

                return candidate;
              }
            }
          }
        }
      }
      return null;
    }

    updateInstanceTransform(propId, pos, rot, scale) {
      if (!propId) return;
      const info = this.instanceMap.get(propId);
      if (!info) return;
      const batch = this.batches.get(info.fileName);
      if (!batch) return;
      const idx = batch.instances.findIndex(it => it.id === propId);
      if (idx === -1) return;
      const p = batch.instances[idx];
      if (pos) {
        p.position = {
          x: pos.x !== undefined ? pos.x : p.position.x,
          y: pos.y !== undefined ? pos.y : p.position.y,
          z: pos.z !== undefined ? pos.z : p.position.z
        };
      }
      if (rot) {
        p.rotation = {
          x: rot.x !== undefined ? rot.x : (p.rotation ? p.rotation.x : 0),
          y: rot.y !== undefined ? rot.y : (p.rotation ? p.rotation.y : 0),
          z: rot.z !== undefined ? rot.z : (p.rotation ? p.rotation.z : 0)
        };
      }
      if (scale) {
        p.scale = {
          x: scale.x !== undefined ? scale.x : (p.scale ? p.scale.x : 1),
          y: scale.y !== undefined ? scale.y : (p.scale ? p.scale.y : 1),
          z: scale.z !== undefined ? scale.z : (p.scale ? p.scale.z : 1)
        };
      }
      this._foliageDirty = true;
      this._syncBatch(batch);
    }

    clearAll() {
      this.instanceMap.clear();
      this.batches.forEach(batch => {
        batch.instances = [];
        const tiers = ['subMeshes', 'lod1SubMeshes', 'lod2SubMeshes'];
        tiers.forEach(tier => {
          if (batch[tier]) {
            batch[tier].forEach(sub => {
              if (sub.instancedMesh) {
                sub.instancedMesh.count = 0;
                sub.instancedMesh.instanceMatrix.needsUpdate = true;
                sub.instancedMesh.visible = false;
              }
            });
          }
        });
      });
    }

    rebuildFromCustomProps(props) {
      this.instanceMap.clear();
      this.batches.forEach(batch => {
        batch.instances = [];
        batch._prevVisSig = null;
      });
      if (!Array.isArray(props)) return;
      props.forEach(p => {
        if (this.isFoliageProp(p)) {
          this.registerInstance(p);
        }
      });
      let playerPos = (this.worldContent && this.worldContent.game && this.worldContent.game.player && this.worldContent.game.player.mesh)
        ? this.worldContent.game.player.mesh.position
        : null;
      if (!playerPos || (Math.abs(playerPos.x) < 0.01 && Math.abs(playerPos.z) < 0.01)) {
        try {
          const ch = JSON.parse(sessionStorage.getItem('ps_selected_char') || localStorage.getItem('ps_selected_char') || 'null');
          if (ch && ch.pos && isFinite(ch.pos.x) && isFinite(ch.pos.z)) playerPos = ch.pos;
          else if (ch && isFinite(ch.x) && isFinite(ch.z)) playerPos = { x: ch.x, z: ch.z };
        } catch (_) {}
      }
      if (!playerPos) playerPos = { x: 0, z: 0 };
      const ordered = Array.from(this.batches.values()).sort((a, b) => {
        const ia = a.instances[0] && a.instances[0].position;
        const ib = b.instances[0] && b.instances[0].position;
        const da = ia ? ((ia.x - playerPos.x) ** 2 + (ia.z - playerPos.z) ** 2) : 1e12;
        const db = ib ? ((ib.x - playerPos.x) ** 2 + (ib.z - playerPos.z) ** 2) : 1e12;
        return da - db;
      });
      ordered.forEach(batch => {
        this._ensureModelAndSync(batch);
      });
    }

    _runBatchJob(job) {
      if (!job || !job.batch || !job.fbxObj) return;
      try {
        if (!job.fbxObj.userData || !job.fbxObj.userData._pivotNormalized) {
          this.worldContent._normalizeFbxPivot(job.fbxObj, job.fileName);
        }
        this._buildSubMeshesFromTemplate(job.batch, job.fbxObj);
        this._syncBatch(job.batch);
        this._foliageDirty = true;
      } catch (e) {
        console.error('[FoliageInstancer] Error setting up model:', job.fileName, e);
      } finally {
        this._resolveBatchLoad(job.fileName);
      }
    }

    flushSetupQueueSync() {
      if (!this._setupQueue || !this._setupQueue.length) return 0;
      let count = 0;
      while (this._setupQueue.length > 0) {
        const job = this._setupQueue.shift();
        this._runBatchJob(job);
        count++;
      }
      this._pumpActive = false;
      return count;
    }

    waitBatchesNear(cx, cz, radius, timeoutMs) {
      if (typeof Promise === 'undefined') return undefined;
      const rSq = (radius || 420) * (radius || 420);
      const promises = [];
      this.batches.forEach((batch) => {
        if (!batch || !batch.instances || !batch.instances.length) return;
        let hasNear = false;
        for (let i = 0; i < batch.instances.length; i++) {
          const pos = batch.instances[i] && batch.instances[i].position;
          if (!pos) continue;
          const dx = pos.x - cx, dz = pos.z - cz;
          if (dx * dx + dz * dz <= rSq) { hasNear = true; break; }
        }
        if (!hasNear) return;
        this._ensureModelAndSync(batch);
        if (batch.subMeshes && batch.subMeshes.length > 0) return;
        const rec = this._getBatchLoadPromise(batch.fileName);
        if (rec && rec.promise && !rec.done) promises.push(rec.promise);
      });
      if (!promises.length) return Promise.resolve();
      const ms = timeoutMs || 18000;
      return Promise.race([
        Promise.all(promises),
        new Promise(r => setTimeout(r, ms))
      ]);
    }

    _enqueueBatchSetup(batch, fbxObj, fileName) {
      if (!this._setupQueue) this._setupQueue = [];
      // Не дублируем ожидание для одного батча
      for (let i = 0; i < this._setupQueue.length; i++) {
        if (this._setupQueue[i].batch === batch) {
          this._setupQueue[i].fbxObj = fbxObj;
          return;
        }
      }
      this._setupQueue.push({ batch, fbxObj, fileName });
      if (!this._pumpActive) {
        this._pumpActive = true;
        const pump = () => {
          let budget = 2;
          const tStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          while (this._setupQueue.length > 0 && budget > 0) {
            const job = this._setupQueue.shift();
            this._runBatchJob(job);
            budget--;
            if (((typeof performance !== 'undefined' ? performance.now() : Date.now()) - tStart) > 4.5) break;
          }
          if (this._setupQueue.length > 0 && typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(pump);
          } else {
            this._pumpActive = false;
            if (this.worldContent && typeof this.worldContent.scheduleWarmup === 'function') {
              this.worldContent.scheduleWarmup();
            }
          }
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(pump);
        else pump();
      }
    }

    _ensureModelAndSync(batch) {
      const fileName = batch.fileName;
      this._getBatchLoadPromise(fileName);
      const cache = this.worldContent._fbxPropCache;
      if (cache && cache.has(fileName)) {
        const fbxObj = cache.get(fileName);
        if (fbxObj && (!fbxObj.userData || !fbxObj.userData._pivotNormalized)) {
          this.worldContent._normalizeFbxPivot(fbxObj, fileName);
        }
        if (batch.subMeshes && batch.subMeshes.length > 0) {
          this._syncBatch(batch);
          this._resolveBatchLoad(fileName);
        } else if (this.worldContent && this.worldContent._blockingWaitActive) {
          this._runBatchJob({ batch, fbxObj, fileName });
        } else {
          this._enqueueBatchSetup(batch, fbxObj, fileName);
        }
        return;
      }

      if (this._pendingFbxLoads.has(fileName)) {
        return;
      }
      this._pendingFbxLoads.add(fileName);

      this.worldContent.loadPropModel(
        fileName,
        (fbxObj) => {
          this._pendingFbxLoads.delete(fileName);
          try {
            this.worldContent._prepareLoadedFbx(fbxObj, fileName);
            if (!fbxObj.userData || !fbxObj.userData._pivotNormalized) {
              this.worldContent._normalizeFbxPivot(fbxObj, fileName);
            }
            if (!this.worldContent._fbxPropCache) this.worldContent._fbxPropCache = new Map();
            this.worldContent._fbxPropCache.set(fileName, fbxObj);
            if (this.worldContent && this.worldContent._blockingWaitActive) {
              this._runBatchJob({ batch, fbxObj, fileName });
            } else {
              this._enqueueBatchSetup(batch, fbxObj, fileName);
            }
          } catch (e) {
            console.error('[FoliageInstancer] Error setting up model:', fileName, e);
            this._resolveBatchLoad(fileName);
          }
        },
        (err) => {
          this._pendingFbxLoads.delete(fileName);
          this._resolveBatchLoad(fileName);
          console.warn('[FoliageInstancer] Failed to load model:', fileName, err);
        }
      );
    }

    _createQuadPreservedLOD(geo, factor, isTrunk) {
      if (!geo || !geo.attributes || !geo.attributes.position) return geo.clone();
      const posAttr = geo.attributes.position;
      const vertCount = posAttr.count;
      if (vertCount < 1200) return geo.clone();

      const indexAttr = geo.index;
      const rawTris = [];
      if (indexAttr && indexAttr.array) {
        const arr = indexAttr.array;
        for (let i = 0; i < arr.length; i += 3) {
          rawTris.push([arr[i], arr[i + 1], arr[i + 2]]);
        }
      } else {
        for (let i = 0; i < vertCount; i += 3) {
          rawTris.push([i, i + 1, i + 2]);
        }
      }

      if (rawTris.length <= 16) return geo.clone();

      if (isTrunk && factor >= 0.3) return geo.clone();

      const edgeMap = new Map();
      function getEdgeKey(i1, i2) {
        const p1 = [posAttr.getX(i1).toFixed(2), posAttr.getY(i1).toFixed(2), posAttr.getZ(i1).toFixed(2)].join(',');
        const p2 = [posAttr.getX(i2).toFixed(2), posAttr.getY(i2).toFixed(2), posAttr.getZ(i2).toFixed(2)].join(',');
        return p1 < p2 ? p1 + '|' + p2 : p2 + '|' + p1;
      }

      const triPairs = [];
      const triUsed = new Uint8Array(rawTris.length);

      for (let i = 0; i < rawTris.length; i++) {
        if (triUsed[i]) continue;
        const t1 = rawTris[i];
        const edges1 = [getEdgeKey(t1[0], t1[1]), getEdgeKey(t1[1], t1[2]), getEdgeKey(t1[2], t1[0])];
        let paired = -1;

        for (let e = 0; e < 3; e++) {
          const ek = edges1[e];
          if (edgeMap.has(ek)) {
            paired = edgeMap.get(ek);
            break;
          }
        }

        if (paired !== -1 && !triUsed[paired]) {
          triPairs.push([i, paired]);
          triUsed[i] = 1;
          triUsed[paired] = 1;
        } else {
          for (let e = 0; e < 3; e++) {
            edgeMap.set(edges1[e], i);
          }
        }
      }

      const components = [];
      triPairs.forEach(pair => {
        components.push([rawTris[pair[0]], rawTris[pair[1]]]);
      });
      for (let i = 0; i < rawTris.length; i++) {
        if (!triUsed[i]) {
          components.push([rawTris[i]]);
        }
      }

      const targetComponentCount = Math.max(6, Math.round(components.length * factor));
      const step = Math.max(1, Math.floor(components.length / targetComponentCount));

      const selectedTris = [];
      for (let i = 0; i < components.length; i += step) {
        const comp = components[i];
        for (let j = 0; j < comp.length; j++) {
          selectedTris.push(comp[j]);
        }
        if (selectedTris.length / 2 >= targetComponentCount) break;
      }

      if (selectedTris.length === 0) return geo.clone();

      const posCount = selectedTris.length * 3;
      const newPos = new Float32Array(posCount * 3);
      const hasNorm = !!geo.attributes.normal;
      const hasUv = !!geo.attributes.uv;
      const newNorm = hasNorm ? new Float32Array(posCount * 3) : null;
      const newUv = hasUv ? new Float32Array(posCount * 2) : null;

      let dst = 0;
      for (let i = 0; i < selectedTris.length; i++) {
        const tri = selectedTris[i];
        for (let j = 0; j < 3; j++) {
          const v = tri[j];
          newPos[dst * 3] = posAttr.getX(v);
          newPos[dst * 3 + 1] = posAttr.getY(v);
          newPos[dst * 3 + 2] = posAttr.getZ(v);
          if (newNorm) {
            newNorm[dst * 3] = geo.attributes.normal.getX(v);
            newNorm[dst * 3 + 1] = geo.attributes.normal.getY(v);
            newNorm[dst * 3 + 2] = geo.attributes.normal.getZ(v);
          }
          if (newUv) {
            newUv[dst * 2] = geo.attributes.uv.getX(v);
            newUv[dst * 2 + 1] = geo.attributes.uv.getY(v);
          }
          dst++;
        }
      }

      const lodGeo = new THREE.BufferGeometry();
      lodGeo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
      if (newNorm) lodGeo.setAttribute('normal', new THREE.BufferAttribute(newNorm, 3));
      if (newUv) lodGeo.setAttribute('uv', new THREE.BufferAttribute(newUv, 2));

      lodGeo.computeVertexNormals();
      lodGeo.computeBoundingBox();
      lodGeo.computeBoundingSphere();
      return lodGeo;
    }

    _buildSubMeshesFromTemplate(batch, fbxObj) {
      if (batch.subMeshes.length > 0) return;
      fbxObj.updateMatrixWorld(true);

      const fName = String(batch.fileName || '').toLowerCase();
      const isGroundcover = /pratia|poppy|flower|grass/i.test(fName);
      const isTree = batch.isTree || (/tree|spruce|pine/i.test(fName) && !/bush/i.test(fName));
      const folType = isTree ? 'tree' : (isGroundcover ? (/poppy|flower/i.test(fName) ? 'flower' : 'grass') : 'bush');

      const lod0Entries = [];
      const lod1Entries = [];
      const lod2Entries = [];

      // LOD из файла: узлы <имя>_LOD1 / <имя>_LOD2 рядом с <имя>
      // (scripts/operators-territory/build_kit.py). Тогда авто-упрощение не нужно.
      const LOD_NODE_RE = /_lod([12])$/i;
      let hasFileLods = false;
      fbxObj.traverse((c) => { if (c.isMesh && LOD_NODE_RE.test(c.name || '')) hasFileLods = true; });

      fbxObj.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        child.updateMatrixWorld(true);
        const bakedGeo = child.geometry.clone();
        bakedGeo.applyMatrix4(child.matrixWorld);
        if (!bakedGeo.attributes.normal) {
          bakedGeo.computeVertexNormals();
        }

        const meshName = (child.name || '').toLowerCase();
        const fileLod = hasFileLods ? (LOD_NODE_RE.test(meshName) ? +meshName.match(LOD_NODE_RE)[1] : 0) : -1;
        const isTrunk = meshName.startsWith('cylinder') || /trunk|bark|stem|wood|log/i.test(meshName);
        const isSolidProp = !!batch.isSolidKit ||
          /rock|stone|boulder|stump|log|house|building|wall|fence|barrier|barrel|crate|plank|wood|mannequin|statue|monument|bench|chapel|boiler|airship|tp_zone/i.test(fName);

        const applyWind = (m, cl) => {
          if (!cl) return cl;
          if (isSolidProp) return cl;

          const isFoliage = isTree || isGroundcover || /bush|fern|plant|branch|leaf|leaves|poppy|flower|grass|pratia|spruce|pine/i.test(fName);
          if (!isFoliage) return cl;

          if (window.WindSystem && window.WindSystem.applyWindToMaterial) {
            delete cl._windShaderApplied;
            if (cl.userData) delete cl.userData.hasWindShader;
            window.WindSystem.applyWindToMaterial(cl, isTrunk ? 'trunk' : folType);
          }
          return cl;
        };

        const setupCrownMat = (cl) => {
          if (!cl) return cl;
          if (isTree && !isTrunk) {
            if (!cl.alphaTest || cl.alphaTest <= 0) cl.alphaTest = 0.15;
            cl.side = THREE.DoubleSide;
            cl.shadowSide = THREE.DoubleSide;
          }
          return cl;
        };

        const mat = Array.isArray(child.material)
          ? child.material.map(m => {
              if (!m) return m;
              if (isSolidProp && !m.map?.isDataTexture && !m._hasCustomMat) {
                return m; // already shared via _prepareLoadedFbx
              }
              const cl = m.clone();
              cl.vertexColors = false;
              cl.side = m.side;
              cl.alphaTest = m.alphaTest;
              cl.depthWrite = true;
              cl.transparent = false;
              delete cl._windShaderApplied;
              if (cl.userData) delete cl.userData.hasWindShader;
              setupCrownMat(cl);
              return applyWind(m, cl);
            })
          : (() => {
              if (!child.material) return new THREE.MeshBasicMaterial();
              if (isSolidProp) return child.material;
              const cl = child.material.clone();
              cl.vertexColors = false;
              cl.side = child.material.side;
              cl.alphaTest = child.material.alphaTest;
              cl.depthWrite = true;
              cl.transparent = false;
              delete cl._windShaderApplied;
              if (cl.userData) delete cl.userData.hasWindShader;
              setupCrownMat(cl);
              return applyWind(child.material, cl);
            })();

        if (fileLod >= 0) {
          (fileLod === 0 ? lod0Entries : (fileLod === 1 ? lod1Entries : lod2Entries)).push({
            geometry: bakedGeo,
            material: mat,
            instancedMesh: null
          });
          return;
        }

        lod0Entries.push({
          geometry: bakedGeo,
          material: mat,
          instancedMesh: null
        });

        const isBush =/bush|shrub|fern|reed|grass_bush/i.test(fName) || /bush|shrub|fern|reed|grass_bush/i.test(meshName);
        const vertCount = (bakedGeo.attributes.position && bakedGeo.attributes.position.count) || 0;
        const shouldPreserveGeometry = isTree || isSolidProp || isGroundcover || isBush || vertCount < 1200;

        const lod1Geo = shouldPreserveGeometry ? bakedGeo : this._createQuadPreservedLOD(bakedGeo, 0.45, isTrunk);
        lod1Entries.push({
          geometry: lod1Geo,
          material: mat,
          instancedMesh: null
        });

        const lod2Geo = shouldPreserveGeometry ? bakedGeo : this._createQuadPreservedLOD(bakedGeo, 0.20, isTrunk);
        lod2Entries.push({
          geometry: lod2Geo,
          material: mat,
          instancedMesh: null
        });
      });

      if (hasFileLods) {
        // Каждый ярус — отдельный InstancedMesh, то есть draw call (+ теневой). Файл
        // содержит только ярусы, которые заметно легче предыдущего; пустых не создаём.
        // Нет среднего яруса — дальний встаёт на его место, а ближний держится до
        // второй границы (batch.lodShift).
        if (!lod1Entries.length && lod2Entries.length) {
          lod1Entries.push(...lod2Entries);
          lod2Entries.length = 0;
          batch.lodShift = true;
        }
      }

      batch.subMeshes = lod0Entries;
      batch.lod1SubMeshes = lod1Entries;
      batch.lod2SubMeshes = lod2Entries;

      // Габарит для frustum-отсечки кита (здание 30 м — не «дерево радиусом 6 м»)
      if (batch.isSolidKit && lod0Entries.length) {
        const bb = new THREE.Box3();
        lod0Entries.forEach(e => {
          if (!e.geometry.boundingBox) e.geometry.computeBoundingBox();
          bb.union(e.geometry.boundingBox);
        });
        if (!bb.isEmpty()) {
          batch.boundR = Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.5;
          batch.boundH = (bb.max.y + bb.min.y) * 0.5;
          batch.boundTop = bb.max.y;
        }
      }
    }

    _canBatchCastShadow(batch, namePrefix) {
      if (!batch || (!batch.isTree && !batch.isSolidKit)) return false;
      if (batch.isSolidKit) {
        // Тень солнца покрывает 60–140 м вокруг игрока: дальний ярус кита её не даёт,
        // а мелочь у земли (плиты, блоки) — не видна. Это лишние теневые draw calls.
        if (batch.noShadow) return false;
        if (namePrefix === 'instanced_lod2') return false;
        if (namePrefix === 'instanced_lod1' && batch.lodShift) return false;
      }
      const g = (this.worldContent && this.worldContent.game) || (this.editor && this.editor.game) || window.game;
      const quality = (g && g.shadowQuality) || 'medium';
      if (quality === 'off') return false;
      return true; // Тени деревьев активны на всех LOD-уровнях единообразно со зданиями и пропсами
    }

    updateShadowQuality(quality) {
      const g = (this.worldContent && this.worldContent.game) || (this.editor && this.editor.game) || window.game;
      quality = quality || (g && g.shadowQuality) || 'medium';
      const isOff = quality === 'off';
      this.batches.forEach(batch => {
        if (!batch.isTree && !batch.isSolidKit) return;
        const setTierShadow = (meshList, canCast) => {
          if (!meshList) return;
          meshList.forEach(sub => {
            if (sub && sub.instancedMesh) {
              sub.instancedMesh.castShadow = canCast;
            }
          });
        };
        setTierShadow(batch.subMeshes, !isOff && this._canBatchCastShadow(batch, 'instanced_lod0'));
        setTierShadow(batch.lod1SubMeshes, !isOff && this._canBatchCastShadow(batch, 'instanced_lod1'));
        setTierShadow(batch.lod2SubMeshes, !isOff && this._canBatchCastShadow(batch, 'instanced_lod2'));
      });
    }

    _syncBatch(batch) {
      if (!batch || batch.subMeshes.length === 0) return;
      const count = batch.instances.length;

      if (batch.capacity < count || !batch.subMeshes[0].instancedMesh) {
        const newCapacity = Math.max(16, Math.ceil(Math.max(count, 1) * 1.4));

        const setupTier = (meshList, namePrefix) => {
          if (!meshList) return;
          meshList.forEach(sub => {
            if (sub.instancedMesh) {
              this.scene.remove(sub.instancedMesh);
              if (sub.instancedMesh.dispose) sub.instancedMesh.dispose();
            }
            const instMesh = new THREE.InstancedMesh(sub.geometry, sub.material, newCapacity);
            instMesh.name = namePrefix + '_' + batch.fileName;
            instMesh.castShadow = this._canBatchCastShadow(batch, namePrefix);
            instMesh.receiveShadow = true;
            instMesh.frustumCulled = false;
            this.scene.add(instMesh);
            sub.instancedMesh = instMesh;
          });
        };

        setupTier(batch.subMeshes, 'instanced_lod0');
        setupTier(batch.lod1SubMeshes, 'instanced_lod1');
        setupTier(batch.lod2SubMeshes, 'instanced_lod2');

        batch.capacity = newCapacity;
      }

      const dummy = this.dummy;
      for (let i = 0; i < count; i++) {
        const p = batch.instances[i];
        const pos = p.position || { x: 0, y: 0, z: 0 };
        const rot = p.rotation || { x: 0, y: 0, z: 0 };
        const sc = p.scale || { x: 1, y: 1, z: 1 };

        dummy.position.set(pos.x, pos.y || 0, pos.z);
        dummy.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
        dummy.scale.set(sc.x || 1, sc.y || 1, sc.z || 1);
        dummy.updateMatrix();

        batch.subMeshes.forEach(sub => {
          sub.instancedMesh.setMatrixAt(i, dummy.matrix);
        });
        if (batch.lod1SubMeshes) {
          batch.lod1SubMeshes.forEach(sub1 => {
            sub1.instancedMesh.setMatrixAt(i, dummy.matrix);
          });
        }
        if (batch.lod2SubMeshes) {
          batch.lod2SubMeshes.forEach(sub2 => {
            sub2.instancedMesh.setMatrixAt(i, dummy.matrix);
          });
        }
      }

      const updateInitTier = (meshList, visible) => {
        if (!meshList) return;
        meshList.forEach(sub => {
          if (sub.instancedMesh) {
            sub.instancedMesh.count = visible ? count : 0;
            sub.instancedMesh.instanceMatrix.needsUpdate = true;
            sub.instancedMesh.visible = visible && (count > 0);
          }
        });
      };

      updateInitTier(batch.subMeshes, true);
      updateInitTier(batch.lod1SubMeshes, false);
      updateInitTier(batch.lod2SubMeshes, false);
    }

    updateVisibility(camera, player, visMgr) {
      const isEditor = (typeof window.isSceneEditorActive === 'function' && window.isSceneEditorActive());
      const pp = (camera && camera.position) ? camera.position : ((player && player.mesh) ? player.mesh.position : (player ? (player.position || { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 }));

      // Performance: Skip expensive GPU buffer uploads if camera hasn't moved or rotated significantly
      if (!this._lastCamPos) {
        this._lastCamPos = new THREE.Vector3(999999, 999999, 999999);
        this._lastCamQuat = new THREE.Quaternion(0, 0, 0, 1);
        this._lastUpdateTime = 0;
        this._cachedStats = null;
      }
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const camPos = (camera && camera.position) ? camera.position : pp;
      const camMoved = !camera ? true : (camPos.distanceToSquared(this._lastCamPos) > 2.25); // > 1.5m
      const camRotated = !camera ? true : (Math.abs(camera.quaternion.dot(this._lastCamQuat)) < 0.998); // > ~3.6 deg
      const timeExpired = (now - this._lastUpdateTime > 180);
      const isDirty = !!this._foliageDirty;

      if (!camMoved && !camRotated && !timeExpired && !isDirty && this._cachedStats) {
        return this._cachedStats;
      }

      const stats = {
        total: 0,
        visible: 0,
        lod0: 0,
        lod1: 0,
        lod2: 0,
        frustumCulled: 0,
        distanceCulled: 0
      };

      const clip = (visMgr && visMgr.config && visMgr.config.clippingRange) ? visMgr.config.clippingRange : { foliage: 350.0 };
      const baseFoliageDist = clip.foliage || 350.0;
      const dummy = this.dummy;

      this.batches.forEach(batch => {
        if (!batch || !batch.instances || batch.instances.length === 0) return;
        if (!batch.subMeshes || batch.subMeshes.length === 0 || !batch.subMeshes[0].instancedMesh) return;

        const count = batch.instances.length;
        stats.total += count;

        const isTree = batch.isTree;
        const isGroundcover = batch.isGroundcover;
        const fName = String(batch.fileName || '').toLowerCase();
        const isSolid = !!batch.isSolidKit || /rock|stone|boulder|stump|log|house|building|wall/i.test(fName);

        let lod0Dist = 45.0;
        let lod1Dist = 95.0;
        let maxDist = 220.0;
        let treeRadius = 3.0;
        let treeHeight = 2.5;

        if (isTree || isSolid) {
          lod0Dist = 55.0;
          lod1Dist = 120.0;
          maxDist = Math.min(baseFoliageDist || 350.0, 380.0);
          treeRadius = 6.0;
          treeHeight = 7.0;
        } else if (isGroundcover) {
          lod0Dist = 35.0;
          lod1Dist = 75.0;
          maxDist = Math.min(baseFoliageDist || 200.0, 180.0);
          treeRadius = 2.5;
          treeHeight = 1.2;
        } else {
          lod0Dist = 40.0;
          lod1Dist = 85.0;
          maxDist = Math.min(baseFoliageDist || 260.0, 240.0);
          treeRadius = 3.5;
          treeHeight = 3.0;
        }

        if (batch.isSolidKit) {
          // Кит: дальности LOD из манифеста, предел — класс l2-visibility (здания видно до тумана)
          const ld = batch.lodDist || [60.0, 150.0];
          // без среднего яруса ближний держится до второй границы, дальше — дальний
          lod0Dist = batch.lodShift ? ld[1] : ld[0];
          lod1Dist = ld[1];
          const classDist = batch.distClass === 'building' ? (clip.buildingsMax || 850.0)
            : (batch.distClass === 'doodad' ? (clip.doodadsMax || 200.0) : (clip.propsMax || 550.0));
          maxDist = batch.drawDist ? Math.min(batch.drawDist, classDist) : classDist;
          treeRadius = batch.boundR || 6.0;
          treeHeight = batch.boundH || 4.0;
        }

        const effMaxDist = isEditor ? (batch.isSolidKit ? maxDist * 1.25 : Math.min(maxDist * 1.5, 450.0)) : maxDist;
        const effMaxDist2 = effMaxDist * effMaxDist;
        const effLod0Dist2 = isEditor ? (lod0Dist * 1.35) * (lod0Dist * 1.35) : (lod0Dist * lod0Dist);
        const effLod1Dist2 = isEditor ? (lod1Dist * 1.35) * (lod1Dist * 1.35) : (lod1Dist * lod1Dist);

        const nearImmunity = (visMgr && visMgr.config && visMgr.config.frustum && visMgr.config.frustum.nearImmunityRadius != null)
          ? Math.min(100.0, visMgr.config.frustum.nearImmunityRadius)
          : 100.0;
        const nearImmunity2 = nearImmunity * nearImmunity;

        if (!batch._lod0Map) batch._lod0Map = [];
        if (!batch._lod1Map) batch._lod1Map = [];
        if (!batch._lod2Map) batch._lod2Map = [];
        batch._lod0Map.length = 0;
        batch._lod1Map.length = 0;
        batch._lod2Map.length = 0;

        let visLod0 = 0;
        let visLod1 = 0;
        let visLod2 = 0;

        const hasLod1 = !!(batch.lod1SubMeshes && batch.lod1SubMeshes.length > 0 && batch.lod1SubMeshes[0].instancedMesh);
        const hasLod2 = !!(batch.lod2SubMeshes && batch.lod2SubMeshes.length > 0 && batch.lod2SubMeshes[0].instancedMesh);

        for (let i = 0; i < count; i++) {
          const p = batch.instances[i];
          if (!p || !p.position) continue;
          const pos = p.position;

          const dx = pos.x - pp.x;
          const dz = pos.z - pp.z;
          const dist2 = dx * dx + dz * dz;

          if (dist2 > effMaxDist2) {
            stats.distanceCulled++;
            continue;
          }

          const isNearImmune = (dist2 <= nearImmunity2);
          const py = (pos.y != null && isFinite(pos.y)) ? pos.y : 0;
          const frustumMargin = (isTree || isSolid) ? 25.0 : (isEditor ? 25.0 : 0);
          let cullR = treeRadius;
          let cullH = treeHeight;
          if (batch.isSolidKit && p.scale) {
            const ks = Math.max(p.scale.x || 1, p.scale.z || 1);
            cullR *= ks;
            cullH *= (p.scale.y || 1);
          }
          const inFrustum = isNearImmune || ((visMgr && typeof visMgr.isSphereInFrustum === 'function')
            ? visMgr.isSphereInFrustum(pos.x, py + cullH, pos.z, cullR + frustumMargin)
            : true);

          if (!inFrustum) {
            stats.frustumCulled++;
            continue;
          }

          const rot = p.rotation || { x: 0, y: 0, z: 0 };
          const sc = p.scale || { x: 1, y: 1, z: 1 };

          dummy.position.set(pos.x, py, pos.z);
          dummy.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
          dummy.scale.set(sc.x || 1, sc.y || 1, sc.z || 1);
          dummy.updateMatrix();

          if (dist2 <= effLod0Dist2 || !hasLod1) {
            batch.subMeshes.forEach(sub => {
              if (sub.instancedMesh) sub.instancedMesh.setMatrixAt(visLod0, dummy.matrix);
            });
            batch._lod0Map[visLod0] = i;
            visLod0++;
            stats.lod0++;
          } else if (dist2 <= effLod1Dist2 || !hasLod2) {
            batch.lod1SubMeshes.forEach(sub1 => {
              if (sub1.instancedMesh) sub1.instancedMesh.setMatrixAt(visLod1, dummy.matrix);
            });
            batch._lod1Map[visLod1] = i;
            visLod1++;
            stats.lod1++;
          } else {
            batch.lod2SubMeshes.forEach(sub2 => {
              if (sub2.instancedMesh) sub2.instancedMesh.setMatrixAt(visLod2, dummy.matrix);
            });
            batch._lod2Map[visLod2] = i;
            visLod2++;
            stats.lod2++;
          }

          stats.visible++;
        }

        const updateTier = (meshList, cCount, mapArr) => {
          if (!meshList) return;
          // Быстрая сигнатура видимых индексов — не гоняем instanceMatrix на GPU без изменений
          let sig = cCount;
          if (mapArr && cCount > 0) {
            sig = (sig * 31 + (mapArr[0] | 0)) | 0;
            sig = (sig * 31 + (mapArr[cCount - 1] | 0)) | 0;
            if (cCount > 2) sig = (sig * 31 + (mapArr[cCount >> 1] | 0)) | 0;
          }
          meshList.forEach(sub => {
            if (sub.instancedMesh) {
              const changed = (sub._lastCount !== cCount || sub._lastVisSig !== sig);
              sub.instancedMesh.count = cCount;
              if (cCount > 0) {
                if (changed) sub.instancedMesh.instanceMatrix.needsUpdate = true;
                sub.instancedMesh.visible = true;
              } else {
                sub.instancedMesh.visible = false;
              }
              sub._lastCount = cCount;
              sub._lastVisSig = sig;
            }
          });
        };

        updateTier(batch.subMeshes, visLod0, batch._lod0Map);
        updateTier(batch.lod1SubMeshes, visLod1, batch._lod1Map);
        updateTier(batch.lod2SubMeshes, visLod2, batch._lod2Map);
      });

      if (camera && camera.position && camera.quaternion) {
        this._lastCamPos.copy(camera.position);
        this._lastCamQuat.copy(camera.quaternion);
      }
      this._lastUpdateTime = now;
      this._foliageDirty = false;
      this._cachedStats = stats;

      return stats;
    }
  }

  // ============================================================
  //  WORLD CONTENT (Autonomous Level Manager)
  // ============================================================
  class WorldContent {
    constructor(game) {
      this.game = game;
      this.scene = game ? game.scene : null;
      this.foliageInstancer = new FoliageInstancer(this);
      this.customPropMeshes = new Map();
      this._fbxPropCache = new Map();
      this._pendingFbxLoads = new Set();
      this._pendingFbxGroups = new Map();
      this._pendingFbxGroupPromises = new Map();
      this._sharedPropTextures = new Map();
      this._sharedPropTexPromises = new Map();
      this._sharedPropMaterials = new Map();
      this._knownTexturesMap = null;
      this._overridesHydrated = false;
      this._reapplyAttempt = 0;
      this._lastBuiltPropsRef = null;
      this._lastBuiltPropsLen = -1;
      this._warmedMatUuids = new Set();
      this._warmupTimer = null;

      if (this.game) {
        this.game.worldContent = this;
        this.game.foliageInstancer = this.foliageInstancer;
      }
    }

    _getSharedPropMaterial(opts) {
      const map = opts.map || null;
      const side = opts.side != null ? opts.side : THREE.FrontSide;
      const alphaTest = opts.alphaTest || 0;
      const key = (map ? (map.uuid || map._psTexKey || 'm') : 'nomap') + '|' + side + '|' + alphaTest;
      if (this._sharedPropMaterials.has(key)) return this._sharedPropMaterials.get(key);
      const mat = new THREE.MeshLambertMaterial({
        map: map,
        color: new THREE.Color(0xffffff),
        reflectivity: 0,
        flatShading: false,
        vertexColors: false,
        alphaTest: alphaTest,
        side: side,
        depthWrite: true,
        transparent: false
      });
      mat.needsUpdate = true;
      this._sharedPropMaterials.set(key, mat);
      return mat;
    }

    scheduleWarmup() {
      if (this._warmupTimer) return;
      this._warmupTimer = setTimeout(() => {
        this._warmupTimer = null;
        const g = this.game || window.game;
        if (g && g.renderer && g.camera && g.scene) {
          this.warmupPipeline(g.renderer, g.camera, g.scene).catch(() => {});
        }
      }, 60);
    }

    async warmupPipeline(renderer, camera, scene) {
      if (!renderer || !camera || !scene || !this.foliageInstancer) return;
      const mats = new Set();
      this.foliageInstancer.batches.forEach(batch => {
        if (!batch || !batch.subMeshes) return;
        batch.subMeshes.forEach(s => {
          const m = s && s.instancedMesh && s.instancedMesh.material;
          if (Array.isArray(m)) m.forEach(mm => mm && mats.add(mm));
          else if (m) mats.add(m);
        });
      });
      const toCompile = [];
      for (const m of mats) {
        if (m && m.uuid && !this._warmedMatUuids.has(m.uuid)) {
          toCompile.push(m);
        }
      }
      if (!toCompile.length) return;

      const microScene = new THREE.Scene();
      if (scene.fog) microScene.fog = scene.fog;
      if (scene.environment) microScene.environment = scene.environment;
      microScene.add(new THREE.AmbientLight(0xffffff, 1.0));
      const sun = (this.game && this.game.sun) || scene.getObjectByName('SunKey');
      if (sun) microScene.add(sun.clone());
      const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 50);
      cam.position.set(0, -9999, 4);
      cam.lookAt(0, -9999, 0);
      cam.updateMatrixWorld(true);
      const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const dummyM = new THREE.Matrix4();

      for (const m of toCompile) {
        this._warmedMatUuids.add(m.uuid);
        const im = new THREE.InstancedMesh(geo, m, 1);
        im.setMatrixAt(0, dummyM);
        im.position.set(0, -9999, 0);
        microScene.add(im);
        try {
          if (typeof renderer.compileAsync === 'function') await renderer.compileAsync(im, cam, microScene);
          else if (typeof renderer.compile === 'function') renderer.compile(im, cam, microScene);
        } catch (_) {}
        microScene.remove(im);
        if (typeof im.dispose === 'function') im.dispose();
        await new Promise(r => requestAnimationFrame(r));
      }
      geo.dispose();
    }

    _initKnownTextures() {
      if (this._knownTexturesMap) return;
      if (window.PROP_TEXTURES_DATA || window._SHARED_PROP_TEXTURES_MAP) {
        this._knownTexturesMap = window.PROP_TEXTURES_DATA || window._SHARED_PROP_TEXTURES_MAP;
        window._SHARED_PROP_TEXTURES_MAP = this._knownTexturesMap;
        return;
      }
      const map = new Map();
      this._knownTexturesMap = map;
      window._SHARED_PROP_TEXTURES_MAP = map;
    }

    _resolvePropTexture(rawName) {
      if (!rawName) return null;
      this._initKnownTextures();
      let clean = String(rawName).replace(/^.*[\\\/]/, '').trim().split('?')[0];
      if (!clean) return null;
      let lower = clean.toLowerCase();

      // 0. Base name
      const base = lower.replace(/\.(fbx|glb|gltf|obj|png|jpe?g|webp|tga|bmp|dds)$/i, '');

      // 0b. Deduplicate groundcover variants (matted_pratia_a..h -> matted_pratia.webp, field_poppy_a..h -> field_poppy.webp)
      if (base.includes('pratia')) {
        if (this._knownTexturesMap.has('matted_pratia.webp')) return this._knownTexturesMap.get('matted_pratia.webp');
        if (this._knownTexturesMap.has('matted_pratia.png')) return this._knownTexturesMap.get('matted_pratia.png');
        return 'matted_pratia.webp';
      }
      if (base.includes('poppy')) {
        if (this._knownTexturesMap.has('field_poppy.webp')) return this._knownTexturesMap.get('field_poppy.webp');
        if (this._knownTexturesMap.has('field_poppy.png')) return this._knownTexturesMap.get('field_poppy.png');
        return 'field_poppy.webp';
      }

      // 1. Prefer modern WebP format if available in dictionary
      if (this._knownTexturesMap.has(base + '.webp')) return this._knownTexturesMap.get(base + '.webp');
      if (this._knownTexturesMap.has(base)) {
        const byBase = this._knownTexturesMap.get(base);
        if (byBase && byBase.endsWith('.webp')) return byBase;
      }

      // 2. Direct match in dictionary
      if (this._knownTexturesMap.has(lower)) {
        const val = this._knownTexturesMap.get(lower);
        if (val) {
          const valBase = val.replace(/\.(png|jpe?g|tga|bmp)$/i, '');
          if (this._knownTexturesMap.has(valBase + '.webp')) return this._knownTexturesMap.get(valBase + '.webp');
          return val;
        }
      }

      // 3. Base name with image extensions fallback
      if (this._knownTexturesMap.has(base + '.png')) return this._knownTexturesMap.get(base + '.png');
      if (this._knownTexturesMap.has(base + '.jpg')) return this._knownTexturesMap.get(base + '.jpg');
      if (this._knownTexturesMap.has(base + '.jpeg')) return this._knownTexturesMap.get(base + '.jpeg');

      // 3. Groundcover / Flower specializations (Pratia & Poppy)
      if (base.includes('pratia')) {
        if (this._knownTexturesMap.has(base + '.webp')) return this._knownTexturesMap.get(base + '.webp');
        if (this._knownTexturesMap.has(base + '.png')) return this._knownTexturesMap.get(base + '.png');
        if (this._knownTexturesMap.has('matted_pratia.webp')) return this._knownTexturesMap.get('matted_pratia.webp');
        if (this._knownTexturesMap.has('matted_pratia.png')) return this._knownTexturesMap.get('matted_pratia.png');
      }
      if (base.includes('poppy')) {
        if (this._knownTexturesMap.has(base + '.webp')) return this._knownTexturesMap.get(base + '.webp');
        if (this._knownTexturesMap.has(base + '.png')) return this._knownTexturesMap.get(base + '.png');
        if (this._knownTexturesMap.has('field_poppy.webp')) return this._knownTexturesMap.get('field_poppy.webp');
        if (this._knownTexturesMap.has('field_poppy.png')) return this._knownTexturesMap.get('field_poppy.png');
      }

      // 4. Strip variant suffixes (_a, _b, _varA, _lod0, etc.)
      const stripped = base.replace(/([_\.]?[a-z0-9]+)+$/i, '');
      if (stripped && stripped !== base) {
        if (this._knownTexturesMap.has(stripped + '.webp')) return this._knownTexturesMap.get(stripped + '.webp');
        if (this._knownTexturesMap.has(stripped + '.png')) return this._knownTexturesMap.get(stripped + '.png');
        if (this._knownTexturesMap.has(stripped + '.jpg')) return this._knownTexturesMap.get(stripped + '.jpg');
      }

      const strippedDigits = base.replace(/([_\.]?\d+)+$/g, '');
      if (strippedDigits && strippedDigits !== base) {
        if (this._knownTexturesMap.has(strippedDigits + '.webp')) return this._knownTexturesMap.get(strippedDigits + '.webp');
        if (this._knownTexturesMap.has(strippedDigits + '.png')) return this._knownTexturesMap.get(strippedDigits + '.png');
        if (this._knownTexturesMap.has(strippedDigits + '.jpg')) return this._knownTexturesMap.get(strippedDigits + '.jpg');
      }

      // 5. Classic Fallback families (prefer WebP — release dist strips PNG duplicates)
      if (base.startsWith('wood')) return this._knownTexturesMap.get('wood.webp') || this._knownTexturesMap.get('wood.png') || 'Wood.webp';
      if (base.startsWith('pinebranch')) return this._knownTexturesMap.get('pinebranch.webp') || this._knownTexturesMap.get('pinebranch.png') || 'PineBranch.webp';
      if (base.startsWith('sprucebranch')) return this._knownTexturesMap.get('sprucebranch.webp') || this._knownTexturesMap.get('sprucebranch.png') || 'SpruceBranch.webp';
      if (base.startsWith('pine')) return this._knownTexturesMap.get('pine.webp') || this._knownTexturesMap.get('pine.png') || 'Pine.webp';
      if (base.startsWith('spruce') || base.startsWith('spurce')) return this._knownTexturesMap.get('spruce.webp') || this._knownTexturesMap.get('spruce.png') || 'Spruce.webp';
      if (base.startsWith('stump')) return this._knownTexturesMap.get('stump_1.webp') || this._knownTexturesMap.get('stump_1.png') || 'Stump_1.webp';
      if (base.startsWith('house_') || base.startsWith('house')) return this._knownTexturesMap.get('house_01.webp') || 'house_01.webp';
      if (base.startsWith('forge')) return this._knownTexturesMap.get('house_engineer_01.webp') || 'house_engineer_01.webp';
      if (base.startsWith('grocery') || base.startsWith('warrior_shop')) return this._knownTexturesMap.get('house_05.webp') || 'house_05.webp';
      if (base.startsWith('warehouse')) return this._knownTexturesMap.get('warehouse_01.webp') || 'warehouse_01.webp';
      if (base.startsWith('market_stall')) return this._knownTexturesMap.get('market_stall_01.webp') || 'market_stall_01.webp';
      if (base.startsWith('tent')) return this._knownTexturesMap.get('tent_02.webp') || 'tent_02.webp';

      return null;
    }

    /**
     * Общая текстура пропсов из словаря (одна на все модели — одна загрузка в VRAM).
     * forGltf: UV в glTF идут сверху вниз, такой текстуре нужен flipY = false
     * (FBX — наоборот), поэтому для GLB — свой экземпляр в кэше.
     */
    _getOrLoadSharedPropTexture(fileName, forGltf) {
      if (!fileName) return null;
      if (!this._sharedPropTextures) this._sharedPropTextures = new Map();
      if (!this._sharedPropTexPromises) this._sharedPropTexPromises = new Map();
      const cacheKey = forGltf ? fileName + '#gltf' : fileName;
      if (this._sharedPropTextures.has(cacheKey)) return this._sharedPropTextures.get(cacheKey);
      const texLoader = new THREE.TextureLoader();
      let settleTex = null;
      const texProm = (typeof Promise !== 'undefined') ? new Promise(res => { settleTex = res; }) : null;
      if (texProm) this._sharedPropTexPromises.set(cacheKey, texProm);
      const tex = texLoader.load(
        'assets/props/textures/' + fileName + '?v=tree-fix-5',
        (loaded) => {
          if (loaded) {
            loaded.colorSpace = THREE.SRGBColorSpace;
            loaded.generateMipmaps = true;
            loaded.minFilter = THREE.LinearMipmapLinearFilter;
            loaded.magFilter = THREE.LinearFilter;
            loaded.anisotropy = 4;
            loaded.needsUpdate = true;
            const g = this.game || window.game;
            if (g && g.renderer && typeof g.renderer.initTexture === 'function') {
              try { g.renderer.initTexture(loaded); } catch (_) {}
            }
          }
          if (settleTex) { const fn = settleTex; settleTex = null; fn(loaded || null); }
        },
        undefined,
        () => {
          if (settleTex) { const fn = settleTex; settleTex = null; fn(null); }
        }
      );
      tex._psTexKey = cacheKey;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 4;
      if (forGltf) tex.flipY = false;
      this._sharedPropTextures.set(cacheKey, tex);
      return tex;
    }

    getFBXLoader() {
      if (!this._fbxLoader && (window.FBXLoader || (window.THREE && window.THREE.FBXLoader))) {
        const LoaderClass = window.FBXLoader || (window.THREE && window.THREE.FBXLoader);
        const manager = new THREE.LoadingManager();
        manager.setURLModifier((url) => {
          let clean = url.replace(/\\/g, '/');
          if (/\.(fbx|glb|gltf|bin|json|obj|dae)$/i.test(clean)) {
            return url;
          }
          let base = clean.split('/').pop().split('?')[0];
          if (base && /\.(jpe?g|png|tga|bmp|webp|dds)$/i.test(base)) {
            const resolved = this._resolvePropTexture(base);
            if (resolved) return 'assets/props/textures/' + resolved + '?v=tree-fix-5';
            return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
          }
          return url;
        });
        this._fbxLoader = new LoaderClass(manager);
        this._fbxLoader.setPath('assets/props/');
        this._fbxLoader.setResourcePath('assets/props/textures/');
      }
      return this._fbxLoader;
    }

    getGLTFLoader() {
      if (!this._gltfLoader && (window.GLTFLoader || (window.THREE && window.THREE.GLTFLoader))) {
        const LoaderClass = window.GLTFLoader || (window.THREE && window.THREE.GLTFLoader);
        const loader = new LoaderClass();
        const DracoClass = window.DRACOLoader || (window.THREE && window.THREE.DRACOLoader);
        if (DracoClass) {
          const draco = new DracoClass();
          draco.setDecoderPath('js/libs/draco/');
          loader.setDRACOLoader(draco);
        }
        loader.setPath('assets/props/');
        this._gltfLoader = loader;
      }
      return this._gltfLoader;
    }

    loadPropModel(fileName, onLoad, onError) {
      if (/\.(glb|gltf)$/i.test(fileName)) {
        const gltfLoader = this.getGLTFLoader();
        if (!gltfLoader) {
          if (onError) onError(new Error('GLTFLoader not available'));
          return;
        }
        const gltfUrl = (fileName.indexOf('?') === -1 && /opt_ruin_bastion_prow\.glb$/i.test(fileName))
          ? (fileName + '?v=fast-4')
          : fileName;
        gltfLoader.load(
          gltfUrl,
          (gltf) => {
            const root = (gltf && gltf.scene) || (gltf && gltf.scenes && gltf.scenes[0]) || new THREE.Group();
            onLoad(root);
          },
          undefined,
          onError
        );
        return;
      }
      const fbxLoader = this.getFBXLoader();
      if (!fbxLoader) {
        if (onError) onError(new Error('FBXLoader not available'));
        return;
      }
      fbxLoader.load(fileName, onLoad, undefined, onError);
    }

    _prepareLoadedFbx(fbxObj, fileName) {
      const isGlb = /\.(glb|gltf)$/i.test(fileName);
      const baseModelName = fileName.replace(/\.(fbx|glb|gltf|obj)$/i, '');
      const isTreeRt = /tree_rt/i.test(fileName);
      const isPratia = /pratia/i.test(fileName) || /pratia/i.test(baseModelName);
      const isPoppy = /poppy/i.test(fileName) || /poppy/i.test(baseModelName);
      const isGroundcover = isPratia || isPoppy || /flower|grass/i.test(fileName) || /flower|grass/i.test(baseModelName);
      const isTree = /tree|spruce|pine/i.test(fileName) && !/bush|grass|pratia|poppy/i.test(fileName);

      let defaultTexName = this._resolvePropTexture(baseModelName) || this._resolvePropTexture(fileName);
      if (!defaultTexName && isPratia) defaultTexName = 'matted_pratia.webp';
      if (!defaultTexName && isPoppy) defaultTexName = 'field_poppy.webp';
      const defaultTex = defaultTexName ? this._getOrLoadSharedPropTexture(defaultTexName, isGlb) : null;

      fbxObj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = isTree;
        o.receiveShadow = true;

        if (o.geometry && o.geometry.attributes.color) {
          o.geometry.deleteAttribute('color');
        }

        const meshName = (o.name || '').toLowerCase();
        const isMeshPlane = meshName.startsWith('plane') || /branch|leaf|leaves|crown|foliage|needle|frond/i.test(meshName);
        const isMeshTrunk = meshName.startsWith('cylinder') || /trunk|bark|stem|wood|log/i.test(meshName);

        // Normalize trunk UVs if they were mapped to an atlas sub-rectangle ([0.031..0.124], etc.)
        if (isMeshTrunk && o.geometry && o.geometry.attributes && o.geometry.attributes.uv) {
          const uvs = o.geometry.attributes.uv;
          let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
          for (let i = 0; i < uvs.count; i++) {
            const u = uvs.getX(i), v = uvs.getY(i);
            if (u < minU) minU = u;
            if (u > maxU) maxU = u;
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
          }
          if (minU < maxU && minV < maxV && (maxU - minU) < 0.35 && (maxV - minV) < 0.35) {
            const spanU = maxU - minU;
            const spanV = maxV - minV;
            for (let i = 0; i < uvs.count; i++) {
              const nu = (uvs.getX(i) - minU) / spanU;
              const nv = ((uvs.getY(i) - minV) / spanV) * 2.0;
              uvs.setXY(i, nu, nv);
            }
            uvs.needsUpdate = true;
          }
        }

        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        const cleanMats = mats.map((mat, matIdx) => {
          let diffuseMap = null;
          const matName = (mat && mat.name ? mat.name : '').toLowerCase();
          const isMatBranch = /branch|leaf|leaves|crown|foliage|needle|frond/i.test(matName);
          const isMatTrunk = /trunk|bark|stem|wood|log/i.test(matName);

          const isRetroFoliage = /^tree0*\d+/i.test(fileName) || /^tree0*\d+/i.test(baseModelName) || /retro/i.test(fileName) || /retro/i.test(baseModelName);

          const isTrunk = isMeshTrunk || isMatTrunk;
          const isCrown = !isTrunk && (isMatBranch || isMeshPlane || isRetroFoliage || (mats.length > 1 && matIdx > 0));

          if (isGlb && mat && mat.map && mat.map.isTexture) {
            diffuseMap = mat.map;
          } else if (isTrunk) {
            const barkTex = this._resolvePropTexture('tree_bark_rt_b_1') || 'tree_bark_rt_b_1.webp';
            diffuseMap = this._getOrLoadSharedPropTexture(barkTex);
          } else if (isTreeRt) {
            const rtCrown = this._resolvePropTexture('tree_rt_2_1') || 'tree_rt_2_1.webp';
            const barkTex = this._resolvePropTexture('tree_bark_rt_b_1') || 'tree_bark_rt_b_1.webp';
            diffuseMap = isCrown
              ? (defaultTex || this._getOrLoadSharedPropTexture(rtCrown))
              : this._getOrLoadSharedPropTexture(barkTex);
          } else {
            let subTexName = null;
            const isGenericMat = !matName || /^(default|material|mat|lambert|phong|tripo|atlas|texture|plane|bush\d*|grass\d*|tree\d*|plant)/i.test(matName);
            const isGenericMesh = !meshName || /^(default|mesh|object|group|tripo|plane|cylinder|bush\d*|grass\d*|tree\d*)/i.test(meshName);

            if (!isGenericMat) subTexName = this._resolvePropTexture(matName);
            if (!subTexName && !isGenericMesh) subTexName = this._resolvePropTexture(meshName);

            diffuseMap = (subTexName ? this._getOrLoadSharedPropTexture(subTexName, isGlb) : null) || defaultTex;
            if (!diffuseMap && mat && mat.map && mat.map.isTexture) diffuseMap = mat.map;
            if (!diffuseMap && isPratia) diffuseMap = this._getOrLoadSharedPropTexture('matted_pratia.webp');
            if (!diffuseMap && isPoppy) diffuseMap = this._getOrLoadSharedPropTexture('field_poppy.webp');
          }

          if (diffuseMap) {
            diffuseMap.colorSpace = THREE.SRGBColorSpace;
            // Повтор нужен любой общей текстуре из словаря (у GLB без встроенной
            // картинки — тоже: атлас-trim sheet тайлится по U). Встроенную в GLB не трогаем.
            const embeddedGlbMap = isGlb && mat && mat.map && diffuseMap === mat.map;
            if (!embeddedGlbMap) {
              diffuseMap.wrapS = THREE.RepeatWrapping;
              diffuseMap.wrapT = THREE.RepeatWrapping;
            }
            diffuseMap.generateMipmaps = true;
            diffuseMap.minFilter = THREE.LinearMipmapLinearFilter;
            diffuseMap.magFilter = THREE.LinearFilter;
            diffuseMap.anisotropy = 4;
            diffuseMap.needsUpdate = true;
          }

          const isCutoutFoliage = !isTrunk && (isCrown || isGroundcover || isRetroFoliage || (isTree && mats.length <= 1) || /fence|gate|market|fabric|bush|plant|flora|foliage|flower|grass|shrub|fern|reed|vine/i.test(fileName) || /bush|plant|flora|foliage|flower|grass|shrub|fern|reed|vine/i.test(baseModelName));
          const isClothOrCanopy = /market|stall|tent|banner|canopy|cloth|flag/i.test(fileName) || /market|stall|tent|banner|canopy|cloth|flag/i.test(baseModelName) || /fabric|cloth|canopy|roof|flag|banner/i.test(matName);
          const isDoubleSidedProp = isGlb ? (mat && mat.side === THREE.DoubleSide) : (isCutoutFoliage || isClothOrCanopy);
          const alphaTestVal = isGlb ? 0.0 : (isTrunk ? 0.0 : (isCutoutFoliage ? 0.15 : 0.0));
          const sideVal = isDoubleSidedProp ? THREE.DoubleSide : THREE.FrontSide;
          const isWindCandidate = !isGlb && (isTree || isGroundcover || /bush|fern|plant|branch|leaf|leaves|poppy|flower|grass|pratia|spruce|pine/i.test(fileName));

          if (!isWindCandidate) {
            return this._getSharedPropMaterial({
              map: diffuseMap,
              side: sideVal,
              alphaTest: alphaTestVal
            });
          }

          const cleanMat = new THREE.MeshLambertMaterial({
            map: diffuseMap,
            color: new THREE.Color(0xffffff),
            reflectivity: 0,
            flatShading: false,
            vertexColors: false,
            alphaTest: alphaTestVal,
            side: sideVal,
            depthWrite: true,
            transparent: false
          });
          cleanMat.needsUpdate = true;
          return cleanMat;
        });

        o.material = Array.isArray(o.material) ? cleanMats : (cleanMats[0] || o.material);
      });

      this._normalizeFbxPivot(fbxObj, fileName);
      return fbxObj;
    }

    _normalizeFbxPivot(obj, fileName) {
      if (!obj) return { height: 1 };
      if (obj.userData && obj.userData._pivotNormalized) return { height: obj.userData._normalizedHeight || 1 };
      if (!obj.userData) obj.userData = {};
      obj.userData._pivotNormalized = true;

      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      if (!isFinite(box.min.x) || box.isEmpty()) return { height: 1 };
      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);

      // Авто-масштабирование моделей кустов bush01-bush08 и деревьев tree01-tree36, экспортированных в сантиметрах (~750-2500 единиц)
      // В библиотеке defaultScale задан ~1.36 в расчете на 12.5м (12.5 * 1.36 = 17м) и ~0.37 в расчете на 7.5м (7.5 * 0.37 = 2.8м).
      const fName = String(fileName || '').toLowerCase();
      const isGlbModel = /\.(glb|gltf)$/i.test(fName);
      const isCentimeterBush = !isGlbModel && /^bush0[1-8](\.fbx)?$/i.test(fName) && !/winter/i.test(fName);
      const isCentimeterTree = !isGlbModel && /^tree(0[1-9]|[12]\d|3[0-6])(\.fbx)?$/i.test(fName) && !/winter/i.test(fName);
      const isExtremeCmModel = !isGlbModel && (size.y > 600 || size.x > 600 || size.z > 600) && !/tree_rt/i.test(fName) && !/winter/i.test(fName) && !/^tree\d{3}/i.test(fName);
      if (isCentimeterBush || isCentimeterTree || isExtremeCmModel) {
        const factor = 0.01;
        obj.scale.multiplyScalar(factor);
        obj.updateMatrixWorld(true);
        box.setFromObject(obj);
        box.getCenter(center);
        box.getSize(size);
      }

      obj.position.x -= center.x;
      obj.position.y -= box.min.y; // Выравнивание: основание модели ровно на y=0
      obj.position.z -= center.z;
      obj.userData._normalizedHeight = size.y;
      obj.updateMatrixWorld(true);
      return { height: size.y, size: size };
    }

    _cloneFbxModel(source) {
      if (!source) return null;
      const clone = source.clone(true);
      clone.traverse((o) => {
        // Модель с LOD в файле, поставленная без instanced: рисуем только ближний
        // ярус, иначе три LOD лягут друг на друга.
        if (o.isMesh && /_lod[12]$/i.test(o.name || '')) {
          o.visible = false;
          return;
        }
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;

          const reapplyWind = (origMat, clonedMat) => {
            if (!clonedMat) return clonedMat;
            clonedMat.alphaTest = origMat.alphaTest;
            clonedMat.side = origMat.side;
            clonedMat.depthWrite = true;
            if (origMat && origMat.userData && origMat.userData.hasWindShader && window.WindSystem && window.WindSystem.applyWindToMaterial) {
              delete clonedMat._windShaderApplied;
              if (clonedMat.userData) delete clonedMat.userData.hasWindShader;
              window.WindSystem.applyWindToMaterial(clonedMat, origMat.userData.foliageType || 'bush');
            }
            return clonedMat;
          };

          if (Array.isArray(o.material)) {
            const origList = Array.isArray(source.material) ? source.material : (source.material ? [source.material] : []);
            o.material = o.material.map((m, idx) => {
              if (!m) return m;
              const cl = m.clone();
              return reapplyWind(origList[idx] || m, cl);
            });
          } else if (o.material) {
            const cl = o.material.clone();
            o.material = reapplyWind(source.material || o.material, cl);
          }
        }
      });
      return clone;
    }

    _isPlayerProp(p) {
      if (!p) return false;
      if (p.editorKey === 'player_spawn' || p.id === 'player_spawn') return true;
      if (p.id === 'player_main' || p.id === 'player') return true;
      if (p.name && String(p.name).indexOf('Персонаж Игрока') !== -1) return true;
      return false;
    }

    _isIgnoredOrHelperProp(p) {
      if (!p) return true;
      const id = String(p.id || '');
      const name = String(p.name || '');
      const key = String(p.editorKey || '');
      if (id.includes('_editorColHelper') || name.includes('_editorColHelper') || key.includes('_editorColHelper')) return true;
      if (id.includes('ColHelper') || name.includes('ColHelper') || key.includes('ColHelper')) return true;
      if (p.meshType === 'col_helper' || p.isColHelper) return true;
      return false;
    }

    findMeshForProp(p) {
      if (!p || !this.scene) return null;
      const wantId = p.id;
      const wantKey = p.editorKey || (wantId === 'volcano' || wantId === 'terrain_ground' ? wantId : null);

      if (wantKey === 'volcano' || wantId === 'volcano' || p.geoVerts === 11085 ||
          (p.scale && p.scale.x > 100 && p.scale.z > 100 && wantKey !== 'mountains' && wantKey !== 'mountains_root')) {
        if (window.Volcano && window.Volcano.mesh) return window.Volcano.mesh;
        if (window.Volcano && window.Volcano.lod) return window.Volcano.lod;
        let vMesh = null;
        this.scene.traverse(c => {
          if (!vMesh && c.userData && c.userData.editorKey === 'volcano') vMesh = c;
          if (!vMesh && c.name === 'VolcanoMesh') vMesh = c;
        });
        if (vMesh) return vMesh;
      }
      if (wantId === 'named_MountainsRoot' || wantKey === 'mountains_root' || wantId === 'mountains_root' ||
          wantKey === 'mountains' || wantId === 'mountains' ||
          (p.finger && String(p.finger).indexOf('mountains_root') !== -1)) {
        if (window.Mountains && window.Mountains.root) return window.Mountains.root;
        let mRoot = null;
        this.scene.traverse(c => {
          if (!mRoot && c.name === 'MountainsRoot') mRoot = c;
          if (!mRoot && c.userData && c.userData.editorKey === 'mountains_root') mRoot = c;
        });
        if (mRoot) return mRoot;
        if (window.Mountains && window.Mountains.mesh) return window.Mountains.mesh;
      }
      if (wantKey === 'terrain_ground' || wantId === 'terrain_ground' || p.geoVerts === 24274) {
        if (window.Terrain && window.Terrain.mesh) return window.Terrain.mesh;
        let tMesh = null;
        this.scene.traverse(c => {
          if (!tMesh && c.userData && c.userData.editorKey === 'terrain_ground') tMesh = c;
          if (!tMesh && c.name && String(c.name).indexOf('TerrainSector') === 0) tMesh = c;
          if (!tMesh && c.name === 'TerrainGround') tMesh = c;
        });
        if (tMesh) return tMesh;
      }
      if (wantKey === 'water' || wantId === 'water' || wantKey === 'water_root' ||
          wantId === 'named_WaterRoot' || (wantId && String(wantId).indexOf('Water') !== -1 && p.meshType === 'scene_ref')) {
        if (window.WaterSystem && window.WaterSystem.mesh) return window.WaterSystem.mesh;
        if (window.WaterSystem && window.WaterSystem.root) return window.WaterSystem.root;
        let wMesh = null;
        this.scene.traverse(c => {
          if (!wMesh && c.userData && (c.userData.editorKey === 'water' || c.userData.editorKey === 'water_root')) wMesh = c;
          if (!wMesh && (c.name === 'OceanPlane' || c.name === 'WaterRoot')) wMesh = c;
        });
        if (wMesh) return wMesh;
      }
      return null;
    }

    spawnCustomPropMesh(p) {
      if (this.customPropMeshes.has(p.id)) return this.customPropMeshes.get(p.id);

      if (this.foliageInstancer && this.foliageInstancer.isFoliageProp(p)) {
        this.foliageInstancer.addInstance(p);
        return null;
      }

      if (p.meshType === 'collision_box') {
        const bw = (p.collisionSize && p.collisionSize.x) || 4.0;
        const bh = (p.collisionSize && p.collisionSize.y) || 3.0;
        const bd = (p.collisionSize && p.collisionSize.z) || 1.0;
        const offY = (p.collisionOffset && p.collisionOffset.y) || 0;

        const group = new THREE.Group();
        group.name = 'barrier_' + (p.id || Date.now());
        group.position.set(p.position.x, p.position.y || 0, p.position.z);
        if (p.rotation) group.rotation.set(p.rotation.x || 0, p.rotation.y || 0, p.rotation.z || 0);
        if (p.scale) group.scale.set(p.scale.x || 1, p.scale.y || 1, p.scale.z || 1);

        const boxGeo = new THREE.BoxGeometry(bw, bh, bd);
        const boxMat = new THREE.MeshBasicMaterial({ visible: false });
        const boxMesh = new THREE.Mesh(boxGeo, boxMat);
        boxMesh.position.y = bh / 2 + offY;
        group.add(boxMesh);

        group.userData = {
          isCustomProp: true,
          isCollisionBarrier: true,
          propId: p.id,
          propData: p
        };

        if (this.scene) this.scene.add(group);
        this.customPropMeshes.set(p.id, group);
        return group;
      }

      const fileName = this.foliageInstancer.getResolvedFileName(p);
      const group = new THREE.Group();
      group.name = 'prop_' + (p.id || Date.now());
      group.position.set(p.position.x, p.position.y || 0, p.position.z);
      if (p.rotation) group.rotation.set(p.rotation.x || 0, p.rotation.y || 0, p.rotation.z || 0);
      if (p.scale) group.scale.set(p.scale.x || 1, p.scale.y || 1, p.scale.z || 1);

      group.userData = {
        isCustomProp: true,
        propId: p.id,
        propData: p,
        fileName: fileName
      };

      if (this.scene) this.scene.add(group);
      this.customPropMeshes.set(p.id, group);

      if (this._fbxPropCache.has(fileName)) {
        const cached = this._fbxPropCache.get(fileName);
        if (cached && (!cached.userData || !cached.userData._pivotNormalized)) {
          this._normalizeFbxPivot(cached, fileName);
        }
        const cloned = this._cloneFbxModel(cached);
        if (cloned) {
          cloned.traverse(c => {
            if (c.isMesh) {
              c.userData = group.userData;
              c.castShadow = true;
              c.receiveShadow = true;
            }
          });
          group.add(cloned);
        }
      } else {
        if (this._pendingFbxGroups.has(fileName)) {
          this._pendingFbxGroups.get(fileName).push(group);
        } else {
          this._pendingFbxGroups.set(fileName, [group]);
          let settleGrp = null;
          if (typeof Promise !== 'undefined') {
            if (!this._pendingFbxGroupPromises) this._pendingFbxGroupPromises = new Map();
            this._pendingFbxGroupPromises.set(fileName, new Promise(res => { settleGrp = res; }));
          }
          const resolveGrp = () => {
            if (this._pendingFbxGroupPromises) this._pendingFbxGroupPromises.delete(fileName);
            if (settleGrp) { const fn = settleGrp; settleGrp = null; fn(); }
          };
          this.loadPropModel(
            fileName,
            (fbxObj) => {
              try {
                this._prepareLoadedFbx(fbxObj, fileName);
                this._fbxPropCache.set(fileName, fbxObj);

                const pendingList = this._pendingFbxGroups.get(fileName) || [];
                this._pendingFbxGroups.delete(fileName);

                pendingList.forEach(tgtGroup => {
                  if (!tgtGroup) return;
                  const pl = tgtGroup.getObjectByName('_placeholder');
                  if (pl) tgtGroup.remove(pl);
                  const cloned = this._cloneFbxModel(fbxObj);
                  if (cloned) {
                    cloned.traverse(c => {
                      if (c.isMesh) {
                        c.userData = tgtGroup.userData;
                        c.castShadow = true;
                        c.receiveShadow = true;
                      }
                    });
                    tgtGroup.add(cloned);
                  }
                });
              } catch (e) {
                console.error('[WorldContent] Error setting up loaded model:', fileName, e);
              } finally {
                resolveGrp();
              }
            },
            (err) => {
              console.warn('[WorldContent] Could not load model:', fileName, err);
              this._pendingFbxGroups.delete(fileName);
              resolveGrp();
            }
          );
        }
      }

      return group;
    }

    loadCustomPropsFromWM(onlyMissingSceneRefs) {
      const WM = window.WorldMetrics;
      if (!WM || !WM.CUSTOM_PROPS) return 0;
      const props = WM.CUSTOM_PROPS;
      const inEditor = !!(window.isSceneEditorActive && window.isSceneEditorActive());
      const propsChanged = this._lastBuiltPropsRef !== props || this._lastBuiltPropsLen !== props.length;

      if (onlyMissingSceneRefs && !inEditor && !propsChanged && this._pendingSceneRefs === 0) {
        return 0;
      }

      let applied = 0;
      let missingSceneRefs = 0;
      const doFullInstancer = !onlyMissingSceneRefs || inEditor || propsChanged;
      props.forEach(p => {
        if (WM.isMeshDeleted && (WM.isMeshDeleted(p.id) || WM.isMeshDeleted(p.editorKey))) return;
        if (this._isPlayerProp(p)) return;

        if (this.foliageInstancer && this.foliageInstancer.isFoliageProp(p)) {
          if (doFullInstancer) {
            this.foliageInstancer.registerInstance(p);
            applied++;
          }
          return;
        }

        if (this._isIgnoredOrHelperProp(p)) return;

        const existingMesh = this.findMeshForProp(p);
        if (existingMesh) {
          if (p.position) {
            existingMesh.position.set(p.position.x, p.position.y, p.position.z);
            if (existingMesh.worldCenter) {
              existingMesh.worldCenter.set(p.position.x, p.position.y, p.position.z);
            }
          }
          if (p.rotation) existingMesh.rotation.set(p.rotation.x || 0, p.rotation.y || 0, p.rotation.z || 0);
          if (p.scale) existingMesh.scale.set(p.scale.x || 1, p.scale.y || 1, p.scale.z || 1);
          existingMesh.updateMatrixWorld(true);
          this.customPropMeshes.set(p.id, existingMesh);
          applied++;
        } else if (p.meshType === 'scene_ref') {
          missingSceneRefs++;
        } else if (p.meshType) {
          this.spawnCustomPropMesh(p);
          applied++;
        }
      });

      this._pendingSceneRefs = missingSceneRefs;

      if (doFullInstancer && this.foliageInstancer) {
        this.foliageInstancer.rebuildFromCustomProps(props);
        this._lastBuiltPropsRef = props;
        this._lastBuiltPropsLen = props.length;
        if (window.PropsCollision && typeof window.PropsCollision.invalidate === 'function') {
          window.PropsCollision.invalidate();
        }
      } else if (missingSceneRefs === 0 && applied > 0 && window.PropsCollision && typeof window.PropsCollision.invalidate === 'function') {
        window.PropsCollision.invalidate();
      }

      return applied;
    }

    applySavedTransforms() {
      const WM = window.WorldMetrics;
      if (!WM) return 0;

      if (!this._overridesHydrated && window.WORLD_DATA && WM.applyEditorOverrides) {
        try {
          WM.applyEditorOverrides(window.WORLD_DATA);
          this._overridesHydrated = true;
          if (window.PropsCollision && typeof window.PropsCollision.invalidate === 'function') {
            window.PropsCollision.invalidate();
          }
        } catch (e) {}
      }

      // NPC (высота с учётом террейна и проходимых полов пропсов)
      if (this.game && this.game.npcManager && this.game.npcManager.npcs) {
        const cityAndRegion = WM.buildCityNPCs().concat(WM.buildRegionNPCs());
        this.game.npcManager.npcs.forEach(npc => {
          const match = cityAndRegion.find(n => n.id === npc.template.id);
          if (match && match.position && npc.mesh) {
            let gh = window.Terrain ? window.Terrain.heightAt(match.position.x, match.position.z) : 0;
            if (window.BspBrushes && typeof window.BspBrushes.standYAt === 'function') {
              const by = window.BspBrushes.standYAt(match.position.x, match.position.z);
              if (by != null && isFinite(by) && by > gh && by - gh <= 4.0) gh = by;
            }
            if (window.PropsCollision && typeof window.PropsCollision.standYAt === 'function') {
              const pyTop = window.PropsCollision.standYAt(match.position.x, match.position.z, gh + 2.2);
              if (pyTop != null && isFinite(pyTop) && pyTop > gh && pyTop - gh <= 4.0) gh = pyTop;
            }
            const baseY = Math.max(gh, (window.Terrain ? window.Terrain.seaLevel - 0.3 : 0)) + (npc.template.scale || 2.0) / 2;
            npc.baseY = baseY;
            npc.mesh.position.set(match.position.x, baseY, match.position.z);
            if (npc.shadow) npc.shadow.position.set(match.position.x, gh + 0.02, match.position.z);
          }
        });
      }

      try {
        if (window.BspBrushes && this.scene) {
          window.BspBrushes.ensureRoot(this.scene);
          window.BspBrushes.rebuildAll(this.scene);
          if (typeof window.BspBrushes.setEditorMode === 'function') window.BspBrushes.setEditorMode(false);
          if (typeof window.BspBrushes.setAutoBuild === 'function') window.BspBrushes.setAutoBuild(true);
        }
      } catch (eBsp) { /* BSP опционален */ }

      const applied = this.loadCustomPropsFromWM(false);
      this.scheduleReapply();
      return applied;
    }

    scheduleReapply() {
      if (this._reapplyScheduled) return;
      this._reapplyScheduled = true;
      const delays = [600, 1800, 4200];
      delays.forEach(d => {
        setTimeout(() => {
          if (this.loadCustomPropsFromWM) this.loadCustomPropsFromWM(true);
        }, d);
      });
    }

    async waitUntilReady(opts) {
      opts = opts || {};
      const center = opts.center || { x: 0, z: 0 };
      const radius = opts.radius != null ? opts.radius : 420;
      const timeoutMs = opts.timeoutMs || 18000;
      const deadline = Date.now() + timeoutMs;

      this._blockingWaitActive = true;
      try {
        if (this.foliageInstancer && typeof this.foliageInstancer.waitBatchesNear === 'function') {
          await this.foliageInstancer.waitBatchesNear(
            center.x || 0,
            center.z || 0,
            radius,
            Math.max(1000, deadline - Date.now())
          );
          if (typeof this.foliageInstancer.flushSetupQueueSync === 'function') {
            this.foliageInstancer.flushSetupQueueSync();
          }
        }

        if (this._pendingFbxGroupPromises && this._pendingFbxGroupPromises.size > 0) {
          const gProms = Array.from(this._pendingFbxGroupPromises.values());
          await Promise.race([
            Promise.all(gProms),
            new Promise(r => setTimeout(r, Math.max(500, deadline - Date.now())))
          ]);
        }

        if (this._sharedPropTexPromises && this._sharedPropTexPromises.size > 0) {
          const tProms = Array.from(this._sharedPropTexPromises.values());
          await Promise.race([
            Promise.all(tProms),
            new Promise(r => setTimeout(r, Math.max(500, deadline - Date.now())))
          ]);
        }

        const g = this.game || window.game;
        if (g && g.renderer && typeof g.renderer.initTexture === 'function' && this._sharedPropTextures) {
          this._sharedPropTextures.forEach((tex) => {
            if (tex && tex.image) {
              try { g.renderer.initTexture(tex); } catch (_) {}
            }
          });
        }
      } finally {
        this._blockingWaitActive = false;
      }
    }
  }

  // Fallback helper for isSceneEditorActive
  if (typeof window !== 'undefined' && typeof window.isSceneEditorActive !== 'function') {
    window.isSceneEditorActive = function () {
      try {
        if (window.game && window.game.editor && window.game.editor.enabled) return true;
        if (window.editor && window.editor.enabled) return true;
      } catch (e) {}
      return false;
    };
  }

  // PLAN 4.6: заглушки до ленивой загрузки editor.js (welcome.gm).
  if (typeof window !== 'undefined') {
    if (typeof window.isEditorAllowed !== 'function') {
      window.isEditorAllowed = function () { return !!window.__editorAllowed; };
    }
    if (typeof window.setEditorAllowed !== 'function') {
      window.setEditorAllowed = function (v) {
        window.__editorAllowed = !!v;
        var btn = document.getElementById('editor-toggle-btn');
        if (!btn && window.__editorAllowed && typeof document !== 'undefined' && document.body) {
          btn = document.createElement('button');
          btn.id = 'editor-toggle-btn';
          btn.innerHTML = '🛠️ РЕДАКТОР СЦЕНЫ (F2)';
          btn.style.cssText = 'position:fixed;top:var(--hud-top, 8px);right:calc(var(--radar-frame-width, 196px) + 10px);z-index:700;background:linear-gradient(180deg,#aa6622,#663311);color:#fff;border:1px solid #ffaa44;padding:clamp(3px, 0.6vh, 6px) clamp(6px, 1vw, 12px);font-size:clamp(9.5px, 1.1vw, 12px);border-radius:4px;font-family:monospace;font-weight:bold;cursor:pointer;box-shadow:0 0 10px rgba(0,0,0,0.8);white-space:nowrap;';
          btn.onclick = function () {
            if (window.game && window.game.editor && typeof window.game.editor.toggle === 'function') {
              window.game.editor.toggle();
            } else if (typeof window.__ensureSceneEditor === 'function') {
              window.__ensureSceneEditor(window.game).then(function (ed) {
                if (ed && typeof ed.toggle === 'function') ed.toggle(true);
              });
            }
          };
          document.body.appendChild(btn);
        }
        if (btn) btn.style.display = window.__editorAllowed ? '' : 'none';
        if (!window.__editorAllowed) {
          var ed = (window.game && window.game.editor) || window.editor;
          if (ed && ed.enabled && typeof ed.toggle === 'function') ed.toggle(false);
        }
      };
    }
  }

  window.WorldContent = WorldContent;
})();
