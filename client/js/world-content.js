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
    }

    isFoliageProp(p) {
      if (!p) return false;
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
      const libItem = lib ? lib.getById(p.modelId || p.meshType || p.modelFile) : null;
      let fileName = p.modelFile || (libItem && libItem.file) || (p.modelId ? (p.modelId.endsWith('.fbx') ? p.modelId : p.modelId + '.fbx') : (p.meshType && p.meshType.endsWith('.fbx') ? p.meshType : (p.meshType || 'tree01') + '.fbx'));
      if (!fileName.endsWith('.fbx')) fileName += '.fbx';
      return fileName;
    }

    registerInstance(p) {
      if (!p || !p.position) return;
      const fileName = this.getResolvedFileName(p);
      let batch = this.batches.get(fileName);
      if (!batch) {
        const isTree = !!((/tree|spruce|pine/i.test(fileName) || (p && /tree|spruce|pine/i.test(p.modelId || p.meshType || ''))) && !/bush/i.test(fileName));
        const isGroundcover = /pratia|poppy|flower|grass/i.test(fileName);
        batch = {
          fileName: fileName,
          subMeshes: [],
          lod1SubMeshes: [],
          lod2SubMeshes: [],
          capacity: 0,
          instances: [],
          isTree: isTree,
          isGroundcover: isGroundcover
        };
        this.batches.set(fileName, batch);
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
      });
      if (!Array.isArray(props)) return;
      props.forEach(p => {
        if (this.isFoliageProp(p)) {
          this.registerInstance(p);
        }
      });
      this.batches.forEach(batch => {
        this._ensureModelAndSync(batch);
      });
    }

    _ensureModelAndSync(batch) {
      const fileName = batch.fileName;
      const cache = this.worldContent._fbxPropCache;
      if (cache && cache.has(fileName)) {
        const fbxObj = cache.get(fileName);
        if (fbxObj && (!fbxObj.userData || !fbxObj.userData._pivotNormalized)) {
          this.worldContent._normalizeFbxPivot(fbxObj, fileName);
        }
        this._buildSubMeshesFromTemplate(batch, fbxObj);
        this._syncBatch(batch);
        return;
      }

      if (this._pendingFbxLoads.has(fileName)) {
        return;
      }
      this._pendingFbxLoads.add(fileName);

      const loader = this.worldContent.getFBXLoader();
      if (!loader) return;

      loader.load(
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
            this._buildSubMeshesFromTemplate(batch, fbxObj);
            this._syncBatch(batch);
          } catch (e) {
            console.error('[FoliageInstancer] Error setting up FBX:', fileName, e);
          }
        },
        undefined,
        (err) => {
          this._pendingFbxLoads.delete(fileName);
          console.warn('[FoliageInstancer] Failed to load FBX:', fileName, err);
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

      fbxObj.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        child.updateMatrixWorld(true);
        const bakedGeo = child.geometry.clone();
        bakedGeo.applyMatrix4(child.matrixWorld);
        if (!bakedGeo.attributes.normal) {
          bakedGeo.computeVertexNormals();
        }

        const meshName = (child.name || '').toLowerCase();
        const isTrunk = meshName.startsWith('cylinder') || /trunk|bark|stem|wood|log/i.test(meshName);
        const isSolidProp = /rock|stone|boulder|stump|log|house|building|wall|fence|barrier|barrel|crate|plank|wood|mannequin|statue|monument|bench|chapel|boiler|airship|tp_zone/i.test(fName);

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

        lod0Entries.push({
          geometry: bakedGeo,
          material: mat,
          instancedMesh: null
        });

        const isBush = /bush|shrub|fern|reed|grass_bush/i.test(fName) || /bush|shrub|fern|reed|grass_bush/i.test(meshName);
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

      batch.subMeshes = lod0Entries;
      batch.lod1SubMeshes = lod1Entries;
      batch.lod2SubMeshes = lod2Entries;
    }

    _canBatchCastShadow(batch, namePrefix) {
      if (!batch || !batch.isTree) return false;
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
        if (!batch.isTree) return;
        const setTierShadow = (meshList, canCast) => {
          if (!meshList) return;
          meshList.forEach(sub => {
            if (sub && sub.instancedMesh) {
              sub.instancedMesh.castShadow = canCast;
            }
          });
        };
        setTierShadow(batch.subMeshes, !isOff);
        setTierShadow(batch.lod1SubMeshes, !isOff);
        setTierShadow(batch.lod2SubMeshes, !isOff);
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
        const isSolid = /rock|stone|boulder|stump|log|house|building|wall/i.test(fName);

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

        const effMaxDist = isEditor ? Math.min(maxDist * 1.5, 450.0) : maxDist;
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
          const inFrustum = isNearImmune || ((visMgr && typeof visMgr.isSphereInFrustum === 'function')
            ? visMgr.isSphereInFrustum(pos.x, py + treeHeight, pos.z, treeRadius + frustumMargin)
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

        const updateTier = (meshList, cCount) => {
          if (!meshList) return;
          meshList.forEach(sub => {
            if (sub.instancedMesh) {
              sub.instancedMesh.count = cCount;
              if (cCount > 0) {
                sub.instancedMesh.instanceMatrix.needsUpdate = true;
                sub.instancedMesh.visible = true;
              } else {
                sub.instancedMesh.visible = false;
              }
            }
          });
        };

        updateTier(batch.subMeshes, visLod0);
        updateTier(batch.lod1SubMeshes, visLod1);
        updateTier(batch.lod2SubMeshes, visLod2);
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
      this._sharedPropTextures = new Map();
      this._knownTexturesMap = null;
      this._overridesHydrated = false;
      this._reapplyAttempt = 0;

      if (this.game) {
        this.game.worldContent = this;
        this.game.foliageInstancer = this.foliageInstancer;
      }
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

      // 5. Classic Fallback families
      if (base.startsWith('wood')) return this._knownTexturesMap.get('wood.png') || 'Wood.png';
      if (base.startsWith('pinebranch')) return this._knownTexturesMap.get('pinebranch.png') || 'PineBranch.png';
      if (base.startsWith('sprucebranch')) return this._knownTexturesMap.get('sprucebranch.png') || 'SpruceBranch.png';
      if (base.startsWith('pine')) return this._knownTexturesMap.get('pine.png') || 'Pine.png';
      if (base.startsWith('spruce') || base.startsWith('spurce')) return this._knownTexturesMap.get('spruce.png') || 'Spruce.png';
      if (base.startsWith('stump')) return this._knownTexturesMap.get('stump_1.png') || 'Stump_1.png';
      if (base.startsWith('house_') || base.startsWith('house')) return this._knownTexturesMap.get('house_01.webp') || 'house_01.webp';
      if (base.startsWith('forge')) return this._knownTexturesMap.get('house_engineer_01.webp') || 'house_engineer_01.webp';
      if (base.startsWith('grocery') || base.startsWith('warrior_shop')) return this._knownTexturesMap.get('house_05.webp') || 'house_05.webp';
      if (base.startsWith('warehouse')) return this._knownTexturesMap.get('warehouse_01.webp') || 'warehouse_01.webp';
      if (base.startsWith('market_stall')) return this._knownTexturesMap.get('market_stall_01.webp') || 'market_stall_01.webp';
      if (base.startsWith('tent')) return this._knownTexturesMap.get('tent_02.webp') || 'tent_02.webp';

      return null;
    }

    _getOrLoadSharedPropTexture(fileName) {
      if (!fileName) return null;
      if (!this._sharedPropTextures) this._sharedPropTextures = new Map();
      if (this._sharedPropTextures.has(fileName)) return this._sharedPropTextures.get(fileName);
      const texLoader = new THREE.TextureLoader();
      const tex = texLoader.load('assets/props/textures/' + fileName + '?v=tree-fix-5', (loaded) => {
        if (loaded) {
          loaded.colorSpace = THREE.SRGBColorSpace;
          loaded.generateMipmaps = true;
          loaded.minFilter = THREE.LinearMipmapLinearFilter;
          loaded.magFilter = THREE.LinearFilter;
          loaded.anisotropy = 4;
          loaded.needsUpdate = true;
        }
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 4;
      this._sharedPropTextures.set(fileName, tex);
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

    _prepareLoadedFbx(fbxObj, fileName) {
      const baseModelName = fileName.replace(/\.fbx$/i, '');
      const isTreeRt = /tree_rt/i.test(fileName);
      const isPratia = /pratia/i.test(fileName) || /pratia/i.test(baseModelName);
      const isPoppy = /poppy/i.test(fileName) || /poppy/i.test(baseModelName);
      const isGroundcover = isPratia || isPoppy || /flower|grass/i.test(fileName) || /flower|grass/i.test(baseModelName);
      const isTree = /tree|spruce|pine/i.test(fileName) && !/bush|grass|pratia|poppy/i.test(fileName);

      let defaultTexName = this._resolvePropTexture(baseModelName) || this._resolvePropTexture(fileName);
      if (!defaultTexName && isPratia) defaultTexName = 'matted_pratia.webp';
      if (!defaultTexName && isPoppy) defaultTexName = 'field_poppy.webp';
      const defaultTex = defaultTexName ? this._getOrLoadSharedPropTexture(defaultTexName) : null;

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

          if (isTrunk) {
            diffuseMap = this._getOrLoadSharedPropTexture('tree_bark_rt_b_1.png');
          } else if (isTreeRt) {
            diffuseMap = isCrown
              ? (defaultTex || this._getOrLoadSharedPropTexture('tree_rt_2_1.png'))
              : this._getOrLoadSharedPropTexture('tree_bark_rt_b_1.png');
          } else {
            let subTexName = null;
            const isGenericMat = !matName || /^(default|material|mat|lambert|phong|tripo|atlas|texture|plane|bush\d*|grass\d*|tree\d*|plant)/i.test(matName);
            const isGenericMesh = !meshName || /^(default|mesh|object|group|tripo|plane|cylinder|bush\d*|grass\d*|tree\d*)/i.test(meshName);

            if (!isGenericMat) subTexName = this._resolvePropTexture(matName);
            if (!subTexName && !isGenericMesh) subTexName = this._resolvePropTexture(meshName);

            diffuseMap = (subTexName ? this._getOrLoadSharedPropTexture(subTexName) : null) || defaultTex;
            if (!diffuseMap && isPratia) diffuseMap = this._getOrLoadSharedPropTexture('matted_pratia.webp');
            if (!diffuseMap && isPoppy) diffuseMap = this._getOrLoadSharedPropTexture('field_poppy.webp');
          }

          if (diffuseMap) {
            diffuseMap.colorSpace = THREE.SRGBColorSpace;
            diffuseMap.wrapS = THREE.RepeatWrapping;
            diffuseMap.wrapT = THREE.RepeatWrapping;
            diffuseMap.generateMipmaps = true;
            diffuseMap.minFilter = THREE.LinearMipmapLinearFilter;
            diffuseMap.magFilter = THREE.LinearFilter;
            diffuseMap.anisotropy = 4;
            diffuseMap.needsUpdate = true;
          }

          const isCutoutFoliage = !isTrunk && (isCrown || isGroundcover || isRetroFoliage || (isTree && mats.length <= 1) || /fence|gate|market|fabric|bush|plant|flora|foliage|flower|grass|shrub|fern|reed|vine/i.test(fileName) || /bush|plant|flora|foliage|flower|grass|shrub|fern|reed|vine/i.test(baseModelName));
          const isClothOrCanopy = /market|stall|tent|banner|canopy|cloth|flag/i.test(fileName) || /market|stall|tent|banner|canopy|cloth|flag/i.test(baseModelName) || /fabric|cloth|canopy|roof|flag|banner/i.test(matName);
          const isDoubleSidedProp = isCutoutFoliage || isClothOrCanopy;

          const cleanMat = new THREE.MeshLambertMaterial({
            map: diffuseMap,
            color: new THREE.Color(0xffffff),
            reflectivity: 0,
            flatShading: false,
            vertexColors: false,
            alphaTest: isTrunk ? 0.0 : (isCutoutFoliage ? 0.15 : 0.0),
            side: isDoubleSidedProp ? THREE.DoubleSide : THREE.FrontSide,
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
      const isCentimeterBush = /^bush0[1-8](\.fbx)?$/i.test(fName) && !/winter/i.test(fName);
      const isCentimeterTree = /^tree(0[1-9]|[12]\d|3[0-6])(\.fbx)?$/i.test(fName) && !/winter/i.test(fName);
      const isExtremeCmModel = (size.y > 600 || size.x > 600 || size.z > 600) && !/tree_rt/i.test(fName) && !/winter/i.test(fName) && !/^tree\d{3}/i.test(fName);
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
          const loader = this.getFBXLoader();
          if (loader) {
            loader.load(
              fileName,
              (fbxObj) => {
                try {
                  this._prepareLoadedFbx(fbxObj, fileName);
                  this._fbxPropCache.set(fileName, fbxObj);

                  const pendingList = this._pendingFbxGroups.get(fileName) || [];
                  this._pendingFbxGroups.delete(fileName);

                  pendingList.forEach(tgtGroup => {
                    if (!tgtGroup) return;
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
                  console.error('[WorldContent] Error setting up loaded FBX:', fileName, e);
                }
              },
              undefined,
              (err) => {
                console.warn('[WorldContent] Could not load FBX:', fileName, err);
                this._pendingFbxGroups.delete(fileName);
              }
            );
          }
        }
      }

      return group;
    }

    loadCustomPropsFromWM() {
      const WM = window.WorldMetrics;
      if (!WM || !WM.CUSTOM_PROPS) return 0;
      const props = WM.CUSTOM_PROPS;

      let applied = 0;
      props.forEach(p => {
        if (WM.isMeshDeleted && (WM.isMeshDeleted(p.id) || WM.isMeshDeleted(p.editorKey))) return;
        if (this._isPlayerProp(p)) return;

        if (this.foliageInstancer && this.foliageInstancer.isFoliageProp(p)) {
          this.foliageInstancer.registerInstance(p);
          applied++;
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
        } else if (p.meshType && p.meshType !== 'scene_ref') {
          this.spawnCustomPropMesh(p);
          applied++;
        }
      });

      if (this.foliageInstancer) {
        this.foliageInstancer.rebuildFromCustomProps(props);
      }

      if (window.PropsCollision && typeof window.PropsCollision.invalidate === 'function') {
        window.PropsCollision.invalidate();
      }

      return applied;
    }

    applySavedTransforms() {
      const WM = window.WorldMetrics;
      if (!WM) return 0;

      if (!this._overridesHydrated && window.EDITOR_OVERRIDES_DATA && WM.applyEditorOverrides) {
        try {
          WM.applyEditorOverrides(window.EDITOR_OVERRIDES_DATA);
          this._overridesHydrated = true;
        } catch (e) {}
      }

      // NPC
      if (this.game && this.game.npcManager && this.game.npcManager.npcs) {
        const cityAndRegion = WM.buildCityNPCs().concat(WM.buildRegionNPCs());
        this.game.npcManager.npcs.forEach(npc => {
          const match = cityAndRegion.find(n => n.id === npc.template.id);
          if (match && match.position && npc.mesh) {
            const gh = window.Terrain ? window.Terrain.heightAt(match.position.x, match.position.z) : 0;
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

      const applied = this.loadCustomPropsFromWM();
      this.scheduleReapply();
      return applied;
    }

    scheduleReapply() {
      if (this._reapplyScheduled) return;
      this._reapplyScheduled = true;
      const delays = [400, 1000, 2500, 5000];
      delays.forEach(d => {
        setTimeout(() => {
          if (this.loadCustomPropsFromWM) this.loadCustomPropsFromWM();
        }, d);
      });
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
