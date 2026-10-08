// ============================================================
//  CLIENT / JS / EDITOR.JS  —  3D Редактор ВСЕХ объектов сцены (Unreal Engine Style)
//  Позволяет выбирать и трансформировать АБСОЛЮТНО ЛЮБОЙ 3D-объект, 3D-модель,
//  персонажа игрока (Player), NPC, моба или декорацию в сцене.
//  Поддерживает режимы: [W] Перемещение, [E] Вращение, [R] Масштабирование,
//  автоматический масштаб пивота под расстояние до камеры и полную
//  совместимость с режимом полёта (Fly Mode).
// ============================================================
(function () {
  'use strict';
  const THREE = window.THREE;

  function isSceneEditorActive() {
    try {
      if (typeof window !== 'undefined') {
        if (window._forceEditorMode) return true;
        if (window.game && window.game.editor && window.game.editor.enabled) return true;
        if (window.editor && window.editor.enabled) return true;
      }
      return false;
    } catch (e) { return false; }
  }
  window.isSceneEditorActive = isSceneEditorActive;

  function isEditorBrushActive() {
    try {
      if (typeof window !== 'undefined') {
        var ed = (window.game && window.game.editor) || window.editor;
        if (!ed || !ed.enabled) return false;
        if (ed.foliageIsDrawing || ed.paintIsDrawing) return true;
        var m = ed.editorMode || ed.workspaceMode;
        return (m === 'foliage' || m === 'paint' || !!ed.drawFoliageMode || !!ed.drawPaintMode);
      }
      return false;
    } catch (e) { return false; }
  }
  window.isEditorBrushActive = isEditorBrushActive;

  // ============================================================
  //  ГЕЙТ РЕДАКТОРА
  //  Раньше F2 открывал редактор ЛЮБОМУ игроку. Теперь ключ — gm из welcome.
  //  PLAN 4.6: класс больше не грузится игроку. Мир спавнит WorldContent.
  //  editor.js подключается из editor.html или лениво для GM (__ensureSceneEditor).
  // ============================================================
  var editorAllowed = !!(typeof window !== 'undefined' && (window.__editorAllowed || window.PS_GM));
  function setEditorAllowed(v) {
    editorAllowed = !!v;
    if (typeof window !== 'undefined') window.__editorAllowed = editorAllowed;
    var btn = document.getElementById('editor-toggle-btn');
    if (btn) btn.style.display = editorAllowed ? '' : 'none';
    if (!editorAllowed) {
      var ed = (window.game && window.game.editor) || window.editor;
      if (ed && ed.enabled && typeof ed.toggle === 'function') ed.toggle(false);
    }
  }
  window.setEditorAllowed = setEditorAllowed;
  window.isEditorAllowed = function () { return editorAllowed; };

  // ============================================================
  //  FOLIAGE INSTANCER (Hardware InstancedMesh 3-Tier Quad-Preserved LOD for 60 FPS)
  // ============================================================
  class FoliageInstancer {
    constructor(editor) {
      this.editor = editor;
      this.scene = editor.scene;
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
      if (this.editor._fbxPropCache && this.editor._fbxPropCache.has(fileName)) {
        const fbxObj = this.editor._fbxPropCache.get(fileName);
        if (fbxObj && (!fbxObj.userData || !fbxObj.userData._pivotNormalized)) {
          this.editor._normalizeFbxPivot(fbxObj, fileName);
        }
        this._buildSubMeshesFromTemplate(batch, fbxObj);
        this._syncBatch(batch);
        return;
      }

      if (this._pendingFbxLoads.has(fileName)) {
        return;
      }
      this._pendingFbxLoads.add(fileName);

      const loader = this.editor.getFBXLoader();
      if (!loader) return;

      loader.load(
        fileName,
        (fbxObj) => {
          this._pendingFbxLoads.delete(fileName);
          try {
            this.editor._prepareLoadedFbx(fbxObj, fileName);
            if (!fbxObj.userData || !fbxObj.userData._pivotNormalized) {
              this.editor._normalizeFbxPivot(fbxObj, fileName);
            }
            if (!this.editor._fbxPropCache) this.editor._fbxPropCache = new Map();
            this.editor._fbxPropCache.set(fileName, fbxObj);
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

    /**
     * True High-Quality Quad-Preserving 3D LOD Generator:
     * Groups shared-edge triangles into whole quads (leaves, petals, branch cards).
     * Subsamples whole quads/components without breaking quads in half or collapsing vertices.
     * Zero distortion, zero black boxes, zero severed triangle shards!
     */
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

      // For solid cylindrical trunks: keep full base geometry
      if (isTrunk) {
        if (factor >= 0.3) return geo.clone();
      }

      // 1. Identify paired triangles (quads) that share an edge
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

      // Group into whole geometric components (complete leaf quads)
      const components = [];
      triPairs.forEach(pair => {
        components.push([rawTris[pair[0]], rawTris[pair[1]]]);
      });
      for (let i = 0; i < rawTris.length; i++) {
        if (!triUsed[i]) {
          components.push([rawTris[i]]);
        }
      }

      // 2. Subsample whole components evenly distributed across space
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

      // 3. Build clean, compact BufferGeometry with exact coordinates
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
        bakedGeo.computeVertexNormals();

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
            window.WindSystem.applyWindToMaterial(cl, folType);
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

        // LOD 0: 100% full original AAA 3D model
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

    /**
     * 3-Tier True 3D Quad-Preserving LOD with 250m 360° Near Immunity & Smooth Distance Culling
     * Preserves 100% visual fidelity without holes on rocks, seamless shadows, and ultra-wide visibility.
     */
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

        // Extended 3-Tier distance ranges:
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
          // Bushes & standard flora
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

          // Distance Culling
          if (dist2 > effMaxDist2) {
            stats.distanceCulled++;
            continue;
          }

          // Frustum Culling
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

          // Instance is Visible -> write matrix
          const rot = p.rotation || { x: 0, y: 0, z: 0 };
          const sc = p.scale || { x: 1, y: 1, z: 1 };

          dummy.position.set(pos.x, py, pos.z);
          dummy.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
          dummy.scale.set(sc.x || 1, sc.y || 1, sc.z || 1);
          dummy.updateMatrix();

          // 3-Tier Dispatch
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

        // Apply counts and update flags
        const updateTier = (meshList, count) => {
          if (!meshList) return;
          meshList.forEach(sub => {
            if (sub.instancedMesh) {
              sub.instancedMesh.count = count;
              if (count > 0) {
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
  window.FoliageInstancer = FoliageInstancer;

  class SceneEditor {
    constructor(game) {
      this.game = game;
      this.scene = game.scene;
      this.camera = game.camera;

      this.enabled = false;
      // Workspace: select | bsp | zones | sites
      this.editorMode = 'select'; // 'select' | 'bsp' | 'zones' | 'sites'
      this.mode = 'translate'; // 'translate' (W), 'rotate' (E), 'scale' (R)
      this.selectedObject = null;
      this.filterCategory = 'all'; // активная «группа» в dropdown — клик только по ней
      this.terrainSnap = false; // Отключен по умолчанию, чтобы можно было свободно двигать 3D-модели вверх/вниз
      this.gridSnap = 0; // 0 = плавно без сетки; 0.5 если чекбокс
      this.activeHandle = null;
      this.hoveredHandle = null;
      // Drag: дельта от точки клика (иначе объект прыгает к hit plane)
      this.dragStartIntersect = new THREE.Vector3();
      this._dragQuiet = false; // true во время drag — не save/inspector каждый кадр
      this._vertDrag = null;
      // Blender-style zone Edit Mode (Tab)
      this.zoneEditMode = false;
      this._zoneEditId = null;
      this._zoneSelectedVerts = new Set(); // indices
      this._zoneEditOverlay = null; // THREE.Group: verts + edge mids
      this._zoneEditMeshes = { verts: [], mids: [], edges: null };

      // Рисование зон: hunt (оранж) | territory (синий)
      this.drawHuntMode = false;
      this.drawHuntShape = 'poly'; // 'poly' | 'rect'
      this.drawHuntKind = 'hunt'; // 'hunt' | 'territory'
      this._huntPolyPts = []; // [{x,z}, ...] world points while drawing
      this._huntDrawCornerA = null; // rect mode corner A
      this._huntPreviewMesh = null; // THREE.Object3D (group/line)
      this._huntDefaultLvl = [1, 10];

      // Метки «сюда строй» (пин / пятно)
      this.drawSiteMode = false;
      this.drawSiteKind = 'pin'; // 'pin' | 'poly'
      this._sitePolyPts = [];
      this._selectedSiteId = null;
      this._siteBusy = false;

      // Земля: дороги / площади / трава
      this.drawGroundMode = false;
      this.drawGroundSurface = 'road'; // road | plaza | grass
      this.drawGroundShape = 'line';   // line | poly | rect
      this._groundPolyPts = [];
      this._groundRectA = null;
      this._groundBusy = false;

      // Рисование текстурами по террейну (UE5-style Landscape Paint)
      this.drawPaintMode = false;
      this.paintSelectedLayer = 0; // 0:road, 1:lawn, 2:dirt, 3:sand, 4:rock, 5:lava, 6:swamp, 7:plaza
      this.paintBrushRadius = 12.0; // Radius in meters
      this.paintBrushFalloff = 0.4; // 0.0 (smooth) to 1.0 (hard)
      this.paintBrushStrength = 0.35; // Opacity / flow per frame
      this.paintIsErase = false;
      this._paintStrokeIsErase = false;
      this.paintIsDrawing = false;
      this.paintLastPos = null; // {x, z} for smooth continuous stroke interpolation
      this._paintBrushProjector = null; // 3D ring visualizer

      // Рисование растительности и деревьев кистью (UE5 Foliage Paint)
      this.drawFoliageMode = false;
      this.foliageSelectedModels = new Set(['tree01', 'tree02', 'bush01', 'bush02']);
      this.foliageLayerStacking = true; // ✨ Многослойность: позволяет сажать цветы поверх травы, кусты среди цветов и деревья на полянке
      this.foliageMinScale = 0.8;
      this.foliageMaxScale = 1.3;
      this.foliageRandomYaw = true;
      this.foliageRandomTilt = true;
      this.foliageAlignNormal = false;
      this.foliageMinDistance = 2.0; // meters between foliage items within the same layer
      this.foliageDensity = 3; // count of placement candidate samples per step
      this.foliageBrushRadius = 16.0; // meters
      this.foliageIsErase = false;
      this._foliageStrokeIsErase = false;
      this.foliageEraseSelectedOnly = false;
      this.foliageIsDrawing = false;
      this.foliageLastPos = null;
      this._foliageBrushProjector = null;
      this._foliageSpatialGrid = new Map();
      this._currentFoliageStroke = null;

      // BSP Geometry Mode (UE-style full editor)
      this.drawBspMode = false;
      this.drawBspShape = 'box'; // box|cylinder|wedge|cone|stairs|sheet
      this.drawBspOp = 'add';     // add | sub
      this.bspPlaceMode = 'drag'; // drag | click (default-size place)
      this._bspDrawPhase = 0;     // 0 idle, 1 footprint drag, 2 height
      this._bspCornerA = null;
      this._bspCornerB = null;
      this._bspBaseY = 0;
      this._bspPreviewMesh = null;
      this._bspDefaultTexture = 'town_cobblestone.webp';
      this._bspDefaultHeight = 3;
      this._bspDefaultSize = { x: 4, y: 3, z: 4 };
      this._bspGrid = 0.5;
      this._bspGhostMesh = null; // free-move ghost before place

      if (this.game && this.game.worldContent) {
        this.customPropMeshes = this.game.worldContent.customPropMeshes;
        this._fbxPropCache = this.game.worldContent._fbxPropCache;
        this._foliageInstancer = this.game.worldContent.foliageInstancer;
      } else {
        this.customPropMeshes = new Map();
        this._fbxPropCache = new Map();
        this._foliageInstancer = new FoliageInstancer(this);
      }
      this.placePropMode = false;
      this._pendingPlaceProp = null;
      this._propsLibModal = null;
      this.markerMeshes = new Map();
      this.directSelectedMesh = null;

      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();
      this.dragPlane = new THREE.Plane();
      this.planeIntersect = new THREE.Vector3();
      this.dragStartPos = new THREE.Vector3();
      this.dragStartMouse = new THREE.Vector2();
      this.dragStartRot = new THREE.Euler();
      this.dragStartScale = new THREE.Vector3();

      this._playerSpawnApplied = false;
      this._serverPosAuthoritative = false; // true после welcome — редактор не трогает позицию игрока

      // Undo / Redo
      this._undoStack = [];
      this._redoStack = [];
      this._maxHistory = 100;
      this._historyLocked = false;
      this._dragHistPushed = false;
      this._removedSceneMeshes = new Map();

      this.initGizmo();
      this.initUI();
      this.loadCustomPropsFromWM();
      this.init3DMarkers();
      // BSP brushes from overrides
      try {
        if (window.BspBrushes) {
          window.BspBrushes.ensureRoot(this.scene);
          window.BspBrushes.rebuildAll(this.scene);
          window.BspBrushes.setEditorMode(false);
          window.BspBrushes.setAutoBuild(true);
        }
      } catch (e) { console.warn('[SceneEditor] BSP load', e); }
      // Маркеры только в режиме F2 (не мешают геймплею)
      if (this.markersGroup) this.markersGroup.visible = false;
      this.setupEvents();
      // Повторное применение моделей (БЕЗ повторного телепорта игрока)
      this.scheduleReapplyTransforms();

      console.log('[SceneEditor] 🌟 3D-Редактор (F2). BSP-браши · Undo: Ctrl+Z, Redo: Ctrl+Y / Ctrl+Shift+Z');
    }

    // ============================================================
    //  UNDO / REDO (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
    // ============================================================
    _cloneSnap(obj) {
      try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return null; }
    }

    /** Снимок текущего состояния редактора (перед действием) */
    pushHistory(label, type) {
      if (this._historyLocked) return;
      const WM = window.WorldMetrics;
      const snap = {
        label: label || 'действие',
        type: type || 'scene',
        t: Date.now(),
        wm: (WM && WM.exportEditorOverrides) ? this._cloneSnap(WM.exportEditorOverrides()) : null,
        bsp: (window.BspBrushes && window.BspBrushes.getBrushes) ? JSON.parse(JSON.stringify(window.BspBrushes.getBrushes())) : null,
        paint: (window.Terrain && window.Terrain.getPaintSnapshot) ? window.Terrain.getPaintSnapshot() : null
      };
      this._undoStack.push(snap);
      if (this._undoStack.length > this._maxHistory) this._undoStack.shift();
      this._redoStack.length = 0;
      this._updateHistoryButtons();
    }

    canUndo() {
      return this._undoStack.length > 0;
    }

    canRedo() {
      return this._redoStack.length > 0;
    }

    undo() {
      if (!this.canUndo()) {
        if (this.game && this.game.addChatMessage) this.game.addChatMessage('[Редактор] ℹ️ Нечего отменять (Ctrl+Z)', 'system');
        return false;
      }

      const WM = window.WorldMetrics;
      const current = {
        label: 'current',
        type: 'scene',
        t: Date.now(),
        wm: (WM && WM.exportEditorOverrides) ? this._cloneSnap(WM.exportEditorOverrides()) : null,
        bsp: (window.BspBrushes && window.BspBrushes.getBrushes) ? JSON.parse(JSON.stringify(window.BspBrushes.getBrushes())) : null,
        paint: (window.Terrain && window.Terrain.getPaintSnapshot) ? window.Terrain.getPaintSnapshot() : null
      };

      const entry = this._undoStack.pop();
      if (current) this._redoStack.push(current);

      this._historyLocked = true;
      try {
        if (entry.paint && window.Terrain && window.Terrain.restorePaintSnapshot) {
          window.Terrain.restorePaintSnapshot(entry.paint);
        }
        if (entry.bsp && window.BspBrushes && window.BspBrushes.setBrushes) {
          window.BspBrushes.setBrushes(entry.bsp);
          try { window.BspBrushes.rebuildAll(this.scene); } catch (eB) {}
        }
        if (entry.wm) {
          this._applyHistorySnapshot(entry.wm);
        } else if (entry.snap) {
          this._applyHistorySnapshot(entry.snap);
        }
      } finally {
        this._historyLocked = false;
      }

      this._updateHistoryButtons();
      if (this.game && this.game.addChatMessage) {
        this.game.addChatMessage('[Редактор] ↩️ Отменено: ' + (entry.label || 'действие') + ' (Ctrl+Z)', 'system');
      }
      return true;
    }

    redo() {
      if (!this.canRedo()) {
        if (this.game && this.game.addChatMessage) this.game.addChatMessage('[Редактор] ℹ️ Нечего повторить (Ctrl+Y)', 'system');
        return false;
      }

      const WM = window.WorldMetrics;
      const current = {
        label: 'current',
        type: 'scene',
        t: Date.now(),
        wm: (WM && WM.exportEditorOverrides) ? this._cloneSnap(WM.exportEditorOverrides()) : null,
        bsp: (window.BspBrushes && window.BspBrushes.getBrushes) ? JSON.parse(JSON.stringify(window.BspBrushes.getBrushes())) : null,
        paint: (window.Terrain && window.Terrain.getPaintSnapshot) ? window.Terrain.getPaintSnapshot() : null
      };

      const entry = this._redoStack.pop();
      if (current) this._undoStack.push(current);

      this._historyLocked = true;
      try {
        if (entry.paint && window.Terrain && window.Terrain.restorePaintSnapshot) {
          window.Terrain.restorePaintSnapshot(entry.paint);
        }
        if (entry.bsp && window.BspBrushes && window.BspBrushes.setBrushes) {
          window.BspBrushes.setBrushes(entry.bsp);
          try { window.BspBrushes.rebuildAll(this.scene); } catch (eB) {}
        }
        if (entry.wm) {
          this._applyHistorySnapshot(entry.wm);
        } else if (entry.snap) {
          this._applyHistorySnapshot(entry.snap);
        }
      } finally {
        this._historyLocked = false;
      }

      this._updateHistoryButtons();
      if (this.game && this.game.addChatMessage) {
        this.game.addChatMessage('[Редактор] ↪️ Повторено: ' + (entry.label || 'действие') + ' (Ctrl+Y)', 'system');
      }
      return true;
    }

    _updateHistoryButtons() {
      const bu = this.panel && this.panel.querySelector('#ed-btn-undo');
      const br = this.panel && this.panel.querySelector('#ed-btn-redo');
      const bp = this.panel && this.panel.querySelector('#btn-paint-undo');
      const bf = this.panel && this.panel.querySelector('#btn-foliage-undo');
      if (bu) {
        bu.disabled = !this.canUndo();
        bu.style.opacity = this.canUndo() ? '1' : '0.45';
        const last = this._undoStack.length > 0 ? this._undoStack[this._undoStack.length - 1] : null;
        bu.title = this.canUndo()
          ? ('Отменить: ' + (last ? last.label : '') + ' (Ctrl+Z)')
          : 'Нечего отменять (Ctrl+Z)';
      }
      if (br) {
        br.disabled = !this.canRedo();
        br.style.opacity = this.canRedo() ? '1' : '0.45';
        br.title = this.canRedo()
          ? ('Повторить (Ctrl+Y)')
          : 'Нечего повторить (Ctrl+Y)';
      }
      if (bp) {
        bp.style.opacity = this.canUndo() ? '1' : '0.6';
      }
      if (bf) {
        bf.style.opacity = this.canUndo() ? '1' : '0.6';
      }
    }

    /** Применить снимок + синхронизировать сцену */
    _applyHistorySnapshot(snap) {
      const WM = window.WorldMetrics;
      if (!WM || !snap) return;
      WM.applyEditorOverrides(snap);
      window.EDITOR_OVERRIDES_DATA = snap;
      try {
        localStorage.setItem('project_steam_editor_overrides', JSON.stringify(snap));
      } catch (e) {}

      this._syncWorldModulesFromFlags();
      this._syncNpcsFromWM();
      try { this.loadCustomPropsFromWM(); } catch (e) {}
      try {
        this.init3DMarkers();
        if (this.markersGroup) this.markersGroup.visible = !!this.enabled;
      } catch (e) {}
      try {
        if (window.BspBrushes) window.BspBrushes.rebuildAll(this.scene);
      } catch (e) {}
      try {
        if (window.VillageGround && window.VillageGround.rebuild) {
          window.VillageGround.rebuild(this.scene);
        }
      } catch (e) {}
      try {
        this.applyPlayerSpawn(true);
      } catch (e) {}
      try {
        this.renderFoliagePalette();
      } catch (e) {}

      // Restore any deleted scene mesh if un-deleted
      if (this._removedSceneMeshes) {
        this._removedSceneMeshes.forEach((mesh, id) => {
          if (!WM.isMeshDeleted || !WM.isMeshDeleted(id)) {
            if (mesh && !mesh.parent) {
              this.scene.add(mesh);
            }
          }
        });
      }

      this.deselectObject();
      this.populateObjectDropdown('all');
      this.saveToServer(true);
    }

    /** mountains/volcano/walls: dispose если deleted, build если вернули */
    _syncWorldModulesFromFlags() {
      const WM = window.WorldMetrics;
      if (!WM || !WM.isWorldObjectDeleted) return;
      const scene = this.scene;

      const sync = (key, api, buildName) => {
        if (!api) return;
        const del = WM.isWorldObjectDeleted(key);
        const has = !!(api.root || api.mesh);
        if (del && has && api.dispose) {
          try { api.dispose(); } catch (e) {}
        } else if (!del && !has && api.build) {
          try { api.build(scene); } catch (e) { console.warn('[undo] rebuild ' + key, e); }
        }
      };
      sync('mountains', window.Mountains);
      sync('volcano', window.Volcano);
      sync('walls', window.Walls);
    }

    /** NPC: создать недостающих, убрать удалённых, обновить позиции */
    _syncNpcsFromWM() {
      const WM = window.WorldMetrics;
      const mgr = this.game && this.game.npcManager;
      if (!WM || !mgr) return;

      const want = WM.buildCityNPCs().concat(WM.buildRegionNPCs());
      const wantIds = new Set(want.map(n => n.id));

      // убрать удалённых
      for (let i = mgr.npcs.length - 1; i >= 0; i--) {
        const n = mgr.npcs[i];
        const id = n.template && n.template.id;
        if (id && !wantIds.has(id)) {
          if (n.destroy) n.destroy();
          else if (n.mesh && n.mesh.parent) n.mesh.parent.remove(n.mesh);
          mgr.npcs.splice(i, 1);
        }
      }

      // добавить / обновить позиции
      const have = new Map(mgr.npcs.map(n => [n.template && n.template.id, n]));
      want.forEach(t => {
        let npc = have.get(t.id);
        if (!npc) {
          if (mgr.createNPC) npc = mgr.createNPC(t);
        }
        if (npc && t.position) {
          const gh = window.Terrain ? window.Terrain.heightAt(t.position.x, t.position.z) : 0;
          const y = gh + (t.scale || 2) * 0.5;
          if (npc.mesh) npc.mesh.position.set(t.position.x, y, t.position.z);
          if (npc.baseY !== undefined) npc.baseY = y;
          if (npc.shadow) npc.shadow.position.set(t.position.x, gh + 0.02, t.position.z);
        }
      });
    }

    // ============================================================
    //  3D PIVOT GIZMO (UNREAL ENGINE STYLE)
    // ============================================================
    initGizmo() {
      this.gizmoGroup = new THREE.Group();
      this.gizmoGroup.name = 'UE_Pivot_Gizmo';
      this.gizmoGroup.visible = false;
      this.gizmoGroup.renderOrder = 9999;

      const createMat = (color, opacity = 1.0, wire = false) => new THREE.MeshBasicMaterial({
        color: color,
        depthTest: false,
        depthWrite: false,
        transparent: opacity < 1.0,
        opacity: opacity,
        wireframe: wire,
        side: THREE.DoubleSide
      });

      this.materials = {
        x: createMat(0xff2244),
        y: createMat(0x22ff44),
        z: createMat(0x2288ff),
        xz: createMat(0x00ffff, 0.45),
        xy: createMat(0xffff00, 0.45),
        yz: createMat(0xff00ff, 0.45),
        rotX: createMat(0xff4444),
        rotY: createMat(0x44ff44),
        rotZ: createMat(0x4488ff),
        center: createMat(0xffdd44),
        hover: createMat(0xffffff),
        active: createMat(0xffaa00)
      };

      const handleRadius = 0.08;
      const handleLength = 3.5;
      const coneLength = 0.8;
      const coneRadius = 0.28;

      // 1. Центральный узел (для перемещения по плоскости XZ)
      const centerGeo = new THREE.SphereGeometry(0.35, 12, 12);
      const centerMesh = new THREE.Mesh(centerGeo, this.materials.center);
      centerMesh.userData = { isGizmoHandle: true, axis: 'xz', baseMat: this.materials.center };

      // 2. Оси перемещения (W: Translate)
      this.translateGroup = new THREE.Group();

      // Axis X (Red)
      const geoX = new THREE.CylinderGeometry(handleRadius, handleRadius, handleLength, 8);
      const meshX = new THREE.Mesh(geoX, this.materials.x);
      meshX.position.x = handleLength / 2;
      meshX.rotation.z = -Math.PI / 2;
      meshX.userData = { isGizmoHandle: true, axis: 'x', baseMat: this.materials.x };

      const coneGeoX = new THREE.ConeGeometry(coneRadius, coneLength, 12);
      const coneX = new THREE.Mesh(coneGeoX, this.materials.x);
      coneX.position.x = handleLength;
      coneX.rotation.z = -Math.PI / 2;
      coneX.userData = { isGizmoHandle: true, axis: 'x', baseMat: this.materials.x };

      // Axis Y (Green)
      const geoY = new THREE.CylinderGeometry(handleRadius, handleRadius, handleLength, 8);
      const meshY = new THREE.Mesh(geoY, this.materials.y);
      meshY.position.y = handleLength / 2;
      meshY.userData = { isGizmoHandle: true, axis: 'y', baseMat: this.materials.y };

      const coneGeoY = new THREE.ConeGeometry(coneRadius, coneLength, 12);
      const coneY = new THREE.Mesh(coneGeoY, this.materials.y);
      coneY.position.y = handleLength;
      coneY.userData = { isGizmoHandle: true, axis: 'y', baseMat: this.materials.y };

      // Axis Z (Blue)
      const geoZ = new THREE.CylinderGeometry(handleRadius, handleRadius, handleLength, 8);
      const meshZ = new THREE.Mesh(geoZ, this.materials.z);
      meshZ.position.z = handleLength / 2;
      meshZ.rotation.x = Math.PI / 2;
      meshZ.userData = { isGizmoHandle: true, axis: 'z', baseMat: this.materials.z };

      const coneGeoZ = new THREE.ConeGeometry(coneRadius, coneLength, 12);
      const coneZ = new THREE.Mesh(coneGeoZ, this.materials.z);
      coneZ.position.z = handleLength;
      coneZ.rotation.x = Math.PI / 2;
      coneZ.userData = { isGizmoHandle: true, axis: 'z', baseMat: this.materials.z };

      // Плоскости (2D Corner Handles: XZ, XY, YZ)
      const planeSize = 1.2;
      const planeGeo = new THREE.PlaneGeometry(planeSize, planeSize);

      const planeXZ = new THREE.Mesh(planeGeo, this.materials.xz);
      planeXZ.rotation.x = -Math.PI / 2;
      planeXZ.position.set(planeSize / 2 + 0.3, 0.02, planeSize / 2 + 0.3);
      planeXZ.userData = { isGizmoHandle: true, axis: 'xz', baseMat: this.materials.xz };

      const planeXY = new THREE.Mesh(planeGeo, this.materials.xy);
      planeXY.position.set(planeSize / 2 + 0.3, planeSize / 2 + 0.3, 0.02);
      planeXY.userData = { isGizmoHandle: true, axis: 'xy', baseMat: this.materials.xy };

      const planeYZ = new THREE.Mesh(planeGeo, this.materials.yz);
      planeYZ.rotation.y = Math.PI / 2;
      planeYZ.position.set(0.02, planeSize / 2 + 0.3, planeSize / 2 + 0.3);
      planeYZ.userData = { isGizmoHandle: true, axis: 'yz', baseMat: this.materials.yz };

      this.translateGroup.add(centerMesh, meshX, coneX, meshY, coneY, meshZ, coneZ, planeXZ, planeXY, planeYZ);
      this.gizmoGroup.add(this.translateGroup);

      // 3. Кольца вращения (E: Rotate)
      this.rotateGroup = new THREE.Group();
      const ringRadius = 3.2;
      const ringTube = 0.12;
      const ringGeo = new THREE.TorusGeometry(ringRadius, ringTube, 12, 64);
      const hitTube = 0.45;
      const hitGeo = new THREE.TorusGeometry(ringRadius, hitTube, 8, 36);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false, wireframe: false });

      // Ring Y (Vertical rotation - Yellow/Cyan)
      const ringY = new THREE.Mesh(ringGeo, this.materials.rotY);
      ringY.rotation.x = Math.PI / 2;
      ringY.userData = { isGizmoHandle: true, axis: 'rotY', baseMat: this.materials.rotY };

      const hitRingY = new THREE.Mesh(hitGeo, hitMat);
      hitRingY.rotation.x = Math.PI / 2;
      hitRingY.userData = { isGizmoHandle: true, axis: 'rotY', baseMat: this.materials.rotY, visualTarget: ringY };

      // Ring X (Red)
      const ringX = new THREE.Mesh(ringGeo, this.materials.rotX);
      ringX.rotation.y = Math.PI / 2;
      ringX.userData = { isGizmoHandle: true, axis: 'rotX', baseMat: this.materials.rotX };

      const hitRingX = new THREE.Mesh(hitGeo, hitMat);
      hitRingX.rotation.y = Math.PI / 2;
      hitRingX.userData = { isGizmoHandle: true, axis: 'rotX', baseMat: this.materials.rotX, visualTarget: ringX };

      // Ring Z (Blue)
      const ringZ = new THREE.Mesh(ringGeo, this.materials.rotZ);
      ringZ.userData = { isGizmoHandle: true, axis: 'rotZ', baseMat: this.materials.rotZ };

      const hitRingZ = new THREE.Mesh(hitGeo, hitMat);
      hitRingZ.userData = { isGizmoHandle: true, axis: 'rotZ', baseMat: this.materials.rotZ, visualTarget: ringZ };

      this.rotateGroup.add(ringY, hitRingY, ringX, hitRingX, ringZ, hitRingZ);
      this.gizmoGroup.add(this.rotateGroup);

      // 4. Кубы и плоскости масштабирования (R: Scale)
      this.scaleGroup = new THREE.Group();

      // Axis lines for Scale
      const scaleLineX = new THREE.Mesh(geoX, this.materials.x);
      scaleLineX.position.x = handleLength / 2;
      scaleLineX.rotation.z = -Math.PI / 2;
      scaleLineX.userData = { isGizmoHandle: true, axis: 'scaleX', baseMat: this.materials.x };

      const scaleLineY = new THREE.Mesh(geoY, this.materials.y);
      scaleLineY.position.y = handleLength / 2;
      scaleLineY.userData = { isGizmoHandle: true, axis: 'scaleY', baseMat: this.materials.y };

      const scaleLineZ = new THREE.Mesh(geoZ, this.materials.z);
      scaleLineZ.position.z = handleLength / 2;
      scaleLineZ.rotation.x = Math.PI / 2;
      scaleLineZ.userData = { isGizmoHandle: true, axis: 'scaleZ', baseMat: this.materials.z };

      const cubeGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);

      const cubeX = new THREE.Mesh(cubeGeo, this.materials.x);
      cubeX.position.x = handleLength;
      cubeX.userData = { isGizmoHandle: true, axis: 'scaleX', baseMat: this.materials.x };

      const cubeY = new THREE.Mesh(cubeGeo, this.materials.y);
      cubeY.position.y = handleLength;
      cubeY.userData = { isGizmoHandle: true, axis: 'scaleY', baseMat: this.materials.y };

      const cubeZ = new THREE.Mesh(cubeGeo, this.materials.z);
      cubeZ.position.z = handleLength;
      cubeZ.userData = { isGizmoHandle: true, axis: 'scaleZ', baseMat: this.materials.z };

      // 2D Plane Scale handles (Квадратики двухмерного скейла)
      const scalePlaneXZ = new THREE.Mesh(planeGeo, this.materials.xz);
      scalePlaneXZ.rotation.x = -Math.PI / 2;
      scalePlaneXZ.position.set(planeSize / 2 + 0.3, 0.02, planeSize / 2 + 0.3);
      scalePlaneXZ.userData = { isGizmoHandle: true, axis: 'scaleXZ', baseMat: this.materials.xz };

      const scalePlaneXY = new THREE.Mesh(planeGeo, this.materials.xy);
      scalePlaneXY.position.set(planeSize / 2 + 0.3, planeSize / 2 + 0.3, 0.02);
      scalePlaneXY.userData = { isGizmoHandle: true, axis: 'scaleXY', baseMat: this.materials.xy };

      const scalePlaneYZ = new THREE.Mesh(planeGeo, this.materials.yz);
      scalePlaneYZ.rotation.y = Math.PI / 2;
      scalePlaneYZ.position.set(0.02, planeSize / 2 + 0.3, planeSize / 2 + 0.3);
      scalePlaneYZ.userData = { isGizmoHandle: true, axis: 'scaleYZ', baseMat: this.materials.yz };

      const cubeCenterGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
      const cubeAll = new THREE.Mesh(cubeCenterGeo, this.materials.center);
      cubeAll.position.set(0, 0, 0);
      cubeAll.userData = { isGizmoHandle: true, axis: 'scaleAll', baseMat: this.materials.center };

      this.scaleGroup.add(scaleLineX, scaleLineY, scaleLineZ, cubeX, cubeY, cubeZ, scalePlaneXZ, scalePlaneXY, scalePlaneYZ, cubeAll);
      this.gizmoGroup.add(this.scaleGroup);

      // Рамка выделения
      const boxGeo = new THREE.BoxGeometry(1, 1, 1);
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      this.selectionBox = new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({ color: 0x00ffcc, linewidth: 2, depthTest: false, transparent: true, opacity: 0.85 }));
      this.selectionBox.visible = false;
      this.selectionBox.renderOrder = 9998;
      this.selectionBox.raycast = () => {}; // Рамка не блокирует клики

      this.gizmoHandles = [
        centerMesh, meshX, coneX, meshY, coneY, meshZ, coneZ, planeXZ, planeXY, planeYZ,
        ringY, ringX, ringZ,
        scaleLineX, scaleLineY, scaleLineZ, cubeX, cubeY, cubeZ, scalePlaneXZ, scalePlaneXY, scalePlaneYZ, cubeAll
      ];

      this.scene.add(this.gizmoGroup);
      this.scene.add(this.selectionBox);

      this.setMode('translate');
    }

    setMode(mode) {
      this.mode = mode;
      this.translateGroup.visible = (mode === 'translate');
      this.rotateGroup.visible = (mode === 'rotate');
      this.scaleGroup.visible = (mode === 'scale');

      if (this.panel) {
        const btnW = this.panel.querySelector('#btn-mode-w');
        const btnE = this.panel.querySelector('#btn-mode-e');
        const btnR = this.panel.querySelector('#btn-mode-r');
        if (btnW) btnW.style.background = (mode === 'translate') ? '#aa6622' : '#333';
        if (btnE) btnE.style.background = (mode === 'rotate') ? '#aa6622' : '#333';
        if (btnR) btnR.style.background = (mode === 'scale') ? '#aa6622' : '#333';
      }
    }

    // ============================================================
    //  3D МАРКЕРЫ ДЛЯ СПАВНОВ, ИСТОЧНИКОВ СВЕТА И СТРУКТУР
    // ============================================================
    init3DMarkers() {
      const WM = window.WorldMetrics;
      if (!WM) return;

      // Снос старых маркеров
      if (this.markersGroup) {
        this.scene.remove(this.markersGroup);
        this.markersGroup = null;
      }
      if (this.markerMeshes) this.markerMeshes.clear();
      else this.markerMeshes = new Map();

      this.markersGroup = new THREE.Group();
      this.markersGroup.name = 'Editor3DMarkers';

      // 1. Споты мобов (Спавны) — позиции из MOB_SPOTS (уже с оверрайдами)
      const spots = WM.buildSpots();
      spots.forEach((s) => {
        const spotIdx = (typeof s.idx === 'number') ? s.idx : -1;
        if (spotIdx < 0) return;
        const radius = Math.max(2, s.r || 15);
        const marker = new THREE.Group();
        marker.name = 'MobSpot_' + spotIdx;

        // Напольный круг радиуса спавна
        const geo = new THREE.CylinderGeometry(radius, radius, 1.6, 24, 1, true);
        const mat = new THREE.MeshBasicMaterial({
          color: s.boss ? 0xff3333 : 0xffaa22,
          wireframe: true,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthTest: false
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.position.y = 0.8;
        marker.add(ring);

        // Центральный вертикальный световой пилон (виден с высоты и сквозь рельеф)
        const pillarGeo = new THREE.CylinderGeometry(0.35, 0.35, 18, 8);
        const pillarMat = new THREE.MeshBasicMaterial({
          color: s.boss ? 0xff2222 : 0xffaa22,
          transparent: true,
          opacity: 0.75,
          depthTest: false
        });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.y = 9;
        marker.add(pillar);

        // Яркий маяк на вершине пилона
        const beaconGeo = new THREE.SphereGeometry(1.2, 10, 10);
        const beaconMat = new THREE.MeshBasicMaterial({
          color: s.boss ? 0xff4444 : 0xffdd44,
          transparent: true,
          opacity: 0.95,
          depthTest: false
        });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.y = 18;
        marker.add(beacon);

        // Информационный бейдж с именем моба и уровнем
        if (typeof this._makeSpotLabelSprite === 'function') {
          const label = this._makeSpotLabelSprite(s);
          label.position.y = 21;
          marker.add(label);
        }

        const gh = window.Terrain ? window.Terrain.heightAt(s.x, s.z) : 0;
        marker.position.set(s.x, gh + 0.2, s.z);
        marker.scale.set(1, 1, 1);

        marker.userData = {
          isEditorMarker: true,
          markerType: 'spot',
          spotIdx: spotIdx,
          spotData: s,
          baseRadius: radius
        };
        marker.traverse(c => {
          c.userData.markerType = 'spot';
          c.userData.spotIdx = spotIdx;
          c.userData.isEditorMarker = true;
        });

        this.markersGroup.add(marker);
        this.markerMeshes.set('spot_' + spotIdx, marker);
      });

      // 2. NPC (город + регион) — маркеры, чтобы двигать без NPCManager
      const npcs = WM.buildCityNPCs().concat(WM.buildRegionNPCs());
      npcs.forEach(n => {
        const gh = window.Terrain ? window.Terrain.heightAt(n.position.x, n.position.z) : 0;
        const geo = new THREE.ConeGeometry(1.2, 3.5, 8);
        const mat = new THREE.MeshBasicMaterial({ color: n.color || 0x44aaff, transparent: true, opacity: 0.85 });
        const marker = new THREE.Mesh(geo, mat);
        marker.position.set(n.position.x, gh + 2.0, n.position.z);
        marker.userData = {
          isEditorMarker: true,
          markerType: 'npc',
          npcId: n.id,
          npcData: n
        };
        this.markersGroup.add(marker);
        this.markerMeshes.set('npc_' + n.id, marker);
      });

      // 3. Точка спавна игрока
      const spawn = WM.getPlayerSpawn && WM.getPlayerSpawn();
      {
        const px = spawn ? spawn.x : (this.game.player ? this.game.player.mesh.position.x : 0);
        const pz = spawn ? spawn.z : (this.game.player ? this.game.player.mesh.position.z : 0);
        const gh = window.Terrain ? window.Terrain.heightAt(px, pz) : 0;
        const geo = new THREE.SphereGeometry(2.2, 12, 12);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true });
        const marker = new THREE.Mesh(geo, mat);
        marker.position.set(px, gh + 2.5, pz);
        marker.userData = { isEditorMarker: true, markerType: 'player_spawn', name: 'Спавн игрока' };
        this.markersGroup.add(marker);
        this.markerMeshes.set('player_spawn', marker);
      }

      // 4. Источники света (Sun Light Gizmo)
      if (this.game.sun) {
        const sunGeo = new THREE.OctahedronGeometry(4, 0);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffea00, wireframe: true });
        const sunMarker = new THREE.Mesh(sunGeo, sunMat);
        sunMarker.position.copy(this.game.sun.position);
        sunMarker.userData = { isEditorMarker: true, markerType: 'light', lightObj: this.game.sun, name: 'Направленный свет (Солнце)' };
        this.markersGroup.add(sunMarker);
        this.markerMeshes.set('light_sun', sunMarker);
      }

      // 5. Мосты — НЕ рисуем auto-gizmo (buildBridges).
      //    Мосты ставишь вручную пропами; авто-прямоугольники только мешали.

      // 6. Зоны охоты (прямоугольники + lvl)
      const hunts = (WM.buildHuntZones && WM.buildHuntZones()) || [];
      hunts.forEach((hz) => {
        const mesh = this._createHuntZoneMesh(hz);
        if (!mesh) return;
        this.markersGroup.add(mesh);
        this.markerMeshes.set('hunt_' + hz.id, mesh);
      });

      // 7. Метки геометрии (только F2)
      const sites = (WM.listBuildSites && WM.listBuildSites()) || [];
      sites.forEach((s) => {
        const mesh = this._createSiteMarker(s);
        if (!mesh) return;
        this.markersGroup.add(mesh);
        this.markerMeshes.set('site_' + s.id, mesh);
      });

      this.scene.add(this.markersGroup);
      // Вне редактора маркеры скрыты и не ловят лучи
      this.markersGroup.visible = !!this.enabled;
      this.markersGroup.traverse(obj => {
        if (obj.isMesh || obj.isSprite || obj.isLine) {
          if (this.enabled) {
            delete obj.raycast;
            if (obj.isSprite && THREE.Sprite) obj.raycast = THREE.Sprite.prototype.raycast;
            else if (obj.isMesh && THREE.Mesh) obj.raycast = THREE.Mesh.prototype.raycast;
            else if (obj.isLine && THREE.Line) obj.raycast = THREE.Line.prototype.raycast;
          } else {
            obj.raycast = function () {};
          }
        }
      });
      this._applyCategoryMarkerVisibility();
      this._markersBuiltOnce = true;
    }

    applySavedTransformsToGame() {
      const WM = window.WorldMetrics;
      if (!WM) return 0;

      // Оверрайды из файла/localStorage — только ОДИН раз (не затирать live-правки reapply'ем)
      if (!this._overridesHydrated && window.EDITOR_OVERRIDES_DATA && WM.applyEditorOverrides) {
        try {
          WM.applyEditorOverrides(window.EDITOR_OVERRIDES_DATA);
          this._overridesHydrated = true;
        } catch (e) {}
      }

      // 1. Спавн игрока — ТОЛЬКО один раз и НЕ если сервер уже задал позицию
      if (!this._playerSpawnApplied && !this._serverPosAuthoritative) {
        this.applyPlayerSpawn();
      }

      // 2. NPC (npcManager, если есть)
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

      // 3. 3D-модели / custom props
      const applied = this.loadCustomPropsFromWM();
      if (!this._didLogApplyTransforms && (applied > 0 || this._reapplyAttempt <= 1)) {
        this._didLogApplyTransforms = true;
        console.log('[SceneEditor] applySavedTransforms: props=', applied,
          'playerSpawn=', WM.getPlayerSpawn && WM.getPlayerSpawn(),
          'spots=', WM.MOB_SPOTS ? WM.MOB_SPOTS.length : 0);
      }

      // 4. Маркеры спотов/NPC/спавна — при загрузке и если помечены dirty
      if (!this._markersBuiltOnce || this._markersDirty) {
        try { this.init3DMarkers(); this._markersDirty = false; } catch (e) {}
      } else {
        // Лёгкое обновление позиций маркеров без полного rebuild (не сбивает selection)
        try { this.refreshMarkerPositions(); } catch (e) {}
      }
      return applied;
    }

    refreshMarkerPositions() {
      const WM = window.WorldMetrics;
      if (!WM || !this.markerMeshes) return;
      const spots = WM.buildSpots();
      spots.forEach((s, idx) => {
        const m = this.markerMeshes.get('spot_' + idx);
        if (!m) return;
        const gh = window.Terrain ? window.Terrain.heightAt(s.x, s.z) : 0;
        m.position.set(s.x, gh + 0.6, s.z);
      });
      const npcs = WM.buildCityNPCs().concat(WM.buildRegionNPCs());
      npcs.forEach(n => {
        const m = this.markerMeshes.get('npc_' + n.id);
        if (!m) return;
        const gh = window.Terrain ? window.Terrain.heightAt(n.position.x, n.position.z) : 0;
        m.position.set(n.position.x, gh + 2.0, n.position.z);
      });
      const spawn = WM.getPlayerSpawn && WM.getPlayerSpawn();
      const sm = this.markerMeshes.get('player_spawn');
      if (sm && spawn) {
        const gh = window.Terrain ? window.Terrain.heightAt(spawn.x, spawn.z) : 0;
        sm.position.set(spawn.x, gh + 2.5, spawn.z);
      }
    }

    /**
     * Точка появления из редактора (маркер / новые персонажи).
     * Не перебивать серверную позицию после welcome.
     */
    applyPlayerSpawn(force) {
      if (this._serverPosAuthoritative && !force) return false;
      if (this._playerSpawnApplied && !force) return false;

      const WM = window.WorldMetrics;
      if (!WM || !WM.getPlayerSpawn) {
        this._playerSpawnApplied = true;
        return false;
      }
      let spawn = WM.getPlayerSpawn();

      // fallback: customProps player_spawn / legacy sprite props
      if (!spawn && WM.CUSTOM_PROPS) {
        const pp = WM.CUSTOM_PROPS.find(p =>
          p.editorKey === 'player_spawn' || p.id === 'player_spawn' ||
          (p.name && String(p.name).indexOf('Персонаж Игрока') !== -1) ||
          (p.finger && String(p.finger).indexOf('sp|') === 0)
        );
        if (pp && pp.position) {
          spawn = { x: pp.position.x, y: pp.position.y || 0, z: pp.position.z };
          if (WM.setPlayerSpawn) WM.setPlayerSpawn(spawn.x, spawn.y, spawn.z);
        }
      }
      this._playerSpawnApplied = true;
      if (!spawn || !this.game || !this.game.player || !this.game.player.mesh) return false;

      // Online уже подключён — позицию задаёт сервер
      if (this.game.net && (this.game.net.status === 'online' || this.game.net.pid != null) && !force) {
        return false;
      }

      const pl = this.game.player;
      const T = window.Terrain;
      let y;
      if (T && typeof T.standY === 'function') {
        const s = T.standY(spawn.x, spawn.z);
        const sea = (typeof T.seaLevel === 'number') ? T.seaLevel - 0.3 : -35.3;
        y = Math.max(s.y, 0.95 + sea);
      } else {
        const gh = T ? T.heightAt(spawn.x, spawn.z) : 0;
        y = 0.95 + Math.max(gh, T ? T.seaLevel - 0.3 : 0);
      }
      pl.mesh.position.set(spawn.x, y, spawn.z);
      pl.isMoving = false;
      if (pl.moveTarget) pl.moveTarget.set(spawn.x, 0, spawn.z);
      if (pl.shadow) pl.shadow.position.set(spawn.x, y - 0.88, spawn.z);
      if (pl.youMarker) pl.youMarker.position.set(spawn.x, y + 1.3, spawn.z);
      if (this.game.net && this.game.net.predict) {
        this.game.net.predict.x = spawn.x;
        this.game.net.predict.z = spawn.z;
      }
      console.log('[SceneEditor] player spawn applied once', spawn.x.toFixed(1), spawn.z.toFixed(1));
      return true;
    }

    /** Сервер прислал welcome — больше не трогаем позицию игрока редактором. */
    markServerPositionAuthoritative() {
      this._serverPosAuthoritative = true;
      this._playerSpawnApplied = true;
    }

    /** Повторно применить сохранения, пока не найдём все scene_ref (макс. 6 попыток). */
    scheduleReapplyTransforms() {
      if (this._reapplyScheduled) return;
      this._reapplyScheduled = true;
      this._reapplyAttempt = 0;
      if (this._reapplyTimerIds) {
        this._reapplyTimerIds.forEach(id => clearTimeout(id));
      }
      this._reapplyTimerIds = [];

      const clearRemaining = () => {
        if (this._reapplyTimerIds) {
          this._reapplyTimerIds.forEach(id => clearTimeout(id));
          this._reapplyTimerIds = [];
        }
        this._reapplyScheduled = false;
      };

      const delays = [0, 50, 200, 600, 1500, 3000];
      delays.forEach((ms) => {
        const tid = setTimeout(() => {
          this._reapplyAttempt++;
          try {
            const applied = this.applySavedTransformsToGame();
            const pending = this._countUnresolvedProps();
            if (pending === 0 || this._reapplyAttempt >= delays.length) {
              clearRemaining();
              if (pending > 0) {
                console.warn('[SceneEditor] не удалось привязать props:', pending, '(см. customProps в localStorage)');
              } else if (applied > 0 && !this._loggedAllSceneTransforms) {
                this._loggedAllSceneTransforms = true;
                console.log('[SceneEditor] все scene transforms применены, applied=', applied);
              }
            }
          } catch (e) {
            console.warn('[SceneEditor] reapply failed:', e && e.message);
          }
        }, ms);
        this._reapplyTimerIds.push(tid);
      });
    }

    _countUnresolvedProps() {
      const WM = window.WorldMetrics;
      if (!WM || !WM.CUSTOM_PROPS) return 0;
      let n = 0;
      const missing = [];
      WM.CUSTOM_PROPS.forEach(p => {
        // player spawn хранится отдельно — не считаем «не найденным мешем»
        if (this._isPlayerProp(p)) return;
        if (this._isIgnoredOrHelperProp(p)) return;
        if (this._foliageInstancer && this._foliageInstancer.isFoliageProp(p)) return;
        if (p.meshType === 'scene_ref' || p.editorKey || p.geoVerts || p.finger) {
          if (!this.findMeshForProp(p)) {
            n++;
            missing.push(p.editorKey || p.id || p.name || '?');
          }
        }
      });
      if (missing.length && this._reapplyAttempt >= 3) {
        console.warn('[SceneEditor] unresolved props:', missing.join(', '));
      }
      return n;
    }

    _isIgnoredOrHelperProp(p) {
      if (!p) return true;
      const id = String(p.id || '');
      const name = String(p.name || '');
      const key = String(p.editorKey || '');
      if (id === 'named_player_aura' || id === 'player_aura' || name === 'player_aura') return true;
      if (id.includes('player_aura') || name.includes('player_aura') || key.includes('player_aura')) return true;
      if (id.includes('_editorColHelper') || name.includes('_editorColHelper') || key.includes('_editorColHelper')) return true;
      if (id.includes('ColHelper') || name.includes('ColHelper') || key.includes('ColHelper')) return true;
      if (p.meshType === 'col_helper' || p.isColHelper) return true;
      return false;
    }

    _isPlayerProp(p) {
      if (!p) return false;
      if (p.editorKey === 'player_spawn' || p.id === 'player_spawn') return true;
      if (p.id === 'player_main' || p.id === 'player') return true;
      if (p.id === 'named_player_aura' || p.id === 'player_aura' || p.name === 'player_aura') return true;
      if (String(p.id || '').includes('player_aura') || String(p.name || '').includes('player_aura')) return true;
      if (p.name && String(p.name).indexOf('Персонаж Игрока') !== -1) return true;
      if (p.id && String(p.id).indexOf('scene_node_Sprite') === 0) return true;
      if (p.finger && String(p.finger).indexOf('sp|') === 0) return true;
      return false;
    }

    /**
     * Восстановить finger/geoVerts/editorKey у старых сохранений,
     * где метаданные потерялись (buildCustomProps раньше их вырезал).
     */
    _enrichPropIdentity(p) {
      if (!p) return;
      // Уже полный набор
      if (p.editorKey && p.geoVerts) return;

      // Из legacy finger "Mesh#6|BufferGeometry:11085|m"
      if (!p.geoVerts && p.finger) {
        p.geoVerts = this.parseGeoVertsFromFinger(p.finger) || p.geoVerts;
      }

      // Вулкан: scale ≈ 480 / 408 / 480, ~11k вершин
      const sx = p.scale && p.scale.x;
      const sy = p.scale && p.scale.y;
      const sz = p.scale && p.scale.z;
      const looksVolcano =
        (sx > 100 && sz > 100 && sy > 100) ||
        (p.geoVerts === 11085) ||
        (p.finger && String(p.finger).indexOf('11085') !== -1) ||
        p.id === 'volcano' ||
        p.editorKey === 'volcano';

      if (looksVolcano) {
        p.editorKey = p.editorKey || 'volcano';
        p.geoVerts = p.geoVerts || 11085;
        p.meshType = 'scene_ref';
        p.finger = p.finger || 'key:volcano';
        if (p.id && p.id.indexOf('mesh_') === 0) p.id = 'volcano';
        return;
      }

      // Террейн: ~24274 вершин, scale ~1
      const looksTerrain =
        (p.geoVerts === 24274) ||
        (p.finger && String(p.finger).indexOf('24274') !== -1) ||
        p.id === 'terrain_ground' ||
        p.editorKey === 'terrain_ground' ||
        (p.name && String(p.name).indexOf('Террейн') !== -1);

      if (looksTerrain) {
        p.editorKey = p.editorKey || 'terrain_ground';
        p.geoVerts = p.geoVerts || 24274;
        p.meshType = 'scene_ref';
        p.finger = p.finger || 'key:terrain_ground';
        if (p.id && p.id.indexOf('mesh_') === 0) p.id = 'terrain_ground';
      }

      // Горы mOUNTS: ~15229 вершин
      const looksMountains =
        (p.geoVerts === 15229) ||
        p.id === 'mountains' ||
        p.editorKey === 'mountains' ||
        (p.name && String(p.name).indexOf('Горы') !== -1);

      if (looksMountains) {
        p.editorKey = p.editorKey || 'mountains';
        p.geoVerts = p.geoVerts || 15229;
        p.meshType = 'scene_ref';
        p.finger = p.finger || 'key:mountains';
        if (p.id && p.id.indexOf('mesh_') === 0) p.id = 'mountains';
      }
    }

    /** Число вершин геометрии (стабильно между reload). */
    getGeoVerts(mesh) {
      try {
        if (mesh && mesh.geometry && mesh.geometry.attributes && mesh.geometry.attributes.position) {
          return mesh.geometry.attributes.position.count | 0;
        }
      } catch (e) {}
      return 0;
    }

    /**
     * Fingerprint БЕЗ индексов сцены (Mesh#6 ломался после F5).
     * Только: тип + вершины + имя + editorKey.
     */
    computeMeshFingerprint(mesh) {
      if (!mesh) return 'null';
      const ud = mesh.userData || {};
      if (ud.editorKey) return 'key:' + ud.editorKey;
      const verts = this.getGeoVerts(mesh);
      const nm = (mesh.name && mesh.name !== 'Mesh' && mesh.name !== 'Object3D' && mesh.name !== 'Group') ? mesh.name : '';
      const kind = mesh.isSprite ? 'sp' : (mesh.isMesh ? 'm' : (mesh.isGroup ? 'g' : 'o'));
      // Округлённый «размер» scale — помогает отличить клоны
      const sx = mesh.scale ? Math.round(mesh.scale.x * 100) / 100 : 1;
      const sy = mesh.scale ? Math.round(mesh.scale.y * 100) / 100 : 1;
      const sz = mesh.scale ? Math.round(mesh.scale.z * 100) / 100 : 1;
      return [kind, nm || '-', 'v' + verts, 's' + sx + '_' + sy + '_' + sz].join('|');
    }

    /** Из старого finger вида "Mesh#6|BufferGeometry:11085|m" вытащить число вершин. */
    parseGeoVertsFromFinger(finger) {
      if (!finger || typeof finger !== 'string') return 0;
      const m = finger.match(/BufferGeometry:(\d+)/) || finger.match(/\|v(\d+)(?:\||$)/) || finger.match(/^v(\d+)$/);
      return m ? (parseInt(m[1], 10) || 0) : 0;
    }

    getStableMeshId(mesh) {
      if (!mesh) return 'null_mesh';
      if (!mesh.userData) mesh.userData = {};
      // Приоритет: явный ключ мира (terrain/volcano) — никогда не меняется
      if (mesh.userData.editorKey) {
        mesh.userData.propId = mesh.userData.editorKey;
        mesh.userData.finger = this.computeMeshFingerprint(mesh);
        return mesh.userData.propId;
      }
      if (mesh.userData.propId) return mesh.userData.propId;
      if (mesh.userData.editorId) return mesh.userData.editorId;

      if (mesh.name && mesh.name !== '' && mesh.name !== 'Mesh' && mesh.name !== 'Object3D' && mesh.name !== 'Group' && mesh.name !== 'Scene') {
        mesh.userData.propId = 'named_' + mesh.name;
        mesh.userData.finger = this.computeMeshFingerprint(mesh);
        mesh.userData.geoVerts = this.getGeoVerts(mesh);
        return mesh.userData.propId;
      }

      const finger = this.computeMeshFingerprint(mesh);
      const verts = this.getGeoVerts(mesh);
      // id от геометрии, НЕ от path-индекса
      let hash = 0;
      for (let i = 0; i < finger.length; i++) hash = ((hash << 5) - hash + finger.charCodeAt(i)) | 0;
      const stableId = verts > 0
        ? ('geo_' + verts + '_' + (hash >>> 0).toString(16).slice(0, 6))
        : ('mesh_' + (hash >>> 0).toString(16));
      mesh.userData.propId = stableId;
      mesh.userData.finger = finger;
      mesh.userData.geoVerts = verts;
      return stableId;
    }

    _isEditableSceneObject(child) {
      if (!child) return false;
      if (child === this.gizmoGroup || child === this.selectionBox || child === this.markersGroup) return false;
      if (child.userData && (child.userData.isGizmoHandle || child.userData.isEditorMarker)) return false;
      // гизмо-группа и маркеры целиком
      let p = child.parent;
      while (p) {
        if (p === this.gizmoGroup || p === this.markersGroup || p === this.selectionBox) return false;
        p = p.parent;
      }
      return !!(child.isMesh || child.isSprite || child.isGroup || child.isLine);
    }

    findMeshForProp(p) {
      if (!p) return null;
      this._enrichPropIdentity(p);

      const wantId = p.id;
      const wantKey = p.editorKey || (wantId === 'volcano' || wantId === 'terrain_ground' ? wantId : null);
      const wantFinger = p.finger;
      const wantVerts = p.geoVerts || this.parseGeoVertsFromFinger(wantFinger) || 0;
      const candidates = [];

      // Быстрый путь: прямые ссылки модулей + editorKey/name
      if (wantKey === 'volcano' || wantId === 'volcano' || (wantVerts === 11085) ||
          (p.scale && p.scale.x > 100 && p.scale.z > 100 && wantKey !== 'mountains')) {
        if (window.Volcano && window.Volcano.mesh) return window.Volcano.mesh;
        let vMesh = null;
        this.scene.traverse(c => {
          if (!vMesh && c.userData && c.userData.editorKey === 'volcano') vMesh = c;
          if (!vMesh && c.name === 'VolcanoMesh') vMesh = c;
        });
        if (vMesh) return vMesh;
      }
      if (wantKey === 'mountains' || wantId === 'mountains' || wantVerts === 15229) {
        if (window.Mountains && window.Mountains.mesh) return window.Mountains.mesh;
        let mMesh = null;
        this.scene.traverse(c => {
          if (!mMesh && c.userData && c.userData.editorKey === 'mountains') mMesh = c;
          if (!mMesh && c.name === 'MountainsMesh') mMesh = c;
        });
        if (mMesh) return mMesh;
      }
      if (wantKey === 'terrain_ground' || wantId === 'terrain_ground' || wantVerts === 24274) {
        // multi-sector: rootGroup или любой TerrainSector
        if (window.Terrain && window.Terrain.mesh) return window.Terrain.mesh;
        let tMesh = null;
        this.scene.traverse(c => {
          if (!tMesh && c.userData && c.userData.editorKey === 'terrain_ground') tMesh = c;
          if (!tMesh && c.name && String(c.name).indexOf('TerrainSector') === 0) tMesh = c;
          if (!tMesh && c.name === 'TerrainGround') tMesh = c;
        });
        if (tMesh) return tMesh;
      }
      // ocean plane / WaterRoot (solid ocean, не старый FBX 16641 verts)
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
      // MountainsRoot group (id named_MountainsRoot)
      if (wantId === 'named_MountainsRoot' || wantKey === 'mountains_root' ||
          (wantFinger && String(wantFinger).indexOf('MountainsRoot') !== -1)) {
        if (window.Mountains && window.Mountains.root) return window.Mountains.root;
        if (window.Mountains && window.Mountains.mesh) return window.Mountains.mesh;
        let mRoot = null;
        this.scene.traverse(c => {
          if (!mRoot && c.name === 'MountainsRoot') mRoot = c;
          if (!mRoot && c.userData && c.userData.editorKey === 'mountains_root') mRoot = c;
        });
        if (mRoot) return mRoot;
      }

      this.scene.traverse(child => {
        if (!this._isEditableSceneObject(child)) return;
        // Не трогаем игрока
        if (this.game && this.game.player) {
          if (child === this.game.player.mesh || child === this.game.player.shadow || child === this.game.player.youMarker) return;
          if (child.parent === this.game.player.mesh) return;
        }

        const ud = child.userData || {};
        const score = { mesh: child, s: 0 };

        // 1) editorKey (terrain_ground / volcano) — железобетон
        if (wantKey && ud.editorKey === wantKey) { score.s = 100; candidates.push(score); return; }
        if (wantId && ud.editorKey === wantId) { score.s = 100; candidates.push(score); return; }
        if (wantKey === 'volcano' && child.name === 'VolcanoMesh') { score.s = 100; candidates.push(score); return; }
        if (wantKey === 'terrain_ground' && child.name === 'TerrainGround') { score.s = 100; candidates.push(score); return; }

        // 2) propId / name
        if (wantId && (ud.propId === wantId || ud.editorId === wantId || child.name === wantId)) {
          score.s = 90; candidates.push(score); return;
        }
        if (wantId && wantId.indexOf('named_') === 0 && child.name === wantId.slice(6)) {
          score.s = 90; candidates.push(score); return;
        }

        // 3) новый finger (без индексов)
        const finger = this.computeMeshFingerprint(child);
        if (wantFinger && finger === wantFinger) { score.s = 80; candidates.push(score); return; }

        // 4) число вершин (уникально для terrain/volcano)
        const verts = this.getGeoVerts(child);
        if (wantVerts > 0 && verts === wantVerts && child.isMesh) {
          score.s = 70;
          if (p.scale && child.scale) {
            const ds = Math.abs(child.scale.x - (p.scale.x || 1)) + Math.abs(child.scale.y - (p.scale.y || 1));
            if (ds < 50) score.s += 15; // вулкан scale 480 — допуск шире
          }
          candidates.push(score);
          return;
        }

        // 5) legacy finger: "Mesh#6|BufferGeometry:11085|m"
        if (wantFinger && wantFinger.indexOf('BufferGeometry:') !== -1) {
          const fv = this.parseGeoVertsFromFinger(wantFinger);
          if (fv > 0 && verts === fv) { score.s = 65; candidates.push(score); return; }
        }

        // 6) scale-эвристика: огромный scale → вулкан
        if (child.isMesh && p.scale && p.scale.x > 100 && child.scale && child.scale.x > 100) {
          const ds = Math.abs(child.scale.x - p.scale.x) + Math.abs(child.scale.y - p.scale.y);
          if (ds < 5) { score.s = 60; candidates.push(score); }
        }
      });

      if (!candidates.length) return null;
      candidates.sort((a, b) => b.s - a.s);
      return candidates[0].mesh;
    }

    loadCustomPropsFromWM() {
      const WM = window.WorldMetrics;
      if (!WM || !WM.CUSTOM_PROPS) return 0;
      // Берём ЖИВЫЕ записи CUSTOM_PROPS (не урезанные копии)
      const props = WM.CUSTOM_PROPS;

      // Удаляем из 3D-сцены объекты, которых больше нет в CUSTOM_PROPS (на Undo / Redo / Delete)
      const liveIds = new Set(props.map(p => p.id));
      this.customPropMeshes.forEach((mesh, id) => {
        if (!liveIds.has(id)) {
          if (mesh && (mesh.userData && (mesh.userData.isCustomProp || mesh.userData.isFoliage || mesh.userData.isCollisionBarrier) || (mesh.name && (mesh.name.startsWith('foliage_') || mesh.name.startsWith('prop_') || mesh.name.startsWith('barrier_'))))) {
            if (mesh.parent) mesh.parent.remove(mesh);
            mesh.traverse(c => {
              if (c.geometry) c.geometry.dispose();
              if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach(m => m.dispose && m.dispose());
                else if (c.material.dispose) c.material.dispose();
              }
            });
            this.customPropMeshes.delete(id);
          }
        }
      });
      if (this._foliageInstancer) {
        this._foliageInstancer.rebuildFromCustomProps(props);
      }
      if (this._foliageSpatialGrid) {
        this._buildFoliageSpatialGrid();
      }

      let applied = 0;
      let missing = 0;
      props.forEach(p => {
        // Удалённые в редакторе — пропускаем
        if (WM.isMeshDeleted && (
          WM.isMeshDeleted(p.id) || WM.isMeshDeleted(p.editorKey) || WM.isMeshDeleted(p.finger)
        )) return;
        const wkey = WM.normalizeWorldKey && WM.normalizeWorldKey(p.editorKey || p.id || '');
        if (wkey && WM.isWorldObjectDeleted && WM.isWorldObjectDeleted(wkey)) return;

        // Персонаж — через playerSpawn, не через mesh-match
        if (this._isPlayerProp(p)) {
          if (p.position && WM.setPlayerSpawn) {
            WM.setPlayerSpawn(p.position.x, p.position.y || 0, p.position.z);
          }
          return;
        }

        // Растительность отрисовывается через FoliageInstancer (InstancedMesh)
        if (this._foliageInstancer && this._foliageInstancer.isFoliageProp(p)) {
          applied++;
          return;
        }

        if (this._isIgnoredOrHelperProp(p)) {
          return;
        }

        // Миграция старых id без метаданных → угадываем по scale/позиции
        this._enrichPropIdentity(p);

        const existingMesh = this.findMeshForProp(p);

        if (existingMesh) {
          if (!existingMesh.userData) existingMesh.userData = {};
          // Нормализуем id на editorKey если есть
          const stableId = existingMesh.userData.editorKey || p.id;
          const finger = this.computeMeshFingerprint(existingMesh);
          const geoVerts = this.getGeoVerts(existingMesh);
          existingMesh.userData.propId = stableId;
          existingMesh.userData.finger = finger;
          existingMesh.userData.geoVerts = geoVerts;

          // Обновляем ИСХОДНУЮ запись в CUSTOM_PROPS (buildCustomProps отдаёт копии)
          const src = WM.CUSTOM_PROPS.find(x =>
            x.id === p.id ||
            (stableId && x.id === stableId) ||
            (p.finger && x.finger === p.finger) ||
            (geoVerts > 0 && (x.geoVerts === geoVerts || this.parseGeoVertsFromFinger(x.finger) === geoVerts))
          );
          if (src) {
            src.id = stableId;
            src.finger = finger;
            src.geoVerts = geoVerts;
            if (existingMesh.userData.editorKey) src.editorKey = existingMesh.userData.editorKey;
            src.meshType = src.meshType || 'scene_ref';
          }

          if (p.position) existingMesh.position.set(p.position.x, p.position.y, p.position.z);
          if (p.rotation) existingMesh.rotation.set(p.rotation.x || 0, p.rotation.y || 0, p.rotation.z || 0);
          if (p.scale) existingMesh.scale.set(p.scale.x || 1, p.scale.y || 1, p.scale.z || 1);
          existingMesh.updateMatrixWorld(true);
          this.customPropMeshes.set(stableId, existingMesh);
          applied++;
          // Лог по каждому пропсу: 576 пропсов × 6 вызовов applySavedTransforms
          // по расписанию = до 3400 строк в консоль на старте. Только dev.
          if (window.PS_DEV) {
            console.log('[SceneEditor] applied', stableId, '→',
              'pos', p.position && p.position.x, p.position && p.position.z,
              'verts', geoVerts);
          }
        } else if (p.meshType && p.meshType !== 'scene_ref') {
          this.spawnCustomPropMesh(p);
          applied++;
        } else {
          missing++;
          if (!this._missingLogged) this._missingLogged = new Set();
          if (!this._missingLogged.has(p.id)) {
            this._missingLogged.add(p.id);
            console.warn('[SceneEditor] mesh not found for prop', p.id,
              'verts=', p.geoVerts || this.parseGeoVertsFromFinger(p.finger),
              'finger=', p.finger || '', 'key=', p.editorKey || '',
              'scale=', p.scale);
          }
        }
      });
      // После успешного apply — нормализуем localStorage (id→volcano, finger, key)
      if (applied > 0 && !this._didNormalizeSave) {
        this._didNormalizeSave = true;
        try { this.saveToLocalStorage(); } catch (e) {}
      }
      return applied;
    }

    _initKnownTextures() {
      if (this._knownTexturesMap) return;
      if (window.PROP_TEXTURES_DATA || window._SHARED_PROP_TEXTURES_MAP) {
        this._knownTexturesMap = window.PROP_TEXTURES_DATA || window._SHARED_PROP_TEXTURES_MAP;
        window._SHARED_PROP_TEXTURES_MAP = this._knownTexturesMap;
        return;
      }
      this._knownTexturesMap = new Map([
        ["airship.webp", "airship.webp"],
        ["airship_mooring_mast.webp", "airship_mooring_mast.webp"],
        ["axe.png", "Axe.png"],
        ["axe.webp", "Axe.webp"],
        ["bacon.png", "Bacon.png"],
        ["bacon.webp", "Bacon.webp"],
        ["barrel.png", "Barrel.png"],
        ["barrel.webp", "Barrel.webp"],
        ["bluberrybush.png", "BluberryBush.png"],
        ["bluberrybush.webp", "BluberryBush.webp"],
        ["blueberrybush.png", "BlueberryBush.png"],
        ["blueberrybush.webp", "BlueberryBush.webp"],
        ["blue_book.png", "Blue_book.png"],
        ["blue_book.webp", "Blue_book.webp"],
        ["boiler.webp", "boiler.webp"],
        ["boiler_room.webp", "boiler_room.webp"],
        ["bottle.png", "Bottle.png"],
        ["bottle.webp", "Bottle.webp"],
        ["bracketfungus.png", "BracketFungus.png"],
        ["bracketfungus.webp", "BracketFungus.webp"],
        ["bush01.png", "bush01.png"],
        ["bush01.webp", "bush01.webp"],
        ["bush01_winter.png", "bush01_winter.png"],
        ["bush01_winter.webp", "bush01_winter.webp"],
        ["bush02.png", "bush02.png"],
        ["bush02.webp", "bush02.webp"],
        ["bush02_winter.png", "bush02_winter.png"],
        ["bush02_winter.webp", "bush02_winter.webp"],
        ["bush03.png", "bush03.png"],
        ["bush03.webp", "bush03.webp"],
        ["bush03_winter.png", "bush03_winter.png"],
        ["bush03_winter.webp", "bush03_winter.webp"],
        ["bush04.png", "bush04.png"],
        ["bush04.webp", "bush04.webp"],
        ["bush04_winter.png", "bush04_winter.png"],
        ["bush04_winter.webp", "bush04_winter.webp"],
        ["bush05.png", "bush05.png"],
        ["bush05.webp", "bush05.webp"],
        ["bush05_winter.png", "bush05_winter.png"],
        ["bush05_winter.webp", "bush05_winter.webp"],
        ["bush06.png", "bush06.png"],
        ["bush06.webp", "bush06.webp"],
        ["bush06_winter.png", "bush06_winter.png"],
        ["bush06_winter.webp", "bush06_winter.webp"],
        ["bush07.png", "bush07.png"],
        ["bush07.webp", "bush07.webp"],
        ["bush08.png", "bush08.png"],
        ["bush08.webp", "bush08.webp"],
        ["bush1_fall.png", "bush1_fall.png"],
        ["bush1_fall.webp", "bush1_fall.webp"],
        ["bush1_spring.png", "bush1_spring.png"],
        ["bush1_spring.webp", "bush1_spring.webp"],
        ["bush1_summer.png", "bush1_summer.png"],
        ["bush1_summer.webp", "bush1_summer.webp"],
        ["bush1_winter.png", "bush1_winter.png"],
        ["bush1_winter.webp", "bush1_winter.webp"],
        ["bush2_fall.png", "bush2_fall.png"],
        ["bush2_fall.webp", "bush2_fall.webp"],
        ["bush2_spring1.png", "bush2_spring1.png"],
        ["bush2_spring1.webp", "bush2_spring1.webp"],
        ["bush2_spring2.png", "bush2_spring2.png"],
        ["bush2_spring2.webp", "bush2_spring2.webp"],
        ["bush2_spring3.png", "bush2_spring3.png"],
        ["bush2_spring3.webp", "bush2_spring3.webp"],
        ["bush2_spring4.png", "bush2_spring4.png"],
        ["bush2_spring4.webp", "bush2_spring4.webp"],
        ["bush2_spring5.png", "bush2_spring5.png"],
        ["bush2_spring5.webp", "bush2_spring5.webp"],
        ["bush2_spring6.png", "bush2_spring6.png"],
        ["bush2_spring6.webp", "bush2_spring6.webp"],
        ["bush2_summer.png", "bush2_summer.png"],
        ["bush2_summer.webp", "bush2_summer.webp"],
        ["bush2_winter.png", "bush2_winter.png"],
        ["bush2_winter.webp", "bush2_winter.webp"],
        ["bush3_fall.png", "bush3_fall.png"],
        ["bush3_fall.webp", "bush3_fall.webp"],
        ["bush3_spring1.png", "bush3_spring1.png"],
        ["bush3_spring1.webp", "bush3_spring1.webp"],
        ["bush3_spring2.png", "bush3_spring2.png"],
        ["bush3_spring2.webp", "bush3_spring2.webp"],
        ["bush3_spring3.png", "bush3_spring3.png"],
        ["bush3_spring3.webp", "bush3_spring3.webp"],
        ["bush3_spring4.png", "bush3_spring4.png"],
        ["bush3_spring4.webp", "bush3_spring4.webp"],
        ["bush3_spring5.png", "bush3_spring5.png"],
        ["bush3_spring5.webp", "bush3_spring5.webp"],
        ["bush3_spring6.png", "bush3_spring6.png"],
        ["bush3_spring6.webp", "bush3_spring6.webp"],
        ["bush3_summer.png", "bush3_summer.png"],
        ["bush3_summer.webp", "bush3_summer.webp"],
        ["bush3_winter.png", "bush3_winter.png"],
        ["bush3_winter.webp", "bush3_winter.webp"],
        ["bush4_fall.png", "bush4_fall.png"],
        ["bush4_fall.webp", "bush4_fall.webp"],
        ["bush4_spring1.png", "bush4_spring1.png"],
        ["bush4_spring1.webp", "bush4_spring1.webp"],
        ["bush4_spring2.png", "bush4_spring2.png"],
        ["bush4_spring2.webp", "bush4_spring2.webp"],
        ["bush4_spring3.png", "bush4_spring3.png"],
        ["bush4_spring3.webp", "bush4_spring3.webp"],
        ["bush4_spring4.png", "bush4_spring4.png"],
        ["bush4_spring4.webp", "bush4_spring4.webp"],
        ["bush4_spring5.png", "bush4_spring5.png"],
        ["bush4_spring5.webp", "bush4_spring5.webp"],
        ["bush4_spring6.png", "bush4_spring6.png"],
        ["bush4_spring6.webp", "bush4_spring6.webp"],
        ["bush4_summer.png", "bush4_summer.png"],
        ["bush4_summer.webp", "bush4_summer.webp"],
        ["bush4_winter.png", "bush4_winter.png"],
        ["bush4_winter.webp", "bush4_winter.webp"],
        ["bush5_fall.png", "bush5_fall.png"],
        ["bush5_fall.webp", "bush5_fall.webp"],
        ["bush5_spring1.png", "bush5_spring1.png"],
        ["bush5_spring1.webp", "bush5_spring1.webp"],
        ["bush5_spring2.png", "bush5_spring2.png"],
        ["bush5_spring2.webp", "bush5_spring2.webp"],
        ["bush5_spring3.png", "bush5_spring3.png"],
        ["bush5_spring3.webp", "bush5_spring3.webp"],
        ["bush5_spring4.png", "bush5_spring4.png"],
        ["bush5_spring4.webp", "bush5_spring4.webp"],
        ["bush5_spring5.png", "bush5_spring5.png"],
        ["bush5_spring5.webp", "bush5_spring5.webp"],
        ["bush5_spring6.png", "bush5_spring6.png"],
        ["bush5_spring6.webp", "bush5_spring6.webp"],
        ["bush5_summer.png", "bush5_summer.png"],
        ["bush5_summer.webp", "bush5_summer.webp"],
        ["bush5_winter.png", "bush5_winter.png"],
        ["bush5_winter.webp", "bush5_winter.webp"],
        ["bush6_fall.png", "bush6_fall.png"],
        ["bush6_fall.webp", "bush6_fall.webp"],
        ["bush6_spring1.png", "bush6_spring1.png"],
        ["bush6_spring1.webp", "bush6_spring1.webp"],
        ["bush6_spring2.png", "bush6_spring2.png"],
        ["bush6_spring2.webp", "bush6_spring2.webp"],
        ["bush6_spring3.png", "bush6_spring3.png"],
        ["bush6_spring3.webp", "bush6_spring3.webp"],
        ["bush6_spring4.png", "bush6_spring4.png"],
        ["bush6_spring4.webp", "bush6_spring4.webp"],
        ["bush6_spring5.png", "bush6_spring5.png"],
        ["bush6_spring5.webp", "bush6_spring5.webp"],
        ["bush6_spring6.png", "bush6_spring6.png"],
        ["bush6_spring6.webp", "bush6_spring6.webp"],
        ["bush6_summer.png", "bush6_summer.png"],
        ["bush6_summer.webp", "bush6_summer.webp"],
        ["bush6_winter.png", "bush6_winter.png"],
        ["bush6_winter.webp", "bush6_winter.webp"],
        ["bush7_fall.png", "bush7_fall.png"],
        ["bush7_fall.webp", "bush7_fall.webp"],
        ["bush7_spring.png", "bush7_spring.png"],
        ["bush7_spring.webp", "bush7_spring.webp"],
        ["bush7_summer.png", "bush7_summer.png"],
        ["bush7_summer.webp", "bush7_summer.webp"],
        ["bush7_winter.png", "bush7_winter.png"],
        ["bush7_winter.webp", "bush7_winter.webp"],
        ["bush8_fall.png", "bush8_fall.png"],
        ["bush8_fall.webp", "bush8_fall.webp"],
        ["bush8_spring.png", "bush8_spring.png"],
        ["bush8_spring.webp", "bush8_spring.webp"],
        ["bush8_summer.png", "bush8_summer.png"],
        ["bush8_summer.webp", "bush8_summer.webp"],
        ["bush8_winter.png", "bush8_winter.png"],
        ["bush8_winter.webp", "bush8_winter.webp"],
        ["castle_brick_01_diffuse_2k.jpg", "castle_brick_01_diffuse_2k.jpg"],
        ["castle_wall_slates_diff_2k.jpg", "castle_wall_slates_diff_2k.jpg"],
        ["chapel.webp", "chapel.webp"],
        ["cheese.png", "Cheese.png"],
        ["cheese.webp", "Cheese.webp"],
        ["clay_roof_tiles_03_diffuse_2k.jpg", "clay_roof_tiles_03_diffuse_2k.jpg"],
        ["clay_roof_tiles_diff_1k.jpg", "clay_roof_tiles_diff_1k.jpg"],
        ["cobblestone_floor_001_diffuse_2k.jpg", "cobblestone_floor_001_diffuse_2k.jpg"],
        ["cobblestone_large_01_diff_1k.jpg", "cobblestone_large_01_diff_1k.jpg"],
        ["dark_wooden_planks_diffuse_2k.jpg", "dark_wooden_planks_diffuse_2k.jpg"],
        ["dark_wood_diff_2k.jpg", "dark_wood_diff_2k.jpg"],
        ["dead_tree_rt_1.png", "dead_tree_rt_1.png"],
        ["dead_tree_rt_1.webp", "dead_tree_rt_1.webp"],
        ["dead_tree_rt_2.png", "dead_tree_rt_2.png"],
        ["dead_tree_rt_2.webp", "dead_tree_rt_2.webp"],
        ["fabric.png", "Fabric.png"],
        ["fabric.webp", "Fabric.webp"],
        ["fabricroof.png", "FabricRoof.png"],
        ["fabricroof.webp", "FabricRoof.webp"],
        ["fabricsmall.png", "FabricSmall.png"],
        ["fabricsmall.webp", "FabricSmall.webp"],
        ["fabricwall.png", "FabricWall.png"],
        ["fabricwall.webp", "FabricWall.webp"],
        ["fabric_2.png", "Fabric_2.png"],
        ["fabric_2.webp", "Fabric_2.webp"],
        ["farbricroof.png", "FarbricRoof.png"],
        ["farbricroof.webp", "FarbricRoof.webp"],
        ["fern.png", "Fern.png"],
        ["fern.webp", "Fern.webp"],
        ["field_poppy.png", "field_poppy.png"],
        ["field_poppy.webp", "field_poppy.webp"],
        ["field_poppy_a.png", "field_poppy_a.png"],
        ["field_poppy_a.webp", "field_poppy_a.webp"],
        ["field_poppy_b.png", "field_poppy_b.png"],
        ["field_poppy_b.webp", "field_poppy_b.webp"],
        ["field_poppy_c.png", "field_poppy_c.png"],
        ["field_poppy_c.webp", "field_poppy_c.webp"],
        ["field_poppy_d.png", "field_poppy_d.png"],
        ["field_poppy_d.webp", "field_poppy_d.webp"],
        ["field_poppy_diffuse_alpha.png", "Field_Poppy_Diffuse_Alpha.png"],
        ["field_poppy_diffuse_alpha.webp", "Field_Poppy_Diffuse_Alpha.webp"],
        ["field_poppy_e.png", "field_poppy_e.png"],
        ["field_poppy_e.webp", "field_poppy_e.webp"],
        ["field_poppy_f.png", "field_poppy_f.png"],
        ["field_poppy_f.webp", "field_poppy_f.webp"],
        ["field_poppy_g.png", "field_poppy_g.png"],
        ["field_poppy_g.webp", "field_poppy_g.webp"],
        ["field_poppy_h.png", "field_poppy_h.png"],
        ["field_poppy_h.webp", "field_poppy_h.webp"],
        ["field_poppy_vmcobd0ja_low_1k_basecolor.png", "Field_Poppy_vmcobd0ja_Low_1K_BaseColor.png"],
        ["field_poppy_vmcobd0ja_low_1k_basecolor.webp", "Field_Poppy_vmcobd0ja_Low_1K_BaseColor.webp"],
        ["grass01.png", "grass01.png"],
        ["grass01.webp", "grass01.webp"],
        ["grass02.png", "grass02.png"],
        ["grass02.webp", "grass02.webp"],
        ["grass03.png", "grass03.png"],
        ["grass03.webp", "grass03.webp"],
        ["grass04.png", "grass04.png"],
        ["grass04.webp", "grass04.webp"],
        ["grass05.png", "grass05.png"],
        ["grass05.webp", "grass05.webp"],
        ["grass06.png", "grass06.png"],
        ["grass06.webp", "grass06.webp"],
        ["grass07.png", "grass07.png"],
        ["grass07.webp", "grass07.webp"],
        ["grass08.png", "grass08.png"],
        ["grass08.webp", "grass08.webp"],
        ["grass09.png", "grass09.png"],
        ["grass09.webp", "grass09.webp"],
        ["grass_bush.png", "grass_bush.png"],
        ["grass_bush.webp", "grass_bush.webp"],
        ["grass_bush_fall.png", "grass_bush_fall.png"],
        ["grass_bush_fall.webp", "grass_bush_fall.webp"],
        ["grass_bush_spring.png", "grass_bush_spring.png"],
        ["grass_bush_spring.webp", "grass_bush_spring.webp"],
        ["grass_bush_summer.png", "grass_bush_summer.png"],
        ["grass_bush_summer.webp", "grass_bush_summer.webp"],
        ["grass_bush_winter.png", "grass_bush_winter.png"],
        ["grass_bush_winter.webp", "grass_bush_winter.webp"],
        ["grass_fall.png", "grass_fall.png"],
        ["grass_fall.webp", "grass_fall.webp"],
        ["grass_patch.png", "grass_patch.png"],
        ["grass_patch.webp", "grass_patch.webp"],
        ["grass_patch_corner.png", "grass_patch_corner.png"],
        ["grass_patch_corner.webp", "grass_patch_corner.webp"],
        ["grass_patch_fall.png", "grass_patch_fall.png"],
        ["grass_patch_fall.webp", "grass_patch_fall.webp"],
        ["grass_patch_spring.png", "grass_patch_spring.png"],
        ["grass_patch_spring.webp", "grass_patch_spring.webp"],
        ["grass_patch_summer.png", "grass_patch_summer.png"],
        ["grass_patch_summer.webp", "grass_patch_summer.webp"],
        ["grass_patch_winter.png", "grass_patch_winter.png"],
        ["grass_patch_winter.webp", "grass_patch_winter.webp"],
        ["grass_spring.png", "grass_spring.png"],
        ["grass_spring.webp", "grass_spring.webp"],
        ["grass_summer.png", "grass_summer.png"],
        ["grass_summer.webp", "grass_summer.webp"],
        ["grass_winter.png", "grass_winter.png"],
        ["grass_winter.webp", "grass_winter.webp"],
        ["green_book.png", "Green_book.png"],
        ["green_book.webp", "Green_book.webp"],
        ["grey_roof_01_diffuse_2k.jpg", "grey_roof_01_diffuse_2k.jpg"],
        ["grey_roof_tiles_02_diffuse_2k.jpg", "grey_roof_tiles_02_diffuse_2k.jpg"],
        ["halberd.png", "Halberd.png"],
        ["halberd.webp", "Halberd.webp"],
        ["house_01.webp", "house_01.webp"],
        ["house_02.webp", "house_02.webp"],
        ["house_03.webp", "house_03.webp"],
        ["house_04.webp", "house_04.webp"],
        ["house_05.webp", "house_05.webp"],
        ["house_06.webp", "house_06.webp"],
        ["house_07.webp", "house_07.webp"],
        ["house_08.webp", "house_08.webp"],
        ["house_engineer_01.webp", "house_engineer_01.webp"],
        ["house_engineer_02.webp", "house_engineer_02.webp"],
        ["house_engineer_03.webp", "house_engineer_03.webp"],
        ["house_engineer_04.webp", "house_engineer_04.webp"],
        ["house_engineer_05.webp", "house_engineer_05.webp"],
        ["house_engineer_06.webp", "house_engineer_06.webp"],
        ["log2.png", "Log2.png"],
        ["log2.webp", "Log2.webp"],
        ["log_1.png", "Log_1.png"],
        ["log_1.webp", "Log_1.webp"],
        ["log_2.png", "Log_2.png"],
        ["log_2.webp", "Log_2.webp"],
        ["log_3.png", "Log_3.png"],
        ["log_3.webp", "Log_3.webp"],
        ["log_4.png", "Log_4.png"],
        ["log_4.webp", "Log_4.webp"],
        ["log_4_alt.png", "Log_4_Alt.png"],
        ["log_4_alt.webp", "Log_4_Alt.webp"],
        ["mannequin.png", "Mannequin.png"],
        ["mannequin.webp", "Mannequin.webp"],
        ["market_stall_01.webp", "market_stall_01.webp"],
        ["market_stall_02.webp", "market_stall_02.webp"],
        ["market_stall_03.webp", "market_stall_03.webp"],
        ["market_stall_04.webp", "market_stall_04.webp"],
        ["matted_pratia.png", "matted_pratia.png"],
        ["matted_pratia.webp", "matted_pratia.webp"],
        ["matted_pratia_a.png", "matted_pratia_a.png"],
        ["matted_pratia_a.webp", "matted_pratia_a.webp"],
        ["matted_pratia_b.png", "matted_pratia_b.png"],
        ["matted_pratia_b.webp", "matted_pratia_b.webp"],
        ["matted_pratia_c.png", "matted_pratia_c.png"],
        ["matted_pratia_c.webp", "matted_pratia_c.webp"],
        ["matted_pratia_d.png", "matted_pratia_d.png"],
        ["matted_pratia_d.webp", "matted_pratia_d.webp"],
        ["matted_pratia_diffuse_alpha.png", "Matted_Pratia_Diffuse_Alpha.png"],
        ["matted_pratia_diffuse_alpha.webp", "Matted_Pratia_Diffuse_Alpha.webp"],
        ["matted_pratia_e.png", "matted_pratia_e.png"],
        ["matted_pratia_e.webp", "matted_pratia_e.webp"],
        ["matted_pratia_f.png", "matted_pratia_f.png"],
        ["matted_pratia_f.webp", "matted_pratia_f.webp"],
        ["matted_pratia_g.png", "matted_pratia_g.png"],
        ["matted_pratia_g.webp", "matted_pratia_g.webp"],
        ["matted_pratia_h.png", "matted_pratia_h.png"],
        ["matted_pratia_h.webp", "matted_pratia_h.webp"],
        ["matted_pratia_uegjcflia_low_1k_basecolor.png", "Matted_Pratia_uegjcflia_Low_1K_BaseColor.png"],
        ["matted_pratia_uegjcflia_low_1k_basecolor.webp", "Matted_Pratia_uegjcflia_Low_1K_BaseColor.webp"],
        ["meat.png", "Meat.png"],
        ["meat.webp", "Meat.webp"],
        ["meat_1.png", "Meat_1.png"],
        ["meat_1.webp", "Meat_1.webp"],
        ["meat_2.png", "Meat_2.png"],
        ["meat_2.webp", "Meat_2.webp"],
        ["medieval_blocks_05_diffuse_2k.jpg", "medieval_blocks_05_diffuse_2k.jpg"],
        ["medieval_blocks_06_diff_2k.jpg", "medieval_blocks_06_diff_2k.jpg"],
        ["medieval_wall_01_diffuse_2k.jpg", "medieval_wall_01_diffuse_2k.jpg"],
        ["medieval_wood_diffuse_2k.jpg", "medieval_wood_diffuse_2k.jpg"],
        ["metal_plate_02_diff_1k.jpg", "metal_plate_02_diff_1k.jpg"],
        ["monument_central.webp", "monument_central.webp"],
        ["monument_wheel.webp", "monument_wheel.webp"],
        ["mushroom.png", "Mushroom.png"],
        ["mushroom.webp", "Mushroom.webp"],
        ["pieceofwood.png", "PieceOfWood.png"],
        ["pieceofwood.webp", "PieceOfWood.webp"],
        ["plank.png", "Plank.png"],
        ["plank.webp", "Plank.webp"],
        ["plant.png", "Plant.png"],
        ["plant.webp", "Plant.webp"],
        ["plants.png", "Plants.png"],
        ["plants.webp", "Plants.webp"],
        ["porkleg.png", "PorkLeg.png"],
        ["porkleg.webp", "PorkLeg.webp"],
        ["pot.png", "Pot.png"],
        ["pot.webp", "Pot.webp"],
        ["red_book.png", "Red_book.png"],
        ["red_book.webp", "Red_book.webp"],
        ["retro_bush01.png", "retro_bush01.png"],
        ["retro_bush01.webp", "retro_bush01.webp"],
        ["retro_bush02.png", "retro_bush02.png"],
        ["retro_bush02.webp", "retro_bush02.webp"],
        ["retro_bush03.png", "retro_bush03.png"],
        ["retro_bush03.webp", "retro_bush03.webp"],
        ["retro_bush04.png", "retro_bush04.png"],
        ["retro_bush04.webp", "retro_bush04.webp"],
        ["retro_bush05.png", "retro_bush05.png"],
        ["retro_bush05.webp", "retro_bush05.webp"],
        ["retro_bush06.png", "retro_bush06.png"],
        ["retro_bush06.webp", "retro_bush06.webp"],
        ["retro_bush07.png", "retro_bush07.png"],
        ["retro_bush07.webp", "retro_bush07.webp"],
        ["retro_bush08.png", "retro_bush08.png"],
        ["retro_bush08.webp", "retro_bush08.webp"],
        ["retro_bush1.png", "retro_bush1.png"],
        ["retro_bush1.webp", "retro_bush1.webp"],
        ["retro_bush1_fall.png", "retro_bush1_fall.png"],
        ["retro_bush1_fall.webp", "retro_bush1_fall.webp"],
        ["retro_bush1_spring.png", "retro_bush1_spring.png"],
        ["retro_bush1_spring.webp", "retro_bush1_spring.webp"],
        ["retro_bush1_summer.png", "retro_bush1_summer.png"],
        ["retro_bush1_summer.webp", "retro_bush1_summer.webp"],
        ["retro_bush1_winter.png", "retro_bush1_winter.png"],
        ["retro_bush1_winter.webp", "retro_bush1_winter.webp"],
        ["retro_bush2.png", "retro_bush2.png"],
        ["retro_bush2.webp", "retro_bush2.webp"],
        ["retro_bush2_fall.png", "retro_bush2_fall.png"],
        ["retro_bush2_fall.webp", "retro_bush2_fall.webp"],
        ["retro_bush2_spring1.png", "retro_bush2_spring1.png"],
        ["retro_bush2_spring1.webp", "retro_bush2_spring1.webp"],
        ["retro_bush2_spring2.png", "retro_bush2_spring2.png"],
        ["retro_bush2_spring2.webp", "retro_bush2_spring2.webp"],
        ["retro_bush2_spring3.png", "retro_bush2_spring3.png"],
        ["retro_bush2_spring3.webp", "retro_bush2_spring3.webp"],
        ["retro_bush2_spring4.png", "retro_bush2_spring4.png"],
        ["retro_bush2_spring4.webp", "retro_bush2_spring4.webp"],
        ["retro_bush2_spring5.png", "retro_bush2_spring5.png"],
        ["retro_bush2_spring5.webp", "retro_bush2_spring5.webp"],
        ["retro_bush2_spring6.png", "retro_bush2_spring6.png"],
        ["retro_bush2_spring6.webp", "retro_bush2_spring6.webp"],
        ["retro_bush2_summer.png", "retro_bush2_summer.png"],
        ["retro_bush2_summer.webp", "retro_bush2_summer.webp"],
        ["retro_bush2_winter.png", "retro_bush2_winter.png"],
        ["retro_bush2_winter.webp", "retro_bush2_winter.webp"],
        ["retro_bush3.png", "retro_bush3.png"],
        ["retro_bush3.webp", "retro_bush3.webp"],
        ["retro_bush3_fall.png", "retro_bush3_fall.png"],
        ["retro_bush3_fall.webp", "retro_bush3_fall.webp"],
        ["retro_bush3_spring1.png", "retro_bush3_spring1.png"],
        ["retro_bush3_spring1.webp", "retro_bush3_spring1.webp"],
        ["retro_bush3_spring2.png", "retro_bush3_spring2.png"],
        ["retro_bush3_spring2.webp", "retro_bush3_spring2.webp"],
        ["retro_bush3_spring3.png", "retro_bush3_spring3.png"],
        ["retro_bush3_spring3.webp", "retro_bush3_spring3.webp"],
        ["retro_bush3_spring4.png", "retro_bush3_spring4.png"],
        ["retro_bush3_spring4.webp", "retro_bush3_spring4.webp"],
        ["retro_bush3_spring5.png", "retro_bush3_spring5.png"],
        ["retro_bush3_spring5.webp", "retro_bush3_spring5.webp"],
        ["retro_bush3_spring6.png", "retro_bush3_spring6.png"],
        ["retro_bush3_spring6.webp", "retro_bush3_spring6.webp"],
        ["retro_bush3_summer.png", "retro_bush3_summer.png"],
        ["retro_bush3_summer.webp", "retro_bush3_summer.webp"],
        ["retro_bush3_winter.png", "retro_bush3_winter.png"],
        ["retro_bush3_winter.webp", "retro_bush3_winter.webp"],
        ["retro_bush4.png", "retro_bush4.png"],
        ["retro_bush4.webp", "retro_bush4.webp"],
        ["retro_bush4_fall.png", "retro_bush4_fall.png"],
        ["retro_bush4_fall.webp", "retro_bush4_fall.webp"],
        ["retro_bush4_spring1.png", "retro_bush4_spring1.png"],
        ["retro_bush4_spring1.webp", "retro_bush4_spring1.webp"],
        ["retro_bush4_spring2.png", "retro_bush4_spring2.png"],
        ["retro_bush4_spring2.webp", "retro_bush4_spring2.webp"],
        ["retro_bush4_spring3.png", "retro_bush4_spring3.png"],
        ["retro_bush4_spring3.webp", "retro_bush4_spring3.webp"],
        ["retro_bush4_spring4.png", "retro_bush4_spring4.png"],
        ["retro_bush4_spring4.webp", "retro_bush4_spring4.webp"],
        ["retro_bush4_spring5.png", "retro_bush4_spring5.png"],
        ["retro_bush4_spring5.webp", "retro_bush4_spring5.webp"],
        ["retro_bush4_spring6.png", "retro_bush4_spring6.png"],
        ["retro_bush4_spring6.webp", "retro_bush4_spring6.webp"],
        ["retro_bush4_summer.png", "retro_bush4_summer.png"],
        ["retro_bush4_summer.webp", "retro_bush4_summer.webp"],
        ["retro_bush4_winter.png", "retro_bush4_winter.png"],
        ["retro_bush4_winter.webp", "retro_bush4_winter.webp"],
        ["retro_bush5.png", "retro_bush5.png"],
        ["retro_bush5.webp", "retro_bush5.webp"],
        ["retro_bush5_fall.png", "retro_bush5_fall.png"],
        ["retro_bush5_fall.webp", "retro_bush5_fall.webp"],
        ["retro_bush5_spring1.png", "retro_bush5_spring1.png"],
        ["retro_bush5_spring1.webp", "retro_bush5_spring1.webp"],
        ["retro_bush5_spring2.png", "retro_bush5_spring2.png"],
        ["retro_bush5_spring2.webp", "retro_bush5_spring2.webp"],
        ["retro_bush5_spring3.png", "retro_bush5_spring3.png"],
        ["retro_bush5_spring3.webp", "retro_bush5_spring3.webp"],
        ["retro_bush5_spring4.png", "retro_bush5_spring4.png"],
        ["retro_bush5_spring4.webp", "retro_bush5_spring4.webp"],
        ["retro_bush5_spring5.png", "retro_bush5_spring5.png"],
        ["retro_bush5_spring5.webp", "retro_bush5_spring5.webp"],
        ["retro_bush5_spring6.png", "retro_bush5_spring6.png"],
        ["retro_bush5_spring6.webp", "retro_bush5_spring6.webp"],
        ["retro_bush5_summer.png", "retro_bush5_summer.png"],
        ["retro_bush5_summer.webp", "retro_bush5_summer.webp"],
        ["retro_bush5_winter.png", "retro_bush5_winter.png"],
        ["retro_bush5_winter.webp", "retro_bush5_winter.webp"],
        ["retro_bush6.png", "retro_bush6.png"],
        ["retro_bush6.webp", "retro_bush6.webp"],
        ["retro_bush6_fall.png", "retro_bush6_fall.png"],
        ["retro_bush6_fall.webp", "retro_bush6_fall.webp"],
        ["retro_bush6_spring1.png", "retro_bush6_spring1.png"],
        ["retro_bush6_spring1.webp", "retro_bush6_spring1.webp"],
        ["retro_bush6_spring2.png", "retro_bush6_spring2.png"],
        ["retro_bush6_spring2.webp", "retro_bush6_spring2.webp"],
        ["retro_bush6_spring3.png", "retro_bush6_spring3.png"],
        ["retro_bush6_spring3.webp", "retro_bush6_spring3.webp"],
        ["retro_bush6_spring4.png", "retro_bush6_spring4.png"],
        ["retro_bush6_spring4.webp", "retro_bush6_spring4.webp"],
        ["retro_bush6_spring5.png", "retro_bush6_spring5.png"],
        ["retro_bush6_spring5.webp", "retro_bush6_spring5.webp"],
        ["retro_bush6_spring6.png", "retro_bush6_spring6.png"],
        ["retro_bush6_spring6.webp", "retro_bush6_spring6.webp"],
        ["retro_bush6_summer.png", "retro_bush6_summer.png"],
        ["retro_bush6_summer.webp", "retro_bush6_summer.webp"],
        ["retro_bush6_winter.png", "retro_bush6_winter.png"],
        ["retro_bush6_winter.webp", "retro_bush6_winter.webp"],
        ["retro_bush7.png", "retro_bush7.png"],
        ["retro_bush7.webp", "retro_bush7.webp"],
        ["retro_bush7_fall.png", "retro_bush7_fall.png"],
        ["retro_bush7_fall.webp", "retro_bush7_fall.webp"],
        ["retro_bush7_spring.png", "retro_bush7_spring.png"],
        ["retro_bush7_spring.webp", "retro_bush7_spring.webp"],
        ["retro_bush7_summer.png", "retro_bush7_summer.png"],
        ["retro_bush7_summer.webp", "retro_bush7_summer.webp"],
        ["retro_bush7_winter.png", "retro_bush7_winter.png"],
        ["retro_bush7_winter.webp", "retro_bush7_winter.webp"],
        ["retro_bush8.png", "retro_bush8.png"],
        ["retro_bush8.webp", "retro_bush8.webp"],
        ["retro_bush8_fall.png", "retro_bush8_fall.png"],
        ["retro_bush8_fall.webp", "retro_bush8_fall.webp"],
        ["retro_bush8_spring.png", "retro_bush8_spring.png"],
        ["retro_bush8_spring.webp", "retro_bush8_spring.webp"],
        ["retro_bush8_summer.png", "retro_bush8_summer.png"],
        ["retro_bush8_summer.webp", "retro_bush8_summer.webp"],
        ["retro_bush8_winter.png", "retro_bush8_winter.png"],
        ["retro_bush8_winter.webp", "retro_bush8_winter.webp"],
        ["retro_grass01.png", "retro_grass01.png"],
        ["retro_grass01.webp", "retro_grass01.webp"],
        ["retro_grass02.png", "retro_grass02.png"],
        ["retro_grass02.webp", "retro_grass02.webp"],
        ["retro_grass03.png", "retro_grass03.png"],
        ["retro_grass03.webp", "retro_grass03.webp"],
        ["retro_grass04.png", "retro_grass04.png"],
        ["retro_grass04.webp", "retro_grass04.webp"],
        ["retro_grass05.png", "retro_grass05.png"],
        ["retro_grass05.webp", "retro_grass05.webp"],
        ["retro_grass06.png", "retro_grass06.png"],
        ["retro_grass06.webp", "retro_grass06.webp"],
        ["retro_grass07.png", "retro_grass07.png"],
        ["retro_grass07.webp", "retro_grass07.webp"],
        ["retro_grass08.png", "retro_grass08.png"],
        ["retro_grass08.webp", "retro_grass08.webp"],
        ["retro_grass09.png", "retro_grass09.png"],
        ["retro_grass09.webp", "retro_grass09.webp"],
        ["ribs.png", "Ribs.png"],
        ["ribs.webp", "Ribs.webp"],
        ["roof_slates_02_diffuse_2k.jpg", "roof_slates_02_diffuse_2k.jpg"],
        ["rustic_stone_wall_02_diff_2k.jpg", "rustic_stone_wall_02_diff_2k.jpg"],
        ["sack.png", "Sack.png"],
        ["sack.webp", "Sack.webp"],
        ["sackofcorn.png", "SackOfCorn.png"],
        ["sackofcorn.webp", "SackOfCorn.webp"],
        ["sackofrice.png", "SackOfRice.png"],
        ["sackofrice.webp", "SackOfRice.webp"],
        ["sackofwheat.png", "SackOfWheat.png"],
        ["sackofwheat.webp", "SackOfWheat.webp"],
        ["sandstone_blocks_05_diff_1k.jpg", "sandstone_blocks_05_diff_1k.jpg"],
        ["sausage.png", "Sausage.png"],
        ["sausage.webp", "Sausage.webp"],
        ["sh1.webp", "sh1.webp"],
        ["sh1_color.webp", "SH1_COLOR.webp"],
        ["shield_1.png", "Shield_1.png"],
        ["shield_1.webp", "Shield_1.webp"],
        ["shield_2.png", "Shield_2.png"],
        ["shield_2.webp", "Shield_2.webp"],
        ["skull_book.png", "Skull_book.png"],
        ["skull_book.webp", "Skull_book.webp"],
        ["small_tree_rt_1.png", "small_tree_rt_1.png"],
        ["small_tree_rt_1.webp", "small_tree_rt_1.webp"],
        ["sm_rp_rock_2m_0.png", "SM_RP_Rock_2m_0.png"],
        ["sm_rp_rock_2m_0.webp", "SM_RP_Rock_2m_0.webp"],
        ["sm_rp_rock_2m_1.png", "SM_RP_Rock_2m_1.png"],
        ["sm_rp_rock_2m_1.webp", "SM_RP_Rock_2m_1.webp"],
        ["sm_rp_rock_2m_2.png", "SM_RP_Rock_2m_2.png"],
        ["sm_rp_rock_2m_2.webp", "SM_RP_Rock_2m_2.webp"],
        ["sm_rp_rock_2m_3.png", "SM_RP_Rock_2m_3.png"],
        ["sm_rp_rock_2m_3.webp", "SM_RP_Rock_2m_3.webp"],
        ["sm_rp_rock_2m_4.png", "SM_RP_Rock_2m_4.png"],
        ["sm_rp_rock_2m_4.webp", "SM_RP_Rock_2m_4.webp"],
        ["sm_rp_rock_2m_5.png", "SM_RP_Rock_2m_5.png"],
        ["sm_rp_rock_2m_5.webp", "SM_RP_Rock_2m_5.webp"],
        ["sm_rp_rock_4m_0.png", "SM_RP_Rock_4m_0.png"],
        ["sm_rp_rock_4m_0.webp", "SM_RP_Rock_4m_0.webp"],
        ["sm_rp_rock_4m_1.png", "SM_RP_Rock_4m_1.png"],
        ["sm_rp_rock_4m_1.webp", "SM_RP_Rock_4m_1.webp"],
        ["sm_rp_rock_4m_10.png", "SM_RP_Rock_4m_10.png"],
        ["sm_rp_rock_4m_10.webp", "SM_RP_Rock_4m_10.webp"],
        ["sm_rp_rock_4m_11.png", "SM_RP_Rock_4m_11.png"],
        ["sm_rp_rock_4m_11.webp", "SM_RP_Rock_4m_11.webp"],
        ["sm_rp_rock_4m_2.png", "SM_RP_Rock_4m_2.png"],
        ["sm_rp_rock_4m_2.webp", "SM_RP_Rock_4m_2.webp"],
        ["sm_rp_rock_4m_3.png", "SM_RP_Rock_4m_3.png"],
        ["sm_rp_rock_4m_3.webp", "SM_RP_Rock_4m_3.webp"],
        ["sm_rp_rock_4m_4.png", "SM_RP_Rock_4m_4.png"],
        ["sm_rp_rock_4m_4.webp", "SM_RP_Rock_4m_4.webp"],
        ["sm_rp_rock_4m_5.png", "SM_RP_Rock_4m_5.png"],
        ["sm_rp_rock_4m_5.webp", "SM_RP_Rock_4m_5.webp"],
        ["sm_rp_rock_4m_6.png", "SM_RP_Rock_4m_6.png"],
        ["sm_rp_rock_4m_6.webp", "SM_RP_Rock_4m_6.webp"],
        ["sm_rp_rock_4m_7.png", "SM_RP_Rock_4m_7.png"],
        ["sm_rp_rock_4m_7.webp", "SM_RP_Rock_4m_7.webp"],
        ["sm_rp_rock_4m_8.png", "SM_RP_Rock_4m_8.png"],
        ["sm_rp_rock_4m_8.webp", "SM_RP_Rock_4m_8.webp"],
        ["sm_rp_rock_4m_9.png", "SM_RP_Rock_4m_9.png"],
        ["sm_rp_rock_4m_9.webp", "SM_RP_Rock_4m_9.webp"],
        ["sm_rp_rock_8m_0.png", "SM_RP_Rock_8m_0.png"],
        ["sm_rp_rock_8m_0.webp", "SM_RP_Rock_8m_0.webp"],
        ["sm_rp_rock_8m_1.png", "SM_RP_Rock_8m_1.png"],
        ["sm_rp_rock_8m_1.webp", "SM_RP_Rock_8m_1.webp"],
        ["sm_rp_rock_8m_3.png", "SM_RP_Rock_8m_3.png"],
        ["sm_rp_rock_8m_3.webp", "SM_RP_Rock_8m_3.webp"],
        ["sm_rp_rock_8m_4.png", "SM_RP_Rock_8m_4.png"],
        ["sm_rp_rock_8m_4.webp", "SM_RP_Rock_8m_4.webp"],
        ["sm_rp_rock_8m_4k.png", "SM_RP_Rock_8m_4K.png"],
        ["sm_rp_rock_8m_4k.webp", "SM_RP_Rock_8m_4K.webp"],
        ["sm_rp_rock_8m_5.png", "SM_RP_Rock_8m_5.png"],
        ["sm_rp_rock_8m_5.webp", "SM_RP_Rock_8m_5.webp"],
        ["stone_wall_diff_2k.jpg", "stone_wall_diff_2k.jpg"],
        ["stumpwithmushroom.png", "StumpWithMushroom.png"],
        ["stumpwithmushroom.webp", "StumpWithMushroom.webp"],
        ["stump_1.png", "Stump_1.png"],
        ["stump_1.webp", "Stump_1.webp"],
        ["stump_2.png", "Stump_2.png"],
        ["stump_2.webp", "Stump_2.webp"],
        ["stump_3.png", "Stump_3.png"],
        ["stump_3.webp", "Stump_3.webp"],
        ["stump_4.png", "Stump_4.png"],
        ["stump_4.webp", "Stump_4.webp"],
        ["sword.png", "Sword.png"],
        ["sword.webp", "Sword.webp"],
        ["tent_02.webp", "tent_02.webp"],
        ["tent_03.webp", "tent_03.webp"],
        ["tp_zone.webp", "tp_zone.webp"],
        ["tree001.png", "tree001.png"],
        ["tree001.webp", "tree001.webp"],
        ["tree002.png", "tree002.png"],
        ["tree002.webp", "tree002.webp"],
        ["tree003.png", "tree003.png"],
        ["tree003.webp", "tree003.webp"],
        ["tree004.png", "tree004.png"],
        ["tree004.webp", "tree004.webp"],
        ["tree005.png", "tree005.png"],
        ["tree005.webp", "tree005.webp"],
        ["tree006.png", "tree006.png"],
        ["tree006.webp", "tree006.webp"],
        ["tree007.png", "tree007.png"],
        ["tree007.webp", "tree007.webp"],
        ["tree008.png", "tree008.png"],
        ["tree008.webp", "tree008.webp"],
        ["tree009.png", "tree009.png"],
        ["tree009.webp", "tree009.webp"],
        ["tree01.png", "tree01.png"],
        ["tree01.webp", "tree01.webp"],
        ["tree010.png", "tree010.png"],
        ["tree010.webp", "tree010.webp"],
        ["tree011.png", "tree011.png"],
        ["tree011.webp", "tree011.webp"],
        ["tree012.png", "tree012.png"],
        ["tree012.webp", "tree012.webp"],
        ["tree013.png", "tree013.png"],
        ["tree013.webp", "tree013.webp"],
        ["tree014.png", "tree014.png"],
        ["tree014.webp", "tree014.webp"],
        ["tree015.png", "tree015.png"],
        ["tree015.webp", "tree015.webp"],
        ["tree016.png", "tree016.png"],
        ["tree016.webp", "tree016.webp"],
        ["tree017.png", "tree017.png"],
        ["tree017.webp", "tree017.webp"],
        ["tree018.png", "tree018.png"],
        ["tree018.webp", "tree018.webp"],
        ["tree019.png", "tree019.png"],
        ["tree019.webp", "tree019.webp"],
        ["tree01_fall.png", "tree01_fall.png"],
        ["tree01_fall.webp", "tree01_fall.webp"],
        ["tree01_spring.png", "tree01_spring.png"],
        ["tree01_spring.webp", "tree01_spring.webp"],
        ["tree01_summer.png", "tree01_summer.png"],
        ["tree01_summer.webp", "tree01_summer.webp"],
        ["tree01_winter.png", "tree01_winter.png"],
        ["tree01_winter.webp", "tree01_winter.webp"],
        ["tree02.png", "tree02.png"],
        ["tree02.webp", "tree02.webp"],
        ["tree020.png", "tree020.png"],
        ["tree020.webp", "tree020.webp"],
        ["tree021.png", "tree021.png"],
        ["tree021.webp", "tree021.webp"],
        ["tree022.png", "tree022.png"],
        ["tree022.webp", "tree022.webp"],
        ["tree023.png", "tree023.png"],
        ["tree023.webp", "tree023.webp"],
        ["tree024.png", "tree024.png"],
        ["tree024.webp", "tree024.webp"],
        ["tree025.png", "tree025.png"],
        ["tree025.webp", "tree025.webp"],
        ["tree026.png", "tree026.png"],
        ["tree026.webp", "tree026.webp"],
        ["tree027.png", "tree027.png"],
        ["tree027.webp", "tree027.webp"],
        ["tree028.png", "tree028.png"],
        ["tree028.webp", "tree028.webp"],
        ["tree029.png", "tree029.png"],
        ["tree029.webp", "tree029.webp"],
        ["tree02_fall.png", "tree02_fall.png"],
        ["tree02_fall.webp", "tree02_fall.webp"],
        ["tree02_spring.png", "tree02_spring.png"],
        ["tree02_spring.webp", "tree02_spring.webp"],
        ["tree02_summer.png", "tree02_summer.png"],
        ["tree02_summer.webp", "tree02_summer.webp"],
        ["tree02_winter.png", "tree02_winter.png"],
        ["tree02_winter.webp", "tree02_winter.webp"],
        ["tree03.png", "tree03.png"],
        ["tree03.webp", "tree03.webp"],
        ["tree030.png", "tree030.png"],
        ["tree030.webp", "tree030.webp"],
        ["tree031.png", "tree031.png"],
        ["tree031.webp", "tree031.webp"],
        ["tree032.png", "tree032.png"],
        ["tree032.webp", "tree032.webp"],
        ["tree033.png", "tree033.png"],
        ["tree033.webp", "tree033.webp"],
        ["tree034.png", "tree034.png"],
        ["tree034.webp", "tree034.webp"],
        ["tree035.png", "tree035.png"],
        ["tree035.webp", "tree035.webp"],
        ["tree036.png", "tree036.png"],
        ["tree036.webp", "tree036.webp"],
        ["tree037.png", "tree037.png"],
        ["tree037.webp", "tree037.webp"],
        ["tree038.png", "tree038.png"],
        ["tree038.webp", "tree038.webp"],
        ["tree039.png", "tree039.png"],
        ["tree039.webp", "tree039.webp"],
        ["tree03_fall.png", "tree03_fall.png"],
        ["tree03_fall.webp", "tree03_fall.webp"],
        ["tree03_spring.png", "tree03_spring.png"],
        ["tree03_spring.webp", "tree03_spring.webp"],
        ["tree03_summer.png", "tree03_summer.png"],
        ["tree03_summer.webp", "tree03_summer.webp"],
        ["tree03_winter.png", "tree03_winter.png"],
        ["tree03_winter.webp", "tree03_winter.webp"],
        ["tree04.png", "tree04.png"],
        ["tree04.webp", "tree04.webp"],
        ["tree040.png", "tree040.png"],
        ["tree040.webp", "tree040.webp"],
        ["tree041.png", "tree041.png"],
        ["tree041.webp", "tree041.webp"],
        ["tree042.png", "tree042.png"],
        ["tree042.webp", "tree042.webp"],
        ["tree043.png", "tree043.png"],
        ["tree043.webp", "tree043.webp"],
        ["tree044.png", "tree044.png"],
        ["tree044.webp", "tree044.webp"],
        ["tree045.png", "tree045.png"],
        ["tree045.webp", "tree045.webp"],
        ["tree046.png", "tree046.png"],
        ["tree046.webp", "tree046.webp"],
        ["tree047.png", "tree047.png"],
        ["tree047.webp", "tree047.webp"],
        ["tree048.png", "tree048.png"],
        ["tree048.webp", "tree048.webp"],
        ["tree049.png", "tree049.png"],
        ["tree049.webp", "tree049.webp"],
        ["tree04_fall.png", "tree04_fall.png"],
        ["tree04_fall.webp", "tree04_fall.webp"],
        ["tree04_spring.png", "tree04_spring.png"],
        ["tree04_spring.webp", "tree04_spring.webp"],
        ["tree04_summer.png", "tree04_summer.png"],
        ["tree04_summer.webp", "tree04_summer.webp"],
        ["tree04_winter.png", "tree04_winter.png"],
        ["tree04_winter.webp", "tree04_winter.webp"],
        ["tree05.png", "tree05.png"],
        ["tree05.webp", "tree05.webp"],
        ["tree050.png", "tree050.png"],
        ["tree050.webp", "tree050.webp"],
        ["tree051.png", "tree051.png"],
        ["tree051.webp", "tree051.webp"],
        ["tree052.png", "tree052.png"],
        ["tree052.webp", "tree052.webp"],
        ["tree053.png", "tree053.png"],
        ["tree053.webp", "tree053.webp"],
        ["tree054.png", "tree054.png"],
        ["tree054.webp", "tree054.webp"],
        ["tree055.png", "tree055.png"],
        ["tree055.webp", "tree055.webp"],
        ["tree056.png", "tree056.png"],
        ["tree056.webp", "tree056.webp"],
        ["tree057.png", "tree057.png"],
        ["tree057.webp", "tree057.webp"],
        ["tree058.png", "tree058.png"],
        ["tree058.webp", "tree058.webp"],
        ["tree059.png", "tree059.png"],
        ["tree059.webp", "tree059.webp"],
        ["tree05_fall.png", "tree05_fall.png"],
        ["tree05_fall.webp", "tree05_fall.webp"],
        ["tree05_spring.png", "tree05_spring.png"],
        ["tree05_spring.webp", "tree05_spring.webp"],
        ["tree05_summer.png", "tree05_summer.png"],
        ["tree05_summer.webp", "tree05_summer.webp"],
        ["tree05_winter.png", "tree05_winter.png"],
        ["tree05_winter.webp", "tree05_winter.webp"],
        ["tree06.png", "tree06.png"],
        ["tree06.webp", "tree06.webp"],
        ["tree060.png", "tree060.png"],
        ["tree060.webp", "tree060.webp"],
        ["tree061.png", "tree061.png"],
        ["tree061.webp", "tree061.webp"],
        ["tree062.png", "tree062.png"],
        ["tree062.webp", "tree062.webp"],
        ["tree063.png", "tree063.png"],
        ["tree063.webp", "tree063.webp"],
        ["tree064.png", "tree064.png"],
        ["tree064.webp", "tree064.webp"],
        ["tree065.png", "tree065.png"],
        ["tree065.webp", "tree065.webp"],
        ["tree066.png", "tree066.png"],
        ["tree066.webp", "tree066.webp"],
        ["tree067.png", "tree067.png"],
        ["tree067.webp", "tree067.webp"],
        ["tree068.png", "tree068.png"],
        ["tree068.webp", "tree068.webp"],
        ["tree069.png", "tree069.png"],
        ["tree069.webp", "tree069.webp"],
        ["tree06_fall.png", "tree06_fall.png"],
        ["tree06_fall.webp", "tree06_fall.webp"],
        ["tree06_spring.png", "tree06_spring.png"],
        ["tree06_spring.webp", "tree06_spring.webp"],
        ["tree06_summer.png", "tree06_summer.png"],
        ["tree06_summer.webp", "tree06_summer.webp"],
        ["tree06_winter.png", "tree06_winter.png"],
        ["tree06_winter.webp", "tree06_winter.webp"],
        ["tree07.png", "tree07.png"],
        ["tree07.webp", "tree07.webp"],
        ["tree070.png", "tree070.png"],
        ["tree070.webp", "tree070.webp"],
        ["tree071.png", "tree071.png"],
        ["tree071.webp", "tree071.webp"],
        ["tree072.png", "tree072.png"],
        ["tree072.webp", "tree072.webp"],
        ["tree073.png", "tree073.png"],
        ["tree073.webp", "tree073.webp"],
        ["tree074.png", "tree074.png"],
        ["tree074.webp", "tree074.webp"],
        ["tree075.png", "tree075.png"],
        ["tree075.webp", "tree075.webp"],
        ["tree076.png", "tree076.png"],
        ["tree076.webp", "tree076.webp"],
        ["tree077.png", "tree077.png"],
        ["tree077.webp", "tree077.webp"],
        ["tree078.png", "tree078.png"],
        ["tree078.webp", "tree078.webp"],
        ["tree079.png", "tree079.png"],
        ["tree079.webp", "tree079.webp"],
        ["tree07_fall.png", "tree07_fall.png"],
        ["tree07_fall.webp", "tree07_fall.webp"],
        ["tree07_spring.png", "tree07_spring.png"],
        ["tree07_spring.webp", "tree07_spring.webp"],
        ["tree07_summer.png", "tree07_summer.png"],
        ["tree07_summer.webp", "tree07_summer.webp"],
        ["tree07_winter.png", "tree07_winter.png"],
        ["tree07_winter.webp", "tree07_winter.webp"],
        ["tree08.png", "tree08.png"],
        ["tree08.webp", "tree08.webp"],
        ["tree080.png", "tree080.png"],
        ["tree080.webp", "tree080.webp"],
        ["tree081.png", "tree081.png"],
        ["tree081.webp", "tree081.webp"],
        ["tree082.png", "tree082.png"],
        ["tree082.webp", "tree082.webp"],
        ["tree083.png", "tree083.png"],
        ["tree083.webp", "tree083.webp"],
        ["tree084.png", "tree084.png"],
        ["tree084.webp", "tree084.webp"],
        ["tree085.png", "tree085.png"],
        ["tree085.webp", "tree085.webp"],
        ["tree086.png", "tree086.png"],
        ["tree086.webp", "tree086.webp"],
        ["tree087.png", "tree087.png"],
        ["tree087.webp", "tree087.webp"],
        ["tree088.png", "tree088.png"],
        ["tree088.webp", "tree088.webp"],
        ["tree089.png", "tree089.png"],
        ["tree089.webp", "tree089.webp"],
        ["tree08_fall.png", "tree08_fall.png"],
        ["tree08_fall.webp", "tree08_fall.webp"],
        ["tree08_spring.png", "tree08_spring.png"],
        ["tree08_spring.webp", "tree08_spring.webp"],
        ["tree08_summer.png", "tree08_summer.png"],
        ["tree08_summer.webp", "tree08_summer.webp"],
        ["tree08_winter.png", "tree08_winter.png"],
        ["tree08_winter.webp", "tree08_winter.webp"],
        ["tree09.png", "tree09.png"],
        ["tree09.webp", "tree09.webp"],
        ["tree090.png", "tree090.png"],
        ["tree090.webp", "tree090.webp"],
        ["tree091.png", "tree091.png"],
        ["tree091.webp", "tree091.webp"],
        ["tree092.png", "tree092.png"],
        ["tree092.webp", "tree092.webp"],
        ["tree093.png", "tree093.png"],
        ["tree093.webp", "tree093.webp"],
        ["tree094.png", "tree094.png"],
        ["tree094.webp", "tree094.webp"],
        ["tree095.png", "tree095.png"],
        ["tree095.webp", "tree095.webp"],
        ["tree096.png", "tree096.png"],
        ["tree096.webp", "tree096.webp"],
        ["tree097.png", "tree097.png"],
        ["tree097.webp", "tree097.webp"],
        ["tree098.png", "tree098.png"],
        ["tree098.webp", "tree098.webp"],
        ["tree099.png", "tree099.png"],
        ["tree099.webp", "tree099.webp"],
        ["tree10.png", "tree10.png"],
        ["tree10.webp", "tree10.webp"],
        ["tree100.png", "tree100.png"],
        ["tree100.webp", "tree100.webp"],
        ["tree101.png", "tree101.png"],
        ["tree101.webp", "tree101.webp"],
        ["tree102.png", "tree102.png"],
        ["tree102.webp", "tree102.webp"],
        ["tree103.png", "tree103.png"],
        ["tree103.webp", "tree103.webp"],
        ["tree104.png", "tree104.png"],
        ["tree104.webp", "tree104.webp"],
        ["tree105.png", "tree105.png"],
        ["tree105.webp", "tree105.webp"],
        ["tree106.png", "tree106.png"],
        ["tree106.webp", "tree106.webp"],
        ["tree107.png", "tree107.png"],
        ["tree107.webp", "tree107.webp"],
        ["tree108.png", "tree108.png"],
        ["tree108.webp", "tree108.webp"],
        ["tree109.png", "tree109.png"],
        ["tree109.webp", "tree109.webp"],
        ["tree11.png", "tree11.png"],
        ["tree11.webp", "tree11.webp"],
        ["tree110.png", "tree110.png"],
        ["tree110.webp", "tree110.webp"],
        ["tree111.png", "tree111.png"],
        ["tree111.webp", "tree111.webp"],
        ["tree112.png", "tree112.png"],
        ["tree112.webp", "tree112.webp"],
        ["tree113.png", "tree113.png"],
        ["tree113.webp", "tree113.webp"],
        ["tree114.png", "tree114.png"],
        ["tree114.webp", "tree114.webp"],
        ["tree115.png", "tree115.png"],
        ["tree115.webp", "tree115.webp"],
        ["tree116.png", "tree116.png"],
        ["tree116.webp", "tree116.webp"],
        ["tree117.png", "tree117.png"],
        ["tree117.webp", "tree117.webp"],
        ["tree118.png", "tree118.png"],
        ["tree118.webp", "tree118.webp"],
        ["tree119.png", "tree119.png"],
        ["tree119.webp", "tree119.webp"],
        ["tree12.png", "tree12.png"],
        ["tree12.webp", "tree12.webp"],
        ["tree120.png", "tree120.png"],
        ["tree120.webp", "tree120.webp"],
        ["tree13.png", "tree13.png"],
        ["tree13.webp", "tree13.webp"],
        ["tree14.png", "tree14.png"],
        ["tree14.webp", "tree14.webp"],
        ["tree15.png", "tree15.png"],
        ["tree15.webp", "tree15.webp"],
        ["tree16.png", "tree16.png"],
        ["tree16.webp", "tree16.webp"],
        ["tree17.png", "tree17.png"],
        ["tree17.webp", "tree17.webp"],
        ["tree18.png", "tree18.png"],
        ["tree18.webp", "tree18.webp"],
        ["tree19.png", "tree19.png"],
        ["tree19.webp", "tree19.webp"],
        ["tree20.png", "tree20.png"],
        ["tree20.webp", "tree20.webp"],
        ["tree21.png", "tree21.png"],
        ["tree21.webp", "tree21.webp"],
        ["tree22.png", "tree22.png"],
        ["tree22.webp", "tree22.webp"],
        ["tree23.png", "tree23.png"],
        ["tree23.webp", "tree23.webp"],
        ["tree24.png", "tree24.png"],
        ["tree24.webp", "tree24.webp"],
        ["tree25.png", "tree25.png"],
        ["tree25.webp", "tree25.webp"],
        ["tree26.png", "tree26.png"],
        ["tree26.webp", "tree26.webp"],
        ["tree27.png", "tree27.png"],
        ["tree27.webp", "tree27.webp"],
        ["tree28.png", "tree28.png"],
        ["tree28.webp", "tree28.webp"],
        ["tree29.png", "tree29.png"],
        ["tree29.webp", "tree29.webp"],
        ["tree30.png", "tree30.png"],
        ["tree30.webp", "tree30.webp"],
        ["tree31.png", "tree31.png"],
        ["tree31.webp", "tree31.webp"],
        ["tree32.png", "tree32.png"],
        ["tree32.webp", "tree32.webp"],
        ["tree33.png", "tree33.png"],
        ["tree33.webp", "tree33.webp"],
        ["tree34.png", "tree34.png"],
        ["tree34.webp", "tree34.webp"],
        ["tree35.png", "tree35.png"],
        ["tree35.webp", "tree35.webp"],
        ["tree36.png", "tree36.png"],
        ["tree36.webp", "tree36.webp"],
        ["tree_bark_rt_a.png", "tree_bark_rt_a.png"],
        ["tree_bark_rt_a.webp", "tree_bark_rt_a.webp"],
        ["tree_bark_rt_a_1.png", "tree_bark_rt_a_1.png"],
        ["tree_bark_rt_a_1.webp", "tree_bark_rt_a_1.webp"],
        ["tree_bark_rt_a_2.png", "tree_bark_rt_a_2.png"],
        ["tree_bark_rt_a_2.webp", "tree_bark_rt_a_2.webp"],
        ["tree_bark_rt_b.png", "tree_bark_rt_b.png"],
        ["tree_bark_rt_b.webp", "tree_bark_rt_b.webp"],
        ["tree_bark_rt_b_1.png", "tree_bark_rt_b_1.png"],
        ["tree_bark_rt_b_1.webp", "tree_bark_rt_b_1.webp"],
        ["tree_rt_1.png", "tree_rt_1.png"],
        ["tree_rt_1.webp", "tree_rt_1.webp"],
        ["tree_rt_2.png", "tree_rt_2.png"],
        ["tree_rt_2.webp", "tree_rt_2.webp"],
        ["tree_rt_2_1.png", "tree_rt_2_1.png"],
        ["tree_rt_2_1.webp", "tree_rt_2_1.webp"],
        ["tree_rt_3.png", "tree_rt_3.png"],
        ["tree_rt_3.webp", "tree_rt_3.webp"],
        ["tree_rt_4.png", "tree_rt_4.png"],
        ["tree_rt_4.webp", "tree_rt_4.webp"],
        ["tripo_rgb_46ddc89d-bedd-4a77-a65f-361f208fbccc.jpg", "tripo_rgb_46ddc89d-bedd-4a77-a65f-361f208fbccc.jpg"],
        ["t_rp_rocks_0_2k.png", "T_RP_Rocks_0_2K.png"],
        ["t_rp_rocks_0_2k.webp", "T_RP_Rocks_0_2K.webp"],
        ["t_rp_rocks_0_4k.png", "T_RP_Rocks_0_4K.png"],
        ["t_rp_rocks_0_4k.webp", "T_RP_Rocks_0_4K.webp"],
        ["t_rp_rocks_1_2k.png", "T_RP_Rocks_1_2K.png"],
        ["t_rp_rocks_1_2k.webp", "T_RP_Rocks_1_2K.webp"],
        ["t_rp_rocks_1_4k.png", "T_RP_Rocks_1_4K.png"],
        ["t_rp_rocks_1_4k.webp", "T_RP_Rocks_1_4K.webp"],
        ["t_rp_rocks_2_2k.png", "T_RP_Rocks_2_2K.png"],
        ["t_rp_rocks_2_2k.webp", "T_RP_Rocks_2_2K.webp"],
        ["t_rp_rocks_2_4k.png", "T_RP_Rocks_2_4K.png"],
        ["t_rp_rocks_2_4k.webp", "T_RP_Rocks_2_4K.webp"],
        ["wall.png", "Wall.png"],
        ["wall.webp", "Wall.webp"],
        ["warehouse_01.webp", "warehouse_01.webp"],
        ["warehouse_03.webp", "warehouse_03.webp"],
        ["warehouse_05.webp", "warehouse_05.webp"],
        ["warehouse_06.webp", "warehouse_06.webp"],
        ["wickerbasket.png", "WickerBasket.png"],
        ["wickerbasket.webp", "WickerBasket.webp"],
        ["wickerbusket.png", "WickerBusket.png"],
        ["wickerbusket.webp", "WickerBusket.webp"],
        ["wood.png", "Wood.png"],
        ["wood.webp", "Wood.webp"],
        ["wood_table_worn_diff_1k.jpg", "wood_table_worn_diff_1k.jpg"]
      ]);
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
        if (this._knownTexturesMap.has('matted_pratia_diffuse_alpha.webp')) return this._knownTexturesMap.get('matted_pratia_diffuse_alpha.webp');
        if (this._knownTexturesMap.has('matted_pratia_b.webp')) return this._knownTexturesMap.get('matted_pratia_b.webp');
      }
      if (base.includes('poppy')) {
        if (this._knownTexturesMap.has(base + '.webp')) return this._knownTexturesMap.get(base + '.webp');
        if (this._knownTexturesMap.has(base + '.png')) return this._knownTexturesMap.get(base + '.png');
        if (this._knownTexturesMap.has('field_poppy.webp')) return this._knownTexturesMap.get('field_poppy.webp');
        if (this._knownTexturesMap.has('field_poppy.png')) return this._knownTexturesMap.get('field_poppy.png');
        if (this._knownTexturesMap.has('field_poppy_diffuse_alpha.webp')) return this._knownTexturesMap.get('field_poppy_diffuse_alpha.webp');
        if (this._knownTexturesMap.has('field_poppy_a.webp')) return this._knownTexturesMap.get('field_poppy_a.webp');
      }

      // 4. Strip variant suffixes (_a, _b, _varA, _lod0, _low, etc.)
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
          // Preserve 3D models and non-texture asset URLs
          if (/\.(fbx|glb|gltf|bin|json|obj|dae)$/i.test(clean)) {
            return url;
          }
          let base = clean.split('/').pop().split('?')[0];
          if (base && /\.(jpe?g|png|tga|bmp|webp|dds)$/i.test(base)) {
            const resolved = this._resolvePropTexture(base);
            if (resolved) return 'assets/props/textures/' + resolved + '?v=tree-fix-5';
            // Transparent 1x1 PNG fallback to eliminate 404 and Texture image warnings on missing embedded textures
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
            const orig = o.material;
            const cl = orig.clone();
            o.material = reapplyWind(orig, cl);
          }
        }
      });
      return clone;
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
      obj.position.y -= box.min.y; // выравнивание: основание модели ровно на y=0
      obj.position.z -= center.z;
      obj.userData._normalizedHeight = size.y;
      obj.updateMatrixWorld(true);
      return { height: size.y, size: size };
    }

    _prepareLoadedFbx(fbxObj, fileName) {
      const baseModelName = fileName.replace(/\.fbx$/i, '');
      const isTreeRt = /tree_rt/i.test(fileName);
      const isPratia = /pratia/i.test(fileName) || /pratia/i.test(baseModelName);
      const isPoppy = /poppy/i.test(fileName) || /poppy/i.test(baseModelName);
      const isGroundcover = isPratia || isPoppy || /flower|grass/i.test(fileName) || /flower|grass/i.test(baseModelName);
      const isFoliage = isGroundcover || isTreeRt || /tree|bush|fern|plant|branch|leaf|leaves|mushroom|stump|spruce|pine|retro_/i.test(fileName);
      const isTree = /tree|spruce|pine/i.test(fileName) && !/bush|grass|pratia|poppy/i.test(fileName);

      // Resolve base texture with multi-candidate search
      let defaultTexName = this._resolvePropTexture(baseModelName) || this._resolvePropTexture(fileName);
      if (!defaultTexName && isPratia) defaultTexName = 'matted_pratia.webp';
      if (!defaultTexName && isPoppy) defaultTexName = 'field_poppy.webp';
      const defaultTex = defaultTexName ? this._getOrLoadSharedPropTexture(defaultTexName) : null;

      fbxObj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = isTree;
        o.receiveShadow = true;

        // Strip vertex color attribute if present to avoid washing out textures with white/black vertex tint
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

          const isTrunk = isMeshTrunk || isMatTrunk;
          let isCrown = !isTrunk && (isMatBranch || isMeshPlane || (mats.length > 1 && matIdx > 0));

          if (isTrunk) {
            diffuseMap = this._getOrLoadSharedPropTexture('tree_bark_rt_b_1.png');
          } else if (isTreeRt) {
            // Реликтовые деревья: ствол -> tree_bark, крона -> tree_rt
            diffuseMap = isCrown
              ? (defaultTex || this._getOrLoadSharedPropTexture('tree_rt_2_1.png'))
              : this._getOrLoadSharedPropTexture('tree_bark_rt_b_1.png');
          } else {
            // 1. Попытка разрешить точное имя материала или меша (критично для составных моделей вроде medieval_market)
            const rawMatName = mat && mat.name ? mat.name : '';
            const rawMeshName = o.name || '';
            let subTexName = null;
            if (rawMatName && !/^(default|material|mat|lambert|phong|tripo|atlas|texture|plane|bush\d*|grass\d*|tree\d*|plant)/i.test(rawMatName)) {
              subTexName = this._resolvePropTexture(rawMatName);
            }
            if (!subTexName && rawMeshName && !/^(default|mesh|object|group|tripo|plane|cylinder|bush\d*|grass\d*|tree\d*)/i.test(rawMeshName)) {
              subTexName = this._resolvePropTexture(rawMeshName);
            }
            if (subTexName) {
              diffuseMap = this._getOrLoadSharedPropTexture(subTexName);
            }

            // 2. Текстура уровня модели (для однотекстурных пропсов: дома, лавки, памятники, деревья, скалы)
            if (!diffuseMap && defaultTex) {
              diffuseMap = defaultTex;
            }

            // 3. Если нет defaultTex и нет subTexName, проверяем реальный mat.map из FBXLoader (исключая dummy 1x1 data-uri)
            if (!diffuseMap && mat && mat.map && mat.map.isTexture) {
              const src = (mat.map.image && mat.map.image.src) || (mat.map.source && mat.map.source.data && mat.map.source.data.src) || '';
              if (!src.startsWith('data:')) {
                diffuseMap = mat.map;
              }
            }

            // 4. Фоллбэки для цветов/травы
            if (!diffuseMap && isPratia) {
              diffuseMap = this._getOrLoadSharedPropTexture('matted_pratia.webp') || this._getOrLoadSharedPropTexture('matted_pratia_b.webp');
            }
            if (!diffuseMap && isPoppy) {
              diffuseMap = this._getOrLoadSharedPropTexture('field_poppy.webp') || this._getOrLoadSharedPropTexture('field_poppy_a.webp');
            }
          }

          if (diffuseMap) {
            diffuseMap.colorSpace = THREE.SRGBColorSpace;
            diffuseMap.generateMipmaps = true;
            diffuseMap.minFilter = THREE.LinearMipmapLinearFilter;
            diffuseMap.magFilter = THREE.LinearFilter;
            diffuseMap.wrapS = THREE.RepeatWrapping;
            diffuseMap.wrapT = THREE.RepeatWrapping;
            diffuseMap.anisotropy = 4;
            diffuseMap.needsUpdate = true;
          }

          const requiresAlphaCutout = !isTrunk && (isGroundcover || (isTreeRt ? isCrown : isFoliage));
          const isClothOrCanopy = /market|stall|tent|banner|canopy|cloth|flag/i.test(fileName) || /market|stall|tent|banner|canopy|cloth|flag/i.test(baseModelName) || /fabric|cloth|canopy|roof|flag|banner/i.test(matName);
          const isDoubleSidedProp = requiresAlphaCutout || isClothOrCanopy;

          // Чистый матовый материал (Classic Diffuse Shader)
          const cleanMat = new THREE.MeshLambertMaterial({
            map: diffuseMap,
            color: new THREE.Color(0xffffff),
            reflectivity: 0,
            flatShading: false,
            vertexColors: false,
            alphaTest: isTrunk ? 0.0 : (isGroundcover ? 0.15 : (requiresAlphaCutout ? 0.15 : 0.0)),
            side: isDoubleSidedProp ? THREE.DoubleSide : THREE.FrontSide,
            depthWrite: true,
            transparent: false
          });
          // STRICT FILTER: ONLY animate real organic vegetation (trees, bushes, flowers, grass) - NEVER rocks, stones, buildings!
          const isNonFoliageProp = /rock|stone|boulder|house|forge|building|wall|shop|market|stall|tent|fence|barrier|barrel|crate|plank|wood|stump|log|mannequin|statue|monument|bench|chapel|boiler|airship|tp_zone/i.test(fileName) || /rock|stone|boulder|house|forge|building|wall|shop|market|stall|tent|fence|barrier|barrel|crate|plank|wood|stump|log|mannequin|statue|monument|bench|chapel|boiler|airship|tp_zone/i.test(baseModelName);

          const isRealOrganicFoliage = !isNonFoliageProp && (
            isTree || isTreeRt || isGroundcover ||
            /tree|bush|fern|plant|branch|leaf|leaves|poppy|flower|grass|pratia|spruce|pine/i.test(fileName) ||
            /tree|bush|fern|plant|branch|leaf|leaves|poppy|flower|grass|pratia|spruce|pine/i.test(baseModelName)
          );

          if (isRealOrganicFoliage && window.WindSystem && window.WindSystem.applyWindToMaterial) {
            let folType = 'bush';
            if (isTrunk) folType = 'trunk';
            else if (isTree || isTreeRt || /tree|spruce|pine/i.test(fileName) || /tree|spruce|pine/i.test(baseModelName)) folType = 'tree';
            else if (/poppy|flower/i.test(fileName) || /poppy|flower/i.test(baseModelName)) folType = 'flower';
            else if (/grass|pratia/i.test(fileName) || /grass|pratia/i.test(baseModelName)) folType = 'grass';
            window.WindSystem.applyWindToMaterial(cleanMat, folType);
          }
          cleanMat.needsUpdate = true;
          return cleanMat;
        });
        o.material = Array.isArray(o.material) ? cleanMats : (cleanMats[0] || o.material);
      });

      // Нормализация пивота: подошва на y=0, центр по XZ
      this._normalizeFbxPivot(fbxObj, fileName);
      return fbxObj;
    }

    spawnCustomPropMesh(p) {
      if (this.customPropMeshes.has(p.id)) return this.customPropMeshes.get(p.id);

      // Растительность (Foliage) рендерится через аппаратный инстансинг FoliageInstancer
      if (this._foliageInstancer && this._foliageInstancer.isFoliageProp(p)) {
        this._foliageInstancer.addInstance(p);
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
        const boxMat = new THREE.MeshStandardMaterial({
          color: 0x22dd66,
          transparent: true,
          opacity: 0.35,
          roughness: 0.4,
          wireframe: false,
          depthWrite: false
        });
        const boxMesh = new THREE.Mesh(boxGeo, boxMat);
        boxMesh.position.y = bh / 2 + offY;
        boxMesh.name = '_barrierMesh';

        const edges = new THREE.EdgesGeometry(boxGeo);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x55ff88, linewidth: 2 });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        wireframe.position.y = bh / 2 + offY;
        wireframe.name = '_barrierWire';

        group.add(boxMesh, wireframe);

        group.visible = !!(this.enabled && (this._collisionBarriersVisible !== false));

        const propData = Object.assign({}, p, {
          meshType: 'collision_box',
          name: p.name || '🛡️ Коллизионный барьер',
          collision: true,
          hasCollision: true,
          collisionShape: 'box',
          collisionSize: { x: bw, y: bh, z: bd },
          collisionOffset: { x: 0, y: offY, z: 0 }
        });

        group.userData = {
          isCustomProp: true,
          isCollisionBarrier: true,
          propId: p.id,
          propData: propData,
          editorLabel: propData.name
        };

        boxMesh.userData = group.userData;
        wireframe.userData = group.userData;

        this.scene.add(group);
        this.customPropMeshes.set(p.id, group);
        return group;
      }

      const lib = window.PropsLibrary;
      const libItem = lib ? lib.getById(p.modelId || p.meshType || p.modelFile) : null;
      const isFbx = (p.meshType === 'fbx') || !!p.modelFile || !!p.modelId || !!libItem ||
                    (typeof p.meshType === 'string' && p.meshType.endsWith('.fbx')) ||
                    (typeof p.name === 'string' && p.name.includes('.fbx'));

      if (isFbx) {
        let fileName = p.modelFile || (libItem && libItem.file) || (p.modelId ? (p.modelId.endsWith('.fbx') ? p.modelId : p.modelId + '.fbx') : (p.meshType && p.meshType.endsWith('.fbx') ? p.meshType : (p.meshType || 'house_01') + '.fbx'));
        if (!fileName.endsWith('.fbx')) fileName += '.fbx';

        const group = new THREE.Group();
        group.name = 'prop_' + (p.id || Date.now());
        group.position.set(p.position.x, p.position.y || 0, p.position.z);
        if (p.rotation) group.rotation.set(p.rotation.x || 0, p.rotation.y || 0, p.rotation.z || 0);
        if (p.scale) group.scale.set(p.scale.x || 1, p.scale.y || 1, p.scale.z || 1);

        const propData = Object.assign({}, p, {
          meshType: 'fbx',
          modelId: p.modelId || (libItem && libItem.id) || fileName.replace(/\.fbx$/i, ''),
          modelFile: fileName,
          name: p.name || (libItem && libItem.nameRu) || fileName
        });

        group.userData = {
          isCustomProp: true,
          propId: p.id,
          propData: propData,
          modelId: propData.modelId,
          modelFile: fileName,
          editorLabel: propData.name
        };

        this.scene.add(group);
        this.customPropMeshes.set(p.id, group);

        if (!this._fbxPropCache) this._fbxPropCache = new Map();
        if (!this._pendingFbxGroups) this._pendingFbxGroups = new Map();

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
          const pGeo = new THREE.BoxGeometry(1.5, 2, 1.5);
          const pMat = new THREE.MeshStandardMaterial({ color: 0x4488aa, wireframe: true });
          const placeholder = new THREE.Mesh(pGeo, pMat);
          placeholder.position.y = 1;
          placeholder.name = '_placeholder';
          group.add(placeholder);

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

                    // Разрешаем ВСЕ ожидающие экземпляры этой модели
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

                    if (this.selectedObject && this.selectedObject.id === p.id) {
                      this.selectionBox.position.copy(group.position);
                    }
                  } catch (e) {
                    console.error('[SceneEditor] Error setting up loaded FBX:', fileName, e);
                  }
                },
                undefined,
                (err) => {
                  console.warn('[SceneEditor] Could not load FBX:', fileName, err);
                  const pendingList = this._pendingFbxGroups.get(fileName) || [];
                  this._pendingFbxGroups.delete(fileName);
                  pendingList.forEach(tgtGroup => {
                    if (!tgtGroup) return;
                    const pl = tgtGroup.getObjectByName('_placeholder');
                    if (pl && pl.material) pl.material.color.setHex(0xaa3333);
                  });
                }
              );
            }
          }
        }
        return group;
      }

      let geo, mat;
      const color = p.color || 0x8b7355;

      switch (p.meshType) {
        case 'crate':
          geo = new THREE.BoxGeometry(2, 2, 2);
          mat = new THREE.MeshStandardMaterial({ color: 0x966f33, roughness: 0.8 });
          break;
        case 'barrel':
          geo = new THREE.CylinderGeometry(1, 1, 2.5, 12);
          mat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.4 });
          break;
        case 'watchtower':
          geo = new THREE.CylinderGeometry(1.2, 2.2, 10, 8);
          mat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9 });
          break;
        case 'boulder':
          geo = new THREE.DodecahedronGeometry(2, 1);
          mat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.95 });
          break;
        case 'lamp_post':
          geo = new THREE.CylinderGeometry(0.2, 0.3, 6, 8);
          mat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
          break;
        case 'chest':
          geo = new THREE.BoxGeometry(2.2, 1.4, 1.4);
          mat = new THREE.MeshStandardMaterial({ color: 0xaa6622, metalness: 0.3 });
          break;
        case 'light':
          geo = new THREE.SphereGeometry(0.8, 12, 12);
          mat = new THREE.MeshBasicMaterial({ color: 0xffaa33 });
          break;
        case 'steam_pipe':
        default:
          geo = new THREE.CylinderGeometry(0.6, 0.6, 6, 12);
          mat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.7, roughness: 0.3 });
          break;
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.position.x, p.position.y || 0, p.position.z);
      if (p.rotation) mesh.rotation.set(p.rotation.x || 0, p.rotation.y || 0, p.rotation.z || 0);
      if (p.scale) mesh.scale.set(p.scale.x || 1, p.scale.y || 1, p.scale.z || 1);

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { isCustomProp: true, propId: p.id, propData: p };

      this.scene.add(mesh);
      this.customPropMeshes.set(p.id, mesh);
      return mesh;
    }

    // ============================================================
    //  ИНСПЕКТОР UI В HUD
    // ============================================================
    initUI() {
      let hudBtn = document.getElementById('editor-toggle-btn');
      if (!hudBtn) {
        hudBtn = document.createElement('button');
        hudBtn.id = 'editor-toggle-btn';
        hudBtn.innerHTML = '🛠️ РЕДАКТОР СЦЕНЫ (F2)';
        hudBtn.style.cssText = 'position:fixed;top:var(--hud-top, 8px);right:calc(var(--radar-frame-width, 196px) + 10px);z-index:700;background:linear-gradient(180deg,#aa6622,#663311);color:#fff;border:1px solid #ffaa44;padding:clamp(3px, 0.6vh, 6px) clamp(6px, 1vw, 12px);font-size:clamp(9.5px, 1.1vw, 12px);border-radius:4px;font-family:monospace;font-weight:bold;cursor:pointer;box-shadow:0 0 10px rgba(0,0,0,0.8);white-space:nowrap;';
        hudBtn.onclick = () => this.toggle();
        document.body.appendChild(hudBtn);
      }
      // Кнопка появляется только после welcome с dev=true (см. setEditorAllowed)
      if (!editorAllowed) hudBtn.style.display = 'none';

      this.panel = document.createElement('div');
      this.panel.id = 'editor-inspector-panel';
      const _origQS = this.panel.querySelector.bind(this.panel);
      this.panel.querySelector = (sel) => _origQS(sel) || document.querySelector(sel);
      this.panel.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        width: min(360px, 92vw);
        max-height: calc(100vh - 40px);
        background: rgba(15, 20, 28, 0.95);
        border: 2px solid #ffaa44;
        border-radius: 8px;
        color: #e0e0e0;
        font-family: 'Courier New', monospace;
        font-size: clamp(10px, 1.1vw, 12px);
        z-index: 650;
        display: none;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(8px);
        overflow: hidden;
      `;

      this.panel.innerHTML = `
        <div style="background: linear-gradient(90deg, #aa5511, #442200); padding: 10px 14px; border-bottom: 2px solid #ffaa44; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: bold; color: #ffdd88; font-size: 13px;">🛠️ UNREAL SCENE EDITOR</span>
          <div>
            <button id="ed-btn-close" style="background:#441111;color:#ff8888;border:1px solid #aa3333;padding:2px 8px;border-radius:4px;cursor:pointer;font-family:inherit;">✕</button>
          </div>
        </div>

        <div style="padding: 10px; overflow-y: auto; flex: 1;">
          <!-- Workspace modes: Select / Collision / BSP Build / Zones / Sites / Ground / Foliage / Paint -->
          <div style="display:flex; gap:3px; margin-bottom:8px; background:#0a1018; padding:4px; border-radius:6px; border:1px solid #556677; overflow-x:auto;">
            <button id="ed-ws-select" style="flex:1; min-width:50px; background:#aa6622; color:#fff; border:1px solid #ffaa44; padding:6px 2px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:10px;" title="Q — выбор и перемещение объектов">🖱 Выбор</button>
            <button id="ed-ws-collision" style="flex:1; min-width:58px; background:#1c4a2a; color:#88ffbb; border:1px solid #33aa66; padding:6px 2px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;" title="🛡️ Постройка физ. коллизий отдельными блоками">🛡️ Блоки</button>
            <button id="ed-ws-bsp" style="flex:1; min-width:44px; background:#1a3040; color:#aaddff; border:1px solid #4488aa; padding:6px 2px; border-radius:4px; cursor:pointer; font-size:10px;" title="B — рисовать BSP">🧱 BSP</button>
            <button id="ed-ws-zones" style="flex:1; min-width:44px; background:#331a22; color:#ffccaa; border:1px solid #aa6644; padding:6px 2px; border-radius:4px; cursor:pointer; font-size:10px;" title="Z — зоны и споты, вершины">⚔ Зоны</button>
            <button id="ed-ws-sites" style="flex:1; min-width:44px; background:#1a2233; color:#ccddff; border:1px solid #6688aa; padding:6px 2px; border-radius:4px; cursor:pointer; font-size:10px;" title="Метки для геометрии">📍 Метки</button>
            <button id="ed-ws-ground" style="flex:1; min-width:48px; background:#1a331a; color:#bbffbb; border:1px solid #55aa55; padding:6px 2px; border-radius:4px; cursor:pointer; font-size:10px;" title="G — дороги, трава, площади">🛤 Земля</button>
            <button id="ed-ws-foliage" style="flex:1; min-width:54px; background:#18361e; color:#88ffbb; border:1px solid #33aa66; padding:6px 2px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;" title="🌿 Кисть растительности и деревьев (UE5 Foliage)">🌿 Зелень</button>
            <button id="ed-ws-paint" style="flex:1; min-width:48px; background:#163824; color:#88ffbb; border:1px solid #33aa66; padding:6px 2px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;" title="T / P — Кисть террейна (UE5 Landscape Paint)">🎨 Кисть</button>
          </div>
          <div id="ed-ws-hint" style="margin-bottom:8px; padding:5px 8px; background:rgba(0,0,0,0.35); border-radius:4px; color:#99aacc; font-size:10px; line-height:1.35;">
            Режим <b>Выбор</b>: клик по объекту, W/E/R — пивот. Q — сюда из BSP/зон.
          </div>

          <!-- Переключатель режимов UE Gizmo: W, E, R -->
          <div id="ed-gizmo-modes" style="display:flex; gap:4px; margin-bottom:10px; background:#111; padding:4px; border-radius:6px; border:1px solid #444;">
            <button id="btn-mode-w" style="flex:1; background:#aa6622; color:#fff; border:1px solid #ffaa44; padding:5px; border-radius:4px; cursor:pointer; font-weight:bold;">W: Сдвиг</button>
            <button id="btn-mode-e" style="flex:1; background:#333; color:#ccc; border:1px solid #555; padding:5px; border-radius:4px; cursor:pointer; font-weight:bold;">E: Поворот</button>
            <button id="btn-mode-r" style="flex:1; background:#333; color:#ccc; border:1px solid #555; padding:5px; border-radius:4px; cursor:pointer; font-weight:bold;">R: Масштаб</button>
          </div>

          <!-- Категории и Список -->
          <div style="margin-bottom: 8px;">
            <label style="color:#ffaa44; display:block; margin-bottom: 2px;">📂 Категория объектов:</label>
            <select id="ed-category-select" style="width:100%; background:#222; color:#fff; border:1px solid #555; padding:4px; border-radius:4px; font-family:inherit;">
              <option value="all">Все объекты сцены (100%)</option>
              <option value="player">Персонаж игрока (Player)</option>
              <option value="npc">NPC (Городские и Региональные)</option>
              <option value="mob">Монстры и Враги</option>
              <option value="spot">Споты мобов (Спавны)</option>
              <option value="hunt">Зоны охоты (ур. лвл)</option>
              <option value="site">Метки геометрии</option>
              <option value="ground">Земля (дороги/трава/площади)</option>
              <option value="bsp">BSP-браши (геометрия)</option>
              <option value="prop">3D Модели, Декорации и Пропы</option>
              <option value="light">Источники света</option>
            </select>
          </div>

          <div style="margin-bottom: 10px;">
            <label style="color:#ffaa44; display:block; margin-bottom: 2px;">🎯 Выбрать объект в 3D мире:</label>
            <select id="ed-object-select" style="width:100%; background:#222; color:#fff; border:1px solid #555; padding:4px; border-radius:4px; font-family:inherit;">
              <option value="">-- Кликните абсолютно ЛЮБОЙ объект в 3D миру --</option>
            </select>
          </div>

          <div style="display:flex; gap:6px; margin-bottom:10px;">
            <button id="ed-btn-add-prop" style="flex:1.2; background:linear-gradient(180deg,#246630,#16401e); color:#aaffbb; border:1px solid #44bb66; padding:6px 4px; border-radius:4px; cursor:pointer; font-family:inherit; font-weight:bold; font-size:11px;" title="P — открыть библиотеку 3D-моделей">📦 3D Модели (P)</button>
            <button id="ed-btn-add-barrier" style="flex:1.1; background:linear-gradient(180deg,#1c4a2a,#0f2e18); color:#88ffbb; border:1px solid #33aa66; padding:6px 4px; border-radius:4px; cursor:pointer; font-family:inherit; font-weight:bold; font-size:11px;" title="Создать коллизионный бокс / стену">🛡️ +Барьер (Box)</button>
            <button id="ed-btn-add-spot" style="flex:1; background:#553311; color:#ffddaa; border:1px solid #aa6622; padding:6px 4px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:11px;">+ Спот мобов</button>
          </div>

          <!-- Modular Collision Blocks Panel -->
          <div id="ed-collision-panel" style="display:none; margin-bottom:10px; background:rgba(16,36,24,0.85); border:1px solid #33aa66; border-radius:6px; padding:8px;">
            <div style="color:#88ffbb; font-weight:bold; margin-bottom:6px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
              <span>🛡️ Постройка коллизий блоками</span>
              <button id="btn-col-toggle-vis" style="background:#163020; color:#99eeaa; border:1px solid #336644; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:9px;">👁️ Скрыть/Показ</button>
            </div>
            <div style="color:#aaccbb; font-size:10px; line-height:1.35; margin-bottom:6px;">
              Стройте стены, проходы, перегородки и заборы из модульных невидимых физ. блоков.
            </div>

            <!-- Block Presets Palette -->
            <div style="color:#ffeeaa; font-size:10px; font-weight:bold; margin-bottom:3px;">Готовые блоки:</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; margin-bottom:6px;">
              <button type="button" class="btn-spawn-preset-col" data-w="1" data-h="1" data-d="1" style="background:#1e4028; color:#aaffcc; border:1px solid #338844; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;">▣ Куб 1×1×1м</button>
              <button type="button" class="btn-spawn-preset-col" data-w="2" data-h="2" data-d="2" style="background:#1e4028; color:#aaffcc; border:1px solid #338844; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;">▣ Блок 2×2×2м</button>
              <button type="button" class="btn-spawn-preset-col" data-w="4" data-h="3" data-d="0.5" style="background:#1e4028; color:#aaffcc; border:1px solid #338844; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;">▣ Стена 4×3×0.5м</button>
              <button type="button" class="btn-spawn-preset-col" data-w="8" data-h="4" data-d="1" style="background:#1e4028; color:#aaffcc; border:1px solid #338844; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;">▣ Забор 8×4×1м</button>
              <button type="button" class="btn-spawn-preset-col" data-w="1" data-h="4" data-d="1" style="background:#1e4028; color:#aaffcc; border:1px solid #338844; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;">▣ Колонна 1×4×1м</button>
              <button type="button" class="btn-spawn-preset-col" data-w="4" data-h="0.5" data-d="4" style="background:#1e4028; color:#aaffcc; border:1px solid #338844; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;">▣ Плита 4×0.5×4м</button>
            </div>

            <!-- Custom Block Dimensions -->
            <div style="background:#12251a; border:1px solid #285536; padding:6px; border-radius:4px; margin-bottom:6px;">
              <div style="color:#88ffaa; font-size:10px; font-weight:bold; margin-bottom:3px;">Свой размер блока (метры):</div>
              <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:3px; margin-bottom:4px;">
                <div>
                  <label style="color:#ff9999; font-size:9px;">W (X):</label>
                  <input type="number" step="0.5" min="0.1" id="inp-col-custom-w" value="4.0" style="width:100%; background:#0a1810; color:#aaffcc; border:1px solid #336644; padding:2px; border-radius:3px; font-size:11px;" />
                </div>
                <div>
                  <label style="color:#99ff99; font-size:9px;">H (Y):</label>
                  <input type="number" step="0.5" min="0.1" id="inp-col-custom-h" value="3.0" style="width:100%; background:#0a1810; color:#aaffcc; border:1px solid #336644; padding:2px; border-radius:3px; font-size:11px;" />
                </div>
                <div>
                  <label style="color:#9999ff; font-size:9px;">D (Z):</label>
                  <input type="number" step="0.5" min="0.1" id="inp-col-custom-d" value="1.0" style="width:100%; background:#0a1810; color:#aaffcc; border:1px solid #336644; padding:2px; border-radius:3px; font-size:11px;" />
                </div>
              </div>
              <div style="display:flex; gap:4px;">
                <button type="button" id="btn-col-spawn-custom" style="flex:1; background:linear-gradient(180deg,#246630,#16401e); color:#aaffcc; border:1px solid #44aa66; padding:5px 4px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">➕ Спавн</button>
                <button type="button" id="btn-col-click-place" style="flex:1; background:linear-gradient(180deg,#1b4530,#0f2b1d); color:#88ffcc; border:1px solid #339966; padding:5px 4px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;" title="Кликайте по земле / объектам для установки блоков. Зажмите Shift для непрерывной постройки">🎯 Клик-постройка</button>
              </div>
            </div>

            <!-- Actions & Shortcuts Hint -->
            <div style="display:flex; gap:4px; margin-bottom:6px;">
              <button type="button" id="btn-col-duplicate" style="flex:1; background:#1b3545; color:#aaccff; border:1px solid #336688; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;" title="Ctrl+D — дублировать блок">📋 Дублировать</button>
              <button type="button" id="btn-col-delete" style="flex:1; background:#441a1a; color:#ffaaaa; border:1px solid #aa3333; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;" title="Delete — удалить">🗑️ Удалить</button>
            </div>
            <div id="ed-col-place-hint" style="display:none; padding:5px; background:rgba(30,80,45,0.4); border:1px solid #33aa66; border-radius:4px; color:#88ffbb; font-size:10px; text-align:center; margin-bottom:6px;">
              🎯 Клик по земле/объекту · <b>Shift</b> = строить подряд · <b>Esc</b> = отмена
            </div>

            <!-- List of Barriers in scene -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
              <span style="color:#ffeeaa; font-size:10px; font-weight:bold;">Блоки в сцене:</span>
              <span id="txt-col-count" style="color:#88ffaa; font-size:9px;">0 шт.</span>
            </div>
            <div id="ed-col-barriers-list" style="max-height:110px; overflow-y:auto; border:1px solid #285536; border-radius:4px; background:rgba(0,0,0,0.4); font-size:10px; color:#aaccaa;"></div>
          </div>

          <!-- BSP Geometry Mode (full UE-style) -->
          <div id="ed-bsp-panel" style="margin-bottom:10px; background:rgba(12,28,42,0.72); border:1px solid #3a8ab8; border-radius:6px; padding:8px;">
            <div style="color:#8ad4ff; font-weight:bold; margin-bottom:6px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
              <span>🧱 Geometry Mode (BSP)</span>
              <span id="ed-bsp-build-status" style="font-size:10px; color:#8899aa; font-weight:normal;">—</span>
            </div>

            <!-- CSG ops -->
            <div style="display:flex; gap:4px; margin-bottom:5px;">
              <button id="ed-btn-bsp-add" style="flex:1; background:#225533; color:#aaffcc; border:1px solid #44aa66; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:11px; font-weight:bold;" title="Additive (тело)">＋ Additive</button>
              <button id="ed-btn-bsp-sub" style="flex:1; background:#442222; color:#ffaaaa; border:1px solid #aa5555; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:11px;" title="Subtractive (вырезать)">− Subtract</button>
            </div>

            <!-- Builder shapes -->
            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:3px; margin-bottom:5px;">
              <button class="ed-bsp-shape" data-shape="box" style="background:#113355; color:#aaddff; border:1px solid #4488cc; padding:5px 2px; border-radius:3px; cursor:pointer; font-family:inherit; font-size:10px;">▣ Cube</button>
              <button class="ed-bsp-shape" data-shape="cylinder" style="background:#113344; color:#aaddff; border:1px solid #4477aa; padding:5px 2px; border-radius:3px; cursor:pointer; font-family:inherit; font-size:10px;">◎ Cyl</button>
              <button class="ed-bsp-shape" data-shape="wedge" style="background:#113344; color:#aaddff; border:1px solid #4477aa; padding:5px 2px; border-radius:3px; cursor:pointer; font-family:inherit; font-size:10px;">◢ Wedge</button>
              <button class="ed-bsp-shape" data-shape="cone" style="background:#113344; color:#aaddff; border:1px solid #4477aa; padding:5px 2px; border-radius:3px; cursor:pointer; font-family:inherit; font-size:10px;">▲ Cone</button>
              <button class="ed-bsp-shape" data-shape="stairs" style="background:#113344; color:#aaddff; border:1px solid #4477aa; padding:5px 2px; border-radius:3px; cursor:pointer; font-family:inherit; font-size:10px;">☰ Stairs</button>
              <button class="ed-bsp-shape" data-shape="sheet" style="background:#113344; color:#aaddff; border:1px solid #4477aa; padding:5px 2px; border-radius:3px; cursor:pointer; font-family:inherit; font-size:10px;">▭ Sheet</button>
            </div>

            <!-- Place modes -->
            <div style="display:flex; gap:3px; margin-bottom:5px;">
              <button id="ed-btn-bsp-draw" style="flex:1; background:#1a4060; color:#cceeff; border:1px solid #4a9acc; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:11px; font-weight:bold;" title="Drag to size (UE builder)">✏️ Draw</button>
              <button id="ed-btn-bsp-place" style="flex:1; background:#1a3040; color:#aaccdd; border:1px solid #3a7088; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:11px;" title="Click to place default size">📍 Place</button>
              <button id="ed-btn-bsp-build" style="flex:1; background:#553311; color:#ffcc88; border:1px solid #aa7744; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:11px; font-weight:bold;" title="Ctrl+B — rebuild CSG">⚙ Build</button>
            </div>
            <button id="ed-btn-bsp-exit" style="width:100%; margin-bottom:6px; background:#2a4422; color:#bbffaa; border:1px solid #66aa44; padding:7px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:11px; font-weight:bold;" title="Q — выйти из постройки">↩ Выход в Выбор (двигать объекты) · Q</button>

            <div style="display:flex; gap:8px; margin-bottom:5px; font-size:10px; color:#99aabb; flex-wrap:wrap;">
              <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                <input type="checkbox" id="ed-chk-bsp-autobuild" checked /> Auto-Build
              </label>
              <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                <input type="checkbox" id="ed-chk-bsp-shells" checked /> Shells
              </label>
              <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                <input type="checkbox" id="ed-chk-bsp-built" checked /> Built
              </label>
            </div>

            <!-- Brush stack (like UE) -->
            <div style="margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
              <span style="color:#88bbdd; font-size:11px; font-weight:bold;">Brush Stack</span>
              <span style="color:#667788; font-size:10px;">порядок = CSG</span>
            </div>
            <div id="ed-bsp-stack" style="max-height:140px; overflow-y:auto; background:rgba(0,0,0,0.35); border:1px solid #335566; border-radius:4px; margin-bottom:5px; font-size:11px;">
              <div style="color:#667788; padding:8px; text-align:center;">пусто — нарисуй brush</div>
            </div>
            <div style="display:flex; gap:3px; margin-bottom:4px;">
              <button id="ed-btn-bsp-up" style="flex:1; background:#223344; color:#ccddee; border:1px solid #556677; padding:4px; border-radius:3px; cursor:pointer; font-size:11px;" title="Выше в стеке">▲</button>
              <button id="ed-btn-bsp-down" style="flex:1; background:#223344; color:#ccddee; border:1px solid #556677; padding:4px; border-radius:3px; cursor:pointer; font-size:11px;" title="Ниже в стеке">▼</button>
              <button id="ed-btn-bsp-toggle-op" style="flex:1; background:#334422; color:#ddeebb; border:1px solid #667744; padding:4px; border-radius:3px; cursor:pointer; font-size:10px;" title="Add ↔ Sub">± Op</button>
              <button id="ed-btn-bsp-disable" style="flex:1; background:#333344; color:#bbbbee; border:1px solid #555577; padding:4px; border-radius:3px; cursor:pointer; font-size:10px;" title="Disable brush">⊘</button>
            </div>

            <div id="ed-bsp-draw-hint" style="display:none; margin-top:4px; padding:6px; background:rgba(40,80,120,0.35); border:1px solid #4488aa; border-radius:4px; color:#cceeff; font-size:10px; text-align:left; line-height:1.4;">
              <b>Draw:</b> drag XZ → height → click<br/>
              <b>Place:</b> click ground<br/>
              <b>Keys:</b> B mode · Ctrl+B build · [ ] grid · +/− size · End op · Esc cancel
            </div>
          </div>

          <div id="ed-zones-box" style="margin-bottom:10px; background:rgba(20,16,12,0.4); border:1px solid #554433; border-radius:6px; padding:8px;">
            <div style="color:#ffaa88; font-size:11px; font-weight:bold; margin-bottom:5px;">⚔️ Зоны охоты (ур.)</div>
            <div style="display:flex; gap:4px; margin-bottom:8px;">
              <button id="ed-btn-draw-hunt" style="flex:1; background:#441122; color:#ff99aa; border:1px solid #aa4466; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-weight:bold; font-size:11px;">🎯 Многоуг.</button>
              <button id="ed-btn-draw-hunt-rect" style="flex:1; background:#332211; color:#ffcc99; border:1px solid #aa7744; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-weight:bold; font-size:11px;">▭ Прямоуг.</button>
            </div>
            <div style="color:#88bbff; font-size:11px; font-weight:bold; margin-bottom:5px;">🗺 Территории (синие)</div>
            <div style="display:flex; gap:4px; margin-bottom:4px;">
              <button id="ed-btn-draw-terr" style="flex:1; background:#112244; color:#99ccff; border:1px solid #4488cc; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-weight:bold; font-size:11px;">🔷 Многоуг.</button>
              <button id="ed-btn-draw-terr-rect" style="flex:1; background:#113355; color:#aaddff; border:1px solid #5599dd; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-weight:bold; font-size:11px;">▭ Прямоуг.</button>
            </div>
            <div id="ed-hunt-draw-hint" style="display:none; margin-top:4px; padding:6px; background:rgba(40,80,140,0.25); border:1px solid #6688aa; border-radius:4px; color:#cceeff; font-size:11px; text-align:center; line-height:1.35;">
              Poly: клики = вершины · Enter / ПКМ = закрыть (≥3) · Esc = отмена
            </div>
          </div>

          <div id="ed-sites-box" style="margin-bottom:10px; background:rgba(16,20,32,0.5); border:1px solid #446688; border-radius:6px; padding:8px;">
            <div style="color:#99ccff; font-size:11px; font-weight:bold; margin-bottom:4px;">📍 Метки для геометрии</div>
            <div style="color:#7788aa; font-size:10px; line-height:1.35; margin-bottom:6px;">
              Зоны охоты остаются видимыми. Пин / пятно / линия — заказ на постройку. В игре не видны.
            </div>
            <div style="display:flex; gap:4px; margin-bottom:6px;">
              <button id="ed-btn-site-pin" style="flex:1; background:#223344; color:#cceeff; border:1px solid #6688aa; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-weight:bold; font-size:11px;">📌 Пин</button>
              <button id="ed-btn-site-poly" style="flex:1; background:#223322; color:#ccffcc; border:1px solid #66aa66; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-weight:bold; font-size:11px;">⬡ Пятно</button>
              <button id="ed-btn-site-line" style="flex:1; background:#332211; color:#ffeebb; border:1px solid #aa8844; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-weight:bold; font-size:11px;">〰 Линия</button>
            </div>
            <div id="ed-site-draw-hint" style="display:none; margin-bottom:6px; padding:6px; background:rgba(40,80,120,0.3); border:1px solid #6688aa; border-radius:4px; color:#cceeff; font-size:10px; text-align:center;"></div>
            <label style="color:#88aacc; font-size:10px;">Тип:</label>
            <select id="ed-site-type" style="width:100%; background:#222; color:#fff; border:1px solid #555; padding:3px; border-radius:4px; font-family:inherit; font-size:11px; margin-bottom:6px;">
              <option value="custom">custom</option>
              <option value="house">house</option>
              <option value="dock">dock</option>
              <option value="mill">mill</option>
              <option value="stairs">stairs</option>
              <option value="wall">wall</option>
              <option value="road">road</option>
            </select>
            <div id="ed-sites-list" style="max-height:120px; overflow:auto; border:1px solid #334455; border-radius:4px; background:rgba(0,0,0,0.35); font-size:10px; margin-bottom:6px; color:#ccddee;"></div>
            <div id="ed-site-edit" style="display:none;">
              <input id="ed-site-name" type="text" placeholder="Имя" style="width:100%; box-sizing:border-box; background:#222; color:#fff; border:1px solid #555; padding:4px; border-radius:3px; margin-bottom:4px; font-family:inherit; font-size:11px;" />
              <textarea id="ed-site-note" rows="2" placeholder="Комментарий для постройки…" style="width:100%; box-sizing:border-box; background:#222; color:#fff; border:1px solid #555; padding:4px; border-radius:3px; font-family:inherit; font-size:11px; resize:vertical;"></textarea>
              <div style="display:flex; gap:4px; margin-top:4px;">
                <button id="ed-btn-site-save" style="flex:1; background:#335522; color:#ccffaa; border:1px solid #66aa44; padding:4px; border-radius:3px; cursor:pointer; font-size:10px;">Сохранить</button>
                <button id="ed-btn-site-del" style="flex:1; background:#442222; color:#ffaaaa; border:1px solid #aa5555; padding:4px; border-radius:3px; cursor:pointer; font-size:10px;">Удалить</button>
              </div>
            </div>
          </div>

          <div id="ed-ground-box" style="margin-bottom:10px; background:rgba(16,32,16,0.5); border:1px solid #448844; border-radius:6px; padding:8px;">
            <div style="color:#bbffaa; font-size:11px; font-weight:bold; margin-bottom:4px;">🛤 Земля на террейне</div>
            <div style="color:#88aa88; font-size:10px; line-height:1.35; margin-bottom:6px;">
              Видно в игре. Дорога = линия, площадь/трава = пятно. По террейну.
            </div>
            <div style="display:flex; gap:4px; margin-bottom:6px;">
              <button id="ed-btn-g-road" style="flex:1; background:#443322; color:#ffeebb; border:1px solid #aa8844; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-weight:bold; font-size:11px;">〰 Дорога</button>
              <button id="ed-btn-g-plaza" style="flex:1; background:#333322; color:#eeeecc; border:1px solid #888866; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-weight:bold; font-size:11px;">⬡ Площадь</button>
              <button id="ed-btn-g-grass" style="flex:1; background:#223322; color:#bbffbb; border:1px solid #55aa55; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-weight:bold; font-size:11px;">🌿 Трава</button>
            </div>
            <label style="color:#99bb99; font-size:10px;">Ширина дороги, м:</label>
            <input id="ed-ground-width" type="number" value="8" min="3" max="24" step="1" style="width:100%; background:#222; color:#fff; border:1px solid #555; padding:3px; border-radius:4px; font-family:inherit; font-size:11px; margin-bottom:6px;" />
            <div id="ed-ground-draw-hint" style="display:none; padding:6px; background:rgba(40,80,40,0.3); border:1px solid #66aa66; border-radius:4px; color:#ccffcc; font-size:10px; text-align:center;"></div>
            <div id="ed-ground-list" style="max-height:90px; overflow-y:auto; margin-top:6px; font-size:10px; color:#aaccaa;"></div>
          </div>

          <!-- UE5-Style Terrain Paint Panel -->
          <div id="ed-paint-panel" style="display:none; margin-bottom:10px; background:rgba(14,28,20,0.92); border:1px solid #33aa66; border-radius:6px; padding:8px;">
            <div style="color:#88ffbb; font-weight:bold; margin-bottom:6px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
              <span>🎨 Кисть террейна (UE5 Paint)</span>
              <span id="ed-paint-status" style="font-size:10px; color:#aaccbb; font-weight:normal;">ЛКМ: рисовать</span>
            </div>
            <div style="color:#aaccbb; font-size:10px; line-height:1.35; margin-bottom:8px;">
              Рисуйте текстурами дорог, троп, лужаек и площадей прямо по земле с мягкими краями.
            </div>

            <!-- Layer Palette (4 Active Texture Slots) -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="color:#ffeeaa; font-size:10px; font-weight:bold;">Активные слои кисти (1–4):</span>
              <button type="button" id="btn-paint-open-tex-lib" style="background:#1b3d54; color:#aaddff; border:1px solid #3d7eab; padding:3px 7px; border-radius:3px; cursor:pointer; font-size:10px; font-weight:bold;" title="Выбрать текстуру из папки assets/textures и data/textures">📂 Библиотека (29)</button>
            </div>
            <div id="ed-paint-palette" style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:6px;">
              <button type="button" class="btn-paint-layer active" data-layer="0" style="display:flex; align-items:center; gap:6px; background:#1c4a2a; color:#aaffcc; border:2px solid #55dd88; padding:5px 6px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold; text-align:left;">
                <span style="font-size:14px;">🛤️</span> <span class="layer-name">1: Брусчатка 2K</span>
              </button>
              <button type="button" class="btn-paint-layer" data-layer="1" style="display:flex; align-items:center; gap:6px; background:#16281e; color:#aaccbb; border:1px solid #285536; padding:5px 6px; border-radius:4px; cursor:pointer; font-size:10px; text-align:left;">
                <span style="font-size:14px;">🌿</span> <span class="layer-name">2: Сочная трава</span>
              </button>
              <button type="button" class="btn-paint-layer" data-layer="2" style="display:flex; align-items:center; gap:6px; background:#16281e; color:#aaccbb; border:1px solid #285536; padding:5px 6px; border-radius:4px; cursor:pointer; font-size:10px; text-align:left;">
                <span style="font-size:14px;">🟫</span> <span class="layer-name">3: Лесная земля</span>
              </button>
              <button type="button" class="btn-paint-layer" data-layer="3" style="display:flex; align-items:center; gap:6px; background:#16281e; color:#aaccbb; border:1px solid #285536; padding:5px 6px; border-radius:4px; cursor:pointer; font-size:10px; text-align:left;">
                <span style="font-size:14px;">🏖️</span> <span class="layer-name">4: Золотой песок</span>
              </button>
            </div>
            <!-- Assign / Add Texture to Current Layer -->
            <button type="button" id="btn-paint-change-slot-tex" style="width:100%; background:linear-gradient(180deg,#1e3a4d,#142430); color:#aaccff; border:1px solid #336688; padding:4px 6px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold; margin-bottom:8px; display:flex; align-items:center; justify-content:center; gap:4px;">
              <span>➕ Сменить текстуру активного слоя (#<span id="txt-active-slot-num">1</span>)</span>
            </button>

            <!-- Per-Stroke Brush Tiling (UV Scale) -->
            <div style="background:#0a1a12; border:1px solid #244c30; padding:6px; border-radius:4px; margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:9px; color:#88ffbb; margin-bottom:3px;">
                <span>📐 Тайлинг кисти (плотность текстуры):</span>
                <span id="txt-paint-tiling-val" style="font-weight:bold; color:#55ffaa;">120.0x</span>
              </div>
              <input type="range" id="rng-paint-tiling" min="10" max="1000" step="5" value="120" style="width:100%; accent-color:#33dd77; margin-bottom:4px;" />
              <div style="display:flex; gap:3px;">
                <button type="button" class="btn-paint-tile-preset" data-tile="40" style="flex:1; background:#142d1e; color:#aaddbb; border:1px solid #244c30; padding:2px; border-radius:2px; cursor:pointer; font-size:8px;">40x (Крупно)</button>
                <button type="button" class="btn-paint-tile-preset" data-tile="120" style="flex:1; background:#142d1e; color:#aaddbb; border:1px solid #244c30; padding:2px; border-radius:2px; cursor:pointer; font-size:8px;">120x (Норма)</button>
                <button type="button" class="btn-paint-tile-preset" data-tile="250" style="flex:1; background:#142d1e; color:#aaddbb; border:1px solid #244c30; padding:2px; border-radius:2px; cursor:pointer; font-size:8px;">250x (Мелко)</button>
                <button type="button" class="btn-paint-tile-preset" data-tile="500" style="flex:1; background:#142d1e; color:#aaddbb; border:1px solid #244c30; padding:2px; border-radius:2px; cursor:pointer; font-size:8px;">500x (Микро)</button>
                <button type="button" class="btn-paint-tile-preset" data-tile="800" style="flex:1; background:#142d1e; color:#aaddbb; border:1px solid #244c30; padding:2px; border-radius:2px; cursor:pointer; font-size:8px;">800x (Ультра)</button>
              </div>
            </div>

            <!-- Brush Settings (Radius, Falloff, Strength, Mode) -->
            <div style="background:#0e2016; border:1px solid #254d30; padding:6px; border-radius:4px; margin-bottom:8px;">
              <!-- Radius -->
              <div style="margin-bottom:5px;">
                <div style="display:flex; justify-content:space-between; font-size:9px; color:#88ffbb; margin-bottom:2px;">
                  <span>📏 Радиус кисти [ / ]:</span>
                  <span id="txt-paint-radius">12.0 м</span>
                </div>
                <input type="range" id="rng-paint-radius" min="1" max="60" step="0.5" value="12" style="width:100%; accent-color:#33cc66;" />
              </div>

              <!-- Falloff / Softness -->
              <div style="margin-bottom:5px;">
                <div style="display:flex; justify-content:space-between; font-size:9px; color:#88ffbb; margin-bottom:2px;">
                  <span>🌫️ Мягкость краев (Falloff):</span>
                  <span id="txt-paint-falloff">60%</span>
                </div>
                <input type="range" id="rng-paint-falloff" min="0" max="0.95" step="0.05" value="0.4" style="width:100%; accent-color:#33cc66;" />
              </div>

              <!-- Strength / Flow -->
              <div style="margin-bottom:5px;">
                <div style="display:flex; justify-content:space-between; font-size:9px; color:#88ffbb; margin-bottom:2px;">
                  <span>💧 Сила нажатия (Strength):</span>
                  <span id="txt-paint-strength">35%</span>
                </div>
                <input type="range" id="rng-paint-strength" min="0.05" max="1.0" step="0.05" value="0.35" style="width:100%; accent-color:#33cc66;" />
              </div>

              <!-- Paint / Erase Toggle -->
              <div style="display:flex; gap:4px;">
                <button type="button" id="btn-paint-draw-mode" style="flex:1; background:linear-gradient(180deg,#246630,#16401e); color:#aaffcc; border:1px solid #44aa66; padding:5px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">🖌️ Рисовать (ЛКМ)</button>
                <button type="button" id="btn-paint-erase-mode" style="flex:1; background:#331a1a; color:#ffaaaa; border:1px solid #663333; padding:5px; border-radius:4px; cursor:pointer; font-size:10px;" title="Shift + ЛКМ для быстрого стирания">🧼 Ластик (Shift)</button>
              </div>
            </div>

            <!-- Canvas Actions & Undo/Redo -->
            <div style="display:flex; gap:3px; margin-bottom:4px;">
              <button type="button" id="btn-paint-undo" style="flex:1; background:#222f3e; color:#c8d6e5; border:1px solid #485460; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;" title="Отменить последнее действие рисования (Ctrl+Z)">↩️ Отмена</button>
              <button type="button" id="btn-paint-redo" style="flex:1; background:#222f3e; color:#c8d6e5; border:1px solid #485460; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;" title="Повторить отменённое действие (Ctrl+Y)">↪️ Повтор</button>
              <button type="button" id="btn-paint-fill" style="flex:1; background:#1b3545; color:#aaccff; border:1px solid #336688; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;" title="Залить весь остров выбранной текстурой">🪣 Залить</button>
            </div>
            <div style="display:flex; gap:4px; margin-bottom:6px;">
              <button type="button" id="btn-paint-clear-layer" style="flex:1; background:#332211; color:#ffddaa; border:1px solid #885522; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;" title="Очистить выбранный слой">🗑️ Стереть слой</button>
              <button type="button" id="btn-paint-clear-all" style="flex:1; background:#441a1a; color:#ffaaaa; border:1px solid #aa3333; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;" title="Стереть абсолютно весь нарисованный рисунок">❌ Стереть всё</button>
            </div>

            <div style="display:flex; gap:4px;">
              <button type="button" id="btn-paint-save-server" style="flex:1; background:linear-gradient(180deg,#2b5936,#193821); color:#aaffbb; border:1px solid #44aa66; padding:6px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">💾 Сохранить текстуры на сервер</button>
            </div>
          </div>

          <!-- UE5-Style Foliage / Vegetation Painting Panel -->
          <div id="ed-foliage-panel" style="display:none; margin-bottom:10px; background:rgba(12,28,18,0.95); border:1px solid #33cc66; border-radius:6px; padding:8px;">
            <div style="color:#88ffbb; font-weight:bold; margin-bottom:6px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
              <span>🌿 Кисть растительности (Foliage)</span>
              <span id="ed-foliage-status" style="font-size:10px; color:#aaccbb; font-weight:normal;">ЛКМ: сажать</span>
            </div>

            <!-- Big Studio Window Button with Live Counter -->
            <button type="button" id="btn-foliage-open-studio" style="width:100%; background:linear-gradient(180deg,#1c4a2a,#0f2d19); color:#aaffcc; border:1px solid #3d9955; padding:8px 6px; border-radius:5px; cursor:pointer; font-size:11px; font-weight:bold; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 8px rgba(0,0,0,0.3);">
              <span>🖼️ Палитра растений & Иконки (V)</span>
              <span id="txt-foliage-sel-badge" style="background:#246636; color:#ffffff; padding:2px 7px; border-radius:10px; font-size:10px; border:1px solid #44cc77;">4 вида</span>
            </button>

            <!-- Quick Category Presets -->
            <div style="display:flex; gap:3px; margin-bottom:8px;">
              <button type="button" id="btn-foliage-all-trees" style="flex:1; background:#142d1e; color:#aaddbb; border:1px solid #245530; padding:4px 2px; border-radius:3px; cursor:pointer; font-size:9px;">🌲 Все деревья</button>
              <button type="button" id="btn-foliage-all-bushes" style="flex:1; background:#142d1e; color:#aaddbb; border:1px solid #245530; padding:4px 2px; border-radius:3px; cursor:pointer; font-size:9px;">🌿 Все кусты</button>
              <button type="button" id="btn-foliage-clear-sel" style="flex:1; background:#2d1a14; color:#ddbbaa; border:1px solid #553024; padding:4px 2px; border-radius:3px; cursor:pointer; font-size:9px;">❌ Снять всё</button>
            </div>

            <!-- Selected Models Chips / Mini-Preview -->
            <div id="ed-foliage-selected-chips" style="display:flex; flex-wrap:wrap; gap:3px; max-height:64px; overflow-y:auto; margin-bottom:8px; background:rgba(0,0,0,0.4); padding:4px; border-radius:4px; border:1px solid #1a3824;"></div>

            <!-- Transform & Randomization Settings -->
            <div style="background:#0a1a12; border:1px solid #244c30; padding:6px; border-radius:4px; margin-bottom:8px;">
              <!-- Scale Range -->
              <div style="margin-bottom:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:9px; color:#88ffbb; margin-bottom:2px;">
                  <span>📐 Случайный масштаб (Min / Max):</span>
                  <span id="txt-foliage-scale-range" style="font-weight:bold; color:#55ffaa;">0.8x – 1.3x</span>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
                  <div>
                    <label style="color:#88bb99; font-size:8px;">Min Scale: <b id="lbl-foliage-min-scale">0.80</b></label>
                    <input type="range" id="rng-foliage-scale-min" min="0.2" max="3.0" step="0.05" value="0.8" style="width:100%; accent-color:#33dd77;" />
                  </div>
                  <div>
                    <label style="color:#88bb99; font-size:8px;">Max Scale: <b id="lbl-foliage-max-scale">1.30</b></label>
                    <input type="range" id="rng-foliage-scale-max" min="0.2" max="3.0" step="0.05" value="1.3" style="width:100%; accent-color:#33dd77;" />
                  </div>
                </div>
              </div>

              <!-- Random Rotation & Multi-Layer Stacking -->
              <div style="margin-bottom:6px;">
                <label style="display:flex; align-items:center; gap:6px; font-size:10px; color:#55ffaa; cursor:pointer; margin-bottom:3px;" title="Разрешает сажать цветы поверх травы, кусты среди цветов и деревья на полянке">
                  <input type="checkbox" id="chk-foliage-layer-stacking" checked />
                  <span>✨ Многослойность (Слои: Трава + Цветы + Деревья)</span>
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:10px; color:#cceedd; cursor:pointer; margin-bottom:3px;">
                  <input type="checkbox" id="chk-foliage-rand-yaw" checked />
                  <span>🔄 Поворот Yaw (0–360°)</span>
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:10px; color:#cceedd; cursor:pointer;">
                  <input type="checkbox" id="chk-foliage-rand-tilt" checked />
                  <span>🌱 Органический наклон (Pitch/Roll)</span>
                </label>
              </div>

              <!-- Spacing & Density -->
              <div style="margin-bottom:4px;">
                <div style="display:flex; justify-content:space-between; font-size:9px; color:#88ffbb; margin-bottom:2px;">
                  <span>📏 Мин. дистанция в слое:</span>
                  <span id="txt-foliage-dist" style="font-weight:bold; color:#55ffaa;">2.0 м</span>
                </div>
                <input type="range" id="rng-foliage-dist" min="0.2" max="20.0" step="0.2" value="2.0" style="width:100%; accent-color:#33dd77; margin-bottom:4px;" />
              </div>

              <div>
                <div style="display:flex; justify-content:space-between; font-size:9px; color:#88ffbb; margin-bottom:2px;">
                  <span>💧 Плотность кисти (число за мазок):</span>
                  <span id="txt-foliage-density" style="font-weight:bold; color:#55ffaa;">3 шт</span>
                </div>
                <input type="range" id="rng-foliage-density" min="1" max="10" step="1" value="3" style="width:100%; accent-color:#33dd77;" />
              </div>
            </div>

            <!-- Brush Size & Mode -->
            <div style="background:#0e2016; border:1px solid #254d30; padding:6px; border-radius:4px; margin-bottom:8px;">
              <div style="margin-bottom:5px;">
                <div style="display:flex; justify-content:space-between; font-size:9px; color:#88ffbb; margin-bottom:2px;">
                  <span>📏 Радиус кисти [ / ]:</span>
                  <span id="txt-foliage-radius">16.0 м</span>
                </div>
                <input type="range" id="rng-foliage-radius" min="2" max="60" step="1" value="16" style="width:100%; accent-color:#33cc66;" />
              </div>

              <!-- Paint / Erase Toggle -->
              <div style="display:flex; gap:4px; margin-bottom:4px;">
                <button type="button" id="btn-foliage-draw-mode" style="flex:1; background:linear-gradient(180deg,#246630,#16401e); color:#aaffcc; border:1px solid #44aa66; padding:5px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">🖌️ Сажать (ЛКМ)</button>
                <button type="button" id="btn-foliage-erase-mode" style="flex:1; background:#331a1a; color:#ffaaaa; border:1px solid #663333; padding:5px; border-radius:4px; cursor:pointer; font-size:10px;" title="Shift + ЛКМ для быстрого стирания">🧼 Ластик (Shift)</button>
              </div>

              <label style="display:flex; align-items:center; gap:6px; font-size:9px; color:#ffaaaa; cursor:pointer;">
                <input type="checkbox" id="chk-foliage-erase-sel-only" />
                <span>Стирать только выбранные типы</span>
              </label>
            </div>

            <!-- GPU Wind Controls -->
            <div style="background:#081814; border:1px solid #205c48; padding:6px; border-radius:4px; margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="color:#77ffdd; font-size:10px; font-weight:bold;">🌬️ Анимация ветра (GPU Sway)</span>
                <label style="display:flex; align-items:center; gap:4px; font-size:9px; color:#cceedd; cursor:pointer;">
                  <input type="checkbox" id="chk-wind-enabled" checked />
                  <span>Вкл</span>
                </label>
              </div>

              <!-- Wind Strength Slider -->
              <div style="margin-bottom:4px;">
                <div style="display:flex; justify-content:space-between; font-size:9px; color:#88ffdd; margin-bottom:1px;">
                  <span>💨 Сила ветра:</span>
                  <span id="txt-wind-strength" style="font-weight:bold; color:#55ffee;">0.50x</span>
                </div>
                <input type="range" id="rng-wind-strength" min="0" max="2.0" step="0.05" value="0.5" style="width:100%; accent-color:#20ddaa;" />
              </div>

              <!-- Wind Speed Slider -->
              <div style="margin-bottom:4px;">
                <div style="display:flex; justify-content:space-between; font-size:9px; color:#88ffdd; margin-bottom:1px;">
                  <span>⚡ Скорость порывов:</span>
                  <span id="txt-wind-speed" style="font-weight:bold; color:#55ffee;">1.00x</span>
                </div>
                <input type="range" id="rng-wind-speed" min="0.1" max="3.0" step="0.1" value="1.0" style="width:100%; accent-color:#20ddaa;" />
              </div>

              <!-- Wind Turbulence / Randomness Slider -->
              <div style="margin-bottom:4px;">
                <div style="display:flex; justify-content:space-between; font-size:9px; color:#88ffdd; margin-bottom:1px;">
                  <span>🌪️ Турбулентность / Рандом:</span>
                  <span id="txt-wind-turb" style="font-weight:bold; color:#55ffee;">0.50x</span>
                </div>
                <input type="range" id="rng-wind-turb" min="0" max="2.0" step="0.05" value="0.5" style="width:100%; accent-color:#20ddaa;" />
              </div>

              <!-- Wind Direction Angle Slider -->
              <div style="margin-bottom:4px;">
                <div style="display:flex; justify-content:space-between; font-size:9px; color:#88ffdd; margin-bottom:1px;">
                  <span>🧭 Направление:</span>
                  <span id="txt-wind-angle" style="font-weight:bold; color:#55ffee;">↗ 45°</span>
                </div>
                <input type="range" id="rng-wind-angle" min="0" max="360" step="5" value="45" style="width:100%; accent-color:#20ddaa;" />
              </div>

              <!-- Reset Defaults Button -->
              <button type="button" id="btn-wind-reset" style="width:100%; background:#133328; color:#aaffdd; border:1px solid #286650; padding:3px; border-radius:3px; cursor:pointer; font-size:9px;">↺ Сброс ветра по умолчанию</button>
            </div>

            <!-- Actions & Undo/Redo -->
            <div style="display:flex; gap:3px; margin-bottom:4px;">
              <button type="button" id="btn-foliage-undo" style="flex:1; background:#222f3e; color:#c8d6e5; border:1px solid #485460; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;" title="Отменить мазок (Ctrl+Z)">↩️ Отмена</button>
              <button type="button" id="btn-foliage-redo" style="flex:1; background:#222f3e; color:#c8d6e5; border:1px solid #485460; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;" title="Повторить (Ctrl+Y)">↪️ Повтор</button>
              <button type="button" id="btn-foliage-clear-all" style="flex:1.2; background:#441a1a; color:#ffaaaa; border:1px solid #aa3333; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;" title="Стереть всю нарисованную растительность на карте">🗑️ Стереть всё</button>
            </div>

            <div style="display:flex; gap:4px;">
              <button type="button" id="btn-foliage-save-server" style="flex:1; background:linear-gradient(180deg,#2b5936,#193821); color:#aaffbb; border:1px solid #44aa66; padding:6px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">💾 Сохранить сцену на сервер</button>
            </div>
          </div>

          <!-- Инспектор параметров -->
          <div id="ed-selected-info" style="background: rgba(0,0,0,0.5); border: 1px solid #444; border-radius: 6px; padding: 8px; margin-bottom: 10px;">
            <div style="color: #888; text-align: center;">Кликните абсолютно ЛЮБУЮ 3D модель или персонажа в мире</div>
          </div>

          <!-- База 3D-оружия + хват RightHand -->
          <div id="ed-weapon-grip-box" style="background: rgba(40,28,16,0.55); border: 1px solid #aa7744; border-radius: 6px; padding: 8px; margin-bottom: 10px;">
            <div style="color:#ffcc88; font-weight:bold; margin-bottom:6px; font-size:12px;">🗡️ База оружия (3D visuals)</div>
            <div style="color:#998866; font-size:10px; margin-bottom:6px; line-height:1.35;">
              Каталог WEAPON_VISUALS. <b>Снять</b> — только с рук (база остаётся).
              Grip: pos/rot/длина → auto-save (LS + editor-overrides). <b>Сохранить на сервер</b> — на диск.
            </div>
            <div id="ed-wpn-db-list" style="max-height:110px; overflow:auto; margin-bottom:6px; border:1px solid #553311; border-radius:4px; background:rgba(0,0,0,0.35); font-size:10px;"></div>
            <label style="color:#ffaa44; font-size:10px;">Оружие (visual id):</label>
            <div style="display:grid; grid-template-columns:1fr; gap:4px; margin-bottom:6px;">
              <select id="ed-wpn-id" style="width:100%; background:#222; color:#fff; border:1px solid #555; padding:4px; border-radius:4px; font-family:inherit;">
                <option value="">— нет visuals —</option>
              </select>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:4px; margin-bottom:6px;">
              <button type="button" id="ed-wpn-equip" style="background:#335522; color:#ccffaa; border:1px solid #66aa44; padding:5px 4px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:10px; font-weight:bold;" title="Надеть mesh на RightHand для правки хвата">Надеть</button>
              <button type="button" id="ed-wpn-unequip" style="background:#442222; color:#ffaaaa; border:1px solid #aa5555; padding:5px 4px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:10px; font-weight:bold;" title="Убрать mesh с рук (запись в базе остаётся)">Снять</button>
              <button type="button" id="ed-wpn-drop" style="background:#223355; color:#aaccff; border:1px solid #4477aa; padding:5px 4px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:10px; font-weight:bold;" title="Спавн на земле как дроп с моба — подбери">Дроп</button>
              <button type="button" id="ed-wpn-reequip" style="background:#443322; color:#ffddaa; border:1px solid #aa7744; padding:5px 4px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:10px;" title="Перезагрузить mesh">↻ Reload</button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:6px;">
              <button type="button" id="ed-wpn-mouse-move" style="background:#222; color:#aaffcc; border:1px solid #555; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:11px; font-weight:bold;" title="ЛКМ-drag: сдвиг · Shift: вверх/вниз · колесо: длина">🖱 Сдвиг мышью</button>
              <button type="button" id="ed-wpn-mouse-rot" style="background:#222; color:#ffddaa; border:1px solid #555; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:11px; font-weight:bold;" title="ЛКМ-drag: поворот · Shift: ось Z">🔄 Поворот мышью</button>
            </div>
            <div id="ed-wpn-mouse-hint" style="display:none; margin-bottom:6px; padding:5px; background:rgba(40,60,40,0.35); border:1px solid #668866; border-radius:4px; color:#cceebb; font-size:10px; line-height:1.35; text-align:center;">
              —
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px; margin-bottom:6px;">
              <div>
                <label style="color:#ffaa44; font-size:9px;">Pos X</label>
                <input type="number" step="0.01" id="ed-wpn-px" style="width:100%; background:#222; color:#aaffcc; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
              </div>
              <div>
                <label style="color:#ffaa44; font-size:9px;">Pos Y</label>
                <input type="number" step="0.01" id="ed-wpn-py" style="width:100%; background:#222; color:#aaffcc; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
              </div>
              <div>
                <label style="color:#ffaa44; font-size:9px;">Pos Z</label>
                <input type="number" step="0.01" id="ed-wpn-pz" style="width:100%; background:#222; color:#aaffcc; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
              </div>
              <div>
                <label style="color:#ffaa44; font-size:9px;">Rot X °</label>
                <input type="number" step="1" id="ed-wpn-rx" style="width:100%; background:#222; color:#ffddaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
              </div>
              <div>
                <label style="color:#ffaa44; font-size:9px;">Rot Y °</label>
                <input type="number" step="1" id="ed-wpn-ry" style="width:100%; background:#222; color:#ffddaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
              </div>
              <div>
                <label style="color:#ffaa44; font-size:9px;">Rot Z °</label>
                <input type="number" step="1" id="ed-wpn-rz" style="width:100%; background:#222; color:#ffddaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
              </div>
            </div>
            <div style="margin-bottom:6px;">
              <label style="color:#ffaa44; font-size:10px;">Длина в мире (м): <span id="ed-wpn-len-val" style="color:#ffeeaa;">0.55</span></label>
              <input type="range" id="ed-wpn-len" min="0.15" max="2.0" step="0.01" value="0.55"
                style="width:100%; accent-color:#ffaa44; cursor:pointer;" />
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:4px;">
              <button type="button" id="ed-wpn-apply" style="background:#335522; color:#ccffaa; border:1px solid #66aa44; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:11px; font-weight:bold;">✓ Применить</button>
              <button type="button" id="ed-wpn-live" style="background:#223344; color:#aaddff; border:1px solid #4488aa; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:11px;" title="Каждый input сразу на модель">⚡ Live ON</button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
              <button type="button" id="ed-wpn-reset" style="background:#442222; color:#ffaaaa; border:1px solid #aa5555; padding:5px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:10px;">↺ Сброс grip</button>
              <button type="button" id="ed-wpn-copy" style="background:#333355; color:#ccd0ff; border:1px solid #6677aa; padding:5px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:10px;">📋 JS grip</button>
            </div>
            <div id="ed-wpn-status" style="color:#778899; font-size:10px; margin-top:5px;">—</div>
          </div>

          <!-- Время суток / солнце -->
          <div id="ed-daynight-box" style="background: rgba(30,40,60,0.55); border: 1px solid #5577aa; border-radius: 6px; padding: 8px; margin-bottom: 10px;">
            <div style="color:#88bbff; font-weight:bold; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
              <span>☀️ Время суток / солнце</span>
              <span id="ed-tod-label" style="color:#ffdd88; font-size:11px;">—:—</span>
            </div>
            <input type="range" id="ed-tod-slider" min="0" max="1439" step="1" value="432"
              style="width:100%; accent-color:#ffaa44; cursor:pointer; margin-bottom:6px;"
              title="Сдвиг солнца по кругу суток" />
            <div style="display:flex; gap:4px; margin-bottom:6px;">
              <button type="button" class="ed-tod-preset" data-hour="6" style="flex:1; background:#334455; color:#ffcc88; border:1px solid #6688aa; padding:4px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:10px;">🌅 6:00</button>
              <button type="button" class="ed-tod-preset" data-hour="12" style="flex:1; background:#334455; color:#ffeeaa; border:1px solid #6688aa; padding:4px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:10px;">☀️ 12:00</button>
              <button type="button" class="ed-tod-preset" data-hour="18" style="flex:1; background:#443322; color:#ffaa66; border:1px solid #aa7744; padding:4px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:10px;">🌇 18:00</button>
              <button type="button" class="ed-tod-preset" data-hour="0" style="flex:1; background:#222244; color:#99aaff; border:1px solid #5566aa; padding:4px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:10px;">🌙 0:00</button>
            </div>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; margin-bottom:2px;">
              <input type="checkbox" id="ed-chk-tod-pause" checked />
              <span>⏸ Пауза цикла (не крутить время)</span>
            </label>
            <div id="ed-tod-phase" style="color:#8899aa; font-size:10px; margin-top:4px;">Фаза: —</div>
          </div>

          <!-- Опции -->
          <div style="background: rgba(0,0,0,0.3); border: 1px solid #333; border-radius: 6px; padding: 8px; margin-bottom: 10px;">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; margin-bottom:4px;">
              <input type="checkbox" id="ed-chk-terrain-snap" />
              <span>📌 Привязка к ландшафту (Terrain Y)</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" id="ed-chk-grid-snap" />
              <span>📏 Сетка 0.5м (только при отпускании)</span>
            </label>
          </div>

          <!-- Undo / Redo -->
          <div style="display:flex; gap:5px; margin-bottom:6px;">
            <button id="ed-btn-undo" style="flex:1; background:#2a2a44; color:#ccd0ff; border:1px solid #6677aa; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; opacity:0.45;" title="Отменить (Ctrl+Z)" disabled>↩ Undo</button>
            <button id="ed-btn-redo" style="flex:1; background:#2a2a44; color:#ccd0ff; border:1px solid #6677aa; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit; opacity:0.45;" title="Повторить (Ctrl+Y)" disabled>↪ Redo</button>
          </div>
          <div style="color:#666; font-size:10px; margin:-2px 0 8px; text-align:center;">Ctrl+Z отмена · Ctrl+Y / Ctrl+Shift+Z повтор</div>

          <!-- Кнопки управления -->
          <div style="display:flex; flex-direction:column; gap:5px;">
            <button id="ed-btn-fly-mode" style="background:#114455; color:#aaffff; border:1px solid #2299aa; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit;">✈️ Режим Полёта над картой (F3 / V)</button>
            <button id="ed-btn-snap-ground" style="background:#334455; color:#aaccff; border:1px solid #5588aa; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit;">📌 Опустить на землю (Y Ground)</button>
            <button id="ed-btn-focus" style="background:#334433; color:#aaffaa; border:1px solid #55aa55; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit;">🎯 Камера к объекту</button>
            <button id="ed-btn-duplicate" style="background:#554422; color:#ffddaa; border:1px solid #aa8844; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit;">📋 Дублировать</button>
            <button id="ed-btn-delete" style="background:#552222; color:#ffaaaa; border:1px solid #aa4444; padding:6px; border-radius:4px; cursor:pointer; font-family:inherit;">🗑️ Удалить</button>
          </div>
        </div>

        <div style="background: rgba(10,15,20,0.95); padding: 8px; border-top: 1px solid #444; display: flex; flex-direction: column; gap: 6px;">
          <button id="ed-btn-save-server" style="background: linear-gradient(180deg,#228844,#114422); color: #fff; border: 1px solid #44ff88; padding: 8px; border-radius: 4px; font-weight: bold; cursor: pointer; font-family: inherit;">💾 СОХРАНИТЬ НА СЕРВЕР И В СКРИПТЫ</button>
          <button id="ed-btn-export-code" style="background: #333344; color: #ccddff; border: 1px solid #6677aa; padding: 6px; border-radius: 4px; cursor: pointer; font-family: inherit;">📋 Экспорт JS-кода (world-metrics.js)</button>
        </div>
      `;

      document.body.appendChild(this.panel);

      this.panel.querySelector('#ed-btn-close').onclick = () => this.toggle(false);
      this.panel.querySelector('#ed-ws-select').onclick = () => this.setWorkspaceMode('select');
      this.panel.querySelector('#ed-ws-bsp').onclick = () => this.setWorkspaceMode('bsp');
      this.panel.querySelector('#ed-ws-zones').onclick = () => this.setWorkspaceMode('zones');
      this.panel.querySelector('#ed-ws-sites').onclick = () => this.setWorkspaceMode('sites');
      this.panel.querySelector('#ed-ws-ground').onclick = () => this.setWorkspaceMode('ground');
      this.panel.querySelector('#ed-ws-foliage').onclick = () => this.setWorkspaceMode('foliage');
      this.panel.querySelector('#ed-ws-paint').onclick = () => this.setWorkspaceMode('paint');
      this.panel.querySelector('#btn-mode-w').onclick = () => this.setMode('translate');
      this.panel.querySelector('#btn-mode-e').onclick = () => this.setMode('rotate');
      this.panel.querySelector('#btn-mode-r').onclick = () => this.setMode('scale');

      this.panel.querySelector('#ed-category-select').onchange = (e) => {
        this.setFilterCategory(e.target.value);
      };
      this.panel.querySelector('#ed-object-select').onchange = (e) => this.selectObjectById(e.target.value);

      this.panel.querySelector('#ed-btn-add-prop').onclick = () => this.showAddPropModal();
      this.panel.querySelector('#ed-btn-add-barrier').onclick = () => {
        this.spawnCollisionBarrier();
        this.refreshCollisionBarriersList();
      };
      this.panel.querySelector('#ed-ws-collision').onclick = () => this.setWorkspaceMode('collision');

      // Modular Collision Blocks Panel Event Handlers
      this.panel.querySelectorAll('.btn-spawn-preset-col').forEach(btn => {
        btn.onclick = () => {
          const w = parseFloat(btn.getAttribute('data-w')) || 2;
          const h = parseFloat(btn.getAttribute('data-h')) || 2;
          const d = parseFloat(btn.getAttribute('data-d')) || 2;
          this.spawnCollisionBarrier(w, h, d);
          this.refreshCollisionBarriersList();
        };
      });

      this.panel.querySelector('#btn-col-spawn-custom').onclick = () => {
        const w = parseFloat(this.panel.querySelector('#inp-col-custom-w').value) || 4;
        const h = parseFloat(this.panel.querySelector('#inp-col-custom-h').value) || 3;
        const d = parseFloat(this.panel.querySelector('#inp-col-custom-d').value) || 1;
        this.spawnCollisionBarrier(w, h, d);
        this.refreshCollisionBarriersList();
      };

      this.panel.querySelector('#btn-col-click-place').onclick = () => {
        const w = parseFloat(this.panel.querySelector('#inp-col-custom-w').value) || 4;
        const h = parseFloat(this.panel.querySelector('#inp-col-custom-h').value) || 3;
        const d = parseFloat(this.panel.querySelector('#inp-col-custom-d').value) || 1;
        this.togglePlaceCollisionBlockMode(undefined, { x: w, y: h, z: d });
      };

      this.panel.querySelector('#btn-col-duplicate').onclick = () => {
        this.duplicateSelected();
        this.refreshCollisionBarriersList();
      };

      this.panel.querySelector('#btn-col-delete').onclick = () => {
        this.deleteSelected();
        this.refreshCollisionBarriersList();
      };

      this.panel.querySelector('#btn-col-toggle-vis').onclick = () => {
        this.toggleCollisionBarriersVisibility();
      };

      this.panel.querySelector('#ed-btn-add-spot').onclick = () => this.showAddSpotModal();
      this.panel.querySelector('#ed-btn-draw-hunt').onclick = () => {
        this.setWorkspaceMode('zones');
        this.toggleDrawHuntMode(undefined, 'poly', 'hunt');
      };
      this.panel.querySelector('#ed-btn-draw-hunt-rect').onclick = () => {
        this.setWorkspaceMode('zones');
        this.toggleDrawHuntMode(undefined, 'rect', 'hunt');
      };
      this.panel.querySelector('#ed-btn-draw-terr').onclick = () => {
        this.setWorkspaceMode('zones');
        this.toggleDrawHuntMode(undefined, 'poly', 'territory');
      };
      this.panel.querySelector('#ed-btn-draw-terr-rect').onclick = () => {
        this.setWorkspaceMode('zones');
        this.toggleDrawHuntMode(undefined, 'rect', 'territory');
      };
      this.panel.querySelector('#ed-btn-site-pin').onclick = () => {
        if (this.editorMode !== 'zones') this.setWorkspaceMode('sites');
        this.toggleDrawSiteMode(undefined, 'pin');
      };
      this.panel.querySelector('#ed-btn-site-poly').onclick = () => {
        if (this.editorMode !== 'zones') this.setWorkspaceMode('sites');
        this.toggleDrawSiteMode(undefined, 'poly');
      };
      this.panel.querySelector('#ed-btn-site-line').onclick = () => {
        if (this.editorMode !== 'zones') this.setWorkspaceMode('sites');
        this.toggleDrawSiteMode(undefined, 'line');
      };
      this.panel.querySelector('#ed-btn-g-road').onclick = () => {
        this.setWorkspaceMode('ground');
        this.toggleDrawGroundMode(undefined, 'road', 'line');
      };
      this.panel.querySelector('#ed-btn-g-plaza').onclick = () => {
        this.setWorkspaceMode('ground');
        this.toggleDrawGroundMode(undefined, 'plaza', 'poly');
      };
      this.panel.querySelector('#ed-btn-g-grass').onclick = () => {
        this.setWorkspaceMode('ground');
        this.toggleDrawGroundMode(undefined, 'grass', 'poly');
      };
      this.panel.querySelector('#ed-btn-site-save').onclick = () => this._saveSelectedSiteFields();
      this.panel.querySelector('#ed-btn-site-del').onclick = () => this._deleteSelectedSite();

      // BSP Geometry Mode
      this.panel.querySelectorAll('.ed-bsp-shape').forEach(btn => {
        btn.onclick = () => {
          const sh = btn.getAttribute('data-shape');
          this.drawBspShape = sh || 'box';
          this.bspPlaceMode = 'drag';
          this.setWorkspaceMode('bsp');
          this.toggleDrawBspMode(true, sh);
          this._updateBspShapeButtons();
        };
      });
      this.panel.querySelector('#ed-btn-bsp-add').onclick = () => this.setDrawBspOp('add');
      this.panel.querySelector('#ed-btn-bsp-sub').onclick = () => this.setDrawBspOp('sub');
      this.panel.querySelector('#ed-btn-bsp-draw').onclick = () => {
        this.bspPlaceMode = 'drag';
        this.setWorkspaceMode('bsp');
        this.toggleDrawBspMode(true, this.drawBspShape || 'box');
      };
      this.panel.querySelector('#ed-btn-bsp-place').onclick = () => {
        this.bspPlaceMode = 'click';
        this.setWorkspaceMode('bsp');
        this.toggleDrawBspMode(true, this.drawBspShape || 'box');
      };
      this.panel.querySelector('#ed-btn-bsp-build').onclick = () => this.buildBspGeometry(true);
      this.panel.querySelector('#ed-btn-bsp-exit').onclick = () => this.setWorkspaceMode('select');
      this.panel.querySelector('#ed-chk-bsp-autobuild').onchange = (e) => {
        if (window.BspBrushes) window.BspBrushes.setAutoBuild(e.target.checked);
      };
      this.panel.querySelector('#ed-chk-bsp-shells').onchange = (e) => {
        if (window.BspBrushes) window.BspBrushes.setShowShells(e.target.checked);
      };
      this.panel.querySelector('#ed-chk-bsp-built').onchange = (e) => {
        if (window.BspBrushes) window.BspBrushes.setShowBuilt(e.target.checked);
      };
      this.panel.querySelector('#ed-btn-bsp-up').onclick = () => this.reorderSelectedBsp(-1);
      this.panel.querySelector('#ed-btn-bsp-down').onclick = () => this.reorderSelectedBsp(1);
      this.panel.querySelector('#ed-btn-bsp-toggle-op').onclick = () => this.toggleSelectedBspOp();
      this.panel.querySelector('#ed-btn-bsp-disable').onclick = () => this.toggleSelectedBspDisabled();
      this._updateBspOpButtons();
      this._updateBspShapeButtons();
      this.refreshBspStackList();

      this.panel.querySelector('#ed-chk-terrain-snap').onchange = (e) => { this.terrainSnap = e.target.checked; };
      this.panel.querySelector('#ed-chk-grid-snap').onchange = (e) => { this.gridSnap = e.target.checked ? 0.5 : 0; };
      this.setWorkspaceMode('select', true);

      this._bindDayNightControls();
      this._bindWeaponGripControls();
      this._bindPaintControls();
      this._bindFoliageControls();

      this.panel.querySelector('#ed-btn-fly-mode').onclick = () => { if (this.game.cameraRig) this.game.cameraRig.toggleFlyMode(); };
      this.panel.querySelector('#ed-btn-snap-ground').onclick = () => this.snapSelectedToGround();
      this.panel.querySelector('#ed-btn-focus').onclick = () => this.focusCameraOnSelected();
      this.panel.querySelector('#ed-btn-duplicate').onclick = () => this.duplicateSelected();
      this.panel.querySelector('#ed-btn-delete').onclick = () => this.deleteSelected();
      this.panel.querySelector('#ed-btn-undo').onclick = () => this.undo();
      this.panel.querySelector('#ed-btn-redo').onclick = () => this.redo();

      this.panel.querySelector('#ed-btn-save-server').onclick = () => this.saveToServer();
      this.panel.querySelector('#ed-btn-export-code').onclick = () => this.showExportModal();
      this._updateHistoryButtons();

      if (typeof window.initEngineEditor === 'function') {
        try {
          window.initEngineEditor(this);
        } catch (e) {
          console.error('[SceneEditor] Error initializing engine layout:', e);
        }
      }
    }

    /** WASD / ЦФЫВ / стрелки / QE / ЙУ / Shift / Ctrl / F3 — камера, не глотаем как игровые хоткеи. */
    _isEditorCameraKey(e) {
      const c = e.code;
      const k = (e.key || '').toLowerCase();
      return c === 'KeyW' || c === 'KeyA' || c === 'KeyS' || c === 'KeyD' ||
        c === 'ArrowUp' || c === 'ArrowDown' || c === 'ArrowLeft' || c === 'ArrowRight' ||
        c === 'Space' || c === 'ShiftLeft' || c === 'ShiftRight' ||
        c === 'ControlLeft' || c === 'ControlRight' || c === 'AltLeft' || c === 'AltRight' ||
        c === 'KeyQ' || c === 'KeyE' || c === 'F3' ||
        k === 'w' || k === 'a' || k === 's' || k === 'd' ||
        k === 'q' || k === 'e' || k === ' ' ||
        k === 'ц' || k === 'ф' || k === 'ы' || k === 'в' ||
        k === 'й' || k === 'у';
    }

    _ensureEditorFly(on) {
      const rig = this.game && this.game.cameraRig;
      if (!rig || typeof rig.toggleFlyMode !== 'function') return;
      if (on) {
        if (!rig.flyMode) {
          this._editorStartedFly = true;
          rig.toggleFlyMode(true);
          if (this.game.camera && rig.flyPos) {
            rig.flyPos.copy(this.game.camera.position);
          }
        } else {
          this._editorStartedFly = false;
        }
      } else if (this._editorStartedFly) {
        this._editorStartedFly = false;
        if (rig.flyMode) rig.toggleFlyMode(false);
      }
    }

    toggle(state) {
      const want = (state !== undefined) ? !!state : !this.enabled;
      // Включить может только dev: fly-камера и снятие культинга — это читы.
      // Выключить (state=false) разрешено всегда, в том числе setEditorAllowed(false).
      if (want && !editorAllowed) {
        if (this.game && this.game.addChatMessage) {
          this.game.addChatMessage('Редактор мира доступен только в тестовом режиме.', 'system');
        }
        return;
      }
      this.enabled = want;
      // Современная оболочка Unreal / Godot Layout (#engine-editor-layout)
      if (typeof window.initEngineEditor === 'function' && !this.engineLayout) {
        try { window.initEngineEditor(this); } catch (e) { console.error(e); }
      }
      if (this.engineLayout) {
        this.panel.style.display = 'none';
        this.engineLayout.style.display = this.enabled ? 'flex' : 'none';
        const vpContainer = document.getElementById('editor-viewport-container');
        const canvas = (this.game && this.game.renderer && this.game.renderer.domElement) || document.querySelector('canvas');
        if (this.enabled) {
          if (vpContainer && canvas && canvas.parentNode !== vpContainer) {
            this._origCanvasParent = canvas.parentNode;
            this._origCanvasNextSibling = canvas.nextSibling;
            vpContainer.appendChild(canvas);
          }
          if (this.game && typeof this.game.onResize === 'function') {
            setTimeout(() => this.game.onResize(), 60);
          }
          if (typeof this.refreshOutliner === 'function') {
            try { this.refreshOutliner(); } catch (e) { console.warn(e); }
          }
          if (typeof this.refreshContentBrowser === 'function') {
            try { this.refreshContentBrowser(); } catch (e) { console.warn(e); }
          }
        } else {
          if (canvas && this._origCanvasParent && canvas.parentNode !== this._origCanvasParent) {
            if (this._origCanvasNextSibling && this._origCanvasNextSibling.parentNode === this._origCanvasParent) {
              this._origCanvasParent.insertBefore(canvas, this._origCanvasNextSibling);
            } else {
              this._origCanvasParent.appendChild(canvas);
            }
          }
          if (this.game && typeof this.game.onResize === 'function') {
            setTimeout(() => this.game.onResize(), 60);
          }
        }
      } else {
        this.panel.style.display = this.enabled ? 'flex' : 'none';
      }
      try { document.body.classList.toggle('ps-editor-on', this.enabled); } catch (e) {}
      if (this.enabled) {
        if (this.game && this.game.input) this.game.input.keys = {};
        this._ensureEditorFly(true);
        // Загрузить сектора террейна вокруг камеры
        if (window.Terrain && typeof window.Terrain.updateStreaming === 'function' && this.game && this.game.camera) {
          window.Terrain.updateStreaming(this.game.camera.position.x, this.game.camera.position.z);
        }
        // Запустить немедленный пересчёт видимости L2Visibility в режиме редактора
        const visMgr = window.L2VisibilityManager || window.L2Vis;
        if (visMgr && typeof visMgr.evaluate === 'function') {
          visMgr.evaluate(this.game && this.game.net ? this.game.net.remote : null, this.game ? this.game.player : null, this.game ? (this.game.camera || this.game.cam) : null);
        }
      } else {
        this._ensureEditorFly(false);
      }
      this.gizmoGroup.visible = this.enabled && !!this.selectedObject;
      this.selectionBox.visible = this.enabled && !!this.selectedObject;
      this._applyCollisionBarriersVisibility();
      if (this.markersGroup) {
        this.markersGroup.visible = this.enabled;
        // В геймплее маркеры не перехватывают клики
        this.markersGroup.traverse(obj => {
          if (obj.isMesh || obj.isSprite || obj.isLine) {
            if (this.enabled) {
              delete obj.raycast;
              if (obj.isSprite && THREE.Sprite) obj.raycast = THREE.Sprite.prototype.raycast;
              else if (obj.isMesh && THREE.Mesh) obj.raycast = THREE.Mesh.prototype.raycast;
              else if (obj.isLine && THREE.Line) obj.raycast = THREE.Line.prototype.raycast;
            } else {
              obj.raycast = function () {};
            }
          }
        });
      }

      if (this.enabled) {
        this.populateObjectDropdown(this.filterCategory || 'all');
        this._applyCategoryMarkerVisibility();
        // Обновить позиции маркеров (споты/спавн) при входе в редактор
        try { this.refreshMarkerPositions(); } catch (e) {}
        // Обновить список 3D-оружия (WEAPON_VISUALS мог подгрузиться позже)
        try {
          this._refreshWeaponSelectList();
          this._loadWeaponGripToUI();
        } catch (e) {}
        this._syncDayNightFromGame();
        this._applyDayNightEditorFlags();
        try {
          if (window.BspBrushes) {
            window.BspBrushes.setEditorMode(true);
            window.BspBrushes.setShowShells(true);
            this.refreshBspStackList();
            this._refreshBspBuildStatus();
          }
        } catch (e) {}
        if (this.game.addChatMessage) {
          this.game.addChatMessage(
            '[Редактор] F2 · WASD лететь · Q/E высота · 📍 Метки · пивот кнопками W/E/R',
            'system'
          );
        }
        try { this.refreshSitesList(); } catch (e) {}
      } else {
        // Выход из F2 — сброс mouse-хвата оружия + daynight override
        this._weaponMouseDrag = null;
        if (this._weaponMouseMode) this._setWeaponMouseMode(null);
        const dn = this.game && this.game.dayNight;
        const slider = (this.panel && this.panel.querySelector('#ed-tod-slider')) || document.querySelector('#ed-tod-slider');
        const hour = slider ? ((+slider.value || 0) / 60) : (dn ? dn.getHour() : 12);
        if (dn) {
          dn.setHour(hour);
          dn.setEditorOverride(false);
          const serverPaused = !!(this.game && this.game.net && this.game.net.timeAnchor && this.game.net.timeAnchor.paused);
          dn.setPaused(serverPaused);
        }
        try {
          if (this.game && this.game.net && this.game.net.intentSetTime && (this.game.net.status === 'online' || (this.game.net.ws && this.game.net.ws.readyState === 1))) {
            this.game.net.intentSetTime(hour, false);
          }
        } catch (_) {}
        if (this.drawBspMode) this.toggleDrawBspMode(false);
        if (this.drawSiteMode) this.toggleDrawSiteMode(false);
        try {
          if (window.BspBrushes) {
            window.BspBrushes.setEditorMode(false);
            // ensure built geometry is current
            if (window.BspBrushes.isDirty && window.BspBrushes.isDirty()) {
              window.BspBrushes.buildGeometry();
            }
          }
        } catch (e) {}
        this.deselectObject();
        if (this.game.addChatMessage) this.game.addChatMessage('[Редактор] Режим редактора отключен.', 'system');
      }
    }

    /**
     * Workspace: select | collision | bsp | zones | sites | ground | foliage | paint
     */
    setWorkspaceMode(mode, silent) {
      const m = (mode === 'bsp' || mode === 'zones' || mode === 'sites' || mode === 'ground' || mode === 'collision' || mode === 'paint' || mode === 'foliage') ? mode : 'select';
      this.editorMode = m;
      this.drawPaintMode = (m === 'paint');
      this.drawFoliageMode = (m === 'foliage');

      // Exit draw tools when leaving their workspace
      if (m !== 'bsp' && this.drawBspMode) {
        this.drawBspMode = false;
        this._bspDrawPhase = 0;
        this._bspCornerA = null;
        this._bspCornerB = null;
        this._clearBspPreview();
        this._clearBspGhost();
        this._updateBspShapeButtons();
        const hint = this.panel && this.panel.querySelector('#ed-bsp-draw-hint');
        if (hint) hint.style.display = 'none';
      }
      if (m !== 'collision' && this.placeCollisionBlockMode) {
        this.togglePlaceCollisionBlockMode(false);
      }
      if (m !== 'zones' && m !== 'sites' && this.drawHuntMode) {
        this.drawHuntMode = false;
        this._huntDrawCornerA = null;
        this._huntPolyPts = [];
        this._clearHuntPreview();
        this._updateHuntDrawButtons();
        const hh = this.panel && this.panel.querySelector('#ed-hunt-draw-hint');
        if (hh) hh.style.display = 'none';
      }
      if (m !== 'sites' && m !== 'zones' && this.drawSiteMode) {
        this.toggleDrawSiteMode(false);
      }
      if (m !== 'ground' && this.drawGroundMode) {
        this.toggleDrawGroundMode(false);
      }
      if (m !== 'paint' && this._paintBrushProjector) {
        this._paintBrushProjector.visible = false;
      }
      if (m !== 'foliage' && this._foliageBrushProjector) {
        this._foliageBrushProjector.visible = false;
      }
      if (m !== 'foliage' && this._foliageStudioWin) {
        this.toggleFoliageStudioWindow(false);
      }
      this._vertDrag = null;
      if (m !== 'zones' && this.zoneEditMode) this.exitZoneEditMode(true);

      // UI highlight
      const bs = this.panel && this.panel.querySelector('#ed-ws-select');
      const bc = this.panel && this.panel.querySelector('#ed-ws-collision');
      const bb = this.panel && this.panel.querySelector('#ed-ws-bsp');
      const bz = this.panel && this.panel.querySelector('#ed-ws-zones');
      const bt = this.panel && this.panel.querySelector('#ed-ws-sites');
      const bg = this.panel && this.panel.querySelector('#ed-ws-ground');
      const bfol = this.panel && this.panel.querySelector('#ed-ws-foliage');
      const bp = this.panel && this.panel.querySelector('#ed-ws-paint');
      const styleBtn = (el, on, onBg, offBg) => {
        if (!el) return;
        el.style.background = on ? onBg : offBg;
        el.style.fontWeight = on ? 'bold' : 'normal';
        el.style.boxShadow = on ? '0 0 8px rgba(255,170,68,0.45)' : 'none';
      };
      styleBtn(bs, m === 'select', '#aa6622', '#443322');
      styleBtn(bc, m === 'collision', '#22aa55', '#1c4a2a');
      styleBtn(bb, m === 'bsp', '#2288cc', '#1a3040');
      styleBtn(bz, m === 'zones', '#aa5533', '#331a22');
      styleBtn(bt, m === 'sites', '#4466aa', '#1a2233');
      styleBtn(bg, m === 'ground', '#339944', '#1a331a');
      styleBtn(bfol, m === 'foliage', '#22bb55', '#142e1a');
      styleBtn(bp, m === 'paint', '#22aa66', '#163824');

      const hint = this.panel && this.panel.querySelector('#ed-ws-hint');
      if (hint) {
        if (m === 'select') {
          hint.innerHTML = 'Режим <b style="color:#ffcc88">Выбор</b>: кликай объекты, W/E/R — пивот. <b>Q</b> — всегда сюда. Esc — снять выделение.';
        } else if (m === 'collision') {
          hint.innerHTML = 'Режим <b style="color:#88ffbb">Блоки Коллизий</b>: стройте стены, заборы и платформы. W/E/R — трансформация. <b>Q</b> — Выбор.';
          this.refreshCollisionBarriersList();
        } else if (m === 'bsp') {
          hint.innerHTML = 'Режим <b style="color:#88ccff">BSP</b>: Draw/Place браши. <b>Q</b> — выход в Выбор и двигать объекты.';
        } else if (m === 'sites') {
          hint.innerHTML = 'Режим <b style="color:#99ccff">Метки</b>: пин / пятно / линия. Зоны охоты видны как ориентир. <b>Q</b> — Выбор.';
        } else if (m === 'ground') {
          hint.innerHTML = 'Режим <b style="color:#bbffaa">Земля</b>: дорога (линия), площадь/трава (пятно). Enter/ПКМ — готово. <b>G</b> сюда, <b>Q</b> — Выбор.';
          this.refreshGroundList();
        } else if (m === 'foliage') {
          hint.innerHTML = 'Режим <b style="color:#88ffbb">🌿 Кисть растительности</b>: ЛКМ — сажать деревья и кусты, Shift+ЛКМ — ластик, [ / ] — радиус кисти. <b>Q</b> — Выбор.';
        } else if (m === 'paint') {
          hint.innerHTML = 'Режим <b style="color:#88ffbb">🎨 Рисование террейна</b>: ЛКМ — рисовать выбранной текстурой, Shift+ЛКМ — ластик, [ / ] — радиус кисти. <b>Q</b> — Выбор.';
        } else {
          hint.innerHTML = 'Режим <b style="color:#ffaa88">Зоны</b>: зоны видны. Можно сразу ставить метки и линии застройки. Tab — вершины зоны. <b>Q</b> — Выбор.';
        }
      }

      // Category defaults
      if (m === 'collision') {
        this.setFilterCategory('prop');
      } else if (m === 'foliage') {
        this.deselectObject();
        this._buildFoliageSpatialGrid();
        this.renderFoliagePalette();
        if (!this.engineLayout) {
          this.toggleFoliageStudioWindow(true);
        }
      } else if (m === 'paint') {
        this.deselectObject();
      } else if (m === 'zones') {
        this.filterCategory = 'zones'; // hunt + spot
        try {
          this.populateObjectDropdown('zones');
          const catSel = this.panel && this.panel.querySelector('#ed-category-select');
          if (catSel) {
            // synthetic option if missing
            if (![...catSel.options].some(o => o.value === 'zones')) {
              const opt = document.createElement('option');
              opt.value = 'zones';
              opt.textContent = 'Зоны + споты (вершины)';
              catSel.appendChild(opt);
            }
            catSel.value = 'zones';
          }
        } catch (e) {}
        this.refreshSitesList();
      } else if (m === 'sites') {
        this.filterCategory = 'site';
        try {
          this.populateObjectDropdown('site');
          const catSel = this.panel && this.panel.querySelector('#ed-category-select');
          if (catSel) {
            if (![...catSel.options].some(o => o.value === 'site')) {
              const opt = document.createElement('option');
              opt.value = 'site';
              opt.textContent = 'Метки геометрии';
              catSel.appendChild(opt);
            }
            catSel.value = 'site';
          }
        } catch (e) {}
        this.refreshSitesList();
      } else if (m === 'bsp') {
        this.setFilterCategory('bsp');
      } else if (!silent) {
        if (this.filterCategory === 'bsp' || this.filterCategory === 'zones' || this.filterCategory === 'hunt' || this.filterCategory === 'site') {
          this.setFilterCategory('all');
        }
      }

      // Показать панель своего режима
      const colP = this.panel && this.panel.querySelector('#ed-collision-panel');
      const bspP = this.panel && this.panel.querySelector('#ed-bsp-panel');
      const zonesP = this.panel && this.panel.querySelector('#ed-zones-box');
      const sitesP = this.panel && this.panel.querySelector('#ed-sites-box');
      const foliageP = this.panel && this.panel.querySelector('#ed-foliage-panel');
      const paintP = this.panel && this.panel.querySelector('#ed-paint-panel');
      const giz = this.panel && this.panel.querySelector('#ed-gizmo-modes');
      if (colP) colP.style.display = m === 'collision' ? 'block' : 'none';
      if (bspP) bspP.style.display = m === 'bsp' ? 'block' : 'none';
      if (zonesP) zonesP.style.display = (m === 'zones' || m === 'sites') ? 'block' : 'none';
      if (sitesP) sitesP.style.display = (m === 'zones' || m === 'sites') ? 'block' : 'none';
      if (foliageP) foliageP.style.display = m === 'foliage' ? 'block' : 'none';
      if (paintP) paintP.style.display = m === 'paint' ? 'block' : 'none';
      if (giz) giz.style.display = (m === 'select' || m === 'collision' || m === 'sites' || m === 'zones') ? 'flex' : 'none';

      // Highlight hunt vertices larger in zones mode
      try { this._setZoneVertexPickMode(m === 'zones'); } catch (e) {}

      if (!silent && this.game && this.game.addChatMessage) {
        const names = { select: 'Выбор/перемещение', collision: 'Постройка коллизий блоками', bsp: 'BSP постройка', zones: 'Зоны и споты', sites: 'Метки геометрии', foliage: 'Кисть растительности и деревьев', paint: 'Рисование по террейну кистями' };
        this.game.addChatMessage('[Редактор] Режим: ' + (names[m] || m) + (m !== 'select' ? ' · Q = выход' : ''), 'system');
      }
    }

    _setZoneVertexPickMode(on) {
      if (!this.markersGroup) return;
      this.markersGroup.traverse(c => {
        if (!c.userData) return;
        if (typeof c.userData.vertIndex === 'number' || typeof c.userData.cornerIndex === 'number') {
          // enlarge poles for easier grab
          if (c.isMesh && c.geometry && c.geometry.type === 'CylinderGeometry') {
            const s = on ? 1.6 : 1.0;
            c.scale.set(s, s, s);
          }
          c.userData.zoneVertexEditable = !!on;
        }
      });
    }

    /**
     * Сменить активную группу (категорию).
     * При category !== 'all' клики/выбор работают ТОЛЬКО с объектами этой группы.
     */
    setFilterCategory(category) {
      this.filterCategory = category || 'all';
      this.populateObjectDropdown(this.filterCategory);
      this._applyCategoryMarkerVisibility();
      // если выбранный объект не из группы — снять выделение
      if (this.selectedObject && this.filterCategory !== 'all') {
        if (!this._typeMatchesCategory(this.selectedObject.type, this.filterCategory)) {
          this.deselectObject();
        }
      }
      if (this.game && this.game.addChatMessage) {
        const labels = {
          all: 'Все объекты',
          player: 'Только игрок/спавн',
          npc: 'Только NPC',
          mob: 'Только мобы',
          spot: 'Только споты',
          hunt: 'Только зоны охоты',
          site: 'Только метки геометрии',
          zones: 'Зоны + споты',
          bsp: 'Только BSP-браши',
          prop: 'Только пропы/модели',
          light: 'Только свет'
        };
        this.game.addChatMessage(
          '[Редактор] Группа: ' + (labels[this.filterCategory] || this.filterCategory) +
          (this.filterCategory === 'all' ? '' : ' — клики только по этой группе'),
          'system'
        );
      }
    }

    _typeMatchesCategory(type, category) {
      if (!category || category === 'all') return true;
      if (category === 'player') return type === 'player' || type === 'player_spawn';
      if (category === 'prop') return type === 'prop' || type === 'direct_mesh';
      if (category === 'bsp') return type === 'bsp';
      if (category === 'zones') return type === 'hunt' || type === 'spot' || type === 'site';
      if (category === 'hunt') return type === 'hunt';
      if (category === 'site') return type === 'site';
      return type === category;
    }

    /** Скрыть маркеры чужих групп и отсекать далекие споты/зоны по дистанции. */
    _applyCategoryMarkerVisibility() {
      if (!this.markersGroup) return;
      const cat = this.filterCategory || 'all';
      const cam = this.camera || (this.game && this.game.camera);
      const camPos = cam ? cam.position : null;
      const isZonesMode = (this.editorMode === 'zones');
      const selectedObj = this.selectedObject;

      this.markersGroup.children.forEach(m => {
        if (!m.userData || !m.userData.markerType) {
          m.visible = true;
          return;
        }

        // Currently selected object marker is ALWAYS visible
        if (selectedObj && (selectedObj.mesh === m || (selectedObj.userData && selectedObj.userData.spotIdx != null && selectedObj.userData.spotIdx === m.userData.spotIdx))) {
          m.visible = true;
          return;
        }

        const mt = m.userData.markerType;
        const map = {
          player_spawn: 'player',
          spot: 'spot',
          npc: 'npc',
          hunt: 'hunt',
          site: 'site',
          light: 'light'
        };
        const group = map[mt] || mt;

        // In non-zones modes, hide mob spots by default unless filtered by 'spot' or 'zones'
        if (group === 'spot') {
          if (!isZonesMode && cat !== 'spot' && cat !== 'zones') {
            m.visible = false;
            return;
          }
          if (camPos) {
            const dx = m.position.x - camPos.x;
            const dz = m.position.z - camPos.z;
            const maxSpotDist = isZonesMode ? 1500.0 : 500.0;
            if (dx * dx + dz * dz > maxSpotDist * maxSpotDist) {
              m.visible = false;
              return;
            }
          }
        }

        if (group === 'hunt') {
          if (!isZonesMode && cat !== 'hunt' && cat !== 'zones') {
            m.visible = false;
            return;
          }
          if (camPos && !isZonesMode) {
            const dx = m.position.x - camPos.x;
            const dz = m.position.z - camPos.z;
            if (dx * dx + dz * dz > 3500.0 * 3500.0) {
              m.visible = false;
              return;
            }
          }
        }

        if (cat === 'all') {
          m.visible = true;
          return;
        }

        if (cat === 'zones' || cat === 'site') {
          m.visible = (group === 'hunt' || group === 'spot' || group === 'site');
        } else {
          m.visible = (group === cat);
        }
      });
    }

    update() {
      if (!this.enabled) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - (this._lastMarkerCullTime || 0) > 250) {
        this._lastMarkerCullTime = now;
        this._applyCategoryMarkerVisibility();
      }
      if (now - (this._lastOverlayUpdateTime || 0) > 100) {
        this._lastOverlayUpdateTime = now;
        this._updateViewportOverlayStats();
      }
    }

    _updateViewportOverlayStats() {
      const fpsEl = document.getElementById('ed-stat-fps');
      const camEl = document.getElementById('ed-stat-cam');
      const selEl = document.getElementById('ed-stat-sel');
      if (fpsEl && this.game) {
        const fps = Math.round(this.game.fps || 60);
        fpsEl.textContent = `FPS: ${fps}`;
      }
      if (camEl && this.game && this.game.camera) {
        const c = this.game.camera.position;
        camEl.textContent = `Cam: [${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)}]`;
      }
      if (selEl) {
        if (this.selectedObject) {
          const name = this.selectedObject.name || (this.selectedObject.userData && this.selectedObject.userData.name) || this.selectedObject.id || 'Объект';
          selEl.textContent = `Выделено: ${name}`;
        } else {
          selEl.textContent = 'Выделено: Нет';
        }
      }
    }

    populateObjectDropdown(category) {
      const cat = category || this.filterCategory || 'all';
      this.filterCategory = cat;
      const select = this.panel.querySelector('#ed-object-select');
      select.innerHTML = '<option value="">-- Кликните объект в 3D миру --</option>';
      // синхронизировать dropdown категории
      const catSel = this.panel.querySelector('#ed-category-select');
      if (catSel && catSel.value !== cat) catSel.value = cat;

      const WM = window.WorldMetrics;
      if (!WM) return;

      if (cat === 'all' || cat === 'player') {
        if (this.game.player) {
          const group = document.createElement('optgroup');
          group.label = '🏃 ПЕРСОНАЖ ИГРОКА';
          const opt = document.createElement('option');
          opt.value = 'player:main';
          opt.textContent = '[Player] Игрок (Персонаж)';
          group.appendChild(opt);
          select.appendChild(group);
        }
      }

      if (cat === 'all' || cat === 'npc') {
        const npcs = WM.buildCityNPCs().concat(WM.buildRegionNPCs());
        const group = document.createElement('optgroup');
        group.label = '👤 NPC И ИНСТРУКТОРЫ';
        npcs.forEach(n => {
          const opt = document.createElement('option');
          opt.value = 'npc:' + n.id;
          opt.textContent = `[NPC] ${n.name} (${n.id})`;
          group.appendChild(opt);
        });
        select.appendChild(group);
      }

      if (cat === 'all' || cat === 'mob') {
        const enemies = this.game.spawnManager && this.game.spawnManager.enemies ? this.game.spawnManager.enemies : [];
        if (enemies.length) {
          const group = document.createElement('optgroup');
          group.label = '👾 АКТИВНЫЕ МОНСТРЫ';
          enemies.forEach((e, idx) => {
            const opt = document.createElement('option');
            opt.value = 'mob:' + idx;
            opt.textContent = `[Mob] ${e.name} (Ур.${e.level})`;
            group.appendChild(opt);
          });
          select.appendChild(group);
        }
      }

      if (cat === 'all' || cat === 'spot') {
        const spots = WM.buildSpots();
        const group = document.createElement('optgroup');
        group.label = '🎯 СПОТЫ МОБОВ (СПАВНЫ)';
        spots.forEach((s) => {
          const spotIdx = (typeof s.idx === 'number') ? s.idx : -1;
          if (spotIdx < 0) return;
          const opt = document.createElement('option');
          opt.value = 'spot:' + spotIdx;
          opt.textContent = `[Spot #${spotIdx + 1}] ${s.mob} (${s.region})`;
          group.appendChild(opt);
        });
        select.appendChild(group);
      }

      if (cat === 'all' || cat === 'hunt' || cat === 'zones') {
        const hunts = (WM.buildHuntZones && WM.buildHuntZones()) || [];
        if (hunts.length) {
          const group = document.createElement('optgroup');
          group.label = '⚔️ ЗОНЫ ОХОТЫ';
          hunts.forEach((hz) => {
            const opt = document.createElement('option');
            opt.value = 'hunt:' + hz.id;
            const verts = (hz.shape === 'poly' && hz.polyWorld) ? (' · ' + hz.polyWorld.length + 'в') : '';
            if (hz.kind === 'territory') {
              opt.textContent = `[Terr] ${hz.name}${verts}`;
            } else {
              const l0 = (hz.lvl && hz.lvl[0] != null) ? hz.lvl[0] : '?';
              const l1 = (hz.lvl && hz.lvl[1] != null) ? hz.lvl[1] : '?';
              opt.textContent = `[Hunt] ${hz.name} (ур.${l0}-${l1})${verts}`;
            }
            group.appendChild(opt);
          });
          select.appendChild(group);
        }
      }

      if (cat === 'zones') {
        // spots also in zones workspace
        const spots = WM.buildSpots ? WM.buildSpots() : [];
        if (spots.length) {
          const group = document.createElement('optgroup');
          group.label = '🎯 СПОТЫ';
          spots.forEach((s) => {
            const spotIdx = (typeof s.idx === 'number') ? s.idx : -1;
            if (spotIdx < 0) return;
            const opt = document.createElement('option');
            opt.value = 'spot:' + spotIdx;
            opt.textContent = `[Spot #${spotIdx + 1}] ${s.mob}`;
            group.appendChild(opt);
          });
          select.appendChild(group);
        }
      }

      if (cat === 'all' || cat === 'site' || cat === 'zones') {
        const sites = (WM.listBuildSites && WM.listBuildSites()) || [];
        if (sites.length) {
          const group = document.createElement('optgroup');
          group.label = '📍 МЕТКИ ГЕОМЕТРИИ';
          sites.forEach((s) => {
            const opt = document.createElement('option');
            opt.value = 'site:' + s.id;
            const shape = s.kind === 'poly' ? ', пятно' : (s.kind === 'line' ? ', линия' : '');
            opt.textContent = `[Метка] ${s.name || s.id} (${s.type || 'custom'}${shape})`;
            group.appendChild(opt);
          });
          select.appendChild(group);
        }
      }

      if (cat === 'all' || cat === 'bsp') {
        const brushes = (window.BspBrushes && window.BspBrushes.getBrushes()) || (WM.BSP_BRUSHES || []);
        if (brushes.length) {
          const group = document.createElement('optgroup');
          group.label = '🧱 BSP-БРАШИ';
          brushes.forEach(b => {
            const opt = document.createElement('option');
            opt.value = 'bsp:' + b.id;
            const op = b.op === 'sub' ? 'SUB' : 'ADD';
            opt.textContent = `[BSP ${op}] ${b.name || b.id} (${b.shape || 'box'})`;
            group.appendChild(opt);
          });
          select.appendChild(group);
        }
      }

      if (cat === 'all' || cat === 'prop') {
        const props = WM.buildCustomProps();
        if (props.length) {
          const group = document.createElement('optgroup');
          group.label = '📦 3D-МОДЕЛИ И ПРОПЫ';
          props.forEach(p => {
            const opt = document.createElement('option');
            opt.value = 'prop:' + p.id;
            opt.textContent = `[Prop] ${p.name || p.id} (${p.meshType})`;
            group.appendChild(opt);
          });
          select.appendChild(group);
        }
      }

      if (cat === 'all' || cat === 'ground') {
        const marks = (WM.listGroundMarks && WM.listGroundMarks()) || [];
        if (marks.length) {
          const group = document.createElement('optgroup');
          group.label = '🌿 ЗЕМЛЯ (ДОРОГИ / ТРАВА / ПЛОЩАДИ)';
          marks.forEach((m) => {
            const opt = document.createElement('option');
            opt.value = 'ground:' + m.id;
            const lab = m.surface === 'grass' ? 'Трава' : (m.surface === 'plaza' ? 'Площадь' : 'Дорога');
            opt.textContent = `[Земля] ${lab} (${m.kind === 'line' ? 'линия' : 'пятно'} #${m.id})`;
            group.appendChild(opt);
          });
          select.appendChild(group);
        }
      }

      if (cat === 'all' || cat === 'light') {
        const group = document.createElement('optgroup');
        group.label = '💡 ИСТОЧНИКИ СВЕТА';
        const opt = document.createElement('option');
        opt.value = 'light:sun';
        opt.textContent = '[Light] Направленный свет (Солнце)';
        group.appendChild(opt);
        select.appendChild(group);
      }
      this._applyCategoryMarkerVisibility();
    }

    selectObjectById(val) {
      if (!val) {
        this.deselectObject();
        return;
      }

      const colon = val.indexOf(':');
      const type = colon >= 0 ? val.slice(0, colon) : val;
      const id = colon >= 0 ? val.slice(colon + 1) : '';
      // фильтр группы: нельзя выбрать чужой тип
      if (!this._typeMatchesCategory(type, this.filterCategory)) {
        if (this.game && this.game.addChatMessage) {
          this.game.addChatMessage('[Редактор] Объект вне активной группы «' + this.filterCategory + '»', 'system');
        }
        return;
      }
      const WM = window.WorldMetrics;
      if (!WM) return;

      if ((type === 'player' || type === 'player_spawn') && this.game.player && this.game.player.mesh) {
        this.selectPlayerSpawn();
      } else if (type === 'npc') {
        const n = WM.buildCityNPCs().concat(WM.buildRegionNPCs()).find(x => x.id === id);
        if (n) {
          let npcObj = this.game.npcManager ? this.game.npcManager.getNPCById(id) : null;
          let mesh = npcObj ? npcObj.mesh : this.markerMeshes.get('npc_' + id);
          const y = mesh ? mesh.position.y : ((window.Terrain ? window.Terrain.heightAt(n.position.x, n.position.z) : 0) + 2);
          this.selectObject({
            type: 'npc',
            id: n.id,
            name: n.name,
            targetData: n,
            mesh: mesh,
            position: { x: n.position.x, y: y, z: n.position.z },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 }
          });
        }
      } else if (type === 'mob') {
        const idx = parseInt(id);
        const enemies = this.game.spawnManager ? this.game.spawnManager.enemies : [];
        const e = enemies[idx];
        if (e && e.mesh) {
          this.selectDirectMesh(e.mesh, 'Монстр: ' + e.name);
        }
      } else if (type === 'spot') {
        const idx = parseInt(id, 10);
        const spots = WM.buildSpots();
        const s = spots.find(sp => sp.idx === idx) || null;
        const markerMesh = this.markerMeshes.get('spot_' + idx);
        if (s) {
          const gh = window.Terrain ? window.Terrain.heightAt(s.x, s.z) : 0;
          this.selectObject({
            type: 'spot',
            id: 'spot_' + idx,
            spotIdx: idx,
            name: `Спот ${s.mob} (#${idx + 1})`,
            targetData: s,
            mesh: markerMesh,
            baseRadius: s.r || 15,
            position: { x: s.x, y: gh + 0.6, z: s.z },
            rotation: { x: 0, y: 0, z: 0 },
            // scale 1 = текущий радиус; gizmo scale меняет множитель
            scale: { x: 1, y: 1, z: 1 }
          });
        }
      } else if (type === 'hunt') {
        this.selectHuntZone(id);
      } else if (type === 'site') {
        this.selectBuildSite(id);
        const s = ((WM.listBuildSites && WM.listBuildSites()) || []).find((x) => x.id === id);
        const markerMesh = this.markerMeshes.get('site_' + id);
        if (s) {
          const gh = window.Terrain ? window.Terrain.heightAt(s.x, s.z) : (s.y || 0);
          this.selectObject({
            type: 'site',
            id: s.id,
            name: s.name || s.id,
            targetData: s,
            mesh: markerMesh,
            position: { x: s.x, y: gh + 0.2, z: s.z },
            rotation: { x: 0, y: (s.kind === 'pin' ? (s.yaw || 0) : 0), z: 0 },
            scale: { x: 1, y: 1, z: 1 }
          });
        }
      } else if (type === 'bsp') {
        this.selectBspBrush(id);
      } else if (type === 'prop') {
        const p = WM.buildCustomProps().find(x => x.id === id);
        if (p) {
          const mesh = this.customPropMeshes.get(p.id);
          this.selectObject({
            type: 'prop',
            id: p.id,
            name: p.name || p.id,
            targetData: p,
            mesh: mesh,
            position: { x: p.position.x, y: p.position.y || 0, z: p.position.z },
            rotation: { x: p.rotation ? p.rotation.x || 0 : 0, y: p.rotation ? p.rotation.y || 0 : 0, z: p.rotation ? p.rotation.z || 0 : 0 },
            scale: { x: p.scale ? p.scale.x || 1 : 1, y: p.scale ? p.scale.y || 1 : 1, z: p.scale ? p.scale.z || 1 : 1 }
          });
        }
      } else if (type === 'ground') {
        this.selectGroundMark(id);
      } else if (type === 'light') {
        const sun = this.game.sun;
        const marker = this.markerMeshes.get('light_sun');
        if (sun) {
          this.selectObject({
            type: 'light',
            id: 'sun',
            name: 'Солнечный свет',
            targetData: sun,
            mesh: marker,
            position: { x: sun.position.x, y: sun.position.y, z: sun.position.z },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 }
          });
        }
      }
    }

    selectGroundMark(id) {
      const WM = window.WorldMetrics;
      const list = (WM && WM.listGroundMarks) ? WM.listGroundMarks() : [];
      const m = list.find(x => String(x.id) === String(id));
      if (!m) return;

      const vg = window.VillageGround && window.VillageGround.root;
      let mesh = null;
      if (vg) {
        mesh = vg.getObjectByName('ground_' + m.id) || vg;
      }

      const pts = m._world || (m.poly ? m.poly.map(p => ({
        x: p[0] * WM.W + WM.MIN_X,
        z: p[1] * WM.H + WM.MIN_Z
      })) : []);

      let cx = 0, cz = 0;
      if (pts.length) {
        pts.forEach(p => { cx += p.x; cz += p.z; });
        cx /= pts.length;
        cz /= pts.length;
      }
      const cy = (window.Terrain && window.Terrain.heightAt) ? window.Terrain.heightAt(cx, cz) : 0;

      const lab = m.surface === 'grass' ? 'Трава' : (m.surface === 'plaza' ? 'Площадь' : 'Дорога');
      this.selectObject({
        type: 'ground',
        id: m.id,
        name: lab + ' (' + (m.kind === 'line' ? 'дорога' : 'пятно') + ' #' + m.id + ')',
        mesh: mesh,
        targetData: m,
        position: { x: cx, y: cy, z: cz },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
      });
    }

    selectPlayerSpawn() {
      const pl = this.game && this.game.player;
      if (!pl || !pl.mesh) return;
      const mesh = pl.mesh;
      const marker = this.markerMeshes.get('player_spawn');
      const pos = mesh.position;
      this.selectObject({
        type: 'player',
        id: 'player_spawn',
        name: 'Спавн игрока / Персонаж',
        mesh: mesh,
        marker: marker,
        targetData: pl,
        editorKey: 'player_spawn',
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z }
      });
    }

    // ВЫБОР ЛЮБОЙ ПРЯМОЙ 3D МОДЕЛИ ИЛИ ПЕРСОНАЖА ИЗ СЦЕНЫ
    selectDirectMesh(mesh, customName) {
      if (!mesh) return;

      // Клик по оружию в руке персонажа
      let wpnNode = mesh;
      let wpnId = null;
      while (wpnNode) {
        if (wpnNode.userData && wpnNode.userData.weaponId) {
          wpnId = wpnNode.userData.weaponId;
          break;
        }
        if (wpnNode.name && wpnNode.name.startsWith('char_weapon_')) {
          wpnId = wpnNode.name.replace('char_weapon_', '');
          break;
        }
        wpnNode = wpnNode.parent;
      }
      if (wpnId) {
        this.selectPlayerSpawn();
        const wBtn = document.querySelector('#ed-mode-btn-weapon');
        if (wBtn) wBtn.click();
        const sel = this.panel && this.panel.querySelector('#ed-wpn-id');
        if (sel && wpnId) {
          sel.value = wpnId;
          this._loadWeaponGripToUI();
        }
        if (typeof this.showToast === 'function') {
          this.showToast('Хват оружия в руке: ' + this._weaponDisplayName(wpnId));
        }
        return;
      }

      // Клик по спрайту или любой части 3D модели игрока → редактируем спавн
      if (this.game && this.game.player && this.game.player.mesh) {
        let isPlayerPart = (mesh === this.game.player.mesh || mesh === this.game.player.youMarker || mesh === this.game.player.shadow);
        if (!isPlayerPart) {
          let p = mesh.parent;
          while (p) {
            if (p === this.game.player.mesh) { isPlayerPart = true; break; }
            p = p.parent;
          }
        }
        if (isPlayerPart) {
          this.selectPlayerSpawn();
          return;
        }
      }
      if (mesh.userData && mesh.userData.markerType === 'player_spawn') {
        this.selectPlayerSpawn();
        return;
      }
      if (mesh.userData && mesh.userData.markerType === 'spot') {
        this.selectObjectById('spot:' + mesh.userData.spotIdx);
        return;
      }
      if (mesh.userData && mesh.userData.markerType === 'hunt') {
        this.selectObjectById('hunt:' + mesh.userData.huntId);
        return;
      }
      if (mesh.userData && mesh.userData.markerType === 'npc') {
        this.selectObjectById('npc:' + mesh.userData.npcId);
        return;
      }

      if (!mesh.userData) mesh.userData = {};
      // Всегда пересчитываем finger (новый формат без Mesh#N)
      mesh.userData.finger = this.computeMeshFingerprint(mesh);
      mesh.userData.geoVerts = this.getGeoVerts(mesh);
      if (!mesh.userData.editorBind) {
        mesh.userData.editorBind = {
          x: mesh.position.x, y: mesh.position.y, z: mesh.position.z,
          sx: mesh.scale.x, sy: mesh.scale.y, sz: mesh.scale.z
        };
      }
      const stableId = this.getStableMeshId(mesh);
      mesh.userData.propId = stableId;

      const pos = new THREE.Vector3();
      pos.copy(mesh.position);
      const rot = mesh.rotation;
      const scl = mesh.scale;
      const name = customName
        || mesh.userData.editorLabel
        || mesh.name
        || (mesh.userData && mesh.userData.name)
        || ('3D Модель (' + mesh.type + (mesh.userData.geoVerts ? ', v' + mesh.userData.geoVerts : '') + ')');

      this.selectObject({
        type: 'direct_mesh',
        id: stableId,
        name: name,
        mesh: mesh,
        targetData: mesh,
        finger: mesh.userData.finger,
        editorKey: mesh.userData.editorKey || null,
        geoVerts: mesh.userData.geoVerts || 0,
        bind: mesh.userData.editorBind || null,
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { x: rot.x, y: rot.y, z: rot.z },
        scale: { x: scl.x, y: scl.y, z: scl.z }
      });
    }

    _updateCollisionHelper(o) {
      if (this._colHelperMesh) {
        this.scene.remove(this._colHelperMesh);
        this._colHelperMesh.traverse(c => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) c.material.dispose();
        });
        this._colHelperMesh = null;
      }

      if (!this.enabled || !o) return;
      const isProp = (o.type === 'prop' || o.type === 'direct_mesh');
      if (!isProp) return;

      const p = (o.targetData && typeof o.targetData === 'object') ? o.targetData : o;
      if (p.collision === false || p.hasCollision === false) return;
      if (p.meshType === 'collision_box') return; // Standalone barrier already has its own visual representation

      const bounds = (window.PropsCollision && window.PropsCollision.getPropBounds) ? window.PropsCollision.getPropBounds(p) : null;
      if (!bounds) return;

      const fullW = Math.max(0.2, bounds.halfX * 2);
      const fullH = Math.max(0.2, bounds.height);
      const fullD = Math.max(0.2, bounds.halfZ * 2);

      const group = new THREE.Group();
      group.name = '_editorColHelper';

      let geo;
      if (bounds.shape === 'cylinder') {
        geo = new THREE.CylinderGeometry(bounds.halfX, bounds.halfX, fullH, 18);
      } else {
        geo = new THREE.BoxGeometry(fullW, fullH, fullD);
      }

      const colMat = new THREE.MeshBasicMaterial({
        color: 0x33ff66,
        transparent: true,
        opacity: 0.2,
        wireframe: false,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geo, colMat);

      const edges = new THREE.EdgesGeometry(geo);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x55ff88, linewidth: 2 });
      const wire = new THREE.LineSegments(edges, lineMat);

      group.add(mesh, wire);
      group.position.set(bounds.px, bounds.py + (fullH / 2), bounds.pz);
      group.rotation.y = bounds.rotY || 0;

      this.scene.add(group);
      this._colHelperMesh = group;
    }

    selectObject(obj) {
      this.selectedObject = obj;
      if (!this.selectedObject) {
        this.deselectObject();
        return;
      }

      // In zone Edit Mode — no object gizmo (only vertex handles)
      const hideGizmo = this.zoneEditMode && obj.type === 'hunt' && obj.id === this._zoneEditId;
      this.gizmoGroup.visible = this.enabled && !hideGizmo;
      this.gizmoGroup.position.set(obj.position.x, obj.position.y, obj.position.z);
      this.gizmoGroup.rotation.set(obj.rotation.x || 0, obj.rotation.y || 0, obj.rotation.z || 0);

      if (obj.mesh && !hideGizmo) {
        const bbox = new THREE.Box3().setFromObject(obj.mesh);
        if (!bbox.isEmpty() && isFinite(bbox.min.x)) {
          const center = new THREE.Vector3();
          const size = new THREE.Vector3();
          bbox.getCenter(center);
          bbox.getSize(size);
          this.selectionBox.position.copy(center);
          this.selectionBox.rotation.set(0, 0, 0);
          this.selectionBox.scale.set(Math.max(0.1, size.x), Math.max(0.1, size.y), Math.max(0.1, size.z));
          this.selectionBox.visible = this.enabled;
        } else {
          this.selectionBox.visible = false;
        }
      } else if (!hideGizmo && (obj.type === 'prop' || obj.type === 'foliage') && obj.position) {
        const p = (obj.targetData && typeof obj.targetData === 'object') ? obj.targetData : obj;
        const bounds = (window.PropsCollision && window.PropsCollision.getPropBounds) ? window.PropsCollision.getPropBounds(p) : null;
        if (bounds) {
          const fullW = Math.max(0.4, bounds.halfX * 2);
          const fullH = Math.max(0.6, bounds.height);
          const fullD = Math.max(0.4, bounds.halfZ * 2);
          this.selectionBox.position.set(bounds.px, bounds.py + (fullH / 2), bounds.pz);
          this.selectionBox.rotation.set(0, bounds.rotY || 0, 0);
          this.selectionBox.scale.set(fullW, fullH, fullD);
          this.selectionBox.visible = this.enabled;
        } else {
          const sc = p.scale || { x: 1, y: 1, z: 1 };
          const sx = typeof sc === 'number' ? sc : (sc.x || 1);
          const sy = typeof sc === 'number' ? sc : (sc.y || 1);
          const sz = typeof sc === 'number' ? sc : (sc.z || 1);
          this.selectionBox.position.set(obj.position.x, (obj.position.y || 0) + sy * 1.5, obj.position.z);
          this.selectionBox.rotation.set(0, obj.rotation ? (obj.rotation.y || 0) : 0, 0);
          this.selectionBox.scale.set(Math.max(1.0, sx * 2.0), Math.max(1.5, sy * 3.0), Math.max(1.0, sz * 2.0));
          this.selectionBox.visible = this.enabled;
        }
      } else {
        this.selectionBox.visible = false;
      }

      this._updateCollisionHelper(obj);
      this.updateInspectorFields();
      this._updateDeleteButton();

      const actorNameEl = document.getElementById('ed-inspector-actor-name');
      if (actorNameEl) {
        actorNameEl.textContent = (obj.name || (obj.userData && obj.userData.name) || obj.id || 'Объект') + (obj.type ? ` (${obj.type})` : '');
      }
      if (typeof this.refreshOutliner === 'function') {
        try { this.refreshOutliner(); } catch (e) {}
      }
    }

    deselectObject() {
      if (this.zoneEditMode) this.exitZoneEditMode(true);
      this._updateCollisionHelper(null);
      this.selectedObject = null;
      this.gizmoGroup.visible = false;
      this.selectionBox.visible = false;
      this._updateDeleteButton();

      const infoContainer = this.panel.querySelector('#ed-selected-info');
      infoContainer.innerHTML = '<div style="color: #888; text-align: center;">Кликните абсолютно ЛЮБУЮ 3D модель или персонажа в мире</div>';

      const actorNameEl = document.getElementById('ed-inspector-actor-name');
      if (actorNameEl) {
        actorNameEl.textContent = 'Объект не выбран';
      }
      if (typeof this.refreshOutliner === 'function') {
        try { this.refreshOutliner(); } catch (e) {}
      }
    }

    // ============================================================
    //  ХВАТ ОРУЖИЯ (RightHand) — F2 live tune + mouse drag
    // ============================================================
    _getCharModel() {
      return window.CharModel || null;
    }

    /** RU labels for known weapons (fallback = id). */
    _weaponDisplayName(id) {
      const map = {
        apprentice_wand: 'Ударник Ученика',
        willow_coil: 'Пружина Астарда',
        cedar_manifold: 'Труболом Междуречья',
        mage_staff: 'Калибратор Цеха',
        crucifix_blood: 'X-Узел Давления',
        voodoo_doll: 'Кукла-Сбой',
        mace_prayer: 'Булава-Манометр',
        magic_mace: 'Импульсная Булава',
        demon_fangs: 'Клыки Сбоя',
        tears_fairy: 'Слёзы Искры',
        bone_resonator: 'Костяной Дробитель',
        life_manifold: 'Ульевой Молот',
        ghost_manifold: 'Глефа Тишины',
        atuba_mace: 'Булава Атубы',
        demon_staff: 'Сверхпресс',
        sentinel_staff: 'Молот Оплота',
        goat_staff: 'Вилочный Крушитель'
      };
      try {
        const lr = window.LOOT_RULES || window.LootRules;
        const items = lr && (lr.ITEMS || lr.items);
        if (items && items[id] && items[id].name) return items[id].name;
      } catch (e) { /* ignore */ }
      return map[id] || id;
    }

    _refreshWeaponSelectList() {
      const sel = this.panel && this.panel.querySelector('#ed-wpn-id');
      if (!sel) return;
      const CM = this._getCharModel();
      const prev = sel.value;
      const ids = (CM && CM.WEAPON_VISUALS) ? Object.keys(CM.WEAPON_VISUALS) : [];
      if (!ids.length) {
        sel.innerHTML = '<option value="">— нет visuals —</option>';
        this._renderWeaponDbList([]);
        return;
      }
      sel.innerHTML = ids.map((id) => {
        const label = this._weaponDisplayName(id) + ' · ' + id;
        return '<option value="' + id + '">' + label + '</option>';
      }).join('');
      // Prefer previous, else equipped, else first
      let pick = prev;
      if (!pick || ids.indexOf(pick) < 0) {
        const pl = this.game && this.game.player;
        if (pl && typeof pl._equippedWeaponVisualId === 'function') {
          const eq = pl._equippedWeaponVisualId();
          if (eq && ids.indexOf(eq) >= 0) pick = eq;
        }
      }
      if (!pick || ids.indexOf(pick) < 0) pick = ids[0];
      sel.value = pick;
      this._renderWeaponDbList(ids, pick);
    }

    /** Visual DB list: all registered weapons (hand status). Unequip does not remove. */
    _renderWeaponDbList(ids, selectedId) {
      const box = this.panel && this.panel.querySelector('#ed-wpn-db-list');
      if (!box) return;
      if (!ids || !ids.length) {
        box.innerHTML = '<div style="padding:6px;color:#776;">Каталог пуст</div>';
        return;
      }
      const CM = this._getCharModel();
      const onHand = this._weaponOnHandId();
      box.innerHTML = ids.map((id) => {
        const vis = CM && CM.getWeaponVisual ? CM.getWeaponVisual(id) : null;
        const model = (vis && vis.model) || '—';
        const hand = onHand === id;
        const sel = selectedId === id;
        const bg = sel ? 'rgba(80,50,20,0.55)' : 'transparent';
        const mark = hand ? ' <span style="color:#8f8;">[в руке]</span>' : '';
        return (
          '<div class="ed-wpn-db-row" data-id="' + id + '" style="padding:4px 6px;cursor:pointer;border-bottom:1px solid #332208;background:' + bg + ';">' +
          '<span style="color:#ffcc88;">' + this._weaponDisplayName(id) + '</span>' + mark +
          '<div style="color:#778;font-size:9px;">' + id + ' · ' + model + '</div></div>'
        );
      }).join('');
      box.querySelectorAll('.ed-wpn-db-row').forEach((row) => {
        row.onclick = () => {
          const id = row.getAttribute('data-id');
          const s = this.panel.querySelector('#ed-wpn-id');
          if (s) s.value = id;
          this._loadWeaponGripToUI();
          this._renderWeaponDbList(ids, id);
          this._setWeaponGripStatus('Выбрано · ' + id + ' (Надеть / Дроп)');
        };
      });
    }

    _weaponOnHandId() {
      const pl = this.game && this.game.player;
      if (!pl || !pl._charModel) return null;
      const body = this._playerBodyRoot();
      if (!body) return null;
      let found = null;
      body.traverse((o) => {
        if (found) return;
        if (o.name && String(o.name).indexOf('char_weapon_') === 0) {
          found = o.userData && o.userData.weaponId
            ? o.userData.weaponId
            : String(o.name).replace(/^char_weapon_/, '');
        }
      });
      return found;
    }

    _unequipPlayerWeaponVisual() {
      const pl = this.game && this.game.player;
      if (!pl || !pl._charModel || typeof pl._charModel.setWeapon !== 'function') {
        this._setWeaponGripStatus('Нет 3D модели игрока');
        return;
      }
      // Снять mesh с рук — запись в WEAPON_VISUALS / grip LS остаётся
      pl._charModel.setWeapon(null).then(() => {
        this._setWeaponGripStatus('Снято с рук · база сохранена');
        this._refreshWeaponSelectList();
      }).catch((e) => {
        this._setWeaponGripStatus('Снять fail: ' + (e && e.message));
      });
    }

    /** Test drop selected weapon at player feet (server ground loot). */
    _dropTestWeaponLoot() {
      const id = this._currentWeaponGripId();
      if (!id) {
        this._setWeaponGripStatus('Выбери оружие в базе');
        return;
      }
      const net = this.game && this.game.net;
      if (net && typeof net.intentDebugDrop === 'function' && (net.status === 'online' || net.connected)) {
        net.intentDebugDrop(id, 1);
        this._setWeaponGripStatus('Дроп · ' + id + ' (у ног, подбери)');
        if (this.game.addChatMessage) {
          this.game.addChatMessage('[Редактор] Тест-дроп: ' + this._weaponDisplayName(id) + ' (' + id + ')', 'system');
        }
        return;
      }
      // Offline fallback: local loot manager spawn if available
      const lm = this.game && this.game.lootManager;
      const pl = this.game && this.game.player;
      if (lm && typeof lm.spawnLocalTestDrop === 'function' && pl && pl.mesh) {
        lm.spawnLocalTestDrop(id, pl.mesh.position);
        this._setWeaponGripStatus('Локальный дроп · ' + id);
        return;
      }
      this._setWeaponGripStatus('Нет сети / нет lootManager — offline drop недоступен');
    }

    _bindWeaponGripControls() {
      const box = this.panel && this.panel.querySelector('#ed-weapon-grip-box');
      if (!box) return;

      this._weaponGripLive = true;
      this._weaponMouseMode = null; // null | 'move' | 'rotate'
      this._weaponMouseDrag = null;

      this._refreshWeaponSelectList();

      const liveBtn = this.panel.querySelector('#ed-wpn-live');
      if (liveBtn) {
        liveBtn.onclick = () => {
          this._weaponGripLive = !this._weaponGripLive;
          liveBtn.textContent = this._weaponGripLive ? '⚡ Live ON' : '⚡ Live OFF';
          liveBtn.style.background = this._weaponGripLive ? '#223344' : '#333';
          liveBtn.style.borderColor = this._weaponGripLive ? '#4488aa' : '#555';
        };
      }

      const onChange = () => {
        if (this._weaponGripLive) this._applyWeaponGripFromUI(true);
      };
      ['ed-wpn-px', 'ed-wpn-py', 'ed-wpn-pz', 'ed-wpn-rx', 'ed-wpn-ry', 'ed-wpn-rz'].forEach((id) => {
        const el = this.panel.querySelector('#' + id);
        if (el) {
          el.addEventListener('input', onChange);
          el.addEventListener('change', onChange);
        }
      });
      const len = this.panel.querySelector('#ed-wpn-len');
      if (len) {
        len.addEventListener('input', () => {
          const lab = this.panel.querySelector('#ed-wpn-len-val');
          if (lab) lab.textContent = Number(len.value).toFixed(2);
          onChange();
        });
      }

      const sel = this.panel.querySelector('#ed-wpn-id');
      if (sel) {
        sel.addEventListener('change', () => {
          this._loadWeaponGripToUI();
          // Выбор оружия = сразу надеть mesh на игрока
          this._reequipPlayerWeapon(this._currentWeaponGripId(), true);
        });
      }

      const equipBtn = this.panel.querySelector('#ed-wpn-equip');
      if (equipBtn) {
        equipBtn.onclick = () => {
          this._applyWeaponGripFromUI(false);
          this._reequipPlayerWeapon(this._currentWeaponGripId(), true);
        };
      }
      const unequipBtn = this.panel.querySelector('#ed-wpn-unequip');
      if (unequipBtn) unequipBtn.onclick = () => this._unequipPlayerWeaponVisual();
      const dropBtn = this.panel.querySelector('#ed-wpn-drop');
      if (dropBtn) dropBtn.onclick = () => this._dropTestWeaponLoot();

      const moveBtn = this.panel.querySelector('#ed-wpn-mouse-move');
      const rotBtn = this.panel.querySelector('#ed-wpn-mouse-rot');
      if (moveBtn) moveBtn.onclick = () => this._setWeaponMouseMode(this._weaponMouseMode === 'move' ? null : 'move');
      if (rotBtn) rotBtn.onclick = () => this._setWeaponMouseMode(this._weaponMouseMode === 'rotate' ? null : 'rotate');

      const applyBtn = this.panel.querySelector('#ed-wpn-apply');
      if (applyBtn) {
        applyBtn.onclick = () => {
          this._applyWeaponGripFromUI(true);
          try { this.saveToLocalStorage(); } catch (e) { /* ignore */ }
          this._setWeaponGripStatus('Применено и сохранено · ' + this._currentWeaponGripId());
        };
      }

      const resetBtn = this.panel.querySelector('#ed-wpn-reset');
      if (resetBtn) {
        resetBtn.onclick = () => {
          const CM2 = this._getCharModel();
          const id = this._currentWeaponGripId();
          if (CM2 && CM2.clearWeaponGripOverride) CM2.clearWeaponGripOverride(id);
          this._loadWeaponGripToUI();
          this._applyWeaponGripFromUI(true);
          this._setWeaponGripStatus('Сброс к defaults · ' + id);
        };
      }

      const copyBtn = this.panel.querySelector('#ed-wpn-copy');
      if (copyBtn) {
        copyBtn.onclick = () => {
          const CM2 = this._getCharModel();
          const id = this._currentWeaponGripId();
          if (!CM2 || !CM2.exportWeaponGripSnippet) return;
          this._applyWeaponGripFromUI(false);
          const snip = CM2.exportWeaponGripSnippet(id);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(snip).then(() => {
              this._setWeaponGripStatus('JS скопирован в буфер');
            }).catch(() => {
              if (window.GameDialog && window.GameDialog.alert) {
                window.GameDialog.alert(snip, { title: 'JS grip (скопируй вручную)' });
              }
            });
          } else if (window.GameDialog && window.GameDialog.alert) {
            window.GameDialog.alert(snip, { title: 'JS grip (скопируй вручную)' });
          }
        };
      }

      const reBtn = this.panel.querySelector('#ed-wpn-reequip');
      if (reBtn) {
        reBtn.onclick = () => {
          this._applyWeaponGripFromUI(false);
          this._reequipPlayerWeapon(this._currentWeaponGripId(), true);
        };
      }

      // Wheel: length when mouse mode active
      if (!this._weaponWheelBound) {
        this._weaponWheelBound = true;
        window.addEventListener('wheel', (e) => {
          if (!this.enabled || !this._weaponMouseMode) return;
          if (e.target && e.target.closest && e.target.closest(
            '#editor-left-dock, #editor-right-dock, #editor-bottom-dock, #editor-top-toolbar, ' +
            '#editor-inspector-panel, .ed-floating-window, .ed-dock-panel, .ed-panel-body, .ed-cb-body'
          )) return;
          e.preventDefault();
          const lenEl = this.panel && this.panel.querySelector('#ed-wpn-len');
          if (!lenEl) return;
          const step = e.deltaY > 0 ? -0.02 : 0.02;
          const next = Math.max(0.15, Math.min(2.0, Number(lenEl.value) + step));
          lenEl.value = String(next.toFixed(2));
          const lab = this.panel.querySelector('#ed-wpn-len-val');
          if (lab) lab.textContent = next.toFixed(2);
          this._applyWeaponGripFromUI(true);
        }, { passive: false });
      }

      this._loadWeaponGripToUI();
    }

    _setWeaponMouseMode(mode) {
      this._weaponMouseMode = mode;
      this._weaponMouseDrag = null;
      const moveBtn = this.panel && this.panel.querySelector('#ed-wpn-mouse-move');
      const rotBtn = this.panel && this.panel.querySelector('#ed-wpn-mouse-rot');
      const hint = this.panel && this.panel.querySelector('#ed-wpn-mouse-hint');
      if (moveBtn) {
        const on = mode === 'move';
        moveBtn.style.background = on ? '#225533' : '#222';
        moveBtn.style.borderColor = on ? '#66aa44' : '#555';
        moveBtn.style.color = on ? '#ccffaa' : '#aaffcc';
      }
      if (rotBtn) {
        const on = mode === 'rotate';
        rotBtn.style.background = on ? '#553322' : '#222';
        rotBtn.style.borderColor = on ? '#aa7744' : '#555';
        rotBtn.style.color = on ? '#ffddaa' : '#ffddaa';
      }
      if (hint) {
        if (!mode) {
          hint.style.display = 'none';
        } else {
          hint.style.display = 'block';
          hint.textContent = mode === 'move'
            ? '🖱 Сдвиг: ЛКМ-drag · Shift = вверх/вниз · Колесо = длина · Esc/кнопка = выкл'
            : '🔄 Поворот: ЛКМ-drag (X/Y°) · Shift = ось Z · Колесо = длина · Esc/кнопка = выкл';
        }
      }
      this._setWeaponGripStatus(mode
        ? ('Мышь: ' + (mode === 'move' ? 'сдвиг' : 'поворот') + ' · ' + this._currentWeaponGripId())
        : 'Мышь: выкл');
    }

    _currentWeaponGripId() {
      const sel = this.panel && this.panel.querySelector('#ed-wpn-id');
      return (sel && sel.value) || '';
    }

    _setWeaponGripStatus(msg) {
      const el = this.panel && this.panel.querySelector('#ed-wpn-status');
      if (el) el.textContent = msg || '—';
    }

    _writeWeaponGripToUI(grip) {
      if (!grip) return;
      const set = (qid, v) => {
        const el = this.panel.querySelector(qid);
        if (el) el.value = String(v);
      };
      if (grip.pos) {
        set('#ed-wpn-px', Number(grip.pos[0] || 0).toFixed(3));
        set('#ed-wpn-py', Number(grip.pos[1] || 0).toFixed(3));
        set('#ed-wpn-pz', Number(grip.pos[2] || 0).toFixed(3));
      }
      if (grip.rot) {
        const toDeg = (r) => ((r || 0) * 180 / Math.PI).toFixed(1);
        set('#ed-wpn-rx', toDeg(grip.rot[0]));
        set('#ed-wpn-ry', toDeg(grip.rot[1]));
        set('#ed-wpn-rz', toDeg(grip.rot[2]));
      }
      if (grip.worldLen != null) {
        set('#ed-wpn-len', grip.worldLen);
        const lab = this.panel.querySelector('#ed-wpn-len-val');
        if (lab) lab.textContent = Number(grip.worldLen).toFixed(2);
      }
    }

    _loadWeaponGripToUI() {
      const CM = this._getCharModel();
      if (!CM || !CM.getWeaponVisual) return;
      const id = this._currentWeaponGripId();
      if (!id) return;
      const vis = CM.getWeaponVisual(id);
      if (!vis) return;
      this._writeWeaponGripToUI(vis);
    }

    _readWeaponGripFromUI() {
      const num = (id, def) => {
        const el = this.panel.querySelector(id);
        if (!el || el.value === '') return def;
        const v = parseFloat(el.value);
        return isFinite(v) ? v : def;
      };
      const toRad = (d) => (d * Math.PI) / 180;
      return {
        pos: [num('#ed-wpn-px', 0), num('#ed-wpn-py', 0), num('#ed-wpn-pz', 0)],
        rot: [toRad(num('#ed-wpn-rx', 0)), toRad(num('#ed-wpn-ry', 0)), toRad(num('#ed-wpn-rz', 0))],
        worldLen: num('#ed-wpn-len', 0.55)
      };
    }

    _applyWeaponGripFromUI(applyLive) {
      const CM = this._getCharModel();
      if (!CM || !CM.setWeaponGripOverride) {
        this._setWeaponGripStatus('CharModel не загружен');
        return;
      }
      const id = this._currentWeaponGripId();
      if (!id) {
        this._setWeaponGripStatus('Выбери оружие в списке');
        return;
      }
      const grip = this._readWeaponGripFromUI();
      // Writes ps_weapon_grips + project_steam_editor_overrides.weaponGrips + bakes catalog
      CM.setWeaponGripOverride(id, grip);

      let ok = false;
      if (applyLive !== false && CM.applyWeaponGripLive) {
        const body = this._playerBodyRoot();
        if (body) ok = CM.applyWeaponGripLive(body, id);
      }
      if (!ok && applyLive !== false) {
        this._reequipPlayerWeapon(id, true);
        ok = true;
      }
      this._setWeaponGripStatus(
        (ok ? 'OK · saved · ' : 'saved · ') + id +
        ' pos[' + grip.pos.map((v) => v.toFixed(2)).join(',') + ']' +
        ' len ' + grip.worldLen.toFixed(2) + 'm'
      );
    }

    _playerBodyRoot() {
      const pl = this.game && this.game.player;
      if (!pl || !pl._charModel) return null;
      return pl._charModel.meshRaw || pl._charModel.root || null;
    }

    _findWeaponHolder(weaponId) {
      const body = this._playerBodyRoot();
      if (!body || !weaponId) return null;
      let holder = null;
      body.traverse((o) => {
        if (holder) return;
        if (o.name === 'char_weapon_' + weaponId) holder = o;
      });
      return holder;
    }

    /**
     * @param {string} [forceId]
     * @param {boolean} [useSelected] if true — always use forceId/dropdown, ignore equipped
     */
    _reequipPlayerWeapon(forceId, useSelected) {
      const pl = this.game && this.game.player;
      if (!pl || !pl._charModel || typeof pl._charModel.setWeapon !== 'function') {
        this._setWeaponGripStatus('Нет 3D модели игрока');
        return Promise.resolve(null);
      }
      let id = forceId || this._currentWeaponGripId();
      if (!useSelected && !forceId && typeof pl._equippedWeaponVisualId === 'function') {
        const eq = pl._equippedWeaponVisualId();
        if (eq) id = eq;
      }
      if (!id) {
        this._setWeaponGripStatus('Нет id оружия');
        return Promise.resolve(null);
      }
      // Sync select UI
      const sel = this.panel && this.panel.querySelector('#ed-wpn-id');
      if (sel && sel.value !== id) {
        const opt = Array.from(sel.options).find((o) => o.value === id);
        if (opt) sel.value = id;
      }
      return pl._charModel.setWeapon(null).then(() => {
        return pl._charModel.setWeapon(id);
      }).then(() => {
        this._loadWeaponGripToUI();
        this._refreshWeaponSelectList();
        this._setWeaponGripStatus('Надето · ' + id + ' · ' + this._weaponDisplayName(id));
        return id;
      }).catch((e) => {
        this._setWeaponGripStatus('Re-equip fail: ' + (e && e.message));
        return null;
      });
    }

    /** Start mouse drag for weapon grip (called from onMouseDown). */
    _beginWeaponMouseDrag(e) {
      if (!this._weaponMouseMode || !this.enabled) return false;
      const id = this._currentWeaponGripId();
      if (!id) {
        this._setWeaponGripStatus('Сначала выбери оружие');
        return true;
      }
      // Ensure mesh is on hand
      if (!this._findWeaponHolder(id)) {
        this._reequipPlayerWeapon(id, true);
      }
      this.pushHistory('хват оружия: ' + id);
      const grip = this._readWeaponGripFromUI();
      this._weaponMouseDrag = {
        mode: this._weaponMouseMode,
        id: id,
        startX: e.clientX,
        startY: e.clientY,
        startPos: grip.pos.slice(),
        startRot: grip.rot.slice(),
        startLen: grip.worldLen,
        shift: !!e.shiftKey
      };
      e.preventDefault();
      e.stopPropagation();
      return true;
    }

    /** Update weapon grip while dragging mouse. */
    _updateWeaponMouseDrag(e) {
      const d = this._weaponMouseDrag;
      if (!d) return false;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const shift = e.shiftKey || d.shift;

      if (d.mode === 'move') {
        // Screen-space → bone-local via camera axes projected into parent (hand) space
        const holder = this._findWeaponHolder(d.id);
        const parent = holder && holder.parent;
        const cam = this.camera;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).normalize();
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).normalize();
        // Sensitivity scales with weapon length
        const sens = 0.0015 * Math.max(0.4, d.startLen || 0.55);
        let worldDelta;
        if (shift) {
          worldDelta = up.clone().multiplyScalar(-dy * sens);
        } else {
          worldDelta = right.clone().multiplyScalar(dx * sens).add(up.clone().multiplyScalar(-dy * sens));
        }
        let localDelta = worldDelta.clone();
        if (parent && parent.matrixWorld) {
          const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
          localDelta.transformDirection(inv);
          // preserve magnitude after direction transform
          const mag = worldDelta.length();
          localDelta.normalize().multiplyScalar(mag);
        }
        const pos = [
          d.startPos[0] + localDelta.x,
          d.startPos[1] + localDelta.y,
          d.startPos[2] + localDelta.z
        ];
        this._writeWeaponGripToUI({ pos: pos, rot: d.startRot, worldLen: d.startLen });
        this._applyWeaponGripFromUI(true);
      } else if (d.mode === 'rotate') {
        const degPerPx = 0.35;
        const toRad = (deg) => (deg * Math.PI) / 180;
        let rx = d.startRot[0];
        let ry = d.startRot[1];
        let rz = d.startRot[2];
        if (shift) {
          rz = d.startRot[2] + toRad(dx * degPerPx);
        } else {
          ry = d.startRot[1] + toRad(dx * degPerPx);
          rx = d.startRot[0] + toRad(dy * degPerPx);
        }
        this._writeWeaponGripToUI({ pos: d.startPos, rot: [rx, ry, rz], worldLen: d.startLen });
        this._applyWeaponGripFromUI(true);
      }
      return true;
    }

    _endWeaponMouseDrag() {
      if (!this._weaponMouseDrag) return false;
      const id = this._weaponMouseDrag.id;
      this._weaponMouseDrag = null;
      // Final persist after drag (LS + editor overrides blob)
      this._applyWeaponGripFromUI(true);
      try { this.saveToLocalStorage(); } catch (e) { /* ignore */ }
      this._setWeaponGripStatus('Drag OK · saved · ' + id);
      return true;
    }

    // ============================================================
    //  ВРЕМЯ СУТОК / СОЛНЦЕ (DayNight)
    // ============================================================
    _getDayNight() {
      return (this.game && this.game.dayNight) || window.dayNight || null;
    }

    _formatHour(h) {
      const hh = Math.floor(((h % 24) + 24) % 24);
      const mm = Math.floor((((h % 24) + 24) % 24 - hh) * 60);
      return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    }

    _phaseRu(ph) {
      return ({ day: 'День', golden: 'Золотой час', twilight: 'Сумерки', night: 'Ночь' })[ph] || ph || '—';
    }

    _bindDayNightControls() {
      const slider = this.panel.querySelector('#ed-tod-slider');
      const pauseChk = this.panel.querySelector('#ed-chk-tod-pause');
      if (!slider) return;

      this._isDraggingTod = false;
      let lastPushTime = 0;
      let pendingHour = null;
      let throttleTimer = null;

      const hasNet = () => !!(this.game && this.game.net && (this.game.net.status === 'online' || (this.game.net.ws && this.game.net.ws.readyState === 1)));
      const pushServerHour = (hour, silent) => {
        if (hasNet() && this.game.net.intentSetTime) {
          this.game.net.intentSetTime(hour, silent);
          return true;
        }
        return false;
      };
      const pushServerPause = (paused) => {
        if (hasNet() && this.game.net.intentSetTimePause) {
          this.game.net.intentSetTimePause(paused);
          return true;
        }
        return false;
      };

      const sendThrottledHour = (hour, silent) => {
        const now = Date.now();
        if (now - lastPushTime > 100) {
          lastPushTime = now;
          pushServerHour(hour, silent);
        } else {
          pendingHour = hour;
          if (!throttleTimer) {
            throttleTimer = setTimeout(() => {
              throttleTimer = null;
              if (pendingHour != null) {
                lastPushTime = Date.now();
                pushServerHour(pendingHour, true);
                pendingHour = null;
              }
            }, 100);
          }
        }
      };

      const applyFromSlider = (isFinal) => {
        const dn = this._getDayNight();
        if (!dn) return;
        const minutes = +slider.value; // 0..1439
        const hour = minutes / 60;

        // 1. Мгновенный 60 FPS визуальный отклик в 3D мире
        dn.setHour(hour);

        // 2. Синхронизация с сервером
        if (hasNet()) {
          if (isFinal) {
            if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
            pendingHour = null;
            lastPushTime = Date.now();
            pushServerHour(hour, false);
          } else {
            dn.setEditorOverride(true);
            sendThrottledHour(hour, true);
          }
        } else {
          dn.setEditorOverride(true);
          if (pauseChk && pauseChk.checked) dn.setPaused(true);
        }
        this._refreshDayNightLabel();
      };

      slider.addEventListener('pointerdown', () => {
        this._isDraggingTod = true;
        const dn = this._getDayNight();
        if (dn) dn.setEditorOverride(true);
      });
      slider.addEventListener('pointerup', () => {
        this._isDraggingTod = false;
        applyFromSlider(true);
      });
      slider.addEventListener('input', () => {
        this._isDraggingTod = true;
        applyFromSlider(false);
      });
      slider.addEventListener('change', () => {
        this._isDraggingTod = false;
        applyFromSlider(true);
      });
      window.addEventListener('pointerup', () => {
        if (this._isDraggingTod) {
          this._isDraggingTod = false;
          applyFromSlider(true);
        }
      });

      if (pauseChk) {
        pauseChk.addEventListener('change', () => {
          const dn = this._getDayNight();
          if (!dn) return;
          const isPaused = !!pauseChk.checked;
          dn.setPaused(isPaused);
          if (hasNet()) {
            pushServerPause(isPaused);
            dn.setEditorOverride(false);
          } else {
            dn.setEditorOverride(isPaused);
          }
          this._refreshDayNightLabel();
        });
      }

      this.panel.querySelectorAll('.ed-tod-preset').forEach((btn) => {
        btn.addEventListener('click', () => {
          const h = parseFloat(btn.getAttribute('data-hour') || '12');
          const dn = this._getDayNight();
          if (!dn) return;
          dn.setHour(h);
          slider.value = String(Math.round(h * 60) % 1440);
          if (hasNet()) {
            dn.setEditorOverride(false);
            pushServerHour(h, false);
          } else {
            dn.setEditorOverride(true);
          }
          this._refreshDayNightLabel();
        });
      });

      this._syncDayNightFromGame();
    }

    _applyDayNightEditorFlags() {
      const dn = this._getDayNight();
      if (!dn) return;
      const pauseChk = this.panel && this.panel.querySelector('#ed-chk-tod-pause');
      const hasNet = this.game && this.game.net && this.game.net.status === 'online';
      if (hasNet) {
        dn.setEditorOverride(false);
        const serverPaused = !!(this.game.net && this.game.net.timeAnchor && this.game.net.timeAnchor.paused);
        if (pauseChk) pauseChk.checked = serverPaused;
        dn.setPaused(serverPaused);
        return;
      }
      dn.setEditorOverride(true);
      if (pauseChk) dn.setPaused(!!pauseChk.checked);
    }

    _syncDayNightFromGame() {
      const dn = this._getDayNight();
      const slider = this.panel && this.panel.querySelector('#ed-tod-slider');
      const pauseChk = this.panel && this.panel.querySelector('#ed-chk-tod-pause');
      if (!dn || !slider) return;
      const minutes = Math.round(dn.getHour() * 60) % 1440;
      if (!this._isDraggingTod && document.activeElement !== slider) {
        slider.value = String(minutes);
      }
      if (pauseChk && document.activeElement !== pauseChk) {
        const hasNet = this.game && this.game.net && this.game.net.status === 'online';
        if (hasNet && this.game.net && this.game.net.timeAnchor) {
          pauseChk.checked = !!this.game.net.timeAnchor.paused;
        } else {
          pauseChk.checked = !!dn.paused;
        }
      }
      this._refreshDayNightLabel();
    }

    _refreshDayNightLabel() {
      const dn = this._getDayNight();
      const lab = this.panel && this.panel.querySelector('#ed-tod-label');
      const phEl = this.panel && this.panel.querySelector('#ed-tod-phase');
      if (!lab) return;
      if (!dn) {
        lab.textContent = 'DayNight нет';
        if (phEl) phEl.textContent = 'Фаза: — (модуль не создан)';
        return;
      }
      lab.textContent = this._formatHour(dn.getHour());
      if (phEl) {
        const flags = [];
        if (dn.paused) flags.push('пауза');
        if (dn.editorOverride) flags.push('ручной');
        if (dn._serverDriven) flags.push('сервер');
        phEl.textContent = 'Фаза: ' + this._phaseRu(dn.getPhaseName()) +
          (flags.length ? ' · ' + flags.join(', ') : '');
      }
    }

    // ============================================================
    //  РИСОВАНИЕ ТЕКСТУРАМИ ПО ТЕРРЕЙНУ (UE5 Landscape Paint)
    // ============================================================
    _bindPaintControls() {
      if (!this.panel) return;

      this.panel.querySelectorAll('.btn-paint-layer').forEach(btn => {
        btn.onclick = () => {
          const l = parseInt(btn.getAttribute('data-layer'), 10) || 0;
          this.setPaintLayer(l);
        };
      });

      const rngRadius = this.panel.querySelector('#rng-paint-radius');
      if (rngRadius) {
        rngRadius.oninput = (e) => this.setPaintBrushRadius(parseFloat(e.target.value));
      }
      const rngFalloff = this.panel.querySelector('#rng-paint-falloff');
      if (rngFalloff) {
        rngFalloff.oninput = (e) => this.setPaintBrushFalloff(parseFloat(e.target.value));
      }
      const rngStrength = this.panel.querySelector('#rng-paint-strength');
      if (rngStrength) {
        rngStrength.oninput = (e) => this.setPaintBrushStrength(parseFloat(e.target.value));
      }
      const rngTiling = this.panel.querySelector('#rng-paint-tiling');
      if (rngTiling) {
        rngTiling.oninput = (e) => this.setPaintLayerTiling(parseFloat(e.target.value));
      }
      this.panel.querySelectorAll('.btn-paint-tile-preset').forEach(btn => {
        btn.onclick = () => {
          const t = parseFloat(btn.getAttribute('data-tile')) || 96;
          this.setPaintLayerTiling(t);
        };
      });

      const btnDrawMode = this.panel.querySelector('#btn-paint-draw-mode');
      const btnEraseMode = this.panel.querySelector('#btn-paint-erase-mode');
      if (btnDrawMode) btnDrawMode.onclick = () => this.setPaintEraseMode(false);
      if (btnEraseMode) btnEraseMode.onclick = () => this.setPaintEraseMode(true);

      const btnPaintUndo = this.panel.querySelector('#btn-paint-undo');
      if (btnPaintUndo) {
        btnPaintUndo.onclick = () => this.undo();
      }

      const btnPaintRedo = this.panel.querySelector('#btn-paint-redo');
      if (btnPaintRedo) {
        btnPaintRedo.onclick = () => this.redo();
      }

      const btnChangeSlotTex = this.panel.querySelector('#btn-paint-change-slot-tex');
      if (btnChangeSlotTex) {
        btnChangeSlotTex.onclick = () => this.showTerrainTextureLibraryModal();
      }

      const btnPaintFill = this.panel.querySelector('#btn-paint-fill');
      if (btnPaintFill) {
        btnPaintFill.onclick = () => {
          if (window.Terrain && window.Terrain.fillPaintLayer) {
            window.Terrain.fillPaintLayer(this.paintSelectedLayer);
            if (this.game && this.game.addChatMessage) {
              this.game.addChatMessage('[Кисть] Террейн полностью залит слоем #' + (this.paintSelectedLayer + 1) + ' (Ctrl+Z для отмены)', 'system');
            }
          }
        };
      }

      const btnPaintClearLayer = this.panel.querySelector('#btn-paint-clear-layer');
      if (btnPaintClearLayer) {
        btnPaintClearLayer.onclick = () => {
          if (window.Terrain && window.Terrain.clearPaintLayer) {
            window.Terrain.clearPaintLayer(this.paintSelectedLayer);
            if (this.game && this.game.addChatMessage) {
              this.game.addChatMessage('[Кисть] 🗑️ Очищен слой #' + (this.paintSelectedLayer + 1) + ' (Ctrl+Z для отмены)', 'system');
            }
          }
        };
      }

      const btnPaintClearAll = this.panel.querySelector('#btn-paint-clear-all');
      if (btnPaintClearAll) {
        btnPaintClearAll.onclick = () => {
          if (window.Terrain && window.Terrain.clearPaintLayer) {
            window.Terrain.clearPaintLayer(-1);
            if (this.game && this.game.addChatMessage) {
              this.game.addChatMessage('[Кисть] ❌ Все слои рисования стёрты (Ctrl+Z для отмены)', 'system');
            }
          }
        };
      }

      const btnOpenTexLib = this.panel.querySelector('#btn-paint-open-tex-lib');
      if (btnOpenTexLib) {
        btnOpenTexLib.onclick = () => this.showTerrainTextureLibraryModal();
      }

      const btnPaintSaveServer = this.panel.querySelector('#btn-paint-save-server');
      if (btnPaintSaveServer) {
        btnPaintSaveServer.onclick = () => {
          if (window.Terrain && window.Terrain.savePaintToServer) {
            window.Terrain.savePaintToServer().then(ok => {
              if (this.game && this.game.addChatMessage) {
                this.game.addChatMessage(ok ? '[Кисть] ✅ Текстуры террейна сохранены на сервер!' : '[Кисть] ⚠️ Ошибка сохранения текстур', 'system');
              }
            });
          }
        };
      }
    }

    showTerrainTextureLibraryModal() {
      if (!window.TERRAIN_TEXTURE_LIBRARY) {
        window.TERRAIN_TEXTURE_LIBRARY = [
          // Roads & Floors
          { id: 'cobble_1', name: 'Брусчатка дорожная 2K', file: 'assets/textures/cobblestone_floor_001_diffuse_2k.jpg', cat: 'roads', icon: '🛤️' },
          { id: 'cobble_large', name: 'Крупный булыжник 1K', file: 'assets/textures/cobblestone_large_01_diff_1k.jpg', cat: 'roads', icon: '🪨' },
          { id: 'town_cobble', name: 'Городская мостовая', file: 'data/textures/town_cobblestone.webp', cat: 'roads', icon: '🏛️' },

          // Nature & Grass & Dirt
          { id: 'grass_dense', name: 'Сочная трава 1K', file: 'data/textures/020_Dense_Green_grass_BaseColor.webp', cat: 'nature', icon: '🌿' },
          { id: 'grass_webp', name: 'Трава полевая', file: 'assets/textures/webp/grass1.webp', cat: 'nature', icon: '🌱' },
          { id: 'forest_floor', name: 'Лесная земля / Грунт', file: 'data/textures/Forest_Floor_vktfeilaw_1K_BaseColor.webp', cat: 'nature', icon: '🟫' },
          { id: 'forest_dirt2', name: 'Лесная тропа 2', file: 'data/textures/Forest_Floor_sfjmafua_1K_BaseColor.webp', cat: 'nature', icon: '🍂' },
          { id: 'ground_roots', name: 'Земля с корнями', file: 'data/textures/Ground_Roots_vliucgi_1K_BaseColor.webp', cat: 'nature', icon: '🪵' },
          { id: 'sand_gold', name: 'Золотой песок', file: 'data/textures/sand_tidewrack.webp', cat: 'nature', icon: '🏖️' },

          // Stone & Rocks & Walls
          { id: 'sandstone_block', name: 'Блоки песчаника', file: 'assets/textures/sandstone_blocks_05_diff_1k.jpg', cat: 'stone', icon: '🧱' },
          { id: 'cliff_rock', name: 'Слоистая скала', file: 'data/textures/Layered_Rock_Cliff_thfkchjs_1K_BaseColor.webp', cat: 'stone', icon: '⛰️' },
          { id: 'rock_cliff2', name: 'Скалистый обрыв', file: 'data/textures/Rock_Cliff_xccibbi_1K_BaseColor.webp', cat: 'stone', icon: '🪨' },
          { id: 'stone_wall_1', name: 'Каменная стена 2K', file: 'assets/textures/stone_wall_diff_2k.jpg', cat: 'stone', icon: '🏰' },
          { id: 'stone_wall_rustic', name: 'Деревенский камень', file: 'assets/textures/rustic_stone_wall_02_diff_2k.jpg', cat: 'stone', icon: '🧱' },
          { id: 'castle_brick', name: 'Замковый кирпич', file: 'assets/textures/castle_brick_01_diffuse_2k.jpg', cat: 'stone', icon: '🏰' },
          { id: 'castle_slates', name: 'Замковый сланец', file: 'assets/textures/castle_wall_slates_diff_2k.jpg', cat: 'stone', icon: '🏛️' },
          { id: 'medieval_blocks5', name: 'Средневековые блоки 5', file: 'assets/textures/medieval_blocks_05_diffuse_2k.jpg', cat: 'stone', icon: '🧱' },
          { id: 'medieval_blocks6', name: 'Средневековые блоки 6', file: 'assets/textures/medieval_blocks_06_diff_2k.jpg', cat: 'stone', icon: '🧱' },
          { id: 'medieval_wall', name: 'Крепостная стена', file: 'assets/textures/medieval_wall_01_diffuse_2k.jpg', cat: 'stone', icon: '🏰' },

          // Wood
          { id: 'dark_wood', name: 'Темное дерево 2K', file: 'assets/textures/dark_wood_diff_2k.jpg', cat: 'wood', icon: '🪵' },
          { id: 'dark_planks', name: 'Темные доски 2K', file: 'assets/textures/dark_wooden_planks_diffuse_2k.jpg', cat: 'wood', icon: '🪵' },
          { id: 'medieval_wood', name: 'Средневековый брус', file: 'assets/textures/medieval_wood_diffuse_2k.jpg', cat: 'wood', icon: '🪵' },
          { id: 'wood_table', name: 'Состаренное дерево', file: 'assets/textures/wood_table_worn_diff_1k.jpg', cat: 'wood', icon: '🪵' },

          // Roof & Tiles
          { id: 'clay_tiles3', name: 'Глиняная черепица 3', file: 'assets/textures/clay_roof_tiles_03_diffuse_2k.jpg', cat: 'tiles', icon: '🏠' },
          { id: 'clay_tiles1', name: 'Глиняная черепица 1', file: 'assets/textures/clay_roof_tiles_diff_1k.jpg', cat: 'tiles', icon: '🏮' },
          { id: 'grey_roof', name: 'Серая кровля', file: 'assets/textures/grey_roof_01_diffuse_2k.jpg', cat: 'tiles', icon: '🏛️' },
          { id: 'grey_tiles2', name: 'Серая черепица 2', file: 'assets/textures/grey_roof_tiles_02_diffuse_2k.jpg', cat: 'tiles', icon: '🏛️' },
          { id: 'roof_slates', name: 'Сланцевая кровля', file: 'assets/textures/roof_slates_02_diffuse_2k.jpg', cat: 'tiles', icon: '🏛️' },

          // Special
          { id: 'metal_plate', name: 'Металлическая плита', file: 'assets/textures/metal_plate_02_diff_1k.jpg', cat: 'special', icon: '⚙️' },
          { id: 'lava_ground', name: 'Вулканическая лава', file: 'data/textures/lava ground_BaseColor.webp', cat: 'special', icon: '🌋' },
          { id: 'swamp_moss', name: 'Болотный мох / Неон', file: 'data/textures/Astreoid Glowing Lava Green Rock_BaseColor.webp', cat: 'special', icon: '🟢' }
        ];
      }

      let modal = document.getElementById('ps-tex-lib-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ps-tex-lib-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);';
        modal.innerHTML = `
          <div style="background:rgba(15,22,28,0.98);border:2px solid #33aa66;border-radius:10px;width:820px;max-width:95vw;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.85);color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
            <!-- Header -->
            <div style="padding:12px 16px;border-bottom:1px solid #285536;display:flex;justify-content:space-between;align-items:center;background:rgba(20,40,28,0.6);">
              <div>
                <div style="font-size:16px;font-weight:bold;color:#88ffbb;">📂 Библиотека текстур ландшафта</div>
                <div id="ed-tex-lib-slot-hint" style="font-size:11px;color:#aaccbb;">Кликните любую текстуру для назначения в активный слот кисти #1</div>
              </div>
              <button id="ed-tex-lib-close" style="background:#442222;color:#ffaaaa;border:1px solid #883333;padding:5px 12px;border-radius:4px;cursor:pointer;font-weight:bold;">✕ Закрыть</button>
            </div>
            <!-- Filter Bar -->
            <div id="ed-tex-lib-cats" style="padding:8px 16px;border-bottom:1px solid #223a2a;display:flex;gap:6px;flex-wrap:wrap;background:rgba(10,18,14,0.5);">
              <button class="btn-tex-cat active" data-cat="all" style="background:#246636;color:#aaffcc;border:1px solid #44aa66;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;">🌟 Все (29)</button>
              <button class="btn-tex-cat" data-cat="roads" style="background:#16281e;color:#aaccbb;border:1px solid #285536;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">🛤️ Дороги & Плитка</button>
              <button class="btn-tex-cat" data-cat="nature" style="background:#16281e;color:#aaccbb;border:1px solid #285536;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">🌿 Трава & Грунт</button>
              <button class="btn-tex-cat" data-cat="stone" style="background:#16281e;color:#aaccbb;border:1px solid #285536;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">🪨 Камень & Стены</button>
              <button class="btn-tex-cat" data-cat="wood" style="background:#16281e;color:#aaccbb;border:1px solid #285536;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">🪵 Дерево & Доски</button>
              <button class="btn-tex-cat" data-cat="tiles" style="background:#16281e;color:#aaccbb;border:1px solid #285536;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">🏠 Черепица & Кровля</button>
              <button class="btn-tex-cat" data-cat="special" style="background:#16281e;color:#aaccbb;border:1px solid #285536;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;">🌋 Спец (Лава/Мох)</button>
            </div>
            <!-- Grid -->
            <div id="ed-tex-lib-grid" style="padding:14px 16px;overflow-y:auto;flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;align-content:start;">
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#ed-tex-lib-close').onclick = () => { modal.style.display = 'none'; };
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

        modal.querySelectorAll('.btn-tex-cat').forEach(b => {
          b.onclick = () => {
            modal.querySelectorAll('.btn-tex-cat').forEach(x => {
              x.style.background = '#16281e';
              x.style.color = '#aaccbb';
              x.style.border = '1px solid #285536';
              x.style.fontWeight = 'normal';
            });
            b.style.background = '#246636';
            b.style.color = '#aaffcc';
            b.style.border = '1px solid #44aa66';
            b.style.fontWeight = 'bold';
            this._renderTextureLibraryGrid(b.getAttribute('data-cat'));
          };
        });
      }

      const hint = modal.querySelector('#ed-tex-lib-slot-hint');
      if (hint) {
        hint.textContent = `Кликните любую текстуру для назначения в активный слот кисти #${this.paintSelectedLayer + 1}`;
      }

      modal.style.display = 'flex';
      this._renderTextureLibraryGrid('all');
    }

    _renderTextureLibraryGrid(cat) {
      const grid = document.getElementById('ed-tex-lib-grid');
      if (!grid) return;
      grid.innerHTML = '';

      const items = (window.TERRAIN_TEXTURE_LIBRARY || []).filter(t => cat === 'all' || t.cat === cat);
      items.forEach(t => {
        const card = document.createElement('div');
        card.style.cssText = 'background:rgba(20,32,24,0.7);border:1px solid #2d5538;border-radius:6px;padding:6px;display:flex;flex-direction:column;align-items:center;cursor:pointer;transition:all 0.15s ease;text-align:center;';
        card.onmouseenter = () => { card.style.borderColor = '#55dd88'; card.style.background = '#1c4a2a'; card.style.transform = 'translateY(-2px)'; };
        card.onmouseleave = () => { card.style.borderColor = '#2d5538'; card.style.background = 'rgba(20,32,24,0.7)'; card.style.transform = 'none'; };
        
        const fname = t.file.split('/').pop();
        card.innerHTML = `
          <div style="width:100%;height:85px;border-radius:4px;overflow:hidden;background:#111;margin-bottom:6px;border:1px solid #333;display:flex;align-items:center;justify-content:center;">
            <img src="${t.file}" alt="${t.name}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.parentElement.innerHTML='<span style=\\'font-size:24px;\\'>${t.icon||'🎨'}</span>';" />
          </div>
          <div style="font-size:11px;font-weight:bold;color:#aaffcc;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;">${t.name}</div>
          <div style="font-size:9px;color:#77aa88;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;" title="${t.file}">${fname}</div>
        `;

        card.onclick = () => {
          const slot = this.paintSelectedLayer;
          if (window.Terrain && window.Terrain.setLayerTexture) {
            window.Terrain.setLayerTexture(slot, t.file);
          }
          if (this.game && this.game.addChatMessage) {
            this.game.addChatMessage(`[Кисть] Слот #${slot + 1} назначен: ${t.name} (${fname})`, 'system');
          }
          // Update button text in palette
          if (this.panel) {
            const btn = this.panel.querySelector(`.btn-paint-layer[data-layer="${slot}"]`);
            if (btn) {
              const spanName = btn.querySelector('.layer-name');
              if (spanName) spanName.textContent = `${slot + 1}: ${t.name}`;
            }
          }
          const modal = document.getElementById('ps-tex-lib-modal');
          if (modal) modal.style.display = 'none';
        };

        grid.appendChild(card);
      });
    }

    setPaintLayer(layerIndex) {
      this.paintSelectedLayer = layerIndex;
      if (!this.panel) return;
      this.panel.querySelectorAll('.btn-paint-layer').forEach(btn => {
        const l = parseInt(btn.getAttribute('data-layer'), 10);
        const isActive = (l === layerIndex);
        btn.style.background = isActive ? '#1c4a2a' : '#16281e';
        btn.style.border = isActive ? '2px solid #55dd88' : '1px solid #285536';
        btn.style.color = isActive ? '#aaffcc' : '#aaccbb';
        btn.style.fontWeight = isActive ? 'bold' : 'normal';
      });
      const slotNum = this.panel.querySelector('#txt-active-slot-num');
      if (slotNum) slotNum.textContent = String(layerIndex + 1);
    }

    setPaintLayerTiling(val) {
      const tiling = Math.max(10.0, Math.min(1200.0, parseFloat(val) || 120.0));
      this.paintBrushTiling = tiling;
      if (this.panel) {
        const inp = this.panel.querySelector('#rng-paint-tiling');
        const txt = this.panel.querySelector('#txt-paint-tiling-val');
        if (inp && parseFloat(inp.value) !== tiling) inp.value = tiling;
        if (txt) txt.textContent = tiling.toFixed(1) + 'x';
      }
    }

    setPaintBrushRadius(r) {
      this.paintBrushRadius = Math.max(1.0, Math.min(60.0, r));
      if (this.panel) {
        const inp = this.panel.querySelector('#rng-paint-radius');
        const txt = this.panel.querySelector('#txt-paint-radius');
        if (inp && parseFloat(inp.value) !== this.paintBrushRadius) inp.value = this.paintBrushRadius;
        if (txt) txt.textContent = this.paintBrushRadius.toFixed(1) + ' м';
      }
      if (this._paintBrushProjector) {
        this._paintBrushProjector.scale.set(this.paintBrushRadius, 1, this.paintBrushRadius);
      }
    }

    setPaintBrushFalloff(fo) {
      this.paintBrushFalloff = Math.max(0.0, Math.min(0.95, fo));
      if (this.panel) {
        const inp = this.panel.querySelector('#rng-paint-falloff');
        const txt = this.panel.querySelector('#txt-paint-falloff');
        if (inp && parseFloat(inp.value) !== this.paintBrushFalloff) inp.value = this.paintBrushFalloff;
        if (txt) txt.textContent = Math.round((1 - this.paintBrushFalloff) * 100) + '%';
      }
    }

    setPaintBrushStrength(str) {
      this.paintBrushStrength = Math.max(0.05, Math.min(1.0, str));
      if (this.panel) {
        const inp = this.panel.querySelector('#rng-paint-strength');
        const txt = this.panel.querySelector('#txt-paint-strength');
        if (inp && parseFloat(inp.value) !== this.paintBrushStrength) inp.value = this.paintBrushStrength;
        if (txt) txt.textContent = Math.round(this.paintBrushStrength * 100) + '%';
      }
    }

    setPaintEraseMode(isErase) {
      this.paintIsErase = !!isErase;
      if (!this.panel) return;
      const bDraw = this.panel.querySelector('#btn-paint-draw-mode');
      const bErase = this.panel.querySelector('#btn-paint-erase-mode');
      const status = this.panel.querySelector('#ed-paint-status');
      if (bDraw) {
        bDraw.style.background = !isErase ? 'linear-gradient(180deg,#246630,#16401e)' : '#16281e';
        bDraw.style.border = !isErase ? '1px solid #44aa66' : '1px solid #285536';
        bDraw.style.color = !isErase ? '#aaffcc' : '#88aa99';
      }
      if (bErase) {
        bErase.style.background = isErase ? 'linear-gradient(180deg,#882222,#441111)' : '#281616';
        bErase.style.border = isErase ? '1px solid #cc4444' : '1px solid #552222';
        bErase.style.color = isErase ? '#ffcccc' : '#aa7777';
      }
      if (status) {
        status.textContent = isErase ? '🧼 Ластик: стирание' : '🖌️ Кисть: рисование';
        status.style.color = isErase ? '#ffaaaa' : '#88ffbb';
      }
    }

    _initPaintBrushProjector() {
      if (this._paintBrushProjector) return;
      const group = new THREE.Group();
      group.name = '_paintBrushProjector';

      // Outer ring (radius)
      const outerGeo = new THREE.RingGeometry(0.96, 1.0, 48);
      outerGeo.rotateX(-Math.PI / 2);
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0x44ffaa,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthTest: false
      });
      const outerRing = new THREE.Mesh(outerGeo, outerMat);
      outerRing.name = 'outerRing';
      group.add(outerRing);

      // Inner ring (falloff inner radius)
      const innerGeo = new THREE.RingGeometry(0.48, 0.52, 36);
      innerGeo.rotateX(-Math.PI / 2);
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0x88ddff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
        depthTest: false
      });
      const innerRing = new THREE.Mesh(innerGeo, innerMat);
      innerRing.name = 'innerRing';
      group.add(innerRing);

      // Center dot
      const dotGeo = new THREE.CircleGeometry(0.08, 16);
      dotGeo.rotateX(-Math.PI / 2);
      const dotMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthTest: false
      });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      group.add(dot);

      group.visible = false;
      this.scene.add(group);
      this._paintBrushProjector = group;
    }

    _updatePaintBrushProjector(worldPos, isEraseParam) {
      if (!this._paintBrushProjector) this._initPaintBrushProjector();
      if (!this._paintBrushProjector) return;
      if (!worldPos || (this.editorMode !== 'paint' && !this.drawPaintMode)) {
        this._paintBrushProjector.visible = false;
        return;
      }
      this._paintBrushProjector.visible = true;
      const gh = (window.Terrain ? window.Terrain.heightAt(worldPos.x, worldPos.z) : worldPos.y) + 0.3;
      this._paintBrushProjector.position.set(worldPos.x, gh, worldPos.z);
      this._paintBrushProjector.scale.set(this.paintBrushRadius, 1, this.paintBrushRadius);

      const erase = isEraseParam != null ? !!isEraseParam : !!this.paintIsErase;
      const outer = this._paintBrushProjector.getObjectByName('outerRing');
      const inner = this._paintBrushProjector.getObjectByName('innerRing');
      const col = erase ? 0xff4444 : 0x33ee77;
      if (outer && outer.material) outer.material.color.setHex(col);
      if (inner) {
        if (inner.material) inner.material.color.setHex(erase ? 0xff8888 : 0x88ffaa);
        const innerRatio = Math.max(0.1, 1.0 - this.paintBrushFalloff);
        inner.scale.set(innerRatio, 1, innerRatio);
      }
    }

    _applyPaintStrokeAt(worldX, worldZ, uvU, uvV, isEraseParam) {
      if (!window.Terrain || !window.Terrain.paintStroke) return;
      if (!isFinite(worldX) || !isFinite(worldZ)) return;
      const r = this.paintBrushRadius || 12.0;
      const fo = this.paintBrushFalloff != null ? this.paintBrushFalloff : 0.4;
      const str = this.paintBrushStrength || 0.35;
      const layer = this.paintSelectedLayer || 0;
      const isErase = isEraseParam != null ? !!isEraseParam : !!this.paintIsErase;
      const bTiling = this.paintBrushTiling || 120.0;

      if (!this.paintLastPos) {
        window.Terrain.paintStroke(worldX, worldZ, r, fo, str, layer, isErase, uvU, uvV, bTiling);
        this.paintLastPos = { x: worldX, z: worldZ, u: uvU, v: uvV };
        return;
      }

      const dx = worldX - this.paintLastPos.x;
      const dz = worldZ - this.paintLastPos.z;
      const dist = Math.hypot(dx, dz);

      if (dist > r * 4) {
        window.Terrain.paintStroke(worldX, worldZ, r, fo, str, layer, isErase, uvU, uvV, bTiling);
        this.paintLastPos = { x: worldX, z: worldZ, u: uvU, v: uvV };
        return;
      }

      const stepSize = Math.max(0.8, r * 0.35);
      const steps = Math.min(5, Math.max(1, Math.ceil(dist / stepSize)));

      const hasUv = (uvU != null && this.paintLastPos.u != null);
      const du = hasUv ? (uvU - this.paintLastPos.u) : 0;
      const dv = hasUv ? (uvV - this.paintLastPos.v) : 0;

      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const ix = this.paintLastPos.x + dx * t;
        const iz = this.paintLastPos.z + dz * t;
        const iu = hasUv ? (this.paintLastPos.u + du * t) : undefined;
        const iv = hasUv ? (this.paintLastPos.v + dv * t) : undefined;
        window.Terrain.paintStroke(ix, iz, r, fo, str, layer, isErase, iu, iv, bTiling);
      }

      this.paintLastPos = { x: worldX, z: worldZ, u: uvU, v: uvV };
    }

    // ============================================================
    //  РИСОВАНИЕ РАСТИТЕЛЬНОСТИ И ДЕРЕВЬЕВ (UE5 Foliage Paint)
    // ============================================================
    _getVegEstimatedHeight(item) {
      if (!item) return '~1.0 м';
      if (item.estimatedHeight !== undefined && item.estimatedHeight !== null) {
        return '~' + item.estimatedHeight + ' м';
      }
      const scale = item.defaultScale || 1.0;
      if (item.category === 'trees' || item.category === 'dead_trees') return '~12.0 м';
      if (item.id && (item.id.includes('poppy') || item.id.includes('flower'))) return '~0.4 м';
      if (item.id && item.id.includes('pratia')) return '~0.2 м';
      if (item.id && item.id.includes('grass')) return '~0.3 м';
      if (item.id && item.id.includes('mushroom')) return '~0.2 м';
      if (item.id && item.id.includes('stump')) return '~0.5 м';
      if (item.id && item.id.includes('log')) return '~0.6 м';
      if (item.category === 'bushes') return '~1.5 м';
      return '~1.0 м';
    }

    _initFoliageStudioWindow() {
      if (this._foliageStudioWin) return;

      const win = document.createElement('div');
      win.id = 'ed-foliage-window';
      win.style.cssText = `
        position: fixed;
        left: 20px;
        top: 70px;
        width: 480px;
        max-height: 85vh;
        background: rgba(10, 22, 14, 0.96);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid #33cc66;
        border-radius: 8px;
        box-shadow: 0 12px 36px rgba(0,0,0,0.7), 0 0 16px rgba(50,205,100,0.25);
        z-index: 100050;
        display: none;
        flex-direction: column;
        overflow: hidden;
        font-family: inherit;
      `;

      win.innerHTML = `
        <!-- Title Bar -->
        <div id="ed-foliage-win-header" style="background: linear-gradient(90deg,#143820,#0c2214); padding: 8px 12px; border-bottom: 1px solid #286638; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:16px;">🌿</span>
            <span style="font-weight:bold; color:#88ffbb; font-size:13px;">Палитра растительности & Лес</span>
            <span id="ed-foliage-win-sel-count" style="background:#246636; color:#ffffff; padding:1px 6px; border-radius:10px; font-size:10px; border:1px solid #44cc77;">4 выбрано</span>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button type="button" id="ed-foliage-win-close" style="background:#331515; color:#ffaaaa; border:1px solid #772525; padding:2px 8px; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold;">✕</button>
          </div>
        </div>

        <!-- Filter Tabs -->
        <div style="display: flex; gap: 3px; padding: 6px 8px 2px; background: rgba(0,0,0,0.3); border-bottom: 1px solid #1a3824; overflow-x: auto;">
          <button type="button" class="btn-fol-tab" data-tab="all" style="background:#246636; color:#aaffcc; border:1px solid #44aa66; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold; white-space:nowrap;">📦 Все</button>
          <button type="button" class="btn-fol-tab" data-tab="flowers" style="background:#142d1e; color:#ffbbee; border:1px solid #552444; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:10px; white-space:nowrap;">🌸 Цветы</button>
          <button type="button" class="btn-fol-tab" data-tab="grass" style="background:#142d1e; color:#aaddbb; border:1px solid #245530; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:10px; white-space:nowrap;">🌾 Трава</button>
          <button type="button" class="btn-fol-tab" data-tab="bushes" style="background:#142d1e; color:#aaddbb; border:1px solid #245530; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:10px; white-space:nowrap;">🌿 Кусты</button>
          <button type="button" class="btn-fol-tab" data-tab="trees" style="background:#142d1e; color:#aaddbb; border:1px solid #245530; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:10px; white-space:nowrap;">🌲 Деревья</button>
          <button type="button" class="btn-fol-tab" data-tab="dead_trees" style="background:#142d1e; color:#aaddbb; border:1px solid #245530; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:10px; white-space:nowrap;">🪵 Мертвые</button>
          <button type="button" class="btn-fol-tab" data-tab="forest_decor" style="background:#142d1e; color:#aaddbb; border:1px solid #245530; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:10px; white-space:nowrap;">🍄 Декор</button>
          <button type="button" class="btn-fol-tab" data-tab="selected" style="background:#142d1e; color:#ffdd88; border:1px solid #554420; padding:4px 8px; border-radius:4px; cursor:pointer; font-size:10px; white-space:nowrap;">⭐ Выбранные</button>
        </div>

        <!-- Quick Toolbar -->
        <div style="padding: 6px 8px; display: flex; flex-direction: column; gap: 5px; background: rgba(0,0,0,0.2); border-bottom: 1px solid #1a3824;">
          <div style="display:flex; gap:4px; flex-wrap:wrap;">
            <button type="button" id="btn-fol-win-all-flowers" style="flex:1; min-width:80px; background:#381830; color:#ffaaff; border:1px solid #732f65; padding:4px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">🌸 Все цветы</button>
            <button type="button" id="btn-fol-win-all-grass" style="flex:1; min-width:80px; background:#183824; color:#aaffcc; border:1px solid #2f7344; padding:4px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">🌾 Вся трава</button>
            <button type="button" id="btn-fol-win-all-bushes" style="flex:1; min-width:80px; background:#183824; color:#aaffcc; border:1px solid #2f7344; padding:4px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">🌿 Все кусты</button>
            <button type="button" id="btn-fol-win-all-trees" style="flex:1; min-width:80px; background:#183824; color:#aaffcc; border:1px solid #2f7344; padding:4px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;">🌲 Все деревья</button>
            <button type="button" id="btn-fol-win-clear-sel" style="flex:0.8; min-width:70px; background:#381d18; color:#ffbbaa; border:1px solid #733b2f; padding:4px; border-radius:4px; cursor:pointer; font-size:10px;">❌ Снять всё</button>
          </div>
          <div style="position:relative;">
            <input type="text" id="inp-fol-win-search" placeholder="🔍 Поиск моделей (цветы, мак, трава, сосна, ель, дуб, куст, пень)..." style="width:100%; box-sizing:border-box; background:#07140c; color:#aaffcc; border:1px solid #285536; padding:5px 8px; border-radius:4px; font-size:11px; font-family:inherit;" />
          </div>
        </div>

        <!-- Icon Cards Grid Container -->
        <div id="ed-foliage-win-grid" style="flex: 1; overflow-y: auto; padding: 8px; display: grid; grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); gap: 6px; max-height: calc(85vh - 180px);"></div>

        <!-- Footer / Brush Hint -->
        <div style="padding: 6px 10px; background: rgba(8,18,12,0.95); border-top: 1px solid #1a3824; font-size: 10px; color: #88bb99; display: flex; justify-content: space-between; align-items: center;">
          <span>💡 ЛКМ по террейну сажает выбранные растения</span>
          <span style="color:#ffeeaa;">Горячая клавиша: <b>V</b></span>
        </div>
      `;

      document.body.appendChild(win);
      this._foliageStudioWin = win;
      this._foliageActiveTab = 'all';

      // Dragging logic
      const header = win.querySelector('#ed-foliage-win-header');
      let isDragging = false;
      let offX = 0, offY = 0;
      header.onmousedown = (e) => {
        if (e.target && e.target.tagName === 'BUTTON') return;
        isDragging = true;
        offX = e.clientX - win.offsetLeft;
        offY = e.clientY - win.offsetTop;
        const onMouseMove = (ev) => {
          if (!isDragging) return;
          win.style.left = Math.max(10, Math.min(window.innerWidth - win.offsetWidth - 10, ev.clientX - offX)) + 'px';
          win.style.top = Math.max(10, Math.min(window.innerHeight - win.offsetHeight - 10, ev.clientY - offY)) + 'px';
        };
        const onMouseUp = () => {
          isDragging = false;
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      };

      // Close button
      win.querySelector('#ed-foliage-win-close').onclick = () => this.toggleFoliageStudioWindow(false);

      // Tabs
      win.querySelectorAll('.btn-fol-tab').forEach(btn => {
        btn.onclick = () => {
          this._foliageActiveTab = btn.getAttribute('data-tab') || 'all';
          win.querySelectorAll('.btn-fol-tab').forEach(b => {
            const isActive = b === btn;
            b.style.background = isActive ? '#246636' : '#142d1e';
            b.style.color = isActive ? '#aaffcc' : '#aaddbb';
            b.style.borderColor = isActive ? '#44aa66' : '#245530';
            b.style.fontWeight = isActive ? 'bold' : 'normal';
          });
          this.renderFoliageStudioWindow();
        };
      });

      // Quick action buttons
      const btnAllFlowers = win.querySelector('#btn-fol-win-all-flowers');
      if (btnAllFlowers) {
        btnAllFlowers.onclick = () => {
          const lib = window.PropsLibrary;
          if (lib) {
            lib.getAll().filter(p => /poppy|flower|blossom/i.test(p.id || p.file || p.nameRu)).forEach(f => this.foliageSelectedModels.add(f.id));
            this.renderFoliagePalette();
          }
        };
      }

      const btnAllGrass = win.querySelector('#btn-fol-win-all-grass');
      if (btnAllGrass) {
        btnAllGrass.onclick = () => {
          const lib = window.PropsLibrary;
          if (lib) {
            lib.getAll().filter(p => /pratia|grass|clover|lawn/i.test(p.id || p.file || p.nameRu)).forEach(g => this.foliageSelectedModels.add(g.id));
            this.renderFoliagePalette();
          }
        };
      }

      win.querySelector('#btn-fol-win-all-trees').onclick = () => {
        const lib = window.PropsLibrary;
        if (lib) {
          const trees = lib.getByCategory('trees').concat(lib.getByCategory('dead_trees'));
          trees.forEach(t => this.foliageSelectedModels.add(t.id));
          this.renderFoliagePalette();
        }
      };

      win.querySelector('#btn-fol-win-all-bushes').onclick = () => {
        const lib = window.PropsLibrary;
        if (lib) {
          const bushes = lib.getByCategory('bushes');
          bushes.forEach(b => this.foliageSelectedModels.add(b.id));
          this.renderFoliagePalette();
        }
      };

      win.querySelector('#btn-fol-win-clear-sel').onclick = () => {
        this.foliageSelectedModels.clear();
        this.renderFoliagePalette();
      };

      // Search input
      const searchInp = win.querySelector('#inp-fol-win-search');
      if (searchInp) {
        searchInp.oninput = () => this.renderFoliageStudioWindow();
      }
    }

    toggleFoliageStudioWindow(show) {
      if (!this._foliageStudioWin) this._initFoliageStudioWindow();
      if (!this._foliageStudioWin) return;
      const shouldShow = (show !== undefined) ? !!show : (this._foliageStudioWin.style.display === 'none');
      this._foliageStudioWin.style.display = shouldShow ? 'flex' : 'none';
      if (shouldShow) {
        this.renderFoliageStudioWindow();
      }
    }

    renderFoliageStudioWindow() {
      if (!this._foliageStudioWin || this._foliageStudioWin.style.display === 'none') return;
      const container = this._foliageStudioWin.querySelector('#ed-foliage-win-grid');
      if (!container) return;

      const lib = window.PropsLibrary;
      if (!lib) return;

      const searchInp = this._foliageStudioWin.querySelector('#inp-fol-win-search');
      const query = (searchInp && searchInp.value) ? searchInp.value.trim().toLowerCase() : '';

      const tab = this._foliageActiveTab || 'all';

      let items = [];
      if (tab === 'flowers') {
        items = lib.getAll().filter(p => /poppy|flower|blossom/i.test(p.id || p.file || p.nameRu || ''));
      } else if (tab === 'grass') {
        items = lib.getAll().filter(p => /pratia|grass|clover|lawn/i.test(p.id || p.file || p.nameRu || ''));
      } else if (tab === 'trees') {
        items = lib.getByCategory('trees');
      } else if (tab === 'bushes') {
        items = lib.getByCategory('bushes');
      } else if (tab === 'dead_trees') {
        items = lib.getByCategory('dead_trees');
      } else if (tab === 'forest_decor') {
        items = lib.getByCategory('forest_decor').concat(lib.getByCategory('rocks'));
      } else if (tab === 'selected') {
        const all = lib.getAll();
        items = all.filter(p => this.foliageSelectedModels.has(p.id));
      } else {
        const vegCats = ['trees', 'bushes', 'dead_trees', 'forest_decor', 'rocks'];
        vegCats.forEach(c => { items = items.concat(lib.getByCategory(c)); });
        // Include poppies and pratia in 'all'
        const floras = lib.getAll().filter(p => /poppy|pratia|flower|grass/i.test(p.id || p.file || ''));
        items = items.concat(floras);
      }

      // Deduplicate by ID
      const seen = new Set();
      const uniqueItems = [];
      items.forEach(it => {
        if (!seen.has(it.id)) {
          seen.add(it.id);
          uniqueItems.push(it);
        }
      });

      // Filter by search query
      const filtered = query
        ? uniqueItems.filter(p => (
            p.id.toLowerCase().includes(query) ||
            (p.nameRu && p.nameRu.toLowerCase().includes(query)) ||
            (p.nameEn && p.nameEn.toLowerCase().includes(query)) ||
            (p.tags && p.tags.some(t => t.toLowerCase().includes(query)))
          ))
        : uniqueItems;

      // Update count badge
      const countEl = this._foliageStudioWin.querySelector('#ed-foliage-win-sel-count');
      if (countEl) {
        countEl.textContent = `${this.foliageSelectedModels.size} выбрано`;
      }

      container.innerHTML = '';
      if (filtered.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:30px; color:#88aa99; font-size:12px;">Ничего не найдено</div>';
        return;
      }

      filtered.forEach(item => {
        const isChecked = this.foliageSelectedModels.has(item.id);
        const card = document.createElement('div');
        card.style.cssText = `
          background: ${isChecked ? 'rgba(28, 65, 38, 0.95)' : 'rgba(14, 28, 19, 0.75)'};
          border: 1px solid ${isChecked ? '#44ee88' : '#224830'};
          border-radius: 6px;
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          cursor: pointer;
          user-select: none;
          transition: all 0.15s ease;
          position: relative;
          box-shadow: ${isChecked ? '0 0 10px rgba(68,238,136,0.3)' : 'none'};
        `;

        card.onmouseenter = () => {
          if (!this.foliageSelectedModels.has(item.id)) {
            card.style.borderColor = '#387a50';
            card.style.background = 'rgba(20, 42, 28, 0.9)';
          }
        };
        card.onmouseleave = () => {
          if (!this.foliageSelectedModels.has(item.id)) {
            card.style.borderColor = '#224830';
            card.style.background = 'rgba(14, 28, 19, 0.75)';
          }
        };

        const iconCat = item.category === 'trees' ? '🌲' : (item.category === 'bushes' ? '🌿' : (item.category === 'dead_trees' ? '🪵' : (item.category === 'rocks' ? '🪨' : '🍄')));
        const baseFile = item.file.replace(/\.fbx$/i, '');
        const heightStr = this._getVegEstimatedHeight(item);

        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <input type="checkbox" style="cursor:pointer; accent-color:#33dd77;" ${isChecked ? 'checked' : ''} />
            <span style="font-size:8px; background:rgba(0,0,0,0.5); color:#88ffbb; padding:1px 4px; border-radius:3px;">${heightStr}</span>
          </div>
          <div style="height:65px; background:radial-gradient(circle at center, #1b3826 0%, #0c1810 100%); border-radius:4px; overflow:hidden; display:flex; align-items:center; justify-content:center; border:1px solid #1c3d28; padding:2px;">
            <img src="assets/props/icons/${baseFile}.webp?v=ico-6" alt="${item.nameRu}" style="max-height:100%; max-width:100%; object-fit:contain; filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6));" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
            <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:28px; opacity:0.8;">${iconCat}</div>
          </div>
          <div style="font-size:10px; font-weight:${isChecked ? 'bold' : 'normal'}; color:${isChecked ? '#ffffff' : '#cceedd'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.nameRu}">${item.nameRu}</div>
          <div style="font-size:8px; color:#668877; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.id}</div>
        `;

        const chk = card.querySelector('input[type="checkbox"]');
        const toggle = () => {
          if (this.foliageSelectedModels.has(item.id)) {
            this.foliageSelectedModels.delete(item.id);
          } else {
            this.foliageSelectedModels.add(item.id);
          }
          this.renderFoliagePalette();
        };

        chk.onchange = (e) => {
          e.stopPropagation();
          toggle();
        };
        card.onclick = () => toggle();

        container.appendChild(card);
      });
    }

    _bindFoliageControls() {
      if (!this.panel) return;

      const btnStudio = this.panel.querySelector('#btn-foliage-open-studio');
      if (btnStudio) {
        btnStudio.onclick = () => this.toggleFoliageStudioWindow();
      }

      const rngScaleMin = this.panel.querySelector('#rng-foliage-scale-min');
      const rngScaleMax = this.panel.querySelector('#rng-foliage-scale-max');
      const txtScaleRange = this.panel.querySelector('#txt-foliage-scale-range');
      const lblScaleMin = this.panel.querySelector('#lbl-foliage-min-scale');
      const lblScaleMax = this.panel.querySelector('#lbl-foliage-max-scale');

      const updateScaleUI = () => {
        let minS = parseFloat(rngScaleMin ? rngScaleMin.value : this.foliageMinScale) || 0.8;
        let maxS = parseFloat(rngScaleMax ? rngScaleMax.value : this.foliageMaxScale) || 1.3;
        if (minS > maxS) {
          if (this._lastScaleChanged === 'min') maxS = minS;
          else minS = maxS;
        }
        this.foliageMinScale = minS;
        this.foliageMaxScale = maxS;
        if (rngScaleMin) rngScaleMin.value = minS;
        if (rngScaleMax) rngScaleMax.value = maxS;
        if (lblScaleMin) lblScaleMin.textContent = minS.toFixed(2);
        if (lblScaleMax) lblScaleMax.textContent = maxS.toFixed(2);
        if (txtScaleRange) txtScaleRange.textContent = `${minS.toFixed(2)}x – ${maxS.toFixed(2)}x`;
      };

      if (rngScaleMin) {
        rngScaleMin.oninput = () => {
          this._lastScaleChanged = 'min';
          updateScaleUI();
        };
      }
      if (rngScaleMax) {
        rngScaleMax.oninput = () => {
          this._lastScaleChanged = 'max';
          updateScaleUI();
        };
      }

      const chkRandYaw = this.panel.querySelector('#chk-foliage-rand-yaw');
      if (chkRandYaw) {
        chkRandYaw.onchange = (e) => { this.foliageRandomYaw = !!e.target.checked; };
      }

      const chkRandTilt = this.panel.querySelector('#chk-foliage-rand-tilt');
      if (chkRandTilt) {
        chkRandTilt.onchange = (e) => { this.foliageRandomTilt = !!e.target.checked; };
      }

      const chkStacking = this.panel.querySelector('#chk-foliage-layer-stacking');
      if (chkStacking) {
        chkStacking.onchange = (e) => { this.foliageLayerStacking = !!e.target.checked; };
      }

      const rngDist = this.panel.querySelector('#rng-foliage-dist');
      const txtDist = this.panel.querySelector('#txt-foliage-dist');
      if (rngDist) {
        rngDist.oninput = (e) => {
          this.foliageMinDistance = Math.max(0.2, Math.min(30.0, parseFloat(e.target.value) || 2.0));
          if (txtDist) txtDist.textContent = this.foliageMinDistance.toFixed(1) + ' м';
        };
      }

      const rngDensity = this.panel.querySelector('#rng-foliage-density');
      const txtDensity = this.panel.querySelector('#txt-foliage-density');
      if (rngDensity) {
        rngDensity.oninput = (e) => {
          this.foliageDensity = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 3));
          if (txtDensity) txtDensity.textContent = this.foliageDensity + ' шт';
        };
      }

      const rngRadius = this.panel.querySelector('#rng-foliage-radius');
      if (rngRadius) {
        rngRadius.oninput = (e) => this.setFoliageBrushRadius(parseFloat(e.target.value));
      }

      const btnDrawMode = this.panel.querySelector('#btn-foliage-draw-mode');
      const btnEraseMode = this.panel.querySelector('#btn-foliage-erase-mode');
      if (btnDrawMode) btnDrawMode.onclick = () => this.setFoliageEraseMode(false);
      if (btnEraseMode) btnEraseMode.onclick = () => this.setFoliageEraseMode(true);

      const chkEraseSel = this.panel.querySelector('#chk-foliage-erase-sel-only');
      if (chkEraseSel) {
        chkEraseSel.onchange = (e) => { this.foliageEraseSelectedOnly = !!e.target.checked; };
      }

      const btnAllTrees = this.panel.querySelector('#btn-foliage-all-trees');
      if (btnAllTrees) {
        btnAllTrees.onclick = () => {
          const lib = window.PropsLibrary;
          if (lib) {
            const trees = lib.getByCategory('trees').concat(lib.getByCategory('dead_trees'));
            trees.forEach(t => this.foliageSelectedModels.add(t.id));
            this.renderFoliagePalette();
          }
        };
      }

      const btnAllBushes = this.panel.querySelector('#btn-foliage-all-bushes');
      if (btnAllBushes) {
        btnAllBushes.onclick = () => {
          const lib = window.PropsLibrary;
          if (lib) {
            const bushes = lib.getByCategory('bushes');
            bushes.forEach(b => this.foliageSelectedModels.add(b.id));
            this.renderFoliagePalette();
          }
        };
      }

      const btnClearSel = this.panel.querySelector('#btn-foliage-clear-sel');
      if (btnClearSel) {
        btnClearSel.onclick = () => {
          this.foliageSelectedModels.clear();
          this.renderFoliagePalette();
        };
      }

      const btnUndo = this.panel.querySelector('#btn-foliage-undo');
      if (btnUndo) btnUndo.onclick = () => this.undo();
      const btnRedo = this.panel.querySelector('#btn-foliage-redo');
      if (btnRedo) btnRedo.onclick = () => this.redo();

      const btnClearAll = this.panel.querySelector('#btn-foliage-clear-all');
      if (btnClearAll) {
        btnClearAll.onclick = () => this.clearAllFoliage();
      }

      const btnSaveServer = this.panel.querySelector('#btn-foliage-save-server');
      if (btnSaveServer) {
        btnSaveServer.onclick = () => this.saveToServer(false);
      }

      // Wind Controls Binding
      const chkWind = this.panel.querySelector('#chk-wind-enabled');
      const rngWindStr = this.panel.querySelector('#rng-wind-strength');
      const txtWindStr = this.panel.querySelector('#txt-wind-strength');
      const rngWindSpd = this.panel.querySelector('#rng-wind-speed');
      const txtWindSpd = this.panel.querySelector('#txt-wind-speed');
      const rngWindTurb = this.panel.querySelector('#rng-wind-turb');
      const txtWindTurb = this.panel.querySelector('#txt-wind-turb');
      const rngWindAng = this.panel.querySelector('#rng-wind-angle');
      const txtWindAng = this.panel.querySelector('#txt-wind-angle');
      const btnWindReset = this.panel.querySelector('#btn-wind-reset');

      const getAngleArrow = (deg) => {
        const arrows = ['↑ N', '↗ NE', '→ E', '↘ SE', '↓ S', '↙ SW', '← W', '↖ NW'];
        const idx = Math.round(((deg % 360) / 45)) % 8;
        return `${arrows[idx]} ${Math.round(deg)}°`;
      };

      const syncWindUIFromSystem = () => {
        const W = window.WindSystem;
        if (!W) return;
        if (chkWind) chkWind.checked = !!W.enabled;
        if (rngWindStr) rngWindStr.value = W.strength;
        if (txtWindStr) txtWindStr.textContent = `${W.strength.toFixed(2)}x`;
        if (rngWindSpd) rngWindSpd.value = W.speed;
        if (txtWindSpd) txtWindSpd.textContent = `${W.speed.toFixed(2)}x`;
        if (rngWindTurb) rngWindTurb.value = W.turbulence;
        if (txtWindTurb) txtWindTurb.textContent = `${W.turbulence.toFixed(2)}x`;
        if (rngWindAng) rngWindAng.value = W.angle;
        if (txtWindAng) txtWindAng.textContent = getAngleArrow(W.angle);
      };

      syncWindUIFromSystem();
      if (window.WindSystem && typeof window.WindSystem.onChange === 'function') {
        window.WindSystem.onChange(syncWindUIFromSystem);
      }

      if (chkWind) {
        chkWind.onchange = (e) => {
          if (window.WindSystem) {
            window.WindSystem.setEnabled(e.target.checked);
            window.WindSystem.saveSettings();
          }
        };
      }
      if (rngWindStr) {
        rngWindStr.oninput = (e) => {
          if (window.WindSystem) {
            const v = parseFloat(e.target.value) || 0.0;
            window.WindSystem.setStrength(v);
            if (txtWindStr) txtWindStr.textContent = `${v.toFixed(2)}x`;
            window.WindSystem.saveSettings();
          }
        };
      }
      if (rngWindSpd) {
        rngWindSpd.oninput = (e) => {
          if (window.WindSystem) {
            const v = parseFloat(e.target.value) || 1.0;
            window.WindSystem.setSpeed(v);
            if (txtWindSpd) txtWindSpd.textContent = `${v.toFixed(2)}x`;
            window.WindSystem.saveSettings();
          }
        };
      }
      if (rngWindTurb) {
        rngWindTurb.oninput = (e) => {
          if (window.WindSystem) {
            const v = parseFloat(e.target.value) || 0.0;
            window.WindSystem.setTurbulence(v);
            if (txtWindTurb) txtWindTurb.textContent = `${v.toFixed(2)}x`;
            window.WindSystem.saveSettings();
          }
        };
      }
      if (rngWindAng) {
        rngWindAng.oninput = (e) => {
          if (window.WindSystem) {
            const v = parseFloat(e.target.value) || 0.0;
            window.WindSystem.setAngle(v);
            if (txtWindAng) txtWindAng.textContent = getAngleArrow(v);
            window.WindSystem.saveSettings();
          }
        };
      }
      if (btnWindReset) {
        btnWindReset.onclick = () => {
          if (window.WindSystem) {
            window.WindSystem.resetDefaults();
            syncWindUIFromSystem();
          }
        };
      }
    }

    renderFoliagePalette() {
      const txtBadge = this.panel ? this.panel.querySelector('#txt-foliage-sel-badge') : null;
      if (txtBadge) {
        txtBadge.textContent = `${this.foliageSelectedModels.size} видов`;
      }

      const chipsContainer = this.panel ? this.panel.querySelector('#ed-foliage-selected-chips') : null;
      if (chipsContainer) {
        chipsContainer.innerHTML = '';
        if (this.foliageSelectedModels.size === 0) {
          chipsContainer.innerHTML = '<span style="color:#88aa99; font-size:9px; padding:2px;">⚠️ Ничего не выбрано (нажмите кнопку выше)</span>';
        } else {
          const lib = window.PropsLibrary;
          this.foliageSelectedModels.forEach(id => {
            const item = lib ? lib.getById(id) : null;
            const name = item ? item.nameRu : id;
            const chip = document.createElement('span');
            chip.style.cssText = `
              display:inline-flex; align-items:center; gap:3px; background:#1c4428; color:#aaffcc;
              border:1px solid #339955; border-radius:3px; padding:1px 5px; font-size:9px; cursor:pointer;
            `;
            chip.innerHTML = `<span>${name}</span> <b style="color:#ff8888; font-size:10px;">×</b>`;
            chip.title = 'Клик чтобы убрать из набора';
            chip.onclick = (e) => {
              e.stopPropagation();
              this.foliageSelectedModels.delete(id);
              this.renderFoliagePalette();
            };
            chipsContainer.appendChild(chip);
          });
        }
      }

      // Sync floating studio window
      this.renderFoliageStudioWindow();
    }

    setFoliageBrushRadius(r) {
      this.foliageBrushRadius = Math.max(2.0, Math.min(60.0, r));
      if (this.panel) {
        const inp = this.panel.querySelector('#rng-foliage-radius');
        const txt = this.panel.querySelector('#txt-foliage-radius');
        if (inp && parseFloat(inp.value) !== this.foliageBrushRadius) inp.value = this.foliageBrushRadius;
        if (txt) txt.textContent = this.foliageBrushRadius.toFixed(1) + ' м';
      }
      if (this._foliageBrushProjector) {
        this._foliageBrushProjector.scale.set(this.foliageBrushRadius, 1, this.foliageBrushRadius);
      }
    }

    setFoliageEraseMode(isErase) {
      this.foliageIsErase = !!isErase;
      if (!this.panel) return;
      const bDraw = this.panel.querySelector('#btn-foliage-draw-mode');
      const bErase = this.panel.querySelector('#btn-foliage-erase-mode');
      const status = this.panel.querySelector('#ed-foliage-status');
      if (bDraw) {
        bDraw.style.background = !isErase ? 'linear-gradient(180deg,#246630,#16401e)' : '#16281e';
        bDraw.style.border = !isErase ? '1px solid #44aa66' : '1px solid #285536';
        bDraw.style.color = !isErase ? '#aaffcc' : '#88aa99';
      }
      if (bErase) {
        bErase.style.background = isErase ? 'linear-gradient(180deg,#882222,#441111)' : '#281616';
        bErase.style.border = isErase ? '1px solid #cc4444' : '1px solid #552222';
        bErase.style.color = isErase ? '#ffcccc' : '#aa7777';
      }
      if (status) {
        status.textContent = isErase ? '🧼 Ластик: стирание' : '🖌️ Кисть: сажать';
        status.style.color = isErase ? '#ffaaaa' : '#88ffbb';
      }
    }

    _initFoliageBrushProjector() {
      if (this._foliageBrushProjector) return;
      const group = new THREE.Group();
      group.name = '_foliageBrushProjector';

      // Outer ring
      const outerGeo = new THREE.RingGeometry(0.96, 1.0, 48);
      outerGeo.rotateX(-Math.PI / 2);
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0x33ee77,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthTest: false
      });
      const outerRing = new THREE.Mesh(outerGeo, outerMat);
      outerRing.name = 'outerRing';
      group.add(outerRing);

      // Inner density ring
      const innerGeo = new THREE.RingGeometry(0.48, 0.52, 36);
      innerGeo.rotateX(-Math.PI / 2);
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0x88ffbb,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
        depthTest: false
      });
      const innerRing = new THREE.Mesh(innerGeo, innerMat);
      innerRing.name = 'innerRing';
      group.add(innerRing);

      // Center dot
      const dotGeo = new THREE.CircleGeometry(0.12, 16);
      dotGeo.rotateX(-Math.PI / 2);
      const dotMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthTest: false
      });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      group.add(dot);

      group.visible = false;
      this.scene.add(group);
      this._foliageBrushProjector = group;
    }

    _updateFoliageBrushProjector(worldPos, isErase) {
      if (!this._foliageBrushProjector) this._initFoliageBrushProjector();
      if (!this._foliageBrushProjector) return;
      if (!worldPos || (this.editorMode !== 'foliage' && !this.drawFoliageMode)) {
        this._foliageBrushProjector.visible = false;
        return;
      }
      this._foliageBrushProjector.visible = true;
      const gh = (window.Terrain ? window.Terrain.heightAt(worldPos.x, worldPos.z) : worldPos.y) + 0.3;
      this._foliageBrushProjector.position.set(worldPos.x, gh, worldPos.z);
      this._foliageBrushProjector.scale.set(this.foliageBrushRadius, 1, this.foliageBrushRadius);

      const outerRing = this._foliageBrushProjector.getObjectByName('outerRing');
      const innerRing = this._foliageBrushProjector.getObjectByName('innerRing');
      const erase = isErase || this.foliageIsErase;
      const targetCol = erase ? 0xff3344 : 0x33ee77;
      if (outerRing && outerRing.material) outerRing.material.color.setHex(targetCol);
      if (innerRing && innerRing.material) innerRing.material.color.setHex(erase ? 0xff8866 : 0x88ffbb);
    }

    _foliageGridKey(x, z, cellSize = 8) {
      const cx = Math.floor(x / cellSize);
      const cz = Math.floor(z / cellSize);
      return `${cx}_${cz}`;
    }

    _getFoliageLayer(modelId, p) {
      const id = String(modelId || (p && (p.modelId || p.modelFile || p.id)) || '').toLowerCase();
      if (/field_poppy|poppy|flower|blossom|rose|tulip/i.test(id)) return 'flower';
      if (/matted_pratia|pratia|grass|lawn|clover/i.test(id)) return 'grass';
      if (/bush|fern|plant/i.test(id)) return 'bush';
      if (/tree|pine|spruce|small_tree|dead_tree/i.test(id)) return 'tree';
      if (/rock|stone|boulder|mushroom|stump|log|decor/i.test(id)) return 'decor';
      return 'foliage';
    }

    _buildFoliageSpatialGrid() {
      this._foliageSpatialGrid = new Map();
      const WM = window.WorldMetrics;
      if (!WM || !WM.CUSTOM_PROPS) return;

      const lib = window.PropsLibrary;
      const vegIds = new Set();
      if (lib) {
        ['trees', 'bushes', 'dead_trees', 'forest_decor', 'rocks'].forEach(cat => {
          lib.getByCategory(cat).forEach(item => vegIds.add(item.id));
        });
      }

      WM.CUSTOM_PROPS.forEach(p => {
        if (!p || !p.position) return;
        const isVeg = p.isFoliage || (p.modelId && vegIds.has(p.modelId)) || (p.meshType === 'fbx' && vegIds.has(p.modelId)) || /poppy|pratia|flower|grass|tree|bush/i.test(p.modelId || '');
        if (!isVeg) return;
        this._addFoliageToGrid(p);
      });
    }

    _addFoliageToGrid(p) {
      if (!p || !p.position) return;
      const key = this._foliageGridKey(p.position.x, p.position.z, 8);
      if (!this._foliageSpatialGrid.has(key)) {
        this._foliageSpatialGrid.set(key, []);
      }
      const layer = this._getFoliageLayer(p.modelId, p);
      this._foliageSpatialGrid.get(key).push({
        id: p.id,
        x: p.position.x,
        z: p.position.z,
        modelId: p.modelId,
        layer: layer,
        propData: p
      });
    }

    _removeFoliageFromGrid(propId, x, z) {
      const key = this._foliageGridKey(x, z, 8);
      const list = this._foliageSpatialGrid.get(key);
      if (list) {
        const idx = list.findIndex(i => i.id === propId);
        if (idx !== -1) list.splice(idx, 1);
      }
    }

    /**
     * Проверка дистанции с учётом слоёв зелени:
     * Если включена многослойность (foliageLayerStacking = true), дистанция проверяется ТОЛЬКО
     * внутри одного слоя (цветы среди цветов, деревья среди деревьев).
     * Трава не блокирует цветы, а цветы не блокируют кусты и деревья!
     */
    _isFoliageTooClose(x, z, minDist, candidateModelId) {
      const cellSize = 8;
      const cx = Math.floor(x / cellSize);
      const cz = Math.floor(z / cellSize);
      const minDistSq = minDist * minDist;
      const candLayer = this._getFoliageLayer(candidateModelId);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const k = `${cx + dx}_${cz + dz}`;
          const items = this._foliageSpatialGrid.get(k);
          if (!items) continue;
          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (this.foliageLayerStacking && it.layer !== candLayer) {
              continue; // Другой слой зелени — разрешаем наслаивание!
            }
            const dSq = (it.x - x) * (it.x - x) + (it.z - z) * (it.z - z);
            if (dSq < minDistSq) return true;
          }
        }
      }
      return false;
    }

    _applyFoliageStrokeAt(worldX, worldZ, isErase) {
      if (isErase || this.foliageIsErase) {
        this._applyFoliageEraseAt(worldX, worldZ);
        return;
      }

      if (!this.foliageSelectedModels || this.foliageSelectedModels.size === 0) {
        if (this.game && this.game.addChatMessage && !this._foliageWarnShown) {
          this._foliageWarnShown = true;
          this.game.addChatMessage('[Кисть] ⚠️ Выберите хотя бы один тип растения в палитре', 'system');
          setTimeout(() => { this._foliageWarnShown = false; }, 3000);
        }
        return;
      }

      const pool = Array.from(this.foliageSelectedModels);
      const lib = window.PropsLibrary;
      const WM = window.WorldMetrics;
      if (!WM || !WM.CUSTOM_PROPS) return;

      const r = this.foliageBrushRadius || 16.0;
      const minDist = this.foliageMinDistance || 2.0;
      const density = this.foliageDensity || 3;

      // Sample interpolation points between last position and current position
      const points = [];
      if (!this.foliageLastPos) {
        points.push({ x: worldX, z: worldZ });
      } else {
        const dx = worldX - this.foliageLastPos.x;
        const dz = worldZ - this.foliageLastPos.z;
        const dist = Math.hypot(dx, dz);
        const steps = Math.min(6, Math.max(1, Math.ceil(dist / Math.max(2.0, r * 0.4))));
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          points.push({
            x: this.foliageLastPos.x + dx * t,
            z: this.foliageLastPos.z + dz * t
          });
        }
      }
      this.foliageLastPos = { x: worldX, z: worldZ };

      const attemptsPerPoint = density * 3;
      const minS = this.foliageMinScale || 0.8;
      const maxS = this.foliageMaxScale || 1.3;

      points.forEach(pt => {
        let placedThisPoint = 0;
        for (let a = 0; a < attemptsPerPoint && placedThisPoint < density; a++) {
          // Uniform random point in circle
          const distNorm = Math.sqrt(Math.random()) * r;
          const ang = Math.random() * Math.PI * 2;
          const candX = pt.x + Math.cos(ang) * distNorm;
          const candZ = pt.z + Math.sin(ang) * distNorm;

          // Pick candidate model from selected pool
          const modelId = pool[Math.floor(Math.random() * pool.length)];

          // Check if spot has existing vegetation too close within its layer
          if (this._isFoliageTooClose(candX, candZ, minDist, modelId)) continue;

          const libItem = lib ? lib.getById(modelId) : null;
          const defaultScale = (libItem && libItem.defaultScale) ? libItem.defaultScale : 1.0;

          // Random scale factor
          const randFactor = minS + Math.random() * (maxS - minS);
          const finalScale = defaultScale * randFactor;

          // Random rotation
          const rotY = this.foliageRandomYaw ? (Math.random() * Math.PI * 2) : 0;
          let rotX = 0, rotZ = 0;
          if (this.foliageRandomTilt) {
            rotX = (Math.random() - 0.5) * 0.14;
            rotZ = (Math.random() - 0.5) * 0.14;
          }

          const gh = window.Terrain ? window.Terrain.heightAt(candX, candZ) : 0;

          const propId = 'foliage_' + modelId + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
          const fileName = (libItem && libItem.file) ? libItem.file : (modelId + '.fbx');

          const propData = {
            id: propId,
            name: (libItem ? libItem.nameRu : modelId) + ' (Растительность)',
            type: 'prop',
            meshType: 'fbx',
            modelId: modelId,
            modelFile: fileName,
            position: { x: candX, y: gh, z: candZ },
            rotation: { x: rotX, y: rotY, z: rotZ },
            scale: { x: finalScale, y: finalScale, z: finalScale },
            isFoliage: true
          };

          WM.CUSTOM_PROPS.push(propData);
          if (this._foliageInstancer) {
            this._foliageInstancer.addInstance(propData);
          } else {
            this.spawnCustomPropMesh(propData);
          }
          this._addFoliageToGrid(propData);

          if (this._currentFoliageStroke) {
            this._currentFoliageStroke.added.push(propData);
          }

          placedThisPoint++;
        }
      });
    }

    _applyFoliageEraseAt(worldX, worldZ) {
      const r = this.foliageBrushRadius || 16.0;
      const rSq = r * r;
      const WM = window.WorldMetrics;
      if (!WM || !WM.CUSTOM_PROPS) return;

      const cellSize = 8;
      const minCx = Math.floor((worldX - r) / cellSize);
      const maxCx = Math.floor((worldX + r) / cellSize);
      const minCz = Math.floor((worldZ - r) / cellSize);
      const maxCz = Math.floor((worldZ + r) / cellSize);

      const toRemove = [];

      for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cz = minCz; cz <= maxCz; cz++) {
          const k = `${cx}_${cz}`;
          const items = this._foliageSpatialGrid.get(k);
          if (!items) continue;

          for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            const dSq = (it.x - worldX) * (it.x - worldX) + (it.z - worldZ) * (it.z - worldZ);
            if (dSq <= rSq) {
              if (this.foliageEraseSelectedOnly && !this.foliageSelectedModels.has(it.modelId)) {
                continue;
              }
              toRemove.push(it);
              items.splice(i, 1);
            }
          }
        }
      }

      if (toRemove.length === 0) return;

      const removeIds = new Set(toRemove.map(t => t.id));

      // Remove from FoliageInstancer, Scene & customPropMeshes
      toRemove.forEach(it => {
        if (this._foliageInstancer) {
          this._foliageInstancer.removeInstance(it.id);
        }
        const mesh = this.customPropMeshes.get(it.id);
        if (mesh) {
          if (mesh.parent) mesh.parent.remove(mesh);
          mesh.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
              if (Array.isArray(c.material)) c.material.forEach(m => m.dispose && m.dispose());
              else if (c.material.dispose) c.material.dispose();
            }
          });
          this.customPropMeshes.delete(it.id);
        }
        if (WM && WM.markMeshDeleted) {
          WM.markMeshDeleted(it.id);
        }
        if (this._currentFoliageStroke) {
          this._currentFoliageStroke.removed.push(it.propData);
        }
      });

      // Remove from CUSTOM_PROPS
      WM.CUSTOM_PROPS = WM.CUSTOM_PROPS.filter(p => !removeIds.has(p.id));
    }

    clearAllFoliage() {
      const WM = window.WorldMetrics;
      if (!WM || !WM.CUSTOM_PROPS) return;

      const lib = window.PropsLibrary;
      const vegIds = new Set();
      if (lib) {
        ['trees', 'bushes', 'dead_trees', 'forest_decor', 'rocks'].forEach(cat => {
          lib.getByCategory(cat).forEach(item => vegIds.add(item.id));
        });
      }

      const toRemove = WM.CUSTOM_PROPS.filter(p => p.isFoliage || (p.modelId && vegIds.has(p.modelId)));
      if (toRemove.length === 0) {
        if (this.game && this.game.addChatMessage) this.game.addChatMessage('[Кисть] Нет нарисованной растительности для удаления.', 'system');
        return;
      }

      if (!confirm(`Удалить ВСЮ нарисованную растительность (${toRemove.length} шт.) с карты?`)) return;

      this.pushHistory(`очистить растительность (${toRemove.length} шт)`);

      if (this._foliageInstancer) {
        this._foliageInstancer.clearAll();
      }

      const removeIds = new Set(toRemove.map(t => t.id));
      toRemove.forEach(it => {
        const mesh = this.customPropMeshes.get(it.id);
        if (mesh) {
          if (mesh.parent) mesh.parent.remove(mesh);
          this.customPropMeshes.delete(it.id);
        }
      });

      WM.CUSTOM_PROPS = WM.CUSTOM_PROPS.filter(p => !removeIds.has(p.id));
      this._foliageSpatialGrid.clear();

      this.saveToLocalStorage();
      this.saveToServer(true);

      if (this.game && this.game.addChatMessage) {
        this.game.addChatMessage(`[Кисть] 🗑️ Удалено ${toRemove.length} шт. растительности (Ctrl+Z для отмены).`, 'system');
      }
    }

    // ============================================================
    //  ДИНАМИЧЕСКИЙ МАСШТАБ ПИВОТА ПОД ДИСТАНЦИЮ КАМЕРЫ (UNREAL STYLE)
    // ============================================================
    update() {
      if (this.enabled) {
        this._refreshDayNightLabel();
        if (!this._todSyncT || Date.now() - this._todSyncT > 400) {
          this._todSyncT = Date.now();
          this._syncDayNightFromGame();
        }
        // BSP build status (throttled)
        if (!this._bspStatusT || Date.now() - this._bspStatusT > 400) {
          this._bspStatusT = Date.now();
          try { this._refreshBspBuildStatus(); } catch (e) {}
        }
        // Zone edit handles: always screen-sized vs camera
        if (this.zoneEditMode) {
          try { this._updateZoneEditHandleScales(); } catch (e) {}
        }
      }
      if (!this.enabled || !this.selectedObject || !this.gizmoGroup.visible) return;

      const camDist = this.camera.position.distanceTo(this.gizmoGroup.position);
      const scaleFactor = Math.max(0.2, camDist * 0.08);
      this.gizmoGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);
    }

    // ============================================================
    //  ИНСПЕКТОР UI
    // ============================================================
    updateInspectorFields() {
      if (!this.selectedObject) return;

      const o = this.selectedObject;
      const WM = window.WorldMetrics;

      const u = WM ? (o.position.x - WM.MIN_X) / WM.W : 0.5;
      const v = WM ? (o.position.z - WM.MIN_Z) / WM.H : 0.5;

      const infoContainer = this.panel.querySelector('#ed-selected-info');

      // ---- BSP brush: shape, op, size, texture, UV ----
      if (o.type === 'bsp') {
        const b = o.targetData || {};
        const palette = (window.BspBrushes && window.BspBrushes.getPalette()) || [];
        const texOpts = palette.map(p => {
          const sel = (p.id === (b.texture || '')) ? ' selected' : '';
          return `<option value="${(p.id || '').replace(/"/g, '&quot;')}"${sel}>${p.label}</option>`;
        }).join('');
        const colorHex = '#' + ((typeof b.color === 'number' ? b.color : 0xb0a090) >>> 0).toString(16).padStart(6, '0');
        const opLabel = b.op === 'sub' ? 'SUBTRACTIVE' : 'ADDITIVE';
        const opCol = b.op === 'sub' ? '#ff6688' : '#66ffaa';
        infoContainer.innerHTML = `
          <div style="font-weight:bold; color:#88ccff; font-size:13px; margin-bottom:4px;">🧱 ${o.name || 'BSP'}</div>
          <div style="color:#888; font-size:10px; margin-bottom:6px;">ID: ${o.id} · <span style="color:${opCol}">${opLabel}</span> · ${b.shape || 'box'}</div>
          <div style="margin-bottom:6px;">
            <label style="color:#ffaa44; font-size:10px;">Название:</label>
            <input type="text" id="inp-bsp-name" value="${(b.name || o.name || '').replace(/"/g, '&quot;')}" style="width:100%; background:#222; color:#cceeff; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:6px;">
            <div>
              <label style="color:#ffaa44; font-size:10px;">Операция:</label>
              <select id="inp-bsp-op" style="width:100%; background:#222; color:#fff; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;">
                <option value="add"${b.op !== 'sub' ? ' selected' : ''}>＋ Additive</option>
                <option value="sub"${b.op === 'sub' ? ' selected' : ''}>− Subtractive</option>
              </select>
            </div>
            <div>
              <label style="color:#ffaa44; font-size:10px;">Форма:</label>
              <select id="inp-bsp-shape" style="width:100%; background:#222; color:#fff; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;">
                <option value="box"${(b.shape || 'box') === 'box' ? ' selected' : ''}>Cube</option>
                <option value="cylinder"${b.shape === 'cylinder' ? ' selected' : ''}>Cylinder</option>
                <option value="wedge"${b.shape === 'wedge' ? ' selected' : ''}>Wedge</option>
                <option value="cone"${b.shape === 'cone' ? ' selected' : ''}>Cone</option>
                <option value="stairs"${b.shape === 'stairs' ? ' selected' : ''}>Stairs</option>
                <option value="sheet"${b.shape === 'sheet' ? ' selected' : ''}>Sheet</option>
              </select>
            </div>
            <div>
              <label style="color:#ffaa44; font-size:10px;">X (центр):</label>
              <input type="number" step="0.5" id="inp-pos-x" value="${o.position.x.toFixed(2)}" style="width:100%; background:#222; color:#44ffaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>
            <div>
              <label style="color:#ffaa44; font-size:10px;">Z (центр):</label>
              <input type="number" step="0.5" id="inp-pos-z" value="${o.position.z.toFixed(2)}" style="width:100%; background:#222; color:#44ffaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>
            <div>
              <label style="color:#ffaa44; font-size:10px;">Y (центр):</label>
              <input type="number" step="0.5" id="inp-pos-y" value="${o.position.y.toFixed(2)}" style="width:100%; background:#222; color:#44ffaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>
            <div>
              <label style="color:#ffaa44; font-size:10px;">RotY (°):</label>
              <input type="number" step="5" id="inp-rot-y" value="${((o.rotation.y * 180) / Math.PI).toFixed(1)}" style="width:100%; background:#222; color:#ffddaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>
            <div>
              <label style="color:#ffaa44; font-size:10px;">Ширина X (м):</label>
              <input type="number" min="0.1" step="0.5" id="inp-bsp-sx" value="${(b.size && b.size.x != null ? b.size.x : o.scale.x).toFixed(2)}" style="width:100%; background:#222; color:#aaccff; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>
            <div>
              <label style="color:#ffaa44; font-size:10px;">Высота Y (м):</label>
              <input type="number" min="0.1" step="0.5" id="inp-bsp-sy" value="${(b.size && b.size.y != null ? b.size.y : o.scale.y).toFixed(2)}" style="width:100%; background:#222; color:#aaccff; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>
            <div>
              <label style="color:#ffaa44; font-size:10px;">Глубина Z (м):</label>
              <input type="number" min="0.1" step="0.5" id="inp-bsp-sz" value="${(b.size && b.size.z != null ? b.size.z : o.scale.z).toFixed(2)}" style="width:100%; background:#222; color:#aaccff; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>
            <div>
              <label style="color:#ffaa44; font-size:10px;">Цвет tint:</label>
              <input type="color" id="inp-bsp-color" value="${colorHex}" style="width:100%; height:26px; background:#222; border:1px solid #444; border-radius:3px; cursor:pointer;" />
            </div>
          </div>
          <div style="margin-bottom:6px; padding:6px; background:rgba(0,40,60,0.4); border:1px solid #336688; border-radius:4px;">
            <div style="color:#88ccff; font-size:11px; font-weight:bold; margin-bottom:4px;">🎨 Текстура</div>
            <label style="color:#ffaa44; font-size:10px;">Материал (весь brush):</label>
            <select id="inp-bsp-tex" style="width:100%; background:#222; color:#fff; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit; margin-bottom:4px;">
              ${texOpts}
            </select>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
              <div>
                <label style="color:#ffaa44; font-size:10px;">UV scale (на м):</label>
                <input type="number" min="0.01" step="0.05" id="inp-bsp-uv" value="${(b.uvScale != null ? b.uvScale : 0.25)}" style="width:100%; background:#222; color:#ffeeaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
              </div>
              <div style="display:flex; align-items:flex-end; padding-bottom:2px;">
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:11px;">
                  <input type="checkbox" id="inp-bsp-col" ${b.collision !== false ? 'checked' : ''} />
                  Коллизия
                </label>
              </div>
            </div>
            <div style="margin-top:6px; color:#8899aa; font-size:10px;">Per-face: выбери грань → текстура только на неё</div>
            <div style="display:flex; gap:3px; flex-wrap:wrap; margin-top:4px;">
              ${['py','ny','px','nx','pz','nz'].map(fk => {
                const labels = { py:'↑Top', ny:'↓Bot', px:'+X', nx:'−X', pz:'+Z', nz:'−Z' };
                const has = b.faces && b.faces[fk] && b.faces[fk].texture;
                return `<button type="button" class="ed-bsp-face" data-face="${fk}" style="flex:1; min-width:44px; background:${has ? '#335566' : '#222'}; color:#cceeff; border:1px solid #557788; padding:3px; border-radius:3px; cursor:pointer; font-size:10px;">${labels[fk]}</button>`;
              }).join('')}
            </div>
            <div id="ed-bsp-face-row" style="display:none; margin-top:6px;">
              <label style="color:#ffaa44; font-size:10px;">Текстура грани <span id="ed-bsp-face-name"></span>:</label>
              <select id="inp-bsp-face-tex" style="width:100%; background:#222; color:#fff; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;">
                <option value="__inherit__">= как у brush</option>
                ${texOpts}
              </select>
              <button type="button" id="ed-bsp-face-clear" style="margin-top:4px; width:100%; background:#442222; color:#ffaaaa; border:1px solid #aa5555; padding:3px; border-radius:3px; cursor:pointer; font-size:10px;">Сбросить грань</button>
            </div>
          </div>
          <div style="background:rgba(0,180,255,0.1); border:1px solid #00aaaa; padding:4px 8px; border-radius:4px; color:#00ffff; font-size:11px;">
            W/E/R — сдвиг / поворот / размер · u/v: <strong>${u.toFixed(3)}</strong>, <strong>${v.toFixed(3)}</strong>
          </div>
        `;
        const applyBsp = () => this.applyBspFromInputs();
        ['inp-bsp-name', 'inp-bsp-op', 'inp-bsp-shape', 'inp-pos-x', 'inp-pos-y', 'inp-pos-z', 'inp-rot-y',
          'inp-bsp-sx', 'inp-bsp-sy', 'inp-bsp-sz', 'inp-bsp-color', 'inp-bsp-tex', 'inp-bsp-uv', 'inp-bsp-col'
        ].forEach(id => {
          const el = infoContainer.querySelector('#' + id);
          if (el) el.onchange = applyBsp;
        });
        let activeFace = null;
        infoContainer.querySelectorAll('.ed-bsp-face').forEach(btn => {
          btn.onclick = () => {
            activeFace = btn.getAttribute('data-face');
            const row = infoContainer.querySelector('#ed-bsp-face-row');
            const nameEl = infoContainer.querySelector('#ed-bsp-face-name');
            const sel = infoContainer.querySelector('#inp-bsp-face-tex');
            if (row) row.style.display = 'block';
            if (nameEl) nameEl.textContent = activeFace;
            const cur = (b.faces && b.faces[activeFace] && b.faces[activeFace].texture != null)
              ? b.faces[activeFace].texture
              : '__inherit__';
            if (sel) sel.value = cur === '' || cur == null ? '__inherit__' : cur;
            infoContainer.querySelectorAll('.ed-bsp-face').forEach(x => {
              x.style.outline = (x.getAttribute('data-face') === activeFace) ? '2px solid #ffaa44' : 'none';
            });
          };
        });
        const faceSel = infoContainer.querySelector('#inp-bsp-face-tex');
        if (faceSel) {
          faceSel.onchange = () => {
            if (!activeFace) return;
            this.applyBspFaceTexture(activeFace, faceSel.value === '__inherit__' ? null : faceSel.value);
          };
        }
        const faceClr = infoContainer.querySelector('#ed-bsp-face-clear');
        if (faceClr) {
          faceClr.onclick = () => {
            if (!activeFace) return;
            this.applyBspFaceTexture(activeFace, null, true);
          };
        }
        return;
      }

      // ---- Земля: дороги, трава, площади ----
      if (o.type === 'ground') {
        const m = o.targetData || {};
        const lab = m.surface === 'grass' ? 'Трава' : (m.surface === 'plaza' ? 'Площадь' : 'Дорога');
        const kind = m.kind === 'line' ? 'Линия (дорога)' : 'Полигон (пятно)';
        infoContainer.innerHTML = `
          <div style="font-weight:bold; color:#aaff88; font-size:13px; margin-bottom:4px;">🌿 ${o.name}</div>
          <div style="color:#888; font-size:10px; margin-bottom:6px;">ID: ${o.id} | Тип: ЗЕМЛЯ (${lab.toUpperCase()})</div>

          <div style="background:rgba(40,80,30,0.3); border:1px solid #44aa44; padding:8px; border-radius:4px; margin-bottom:8px;">
            <div style="color:#ccffaa; font-size:11px; margin-bottom:4px;">Поверхность: <b>${lab}</b></div>
            <div style="color:#aacc99; font-size:11px; margin-bottom:4px;">Форма: <b>${kind}</b></div>
            <div style="color:#aacc99; font-size:11px; margin-bottom:4px;">Ширина: <b>${m.width || 8}м</b> · Точек пути: <b>${(m.poly || []).length}</b></div>
          </div>

          <div style="display:flex; flex-direction:column; gap:6px;">
            <button type="button" id="btn-del-ground-inspect" style="width:100%; background:#771122; color:#ffcccc; border:1px solid #cc4455; padding:8px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">🗑️ Удалить этот объект (Delete)</button>
          </div>
        `;
        const delBtn = infoContainer.querySelector('#btn-del-ground-inspect');
        if (delBtn) delBtn.onclick = () => this.deleteSelected();
        return;
      }

      // ---- Зона охоты: имя + уровни + размер ----
      if (o.type === 'hunt') {
        const hz = o.targetData || {};
        const isTerr = hz.kind === 'territory';
        const l0 = (hz.lvl && hz.lvl[0] != null) ? hz.lvl[0] : 1;
        const l1 = (hz.lvl && hz.lvl[1] != null) ? hz.lvl[1] : 10;
        const ww = hz.w != null ? hz.w : Math.abs((hz.bounds && hz.bounds[2] - hz.bounds[0]) || 0);
        const dd = hz.d != null ? hz.d : Math.abs((hz.bounds && hz.bounds[3] - hz.bounds[1]) || 0);
        const isPoly = hz.shape === 'poly' && ((hz.poly && hz.poly.length >= 3) || (hz.polyWorld && hz.polyWorld.length >= 3));
        const nVerts = isPoly ? (hz.polyWorld ? hz.polyWorld.length : hz.poly.length) : 4;
        const sizeFields = isPoly
          ? `<div style="grid-column:1/-1;color:#aaccff;font-size:11px;padding:4px 0;">Многоугольник: <b>${nVerts}</b> вершин · W — сдвиг · R — масштаб</div>`
          : `<div>
              <label style="color:#ffaa44; font-size:10px;">Ширина (м):</label>
              <input type="number" min="2" step="1" id="inp-hunt-w" value="${ww.toFixed(1)}" style="width:100%; background:#222; color:#aaccff; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>
            <div>
              <label style="color:#ffaa44; font-size:10px;">Глубина (м):</label>
              <input type="number" min="2" step="1" id="inp-hunt-d" value="${dd.toFixed(1)}" style="width:100%; background:#222; color:#aaccff; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>`;
        const editOn = this.zoneEditMode && this._zoneEditId === o.id;
        const titleCol = isTerr ? '#88bbff' : '#ff8866';
        const kindLabel = isTerr ? 'ТЕРРИТОРИЯ' : 'ОХОТА';
        infoContainer.innerHTML = `
          <div style="font-weight:bold; color:${titleCol}; font-size:13px; margin-bottom:4px;">${isTerr ? '🗺' : '⚔️'} ${o.name}</div>
          <div style="color:#888; font-size:10px; margin-bottom:6px;">ID: ${o.id} | ${kindLabel} | ${isPoly ? 'ПОЛИГОН · ' + nVerts + 'в' : 'ПРЯМОУГОЛЬНИК'}</div>
          <button id="ed-btn-zone-edit" style="width:100%; margin-bottom:8px; background:${editOn ? '#aa4422' : '#444211'}; color:${editOn ? '#fff' : '#ffcc99'}; border:1px solid #ff8844; padding:8px; border-radius:4px; cursor:pointer; font-family:inherit; font-weight:bold; font-size:12px;">
            ${editOn ? '🟧 Edit Mode ON · Tab / клик — выход' : '🟧 Edit Mode (Tab) — вершины как в Blender'}
          </button>
          <div id="ed-zone-edit-hint" style="display:${editOn ? 'block' : 'none'}; margin-bottom:8px; padding:6px; background:rgba(170,60,20,0.25); border:1px solid #cc6633; border-radius:4px; color:#ffddcc; font-size:10px; line-height:1.45;">
            <b>ЛКМ</b> — выбрать вершину · <b>Shift+ЛКМ</b> — +к выделению<br/>
            <b>Drag</b> — двигать выделенные<br/>
            <b>Клик по ребру / ◆</b> — вставить вершину на edge<br/>
            <b>X / Del</b> — удалить вершину (≥4) · <b>A</b> — снять выделение<br/>
            <b>Tab</b> — выйти из Edit Mode
          </div>
          <div style="margin-bottom:6px;">
            <label style="color:#ffaa44; font-size:10px;">Название:</label>
            <input type="text" id="inp-hunt-name" value="${(hz.name || o.name || '').replace(/"/g, '&quot;')}" style="width:100%; background:#222; color:#ffddaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" ${editOn ? 'disabled' : ''} />
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; margin-bottom:6px;">
            ${isTerr ? '' : `
            <div>
              <label style="color:#ffaa44; font-size:10px;">Ур. мин:</label>
              <input type="number" min="0" max="99" step="1" id="inp-hunt-lvl0" value="${l0}" style="width:100%; background:#222; color:#ff8866; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>
            <div>
              <label style="color:#ffaa44; font-size:10px;">Ур. макс:</label>
              <input type="number" min="0" max="99" step="1" id="inp-hunt-lvl1" value="${l1}" style="width:100%; background:#222; color:#ff8866; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>`}
            <div>
              <label style="color:#ffaa44; font-size:10px;">Центр X:</label>
              <input type="number" step="0.5" id="inp-pos-x" value="${o.position.x.toFixed(2)}" style="width:100%; background:#222; color:#44ffaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" ${editOn ? 'disabled' : ''} />
            </div>
            <div>
              <label style="color:#ffaa44; font-size:10px;">Центр Z:</label>
              <input type="number" step="0.5" id="inp-pos-z" value="${o.position.z.toFixed(2)}" style="width:100%; background:#222; color:#44ffaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" ${editOn ? 'disabled' : ''} />
            </div>
            ${editOn ? '' : sizeFields}
          </div>
          <div style="background:${isTerr ? 'rgba(40,100,200,0.15)' : 'rgba(255,100,60,0.12)'}; border:1px solid ${isTerr ? '#4488aa' : '#aa5533'}; padding:4px 8px; border-radius:4px; color:${isTerr ? '#aaccff' : '#ffaa88'}; font-size:11px;">
            u/v: <strong>${u.toFixed(3)}</strong>, <strong>${v.toFixed(3)}</strong>
            ${editOn ? ' · выбрано: <b>' + this._zoneSelectedVerts.size + '</b>' : ''}
          </div>
        `;
        const editBtn = infoContainer.querySelector('#ed-btn-zone-edit');
        if (editBtn) editBtn.onclick = () => this.toggleZoneEditMode();
        const applyHunt = () => this.applyHuntZoneFromInputs();
        ['inp-hunt-name', 'inp-hunt-lvl0', 'inp-hunt-lvl1', 'inp-pos-x', 'inp-pos-z', 'inp-hunt-w', 'inp-hunt-d'].forEach(id => {
          const el = infoContainer.querySelector('#' + id);
          if (el) el.onchange = applyHunt;
        });
        return;
      }

      const curSx = (o.scale && typeof o.scale.x === 'number' && isFinite(o.scale.x)) ? o.scale.x : 1;
      const curSy = (o.scale && typeof o.scale.y === 'number' && isFinite(o.scale.y)) ? o.scale.y : curSx;
      const curSz = (o.scale && typeof o.scale.z === 'number' && isFinite(o.scale.z)) ? o.scale.z : curSx;

      const curPosX = (o.position && typeof o.position.x === 'number' && isFinite(o.position.x)) ? o.position.x : 0;
      const curPosY = (o.position && typeof o.position.y === 'number' && isFinite(o.position.y)) ? o.position.y : 0;
      const curPosZ = (o.position && typeof o.position.z === 'number' && isFinite(o.position.z)) ? o.position.z : 0;
      const curRotY = (o.rotation && typeof o.rotation.y === 'number' && isFinite(o.rotation.y)) ? o.rotation.y : 0;

      const isProp = (o.type === 'prop' || o.type === 'direct_mesh');
      const propData = (o.targetData && typeof o.targetData === 'object') ? o.targetData : o;
      const hasCol = isProp ? (propData.collision !== false && propData.hasCollision !== false) : false;
      const colShape = isProp ? (propData.collisionShape || 'box') : 'box';

      const colSizeX = (propData.collisionSize && typeof propData.collisionSize.x === 'number') ? propData.collisionSize.x : ((propData.rawSize && propData.rawSize.x) || 3.0);
      const colSizeY = (propData.collisionSize && typeof propData.collisionSize.y === 'number') ? propData.collisionSize.y : ((propData.rawSize && propData.rawSize.y) || 4.0);
      const colSizeZ = (propData.collisionSize && typeof propData.collisionSize.z === 'number') ? propData.collisionSize.z : ((propData.rawSize && propData.rawSize.z) || 3.0);
      const colOffY = (propData.collisionOffset && typeof propData.collisionOffset.y === 'number') ? propData.collisionOffset.y : 0.0;

      const colHtml = isProp ? `
        <div style="margin-top:6px; margin-bottom:6px; padding:6px; background:rgba(20,45,30,0.6); border:1px solid #338844; border-radius:4px;">
          <div style="color:#88ffaa; font-size:11px; font-weight:bold; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
            <span>🛡️ Коллизия (Физический барьер)</span>
            <span id="txt-col-status" style="font-size:10px; color:${hasCol ? '#66ff99' : '#ff8888'}; font-weight:bold;">${hasCol ? 'ВКЛЮЧЕНА' : 'ВЫКЛЮЧЕНА'}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-size:11px; color:#cceecc;">
              <input type="checkbox" id="inp-prop-col" ${hasCol ? 'checked' : ''} />
              Блокировать игрока и мобов
            </label>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:6px;">
            <div>
              <label style="color:#ffaa44; font-size:10px;">Форма коллайдера:</label>
              <select id="inp-prop-col-shape" style="width:100%; background:#222; color:#fff; border:1px solid #444; padding:2px; border-radius:3px; font-family:inherit; font-size:11px;">
                <option value="box"${colShape === 'box' ? ' selected' : ''}>Box (Коробка OBB)</option>
                <option value="cylinder"${colShape === 'cylinder' ? ' selected' : ''}>Cylinder (Цилиндр)</option>
              </select>
            </div>
            <div>
              <label style="color:#ffaa44; font-size:10px;">Авто-размер:</label>
              <button type="button" id="btn-prop-col-autofit" style="width:100%; background:#1e3c28; color:#aaffbb; border:1px solid #338844; padding:3px 4px; border-radius:3px; cursor:pointer; font-size:10px; font-weight:bold;">⚡ По мешу</button>
            </div>
          </div>
          <div style="margin-top:4px; padding-top:4px; border-top:1px solid #225533;">
            <div style="color:#99eeaa; font-size:10px; font-weight:bold; margin-bottom:4px;">Размеры бокса коллизии (метры):</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:4px; margin-bottom:4px;">
              <div>
                <label style="color:#ff8888; font-size:9px;">Ширина X (м):</label>
                <input type="number" step="0.5" min="0.1" id="inp-prop-col-w" value="${colSizeX.toFixed(2)}" style="width:100%; background:#1a281e; color:#aaffcc; border:1px solid #336644; padding:2px 4px; border-radius:3px; font-family:inherit; font-size:11px;" />
              </div>
              <div>
                <label style="color:#88ff88; font-size:9px;">Высота Y (м):</label>
                <input type="number" step="0.5" min="0.1" id="inp-prop-col-h" value="${colSizeY.toFixed(2)}" style="width:100%; background:#1a281e; color:#aaffcc; border:1px solid #336644; padding:2px 4px; border-radius:3px; font-family:inherit; font-size:11px;" />
              </div>
              <div>
                <label style="color:#8888ff; font-size:9px;">Глубина Z (м):</label>
                <input type="number" step="0.5" min="0.1" id="inp-prop-col-d" value="${colSizeZ.toFixed(2)}" style="width:100%; background:#1a281e; color:#aaffcc; border:1px solid #336644; padding:2px 4px; border-radius:3px; font-family:inherit; font-size:11px;" />
              </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px;">
              <div>
                <label style="color:#ffcc66; font-size:9px;">Смещение Y (центр):</label>
                <input type="number" step="0.2" id="inp-prop-col-offy" value="${colOffY.toFixed(2)}" style="width:100%; background:#1a281e; color:#aaffcc; border:1px solid #336644; padding:2px 4px; border-radius:3px; font-family:inherit; font-size:11px;" />
              </div>
              <div style="display:flex; align-items:flex-end;">
                <button type="button" id="btn-prop-col-resetsize" style="width:100%; background:#2a2518; color:#ffddaa; border:1px solid #665533; padding:3px 4px; border-radius:3px; cursor:pointer; font-size:10px;">↺ Сброс (3x4x3)</button>
              </div>
            </div>
          </div>
        </div>
      ` : '';

      infoContainer.innerHTML = `
        <div style="font-weight:bold; color:#ffdd44; font-size:13px; margin-bottom:4px;">${o.name}</div>
        <div style="color:#888; font-size:10px; margin-bottom:6px;">ID: ${o.id} | Тип: ${o.type.toUpperCase()}</div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; margin-bottom:6px;">
          <div>
            <label style="color:#ffaa44; font-size:10px;">X (Мир):</label>
            <input type="number" step="0.5" id="inp-pos-x" value="${curPosX.toFixed(2)}" style="width:100%; background:#222; color:#44ffaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
          </div>
          <div>
            <label style="color:#ffaa44; font-size:10px;">Z (Мир):</label>
            <input type="number" step="0.5" id="inp-pos-z" value="${curPosZ.toFixed(2)}" style="width:100%; background:#222; color:#44ffaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
          </div>
          <div>
            <label style="color:#ffaa44; font-size:10px;">Y (Высота):</label>
            <input type="number" step="0.5" id="inp-pos-y" value="${curPosY.toFixed(2)}" style="width:100%; background:#222; color:#44ffaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
          </div>
          <div>
            <label style="color:#ffaa44; font-size:10px;">RotY (°):</label>
            <input type="number" step="5" id="inp-rot-y" value="${((curRotY * 180) / Math.PI).toFixed(1)}" style="width:100%; background:#222; color:#ffddaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
          </div>
        </div>

        <div style="display:flex; gap:3px; margin-bottom:6px; justify-content:space-between;">
          <button type="button" class="ed-rot-btn" data-angle="-90" style="flex:1; background:#222; color:#ffddaa; border:1px solid #555; padding:3px 2px; border-radius:3px; cursor:pointer; font-size:9px;" title="Повернуть на -90°">-90°</button>
          <button type="button" class="ed-rot-btn" data-angle="-45" style="flex:1; background:#222; color:#ffddaa; border:1px solid #555; padding:3px 2px; border-radius:3px; cursor:pointer; font-size:9px;" title="Повернуть на -45°">-45°</button>
          <button type="button" class="ed-rot-btn" data-angle="-15" style="flex:1; background:#222; color:#ffddaa; border:1px solid #555; padding:3px 2px; border-radius:3px; cursor:pointer; font-size:9px;" title="Повернуть на -15°">-15°</button>
          <button type="button" class="ed-rot-btn" data-angle="15" style="flex:1; background:#222; color:#ffddaa; border:1px solid #555; padding:3px 2px; border-radius:3px; cursor:pointer; font-size:9px;" title="Повернуть на +15°">+15°</button>
          <button type="button" class="ed-rot-btn" data-angle="45" style="flex:1; background:#222; color:#ffddaa; border:1px solid #555; padding:3px 2px; border-radius:3px; cursor:pointer; font-size:9px;" title="Повернуть на +45°">+45°</button>
          <button type="button" class="ed-rot-btn" data-angle="90" style="flex:1; background:#222; color:#ffddaa; border:1px solid #555; padding:3px 2px; border-radius:3px; cursor:pointer; font-size:9px;" title="Повернуть на +90°">+90°</button>
          <button type="button" class="ed-rot-btn" data-angle="0" data-set="true" style="flex:1; background:#332222; color:#ffaaaa; border:1px solid #aa5555; padding:3px 2px; border-radius:3px; cursor:pointer; font-size:9px;" title="Сброс угла в 0°">0°</button>
        </div>

        <div style="margin-top:6px; margin-bottom:4px; font-size:11px; color:#88ccff; font-weight:bold; display:flex; justify-content:space-between; align-items:center;">
          <span>📐 Общий масштаб (Scale XYZ)</span>
          <div style="display:flex; gap:2px;">
            <button type="button" class="ed-scale-preset" data-scale="0.05" style="background:#1a2838;color:#99ccff;border:1px solid #335577;padding:1px 3px;border-radius:3px;cursor:pointer;font-size:9px;">0.05x</button>
            <button type="button" class="ed-scale-preset" data-scale="0.1" style="background:#1a2838;color:#99ccff;border:1px solid #335577;padding:1px 3px;border-radius:3px;cursor:pointer;font-size:9px;">0.1x</button>
            <button type="button" class="ed-scale-preset" data-scale="0.25" style="background:#1a2838;color:#99ccff;border:1px solid #335577;padding:1px 3px;border-radius:3px;cursor:pointer;font-size:9px;">0.25x</button>
            <button type="button" class="ed-scale-preset" data-scale="0.5" style="background:#1a2838;color:#99ccff;border:1px solid #335577;padding:1px 3px;border-radius:3px;cursor:pointer;font-size:9px;">0.5x</button>
            <button type="button" class="ed-scale-preset" data-scale="1.0" style="background:#1a2838;color:#99ccff;border:1px solid #335577;padding:1px 3px;border-radius:3px;cursor:pointer;font-size:9px;">1x</button>
            <button type="button" class="ed-scale-preset" data-scale="1.5" style="background:#1a2838;color:#99ccff;border:1px solid #335577;padding:1px 3px;border-radius:3px;cursor:pointer;font-size:9px;">1.5x</button>
            <button type="button" class="ed-scale-preset" data-scale="2.0" style="background:#1a2838;color:#99ccff;border:1px solid #335577;padding:1px 3px;border-radius:3px;cursor:pointer;font-size:9px;">2x</button>
            <button type="button" class="ed-scale-preset" data-scale="3.0" style="background:#1a2838;color:#99ccff;border:1px solid #335577;padding:1px 3px;border-radius:3px;cursor:pointer;font-size:9px;">3x</button>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px; background:#182230; border:1px solid #335577; padding:4px 6px; border-radius:4px;">
          <label style="color:#ffee88; font-size:11px; font-weight:bold; white-space:nowrap;">Размер (XYZ):</label>
          <input type="number" step="0.05" min="0.001" id="inp-scale-uniform" value="${curSx.toFixed(3)}" style="width:70px; background:#111; color:#ffee77; border:1px solid #557799; padding:3px; border-radius:3px; font-family:inherit; font-weight:bold; font-size:11px;" />
          <div style="display:flex; gap:3px; flex:1; justify-content:flex-end;">
            <button type="button" id="btn-scale-mul-08" style="background:#22384a; color:#aaccff; border:1px solid #446688; padding:2px 5px; border-radius:3px; cursor:pointer; font-size:10px; font-weight:bold;">-20%</button>
            <button type="button" id="btn-scale-mul-12" style="background:#22384a; color:#aaccff; border:1px solid #446688; padding:2px 5px; border-radius:3px; cursor:pointer; font-size:10px; font-weight:bold;">+20%</button>
            <button type="button" id="btn-scale-mul-half" style="background:#22384a; color:#aaccff; border:1px solid #446688; padding:2px 5px; border-radius:3px; cursor:pointer; font-size:10px; font-weight:bold;">÷2</button>
            <button type="button" id="btn-scale-mul-double" style="background:#22384a; color:#aaccff; border:1px solid #446688; padding:2px 5px; border-radius:3px; cursor:pointer; font-size:10px; font-weight:bold;">×2</button>
          </div>
        </div>

        <div style="margin-bottom:6px;">
          <button type="button" id="btn-scale-reset-aspect" style="width:100%; background:#1c3830; color:#88ffcc; border:1px solid #33aa77; padding:4px; border-radius:3px; cursor:pointer; font-size:11px; font-weight:bold;">✨ Выровнять пропорции 1:1:1 (Сброс сплющивания)</button>
        </div>

        <details style="margin-bottom:6px;">
          <summary style="font-size:10px; color:#88aacc; cursor:pointer; user-select:none; margin-bottom:4px;">▶ Поосевая настройка (X, Y, Z)</summary>
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:4px; margin-top:4px;">
            <div>
              <label style="color:#ff8888; font-size:10px;">Scale X:</label>
              <input type="number" step="0.05" min="0.001" id="inp-scale-x" value="${curSx.toFixed(3)}" style="width:100%; background:#222; color:#ffaabb; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>
            <div>
              <label style="color:#88ff88; font-size:10px;">Scale Y:</label>
              <input type="number" step="0.05" min="0.001" id="inp-scale-y" value="${curSy.toFixed(3)}" style="width:100%; background:#222; color:#bbffaa; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>
            <div>
              <label style="color:#8888ff; font-size:10px;">Scale Z:</label>
              <input type="number" step="0.05" min="0.001" id="inp-scale-z" value="${curSz.toFixed(3)}" style="width:100%; background:#222; color:#aabbff; border:1px solid #444; padding:3px; border-radius:3px; font-family:inherit;" />
            </div>
          </div>
        </details>

        ${colHtml}

        <div style="background:rgba(0,180,255,0.1); border:1px solid #00aaaa; padding:4px 8px; border-radius:4px; color:#00ffff; font-size:11px;">
          Метрики острова: u: <strong>${u.toFixed(4)}</strong>, v: <strong>${v.toFixed(4)}</strong>
        </div>
      `;

      const applyFn = () => this.applyTransformFromInputs();
      infoContainer.querySelector('#inp-pos-x').onchange = applyFn;
      infoContainer.querySelector('#inp-pos-z').onchange = applyFn;
      infoContainer.querySelector('#inp-pos-y').onchange = applyFn;
      infoContainer.querySelector('#inp-rot-y').onchange = applyFn;
      infoContainer.querySelector('#inp-scale-x').onchange = applyFn;
      infoContainer.querySelector('#inp-scale-y').onchange = applyFn;
      infoContainer.querySelector('#inp-scale-z').onchange = applyFn;

      const uniInp = infoContainer.querySelector('#inp-scale-uniform');
      if (uniInp) {
        const onUniChange = () => {
          const val = Math.max(0.001, parseFloat(uniInp.value) || 1);
          const sxInp = infoContainer.querySelector('#inp-scale-x');
          const syInp = infoContainer.querySelector('#inp-scale-y');
          const szInp = infoContainer.querySelector('#inp-scale-z');
          if (sxInp) sxInp.value = val.toFixed(3);
          if (syInp) syInp.value = val.toFixed(3);
          if (szInp) szInp.value = val.toFixed(3);
          this.applyTransformFromInputs();
        };
        uniInp.oninput = onUniChange;
        uniInp.onchange = onUniChange;
      }

      const applyScaleFactor = (factor) => {
        const sx = Math.max(0.001, (o.scale && o.scale.x != null ? o.scale.x : 1) * factor);
        const sy = Math.max(0.001, (o.scale && o.scale.y != null ? o.scale.y : 1) * factor);
        const sz = Math.max(0.001, (o.scale && o.scale.z != null ? o.scale.z : 1) * factor);
        const sxInp = infoContainer.querySelector('#inp-scale-x');
        const syInp = infoContainer.querySelector('#inp-scale-y');
        const szInp = infoContainer.querySelector('#inp-scale-z');
        const uInp = infoContainer.querySelector('#inp-scale-uniform');
        if (sxInp) sxInp.value = sx.toFixed(3);
        if (syInp) syInp.value = sy.toFixed(3);
        if (szInp) szInp.value = sz.toFixed(3);
        if (uInp) uInp.value = sx.toFixed(3);
        this.applyTransformFromInputs();
      };

      const btn08 = infoContainer.querySelector('#btn-scale-mul-08');
      const btn12 = infoContainer.querySelector('#btn-scale-mul-12');
      const btnHalf = infoContainer.querySelector('#btn-scale-mul-half');
      const btnDouble = infoContainer.querySelector('#btn-scale-mul-double');
      if (btn08) btn08.onclick = () => applyScaleFactor(0.8);
      if (btn12) btn12.onclick = () => applyScaleFactor(1.2);
      if (btnHalf) btnHalf.onclick = () => applyScaleFactor(0.5);
      if (btnDouble) btnDouble.onclick = () => applyScaleFactor(2.0);

      const btnResetAspect = infoContainer.querySelector('#btn-scale-reset-aspect');
      if (btnResetAspect) {
        btnResetAspect.onclick = () => {
          const maxDim = Math.max(0.001, o.scale.x || 1, o.scale.y || 1, o.scale.z || 1);
          const sxInp = infoContainer.querySelector('#inp-scale-x');
          const syInp = infoContainer.querySelector('#inp-scale-y');
          const szInp = infoContainer.querySelector('#inp-scale-z');
          const uInp = infoContainer.querySelector('#inp-scale-uniform');
          if (sxInp) sxInp.value = maxDim.toFixed(3);
          if (syInp) syInp.value = maxDim.toFixed(3);
          if (szInp) szInp.value = maxDim.toFixed(3);
          if (uInp) uInp.value = maxDim.toFixed(3);
          this.applyTransformFromInputs();
          if (this.game.addChatMessage) this.game.addChatMessage('[Масштаб] Пропорции выровнены 1:1:1 (' + maxDim.toFixed(3) + 'x)', 'system');
        };
      }

      const colChk = infoContainer.querySelector('#inp-prop-col');
      const shapeSel = infoContainer.querySelector('#inp-prop-col-shape');
      const colWInp = infoContainer.querySelector('#inp-prop-col-w');
      const colHInp = infoContainer.querySelector('#inp-prop-col-h');
      const colDInp = infoContainer.querySelector('#inp-prop-col-d');
      const colOffYInp = infoContainer.querySelector('#inp-prop-col-offy');

      if (colChk) colChk.onchange = applyFn;
      if (shapeSel) shapeSel.onchange = applyFn;
      if (colWInp) colWInp.onchange = applyFn;
      if (colHInp) colHInp.onchange = applyFn;
      if (colDInp) colDInp.onchange = applyFn;
      if (colOffYInp) colOffYInp.onchange = applyFn;

      const resetColBtn = infoContainer.querySelector('#btn-prop-col-resetsize');
      if (resetColBtn) {
        resetColBtn.onclick = () => {
          if (colWInp) colWInp.value = '3.00';
          if (colHInp) colHInp.value = '4.00';
          if (colDInp) colDInp.value = '3.00';
          if (colOffYInp) colOffYInp.value = '0.00';
          applyFn();
        };
      }

      const autoFitBtn = infoContainer.querySelector('#btn-prop-col-autofit');
      if (autoFitBtn && o.mesh) {
        autoFitBtn.onclick = () => {
          const box = new THREE.Box3().setFromObject(o.mesh);
          if (!box.isEmpty() && isFinite(box.min.x)) {
            const s = new THREE.Vector3();
            box.getSize(s);
            const sx = o.scale.x || 1;
            const sy = o.scale.y || 1;
            const sz = o.scale.z || 1;
            const baseW = sx > 0.001 ? s.x / sx : s.x;
            const baseH = sy > 0.001 ? s.y / sy : s.y;
            const baseD = sz > 0.001 ? s.z / sz : s.z;
            if (colWInp) colWInp.value = baseW.toFixed(2);
            if (colHInp) colHInp.value = baseH.toFixed(2);
            if (colDInp) colDInp.value = baseD.toFixed(2);
            if (colOffYInp) colOffYInp.value = '0.00';
            applyFn();
            if (this.game.addChatMessage) {
              this.game.addChatMessage(`[Коллизии] Авто-размер настроен: ${baseW.toFixed(2)} x ${baseH.toFixed(2)} x ${baseD.toFixed(2)}м`, 'system');
            }
          }
        };
      }

      infoContainer.querySelectorAll('.ed-rot-btn').forEach(btn => {
        btn.onclick = () => {
          const rotInp = infoContainer.querySelector('#inp-rot-y');
          if (!rotInp) return;
          const isSet = btn.getAttribute('data-set') === 'true';
          const angle = parseFloat(btn.getAttribute('data-angle')) || 0;
          let cur = parseFloat(rotInp.value) || 0;
          if (isSet) {
            cur = angle;
          } else {
            cur = (cur + angle) % 360;
            if (cur < -180) cur += 360;
            if (cur > 180) cur -= 360;
          }
          rotInp.value = cur.toFixed(1);
          this.applyTransformFromInputs();
        };
      });

      infoContainer.querySelectorAll('.ed-scale-preset').forEach(btn => {
        btn.onclick = () => {
          const s = parseFloat(btn.getAttribute('data-scale')) || 1;
          const sxInp = infoContainer.querySelector('#inp-scale-x');
          const syInp = infoContainer.querySelector('#inp-scale-y');
          const szInp = infoContainer.querySelector('#inp-scale-z');
          const uInp = infoContainer.querySelector('#inp-scale-uniform');
          if (sxInp) sxInp.value = s.toFixed(3);
          if (syInp) syInp.value = s.toFixed(3);
          if (szInp) szInp.value = s.toFixed(3);
          if (uInp) uInp.value = s.toFixed(3);
          this.applyTransformFromInputs();
        };
      });
    }

    applyTransformFromInputs() {
      if (!this.selectedObject) return;

      this.pushHistory('инспектор: ' + (this.selectedObject.name || ''));

      const o = this.selectedObject;
      const px = parseFloat(this.panel.querySelector('#inp-pos-x').value) || 0;
      const pz = parseFloat(this.panel.querySelector('#inp-pos-z').value) || 0;
      let py = parseFloat(this.panel.querySelector('#inp-pos-y').value) || 0;
      const ryDeg = parseFloat(this.panel.querySelector('#inp-rot-y').value) || 0;

      const sxEl = this.panel.querySelector('#inp-scale-x');
      const syEl = this.panel.querySelector('#inp-scale-y');
      const szEl = this.panel.querySelector('#inp-scale-z');
      const sx = sxEl ? parseFloat(sxEl.value) : (o.scale.x || 1);
      const sy = syEl ? parseFloat(syEl.value) : (o.scale.y || 1);
      const sz = szEl ? parseFloat(szEl.value) : (o.scale.z || 1);

      const colChk = this.panel.querySelector('#inp-prop-col');
      const shapeSel = this.panel.querySelector('#inp-prop-col-shape');
      const colWEl = this.panel.querySelector('#inp-prop-col-w');
      const colHEl = this.panel.querySelector('#inp-prop-col-h');
      const colDEl = this.panel.querySelector('#inp-prop-col-d');
      const colOffYEl = this.panel.querySelector('#inp-prop-col-offy');

      if (colChk) {
        const enabled = !!colChk.checked;
        const shape = shapeSel ? shapeSel.value : 'box';
        const cw = Math.max(0.1, parseFloat(colWEl ? colWEl.value : 3) || 3.0);
        const ch = Math.max(0.1, parseFloat(colHEl ? colHEl.value : 4) || 4.0);
        const cd = Math.max(0.1, parseFloat(colDEl ? colDEl.value : 3) || 3.0);
        const coffY = parseFloat(colOffYEl ? colOffYEl.value : 0) || 0;

        if (o.targetData) {
          o.targetData.collision = enabled;
          o.targetData.hasCollision = enabled;
          o.targetData.collisionShape = shape;
          o.targetData.collisionSize = { x: cw, y: ch, z: cd };
          o.targetData.collisionOffset = { x: 0, y: coffY, z: 0 };
        }
        o.collision = enabled;
        o.hasCollision = enabled;
        o.collisionShape = shape;
        o.collisionSize = { x: cw, y: ch, z: cd };
        o.collisionOffset = { x: 0, y: coffY, z: 0 };

        const WM = window.WorldMetrics;
        if (WM && WM.CUSTOM_PROPS) {
          const match = WM.CUSTOM_PROPS.find(p => p.id === o.id);
          if (match) {
            match.collision = enabled;
            match.hasCollision = enabled;
            match.collisionShape = shape;
            match.collisionSize = { x: cw, y: ch, z: cd };
            match.collisionOffset = { x: 0, y: coffY, z: 0 };
          }
        }
        const statusTxt = this.panel.querySelector('#txt-col-status');
        if (statusTxt) {
          statusTxt.textContent = enabled ? 'ВКЛЮЧЕНА' : 'ВЫКЛЮЧЕНА';
          statusTxt.style.color = enabled ? '#66ff99' : '#ff8888';
        }
      }

      if (this.terrainSnap && window.Terrain) {
        py = window.Terrain.heightAt(px, pz);
      }

      this.updateObjectTransform(
        px, py, pz,
        (ryDeg * Math.PI) / 180,
        Math.max(0.001, isFinite(sx) ? sx : 1),
        Math.max(0.001, isFinite(sy) ? sy : 1),
        Math.max(0.001, isFinite(sz) ? sz : 1)
      );
      this._updateCollisionHelper(o);

      // Числа в инспекторе — сразу полный commit на сервер
      if (this.selectedObject.type === 'player' && this.game.net && this.game.net.connected && this.game.net.intentEditorSetPos) {
        this.game.net.intentEditorSetPos(px, pz);
        this._pendingEditorPlayerPos = null;
      }
      this.saveToLocalStorage();
      this.saveToServer(true);
    }

    updateObjectTransform(x, y, z, rotY, scaleX, scaleY, scaleZ) {
      if (!this.selectedObject) return;
      const quiet = !!this._dragQuiet;

      const o = this.selectedObject;
      if (!isFinite(x)) x = o.position ? o.position.x || 0 : 0;
      if (!isFinite(y)) y = o.position ? o.position.y || 0 : 0;
      if (!isFinite(z)) z = o.position ? o.position.z || 0 : 0;

      if (rotY !== undefined && isFinite(rotY)) {
        if (!o.rotation) o.rotation = { x: 0, y: 0, z: 0 };
        o.rotation.y = rotY;
      }

      if (scaleX !== undefined && isFinite(scaleX)) {
        if (!o.scale) o.scale = { x: 1, y: 1, z: 1 };
        const sx = Math.max(0.001, scaleX);
        const sy = Math.max(0.001, (scaleY !== undefined && isFinite(scaleY)) ? scaleY : sx);
        const sz = Math.max(0.001, (scaleZ !== undefined && isFinite(scaleZ)) ? scaleZ : sx);
        o.scale.x = sx;
        o.scale.y = sy;
        o.scale.z = sz;
      }

      if (o.mesh) {
        // Споты: scale — множитель радиуса, позицию Y привязываем к terrain
        if (o.type === 'spot') {
          const gh = window.Terrain ? window.Terrain.heightAt(x, z) : 0;
          y = gh + 0.6;
          o.mesh.position.set(x, y, z);
          if (scaleX !== undefined && isFinite(scaleX)) {
            const mul = Math.max(0.01, scaleX);
            o.mesh.scale.set(mul, 1, mul);
          }
        } else if (o.type === 'hunt') {
          const gh = window.Terrain ? window.Terrain.heightAt(x, z) : 0;
          y = gh + 0.5;
          o.mesh.position.set(x, y, z);
          if (scaleX !== undefined && isFinite(scaleX)) {
            const mul = Math.max(0.01, scaleX);
            o.mesh.scale.set(mul, 1, (scaleZ !== undefined && isFinite(scaleZ)) ? Math.max(0.01, scaleZ) : mul);
          }
        } else if (o.type === 'player') {
          const T = window.Terrain;
          if (T && typeof T.standY === 'function') {
            const s = T.standY(x, z);
            const sea = (typeof T.seaLevel === 'number') ? T.seaLevel - 0.3 : -35.3;
            y = Math.max(s.y, 0.95 + sea);
          } else {
            const gh = T ? T.heightAt(x, z) : 0;
            y = 0.95 + Math.max(gh, T ? T.seaLevel - 0.3 : 0);
          }
          o.mesh.position.set(x, y, z);
          if (this.game.player) {
            // Редактор двигает «живого» игрока — гасим click-to-move, чтобы не утащило обратно
            this.game.player.isMoving = false;
            if (this.game.player.moveTarget) this.game.player.moveTarget.set(x, 0, z);
            if (this.game.player.shadow) this.game.player.shadow.position.set(x, y - 0.88, z);
            if (this.game.player.youMarker) this.game.player.youMarker.position.set(x, y + 1.3, z);
          }
          const sm = this.markerMeshes.get('player_spawn');
          if (sm) sm.position.set(x, y + 1.6, z);
          // Сразу в predict net, иначе после drag может подтянуть старое
          if (this.game.net && this.game.net.predict) {
            this.game.net.predict.x = x;
            this.game.net.predict.z = z;
            this.game.net.serverSelf = { x: x, z: z };
          }
        } else if (o.type === 'npc') {
          const gh = window.Terrain ? window.Terrain.heightAt(x, z) : 0;
          y = gh + 2.0;
          o.mesh.position.set(x, y, z);
          if (scaleX !== undefined && isFinite(scaleX)) {
            o.mesh.scale.set(o.scale.x, o.scale.y, o.scale.z);
          }
        } else if (o.type === 'site') {
          const gh = window.Terrain ? window.Terrain.heightAt(x, z) : 0;
          y = gh + 0.2;
          o.mesh.position.set(x, y, z);
          const pinYaw = !o.targetData || o.targetData.kind === 'pin';
          if (isFinite(o.rotation.y)) o.mesh.rotation.y = pinYaw ? o.rotation.y : 0;
          if (scaleX !== undefined && isFinite(scaleX)) {
            o.mesh.scale.set(o.scale.x, o.scale.y, o.scale.z);
          }
        } else if (o.type === 'bsp') {
          o.mesh.position.set(x, y, z);
          if (isFinite(o.rotation.y)) o.mesh.rotation.y = o.rotation.y;
          if (scaleX !== undefined && isFinite(scaleX)) {
            // BSP: scale = world size (meters)
            const sx = Math.max(0.01, scaleX);
            const sy = Math.max(0.01, (scaleY != null && isFinite(scaleY)) ? scaleY : scaleX);
            const sz = Math.max(0.01, (scaleZ != null && isFinite(scaleZ)) ? scaleZ : scaleX);
            o.mesh.scale.set(sx, sy, sz);
            o.scale.x = sx; o.scale.y = sy; o.scale.z = sz;
          }
        } else {
          o.mesh.position.set(x, y, z);
          if (isFinite(o.rotation.y)) o.mesh.rotation.y = o.rotation.y;
          if (scaleX !== undefined && isFinite(scaleX)) {
            o.mesh.scale.set(o.scale.x, o.scale.y, o.scale.z);
          }
        }
      }

      if (!o.position) o.position = { x: 0, y: 0, z: 0 };
      o.position.x = x;
      o.position.y = y;
      o.position.z = z;
      this.gizmoGroup.position.set(x, y, z);
      if (isFinite(o.rotation.y)) this.gizmoGroup.rotation.y = o.rotation.y;
      if (o.mesh) {
        const bbox = new THREE.Box3().setFromObject(o.mesh);
        if (!bbox.isEmpty() && isFinite(bbox.min.x)) {
          const center = new THREE.Vector3();
          const size = new THREE.Vector3();
          bbox.getCenter(center);
          bbox.getSize(size);
          if (isFinite(center.x) && isFinite(size.x)) {
            this.selectionBox.position.copy(center);
            this.selectionBox.rotation.set(0, 0, 0);
            this.selectionBox.scale.set(Math.max(0.1, size.x), Math.max(0.1, size.y), Math.max(0.1, size.z));
            this.selectionBox.visible = true;
          }
        }
      } else if (o.type === 'prop' && o.position) {
        const sx = (o.scale && o.scale.x) || 1.0;
        const sy = (o.scale && o.scale.y) || 1.0;
        const sz = (o.scale && o.scale.z) || 1.0;
        const boxH = Math.max(0.5, 4.0 * sy);
        const boxW = Math.max(0.5, 2.0 * sx);
        this.selectionBox.position.set(x, y + boxH * 0.5, z);
        this.selectionBox.rotation.set(0, (o.rotation ? o.rotation.y || 0 : 0), 0);
        this.selectionBox.scale.set(boxW, boxH, boxW);
        this.selectionBox.visible = true;
      }

      // Обновляем baseY для NPC, чтобы покачивание (bob) не сбрасывало позицию
      if (o.type === 'npc' && this.game && this.game.npcManager) {
        const npcObj = this.game.npcManager.getNPCById(o.id);
        if (npcObj) {
          npcObj.baseY = y;
          if (npcObj.mesh) npcObj.mesh.position.set(x, y, z);
          if (npcObj.shadow) npcObj.shadow.position.set(x, (window.Terrain ? window.Terrain.heightAt(x, z) : 0) + 0.02, z);
        }
      }

      if (o.type === 'prop') {
        const instancer = this._foliageInstancer || (this.game && this.game.worldContent && this.game.worldContent.foliageInstancer);
        if (instancer) {
          instancer.updateInstanceTransform(o.id, { x, y, z }, o.rotation, o.scale);
        }
      }

      const WM = window.WorldMetrics;
      if (WM) {
        const u = (x - WM.MIN_X) / WM.W;
        const v = (z - WM.MIN_Z) / WM.H;

        if (o.type === 'player') {
          // 1) точка спавна (маркер редактора / новые персонажи)
          if (WM.setPlayerSpawn) WM.setPlayerSpawn(x, y, z);
          // 2) Во время drag только локально + predict.
          //    На сервер — throttled (полный commit на mouseup без clamp).
          if (this.game.net && this.game.net.predict) {
            this.game.net.predict.x = x;
            this.game.net.predict.z = z;
            this.game.net.serverSelf = { x, z };
          }
          this._pendingEditorPlayerPos = { x, y, z };
          const now = Date.now();
          if (this.game.net && this.game.net.connected && this.game.net.intentEditorSetPos) {
            if (!this._lastEditorPosSend || now - this._lastEditorPosSend > 250) {
              this._lastEditorPosSend = now;
              this.game.net.intentEditorSetPos(x, z);
            }
          }
          // 3) customProps mirror
          let pp = WM.CUSTOM_PROPS.find(p => p.editorKey === 'player_spawn' || p.id === 'player_spawn');
          if (!pp) {
            pp = {
              id: 'player_spawn',
              editorKey: 'player_spawn',
              name: 'Спавн игрока / Персонаж',
              type: 'prop',
              meshType: 'scene_ref',
              position: { x, y, z },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1.8, y: 1.8, z: 1 }
            };
            WM.CUSTOM_PROPS.push(pp);
          } else {
            pp.id = 'player_spawn';
            pp.editorKey = 'player_spawn';
            pp.position = { x, y, z };
          }
          for (let i = WM.CUSTOM_PROPS.length - 1; i >= 0; i--) {
            const p = WM.CUSTOM_PROPS[i];
            if (p !== pp && this._isPlayerProp(p)) WM.CUSTOM_PROPS.splice(i, 1);
          }
        } else if (o.type === 'npc') {
          WM.CITY_NPCS.concat(WM.REGION_NPCS).forEach(n => {
            if (n.id === o.id) n.np = [u, v];
          });
        } else if (o.type === 'spot' && typeof o.spotIdx === 'number') {
          if (WM.MOB_SPOTS && WM.MOB_SPOTS[o.spotIdx]) {
            WM.MOB_SPOTS[o.spotIdx].np = [u, v];
            // радиус: baseRadius * scale.x → нормализованный r
            const base = o.baseRadius || (WM.MOB_SPOTS[o.spotIdx].r * WM.W) || 15;
            const mul = (scaleX !== undefined) ? Math.max(0.15, scaleX) : (o.scale && o.scale.x) || 1;
            if (o.mesh && o.mesh.scale) {
              const worldR = base * (o.mesh.scale.x || mul);
              WM.MOB_SPOTS[o.spotIdx].r = Math.max(0.002, worldR / WM.W);
            } else if (scaleX !== undefined) {
              WM.MOB_SPOTS[o.spotIdx].r = Math.max(0.002, (base * mul) / WM.W);
            }
          }
        } else if (o.type === 'hunt' && o.id && WM.updateHuntZone) {
          const td = o.targetData || {};
          const isPoly = td.shape === 'poly' && td.poly && td.poly.length >= 3;
          if (isPoly) {
            // база вершин на старте drag — без накопления scale/shift
            if (!o._polyDragBase || !o._polyDragBase.length) {
              o._polyDragBase = td.poly.map(function (p) { return [p[0], p[1]]; });
              o._polyDragCenter = {
                u: (o.position.x - WM.MIN_X) / WM.W,
                v: (o.position.z - WM.MIN_Z) / WM.H
              };
            }
            const newU = (x - WM.MIN_X) / WM.W;
            const newV = (z - WM.MIN_Z) / WM.H;
            const mulX = (o.mesh && o.mesh.scale) ? Math.max(0.2, o.mesh.scale.x) : ((o.scale && o.scale.x) || 1);
            const mulZ = (o.mesh && o.mesh.scale) ? Math.max(0.2, o.mesh.scale.z) : ((o.scale && o.scale.z) || mulX);
            const cu0 = o._polyDragCenter.u, cv0 = o._polyDragCenter.v;
            const poly = o._polyDragBase.map(function (pt) {
              return [
                newU + (pt[0] - cu0) * mulX,
                newV + (pt[1] - cv0) * mulZ
              ];
            });
            WM.updateHuntZone(o.id, { poly: poly, name: td.name, lvl: td.lvl });
            if (td) { td.poly = poly; td.x = x; td.z = z; }
          } else {
            const baseW = o.baseW || td.w || 20;
            const baseD = o.baseD || td.d || 20;
            const mulX = (o.mesh && o.mesh.scale) ? Math.max(0.2, o.mesh.scale.x) : ((o.scale && o.scale.x) || 1);
            const mulZ = (o.mesh && o.mesh.scale) ? Math.max(0.2, o.mesh.scale.z) : ((o.scale && o.scale.z) || mulX);
            const ww = Math.max(2, baseW * mulX);
            const dd = Math.max(2, baseD * mulZ);
            const u0 = (x - ww / 2 - WM.MIN_X) / WM.W;
            const v0 = (z - dd / 2 - WM.MIN_Z) / WM.H;
            const u1 = (x + ww / 2 - WM.MIN_X) / WM.W;
            const v1 = (z + dd / 2 - WM.MIN_Z) / WM.H;
            WM.updateHuntZone(o.id, { nb: [u0, v0, u1, v1] });
            if (td) {
              td.x = x; td.z = z;
              td.w = ww; td.d = dd;
              td.bounds = [x - ww / 2, z - dd / 2, x + ww / 2, z + dd / 2];
            }
          }
          if (window.MAP_HUNT_ZONES !== undefined && WM.buildHuntZones) {
            window.MAP_HUNT_ZONES = WM.buildHuntZones();
          }
        } else if (o.type === 'site' && o.id && WM.updateBuildSite) {
          const patch = { x: x, y: y, z: z, yaw: o.rotation.y, np: [u, v] };
          const s = ((WM.listBuildSites && WM.listBuildSites()) || []).find((x) => x.id === o.id);
          if (s && (s.kind === 'poly' || s.kind === 'line') && s.poly && s.poly.length >= 2) {
            if (!o._siteDragBase) {
              o._siteDragBase = {
                np: [s.np ? s.np[0] : u, s.np ? s.np[1] : v],
                poly: s.poly.map(function (p) { return [p[0], p[1]]; }),
                nb: (s.nb && s.nb.length >= 4) ? s.nb.slice() : null
              };
            }
            const du = u - o._siteDragBase.np[0];
            const dv = v - o._siteDragBase.np[1];
            patch.poly = o._siteDragBase.poly.map(function (p) { return [p[0] + du, p[1] + dv]; });
            if (o._siteDragBase.nb) {
              const b = o._siteDragBase.nb;
              patch.nb = [b[0] + du, b[1] + dv, b[2] + du, b[3] + dv];
            }
          }
          WM.updateBuildSite(o.id, patch);
          if (o.targetData) {
            o.targetData.x = x;
            o.targetData.y = y;
            o.targetData.z = z;
            o.targetData.yaw = o.rotation.y;
            o.targetData.np = [u, v];
            if (patch.poly) o.targetData.poly = patch.poly;
            if (patch.nb) o.targetData.nb = patch.nb;
          }
        } else if (o.type === 'bsp') {
          const BB = window.BspBrushes;
          if (BB) {
            const size = {
              x: (o.mesh && o.mesh.scale) ? o.mesh.scale.x : (o.scale.x || 1),
              y: (o.mesh && o.mesh.scale) ? o.mesh.scale.y : (o.scale.y || 1),
              z: (o.mesh && o.mesh.scale) ? o.mesh.scale.z : (o.scale.z || 1)
            };
            BB.syncBrushTransform(o.id, { x, y, z }, {
              x: o.rotation.x || 0,
              y: o.rotation.y || 0,
              z: o.rotation.z || 0
            }, size);
            const live = BB.findBrush(o.id);
            if (live) o.targetData = live;
          }
        } else if (o.type === 'prop' || o.type === 'direct_mesh') {
          // Ссылки на объекты сцены (terrain/volcano) — meshType: scene_ref
          const isSceneRef = o.type === 'direct_mesh';
          const finger = o.mesh ? this.computeMeshFingerprint(o.mesh) : (o.finger || null);
          const geoVerts = o.mesh ? this.getGeoVerts(o.mesh) : (o.geoVerts || 0);
          const editorKey = (o.mesh && o.mesh.userData && o.mesh.userData.editorKey) || o.editorKey || null;
          const bind = (o.mesh && o.mesh.userData && o.mesh.userData.editorBind) || o.bind || null;
          if (o.mesh) {
            if (!o.mesh.userData) o.mesh.userData = {};
            o.mesh.userData.propId = editorKey || o.id;
            o.mesh.userData.finger = finger;
            o.mesh.userData.geoVerts = geoVerts;
          }
          const matchId = editorKey || o.id;
          let p = WM.CUSTOM_PROPS.find(x => x.id === matchId || x.id === o.id || (editorKey && x.editorKey === editorKey));
          if (!p && geoVerts > 0) p = WM.CUSTOM_PROPS.find(x => x.geoVerts === geoVerts || this.parseGeoVertsFromFinger(x.finger) === geoVerts);
          if (!p && finger) p = WM.CUSTOM_PROPS.find(x => x.finger === finger);
          if (!p) {
            p = {
              id: matchId,
              name: o.name || matchId,
              type: 'prop',
              meshType: isSceneRef ? 'scene_ref' : ((o.mesh && o.mesh.userData && o.mesh.userData.meshType) ? o.mesh.userData.meshType : 'fbx'),
              modelId: (o.mesh && o.mesh.userData && o.mesh.userData.modelId) || (o.targetData && o.targetData.modelId) || undefined,
              modelFile: (o.mesh && o.mesh.userData && o.mesh.userData.modelFile) || (o.targetData && o.targetData.modelFile) || undefined,
              finger: finger || undefined,
              geoVerts: geoVerts || undefined,
              editorKey: editorKey || undefined,
              bind: bind || undefined,
              position: { x, y, z },
              rotation: { x: o.rotation.x || 0, y: o.rotation.y || 0, z: o.rotation.z || 0 },
              scale: { x: o.scale.x || 1, y: o.scale.y || 1, z: o.scale.z || 1 },
              collision: o.collision !== false && (!o.targetData || o.targetData.collision !== false),
              collisionShape: o.collisionShape || (o.targetData && o.targetData.collisionShape) || 'box',
              collisionSize: o.collisionSize || (o.targetData && o.targetData.collisionSize) || undefined,
              collisionOffset: o.collisionOffset || (o.targetData && o.targetData.collisionOffset) || undefined,
              rawSize: (o.targetData && o.targetData.rawSize) || undefined
            };
            WM.CUSTOM_PROPS.push(p);
          } else {
            p.id = matchId;
            p.position = { x, y, z };
            p.rotation = { x: o.rotation.x || 0, y: o.rotation.y || 0, z: o.rotation.z || 0 };
            p.scale = { x: o.scale.x || 1, y: o.scale.y || 1, z: o.scale.z || 1 };
            if (o.collision !== undefined) p.collision = o.collision;
            if (o.collisionShape) p.collisionShape = o.collisionShape;
            if (o.collisionSize) p.collisionSize = o.collisionSize;
            else if (o.targetData && o.targetData.collisionSize) p.collisionSize = o.targetData.collisionSize;
            if (o.collisionOffset) p.collisionOffset = o.collisionOffset;
            else if (o.targetData && o.targetData.collisionOffset) p.collisionOffset = o.targetData.collisionOffset;
            if (o.targetData && o.targetData.rawSize) p.rawSize = o.targetData.rawSize;
            if (finger) p.finger = finger;
            if (geoVerts) p.geoVerts = geoVerts;
            if (editorKey) p.editorKey = editorKey;
            if (bind) p.bind = bind;
            if (isSceneRef) p.meshType = 'scene_ref';
          }
          if (o.mesh) {
            this.customPropMeshes.set(matchId, o.mesh);
          } else {
            this.customPropMeshes.delete(matchId);
          }
        } else if (o.type === 'light' && o.targetData) {
          o.targetData.position.set(x, y, z);
        }
      }

      this._updateCollisionHelper(o);

      // Во время drag — только сцена; save/inspector на mouseup (иначе лаг и «прыжки»)
      if (!quiet) {
        this.saveToLocalStorage();
        this.updateInspectorFields();
      }
    }

    saveToLocalStorage() {
      const WM = window.WorldMetrics;
      if (!WM || !WM.exportEditorOverrides) return;
      try {
        const overrides = WM.exportEditorOverrides();
        // Weapon grip pos/rot/len — merge memory + previous LS + disk (never drop grips)
        let grips = {};
        const CM = this._getCharModel && this._getCharModel();
        if (CM && typeof CM.getAllWeaponGripOverrides === 'function') {
          Object.assign(grips, CM.getAllWeaponGripOverrides() || {});
        }
        try {
          const raw = localStorage.getItem('ps_weapon_grips');
          if (raw) Object.assign(grips, JSON.parse(raw) || {});
        } catch (eG) { /* ignore */ }
        try {
          const rawOv = localStorage.getItem('project_steam_editor_overrides');
          if (rawOv) {
            const prev = JSON.parse(rawOv);
            if (prev && prev.weaponGrips) Object.assign(grips, prev.weaponGrips);
          }
        } catch (eP) { /* ignore */ }
        try {
          if (window.EDITOR_OVERRIDES_DATA && window.EDITOR_OVERRIDES_DATA.weaponGrips) {
            Object.assign(grips, window.EDITOR_OVERRIDES_DATA.weaponGrips);
          }
        } catch (eD) { /* ignore */ }
        // Memory/CM wins last for actively edited values
        if (CM && typeof CM.getAllWeaponGripOverrides === 'function') {
          Object.assign(grips, CM.getAllWeaponGripOverrides() || {});
        }
        if (Object.keys(grips).length) overrides.weaponGrips = grips;
        if (window.WindSystem && typeof window.WindSystem.saveSettings === 'function') {
          overrides.windSettings = window.WindSystem.saveSettings();
        }
        window.EDITOR_OVERRIDES_DATA = overrides;
        localStorage.setItem('project_steam_editor_overrides', JSON.stringify(overrides));
        if (overrides.weaponGrips) {
          try {
            localStorage.setItem('ps_weapon_grips', JSON.stringify(overrides.weaponGrips));
          } catch (eW) { /* ignore */ }
        }
        this._lastLocalSaveAt = overrides.savedAt;
        // Индекс коллизий кэширует bounds пропсов — сбросить после правок сцены.
        // Периодическая инвалидация в редакторе тоже есть (раз в 300 мс), но
        // явный сброс убирает окно, где коллизии считаются по старым позициям.
        if (window.PropsCollision && window.PropsCollision.invalidate) {
          window.PropsCollision.invalidate();
        }
        console.log('[SceneEditor] localStorage OK, customProps=', (overrides.customProps || []).length,
          'weaponGrips=', overrides.weaponGrips ? Object.keys(overrides.weaponGrips).length : 0,
          'savedAt=', overrides.savedAt);
      } catch (e) {
        console.warn('[SceneEditor] localStorage save failed:', e);
      }
    }

    async saveToServer(silent = false) {
      const WM = window.WorldMetrics;
      if (!WM || !WM.exportEditorOverrides) return;

      this.saveToLocalStorage();
      if (window.Terrain && window.Terrain.savePaintToServer) {
        window.Terrain.savePaintToServer();
      }
      const overrides = WM.exportEditorOverrides();
      overrides.savedAt = Date.now();
      window.EDITOR_OVERRIDES_DATA = overrides;
      try {
        localStorage.setItem('project_steam_editor_overrides', JSON.stringify(overrides));
      } catch (e) {}

      let wsSaved = false;
      let httpSaved = false;
      let httpError = '';

      // 1. WebSocket (после login)
      if (this.game && this.game.net && this.game.net.ws && this.game.net.ws.readyState === 1) {
        try {
          this.game.net.ws.send(JSON.stringify({ t: 'save_editor_data', data: overrides }));
          wsSaved = true;
        } catch (e) {
          console.warn('[SceneEditor] WebSocket save error:', e);
        }
      }

      // 2. HTTP POST на диск
      let vpsSynced = false;
      const urls = [
        '/api/save-editor-data',
        '/api/save-editor',
        'http://localhost:3000/api/save-editor-data'
      ];
      for (const url of urls) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(overrides)
          });
          if (res && res.ok) {
            const data = await res.json().catch(() => ({ ok: true }));
            if (data && data.ok !== false) {
              httpSaved = true;
              if (data.vpsSynced) vpsSynced = true;
            } else if (!httpSaved) {
              httpError = (data && data.error) || 'ok=false';
            }
          } else if (!httpSaved) {
            httpError = res ? ('HTTP ' + res.status) : 'no response';
          }
        } catch (e) {
          if (!httpSaved) httpError = (e && e.message) || String(e);
        }
      }

      if (wsSaved || httpSaved) {
        const vpsText = vpsSynced ? ' + 🌐 Боевой VPS обновлен live' : '';
        if (this.game && this.game.addChatMessage) {
          this.game.addChatMessage('[Редактор] ✅ Сохранено на диск & dist/client' + vpsText + ', customProps=' + ((overrides.customProps || []).length), 'system');
        }
        if (!silent && window.GameDialog && window.GameDialog.alert) {
          window.GameDialog.alert(
            'Изменения записаны:\n• shared/editor-overrides.json\n• client/js/editor-overrides-data.js\n• dist/client/js/editor-overrides-data.js (локальный билд)' + (vpsSynced ? '\n• 🌐 Боевой VPS сервер (мобы & зоны live)' : ''),
            { title: 'Сохранено' }
          );
        }
        return { ok: true, vpsSynced: vpsSynced, customPropsCount: (overrides.customProps || []).length };
      } else {
        const msg = 'Сохранено в localStorage (переживёт F5).\nДиск: не удалось (' + (httpError || 'сервер не запущен') + ').\n\nЗапустите: npm run menu в корне project-steam\nОткройте игру через http://localhost:3000/';
        if (this.game && this.game.addChatMessage) {
          this.game.addChatMessage('[Редактор] ' + msg.replace(/\n/g, ' '), 'system');
        }
        if (!silent && window.GameDialog && window.GameDialog.alert) {
          window.GameDialog.alert(msg, { title: 'Сохранение' });
        }
        return { ok: false, error: httpError };
      }
    }

    showExportModal() {
      const WM = window.WorldMetrics;
      if (!WM) return;
      const overrides = WM.exportEditorOverrides();
      const code = `// === ВСТАВЬТЕ ЭТОТ КОД В client/js/editor-overrides-data.js ИЛИ shared/world-metrics.js ===\n` +
        `window.EDITOR_OVERRIDES_DATA = ${JSON.stringify(overrides, null, 2)};\n` +
        `if (window.WorldMetrics && window.WorldMetrics.applyEditorOverrides) {\n` +
        `  window.WorldMetrics.applyEditorOverrides(window.EDITOR_OVERRIDES_DATA);\n` +
        `}\n`;

      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:1000;display:flex;align-items:center;justify-content:center;';
      modal.innerHTML = `
        <div style="background:#1a202c; border:2px solid #ffaa44; border-radius:8px; width:650px; max-width:90vw; padding:20px; color:#fff; font-family:monospace;">
          <h3 style="color:#ffdd88; margin-bottom:10px;">📋 Экспорт JS-кода сцены</h3>
          <textarea style="width:100%; height:300px; background:#0d1117; color:#44ffaa; border:1px solid #444; border-radius:4px; padding:10px; font-family:inherit; font-size:11px;" readonly>${code}</textarea>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;">
            <button id="btn-download-script" style="background:#114455; color:#aaffff; border:1px solid #2299aa; padding:6px 14px; border-radius:4px; cursor:pointer;">📥 Скачать editor-overrides-data.js</button>
            <button id="btn-copy-code" style="background:#228844; color:#fff; border:1px solid #44ff88; padding:6px 14px; border-radius:4px; cursor:pointer;">📋 Копировать код</button>
            <button id="btn-close-modal" style="background:#444; color:#fff; border:1px solid #666; padding:6px 14px; border-radius:4px; cursor:pointer;">Закрыть</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      modal.querySelector('#btn-download-script').onclick = () => {
        const blob = new Blob([code], { type: 'application/javascript' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'editor-overrides-data.js';
        a.click();
      };
      modal.querySelector('#btn-copy-code').onclick = () => {
        navigator.clipboard.writeText(code).then(() => {
          if (window.GameDialog && window.GameDialog.alert) {
            window.GameDialog.alert('Код скопирован в буфер.', { title: 'Экспорт' });
          } else if (this.game && this.game.addChatMessage) {
            this.game.addChatMessage('[Редактор] Код скопирован.', 'system');
          }
        });
      };
      modal.querySelector('#btn-close-modal').onclick = () => document.body.removeChild(modal);
    }

    snapSelectedToGround() {
      if (!this.selectedObject) return;
      this.pushHistory('на землю: ' + (this.selectedObject.name || ''));
      const gh = window.Terrain ? window.Terrain.heightAt(this.selectedObject.position.x, this.selectedObject.position.z) : 0;
      this.updateObjectTransform(this.selectedObject.position.x, gh, this.selectedObject.position.z);
    }

    focusCameraOnSelected() {
      if (!this.selectedObject) return;
      const p = this.selectedObject.position;
      if (this.game.camera) {
        if (this.game.cameraRig && this.game.cameraRig.flyMode) {
          const rig = this.game.cameraRig;
          rig.flyPos.set(p.x, p.y + 10, p.z + 16);
          const dx = p.x - rig.flyPos.x;
          const dy = p.y - rig.flyPos.y;
          const dz = p.z - rig.flyPos.z;
          const len = Math.hypot(dx, dy, dz);
          if (len > 0.01) {
            rig.flyYaw = Math.atan2(-dx / len, -dz / len);
            rig.flyPitch = Math.asin(Math.max(-0.999, Math.min(0.999, dy / len)));
          }
        } else {
          this.game.camera.position.set(p.x, p.y + 15, p.z + 25);
          this.game.camera.lookAt(p.x, p.y, p.z);
        }
      }
    }

    showAddPropModal() {
      this.showPropsLibraryModal();
    }

    showPropsLibraryModal() {
      if (this._propsLibModal && this._propsLibModal.parentNode) {
        this._propsLibModal.parentNode.removeChild(this._propsLibModal);
        this._propsLibModal = null;
      }

      const lib = window.PropsLibrary;
      const categories = (lib && lib.getCategories()) || [
        { id: 'all', nameRu: 'Все модели', icon: '📦' }
      ];

      const modal = document.createElement('div');
      modal.id = 'props-library-modal';
      modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(4, 8, 14, 0.82);
        z-index: 1200;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(10px);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      `;

      let activeCat = 'all';
      let searchQuery = '';

      modal.innerHTML = `
        <div style="
          background: linear-gradient(180deg, #131b26 0%, #0a0f16 100%);
          border: 2px solid #ffaa44;
          border-radius: 12px;
          width: 880px;
          max-width: 95vw;
          height: 640px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 16px 48px rgba(0,0,0,0.9), 0 0 20px rgba(255,170,68,0.25);
          overflow: hidden;
          color: #e6edf3;
        ">
          <!-- Header -->
          <div style="
            background: linear-gradient(90deg, #aa5511 0%, #442200 60%, #1e1308 100%);
            padding: 12px 18px;
            border-bottom: 2px solid #ffaa44;
            display: flex;
            justify-content: space-between;
            align-items: center;
          ">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size: 20px;">📦</span>
              <div>
                <div style="font-size: 15px; font-weight: bold; color: #ffdd88; letter-spacing: 0.5px;">БИБЛИОТЕКА 3D-МОДЕЛЕЙ (ASSET BROWSER)</div>
                <div style="font-size: 11px; color: #ccaa77;">${(lib && lib.getAll) ? lib.getAll().length : 99} FBX моделей · Деревья, кусты, здания, декор · UE5 Трансформации</div>
              </div>
            </div>
            <button id="btn-close-proplib" style="
              background: #331111;
              color: #ff9999;
              border: 1px solid #aa3333;
              border-radius: 6px;
              width: 30px;
              height: 30px;
              cursor: pointer;
              font-size: 14px;
              font-weight: bold;
            ">✕</button>
          </div>

          <!-- Search & Filter Bar -->
          <div style="padding: 12px 18px 8px 18px; background: #0e1520; border-bottom: 1px solid #1f2d3d; display: flex; gap: 10px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 260px; position: relative;">
              <input type="text" id="inp-proplib-search" placeholder="🔍 Поиск моделей (дерево, дуб, сосна, куст, дом, кузня, лавка, склад, tree, bush)..." style="
                width: 100%;
                background: #080c12;
                border: 1px solid #3a4d66;
                border-radius: 6px;
                padding: 8px 12px;
                color: #fff;
                font-size: 13px;
                outline: none;
                box-sizing: border-box;
              ">
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              <button id="btn-spawn-barrier" style="
                background: linear-gradient(135deg, #1c4a2a, #0f2e18);
                color: #88ffbb;
                border: 1px solid #33aa66;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
              " title="Создать настраиваемый коллизионный бокс / физическую стену">🛡️ +Барьер (Box)</button>
              <button id="btn-spawn-procedural" style="
                background: #1b3040;
                color: #99ccff;
                border: 1px solid #336688;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 11px;
                cursor: pointer;
              " title="Добавить процедурный куб/бочку/столб">⚙️ Примитивы</button>
            </div>
          </div>

          <!-- Category Chips -->
          <div id="proplib-cat-bar" style="
            display: flex;
            gap: 6px;
            padding: 8px 18px;
            background: #0b1018;
            border-bottom: 1px solid #1a2533;
            overflow-x: auto;
            white-space: nowrap;
          "></div>

          <!-- Grid of Models -->
          <div id="proplib-grid-container" style="
            flex: 1;
            padding: 14px 18px;
            overflow-y: auto;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 12px;
            align-content: flex-start;
          "></div>

          <!-- Footer -->
          <div style="
            padding: 8px 18px;
            background: #090e15;
            border-top: 1px solid #1a2533;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #8899aa;
          ">
            <div id="proplib-count-label">Показано: 47 из 47 моделей</div>
            <div style="display:flex; gap:12px;">
              <span>💡 [W/E/R] Сдвиг/Вращение/Масштаб</span>
              <span>⛰️ Чекбокс [Terrain Snap] в меню редактора</span>
              <span>⌨️ End — посадить на землю</span>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      this._propsLibModal = modal;

      const catBar = modal.querySelector('#proplib-cat-bar');
      const grid = modal.querySelector('#proplib-grid-container');
      const searchInp = modal.querySelector('#inp-proplib-search');
      const countLabel = modal.querySelector('#proplib-count-label');

      const renderCategories = () => {
        catBar.innerHTML = '';
        categories.forEach(c => {
          const btn = document.createElement('button');
          const isAct = c.id === activeCat;
          const count = (c.id === 'all') ? (lib ? lib.getAll().length : 0) : (lib ? lib.getByCategory(c.id).length : 0);
          btn.style.cssText = `
            background: ${isAct ? 'linear-gradient(135deg, #aa5511, #663300)' : '#131b26'};
            color: ${isAct ? '#ffffff' : '#99aabb'};
            border: 1px solid ${isAct ? '#ffaa44' : '#2a3a4d'};
            padding: 5px 10px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-weight: ${isAct ? 'bold' : 'normal'};
            box-shadow: ${isAct ? '0 0 8px rgba(255,170,68,0.35)' : 'none'};
          `;
          btn.innerHTML = `<span>${c.icon || '📦'}</span> <span>${c.nameRu}</span> <span style="font-size:9px; opacity:0.75;">(${count})</span>`;
          btn.onclick = () => {
            activeCat = c.id;
            renderCategories();
            renderCards();
          };
          catBar.appendChild(btn);
        });
      };

      const renderCards = () => {
        grid.innerHTML = '';
        const items = lib ? lib.search(searchQuery, activeCat) : [];
        countLabel.textContent = `Показано: ${items.length} из ${(lib ? lib.getAll().length : items.length)} моделей`;

        if (!items.length) {
          grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #778899;">
              <div style="font-size: 32px; margin-bottom: 10px;">🔍</div>
              <div style="font-size: 14px; color: #ccddee;">Ничего не найдено по запросу «${searchQuery}»</div>
              <div style="font-size: 11px; margin-top: 4px;">Попробуйте изменить категорию или поисковый запрос</div>
            </div>
          `;
          return;
        }

        items.forEach(item => {
          const card = document.createElement('div');
          card.style.cssText = `
            background: #111923;
            border: 1px solid #253549;
            border-radius: 8px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            transition: all 0.15s ease;
          `;
          card.onmouseenter = () => {
            card.style.borderColor = '#ffaa44';
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 6px 16px rgba(0,0,0,0.5), 0 0 10px rgba(255,170,68,0.2)';
          };
          card.onmouseleave = () => {
            card.style.borderColor = '#253549';
            card.style.transform = 'none';
            card.style.boxShadow = 'none';
          };

          const catObj = categories.find(c => c.id === item.category);
          const catName = catObj ? catObj.nameRu : item.category;
          const catIcon = catObj ? catObj.icon : '📦';

          card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <span style="font-size: 10px; background: #1a2a3d; color: #88bbff; border: 1px solid #2a4060; padding: 2px 6px; border-radius: 4px;">
                ${catIcon} ${catName}
              </span>
              <span style="font-size: 9px; color: #556677; font-family: monospace;">FBX</span>
            </div>
            <div style="height: 115px; background: radial-gradient(circle at center, #223447 0%, #0c141e 100%); border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; position: relative; border: 1px solid #1c2b3d; padding: 4px;">
              <img src="assets/props/icons/${item.id}.webp?v=ico-6" alt="${item.nameRu}" style="max-height: 100%; max-width: 100%; object-fit: contain; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.65));" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
              <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:40px; opacity:0.85;">${catIcon}</div>
            </div>
            <div>
              <div style="font-size: 13px; font-weight: bold; color: #ffdd99; margin-bottom: 2px;">${item.nameRu}</div>
              <div style="font-size: 10px; color: #778899; font-family: monospace;">${item.file}</div>
            </div>
            <div style="display: flex; gap: 6px; margin-top: auto; padding-top: 6px;">
              <button class="btn-spawn-here" style="
                flex: 1;
                background: linear-gradient(180deg, #256630, #16401e);
                color: #aaffbb;
                border: 1px solid #3ca855;
                padding: 6px 8px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 11px;
                font-weight: bold;
              " title="Поставить перед персонажем на землю">➕ Спавн</button>
              <button class="btn-click-place" style="
                background: linear-gradient(180deg, #1b3a55, #0f2436);
                color: #88ccff;
                border: 1px solid #2b6088;
                padding: 6px 8px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 11px;
              " title="Кликните на карту, чтобы поставить модель">🎯 Клик</button>
            </div>
          `;

          card.querySelector('.btn-spawn-here').onclick = () => {
            this._spawnPropFromLibrary(item, false);
            if (modal.parentNode) modal.parentNode.removeChild(modal);
          };

          card.querySelector('.btn-click-place').onclick = () => {
            this._startClickToPlaceProp(item);
            if (modal.parentNode) modal.parentNode.removeChild(modal);
          };

          grid.appendChild(card);
        });
      };

      searchInp.oninput = (e) => {
        searchQuery = e.target.value;
        renderCards();
      };

      searchInp.onkeydown = (e) => {
        if (e.key === 'Enter') {
          const items = lib ? lib.search(searchQuery, activeCat) : [];
          if (items.length > 0) {
            this._spawnPropFromLibrary(items[0], false);
            if (modal.parentNode) modal.parentNode.removeChild(modal);
          }
        }
      };

      modal.querySelector('#btn-close-proplib').onclick = () => {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
      };

      modal.onclick = (e) => {
        if (e.target === modal) {
          if (modal.parentNode) modal.parentNode.removeChild(modal);
        }
      };

      modal.querySelector('#btn-spawn-barrier').onclick = () => {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
        this.spawnCollisionBarrier();
      };

      modal.querySelector('#btn-spawn-procedural').onclick = async () => {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
        let type = null;
        if (window.GameDialog && window.GameDialog.prompt) {
          type = await window.GameDialog.prompt(
            'Тип процедурной декорации:\npipe, crate, barrel, watchtower, boulder, lamp_post, chest',
            'crate',
            { title: 'Добавить процедурный проп' }
          );
        }
        if (type) {
          this.pushHistory('добавить проп: ' + type);
          const id = 'prop_' + Date.now();
          const px = this.game.player ? this.game.player.mesh.position.x + 3 : 0;
          const pz = this.game.player ? this.game.player.mesh.position.z + 3 : 0;
          const py = window.Terrain ? window.Terrain.heightAt(px, pz) : 0;
          const propData = {
            id: id,
            name: 'Декорация (' + type + ')',
            type: 'prop',
            meshType: type,
            position: { x: px, y: py, z: pz },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 }
          };
          const WM = window.WorldMetrics;
          if (WM && WM.CUSTOM_PROPS) WM.CUSTOM_PROPS.push(propData);
          this.spawnCustomPropMesh(propData);
          this.populateObjectDropdown('prop');
          this.selectObjectById('prop:' + id);
          this.saveToLocalStorage();
          this.saveToServer(true);
        }
      };

      renderCategories();
      renderCards();
      setTimeout(() => searchInp.focus(), 50);
    }

    _spawnPropFromLibrary(item, silent) {
      if (!item) return;
      this.pushHistory('добавить модель: ' + (item.nameRu || item.file));

      const WM = window.WorldMetrics;
      const id = 'prop_' + item.id + '_' + Date.now();

      // Вычисляем позицию: перед игроком (по направлению взгляда/камеры)
      let px = 0, pz = 0, py = 0;
      if (this.game.player && this.game.player.mesh) {
        const pl = this.game.player.mesh;
        let dirX = 0, dirZ = 1;
        if (this.game.camera) {
          const cd = new THREE.Vector3();
          this.game.camera.getWorldDirection(cd);
          dirX = cd.x;
          dirZ = cd.z;
          const len = Math.hypot(dirX, dirZ);
          if (len > 0.01) { dirX /= len; dirZ /= len; }
        }
        px = pl.position.x + dirX * 6;
        pz = pl.position.z + dirZ * 6;
      } else if (this.game.camera) {
        const cam = this.game.camera;
        px = cam.position.x;
        pz = cam.position.z + 10;
      }

      py = window.Terrain ? window.Terrain.heightAt(px, pz) : 0;

      const propData = {
        id: id,
        name: item.nameRu || item.id,
        type: 'prop',
        meshType: 'fbx',
        modelId: item.id,
        modelFile: item.file,
        position: { x: px, y: py, z: pz },
        rotation: { x: 0, y: 0, z: 0 },
        scale: {
          x: item.defaultScale || 1,
          y: item.defaultScale || 1,
          z: item.defaultScale || 1
        }
      };

      if (WM && WM.CUSTOM_PROPS) WM.CUSTOM_PROPS.push(propData);
      this.spawnCustomPropMesh(propData);
      this.populateObjectDropdown('prop');
      this.selectObjectById('prop:' + id);
      this.saveToLocalStorage();
      this.saveToServer(true);

      if (!silent && this.game && this.game.addChatMessage) {
        this.game.addChatMessage('[Редактор] 🏠 Добавлена 3D-модель: ' + (item.nameRu || item.file), 'system');
      }
    }

    _startClickToPlaceProp(item) {
      if (!item) return;
      this.placePropMode = true;
      this._pendingPlaceProp = item;
      if (this.game && this.game.addChatMessage) {
        this.game.addChatMessage('[Редактор] 🎯 Кликните по террейну для установки: ' + (item.nameRu || item.file) + ' (Shift — несколько, Esc — отмена)', 'system');
      }
    }

    async showAddSpotModal() {
      const mobHint = (window.MOB_DB && window.MOB_DB.listAll)
        ? window.MOB_DB.listAll().slice(0, 12).map(function (m) { return m.id; }).join(', ') + '…'
        : 'scrapper, steam_hound, welding_drone, welding_automaton, steam_crane_spider';
      let mob = null;
      if (window.GameDialog && window.GameDialog.prompt) {
        mob = await window.GameDialog.prompt(
          'Тип моба (id из MOB_DB):\n' + mobHint,
          'scrapper',
          { title: 'Добавить спот мобов' }
        );
      }
      if (!mob) return;

      this.pushHistory('добавить спот: ' + mob);

      const WM = window.WorldMetrics;
      if (!WM || !WM.MOB_SPOTS) return;

      const px = this.game.player ? this.game.player.mesh.position.x + 5 : 0;
      const pz = this.game.player ? this.game.player.mesh.position.z + 5 : 0;
      const u = (px - WM.MIN_X) / WM.W;
      const v = (pz - WM.MIN_Z) / WM.H;

      const newSpot = { region: 'village', np: [u, v], r: 0.012, n: 6, mob: mob, lvl: [1, 5] };
      WM.MOB_SPOTS.push(newSpot);
      const newIdx = WM.MOB_SPOTS.length - 1;

      this.populateObjectDropdown('spot');
      this.selectObjectById('spot:' + newIdx);
    }

    spawnCollisionBarrier(w, h, d, customPos, silent) {
      this.pushHistory('добавить коллизионный барьер');
      const bw = w || 4.0;
      const bh = h || 3.0;
      const bd = d || 1.0;

      const WM = window.WorldMetrics;
      const id = 'barrier_' + Date.now() + '_' + Math.floor(Math.random() * 999);

      // Спавним прямо перед игроком или камерой
      let px = 0, pz = 0, py = 0;
      if (customPos) {
        px = customPos.x;
        py = customPos.y;
        pz = customPos.z;
      } else if (this.game.player && this.game.player.mesh) {
        const pl = this.game.player.mesh;
        let dirX = 0, dirZ = 1;
        if (this.game.camera) {
          const cd = new THREE.Vector3();
          this.game.camera.getWorldDirection(cd);
          dirX = cd.x;
          dirZ = cd.z;
          const len = Math.hypot(dirX, dirZ);
          if (len > 0.01) { dirX /= len; dirZ /= len; }
        }
        px = pl.position.x + dirX * 4;
        pz = pl.position.z + dirZ * 4;
        py = window.Terrain ? window.Terrain.heightAt(px, pz) : 0;
      } else if (this.game.camera) {
        const cam = this.game.camera;
        px = cam.position.x;
        pz = cam.position.z + 8;
        py = window.Terrain ? window.Terrain.heightAt(px, pz) : 0;
      }

      if (this.gridSnap > 0 && customPos) {
        px = Math.round(px / this.gridSnap) * this.gridSnap;
        pz = Math.round(pz / this.gridSnap) * this.gridSnap;
      }

      const propData = {
        id: id,
        name: '🛡️ Блок (' + bw.toFixed(1) + 'x' + bh.toFixed(1) + 'x' + bd.toFixed(1) + 'м)',
        type: 'prop',
        meshType: 'collision_box',
        position: { x: px, y: py, z: pz },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        collision: true,
        hasCollision: true,
        collisionShape: 'box',
        collisionSize: { x: bw, y: bh, z: bd },
        collisionOffset: { x: 0, y: 0, z: 0 }
      };

      if (WM && WM.CUSTOM_PROPS) {
        WM.CUSTOM_PROPS.push(propData);
      }

      this.spawnCustomPropMesh(propData);
      this.populateObjectDropdown('prop');
      this.selectObjectById('prop:' + id);
      this.refreshCollisionBarriersList();
      this.saveToLocalStorage();
      this.saveToServer(true);

      if (!silent && this.game && this.game.addChatMessage) {
        this.game.addChatMessage(`[Барьер] Создан физ. блок ${bw}x${bh}x${bd}м. W/E/R для настройки.`, 'system');
      }
      return propData;
    }

    refreshCollisionBarriersList() {
      if (!this.panel) return;
      const listEl = this.panel.querySelector('#ed-col-barriers-list');
      const countEl = this.panel.querySelector('#txt-col-count');
      if (!listEl) return;

      const WM = window.WorldMetrics;
      const props = (WM && WM.CUSTOM_PROPS) ? WM.CUSTOM_PROPS : [];
      const barriers = props.filter(p => p.meshType === 'collision_box' || String(p.id).startsWith('barrier_'));

      if (countEl) countEl.textContent = `${barriers.length} шт.`;

      if (barriers.length === 0) {
        listEl.innerHTML = '<div style="padding:8px; text-align:center; color:#779988;">Нет созданных барьеров</div>';
        return;
      }

      listEl.innerHTML = '';
      barriers.forEach((b, idx) => {
        const item = document.createElement('div');
        const isSel = this.selectedObject && this.selectedObject.id === b.id;
        const bw = (b.collisionSize && b.collisionSize.x) || 4;
        const bh = (b.collisionSize && b.collisionSize.y) || 3;
        const bd = (b.collisionSize && b.collisionSize.z) || 1;
        item.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 6px;
          border-bottom: 1px solid #1a3322;
          background: ${isSel ? 'rgba(40,120,60,0.45)' : 'transparent'};
          cursor: pointer;
        `;
        item.innerHTML = `
          <span style="color:${isSel ? '#88ffbb' : '#ccddcc'}; font-weight:${isSel ? 'bold' : 'normal'};">
            ${idx + 1}. ${b.name || 'Блок'} (${bw}×${bh}×${bd}м)
          </span>
          <div style="display:flex; gap:4px;">
            <button class="btn-col-pick" style="background:#1b442b; color:#aaffcc; border:1px solid #338855; padding:2px 4px; border-radius:3px; cursor:pointer; font-size:9px;">🎯</button>
            <button class="btn-col-del-one" style="background:#441a1a; color:#ffaaaa; border:1px solid #883333; padding:2px 4px; border-radius:3px; cursor:pointer; font-size:9px;">✕</button>
          </div>
        `;

        item.onclick = (e) => {
          if (e.target.closest('.btn-col-del-one')) {
            e.stopPropagation();
            this.selectObjectById('prop:' + b.id);
            this.deleteSelected();
            this.refreshCollisionBarriersList();
            return;
          }
          this.selectObjectById('prop:' + b.id);
          this.refreshCollisionBarriersList();
        };

        listEl.appendChild(item);
      });
    }

    _applyCollisionBarriersVisibility() {
      const show = !!(this.enabled && (this._collisionBarriersVisible !== false));
      if (this.customPropMeshes) {
        this.customPropMeshes.forEach((mesh, id) => {
          if (mesh && mesh.userData && (mesh.userData.isCollisionBarrier || String(id).startsWith('barrier_') || (mesh.userData.propData && mesh.userData.propData.meshType === 'collision_box'))) {
            mesh.visible = show;
          }
        });
      }
    }

    toggleCollisionBarriersVisibility() {
      this._collisionBarriersVisible = (this._collisionBarriersVisible === false) ? true : false;
      this._applyCollisionBarriersVisibility();
      if (this.game && this.game.addChatMessage) {
        this.game.addChatMessage(`[Коллизии] Отображение барьеров в редакторе: ${this._collisionBarriersVisible ? 'ВИДНЫ' : 'СКРЫТЫ'} (в игре всегда невидимы)`, 'system');
      }
    }

    togglePlaceCollisionBlockMode(on, size) {
      if (on === undefined) on = !this.placeCollisionBlockMode;
      this.placeCollisionBlockMode = on;
      this._pendingColSize = size || this._pendingColSize || { x: 4, y: 3, z: 1 };

      const hint = this.panel && this.panel.querySelector('#ed-col-place-hint');
      const btn = this.panel && this.panel.querySelector('#btn-col-click-place');

      if (on) {
        if (hint) hint.style.display = 'block';
        if (btn) {
          btn.style.background = 'linear-gradient(180deg,#33aa66,#1c663a)';
          btn.style.boxShadow = '0 0 8px rgba(68,255,136,0.6)';
        }
        this._createCollisionGhost(this._pendingColSize);
      } else {
        if (hint) hint.style.display = 'none';
        if (btn) {
          btn.style.background = 'linear-gradient(180deg,#1b4530,#0f2b1d)';
          btn.style.boxShadow = 'none';
        }
        this._clearCollisionGhost();
      }
    }

    _createCollisionGhost(size) {
      this._clearCollisionGhost();
      const sx = size.x || 4, sy = size.y || 3, sz = size.z || 1;
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      const mat = new THREE.MeshBasicMaterial({ color: 0x44ff88, wireframe: true, transparent: true, opacity: 0.8 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = '_colGhost';
      this.scene.add(mesh);
      this._colGhostMesh = mesh;
    }

    _clearCollisionGhost() {
      if (this._colGhostMesh) {
        if (this._colGhostMesh.parent) this._colGhostMesh.parent.remove(this._colGhostMesh);
        if (this._colGhostMesh.geometry) this._colGhostMesh.geometry.dispose();
        if (this._colGhostMesh.material) this._colGhostMesh.material.dispose();
        this._colGhostMesh = null;
      }
    }

    _updateCollisionGhost(pos) {
      if (!this._colGhostMesh || !pos) return;
      const sy = (this._pendingColSize && this._pendingColSize.y) || 3;
      let snapX = pos.x, snapZ = pos.z;
      if (this.gridSnap > 0) {
        snapX = Math.round(pos.x / this.gridSnap) * this.gridSnap;
        snapZ = Math.round(pos.z / this.gridSnap) * this.gridSnap;
      }
      this._colGhostMesh.position.set(snapX, pos.y + sy / 2, snapZ);
    }

    // ============================================================
    //  BSP GEOMETRY MODE — full UE-style brush editor
    // ============================================================
    setDrawBspOp(op) {
      this.drawBspOp = (op === 'sub') ? 'sub' : 'add';
      this._updateBspOpButtons();
      if (this.game && this.game.addChatMessage) {
        this.game.addChatMessage(
          '[BSP] CSG: ' + (this.drawBspOp === 'sub' ? 'SUBTRACTIVE (вырезание)' : 'ADDITIVE (тело)'),
          'system'
        );
      }
    }

    _updateBspOpButtons() {
      const ba = this.panel && this.panel.querySelector('#ed-btn-bsp-add');
      const bs = this.panel && this.panel.querySelector('#ed-btn-bsp-sub');
      if (ba) {
        const on = this.drawBspOp === 'add';
        ba.style.background = on ? '#33aa55' : '#225533';
        ba.style.fontWeight = on ? 'bold' : 'normal';
        ba.style.boxShadow = on ? '0 0 8px #33aa55' : 'none';
      }
      if (bs) {
        const on = this.drawBspOp === 'sub';
        bs.style.background = on ? '#aa3344' : '#442222';
        bs.style.fontWeight = on ? 'bold' : 'normal';
        bs.style.boxShadow = on ? '0 0 8px #aa3344' : 'none';
      }
    }

    _updateBspShapeButtons() {
      if (!this.panel) return;
      this.panel.querySelectorAll('.ed-bsp-shape').forEach(btn => {
        const sh = btn.getAttribute('data-shape');
        const on = this.drawBspMode && this.drawBspShape === sh;
        btn.style.background = on ? '#2288cc' : '#113344';
        btn.style.color = on ? '#fff' : '#aaddff';
        btn.style.fontWeight = on ? 'bold' : 'normal';
        btn.style.boxShadow = on ? '0 0 6px #2288cc' : 'none';
      });
      const bd = this.panel.querySelector('#ed-btn-bsp-draw');
      const bp = this.panel.querySelector('#ed-btn-bsp-place');
      if (bd) {
        const on = this.drawBspMode && this.bspPlaceMode === 'drag';
        bd.style.background = on ? '#2a70a0' : '#1a4060';
        bd.style.boxShadow = on ? '0 0 6px #4a9acc' : 'none';
      }
      if (bp) {
        const on = this.drawBspMode && this.bspPlaceMode === 'click';
        bp.style.background = on ? '#2a6080' : '#1a3040';
        bp.style.boxShadow = on ? '0 0 6px #3a90aa' : 'none';
      }
    }

    _updateBspDrawButtons() { this._updateBspShapeButtons(); }

    toggleDrawBspMode(force, shape) {
      if (this.drawHuntMode) this.toggleDrawHuntMode(false);

      if (force === undefined && shape && this.drawBspMode && this.drawBspShape === shape && this.bspPlaceMode === 'drag') {
        this.drawBspMode = false;
      } else if (force === false) {
        this.drawBspMode = false;
      } else if (force === true) {
        this.drawBspMode = true;
        if (shape) this.drawBspShape = shape;
        if (this.editorMode !== 'bsp') this.editorMode = 'bsp';
      } else {
        this.drawBspMode = !this.drawBspMode;
        if (shape) this.drawBspShape = shape;
        if (this.drawBspMode) this.editorMode = 'bsp';
      }

      this._bspDrawPhase = 0;
      this._bspCornerA = null;
      this._bspCornerB = null;
      this._clearBspPreview();
      this._clearBspGhost();
      this._updateBspShapeButtons();

      const hint = this.panel && this.panel.querySelector('#ed-bsp-draw-hint');
      if (hint) {
        hint.style.display = this.drawBspMode ? 'block' : 'none';
        if (this.drawBspMode) {
          const mode = this.bspPlaceMode === 'click' ? 'PLACE (click)' : 'DRAW (drag)';
          hint.innerHTML =
            '<b>' + mode + '</b> · ' + this.drawBspShape + ' · <b>' + this.drawBspOp.toUpperCase() + '</b><br/>' +
            (this.bspPlaceMode === 'click'
              ? 'Клик по земле = brush ' + (this._bspDefaultSize.x) + '×' + this._bspDefaultSize.y + '×' + this._bspDefaultSize.z + ' · [ ] сетка · +/− размер'
              : 'Drag XZ → отпусти → высота мышью → клик/Enter · Esc отмена') +
            '<br/><span style="color:#8899aa">Ctrl+B Build · End = Add/Sub · стек справа = порядок CSG</span>';
        }
      }
      if (this.drawBspMode) {
        this.deselectObject();
        this.setFilterCategory('bsp');
        if (this.game.addChatMessage) {
          this.game.addChatMessage(
            '[BSP] ' + (this.bspPlaceMode === 'click' ? 'Place' : 'Draw') +
            ' ' + this.drawBspShape + ' [' + this.drawBspOp + ']',
            'system'
          );
        }
      }
    }

    refreshBspStackList() {
      const box = this.panel && this.panel.querySelector('#ed-bsp-stack');
      if (!box) return;
      const BB = window.BspBrushes;
      const list = (BB && BB.getBrushes()) || [];
      if (!list.length) {
        box.innerHTML = '<div style="color:#667788; padding:8px; text-align:center;">пусто — Draw / Place brush</div>';
        return;
      }
      const selId = (this.selectedObject && this.selectedObject.type === 'bsp')
        ? this.selectedObject.id : null;
      let html = '';
      list.forEach((b, idx) => {
        const isSel = b.id === selId;
        const opCol = b.op === 'sub' ? '#ff6688' : '#66ddaa';
        const dim = b.disabled ? 'opacity:0.4;' : '';
        const bg = isSel ? 'background:rgba(80,140,200,0.35);' : (idx % 2 ? 'background:rgba(255,255,255,0.03);' : '');
        html += '<div class="ed-bsp-stack-item" data-id="' + b.id + '" style="padding:4px 6px; cursor:pointer; border-bottom:1px solid #223344; ' + bg + dim + ' display:flex; gap:4px; align-items:center;">' +
          '<span style="color:#556677; width:16px; text-align:right;">' + (idx + 1) + '</span>' +
          '<span style="color:' + opCol + '; font-weight:bold; width:28px;">' + (b.op === 'sub' ? 'SUB' : 'ADD') + '</span>' +
          '<span style="color:#cceeff; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
          (b.disabled ? '⊘ ' : '') + (b.name || b.id) + ' <span style="color:#667788">(' + (b.shape || 'box') + ')</span></span>' +
          '</div>';
      });
      box.innerHTML = html;
      box.querySelectorAll('.ed-bsp-stack-item').forEach(el => {
        el.onclick = () => {
          const id = el.getAttribute('data-id');
          this.setFilterCategory('bsp');
          this.selectBspBrush(id);
          this.refreshBspStackList();
        };
      });
    }

    _refreshBspBuildStatus() {
      const el = this.panel && this.panel.querySelector('#ed-bsp-build-status');
      if (!el || !window.BspBrushes) return;
      const info = window.BspBrushes.getLastBuildInfo();
      const dirty = window.BspBrushes.isDirty && window.BspBrushes.isDirty();
      if (dirty) {
        el.textContent = 'dirty…';
        el.style.color = '#ffaa44';
      } else if (info.error) {
        el.textContent = 'err';
        el.style.color = '#ff6688';
      } else {
        el.textContent = (info.tris || 0) + ' tri · ' + (info.ms || 0) + 'ms';
        el.style.color = '#66cc88';
      }
    }

    buildBspGeometry(forceChat) {
      const BB = window.BspBrushes;
      if (!BB) return;
      const info = BB.buildGeometry();
      this._refreshBspBuildStatus();
      if (forceChat && this.game.addChatMessage) {
        if (info && info.ok) {
          this.game.addChatMessage(
            '[BSP] Built: ' + info.brushes + ' brushes → ' + info.tris + ' tris (' + info.ms + ' ms)',
            'system'
          );
        } else {
          this.game.addChatMessage('[BSP] Build failed: ' + ((info && info.error) || 'empty'), 'system');
        }
      }
      return info;
    }

    reorderSelectedBsp(dir) {
      if (!this.selectedObject || this.selectedObject.type !== 'bsp') return;
      const BB = window.BspBrushes;
      if (!BB) return;
      this.pushHistory('BSP reorder');
      if (BB.reorderBrush(this.selectedObject.id, dir)) {
        BB.rebuildShells();
        BB.markDirty();
        if (BB.isAutoBuild()) BB.scheduleBuild(80);
        this.refreshBspStackList();
        this.populateObjectDropdown('bsp');
      }
    }

    toggleSelectedBspOp() {
      if (!this.selectedObject || this.selectedObject.type !== 'bsp') return;
      const BB = window.BspBrushes;
      const b = BB && BB.findBrush(this.selectedObject.id);
      if (!b) return;
      this.pushHistory('BSP toggle op');
      b.op = b.op === 'sub' ? 'add' : 'sub';
      BB.upsertBrush(b);
      BB.rebuildOne(b.id);
      this.selectBspBrush(b.id);
      this.refreshBspStackList();
      this.saveToLocalStorage();
    }

    toggleSelectedBspDisabled() {
      if (!this.selectedObject || this.selectedObject.type !== 'bsp') return;
      const BB = window.BspBrushes;
      const b = BB && BB.findBrush(this.selectedObject.id);
      if (!b) return;
      this.pushHistory('BSP disable');
      b.disabled = !b.disabled;
      BB.upsertBrush(b);
      BB.rebuildOne(b.id);
      this.selectBspBrush(b.id);
      this.refreshBspStackList();
      this.saveToLocalStorage();
    }

    _nudgeBspSize(delta) {
      if (!this.selectedObject || this.selectedObject.type !== 'bsp') return;
      const BB = window.BspBrushes;
      if (!BB) return;
      this.pushHistory('BSP size');
      BB.adjustBrushSize(this.selectedObject.id, 'all', delta, this._bspGrid || this.gridSnap || 0.5);
      const b = BB.findBrush(this.selectedObject.id);
      if (b) {
        this.selectedObject.scale = { x: b.size.x, y: b.size.y, z: b.size.z };
        this.selectedObject.targetData = b;
        if (this.selectedObject.mesh) {
          this.selectedObject.mesh.scale.set(b.size.x, b.size.y, b.size.z);
        }
      }
      this.updateInspectorFields();
      this.saveToLocalStorage();
    }

    _clearBspPreview() {
      if (this._bspPreviewMesh) {
        if (this._bspPreviewMesh.parent) this._bspPreviewMesh.parent.remove(this._bspPreviewMesh);
        this._bspPreviewMesh.traverse(c => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) {
            if (Array.isArray(c.material)) c.material.forEach(m => m.dispose && m.dispose());
            else if (c.material.dispose) c.material.dispose();
          }
        });
        this._bspPreviewMesh = null;
      }
    }

    _ensureBspPreview() {
      if (this._bspPreviewMesh) return this._bspPreviewMesh;
      const BB = window.BspBrushes;
      const col = this.drawBspOp === 'sub' ? 0xff4466 : 0x44aaff;
      this._bspPreviewMesh = BB && BB.createPreviewMesh
        ? BB.createPreviewMesh(col)
        : new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshBasicMaterial({ color: col, wireframe: true })
        );
      this.scene.add(this._bspPreviewMesh);
      return this._bspPreviewMesh;
    }

    _updateBspPreviewFootprint(a, b, height) {
      if (!a || !b) return;
      const grid = this.gridSnap || 0;
      let minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
      let minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z);
      if (grid > 0) {
        minX = Math.round(minX / grid) * grid;
        maxX = Math.round(maxX / grid) * grid;
        minZ = Math.round(minZ / grid) * grid;
        maxZ = Math.round(maxZ / grid) * grid;
      }
      const w = Math.max(0.5, maxX - minX);
      const d = Math.max(0.5, maxZ - minZ);
      const h = Math.max(0.3, height != null ? height : this._bspDefaultHeight);
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      const baseY = (a.y != null ? a.y : this._bspBaseY) || 0;
      // bottom of brush on ground
      const cy = baseY + h * 0.5;

      const mesh = this._ensureBspPreview();
      mesh.position.set(cx, cy, cz);
      mesh.scale.set(w, h, d);
      mesh.visible = true;
      mesh.userData._bspPrev = { minX, maxX, minZ, maxZ, w, d, h, cx, cy, cz, baseY };
    }

    selectBspBrush(id) {
      const BB = window.BspBrushes;
      if (!BB) return;
      const b = BB.findBrush(id);
      if (!b) return;
      let mesh = BB.getMesh(id);
      if (!mesh) mesh = BB.rebuildOne(id);
      // for gizmo, use shell group (has position/scale = size)
      this.selectObject({
        type: 'bsp',
        id: b.id,
        name: b.name || b.id,
        targetData: b,
        mesh: mesh,
        position: { x: b.position.x, y: b.position.y, z: b.position.z },
        rotation: {
          x: b.rotation ? b.rotation.x || 0 : 0,
          y: b.rotation ? b.rotation.y || 0 : 0,
          z: b.rotation ? b.rotation.z || 0 : 0
        },
        scale: {
          x: b.size ? b.size.x : 1,
          y: b.size ? b.size.y : 1,
          z: b.size ? b.size.z : 1
        }
      });
      this.refreshBspStackList();
    }

    applyBspFromInputs() {
      if (!this.selectedObject || this.selectedObject.type !== 'bsp') return;
      const BB = window.BspBrushes;
      if (!BB) return;
      this.pushHistory('BSP edit: ' + this.selectedObject.id);

      const b = BB.findBrush(this.selectedObject.id) || {};
      const nameEl = this.panel.querySelector('#inp-bsp-name');
      const opEl = this.panel.querySelector('#inp-bsp-op');
      const shEl = this.panel.querySelector('#inp-bsp-shape');
      const texEl = this.panel.querySelector('#inp-bsp-tex');
      const uvEl = this.panel.querySelector('#inp-bsp-uv');
      const colEl = this.panel.querySelector('#inp-bsp-color');
      const colChk = this.panel.querySelector('#inp-bsp-col');
      const sx = parseFloat((this.panel.querySelector('#inp-bsp-sx') || {}).value);
      const sy = parseFloat((this.panel.querySelector('#inp-bsp-sy') || {}).value);
      const sz = parseFloat((this.panel.querySelector('#inp-bsp-sz') || {}).value);
      const px = parseFloat((this.panel.querySelector('#inp-pos-x') || {}).value);
      const py = parseFloat((this.panel.querySelector('#inp-pos-y') || {}).value);
      const pz = parseFloat((this.panel.querySelector('#inp-pos-z') || {}).value);
      const ryDeg = parseFloat((this.panel.querySelector('#inp-rot-y') || {}).value);

      if (nameEl) b.name = nameEl.value || b.name;
      if (opEl) b.op = opEl.value === 'sub' ? 'sub' : 'add';
      if (shEl) b.shape = shEl.value || 'box';
      if (texEl) b.texture = texEl.value || '';
      if (uvEl && !isNaN(parseFloat(uvEl.value))) b.uvScale = Math.max(0.01, parseFloat(uvEl.value));
      if (colEl && colEl.value) b.color = parseInt(colEl.value.replace('#', ''), 16);
      if (colChk) b.collision = !!colChk.checked;

      b.size = {
        x: isNaN(sx) ? (b.size && b.size.x) || 1 : Math.max(0.1, sx),
        y: isNaN(sy) ? (b.size && b.size.y) || 1 : Math.max(0.1, sy),
        z: isNaN(sz) ? (b.size && b.size.z) || 1 : Math.max(0.1, sz)
      };
      b.position = {
        x: isNaN(px) ? b.position.x : px,
        y: isNaN(py) ? b.position.y : py,
        z: isNaN(pz) ? b.position.z : pz
      };
      b.rotation = {
        x: b.rotation ? b.rotation.x || 0 : 0,
        y: isNaN(ryDeg) ? (b.rotation ? b.rotation.y : 0) : (ryDeg * Math.PI) / 180,
        z: b.rotation ? b.rotation.z || 0 : 0
      };

      BB.upsertBrush(b);
      const mesh = BB.applyMaterialChange(b.id);
      this.selectedObject.targetData = b;
      this.selectedObject.name = b.name;
      this.selectedObject.mesh = mesh || this.selectedObject.mesh;
      this.selectedObject.position = { x: b.position.x, y: b.position.y, z: b.position.z };
      this.selectedObject.rotation = { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z };
      this.selectedObject.scale = { x: b.size.x, y: b.size.y, z: b.size.z };
      if (this.gizmoGroup) {
        this.gizmoGroup.position.set(b.position.x, b.position.y, b.position.z);
        this.gizmoGroup.rotation.y = b.rotation.y;
      }
      if (this.selectionBox) this.selectionBox.position.set(b.position.x, b.position.y, b.position.z);
      this.saveToLocalStorage();
      this.populateObjectDropdown('bsp');
      this.refreshBspStackList();
      this._refreshBspBuildStatus();
      // re-select to refresh inspector
      this.selectBspBrush(b.id);
    }

    applyBspFaceTexture(faceKey, textureId, clear) {
      if (!this.selectedObject || this.selectedObject.type !== 'bsp') return;
      const BB = window.BspBrushes;
      if (!BB) return;
      this.pushHistory('BSP face tex: ' + faceKey);
      const b = BB.findBrush(this.selectedObject.id);
      if (!b) return;
      if (!b.faces) b.faces = {};
      if (clear || textureId === null) {
        delete b.faces[faceKey];
        if (Object.keys(b.faces).length === 0) b.faces = null;
      } else {
        b.faces[faceKey] = Object.assign({}, b.faces[faceKey] || {}, { texture: textureId });
      }
      BB.upsertBrush(b);
      BB.applyMaterialChange(b.id);
      this.selectedObject.targetData = b;
      this.saveToLocalStorage();
      this.selectBspBrush(b.id);
      if (this.game.addChatMessage) {
        this.game.addChatMessage(
          clear || textureId === null
            ? '[BSP] Грань ' + faceKey + ' сброшена'
            : '[BSP] Грань ' + faceKey + ' → ' + (textureId || 'цвет'),
          'system'
        );
      }
    }

    _finishBspBrushCreate(prev) {
      const BB = window.BspBrushes;
      if (!BB || !prev) return;
      this.pushHistory('BSP create ' + this.drawBspShape);

      const n = (BB.getBrushes().length || 0) + 1;
      const b = BB.defaultBrush({
        name: (this.drawBspOp === 'sub' ? 'Sub ' : 'Add ') + (this.drawBspShape || 'box') + ' ' + n,
        shape: this.drawBspShape || 'box',
        op: this.drawBspOp || 'add',
        position: { x: prev.cx, y: prev.cy, z: prev.cz },
        size: { x: prev.w, y: prev.h, z: prev.d },
        // material color: white for sub so cut faces aren't tinted pink/red;
        // shell wire color is drawn from op, not from this field
        texture: this._bspDefaultTexture || 'town_cobblestone.webp',
        color: 0xffffff,
        collision: true
      });
      // remember size for Place mode
      this._bspDefaultSize = { x: prev.w, y: prev.h, z: prev.d };
      this._bspDefaultHeight = prev.h;

      BB.upsertBrush(b);
      BB.ensureRoot(this.scene);
      BB.rebuildOne(b.id); // shell + dirty → auto CSG build

      this._clearBspPreview();
      this._clearBspGhost();
      // stay in draw mode for rapid placement (UE-like); Esc to exit
      this._bspDrawPhase = 0;
      this._bspCornerA = null;
      this._bspCornerB = null;
      this._updateBspShapeButtons();

      this.populateObjectDropdown('bsp');
      this.refreshBspStackList();
      this.selectBspBrush(b.id);
      this.saveToLocalStorage();
      this._refreshBspBuildStatus();
      // poll status after auto-build
      setTimeout(() => this._refreshBspBuildStatus(), 200);

      if (this.game.addChatMessage) {
        this.game.addChatMessage(
          '[BSP] ' + b.op.toUpperCase() + ' ' + b.shape + ' ' +
          prev.w.toFixed(1) + '×' + prev.h.toFixed(1) + '×' + prev.d.toFixed(1) +
          ' m · stack#' + n + (BB.isAutoBuild() ? ' · building…' : ' · Ctrl+B to build'),
          'system'
        );
      }
    }

    _placeBspAtPoint(pt) {
      if (!pt) return;
      const grid = this._bspGrid || this.gridSnap || 0;
      let x = pt.x, z = pt.z, y = pt.y;
      if (grid > 0) {
        x = Math.round(x / grid) * grid;
        z = Math.round(z / grid) * grid;
      }
      const sx = this._bspDefaultSize.x || 4;
      const sy = this._bspDefaultSize.y || 3;
      const sz = this._bspDefaultSize.z || 4;
      // bottom on ground
      const cy = y + sy * 0.5;
      this._finishBspBrushCreate({
        cx: x, cy: cy, cz: z,
        w: sx, h: sy, d: sz,
        baseY: y
      });
    }

    _clearBspGhost() {
      if (this._bspGhostMesh) {
        if (this._bspGhostMesh.parent) this._bspGhostMesh.parent.remove(this._bspGhostMesh);
        this._bspGhostMesh.traverse(c => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) {
            if (Array.isArray(c.material)) c.material.forEach(m => m.dispose && m.dispose());
            else if (c.material.dispose) c.material.dispose();
          }
        });
        this._bspGhostMesh = null;
      }
    }

    _updateBspGhost(pt) {
      if (!pt) return;
      const BB = window.BspBrushes;
      const col = this.drawBspOp === 'sub' ? 0xff4466 : 0x44aaff;
      if (!this._bspGhostMesh) {
        this._bspGhostMesh = BB && BB.createPreviewMesh
          ? BB.createPreviewMesh(col)
          : new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.7 })
          );
        this.scene.add(this._bspGhostMesh);
      }
      const sx = this._bspDefaultSize.x || 4;
      const sy = this._bspDefaultSize.y || 3;
      const sz = this._bspDefaultSize.z || 4;
      const grid = this._bspGrid || this.gridSnap || 0;
      let x = pt.x, z = pt.z, y = pt.y;
      if (grid > 0) {
        x = Math.round(x / grid) * grid;
        z = Math.round(z / grid) * grid;
      }
      this._bspGhostMesh.position.set(x, y + sy * 0.5, z);
      this._bspGhostMesh.scale.set(sx, sy, sz);
      this._bspGhostMesh.visible = true;
    }

    // ============================================================
    //  МЕТКИ ДЛЯ ГЕОМЕТРИИ
    // ============================================================
    _siteType() {
      const sel = this.panel && this.panel.querySelector('#ed-site-type');
      return (sel && sel.value) || 'custom';
    }

    toggleDrawSiteMode(force, kind) {
      if (!this._drawToolLock && this.drawHuntMode) {
        this._drawToolLock = true;
        this.toggleDrawHuntMode(false);
        this._drawToolLock = false;
      }
      if (this.drawBspMode) this.toggleDrawBspMode(false);
      const next = (force !== undefined) ? !!force : !this.drawSiteMode;
      if (force === undefined && this.drawSiteMode && kind && this.drawSiteKind === kind) {
        this.drawSiteMode = false;
      } else {
        this.drawSiteMode = next;
        if (kind) this.drawSiteKind = kind;
      }
      this._sitePolyPts = [];
      this._clearHuntPreview();
      const hint = this.panel && this.panel.querySelector('#ed-site-draw-hint');
      if (hint) {
        hint.style.display = this.drawSiteMode ? 'block' : 'none';
        if (this.drawSiteMode) {
          if (this.drawSiteKind === 'poly') {
            hint.textContent = 'Пятно: клики = вершины · Enter/ПКМ закрыть · Esc отмена · зоны видны';
          } else if (this.drawSiteKind === 'line') {
            hint.textContent = 'Линия: клики = точки пути · Enter/ПКМ готово (≥2) · Esc отмена · зоны видны';
          } else {
            hint.textContent = 'Пин: клик по земле · направление = камера · Esc отмена · зоны видны';
          }
        }
      }
      const pin = this.panel && this.panel.querySelector('#ed-btn-site-pin');
      const poly = this.panel && this.panel.querySelector('#ed-btn-site-poly');
      const line = this.panel && this.panel.querySelector('#ed-btn-site-line');
      if (pin) {
        const on = this.drawSiteMode && this.drawSiteKind === 'pin';
        pin.textContent = on ? '✋ Отмена' : '📌 Пин';
        pin.style.background = on ? '#446688' : '#223344';
      }
      if (poly) {
        const on = this.drawSiteMode && this.drawSiteKind === 'poly';
        poly.textContent = on ? '✋ Отмена' : '⬡ Пятно';
        poly.style.background = on ? '#448844' : '#223322';
      }
      if (line) {
        const on = this.drawSiteMode && this.drawSiteKind === 'line';
        line.textContent = on ? '✋ Отмена' : '〰 Линия';
        line.style.background = on ? '#aa7744' : '#332211';
      }
      if (this.drawSiteMode) {
        this.deselectObject();
        if (this.game.addChatMessage) {
          const msg = this.drawSiteKind === 'poly'
            ? '[Метка] Пятно: кликай вершины, Enter — закрыть. Зоны остаются видимыми.'
            : this.drawSiteKind === 'line'
              ? '[Метка] Линия застройки: кликай точки пути, Enter — готово. Зоны видны.'
              : '[Метка] Клик по земле — пин (куда смотрит камера). Зоны видны.';
          this.game.addChatMessage(msg, 'system');
        }
      }
    }

    toggleDrawGroundMode(force, surface, shape) {
      if (this.drawHuntMode) this.toggleDrawHuntMode(false);
      if (this.drawBspMode) this.toggleDrawBspMode(false);
      if (this.drawSiteMode) this.toggleDrawSiteMode(false);
      const next = (force !== undefined) ? !!force : !this.drawGroundMode;
      if (force === undefined && this.drawGroundMode && surface && this.drawGroundSurface === surface) {
        this.drawGroundMode = false;
      } else {
        this.drawGroundMode = next;
        if (surface) this.drawGroundSurface = surface;
        if (shape) this.drawGroundShape = shape;
      }
      this._groundPolyPts = [];
      this._groundRectA = null;
      this._clearHuntPreview();
      const hint = this.panel && this.panel.querySelector('#ed-ground-draw-hint');
      if (hint) {
        hint.style.display = this.drawGroundMode ? 'block' : 'none';
        if (this.drawGroundMode) {
          hint.textContent = this.drawGroundShape === 'line'
            ? 'Дорога: клики = путь · Enter/ПКМ готово (≥2) · Esc отмена'
            : 'Пятно: клики = вершины · Enter/ПКМ закрыть (≥3) · Esc отмена';
        }
      }
      const setBtn = (id, on, onBg, offBg, onTxt, offTxt) => {
        const el = this.panel && this.panel.querySelector(id);
        if (!el) return;
        el.textContent = on ? onTxt : offTxt;
        el.style.background = on ? onBg : offBg;
      };
      const on = this.drawGroundMode;
      setBtn('#ed-btn-g-road', on && this.drawGroundSurface === 'road', '#aa7744', '#443322', '✋ Отмена', '〰 Дорога');
      setBtn('#ed-btn-g-plaza', on && this.drawGroundSurface === 'plaza', '#888866', '#333322', '✋ Отмена', '⬡ Площадь');
      setBtn('#ed-btn-g-grass', on && this.drawGroundSurface === 'grass', '#55aa55', '#223322', '✋ Отмена', '🌿 Трава');
      if (this.drawGroundMode) {
        this.deselectObject();
        if (this.game.addChatMessage) {
          this.game.addChatMessage('[Земля] Рисуй на террейне. Enter — готово.', 'system');
        }
      }
    }

    _groundWidth() {
      const el = this.panel && this.panel.querySelector('#ed-ground-width');
      const n = el ? parseFloat(el.value) : 8;
      return (isFinite(n) && n > 0) ? n : 8;
    }

    _finishGroundDraw() {
      const kind = this.drawGroundShape === 'line' ? 'line' : 'poly';
      const minPts = kind === 'line' ? 2 : 3;
      const pts = (this._groundPolyPts || []).slice();
      if (pts.length < minPts) {
        if (this.game.addChatMessage) this.game.addChatMessage('[Земля] Мало точек.', 'system');
        return;
      }
      const WM = window.WorldMetrics;
      if (!WM || !WM.addGroundMark) return;
      const poly = pts.map((p) => [(p.x - WM.MIN_X) / WM.W, (p.z - WM.MIN_Z) / WM.H]);
      const surface = this.drawGroundSurface || 'road';
      this.pushHistory('земля: ' + surface);
      WM.addGroundMark({
        kind: kind,
        surface: surface,
        width: this._groundWidth(),
        poly: poly
      });
      this.toggleDrawGroundMode(false);
      this.saveToLocalStorage();
      this.saveToServer(true);
      if (window.VillageGround && window.VillageGround.rebuild) {
        window.VillageGround.rebuild(this.scene);
      }
      this.refreshGroundList();
      if (this.game.addChatMessage) this.game.addChatMessage('[Земля] Сохранено · ' + surface, 'system');
    }

    refreshGroundList() {
      const box = this.panel && this.panel.querySelector('#ed-ground-list');
      if (!box) return;
      const WM = window.WorldMetrics;
      const list = (WM && WM.listGroundMarks) ? WM.listGroundMarks() : [];
      if (!list.length) { box.innerHTML = '<div style="color:#667766;padding:4px;">пусто — нарисуй дорогу/траву</div>'; return; }
      box.innerHTML = list.map((m) => {
        const lab = m.surface === 'grass' ? 'трава' : (m.surface === 'plaza' ? 'площадь' : 'дорога');
        return '<div style="display:flex;justify-content:space-between;gap:6px;padding:3px 4px;border-bottom:1px solid #335533;">' +
          '<span>' + lab + ' · ' + (m.kind === 'line' ? 'линия' : 'пятно') + '</span>' +
          '<button data-gid="' + m.id + '" class="ed-g-del" style="background:#442222;color:#ffaaaa;border:1px solid #aa5555;border-radius:3px;cursor:pointer;font-size:10px;">×</button></div>';
      }).join('');
      box.querySelectorAll('.ed-g-del').forEach((btn) => {
        btn.onclick = () => {
          const id = btn.getAttribute('data-gid');
          if (!id || !WM.markGroundMarkDeleted) return;
          this.pushHistory('земля: удалить');
          WM.markGroundMarkDeleted(id);
          this.saveToLocalStorage();
          this.saveToServer(true);
          if (window.VillageGround && window.VillageGround.rebuild) window.VillageGround.rebuild(this.scene);
          this.refreshGroundList();
        };
      });
    }

    _siteKindLabel(s) {
      if (!s) return 'пин';
      if (s.kind === 'poly') return 'пятно';
      if (s.kind === 'line') return 'линия';
      return 'пин';
    }

    _createSiteMarker(s) {
      if (!THREE || !s) return null;
      const y = (window.Terrain && window.Terrain.heightAt)
        ? window.Terrain.heightAt(s.x, s.z) : (s.y || 0);
      const group = new THREE.Group();
      group.position.set(s.x, y + 0.2, s.z);
      const col = s.kind === 'line' ? 0xffcc66 : (s.kind === 'poly' ? 0x66ffaa : 0x66aaff);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 4.2, 8),
        new THREE.MeshBasicMaterial({ color: col })
      );
      pole.position.y = 2.1;
      group.add(pole);
      const flag = new THREE.Mesh(
        new THREE.ConeGeometry(0.85, 1.6, 8),
        new THREE.MeshBasicMaterial({ color: s.kind === 'line' ? 0xffaa44 : 0xffee88 })
      );
      flag.position.y = 4.6;
      group.add(flag);
      const WM = window.WorldMetrics;
      const minP = s.kind === 'line' ? 2 : 3;
      if ((s.kind === 'poly' || s.kind === 'line') && s.poly && s.poly.length >= minP && WM) {
        const local = s.poly.map((uv) => {
          const wx = WM.wx(uv[0]);
          const wz = WM.wz(uv[1]);
          const wy = (window.Terrain && window.Terrain.heightAt)
            ? window.Terrain.heightAt(wx, wz) : y;
          return new THREE.Vector3(wx - s.x, (wy - y) + 0.45, wz - s.z);
        });
        const closed = s.kind === 'poly';
        const loop = closed ? local.concat([local[0]]) : local;
        const geo = new THREE.BufferGeometry().setFromPoints(loop);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col }));
        group.add(line);
        local.forEach((p) => {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.45, 8, 8),
            new THREE.MeshBasicMaterial({ color: col })
          );
          dot.position.copy(p);
          group.add(dot);
        });
      }
      const yaw = s.yaw || 0;
      const dir = new THREE.ArrowHelper(
        new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
        new THREE.Vector3(0, 0.4, 0),
        4.5, 0xffcc44, 0.7, 0.45
      );
      group.add(dir);
      group.userData = { isEditorMarker: true, markerType: 'site', siteId: s.id, siteData: s };
      group.traverse((c) => { if (c.isMesh) c.userData = group.userData; });
      return group;
    }

    refreshSitesList() {
      const box = this.panel && this.panel.querySelector('#ed-sites-list');
      if (!box) return;
      const WM = window.WorldMetrics;
      const list = (WM && WM.listBuildSites) ? WM.listBuildSites() : [];
      if (!list.length) {
        box.innerHTML = '<div style="padding:6px;color:#667788;">пусто — пин, пятно или линия</div>';
        return;
      }
      box.innerHTML = list.map((s, i) => {
        const sel = s.id === this._selectedSiteId;
        return '<div data-site="' + s.id + '" style="padding:4px 6px;cursor:pointer;border-bottom:1px solid #223344;' +
          (sel ? 'background:#334466;' : '') + '">' +
          (i + 1) + '. <b>' + (s.name || s.id) + '</b> · ' + (s.type || 'custom') +
          ' · ' + this._siteKindLabel(s) +
          (s.note ? '<div style="color:#99aabb;font-size:9px;">' + String(s.note).replace(/</g, '') + '</div>' : '') +
          '</div>';
      }).join('');
      box.querySelectorAll('[data-site]').forEach((el) => {
        el.onclick = () => this.selectObjectById('site:' + el.getAttribute('data-site'));
      });
    }

    selectBuildSite(id) {
      this._selectedSiteId = id;
      const WM = window.WorldMetrics;
      const s = ((WM.listBuildSites && WM.listBuildSites()) || []).find((x) => x.id === id);
      const edit = this.panel && this.panel.querySelector('#ed-site-edit');
      if (edit) edit.style.display = s ? 'block' : 'none';
      if (s) {
        const n = this.panel.querySelector('#ed-site-name');
        const t = this.panel.querySelector('#ed-site-type');
        const note = this.panel.querySelector('#ed-site-note');
        if (n) n.value = s.name || '';
        if (t) t.value = s.type || 'custom';
        if (note) note.value = s.note || '';
      }
      this.refreshSitesList();
    }

    _saveSelectedSiteFields() {
      if (!this._selectedSiteId || !window.WorldMetrics) return;
      const n = this.panel.querySelector('#ed-site-name');
      const t = this.panel.querySelector('#ed-site-type');
      const note = this.panel.querySelector('#ed-site-note');
      this.pushHistory('метка: правка');
      window.WorldMetrics.updateBuildSite(this._selectedSiteId, {
        name: n ? n.value : undefined,
        type: t ? t.value : undefined,
        note: note ? note.value : undefined
      });
      this.saveToLocalStorage();
      this.saveToServer(true);
      this._markersDirty = true;
      this.init3DMarkers();
      this.refreshSitesList();
      if (this.game.addChatMessage) this.game.addChatMessage('[Метка] Сохранена', 'system');
    }

    _deleteSelectedSite() {
      if (!this._selectedSiteId || !window.WorldMetrics) return;
      this.pushHistory('метка: удалить');
      window.WorldMetrics.markBuildSiteDeleted(this._selectedSiteId);
      this._selectedSiteId = null;
      const edit = this.panel.querySelector('#ed-site-edit');
      if (edit) edit.style.display = 'none';
      this.saveToLocalStorage();
      this.saveToServer(true);
      this._markersDirty = true;
      this.init3DMarkers();
      this.refreshSitesList();
    }

    async _placeSitePin(pt) {
      const WM = window.WorldMetrics;
      if (!WM || !WM.addBuildSite || this._siteBusy) return;
      this._siteBusy = true;
      const type = this._siteType();
      let name = 'Метка ' + type;
      let note = '';
      const GD = window.GameDialog;
      if (GD && GD.prompt) {
        const n = await GD.prompt('Имя метки:', name, { title: 'Метка геометрии' });
        if (n == null) { this._siteBusy = false; return; }
        name = n || name;
        const c = await GD.prompt('Комментарий (что строить):', '', { title: 'Метка геометрии' });
        if (c == null) { this._siteBusy = false; return; }
        note = c || '';
      }
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const yaw = Math.atan2(dir.x, dir.z);
      const y = (window.Terrain && window.Terrain.heightAt) ? window.Terrain.heightAt(pt.x, pt.z) : 0;
      this.pushHistory('метка пин: ' + name);
      const entry = WM.addBuildSite({
        name: name,
        kind: 'pin',
        type: type,
        note: note,
        x: pt.x, y: y, z: pt.z,
        yaw: yaw,
        np: [(pt.x - WM.MIN_X) / WM.W, (pt.z - WM.MIN_Z) / WM.H]
      });
      this.toggleDrawSiteMode(false);
      this._markersDirty = true;
      this.init3DMarkers();
      this.selectObjectById('site:' + entry.id);
      this.saveToLocalStorage();
      this.saveToServer(true);
      this._siteBusy = false;
      if (this.game.addChatMessage) {
        this.game.addChatMessage('[Метка] «' + name + '» · ' + type + ' @ ' +
          pt.x.toFixed(1) + ', ' + pt.z.toFixed(1), 'system');
      }
    }

    async _finishSiteDrawPoly() {
      return this._finishSiteDrawPath(this.drawSiteKind === 'line' ? 'line' : 'poly');
    }

    async _finishSiteDrawPath(kind) {
      kind = (kind === 'line') ? 'line' : 'poly';
      const minPts = kind === 'line' ? 2 : 3;
      const pts = (this._sitePolyPts || []).slice();
      if (pts.length < minPts) {
        if (this.game.addChatMessage) {
          this.game.addChatMessage(
            kind === 'line' ? '[Метка] Нужно ≥ 2 точки линии.' : '[Метка] Нужно ≥ 3 вершины.',
            'system'
          );
        }
        return;
      }
      if (this._siteBusy) return;
      this._siteBusy = true;
      this.toggleDrawSiteMode(false);
      const WM = window.WorldMetrics;
      if (!WM || !WM.addBuildSite) { this._siteBusy = false; return; }
      const type = this._siteType();
      let name = (kind === 'line' ? 'Линия ' : 'Пятно ') + type;
      let note = '';
      const GD = window.GameDialog;
      const title = kind === 'line' ? 'Линия застройки' : 'Метка геометрии';
      if (GD && GD.prompt) {
        const n = await GD.prompt(kind === 'line' ? 'Имя линии:' : 'Имя пятна:', name, { title: title });
        if (n == null) { this._siteBusy = false; return; }
        name = n || name;
        const c = await GD.prompt('Комментарий (что строить):', '', { title: title });
        if (c == null) { this._siteBusy = false; return; }
        note = c || '';
      }
      const poly = pts.map((p) => [(p.x - WM.MIN_X) / WM.W, (p.z - WM.MIN_Z) / WM.H]);
      let su = 0, sv = 0;
      poly.forEach((uv) => { su += uv[0]; sv += uv[1]; });
      const cu = su / poly.length, cv = sv / poly.length;
      const x = WM.wx(cu), z = WM.wz(cv);
      const y = (window.Terrain && window.Terrain.heightAt) ? window.Terrain.heightAt(x, z) : 0;
      let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
      poly.forEach((uv) => {
        if (uv[0] < u0) u0 = uv[0]; if (uv[1] < v0) v0 = uv[1];
        if (uv[0] > u1) u1 = uv[0]; if (uv[1] > v1) v1 = uv[1];
      });
      let yaw = 0;
      if (kind === 'line' && pts.length >= 2) {
        yaw = Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z);
      } else {
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        yaw = Math.atan2(dir.x, dir.z);
      }
      this.pushHistory((kind === 'line' ? 'метка линия: ' : 'метка пятно: ') + name);
      const entry = WM.addBuildSite({
        name: name, kind: kind, type: type, note: note,
        x: x, y: y, z: z,
        yaw: yaw,
        np: [cu, cv], poly: poly, nb: [u0, v0, u1, v1]
      });
      this._markersDirty = true;
      this.init3DMarkers();
      this.selectObjectById('site:' + entry.id);
      this.saveToLocalStorage();
      this.saveToServer(true);
      this._siteBusy = false;
      if (this.game.addChatMessage) {
        this.game.addChatMessage(
          (kind === 'line' ? '[Метка] Линия «' : '[Метка] Пятно «') +
          name + '» · ' + pts.length + (kind === 'line' ? ' тчк.' : ' верш.'),
          'system'
        );
      }
    }

    _updateSiteDrawPreview(pts, cursor) {
      const list = (pts || []).slice();
      if (cursor) list.push(cursor);
      if (!list.length) return;
      this._clearHuntPreview();
      const closed = this.drawSiteKind === 'poly';
      const col = this.drawSiteKind === 'line' ? 0xffcc66 : 0x66ccff;
      const colBright = this.drawSiteKind === 'line' ? 0xffeeaa : 0xaaddff;
      const group = new THREE.Group();
      group.userData.kind = 'site-preview';
      list.forEach((p, i) => {
        const gh = window.Terrain ? window.Terrain.heightAt(p.x, p.z) : 0;
        const isCursor = !!(cursor && i === list.length - 1 && pts.length > 0);
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(isCursor ? 0.55 : 0.85, 8, 8),
          new THREE.MeshBasicMaterial({ color: isCursor ? colBright : col })
        );
        m.position.set(p.x, gh + 1.15, p.z);
        group.add(m);
      });
      if (list.length >= 2) {
        const pos = [];
        list.forEach((p) => {
          const gh = window.Terrain ? window.Terrain.heightAt(p.x, p.z) : 0;
          pos.push(p.x, gh + 0.85, p.z);
        });
        if (closed && pts.length >= 3) {
          const p0 = pts[0];
          const gh0 = window.Terrain ? window.Terrain.heightAt(p0.x, p0.z) : 0;
          pos.push(p0.x, gh0 + 0.85, p0.z);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col })));
      }
      if (closed && pts.length >= 3) {
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
        const fillGeo = this._makePolyShapeGeometry(pts, cx, cz);
        if (fillGeo) {
          const fill = new THREE.Mesh(
            fillGeo,
            new THREE.MeshBasicMaterial({
              color: col, transparent: true, opacity: 0.2,
              side: THREE.DoubleSide, depthWrite: false
            })
          );
          fill.rotation.x = -Math.PI / 2;
          const gh = window.Terrain ? window.Terrain.heightAt(cx, cz) : 0;
          fill.position.set(cx, gh + 0.3, cz);
          group.add(fill);
        }
      }
      this._huntPreviewMesh = group;
      this.scene.add(group);
    }

    // ============================================================
    //  ЗОНЫ ОХОТЫ — poly (многоугольник) / rect, меши, инспектор
    // ============================================================
    toggleDrawHuntMode(force, shape, kind) {
      if (!this._drawToolLock && this.drawSiteMode) {
        this._drawToolLock = true;
        this.toggleDrawSiteMode(false);
        this._drawToolLock = false;
      }
      if (this.drawBspMode) this.toggleDrawBspMode(false);
      if (kind === 'territory' || kind === 'hunt') this.drawHuntKind = kind;
      const next = (force !== undefined) ? !!force : !this.drawHuntMode;
      // if already drawing same shape+kind — toggle off; if different — switch and stay on
      if (force === undefined && this.drawHuntMode && shape && kind) {
        if (this.drawHuntShape === shape && this.drawHuntKind === kind) {
          this.drawHuntMode = false;
        } else {
          this.drawHuntMode = true;
          this.drawHuntShape = shape;
          this.drawHuntKind = kind;
        }
      } else {
        this.drawHuntMode = next;
        if (shape) this.drawHuntShape = shape;
      }
      this._huntDrawCornerA = null;
      this._huntPolyPts = [];
      this._clearHuntPreview();
      this._updateHuntDrawButtons();
      const hint = this.panel && this.panel.querySelector('#ed-hunt-draw-hint');
      if (hint) {
        hint.style.display = this.drawHuntMode ? 'block' : 'none';
        if (this.drawHuntMode) {
          const isTerr = this.drawHuntKind === 'territory';
          const label = isTerr ? 'Территория (синяя)' : 'Зона охоты';
          hint.style.background = isTerr ? 'rgba(40,80,160,0.3)' : 'rgba(170,40,60,0.2)';
          hint.style.borderColor = isTerr ? '#4488cc' : '#aa4466';
          hint.style.color = isTerr ? '#cceeff' : '#ffccdd';
          hint.innerHTML = this.drawHuntShape === 'poly'
            ? '<b>' + label + '</b> · клики = вершины · <b>Enter / ПКМ</b> = закрыть (≥3) · Esc = отмена'
            : '<b>' + label + '</b> · клик 1 = угол A · клик 2 = угол B · Esc = отмена';
        }
      }
      if (this.drawHuntMode) {
        this.deselectObject();
        if (this.game.addChatMessage) {
          const isTerr = this.drawHuntKind === 'territory';
          this.game.addChatMessage(
            isTerr
              ? (this.drawHuntShape === 'poly'
                ? '[Территория] Синий многоугольник: кликай вершины. Enter/ПКМ — закрыть.'
                : '[Территория] Синий прямоугольник: угол A, затем B.')
              : (this.drawHuntShape === 'poly'
                ? '[Охота] Многоуг. зона: кликай вершины. Enter/ПКМ — закрыть (≥3).'
                : '[Охота] Прямоуг. зона: угол A, затем угол B.'),
            'system'
          );
        }
      }
    }

    _updateHuntDrawButtons() {
      const on = this.drawHuntMode;
      const sh = this.drawHuntShape;
      const kind = this.drawHuntKind || 'hunt';
      const setBtn = (id, active, onBg, offBg, onText, offText, onCol, offCol) => {
        const b = this.panel && this.panel.querySelector(id);
        if (!b) return;
        b.style.background = active ? onBg : offBg;
        b.style.color = active ? onCol : offCol;
        b.textContent = active ? onText : offText;
      };
      setBtn('#ed-btn-draw-hunt', on && kind === 'hunt' && sh === 'poly',
        '#aa2244', '#441122', '✋ Отмена', '🎯 Многоуг.', '#fff', '#ff99aa');
      setBtn('#ed-btn-draw-hunt-rect', on && kind === 'hunt' && sh === 'rect',
        '#aa6622', '#332211', '✋ Отмена', '▭ Прямоуг.', '#fff', '#ffcc99');
      setBtn('#ed-btn-draw-terr', on && kind === 'territory' && sh === 'poly',
        '#2266cc', '#112244', '✋ Отмена', '🔷 Многоуг.', '#fff', '#99ccff');
      setBtn('#ed-btn-draw-terr-rect', on && kind === 'territory' && sh === 'rect',
        '#3388dd', '#113355', '✋ Отмена', '▭ Прямоуг.', '#fff', '#aaddff');
    }

    _clearHuntPreview() {
      if (this._huntPreviewMesh) {
        if (this._huntPreviewMesh.parent) this._huntPreviewMesh.parent.remove(this._huntPreviewMesh);
        this._huntPreviewMesh.traverse(c => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) {
            if (Array.isArray(c.material)) c.material.forEach(m => m.dispose && m.dispose());
            else if (c.material.dispose) c.material.dispose();
          }
        });
        this._huntPreviewMesh = null;
      }
    }

    /** Геометрия полигона в world XZ (центрованная в 0,0) → Shape в XY, затем rot X. */
    _makePolyShapeGeometry(worldPts, cx, cz) {
      if (!worldPts || worldPts.length < 3) return null;
      const shape = new THREE.Shape();
      shape.moveTo(worldPts[0].x - cx, -(worldPts[0].z - cz));
      for (let i = 1; i < worldPts.length; i++) {
        shape.lineTo(worldPts[i].x - cx, -(worldPts[i].z - cz));
      }
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    }

    _createHuntZoneMesh(hz) {
      if (!hz || !hz.bounds) return null;
      const isPoly = hz.shape === 'poly' && hz.polyWorld && hz.polyWorld.length >= 3;
      const w = Math.max(2, hz.w || Math.abs(hz.bounds[2] - hz.bounds[0]));
      const d = Math.max(2, hz.d || Math.abs(hz.bounds[3] - hz.bounds[1]));
      const cx = hz.x != null ? hz.x : (hz.bounds[0] + hz.bounds[2]) / 2;
      const cz = hz.z != null ? hz.z : (hz.bounds[1] + hz.bounds[3]) / 2;
      const gh = window.Terrain ? window.Terrain.heightAt(cx, cz) : 0;
      const col = (typeof hz.color === 'number') ? hz.color : 0xff6622;

      const group = new THREE.Group();
      group.name = 'HuntZone_' + hz.id;

      if (isPoly) {
        const pts = hz.polyWorld;
        const fillGeo = this._makePolyShapeGeometry(pts, cx, cz);
        if (fillGeo) {
          const fill = new THREE.Mesh(
            fillGeo,
            new THREE.MeshBasicMaterial({
              color: col, transparent: true, opacity: 0.35,
              side: THREE.DoubleSide, depthWrite: false, depthTest: false
            })
          );
          fill.rotation.x = -Math.PI / 2;
          fill.position.y = 0.5;
          group.add(fill);
        }
        // outline loop
        const positions = [];
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const y = (window.Terrain ? window.Terrain.heightAt(p.x, p.z) : gh) + 1.2 - gh;
          positions.push(p.x - cx, y, p.z - cz);
        }
        // close
        positions.push(pts[0].x - cx, (window.Terrain ? window.Terrain.heightAt(pts[0].x, pts[0].z) : gh) + 1.2 - gh, pts[0].z - cz);
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const line = new THREE.Line(
          lineGeo,
          new THREE.LineBasicMaterial({ color: col, linewidth: 3, depthTest: false })
        );
        group.add(line);
        // vertex poles — draggable in zones mode
        pts.forEach((p, vi) => {
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 0.8, 14, 8),
            new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0.95, depthTest: false })
          );
          const py = (window.Terrain ? window.Terrain.heightAt(p.x, p.z) : gh) - gh + 7.0;
          pole.position.set(p.x - cx, py, p.z - cz);
          const poleTop = new THREE.Mesh(
            new THREE.SphereGeometry(1.5, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffea33, depthTest: false })
          );
          poleTop.position.y = 7.0;
          pole.add(poleTop);

          pole.userData.vertIndex = vi;
          pole.userData.huntId = hz.id;
          pole.userData.isHuntVertex = true;
          pole.userData.isEditorMarker = true;
          pole.userData.markerType = 'hunt';
          group.add(pole);
        });
      } else {
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(w, d),
          new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: 0.35,
            side: THREE.DoubleSide, depthWrite: false, depthTest: false
          })
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = 0.5;
        const wire = new THREE.Mesh(
          new THREE.BoxGeometry(w, 1.2, d),
          new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.85, depthTest: false })
        );
        wire.position.y = 0.8;
        group.add(plane);
        group.add(wire);
        // 4 corner handles for rect edit
        const corners = [
          { x: -w / 2, z: -d / 2, i: 0 },
          { x: w / 2, z: -d / 2, i: 1 },
          { x: w / 2, z: d / 2, i: 2 },
          { x: -w / 2, z: d / 2, i: 3 }
        ];
        corners.forEach(c => {
          const pole = new THREE.Mesh(
            new THREE.SphereGeometry(1.6, 10, 10),
            new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0.95, depthTest: false })
          );
          pole.position.set(c.x, 1.5, c.z);
          pole.userData.cornerIndex = c.i;
          pole.userData.huntId = hz.id;
          pole.userData.isHuntCorner = true;
          pole.userData.isEditorMarker = true;
          pole.userData.markerType = 'hunt';
          group.add(pole);
        });
      }

      const isTerr = hz.kind === 'territory';
      const l0 = (hz.lvl && hz.lvl[0] != null) ? hz.lvl[0] : 1;
      const l1 = (hz.lvl && hz.lvl[1] != null) ? hz.lvl[1] : 10;
      const labelName = (hz.name || (isTerr ? 'Территория' : 'Зона')) + (isPoly ? ' ▢' + hz.polyWorld.length : '');
      const label = this._makeHuntLabelSprite(labelName, l0, l1, col, isTerr);
      label.position.y = 18.0;
      group.add(label);

      group.position.set(cx, gh, cz);
      group.userData = {
        isEditorMarker: true,
        markerType: 'hunt',
        huntId: hz.id,
        huntData: hz,
        baseW: w,
        baseD: d,
        shape: isPoly ? 'poly' : 'rect'
      };
      group.traverse(c => {
        if (c.isMesh || c.isLine || c.isSprite) {
          c.userData.markerType = 'hunt';
          c.userData.huntId = hz.id;
          c.userData.isEditorMarker = true;
        }
      });
      return group;
    }

    _makeSpotLabelSprite(s) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 80;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 256, 80);
      const isBoss = !!s.boss;
      ctx.fillStyle = isBoss ? 'rgba(50, 10, 10, 0.88)' : 'rgba(25, 20, 10, 0.82)';
      ctx.strokeStyle = isBoss ? '#ff3333' : '#ffaa22';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(4, 4, 248, 72, 8);
      else ctx.rect(4, 4, 248, 72);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = isBoss ? '#ff9999' : '#ffe088';
      ctx.font = 'bold 22px Georgia';
      ctx.textAlign = 'center';
      const mobName = s.mob || ('Спот #' + (s.idx != null ? (s.idx + 1) : ''));
      ctx.fillText(String(mobName).slice(0, 18), 128, 34);
      ctx.fillStyle = isBoss ? '#ff5555' : '#ffaa44';
      ctx.font = 'bold 20px Courier New';
      const lvlStr = (s.lvl && s.lvl[0] != null) ? `ур. ${s.lvl[0]}–${s.lvl[1]} (x${s.n || 1})` : `x${s.n || 1}`;
      ctx.fillText(lvlStr, 128, 62);
      const tex = new THREE.CanvasTexture(c);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      spr.scale.set(12, 3.75, 1);
      spr.renderOrder = 999;
      spr.userData.markerType = 'spot';
      return spr;
    }

    _makeHuntLabelSprite(name, l0, l1, color, isTerritory) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 96;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 256, 96);
      if (isTerritory) {
        ctx.fillStyle = 'rgba(8,16,40,0.82)';
        ctx.strokeStyle = '#66aaff';
      } else {
        ctx.fillStyle = 'rgba(20,8,8,0.78)';
        ctx.strokeStyle = '#ff8866';
      }
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(4, 4, 248, 88, 8);
      else ctx.rect(4, 4, 248, 88);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = isTerritory ? '#cceeff' : '#ffddaa';
      ctx.font = 'bold 22px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(String(name).slice(0, 18), 128, 36);
      ctx.fillStyle = isTerritory ? '#66aaff' : '#ff6644';
      ctx.font = 'bold 24px Courier New';
      ctx.fillText(isTerritory ? 'территория' : ('ур. ' + l0 + '–' + l1), 128, 72);
      const tex = new THREE.CanvasTexture(c);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      spr.scale.set(14, 5.25, 1);
      spr.renderOrder = 999;
      spr.userData.markerType = 'hunt';
      return spr;
    }

    _refreshHuntZoneMesh(id) {
      const WM = window.WorldMetrics;
      if (!WM || !WM.buildHuntZones) return;
      const hz = WM.buildHuntZones().find(z => z.id === id);
      const old = this.markerMeshes.get('hunt_' + id);
      if (old && this.markersGroup) {
        this.markersGroup.remove(old);
        old.traverse(c => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) {
            if (c.material.map) c.material.map.dispose();
            c.material.dispose();
          }
        });
        this.markerMeshes.delete('hunt_' + id);
      }
      if (!hz) return;
      const mesh = this._createHuntZoneMesh(hz);
      if (mesh && this.markersGroup) {
        this.markersGroup.add(mesh);
        this.markerMeshes.set('hunt_' + id, mesh);
      }
      return mesh;
    }

    selectHuntZone(id) {
      const WM = window.WorldMetrics;
      if (!WM || !WM.buildHuntZones) return;
      const hz = WM.buildHuntZones().find(z => z.id === id);
      if (!hz) return;
      // switching zone exits edit mode of previous
      if (this.zoneEditMode && this._zoneEditId && this._zoneEditId !== id) {
        this.exitZoneEditMode(true);
      }
      let mesh = this.markerMeshes.get('hunt_' + id);
      if (!mesh) mesh = this._refreshHuntZoneMesh(id);
      const gh = window.Terrain ? window.Terrain.heightAt(hz.x, hz.z) : 0;
      const isTerr = hz.kind === 'territory';
      const dispName = isTerr
        ? (hz.name + ' [территория]')
        : (hz.name + ' (ур.' + hz.lvl[0] + '-' + hz.lvl[1] + ')');
      this.selectObject({
        type: 'hunt',
        id: hz.id,
        huntId: hz.id,
        name: dispName,
        targetData: hz,
        mesh: mesh,
        position: { x: hz.x, y: gh + 0.5, z: hz.z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        baseW: hz.w,
        baseD: hz.d
      });
      // keep gizmo hidden if still in edit mode for this zone
      if (this.zoneEditMode && this._zoneEditId === id) {
        if (this.gizmoGroup) this.gizmoGroup.visible = false;
        if (this.selectionBox) this.selectionBox.visible = false;
      }
    }

    applyHuntZoneFromInputs() {
      if (!this.selectedObject || this.selectedObject.type !== 'hunt') return;
      const WM = window.WorldMetrics;
      if (!WM || !WM.updateHuntZone) return;
      this.pushHistory('зона охоты: ' + this.selectedObject.id);

      const name = (this.panel.querySelector('#inp-hunt-name') || {}).value || 'Зона';
      let l0 = parseInt((this.panel.querySelector('#inp-hunt-lvl0') || {}).value, 10);
      let l1 = parseInt((this.panel.querySelector('#inp-hunt-lvl1') || {}).value, 10);
      if (isNaN(l0)) l0 = 1;
      if (isNaN(l1)) l1 = l0;
      if (l1 < l0) { const t = l0; l0 = l1; l1 = t; }
      const cx = parseFloat((this.panel.querySelector('#inp-pos-x') || {}).value);
      const cz = parseFloat((this.panel.querySelector('#inp-pos-z') || {}).value);
      const x = isNaN(cx) ? this.selectedObject.position.x : cx;
      const z = isNaN(cz) ? this.selectedObject.position.z : cz;
      const hz = this.selectedObject.targetData || {};
      const isPoly = hz.shape === 'poly' && hz.poly && hz.poly.length >= 3;

      if (isPoly) {
        // сдвиг полигона: delta UV от старого центра к новому
        const oldU = (this.selectedObject.position.x - WM.MIN_X) / WM.W;
        const oldV = (this.selectedObject.position.z - WM.MIN_Z) / WM.H;
        const newU = (x - WM.MIN_X) / WM.W;
        const newV = (z - WM.MIN_Z) / WM.H;
        WM.updateHuntZone(this.selectedObject.id, {
          name: name,
          lvl: [l0, l1],
          shiftUV: [newU - oldU, newV - oldV]
        });
      } else {
        let ww = parseFloat((this.panel.querySelector('#inp-hunt-w') || {}).value);
        let dd = parseFloat((this.panel.querySelector('#inp-hunt-d') || {}).value);
        if (isNaN(ww) || ww < 2) ww = 10;
        if (isNaN(dd) || dd < 2) dd = 10;
        const u0 = (x - ww / 2 - WM.MIN_X) / WM.W;
        const v0 = (z - dd / 2 - WM.MIN_Z) / WM.H;
        const u1 = (x + ww / 2 - WM.MIN_X) / WM.W;
        const v1 = (z + dd / 2 - WM.MIN_Z) / WM.H;
        WM.updateHuntZone(this.selectedObject.id, {
          name: name,
          lvl: [l0, l1],
          nb: [u0, v0, u1, v1]
        });
      }

      if (window.MAP_HUNT_ZONES !== undefined && WM.buildHuntZones) {
        window.MAP_HUNT_ZONES = WM.buildHuntZones();
      }
      this._refreshHuntZoneMesh(this.selectedObject.id);
      this.selectHuntZone(this.selectedObject.id);
      this.saveToLocalStorage();
      if (this.game.addChatMessage) {
        this.game.addChatMessage('[Редактор] Зона «' + name + '» ур.' + l0 + '-' + l1, 'system');
      }
    }

    _updateMouseCoords(clientX, clientY) {
      const canvas = (this.game && this.game.renderer && this.game.renderer.domElement) || document.querySelector('canvas');
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const rw = rect.width || window.innerWidth || 1;
        const rh = rect.height || window.innerHeight || 1;
        this.mouse.x = ((clientX - rect.left) / rw) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rh) * 2 + 1;
      } else {
        this.mouse.x = (clientX / (window.innerWidth || 1)) * 2 - 1;
        this.mouse.y = -(clientY / (window.innerHeight || 1)) * 2 + 1;
      }
    }

    /** Ray → точка на земле (terrain / y=0 plane) */
    _raycastGround(clientX, clientY) {
      this.camera.updateMatrixWorld();
      this._updateMouseCoords(clientX, clientY);
      this.raycaster.setFromCamera(this.mouse, this.camera);

      if (window.Terrain && window.Terrain.mesh) {
        const hits = this.raycaster.intersectObject(window.Terrain.mesh, true);
        if (hits && hits.length) {
          for (let i = 0; i < hits.length; i++) {
            const h = hits[i];
            const ny = h.face && h.face.normal ? h.face.normal.y : 1;
            if (ny > 0.08) {
              return {
                x: h.point.x, y: h.point.y, z: h.point.z,
                u: h.uv ? h.uv.x : null,
                v: h.uv ? h.uv.y : null
              };
            }
          }
          const h0 = hits[0];
          return {
            x: h0.point.x, y: h0.point.y, z: h0.point.z,
            u: h0.uv ? h0.uv.x : null,
            v: h0.uv ? h0.uv.y : null
          };
        }
      }
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const pt = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(plane, pt)) return { x: pt.x, y: 0, z: pt.z, u: null, v: null };
      return null;
    }

    _drawZonePreviewColor() {
      if (this.drawSiteMode) return 0x66ccff;
      // territory = blue, hunt = orange/red
      return this.drawHuntKind === 'territory' ? 0x4488ff : 0xff4466;
    }

    _updateHuntPreviewRect(a, b) {
      if (!a || !b) return;
      const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
      const minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z);
      const w = Math.max(1, maxX - minX);
      const d = Math.max(1, maxZ - minZ);
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      const gh = window.Terrain ? window.Terrain.heightAt(cx, cz) : 0;
      const col = this._drawZonePreviewColor();

      if (!this._huntPreviewMesh || this._huntPreviewMesh.userData.kind !== 'rect' ||
          this._huntPreviewMesh.userData.previewKind !== this.drawHuntKind) {
        this._clearHuntPreview();
        const geo = new THREE.BoxGeometry(1, 1.2, 1);
        const mat = new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.9 });
        this._huntPreviewMesh = new THREE.Mesh(geo, mat);
        this._huntPreviewMesh.userData.kind = 'rect';
        this._huntPreviewMesh.userData.previewKind = this.drawHuntKind;
        this.scene.add(this._huntPreviewMesh);
      } else if (this._huntPreviewMesh.material) {
        this._huntPreviewMesh.material.color.setHex(col);
      }
      this._huntPreviewMesh.position.set(cx, gh + 0.6, cz);
      this._huntPreviewMesh.scale.set(w, 1, d);
      this._huntPreviewMesh.visible = true;
    }

    /** Превью полигона: pts + optional cursor point */
    _updateHuntPreviewPoly(pts, cursor) {
      const list = pts.slice();
      if (cursor) list.push(cursor);
      if (list.length < 1) return;
      this._clearHuntPreview();
      const group = new THREE.Group();
      group.userData.kind = 'poly';
      group.userData.previewKind = this.drawHuntKind;
      const col = this._drawZonePreviewColor();
      const colBright = this.drawHuntKind === 'territory' ? 0x88ccff : 0xffaa44;

      list.forEach((p, i) => {
        const gh = window.Terrain ? window.Terrain.heightAt(p.x, p.z) : 0;
        const isCursor = cursor && i === list.length - 1 && pts.length > 0;
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(isCursor ? 0.6 : 0.9, 8, 8),
          new THREE.MeshBasicMaterial({ color: isCursor ? colBright : col })
        );
        m.position.set(p.x, gh + 1.2, p.z);
        group.add(m);
      });

      if (list.length >= 2) {
        const pos = [];
        list.forEach(p => {
          const gh = window.Terrain ? window.Terrain.heightAt(p.x, p.z) : 0;
          pos.push(p.x, gh + 0.9, p.z);
        });
        if (pts.length >= 3) {
          const p0 = pts[0];
          const gh0 = window.Terrain ? window.Terrain.heightAt(p0.x, p0.z) : 0;
          pos.push(p0.x, gh0 + 0.9, p0.z);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col })));
      }

      if (pts.length >= 3) {
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
        const fillGeo = this._makePolyShapeGeometry(pts, cx, cz);
        if (fillGeo) {
          const fill = new THREE.Mesh(
            fillGeo,
            new THREE.MeshBasicMaterial({
              color: col, transparent: true, opacity: 0.22,
              side: THREE.DoubleSide, depthWrite: false
            })
          );
          fill.rotation.x = -Math.PI / 2;
          const gh = window.Terrain ? window.Terrain.heightAt(cx, cz) : 0;
          fill.position.set(cx, gh + 0.3, cz);
          group.add(fill);
        }
      }

      this._huntPreviewMesh = group;
      this.scene.add(group);
    }

    _resetHuntDrawUI() {
      this.drawHuntMode = false;
      this._huntDrawCornerA = null;
      this._huntPolyPts = [];
      this._clearHuntPreview();
      this._updateHuntDrawButtons();
      const hint = this.panel && this.panel.querySelector('#ed-hunt-draw-hint');
      if (hint) hint.style.display = 'none';
    }

    async _promptHuntLevels(defaultName) {
      const GD = window.GameDialog;
      let name = defaultName || 'Зона охоты';
      let l0 = this._huntDefaultLvl[0];
      let l1 = this._huntDefaultLvl[1];
      if (GD && GD.prompt) {
        const n = await GD.prompt('Название зоны охоты:', name, { title: 'Зона охоты' });
        if (n == null) return null;
        name = n || name;
        const a = await GD.prompt('Уровень мин:', String(l0), { title: 'Зона охоты' });
        if (a == null) return null;
        const b = await GD.prompt('Уровень макс:', String(l1), { title: 'Зона охоты' });
        if (b == null) return null;
        l0 = parseInt(a, 10);
        l1 = parseInt(b, 10);
      }
      if (isNaN(l0)) l0 = 1;
      if (isNaN(l1)) l1 = Math.max(l0, 10);
      if (l1 < l0) { const t = l0; l0 = l1; l1 = t; }
      this._huntDefaultLvl = [l0, l1];
      return { name, l0, l1 };
    }

    async _promptTerritoryName(defaultName) {
      let name = defaultName || 'Территория';
      if (window.GameDialog && window.GameDialog.prompt) {
        const n = await window.GameDialog.prompt('Название территории:', name, { title: 'Территория' });
        if (n == null) return null;
        name = n || name;
      }
      return { name, l0: 0, l1: 0 };
    }

    async _finishHuntZoneDrawRect(a, b) {
      const kind = this.drawHuntKind || 'hunt';
      this._resetHuntDrawUI();
      const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
      const minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z);
      if (Math.abs(maxX - minX) < 3 || Math.abs(maxZ - minZ) < 3) {
        if (window.GameDialog && window.GameDialog.alert) {
          window.GameDialog.alert('Зона слишком маленькая (минимум ~3м).', { title: 'Редактор' });
        }
        return;
      }
      const isTerr = kind === 'territory';
      const meta = isTerr
        ? await this._promptTerritoryName('Территория')
        : await this._promptHuntLevels('Зона охоты');
      if (!meta) return;
      const WM = window.WorldMetrics;
      if (!WM || !WM.addHuntZone) return;
      this.pushHistory((isTerr ? 'территория: ' : 'зона охоты: ') + meta.name);
      const entry = WM.addHuntZone({
        name: meta.name,
        kind: isTerr ? 'territory' : 'hunt',
        shape: 'rect',
        nb: [
          (minX - WM.MIN_X) / WM.W, (minZ - WM.MIN_Z) / WM.H,
          (maxX - WM.MIN_X) / WM.W, (maxZ - WM.MIN_Z) / WM.H
        ],
        lvl: [meta.l0, meta.l1],
        color: isTerr ? 0x4488ff : 0xff6622,
        mapColor: isTerr ? '#4488ff' : '#ff6622',
        peace: isTerr
      });
      this._commitHuntZoneCreated(entry, meta.name, meta.l0, meta.l1, null, kind);
    }

    async _finishHuntZoneDrawPoly() {
      const kind = this.drawHuntKind || 'hunt';
      const pts = this._huntPolyPts || [];
      if (pts.length < 3) {
        if (this.game.addChatMessage) {
          this.game.addChatMessage('[Редактор] Нужно ≥ 3 вершины. Сейчас: ' + pts.length, 'system');
        }
        return;
      }
      this._resetHuntDrawUI();
      const isTerr = kind === 'territory';
      const meta = isTerr
        ? await this._promptTerritoryName('Территория')
        : await this._promptHuntLevels('Зона охоты');
      if (!meta) return;
      const WM = window.WorldMetrics;
      if (!WM || !WM.addHuntZone) return;
      this.pushHistory((isTerr ? 'территория poly: ' : 'полигон охоты: ') + meta.name);
      const poly = pts.map(p => [
        (p.x - WM.MIN_X) / WM.W,
        (p.z - WM.MIN_Z) / WM.H
      ]);
      const entry = WM.addHuntZone({
        name: meta.name,
        kind: isTerr ? 'territory' : 'hunt',
        shape: 'poly',
        poly: poly,
        lvl: [meta.l0, meta.l1],
        color: isTerr ? 0x4488ff : 0xff6622,
        mapColor: isTerr ? '#4488ff' : '#ff6622',
        peace: isTerr
      });
      this._commitHuntZoneCreated(entry, meta.name, meta.l0, meta.l1, pts.length, kind);
    }

    _commitHuntZoneCreated(entry, name, l0, l1, verts, kind) {
      if (window.MAP_HUNT_ZONES !== undefined && window.WorldMetrics && window.WorldMetrics.buildHuntZones) {
        window.MAP_HUNT_ZONES = window.WorldMetrics.buildHuntZones();
      }
      this._markersDirty = true;
      this.init3DMarkers();
      this.setFilterCategory('hunt');
      if (entry) this.selectHuntZone(entry.id);
      this.saveToLocalStorage();
      if (this.game.addChatMessage) {
        const extra = verts ? (', ' + verts + ' верш.') : '';
        if (kind === 'territory') {
          this.game.addChatMessage('[Редактор] 🔷 Территория «' + name + '»' + extra + ' создана', 'system');
        } else {
          this.game.addChatMessage('[Редактор] Зона «' + name + '» ур.' + l0 + '–' + l1 + extra + ' создана', 'system');
        }
      }
    }

    // legacy name used by rect path
    _finishHuntZoneDraw(a, b) {
      this._finishHuntZoneDrawRect(a, b);
    }

    _updateHuntPreview(a, b) {
      this._updateHuntPreviewRect(a, b);
    }

    duplicateSelected() {
      if (this.selectedObject && this.selectedObject.type === 'bsp') {
        this.duplicateBspBrush();
        return;
      }
      if (!this.selectedObject || this.selectedObject.type !== 'prop') {
        if (window.GameDialog && window.GameDialog.alert) {
          window.GameDialog.alert(
            'Дублирование доступно для BSP-брашей и кастомных 3D-моделей / пропов.',
            { title: 'Редактор' }
          );
        }
        return;
      }

      this.pushHistory('дублирование: ' + (this.selectedObject.name || ''));

      const orig = this.selectedObject.targetData || {};
      const mesh = this.selectedObject.mesh;
      const meshUserData = (mesh && mesh.userData) || {};
      const WM = window.WorldMetrics;
      const isBarrier = (orig.meshType === 'collision_box' || meshUserData.isCollisionBarrier || String(this.selectedObject.id).startsWith('barrier_'));
      const id = isBarrier ? ('barrier_' + Date.now() + '_' + Math.floor(Math.random() * 999)) : ('prop_' + (orig.modelId || meshUserData.modelId || 'prop') + '_' + Date.now());

      const origPos = this.selectedObject.position || orig.position || { x: 0, y: 0, z: 0 };
      const origRot = this.selectedObject.rotation || orig.rotation || { x: 0, y: 0, z: 0 };
      const origScale = this.selectedObject.scale || orig.scale || { x: 1, y: 1, z: 1 };

      const colW = (orig.collisionSize && orig.collisionSize.x) || 4;
      const colD = (orig.collisionSize && orig.collisionSize.z) || 1;
      const offsetDist = isBarrier ? Math.max(1, colW * (origScale.x || 1)) : 3;

      // Сдвиг по направлению ориентации объекта для идеальной стыковки в ряд
      const yaw = origRot.y || 0;
      const nx = origPos.x + Math.cos(yaw) * offsetDist;
      const nz = origPos.z - Math.sin(yaw) * offsetDist;
      const ny = (this.terrainSnap && window.Terrain) ? window.Terrain.heightAt(nx, nz) : (origPos.y || 0);

      const dupData = {
        id: id,
        name: (orig.name || meshUserData.editorLabel || (isBarrier ? '🛡️ Блок' : '3D Модель')) + ' (копия)',
        type: 'prop',
        meshType: orig.meshType || meshUserData.meshType || (isBarrier ? 'collision_box' : 'fbx'),
        modelId: orig.modelId || meshUserData.modelId || undefined,
        modelFile: orig.modelFile || meshUserData.modelFile || undefined,
        position: { x: nx, y: ny, z: nz },
        rotation: { x: origRot.x || 0, y: origRot.y || 0, z: origRot.z || 0 },
        scale: { x: origScale.x || 1, y: origScale.y || 1, z: origScale.z || 1 },
        collision: orig.collision !== undefined ? orig.collision : true,
        hasCollision: orig.hasCollision !== undefined ? orig.hasCollision : true,
        collisionShape: orig.collisionShape || 'box',
        collisionSize: orig.collisionSize ? Object.assign({}, orig.collisionSize) : (isBarrier ? { x: colW, y: (orig.collisionSize && orig.collisionSize.y) || 3, z: colD } : undefined),
        collisionOffset: orig.collisionOffset ? Object.assign({}, orig.collisionOffset) : undefined,
        rawSize: orig.rawSize ? Object.assign({}, orig.rawSize) : undefined
      };

      if (WM && WM.CUSTOM_PROPS) WM.CUSTOM_PROPS.push(dupData);
      this.spawnCustomPropMesh(dupData);
      this.populateObjectDropdown('prop');
      this.selectObjectById('prop:' + id);
      this.refreshCollisionBarriersList();
      this.saveToLocalStorage();
      this.saveToServer(true);

      if (this.game && this.game.addChatMessage) {
        this.game.addChatMessage('[Редактор] 📋 Дублирован объект: ' + dupData.name, 'system');
      }
    }

    duplicateBspBrush() {
      const BB = window.BspBrushes;
      if (!BB || !this.selectedObject || this.selectedObject.type !== 'bsp') return;
      const orig = BB.findBrush(this.selectedObject.id) || this.selectedObject.targetData;
      if (!orig) return;
      this.pushHistory('дублирование BSP: ' + (orig.name || orig.id));
      const dup = BB.cloneBrush(orig);
      dup.id = 'bsp_' + Date.now() + '_' + Math.floor(Math.random() * 999);
      dup.name = (orig.name || 'BSP') + ' (копия)';
      dup.position = {
        x: (orig.position.x || 0) + Math.max(2, (orig.size && orig.size.x) || 2),
        y: orig.position.y || 0,
        z: (orig.position.z || 0) + 1
      };
      BB.upsertBrush(dup);
      BB.rebuildOne(dup.id);
      this.populateObjectDropdown('bsp');
      this.refreshBspStackList();
      this.selectBspBrush(dup.id);
      this.saveToLocalStorage();
      this._refreshBspBuildStatus();
    }

    /**
     * Нельзя удалять ТОЛЬКО terrain и water.
     * Горы, стены, вулкан, пропы, NPC — можно.
     */
    _isProtectedFromDelete(o) {
      if (!o) return true;
      if (o.type === 'player' || o.type === 'light') return true;
      const WM = window.WorldMetrics;
      const key = this._resolveWorldKey(o);
      if (key && WM && WM.isProtectedWorldKey && WM.isProtectedWorldKey(key)) return true;
      if (key === 'terrain_ground' || key === 'water') return true;
      // fallback по строкам
      const s = String((o.editorKey || o.id || (o.targetData && (o.targetData.editorKey || o.targetData.id)) || '')).toLowerCase();
      if (s === 'terrain_ground' || s.indexOf('terrain') === 0) return true;
      if (s === 'water' || s === 'named_waterroot' || (s.indexOf('water') >= 0 && s.indexOf('wall') < 0)) return true;
      return false;
    }

    /** mountains | volcano | walls | terrain_ground | water | null */
    _resolveWorldKey(o) {
      const WM = window.WorldMetrics;
      const raw = [
        o.editorKey,
        o.id,
        o.targetData && o.targetData.editorKey,
        o.targetData && o.targetData.id,
        o.mesh && o.mesh.userData && o.mesh.userData.editorKey,
        o.mesh && o.mesh.name,
        o.name
      ].filter(Boolean).join(' ');
      if (WM && WM.normalizeWorldKey) return WM.normalizeWorldKey(raw) || null;
      const s = String(raw).toLowerCase();
      if (s.indexOf('mountain') >= 0) return 'mountains';
      if (s.indexOf('volcano') >= 0) return 'volcano';
      if (s.indexOf('wall') >= 0 || s.indexOf('iwals') >= 0) return 'walls';
      if (s.indexOf('terrain') >= 0) return 'terrain_ground';
      if (s.indexOf('water') >= 0) return 'water';
      return null;
    }

    /** Снять меш/группу со сцены (в т.ч. world root) */
    _removeMeshFromScene(mesh, worldKey, o) {
      let root = mesh;
      if (worldKey === 'mountains' && window.Mountains && window.Mountains.root) root = window.Mountains.root;
      else if (worldKey === 'volcano' && window.Volcano && window.Volcano.mesh) root = window.Volcano.mesh;
      else if (worldKey === 'walls' && window.Walls && window.Walls.root) root = window.Walls.root;
      else if (mesh && mesh.userData && mesh.userData.editorKey) {
        // подняться к именованному root если кликнули child
        let p = mesh;
        while (p.parent && p.parent !== this.scene && p.parent.type !== 'Scene') {
          if (p.name && /root|mountains|volcano|walls|water/i.test(p.name)) { root = p; break; }
          p = p.parent;
        }
      }
      if (root && root.parent) root.parent.remove(root);
      if (root && o && (o.id || o.editorKey)) {
        if (!this._removedSceneMeshes) this._removedSceneMeshes = new Map();
        this._removedSceneMeshes.set(o.id || o.editorKey, root);
      }
      return root;
    }

    _updateDeleteButton() {
      const btn = this.panel && this.panel.querySelector('#ed-btn-delete');
      if (!btn) return;
      const o = this.selectedObject;
      if (!o) {
        btn.disabled = true;
        btn.textContent = '🗑️ Удалить';
        btn.style.opacity = '0.5';
        return;
      }
      if (this._isProtectedFromDelete(o)) {
        btn.disabled = true;
        btn.textContent = '🔒 Terrain / Water (нельзя)';
        btn.style.opacity = '0.55';
        return;
      }
      btn.disabled = false;
      btn.textContent = '🗑️ Удалить';
      btn.style.opacity = '1';
    }

    async deleteSelected() {
      if (!this.selectedObject) return;
      const o = this.selectedObject;
      const WM = window.WorldMetrics;

      if (this._isProtectedFromDelete(o)) {
        if (window.GameDialog && window.GameDialog.alert) {
          window.GameDialog.alert(
            'Нельзя удалить: terrain, water, игрок и свет.\nОстальные модели — можно.',
            { title: 'Удаление' }
          );
        }
        return;
      }
      let confirmed = true;
      if (window.GameDialog && window.GameDialog.confirm) {
        confirmed = await window.GameDialog.confirm(
          'Удалить «' + o.name + '»?\nСохранится на диск — после F5 не вернётся.\n(Ctrl+Z — отмена)',
          { title: 'Удаление', okLabel: 'Удалить', cancelLabel: 'Отмена', danger: true }
        );
      }
      if (!confirmed) return;

      this.pushHistory('удаление: ' + (o.name || o.id || ''));

      let ok = false;
      const worldKey = this._resolveWorldKey(o);

      // --- BSP brush ---
      if (o.type === 'bsp') {
        if (window.BspBrushes) {
          window.BspBrushes.removeBrush(o.id);
          // shell already removed; trigger CSG rebuild
          if (window.BspBrushes.isAutoBuild()) window.BspBrushes.scheduleBuild(50);
          else window.BspBrushes.buildGeometry();
        }
        try { this.refreshBspStackList(); } catch (e) {}
        ok = true;
      } else if (o.type === 'prop' || o.type === 'direct_mesh') {
        if (WM) {
          // мир-модуль (горы/стены/вулкан)
          if (worldKey && !WM.isProtectedWorldKey(worldKey)) {
            WM.markWorldObjectDeleted(worldKey);
          }
          // id / finger / editorKey — чтобы не восстановить
          if (o.id) WM.markMeshDeleted(o.id);
          if (o.editorKey) WM.markMeshDeleted(o.editorKey);
          if (o.finger) WM.markMeshDeleted(o.finger);
          if (o.targetData) {
            if (o.targetData.id) WM.markMeshDeleted(o.targetData.id);
            if (o.targetData.editorKey) WM.markMeshDeleted(o.targetData.editorKey);
            if (o.targetData.finger) WM.markMeshDeleted(o.targetData.finger);
          }
          // убрать из customProps
          const dropIds = new Set([o.id, o.editorKey, o.targetData && o.targetData.id, o.targetData && o.targetData.editorKey].filter(Boolean).map(String));
          WM.CUSTOM_PROPS = WM.CUSTOM_PROPS.filter(p => {
            if (!p) return false;
            if (dropIds.has(String(p.id)) || dropIds.has(String(p.editorKey))) return false;
            const pk = WM.normalizeWorldKey(p.editorKey || p.id || '');
            if (worldKey && pk === worldKey) return false;
            return true;
          });
        }
        const mesh = o.mesh || (this.customPropMeshes && this.customPropMeshes.get(o.id));
        this._removeMeshFromScene(mesh, worldKey, o);
        if (this.customPropMeshes && o.id) this.customPropMeshes.delete(o.id);
        // dispose world modules
        if (worldKey === 'mountains' && window.Mountains && window.Mountains.dispose) try { window.Mountains.dispose(); } catch (e) {}
        if (worldKey === 'volcano' && window.Volcano && window.Volcano.dispose) try { window.Volcano.dispose(); } catch (e) {}
        if (worldKey === 'walls' && window.Walls && window.Walls.dispose) try { window.Walls.dispose(); } catch (e) {}
        ok = true;
      } else if (o.type === 'npc' && WM) {
        if (WM.markNpcDeleted) WM.markNpcDeleted(o.id);
        if (this.game && this.game.npcManager) {
          const npcObj = this.game.npcManager.getNPCById(o.id);
          if (npcObj) {
            if (npcObj.destroy) npcObj.destroy();
            else if (npcObj.mesh && npcObj.mesh.parent) npcObj.mesh.parent.remove(npcObj.mesh);
            const list = this.game.npcManager.npcs;
            const i = list.indexOf(npcObj);
            if (i >= 0) list.splice(i, 1);
          }
        }
        const marker = this.markerMeshes.get('npc_' + o.id);
        if (marker && this.markersGroup) {
          this.markersGroup.remove(marker);
          this.markerMeshes.delete('npc_' + o.id);
        }
        ok = true;
      } else if (o.type === 'spot' && WM && typeof o.spotIdx === 'number') {
        if (WM.markMobSpotDeleted) WM.markMobSpotDeleted(o.spotIdx);
        const marker = this.markerMeshes.get('spot_' + o.spotIdx);
        if (marker && this.markersGroup) {
          this.markersGroup.remove(marker);
          this.markerMeshes.delete('spot_' + o.spotIdx);
        }
        ok = true;
      } else if (o.type === 'hunt' && WM && o.id) {
        if (WM.markHuntZoneDeleted) WM.markHuntZoneDeleted(o.id);
        const marker = this.markerMeshes.get('hunt_' + o.id);
        if (marker && this.markersGroup) {
          this.markersGroup.remove(marker);
          this.markerMeshes.delete('hunt_' + o.id);
        }
        if (window.MAP_HUNT_ZONES !== undefined && WM.buildHuntZones) {
          window.MAP_HUNT_ZONES = WM.buildHuntZones();
        }
        ok = true;
      } else if (o.type === 'site' && WM && o.id) {
        if (WM.markBuildSiteDeleted) WM.markBuildSiteDeleted(o.id);
        const marker = this.markerMeshes.get('site_' + o.id);
        if (marker && this.markersGroup) {
          this.markersGroup.remove(marker);
          this.markerMeshes.delete('site_' + o.id);
        }
        this._selectedSiteId = null;
        this.refreshSitesList();
        const edit = this.panel && this.panel.querySelector('#ed-site-edit');
        if (edit) edit.style.display = 'none';
        ok = true;
      } else if (o.type === 'mob') {
        if (o.mesh && this.game && this.game.spawnManager && this.game.spawnManager.enemies) {
          const enemies = this.game.spawnManager.enemies;
          const e = enemies.find(x => x.mesh === o.mesh);
          if (e) {
            if (e.destroy) e.destroy();
            else if (e.mesh && e.mesh.parent) e.mesh.parent.remove(e.mesh);
            const i = enemies.indexOf(e);
            if (i >= 0) enemies.splice(i, 1);
          }
        }
        ok = true;
      } else if (o.type === 'ground' && WM && o.id) {
        if (WM.markGroundMarkDeleted) WM.markGroundMarkDeleted(o.id);
        if (window.VillageGround && window.VillageGround.rebuild) {
          window.VillageGround.rebuild(this.scene);
        }
        try { this.refreshGroundList(); } catch (e) {}
        this.deselectObject();
        ok = true;
      } else if (o.type === 'bridge' || (o.mesh && o.mesh.userData && o.mesh.userData.markerType === 'bridge')) {
        // маркеры мостов — только из редактора
        const id = o.id || (o.mesh && o.mesh.userData && o.mesh.userData.id);
        if (id && WM && WM.markMeshDeleted) WM.markMeshDeleted('bridge_' + id);
        if (o.mesh && o.mesh.parent) o.mesh.parent.remove(o.mesh);
        ok = true;
      }

      if (!ok) {
        // fallback: любой mesh на сцене
        if (o.mesh) {
          if (WM) {
            if (o.id) WM.markMeshDeleted(o.id);
            if (o.editorKey) WM.markMeshDeleted(o.editorKey);
          }
          this._removeMeshFromScene(o.mesh, worldKey, o);
          ok = true;
        }
      }

      if (!ok) {
        if (window.GameDialog && window.GameDialog.alert) {
          window.GameDialog.alert('Не удалось удалить: ' + o.type, { title: 'Удаление' });
        }
        return;
      }

      this.deselectObject();
      this.populateObjectDropdown('all');
      this.saveToLocalStorage();
      this.saveToServer(true);
      if (this.game && this.game.addChatMessage) {
        this.game.addChatMessage('[Редактор] Удалено: ' + o.name + (worldKey ? ' [' + worldKey + ']' : ''), 'system');
      }
    }

    // ============================================================
    //  СОБЫТИЯ И УНИВЕРСАЛЬНЫЙ РЕЙКАСТИНГ АБСОЛЮТНО ВСЕХ 3D МОДЕЛЕЙ И ПЕРСОНАЖЕЙ
    // ============================================================
    setupEvents() {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
          // Не-dev: не перехватываем клавишу вообще (браузерный F2 остаётся живым)
          if (!editorAllowed && !this.enabled) return;
          this.toggle();
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // ========================================================
        // 1. ГЛОБАЛЬНЫЙ UNDO / REDO (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
        // Срабатывает ВСЕГДА в режиме редактора
        // ========================================================
        if (this.enabled && (e.ctrlKey || e.metaKey) && !e.altKey) {
          const k = e.key ? e.key.toLowerCase() : '';
          const code = e.code || '';
          const isZ = k === 'z' || k === 'я' || code === 'KeyZ';
          const isY = k === 'y' || k === 'н' || code === 'KeyY';

          if (isZ && e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
            this.redo();
            return;
          }
          if (isZ) {
            e.preventDefault();
            e.stopPropagation();
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
            this.undo();
            return;
          }
          if (isY) {
            e.preventDefault();
            e.stopPropagation();
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
            this.redo();
            return;
          }
        }

        if (!this.enabled) return;
        const ae = document.activeElement;
        const inEditorField = !!(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable));
        const gd = document.getElementById('ps-game-dialog-root');
        const dialogOpen = !!(gd && !gd.classList.contains('hidden'));
        if (inEditorField || dialogOpen) return;
        try {
          // Workspace hotkeys
          // Q — always exit to Select (move objects)
          if (e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й' || e.code === 'KeyQ') {
            if (!e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              this.setWorkspaceMode('select');
              return;
            }
          }
          // Tab — Blender-style zone Edit Mode (when hunt selected)
          if (e.key === 'Tab' || e.code === 'Tab') {
            if (this.selectedObject && this.selectedObject.type === 'hunt') {
              e.preventDefault();
              this.toggleZoneEditMode();
              return;
            }
            if (this.zoneEditMode) {
              e.preventDefault();
              this.exitZoneEditMode();
              return;
            }
          }
          // Zone edit hotkeys
          if (this.zoneEditMode) {
            if (e.key === 'Escape') {
              e.preventDefault();
              this.exitZoneEditMode();
              return;
            }
            if (e.key === 'a' || e.key === 'A' || e.key === 'ф' || e.key === 'Ф' || e.code === 'KeyA') {
              e.preventDefault();
              this._zoneEditClearSelection();
              return;
            }
            if (e.key === 'x' || e.key === 'X' || e.key === 'ч' || e.key === 'Ч' || e.key === 'Delete' || e.code === 'KeyX' || e.code === 'Delete') {
              e.preventDefault();
              this._zoneEditDeleteSelected();
              return;
            }
          }
          // Z — zones workspace (not when zone edit uses keys)
          if ((e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я' || e.code === 'KeyZ') && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            this.setWorkspaceMode('zones');
            return;
          }
          // M — метки геометрии
          if ((e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь' || e.code === 'KeyM') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.setWorkspaceMode('sites');
            return;
          }
          // G — земля (дороги/трава/площади)
          if ((e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П' || e.code === 'KeyG') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.setWorkspaceMode('ground');
            this.refreshGroundList();
            return;
          }
          // BSP hotkeys (UE-like Geometry Mode)
          if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B' || e.code === 'KeyB')) {
            e.preventDefault();
            this.buildBspGeometry(true);
            return;
          }
          if (e.key === 'b' || e.key === 'B' || e.key === 'и' || e.key === 'И' || e.code === 'KeyB') {
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              this.setWorkspaceMode('bsp');
              this.bspPlaceMode = 'drag';
              this.toggleDrawBspMode(true, this.drawBspShape || 'box');
              return;
            }
          }
          if (this.drawBspMode || (this.selectedObject && this.selectedObject.type === 'bsp')) {
            // End — toggle add/sub for next brush or selected
            if (e.key === 'End' || e.code === 'End') {
              e.preventDefault();
              if (this.selectedObject && this.selectedObject.type === 'bsp' && !this.drawBspMode) {
                this.toggleSelectedBspOp();
              } else {
                this.setDrawBspOp(this.drawBspOp === 'add' ? 'sub' : 'add');
              }
              return;
            }
            // [ ] — grid
            if (e.key === '[' || e.code === 'BracketLeft') {
              e.preventDefault();
              this._bspGrid = Math.max(0.25, (this._bspGrid || 0.5) / 2);
              if (this.game.addChatMessage) this.game.addChatMessage('[BSP] Grid ' + this._bspGrid + 'm', 'system');
              return;
            }
            if (e.key === ']' || e.code === 'BracketRight') {
              e.preventDefault();
              this._bspGrid = Math.min(8, (this._bspGrid || 0.5) * 2);
              if (this.game.addChatMessage) this.game.addChatMessage('[BSP] Grid ' + this._bspGrid + 'm', 'system');
              return;
            }
            // + / - size of selected
            if ((e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') && this.selectedObject && this.selectedObject.type === 'bsp') {
              e.preventDefault();
              this._nudgeBspSize(this._bspGrid || 0.5);
              return;
            }
            if ((e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract') && this.selectedObject && this.selectedObject.type === 'bsp') {
              e.preventDefault();
              this._nudgeBspSize(-(this._bspGrid || 0.5));
              return;
            }
            // PageUp / PageDown — reorder stack
            if ((e.key === 'PageUp' || e.code === 'PageUp') && this.selectedObject && this.selectedObject.type === 'bsp') {
              e.preventDefault();
              this.reorderSelectedBsp(-1);
              return;
            }
            if ((e.key === 'PageDown' || e.code === 'PageDown') && this.selectedObject && this.selectedObject.type === 'bsp') {
              e.preventDefault();
              this.reorderSelectedBsp(1);
              return;
            }
          }
          if (this.drawBspMode) {
            if (e.key === 'Escape') {
              this.toggleDrawBspMode(false);
              this.setWorkspaceMode('select');
              if (this.game.addChatMessage) this.game.addChatMessage('[BSP] Выход в Выбор (можно двигать объекты).', 'system');
              return;
            }
            if ((e.key === 'Enter' || e.code === 'Enter') && this._bspDrawPhase === 2) {
              e.preventDefault();
              const prev = this._bspPreviewMesh && this._bspPreviewMesh.userData._bspPrev;
              if (prev) this._finishBspBrushCreate(prev);
              return;
            }
          }
          if (this.drawHuntMode) {
            if (e.key === 'Escape') {
              this.toggleDrawHuntMode(false);
              if (this.game.addChatMessage) this.game.addChatMessage('[Редактор] Рисование зоны отменено.', 'system');
              return;
            }
            // Enter — закрыть полигон
            if ((e.key === 'Enter' || e.code === 'Enter') && this.drawHuntShape === 'poly') {
              e.preventDefault();
              this._finishHuntZoneDrawPoly();
              return;
            }
            // Backspace — undo last vertex
            if ((e.key === 'Backspace' || e.code === 'Backspace') && this.drawHuntShape === 'poly') {
              e.preventDefault();
              if (this._huntPolyPts.length) {
                this._huntPolyPts.pop();
                this._updateHuntPreviewPoly(this._huntPolyPts, null);
                if (this.game.addChatMessage) {
                  this.game.addChatMessage('[Редактор] Вершин: ' + this._huntPolyPts.length, 'system');
                }
              }
              return;
            }
          }
          if (this.drawGroundMode) {
            if (e.key === 'Escape') {
              this.toggleDrawGroundMode(false);
              if (this.game.addChatMessage) this.game.addChatMessage('[Земля] Отмена.', 'system');
              return;
            }
            if (e.key === 'Enter' || e.code === 'Enter') {
              e.preventDefault();
              this._finishGroundDraw();
              return;
            }
            if (e.key === 'Backspace' || e.code === 'Backspace') {
              e.preventDefault();
              if (this._groundPolyPts.length) {
                this._groundPolyPts.pop();
                this._updateSiteDrawPreview(this._groundPolyPts, null);
              }
              return;
            }
          }
          if (this.drawSiteMode) {
            if (e.key === 'Escape') {
              this.toggleDrawSiteMode(false);
              if (this.game.addChatMessage) this.game.addChatMessage('[Метка] Рисование отменено.', 'system');
              return;
            }
            if ((e.key === 'Enter' || e.code === 'Enter') && (this.drawSiteKind === 'poly' || this.drawSiteKind === 'line')) {
              e.preventDefault();
              this._finishSiteDrawPoly();
              return;
            }
            if ((e.key === 'Backspace' || e.code === 'Backspace') && (this.drawSiteKind === 'poly' || this.drawSiteKind === 'line')) {
              e.preventDefault();
              if (this._sitePolyPts.length) {
                this._sitePolyPts.pop();
                this._updateSiteDrawPreview(this._sitePolyPts, null);
                if (this.game.addChatMessage) {
                  this.game.addChatMessage('[Метка] Точек: ' + this._sitePolyPts.length, 'system');
                }
              }
              return;
            }
          }
          // Режимы трансформации гизмо как в UE5:
          // Когда ПКМ НЕ зажата: W/Ц = Перемещение, E/У = Вращение, R/К = Масштаб (также 1/2/3)
          // Когда ПКМ зажата: клавиши WASD/QE используются исключительно для полёта камеры!
          if (!this.drawBspMode && !this.drawHuntMode && !this.drawSiteMode && !this.drawGroundMode) {
            const rig = this.game && this.game.cameraRig;
            const isFlightActive = rig && rig.flyMode && (rig._rmbDown || (rig._buttons & 2) !== 0 || (rig._drag && (rig._buttons & 2) !== 0));
            if (!isFlightActive) {
              const k = (e.key || '').toLowerCase();
              if (k === 'w' || k === 'ц' || e.code === 'KeyW' || k === '1') this.setMode('translate');
              else if (k === 'e' || k === 'у' || e.code === 'KeyE' || k === '2') this.setMode('rotate');
              else if (k === 'r' || k === 'к' || e.code === 'KeyR' || k === '3') this.setMode('scale');
            }
          }
          // [ / ] — изменение радиуса кисти рисования (Terrain Paint & Foliage)
          if (e.code === 'BracketLeft' || e.key === '[' || e.key === 'х' || e.key === 'Х') {
            e.preventDefault();
            if (this.editorMode === 'foliage' || this.drawFoliageMode) {
              this.setFoliageBrushRadius(this.foliageBrushRadius - 2);
            } else {
              this.setPaintBrushRadius(this.paintBrushRadius - 2);
            }
            return;
          }
          if (e.code === 'BracketRight' || e.key === ']' || e.key === 'ъ' || e.key === 'Ъ') {
            e.preventDefault();
            if (this.editorMode === 'foliage' || this.drawFoliageMode) {
              this.setFoliageBrushRadius(this.foliageBrushRadius + 2);
            } else {
              this.setPaintBrushRadius(this.paintBrushRadius + 2);
            }
            return;
          }
          // T — переключение в режим кисти рисования (UE5 Paint)
          if ((e.key === 't' || e.key === 'T' || e.key === 'е' || e.key === 'Е') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.setWorkspaceMode(this.editorMode === 'paint' ? 'select' : 'paint');
            return;
          }
          // P — открыть библиотеку 3D-моделей
          if ((e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            this.showPropsLibraryModal();
            return;
          }
          // V — открыть / переключить Палитру Растительности (Foliage Studio)
          if ((e.key === 'v' || e.key === 'V' || e.key === 'м' || e.key === 'М' || e.code === 'KeyV') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (this.editorMode !== 'foliage') {
              this.setWorkspaceMode('foliage');
            } else {
              this.toggleFoliageStudioWindow();
            }
            return;
          }
          // Ctrl+D — дублировать выделенный объект
          if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В')) {
            e.preventDefault();
            this.duplicateSelected();
            return;
          }
          // Delete — удалить выделенный объект (если не в режиме правки вершин)
          if ((e.key === 'Delete' || e.code === 'Delete') && !this.zoneEditMode) {
            e.preventDefault();
            this.deleteSelected();
            return;
          }
          // End — посадить выбранную модель ровно на рельеф земли
          if ((e.key === 'End' || e.code === 'End') && !this.drawBspMode && this.selectedObject) {
            e.preventDefault();
            this.snapSelectedToGround();
            return;
          }
          // F — сфокусировать камеру на объекте
          if ((e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') && !e.ctrlKey && !e.metaKey && !e.altKey && this.selectedObject) {
            e.preventDefault();
            this.focusCameraOnSelected();
            return;
          }
          // Esc — отмена режима установки коллизионных блоков
          if (e.key === 'Escape' && this.placeCollisionBlockMode) {
            e.preventDefault();
            this.togglePlaceCollisionBlockMode(false);
            if (this.game && this.game.addChatMessage) this.game.addChatMessage('[Коллизии] Режим постройки блоков отменен.', 'system');
            return;
          }
          // Esc — отмена режима установки модели из библиотеки
          if (e.key === 'Escape' && this.placePropMode) {
            e.preventDefault();
            this.placePropMode = false;
            this._pendingPlaceProp = null;
            if (this.game && this.game.addChatMessage) this.game.addChatMessage('[Редактор] Режим установки моделей отменен.', 'system');
            return;
          }
          // Esc — выкл. мышь-режим хвата оружия
          if (e.key === 'Escape' && this._weaponMouseMode) {
            e.preventDefault();
            this._endWeaponMouseDrag();
            this._setWeaponMouseMode(null);
            return;
          }
          // Esc in select — deselect
          if (e.key === 'Escape' && this.editorMode === 'select' && this.selectedObject) {
            this.deselectObject();
            return;
          }
          // Ctrl+S — принудительное сохранение
          if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы')) {
            e.preventDefault();
            this.saveToServer(false);
          }
        } finally {
          if (!this._isEditorCameraKey(e)) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }, true);

      // Глобальный слушатель mousedown для 100% надёжности захвата кликов
      window.addEventListener('mousedown', (e) => {
        // Пропускаем клики по элементам UI / библиотекам / модальным окнам
        if (this._isEventOverUI(e)) {
          return;
        }
        this.onMouseDown(e);
      }, true);

      window.addEventListener('mousemove', (e) => {
        if (this.enabled && this.placeCollisionBlockMode && this._colGhostMesh) {
          if (this._isEventOverUI(e)) return;
          const pt = this._raycastGround(e.clientX, e.clientY);
          if (pt) this._updateCollisionGhost(pt);
          return;
        }
        if (this.enabled && (this.editorMode === 'foliage' || this.drawFoliageMode)) {
          if (this._isEventOverUI(e)) {
            if (this._foliageBrushProjector) this._foliageBrushProjector.visible = false;
            return;
          }
          const pt = this._raycastGround(e.clientX, e.clientY);
          if (pt) {
            const isErase = (e.buttons === 2 || (e.buttons & 2) !== 0) || e.shiftKey || !!this.foliageIsErase || !!this._foliageStrokeIsErase;
            this._updateFoliageBrushProjector(pt, isErase);
            if (this.foliageIsDrawing) {
              this._applyFoliageStrokeAt(pt.x, pt.z, isErase);
              var rig = (this.game && this.game.cameraRig) || window.cameraRig;
              if (rig) { rig._drag = false; rig._rmbDown = false; }
            }
          }
          return;
        }
        if (this.enabled && (this.editorMode === 'paint' || this.drawPaintMode)) {
          if (this._isEventOverUI(e)) {
            if (this._paintBrushProjector) this._paintBrushProjector.visible = false;
            return;
          }
          const pt = this._raycastGround(e.clientX, e.clientY);
          if (pt) {
            const isErase = (e.buttons === 2 || (e.buttons & 2) !== 0) || e.shiftKey || !!this.paintIsErase || !!this._paintStrokeIsErase;
            this._updatePaintBrushProjector(pt, isErase);
            if (this.paintIsDrawing) {
              this._applyPaintStrokeAt(pt.x, pt.z, pt.u, pt.v, isErase);
              var rig = (this.game && this.game.cameraRig) || window.cameraRig;
              if (rig) { rig._drag = false; rig._rmbDown = false; }
            }
          }
          return;
        }
        if (this.enabled && this.drawBspMode) {
          this._onBspDrawMove(e);
          return;
        }
        if (this.enabled && this.drawHuntMode) {
          if (this._isEventOverUI(e)) return;
          const pt = this._raycastGround(e.clientX, e.clientY);
          if (!pt) return;
          if (this.drawHuntShape === 'poly' && this._huntPolyPts.length) {
            this._updateHuntPreviewPoly(this._huntPolyPts, { x: pt.x, z: pt.z });
            return;
          }
          if (this.drawHuntShape === 'rect' && this._huntDrawCornerA) {
            this._updateHuntPreviewRect(this._huntDrawCornerA, { x: pt.x, z: pt.z });
            return;
          }
          return;
        }
        if (this.enabled && this.drawSiteMode && (this.drawSiteKind === 'poly' || this.drawSiteKind === 'line')) {
          if (this._isEventOverUI(e)) return;
          const pt = this._raycastGround(e.clientX, e.clientY);
          if (pt && this._sitePolyPts.length) {
            this._updateSiteDrawPreview(this._sitePolyPts, { x: pt.x, z: pt.z });
          }
          return;
        }
        if (this.enabled && this.drawGroundMode && this._groundPolyPts.length) {
          if (this._isEventOverUI(e)) return;
          const pt = this._raycastGround(e.clientX, e.clientY);
          if (pt) this._updateSiteDrawPreview(this._groundPolyPts, { x: pt.x, z: pt.z });
          return;
        }
        this.onMouseMove(e);
      });
      window.addEventListener('mouseup', (e) => {
        if (this.foliageIsDrawing) {
          this.foliageIsDrawing = false;
          this.foliageLastPos = null;
          this._foliageStrokeIsErase = false;
          if (this._currentFoliageStroke && (this._currentFoliageStroke.added.length > 0 || this._currentFoliageStroke.removed.length > 0)) {
            this.saveToLocalStorage();
            this.saveToServer(true);
          } else {
            // Nothing changed in this click: discard empty history snapshot
            if (this._undoStack.length > 0 && this._undoStack[this._undoStack.length - 1].label === 'растительность') {
              this._undoStack.pop();
              this._updateHistoryButtons();
            }
          }
          this._currentFoliageStroke = null;
          return;
        }
        if (this.paintIsDrawing) {
          this.paintIsDrawing = false;
          this.paintLastPos = null;
          this._paintStrokeIsErase = false;
          if (window.Terrain && window.Terrain.scheduleAutoSave) {
            window.Terrain.scheduleAutoSave();
          }
          return;
        }
        if (this.enabled && this.drawBspMode) {
          this._onBspDrawUp(e);
          return;
        }
        this.onMouseUp(e);
      });
      // ПКМ — при рисовании/стирании кистью и в режиме полигона не открывать context menu
      window.addEventListener('contextmenu', (e) => {
        if (this.enabled && (this.editorMode === 'foliage' || this.drawFoliageMode || this.editorMode === 'paint' || this.drawPaintMode || this.foliageIsDrawing || this.paintIsDrawing)) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        if (this.enabled && this.drawHuntMode && this.drawHuntShape === 'poly') {
          e.preventDefault();
          this._finishHuntZoneDrawPoly();
        }
        if (this.enabled && this.drawSiteMode && (this.drawSiteKind === 'poly' || this.drawSiteKind === 'line')) {
          e.preventDefault();
          this._finishSiteDrawPoly();
        }
        if (this.enabled && this.drawGroundMode) {
          e.preventDefault();
          this._finishGroundDraw();
        }
      });

      // Перед F5/закрытием — дописываем localStorage (даже если HTTP не успел)
      window.addEventListener('beforeunload', () => {
        try { this.saveToLocalStorage(); } catch (e) {}
        try { if (window.Terrain && window.Terrain.savePaintToServer) window.Terrain.savePaintToServer(); } catch (e) {}
      });
    }

    _isEventOverUI(e) {
      if (!e) return false;
      const target = e.target;
      if (!target) return false;

      // 1. Интерактивные теги форм и кнопок
      const tag = target.tagName;
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'OPTION' || tag === 'LABEL') {
        return true;
      }

      // 2. Все панели инспектора, плавающие окна палитр, библиотеки моделей, текстур, пропсов и диалоги
      if (target.closest(
        '#editor-inspector-panel, ' +
        '#editor-toggle-btn, ' +
        '#editor-top-bar, ' +
        '#editor-left-dock, ' +
        '#editor-right-dock, ' +
        '#editor-bottom-dock, ' +
        '#ed-foliage-window, ' +
        '#ed-foliage-win-header, ' +
        '#ps-tex-lib-modal, ' +
        '#props-library-modal, ' +
        '#props-history-modal, ' +
        '#props-import-modal, ' +
        '#custom-asset-modal, ' +
        '#l2-settings-panel, ' +
        '#l2cm-root, ' +
        '#party-list, ' +
        '#player-status, ' +
        '#target-status, ' +
        '#chat-container, ' +
        '#hotbar, ' +
        '#hud, ' +
        '.l2-dialog, ' +
        '.modal, ' +
        '.editor-panel, ' +
        '.editor-window, ' +
        '.editor-modal, ' +
        '.btn-fol-tab, ' +
        '.fol-item-card, ' +
        '[data-editor-ui], ' +
        '[data-no-paint]'
      )) {
        return true;
      }

      // 3. Любой HTML-элемент оверлея над 3D канвасом
      const canvas = (this.game && this.game.renderer && this.game.renderer.domElement) || document.querySelector('canvas');
      if (canvas && target !== canvas && target !== document.body && target !== document.documentElement) {
        return true;
      }

      return false;
    }

    onMouseDown(e) {
      if (!this.enabled) return;
      if (this._isEventOverUI(e)) return;

      // Режим рисования растительности (UE5 Foliage Paint)
      if (this.editorMode === 'foliage' || this.drawFoliageMode) {
        if (e.button === 0 || e.button === 2) {
          const pt = this._raycastGround(e.clientX, e.clientY);
          if (pt) {
            this.pushHistory('растительность');
            this.foliageIsDrawing = true;
            const isErase = (e.button === 2) || e.shiftKey || !!this.foliageIsErase;
            this._foliageStrokeIsErase = isErase;
            this.foliageLastPos = null;
            this._currentFoliageStroke = { added: [], removed: [] };
            this._applyFoliageStrokeAt(pt.x, pt.z, isErase);
            var rig = (this.game && this.game.cameraRig) || window.cameraRig;
            if (rig) { rig._drag = false; rig._rmbDown = false; }
            if (e.preventDefault) e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
          }
          return;
        }
      }

      // Режим рисования текстурами по террейну (UE5 Landscape Paint)
      if (this.editorMode === 'paint' || this.drawPaintMode) {
        if (e.button === 0 || e.button === 2) {
          const pt = this._raycastGround(e.clientX, e.clientY);
          if (pt) {
            this.pushHistory('террейн');
            if (window.Terrain && window.Terrain.pushUndoSnapshot) {
              window.Terrain.pushUndoSnapshot();
            }
            this.paintIsDrawing = true;
            const isErase = (e.button === 2) || e.shiftKey || !!this.paintIsErase;
            this._paintStrokeIsErase = isErase;
            this.paintLastPos = null;
            this._applyPaintStrokeAt(pt.x, pt.z, pt.u, pt.v, isErase);
            var rig = (this.game && this.game.cameraRig) || window.cameraRig;
            if (rig) { rig._drag = false; rig._rmbDown = false; }
            if (e.preventDefault) e.preventDefault();
            if (e.stopPropagation) e.stopPropagation();
          }
          return;
        }
      }

      if (e.button !== 0) return;

      // Режим клика для постройки коллизионных блоков
      if (this.placeCollisionBlockMode && this._pendingColSize) {
        const pt = this._raycastGround(e.clientX, e.clientY);
        if (pt) {
          const sz = this._pendingColSize;
          const gh = window.Terrain ? window.Terrain.heightAt(pt.x, pt.z) : pt.y;
          this.spawnCollisionBarrier(sz.x, sz.y, sz.z, { x: pt.x, y: gh, z: pt.z }, false);
          if (!e.shiftKey) {
            this.togglePlaceCollisionBlockMode(false);
          }
          return;
        }
      }

      // Режим клика по террейну для установки 3D-модели из библиотеки
      if (this.placePropMode && this._pendingPlaceProp) {
        const pt = this._raycastGround(e.clientX, e.clientY);
        if (pt) {
          const item = this._pendingPlaceProp;
          this.pushHistory('добавить модель: ' + (item.nameRu || item.file));
          const gh = window.Terrain ? window.Terrain.heightAt(pt.x, pt.z) : pt.y;
          const id = 'prop_' + item.id + '_' + Date.now();
          const propData = {
            id: id,
            name: item.nameRu || item.id,
            type: 'prop',
            meshType: 'fbx',
            modelId: item.id,
            modelFile: item.file,
            position: { x: pt.x, y: gh, z: pt.z },
            rotation: { x: 0, y: 0, z: 0 },
            scale: {
              x: item.defaultScale || 1,
              y: item.defaultScale || 1,
              z: item.defaultScale || 1
            }
          };

          const WM = window.WorldMetrics;
          if (WM && WM.CUSTOM_PROPS) WM.CUSTOM_PROPS.push(propData);
          this.spawnCustomPropMesh(propData);
          this.populateObjectDropdown('prop');
          this.selectObjectById('prop:' + id);
          this.saveToLocalStorage();
          this.saveToServer(true);

          if (this.game && this.game.addChatMessage) {
            this.game.addChatMessage('[Редактор] 🏠 Установлена 3D-модель: ' + (item.nameRu || item.file), 'system');
          }

          if (!e.shiftKey) {
            this.placePropMode = false;
            this._pendingPlaceProp = null;
          }
          return;
        }
      }

      // Хват оружия — сдвиг / поворот мышью (до BSP/зон/gizmo)
      if (this._weaponMouseMode && this._beginWeaponMouseDrag(e)) {
        return;
      }

      // Режим рисования BSP
      if (this.drawBspMode) {
        this._onBspDrawDown(e);
        return;
      }

      if (this.drawGroundMode) {
        const pt = this._raycastGround(e.clientX, e.clientY);
        if (!pt) return;
        if (this.drawGroundShape !== 'line' && this._groundPolyPts.length >= 3) {
          const p0 = this._groundPolyPts[0];
          if (Math.hypot(pt.x - p0.x, pt.z - p0.z) < 4) {
            this._finishGroundDraw();
            return;
          }
        }
        this._groundPolyPts.push({ x: pt.x, z: pt.z });
        this._updateSiteDrawPreview(this._groundPolyPts, null);
        if (this.game.addChatMessage) {
          this.game.addChatMessage('[Земля] Точка ' + this._groundPolyPts.length, 'system');
        }
        return;
      }

      // Режим рисования метки геометрии
      if (this.drawSiteMode) {
        if (this._siteBusy) return;
        const pt = this._raycastGround(e.clientX, e.clientY);
        if (!pt) return;
        if (this.drawSiteKind === 'pin') {
          this._placeSitePin(pt);
          return;
        }
        if (this.drawSiteKind === 'poly' && this._sitePolyPts.length >= 3) {
          const p0 = this._sitePolyPts[0];
          if (Math.hypot(pt.x - p0.x, pt.z - p0.z) < 4) {
            this._finishSiteDrawPoly();
            return;
          }
        }
        this._sitePolyPts.push({ x: pt.x, z: pt.z });
        this._updateSiteDrawPreview(this._sitePolyPts, null);
        if (this.game.addChatMessage) {
          const n = this._sitePolyPts.length;
          const ready = this.drawSiteKind === 'line' ? n >= 2 : n >= 3;
          this.game.addChatMessage(
            '[Метка] Точка ' + n + (ready ? ' · Enter/ПКМ — готово' : ''),
            'system'
          );
        }
        return;
      }

      // Режим рисования зоны охоты
      if (this.drawHuntMode) {
        const pt = this._raycastGround(e.clientX, e.clientY);
        if (!pt) return;
        if (this.drawHuntShape === 'poly') {
          // snap to first point to close if near
          if (this._huntPolyPts.length >= 3) {
            const p0 = this._huntPolyPts[0];
            if (Math.hypot(pt.x - p0.x, pt.z - p0.z) < 4) {
              this._finishHuntZoneDrawPoly();
              return;
            }
          }
          this._huntPolyPts.push({ x: pt.x, z: pt.z });
          this._updateHuntPreviewPoly(this._huntPolyPts, null);
          if (this.game.addChatMessage) {
            this.game.addChatMessage(
              '[Редактор] Вершина ' + this._huntPolyPts.length +
              (this._huntPolyPts.length >= 3 ? ' · Enter/ПКМ — закрыть' : ''),
              'system'
            );
          }
          return;
        }
        // rect
        if (!this._huntDrawCornerA) {
          this._huntDrawCornerA = { x: pt.x, z: pt.z };
          this._updateHuntPreviewRect(this._huntDrawCornerA, this._huntDrawCornerA);
          if (this.game.addChatMessage) this.game.addChatMessage('[Редактор] Угол A. Кликни угол B.', 'system');
        } else {
          this._finishHuntZoneDrawRect(this._huntDrawCornerA, { x: pt.x, z: pt.z });
        }
        return;
      }

      this.camera.updateMatrixWorld();
      this._updateMouseCoords(e.clientX, e.clientY);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      if (this.raycaster.params.Sprite) this.raycaster.params.Sprite.threshold = 8.0;

      // 0. Blender Edit Mode for zone verts
      if (this.zoneEditMode) {
        if (this._onZoneEditMouseDown(e)) return;
      }

      // 1. Клик по ручкам 3D-пивота (не во время Draw/Place BSP / zone edit)
      if (this.selectedObject && this.gizmoGroup.visible && !this.drawBspMode && !this.drawHuntMode && !this.drawSiteMode && !this.drawGroundMode && !this.zoneEditMode) {
        const activeGroup = (this.mode === 'scale') ? this.scaleGroup : ((this.mode === 'rotate') ? this.rotateGroup : this.translateGroup);
        const hits = this.raycaster.intersectObjects(activeGroup.children, true);
        if (hits.length > 0) {
          const handle = hits[0].object;
          this.activeHandle = handle.userData.axis;
          // один снимок на весь drag (не каждый кадр)
          if (!this._dragHistPushed) {
            this.pushHistory('перемещение/поворот/scale: ' + (this.selectedObject.name || this.selectedObject.id || ''));
            this._dragHistPushed = true;
          }
          const posObj = this.selectedObject.position || {};
          const rotObj = this.selectedObject.rotation || {};
          const scaleObj = this.selectedObject.scale || {};

          this.dragStartPos.set(
            typeof posObj.x === 'number' ? posObj.x : 0,
            typeof posObj.y === 'number' ? posObj.y : 0,
            typeof posObj.z === 'number' ? posObj.z : 0
          );
          this.dragStartMouse.set(e.clientX, e.clientY);
          this.dragStartRot.set(
            typeof rotObj.x === 'number' ? rotObj.x : (rotObj._x || 0),
            typeof rotObj.y === 'number' ? rotObj.y : (rotObj._y || 0),
            typeof rotObj.z === 'number' ? rotObj.z : (rotObj._z || 0)
          );
          this.dragStartScale.set(
            typeof scaleObj.x === 'number' ? scaleObj.x : 1,
            typeof scaleObj.y === 'number' ? scaleObj.y : 1,
            typeof scaleObj.z === 'number' ? scaleObj.z : 1
          );
          this._dragQuiet = true;

          // Плоскость drag: через объект, нормаль по оси/плоскости
          const normal = new THREE.Vector3(0, 1, 0);
          if (this.activeHandle === 'y' || this.activeHandle === 'scaleY') normal.set(0, 0, 1);
          if (this.activeHandle === 'x' || this.activeHandle === 'scaleX') {
            // плоскость YZ (нормаль X) — для чистого сдвига по X лучше camera-facing
            const camDir = new THREE.Vector3();
            this.camera.getWorldDirection(camDir);
            normal.set(0, 1, 0); // horizontal plane for X and Z
            if (this.activeHandle === 'y' || this.activeHandle === 'scaleY') normal.set(0, 0, 1);
          }
          if (this.activeHandle === 'xy') normal.set(0, 0, 1);
          if (this.activeHandle === 'yz') normal.set(1, 0, 0);
          if (this.activeHandle === 'y') {
            // vertical: plane facing camera, containing Y axis
            const cam = this.camera.position.clone().sub(this.gizmoGroup.position);
            cam.y = 0;
            if (cam.lengthSq() < 1e-6) cam.set(0, 0, 1);
            cam.normalize();
            normal.copy(cam);
          }

          this.dragPlane.setFromNormalAndCoplanarPoint(normal, this.gizmoGroup.position);
          // точка клика на плоскости — база дельты (НЕ абсолютная позиция объекта)
          if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.dragStartIntersect)) {
            this.dragStartIntersect.copy(this.gizmoGroup.position);
          }
          return;
        }
      }

      // 2. Сканируем 3D-объекты. Если выбрана группа (category) — только она.
      const cat = this.filterCategory || 'all';
      const allow = (type) => this._typeMatchesCategory(type, cat);
      const sceneTargets = [];
      const objectMap = new Map();

      // NPC
      if (allow('npc') && this.game.npcManager) {
        this.game.npcManager.npcs.forEach(n => {
          if (n.mesh) {
            n.mesh.traverse(child => objectMap.set(child, { type: 'npc', id: n.template.id }));
          }
        });
      }

      // Мобы
      if (allow('mob')) {
        const enemies = this.game.spawnManager ? this.game.spawnManager.enemies : [];
        enemies.forEach((en, idx) => {
          if (en.mesh) en.mesh.traverse(child => objectMap.set(child, { type: 'mob', id: idx }));
        });
      }

      // Пропы
      if (allow('prop') && this.customPropMeshes) {
        this.customPropMeshes.forEach((mesh, propId) => {
          if (mesh && typeof mesh.traverse === 'function') {
            mesh.traverse(child => objectMap.set(child, { type: 'prop', id: propId }));
          }
        });
      }

      // BSP brushes
      if (allow('bsp') && window.BspBrushes) {
        const root = window.BspBrushes.getRoot && window.BspBrushes.getRoot();
        if (root && typeof root.traverse === 'function') {
          root.traverse(child => {
            if (child.userData && child.userData.isBspBrush && child.userData.brushId) {
              objectMap.set(child, { type: 'bsp', id: child.userData.brushId });
            }
          });
        }
        // also map from getBrushes
        (window.BspBrushes.getBrushes() || []).forEach(b => {
          const m = window.BspBrushes.getMesh(b.id);
          if (m && typeof m.traverse === 'function') m.traverse(child => objectMap.set(child, { type: 'bsp', id: b.id }));
        });
      }

      // Земля (дороги / трава / площади)
      if (allow('ground') && window.VillageGround && window.VillageGround.root) {
        window.VillageGround.root.traverse(child => {
          if (child.userData && (child.userData.isGroundMark || child.userData.groundId)) {
            objectMap.set(child, { type: 'ground', id: child.userData.groundId });
          }
        });
      }

      // Маркеры (споты / зоны / npc-gizmo / спавн / свет)
      if (this.markersGroup && this.markersGroup.children) {
        this.markersGroup.children.forEach(m => {
          if (!m || !m.visible || typeof m.traverse !== 'function') return;
          const mt = m.userData && m.userData.markerType;
          m.traverse(child => {
            if (!child) return;
            if (mt === 'spot' && allow('spot')) {
              objectMap.set(child, { type: 'spot', id: m.userData.spotIdx });
            } else if (mt === 'npc' && allow('npc')) {
              objectMap.set(child, { type: 'npc', id: m.userData.npcId });
            } else if (mt === 'player_spawn' && allow('player')) {
              objectMap.set(child, { type: 'player', id: 'spawn' });
            } else if (mt === 'light' && allow('light')) {
              objectMap.set(child, { type: 'light', id: 'sun' });
            } else if (mt === 'hunt' && allow('hunt')) {
              objectMap.set(child, { type: 'hunt', id: m.userData.huntId });
            } else if (mt === 'site' && allow('site')) {
              objectMap.set(child, { type: 'site', id: m.userData.siteId });
            }
          });
        });
      }

      // Игрок
      if (allow('player') && this.game.player && this.game.player.mesh) {
        this.game.player.mesh.traverse(child => objectMap.set(child, { type: 'player', id: 'spawn' }));
        if (this.game.player.youMarker) objectMap.set(this.game.player.youMarker, { type: 'player', id: 'spawn' });
      }

      // Цели raycast:
      // — all: всё в сцене (как раньше)
      // — prop: всё + direct_mesh (terrain/модели), НО meta чужих типов игнорируем
      // — bsp: только BSP меши
      // — иначе: только objectMap-ключи (маркеры/npc/...) — terrain не выбирается
      if (cat === 'all' || cat === 'prop') {
        this.scene.traverse(child => {
          if (child === this.gizmoGroup || child === this.selectionBox || child === this.markersGroup) return;
          if (child.userData && child.userData.isGizmoHandle) return;
          // built CSG mesh — не выбирать как prop; shells ловятся через objectMap
          if (child.userData && child.userData.isBspBuilt) return;
          if (child.userData && child.userData.isBspPreview) return;
          // не брать невидимые маркеры чужих групп
          if (child.userData && child.userData.isEditorMarker) {
            const mt = child.userData.markerType;
            if (mt === 'spot' && !allow('spot')) return;
            if (mt === 'npc' && !allow('npc')) return;
            if (mt === 'hunt' && !allow('hunt')) return;
            if (mt === 'site' && !allow('site')) return;
            if (mt === 'player_spawn' && !allow('player')) return;
            if (mt === 'light' && !allow('light')) return;
          }
          if (child.isMesh || child.isSprite || child.isLine || child.isGroup) {
            sceneTargets.push(child);
          }
        });
      } else {
        // только объекты активной группы
        objectMap.forEach((_, mesh) => {
          if (mesh && (mesh.isMesh || mesh.isSprite || mesh.isLine || mesh.isGroup)) {
            sceneTargets.push(mesh);
          }
        });
      }

      // Защита raycast: гарантируем, что на Sprite/Line/Mesh не висят несовместимые методы raycast
      for (let i = 0; i < sceneTargets.length; i++) {
        const t = sceneTargets[i];
        if (!t) continue;
        if (t.isSprite && t.raycast !== THREE.Sprite.prototype.raycast) {
          t.raycast = THREE.Sprite.prototype.raycast;
        } else if ((t.isLine || t.isLineSegments) && t.raycast === THREE.Mesh.prototype.raycast) {
          t.raycast = t.isLineSegments ? THREE.LineSegments.prototype.raycast : THREE.Line.prototype.raycast;
        }
      }

      // Raycast: берём первый hit, подходящий под фильтр
      let hits = [];
      try {
        hits = this.raycaster.intersectObjects(sceneTargets, true);
      } catch (err) {
        console.warn('[SceneEditor] raycast intersectObjects error suppressed:', err);
        for (let i = 0; i < sceneTargets.length; i++) {
          const t = sceneTargets[i];
          if (!t) continue;
          if (t.isSprite) t.raycast = THREE.Sprite.prototype.raycast;
          else if (t.isLineSegments) t.raycast = THREE.LineSegments.prototype.raycast;
          else if (t.isLine) t.raycast = THREE.Line.prototype.raycast;
          else if (t.isMesh) t.raycast = THREE.Mesh.prototype.raycast;
        }
        try {
          hits = this.raycaster.intersectObjects(sceneTargets, true);
        } catch (e2) {
          hits = [];
        }
      }
      if (hits.length > 0) {
        for (let hi = 0; hi < hits.length; hi++) {
          const hitObj = hits[hi].object;

          // 0. Поиск в инстансированной растительности (FoliageInstancer)
          const instancer = this._foliageInstancer || (this.game && this.game.worldContent && this.game.worldContent.foliageInstancer);
          if (instancer) {
            const folProp = instancer.findPropByHit(hitObj, hits[hi].instanceId, hits[hi].point);
            if (folProp && (allow('prop') || allow('foliage'))) {
              this.selectObjectById('prop:' + folProp.id);
              return;
            }
          }

          // 1. Прямой поиск в objectMap
          let meta = objectMap.get(hitObj);

          // 2. Иерархический поиск родительских данных (для сложных FBX групп)
          if (!meta) {
            let curr = hitObj;
            while (curr && curr !== this.scene) {
              if (objectMap.has(curr)) {
                meta = objectMap.get(curr);
                break;
              }
              if (curr.userData && (curr.userData.isCustomProp || curr.userData.propId)) {
                meta = { type: 'prop', id: curr.userData.propId };
                break;
              }
              if (curr.userData && (curr.userData.isGroundMark || curr.userData.groundId)) {
                meta = { type: 'ground', id: curr.userData.groundId };
                break;
              }
              if (curr.userData && curr.userData.isBspBrush && curr.userData.brushId) {
                meta = { type: 'bsp', id: curr.userData.brushId };
                break;
              }
              curr = curr.parent;
            }
          }

          if (meta) {
            if (!allow(meta.type)) continue;
            this.selectObjectById(meta.type + ':' + meta.id);
            return;
          }

          // direct mesh только в all / prop
          if (cat === 'all' || cat === 'prop') {
            let rootObj = hitObj;
            while (rootObj.parent && rootObj.parent !== this.scene && rootObj.parent.type !== 'Scene') {
              rootObj = rootObj.parent;
            }
            // не выбирать gizmo/markersGroup root
            if (rootObj === this.gizmoGroup || rootObj === this.markersGroup || rootObj === this.selectionBox) continue;
            if (rootObj.userData && (rootObj.userData.isCustomProp || rootObj.userData.propId)) {
              this.selectObjectById('prop:' + rootObj.userData.propId);
              return;
            }
            // если это editor marker чужой группы — skip
            if (rootObj.userData && rootObj.userData.isEditorMarker) {
              const mt = rootObj.userData.markerType;
              const tmap = { player_spawn: 'player', spot: 'spot', npc: 'npc', hunt: 'hunt', light: 'light', site: 'site' };
              const t = tmap[mt] || mt;
              if (!allow(t)) continue;
              if (mt === 'hunt') { this.selectObjectById('hunt:' + rootObj.userData.huntId); return; }
              if (mt === 'spot') { this.selectObjectById('spot:' + rootObj.userData.spotIdx); return; }
              if (mt === 'npc') { this.selectObjectById('npc:' + rootObj.userData.npcId); return; }
              if (mt === 'site') { this.selectObjectById('site:' + rootObj.userData.siteId); return; }
              if (mt === 'player_spawn') { this.selectObjectById('player:spawn'); return; }
              if (mt === 'light') { this.selectObjectById('light:sun'); return; }
            }
            this.selectDirectMesh(rootObj);
            return;
          }
        }
        // ничего подходящего — не выбираем terrain «мимо» группы
        return;
      }

      // 3. Резервный выбор по дистанции (только типы активной группы)
      const ray = this.raycaster.ray;
      let closestObj = null;
      let minDistanceToRay = Infinity;

      const WM = window.WorldMetrics;
      if (WM) {
        if (allow('npc')) {
          const npcs = WM.buildCityNPCs().concat(WM.buildRegionNPCs());
          npcs.forEach(n => {
            const pt = new THREE.Vector3(n.position.x, window.Terrain ? window.Terrain.heightAt(n.position.x, n.position.z) : 0, n.position.z);
            const dist = ray.distanceToPoint(pt);
            const camDist = this.camera.position.distanceTo(pt);
            const maxTol = Math.max(8.0, camDist * 0.08);
            if (dist < maxTol && dist < minDistanceToRay) { minDistanceToRay = dist; closestObj = { type: 'npc', id: n.id }; }
          });
        }

        if (allow('spot')) {
          const spots = WM.buildSpots();
          spots.forEach((s) => {
            const idx = (typeof s.idx === 'number') ? s.idx : -1;
            if (idx < 0) return;
            const pt = new THREE.Vector3(s.x, window.Terrain ? window.Terrain.heightAt(s.x, s.z) : 0, s.z);
            const dist = ray.distanceToPoint(pt);
            const camDist = this.camera.position.distanceTo(pt);
            const maxTol = Math.max(12.0, camDist * 0.1);
            if (dist < maxTol && dist < minDistanceToRay) { minDistanceToRay = dist; closestObj = { type: 'spot', id: idx }; }
          });
        }

        if (allow('hunt') && WM.buildHuntZones) {
          WM.buildHuntZones().forEach(hz => {
            const pt = new THREE.Vector3(hz.x, window.Terrain ? window.Terrain.heightAt(hz.x, hz.z) : 0, hz.z);
            const dist = ray.distanceToPoint(pt);
            const camDist = this.camera.position.distanceTo(pt);
            const maxTol = Math.max(14.0, camDist * 0.12);
            if (dist < maxTol && dist < minDistanceToRay) { minDistanceToRay = dist; closestObj = { type: 'hunt', id: hz.id }; }
          });
        }

        if (allow('prop')) {
          const props = WM.buildCustomProps();
          props.forEach(p => {
            const pt = new THREE.Vector3(p.position.x, p.position.y || 0, p.position.z);
            const dist = ray.distanceToPoint(pt);
            const camDist = this.camera.position.distanceTo(pt);
            const maxTol = Math.max(8.0, camDist * 0.08);
            if (dist < maxTol && dist < minDistanceToRay) { minDistanceToRay = dist; closestObj = { type: 'prop', id: p.id }; }
          });
        }

        if (allow('bsp') && window.BspBrushes) {
          window.BspBrushes.getBrushes().forEach(b => {
            const pt = new THREE.Vector3(b.position.x, b.position.y || 0, b.position.z);
            const dist = ray.distanceToPoint(pt);
            const camDist = this.camera.position.distanceTo(pt);
            const maxTol = Math.max(10.0, camDist * 0.1);
            if (dist < maxTol && dist < minDistanceToRay) { minDistanceToRay = dist; closestObj = { type: 'bsp', id: b.id }; }
          });
        }
      }

      if (closestObj) {
        if (closestObj.type === 'npc') this.selectObjectById('npc:' + closestObj.id);
        else if (closestObj.type === 'spot') this.selectObjectById('spot:' + closestObj.id);
        else if (closestObj.type === 'hunt') this.selectObjectById('hunt:' + closestObj.id);
        else if (closestObj.type === 'prop') this.selectObjectById('prop:' + closestObj.id);
        else if (closestObj.type === 'bsp') this.selectObjectById('bsp:' + closestObj.id);
      }
    }

    // ============================================================
    //  ZONE EDIT MODE (Blender-style Tab)
    //  Select zone → Tab → click verts, drag, click edge to subdivide
    // ============================================================
    toggleZoneEditMode() {
      if (this.zoneEditMode) this.exitZoneEditMode();
      else this.enterZoneEditMode();
    }

    enterZoneEditMode(huntId) {
      const id = huntId || (this.selectedObject && this.selectedObject.type === 'hunt' && this.selectedObject.id);
      if (!id) {
        if (this.game.addChatMessage) this.game.addChatMessage('[Зоны] Сначала выбери зону, потом Tab', 'system');
        return;
      }
      const WM = window.WorldMetrics;
      if (!WM) return;

      // ensure poly (rect → 4 verts)
      this._ensureHuntIsPoly(id);

      if (this.drawBspMode) this.toggleDrawBspMode(false);
      if (this.drawHuntMode) this.toggleDrawHuntMode(false);
      this.editorMode = 'zones';

      this.zoneEditMode = true;
      this._zoneEditId = id;
      this._zoneSelectedVerts = new Set();
      this._vertDrag = null;

      // hide object gizmo — edit verts instead
      if (this.gizmoGroup) this.gizmoGroup.visible = false;
      if (this.selectionBox) this.selectionBox.visible = false;

      this._rebuildZoneEditOverlay();
      this.updateInspectorFields();

      if (this.game.addChatMessage) {
        this.game.addChatMessage('[Зоны] 🟧 Edit Mode — вершины · edge ◆ = добавить · Tab = выход', 'system');
      }
    }

    exitZoneEditMode(silent) {
      if (!this.zoneEditMode && !this._zoneEditOverlay) return;
      const id = this._zoneEditId;
      this.zoneEditMode = false;
      this._zoneEditId = null;
      this._zoneSelectedVerts = new Set();
      this._vertDrag = null;
      this._disposeZoneEditOverlay();

      if (id) {
        this._refreshHuntZoneMesh(id);
        if (this.selectedObject && this.selectedObject.type === 'hunt' && this.selectedObject.id === id) {
          this.selectHuntZone(id);
        }
      }
      this.saveToLocalStorage();
      if (!silent && this.game.addChatMessage) {
        this.game.addChatMessage('[Зоны] Object Mode (вышли из Edit)', 'system');
      }
      try { this.updateInspectorFields(); } catch (e) {}
    }

    /** rect → poly with 4 corners (so edit mode always works) */
    _ensureHuntIsPoly(id) {
      const WM = window.WorldMetrics;
      if (!WM || !WM.updateHuntZone) return;
      const raw = WM.HUNT_ZONES && WM.HUNT_ZONES.find(z => z && z.id === id);
      if (!raw) return;
      if (raw.poly && raw.poly.length >= 3) return;
      const hz = WM.buildHuntZones().find(z => z.id === id);
      if (!hz || !hz.bounds) return;
      const b = hz.bounds; // [minX, minZ, maxX, maxZ]
      const poly = [
        [(b[0] - WM.MIN_X) / WM.W, (b[1] - WM.MIN_Z) / WM.H],
        [(b[2] - WM.MIN_X) / WM.W, (b[1] - WM.MIN_Z) / WM.H],
        [(b[2] - WM.MIN_X) / WM.W, (b[3] - WM.MIN_Z) / WM.H],
        [(b[0] - WM.MIN_X) / WM.W, (b[3] - WM.MIN_Z) / WM.H]
      ];
      WM.updateHuntZone(id, { poly: poly });
      if (window.MAP_HUNT_ZONES !== undefined) window.MAP_HUNT_ZONES = WM.buildHuntZones();
    }

    _getZonePolyWorld(id) {
      const WM = window.WorldMetrics;
      if (!WM || !WM.buildHuntZones) return null;
      const hz = WM.buildHuntZones().find(z => z.id === id);
      if (!hz) return null;
      if (hz.polyWorld && hz.polyWorld.length >= 3) {
        return hz.polyWorld.map(p => ({ x: p.x, z: p.z, u: p.u, v: p.v }));
      }
      if (hz.poly && hz.poly.length >= 3) {
        return hz.poly.map(pt => ({
          x: WM.MIN_X + pt[0] * WM.W,
          z: WM.MIN_Z + pt[1] * WM.H,
          u: pt[0],
          v: pt[1]
        }));
      }
      return null;
    }

    _disposeZoneEditOverlay() {
      if (this._zoneEditOverlay) {
        if (this._zoneEditOverlay.parent) this._zoneEditOverlay.parent.remove(this._zoneEditOverlay);
        this._zoneEditOverlay.traverse(c => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) {
            if (Array.isArray(c.material)) c.material.forEach(m => m.dispose && m.dispose());
            else if (c.material.dispose) c.material.dispose();
          }
        });
      }
      this._zoneEditOverlay = null;
      this._zoneEditMeshes = { verts: [], mids: [], edges: null };
    }

    /**
     * Scale vertex/mid handles so they stay visible from any camera height
     * (zone can be km-wide; 1m spheres are invisible from fly view).
     */
    _zoneEditHandleScaleAt(worldPos) {
      if (!this.camera || !worldPos) return 8;
      const d = this.camera.position.distanceTo(worldPos);
      // ~2.5% of distance, clamped for huge maps / close zoom
      return Math.max(3, Math.min(120, d * 0.028));
    }

    _updateZoneEditHandleScales() {
      if (!this.zoneEditMode || !this._zoneEditMeshes) return;
      const verts = this._zoneEditMeshes.verts || [];
      const mids = this._zoneEditMeshes.mids || [];
      for (let i = 0; i < verts.length; i++) {
        const v = verts[i];
        if (!v) continue;
        const sel = this._zoneSelectedVerts.has(v.userData.vertIndex);
        const s = this._zoneEditHandleScaleAt(v.position) * (sel ? 1.25 : 1);
        v.scale.setScalar(s);
      }
      for (let i = 0; i < mids.length; i++) {
        const m = mids[i];
        if (!m) continue;
        const s = this._zoneEditHandleScaleAt(m.position) * 0.72;
        m.scale.setScalar(s);
      }
    }

    _rebuildZoneEditOverlay() {
      this._disposeZoneEditOverlay();
      if (!this.zoneEditMode || !this._zoneEditId) return;
      const pts = this._getZonePolyWorld(this._zoneEditId);
      if (!pts || pts.length < 3) return;

      const group = new THREE.Group();
      group.name = 'ZoneEditOverlay';
      group.renderOrder = 10000;
      const verts = [];
      const mids = [];

      // Shared materials — always on top of terrain
      const matEdge = new THREE.LineBasicMaterial({
        color: 0xffcc44,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 1
      });
      const matVert = new THREE.MeshBasicMaterial({
        color: 0xffee44,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.98
      });
      const matVertSel = new THREE.MeshBasicMaterial({
        color: 0xff5522,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 1
      });
      const matMid = new THREE.MeshBasicMaterial({
        color: 0x44ffcc,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.95
      });
      // unit geometries — world size via scale (camera-adaptive)
      const geoVert = new THREE.SphereGeometry(1, 16, 16);
      const geoMid = new THREE.OctahedronGeometry(1, 0);
      const geoRing = new THREE.TorusGeometry(1.45, 0.1, 8, 24);

      // edges (closed loop) + mid handles
      const edgePos = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const lift = 2.5;
        const ya = (window.Terrain ? window.Terrain.heightAt(a.x, a.z) : 0) + lift;
        const yb = (window.Terrain ? window.Terrain.heightAt(b.x, b.z) : 0) + lift;
        edgePos.push(a.x, ya, a.z, b.x, yb, b.z);

        const mx = (a.x + b.x) * 0.5;
        const mz = (a.z + b.z) * 0.5;
        const my = (window.Terrain ? window.Terrain.heightAt(mx, mz) : 0) + lift + 0.5;
        const mid = new THREE.Mesh(geoMid, matMid);
        mid.position.set(mx, my, mz);
        mid.renderOrder = 10002;
        mid.frustumCulled = false;
        mid.userData = {
          isZoneEditMid: true,
          edgeIndex: i,
          huntId: this._zoneEditId
        };
        group.add(mid);
        mids.push(mid);
      }
      const edgeGeo = new THREE.BufferGeometry();
      edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
      const edges = new THREE.LineSegments(edgeGeo, matEdge);
      edges.renderOrder = 10001;
      edges.frustumCulled = false;
      edges.userData.isZoneEditEdge = true;
      group.add(edges);

      // vertices — unit spheres, scaled every frame
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const y = (window.Terrain ? window.Terrain.heightAt(p.x, p.z) : 0) + 3.0;
        const sel = this._zoneSelectedVerts.has(i);
        const v = new THREE.Mesh(geoVert, sel ? matVertSel : matVert);
        v.position.set(p.x, y, p.z);
        v.renderOrder = 10003;
        v.frustumCulled = false;
        v.userData = {
          isZoneEditVert: true,
          vertIndex: i,
          huntId: this._zoneEditId
        };
        if (sel) {
          const ring = new THREE.Mesh(
            geoRing,
            new THREE.MeshBasicMaterial({
              color: 0xffffff,
              depthTest: false,
              depthWrite: false,
              transparent: true,
              opacity: 0.95
            })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.renderOrder = 10004;
          v.add(ring);
        }
        group.add(v);
        verts.push(v);
      }

      this.scene.add(group);
      this._zoneEditOverlay = group;
      this._zoneEditMeshes = { verts: verts, mids: mids, edges: edges };
      // apply camera scale immediately
      this._updateZoneEditHandleScales();
    }

    _zoneEditSelectVert(index, additive) {
      if (!additive) this._zoneSelectedVerts.clear();
      if (this._zoneSelectedVerts.has(index) && additive) this._zoneSelectedVerts.delete(index);
      else this._zoneSelectedVerts.add(index);
      this._rebuildZoneEditOverlay();
      try { this.updateInspectorFields(); } catch (e) {}
    }

    _zoneEditClearSelection() {
      this._zoneSelectedVerts.clear();
      this._rebuildZoneEditOverlay();
      try { this.updateInspectorFields(); } catch (e) {}
    }

    /** Insert vertex on edge i (between i and i+1) at world point or midpoint */
    _zoneEditInsertOnEdge(edgeIndex, worldPt) {
      const WM = window.WorldMetrics;
      if (!WM || !this._zoneEditId) return;
      this._ensureHuntIsPoly(this._zoneEditId);
      const hz = WM.buildHuntZones().find(z => z.id === this._zoneEditId);
      if (!hz || !hz.poly || hz.poly.length < 3) return;

      this.pushHistory('зона +вершина edge');
      const poly = hz.poly.map(p => [p[0], p[1]]);
      let u, v;
      if (worldPt) {
        u = (worldPt.x - WM.MIN_X) / WM.W;
        v = (worldPt.z - WM.MIN_Z) / WM.H;
      } else {
        const a = poly[edgeIndex];
        const b = poly[(edgeIndex + 1) % poly.length];
        u = (a[0] + b[0]) * 0.5;
        v = (a[1] + b[1]) * 0.5;
      }
      const insertAt = edgeIndex + 1;
      poly.splice(insertAt, 0, [u, v]);
      WM.updateHuntZone(this._zoneEditId, { poly: poly });
      if (window.MAP_HUNT_ZONES !== undefined) window.MAP_HUNT_ZONES = WM.buildHuntZones();
      this._refreshHuntZoneMesh(this._zoneEditId);
      this._zoneSelectedVerts = new Set([insertAt]);
      this._rebuildZoneEditOverlay();
      this.saveToLocalStorage();
      if (this.game.addChatMessage) {
        this.game.addChatMessage('[Зоны] +вершина на edge → всего ' + poly.length, 'system');
      }
    }

    _zoneEditDeleteSelected() {
      if (!this.zoneEditMode || !this._zoneEditId) return;
      const WM = window.WorldMetrics;
      if (!WM) return;
      const hz = WM.buildHuntZones().find(z => z.id === this._zoneEditId);
      if (!hz || !hz.poly) return;
      if (hz.poly.length - this._zoneSelectedVerts.size < 3) {
        if (this.game.addChatMessage) this.game.addChatMessage('[Зоны] Минимум 3 вершины', 'system');
        return;
      }
      if (!this._zoneSelectedVerts.size) return;
      this.pushHistory('зона −вершины');
      const drop = this._zoneSelectedVerts;
      const poly = hz.poly.filter((_, i) => !drop.has(i)).map(p => [p[0], p[1]]);
      WM.updateHuntZone(this._zoneEditId, { poly: poly });
      if (window.MAP_HUNT_ZONES !== undefined) window.MAP_HUNT_ZONES = WM.buildHuntZones();
      this._refreshHuntZoneMesh(this._zoneEditId);
      this._zoneSelectedVerts.clear();
      this._rebuildZoneEditOverlay();
      this.saveToLocalStorage();
      if (this.game.addChatMessage) this.game.addChatMessage('[Зоны] Удалено, осталось ' + poly.length, 'system');
    }

    /** Mouse handling while in zone edit mode. Returns true if consumed. */
    _onZoneEditMouseDown(e) {
      if (!this.zoneEditMode || !this._zoneEditOverlay) return false;
      this.camera.updateMatrixWorld();
      this._updateMouseCoords(e.clientX, e.clientY);
      this.raycaster.setFromCamera(this.mouse, this.camera);

      const verts = this._zoneEditMeshes.verts || [];
      const mids = this._zoneEditMeshes.mids || [];

      // 1) verts first
      let hits = this.raycaster.intersectObjects(verts, true);
      if (hits.length) {
        let obj = hits[0].object;
        while (obj && !obj.userData.isZoneEditVert && obj.parent) obj = obj.parent;
        if (obj && obj.userData.isZoneEditVert) {
          const idx = obj.userData.vertIndex;
          const additive = e.shiftKey;
          if (!additive && this._zoneSelectedVerts.has(idx) && this._zoneSelectedVerts.size >= 1) {
            // already selected — start drag of selection
          } else {
            this._zoneEditSelectVert(idx, additive);
          }
          // start drag
          const pt = this._raycastGround(e.clientX, e.clientY);
          if (pt) {
            this.pushHistory('зона move verts');
            this._vertDrag = {
              kind: 'zoneEdit',
              huntId: this._zoneEditId,
              startPt: { x: pt.x, z: pt.z },
              startPoly: null
            };
            const hz = window.WorldMetrics.buildHuntZones().find(z => z.id === this._zoneEditId);
            if (hz && hz.poly) {
              this._vertDrag.startPoly = hz.poly.map(p => [p[0], p[1]]);
            }
          }
          return true;
        }
      }

      // 2) edge midpoints → insert
      hits = this.raycaster.intersectObjects(mids, false);
      if (hits.length) {
        const mid = hits[0].object;
        if (mid.userData.isZoneEditMid) {
          const pt = this._raycastGround(e.clientX, e.clientY);
          this._zoneEditInsertOnEdge(mid.userData.edgeIndex, pt);
          // start drag on new vertex
          const pt2 = pt || this._raycastGround(e.clientX, e.clientY);
          if (pt2) {
            this.pushHistory('зона move new vert');
            const hz = window.WorldMetrics.buildHuntZones().find(z => z.id === this._zoneEditId);
            this._vertDrag = {
              kind: 'zoneEdit',
              huntId: this._zoneEditId,
              startPt: { x: pt2.x, z: pt2.z },
              startPoly: hz && hz.poly ? hz.poly.map(p => [p[0], p[1]]) : null
            };
          }
          return true;
        }
      }

      // 3) empty click — deselect verts
      if (!e.shiftKey) this._zoneEditClearSelection();
      return true; // consume so we don't deselect the zone
    }

    _updateZoneEditDrag(e) {
      if (!this._vertDrag || this._vertDrag.kind !== 'zoneEdit') return;
      const pt = this._raycastGround(e.clientX, e.clientY);
      if (!pt || !this._vertDrag.startPoly) return;
      const WM = window.WorldMetrics;
      if (!WM) return;

      const du = (pt.x - this._vertDrag.startPt.x) / WM.W;
      const dv = (pt.z - this._vertDrag.startPt.z) / WM.H;
      const base = this._vertDrag.startPoly;
      const poly = base.map((p, i) => {
        if (this._zoneSelectedVerts.has(i)) return [p[0] + du, p[1] + dv];
        return [p[0], p[1]];
      });
      WM.updateHuntZone(this._zoneEditId, { poly: poly });
      // live: move handles only (no full rebuild every frame)
      this._syncZoneEditOverlayPositions(poly);
    }

    /** Move existing vert/mid/edge handles to match UV poly (world) */
    _syncZoneEditOverlayPositions(polyUV) {
      const WM = window.WorldMetrics;
      if (!WM || !polyUV || !this._zoneEditMeshes) return;
      const verts = this._zoneEditMeshes.verts || [];
      const mids = this._zoneEditMeshes.mids || [];
      const edges = this._zoneEditMeshes.edges;
      const lift = 3.0;
      const n = polyUV.length;
      const world = polyUV.map(p => ({
        x: WM.MIN_X + p[0] * WM.W,
        z: WM.MIN_Z + p[1] * WM.H
      }));
      for (let i = 0; i < verts.length && i < n; i++) {
        const p = world[i];
        const y = (window.Terrain ? window.Terrain.heightAt(p.x, p.z) : 0) + lift;
        verts[i].position.set(p.x, y, p.z);
      }
      const edgePos = [];
      for (let i = 0; i < n; i++) {
        const a = world[i];
        const b = world[(i + 1) % n];
        const ya = (window.Terrain ? window.Terrain.heightAt(a.x, a.z) : 0) + lift - 0.5;
        const yb = (window.Terrain ? window.Terrain.heightAt(b.x, b.z) : 0) + lift - 0.5;
        edgePos.push(a.x, ya, a.z, b.x, yb, b.z);
        if (mids[i]) {
          const mx = (a.x + b.x) * 0.5;
          const mz = (a.z + b.z) * 0.5;
          const my = (window.Terrain ? window.Terrain.heightAt(mx, mz) : 0) + lift;
          mids[i].position.set(mx, my, mz);
        }
      }
      if (edges && edges.geometry) {
        edges.geometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
        edges.geometry.attributes.position.needsUpdate = true;
        edges.geometry.computeBoundingSphere();
      }
      this._updateZoneEditHandleScales();
    }

    _finishZoneEditDrag() {
      if (!this._vertDrag || this._vertDrag.kind !== 'zoneEdit') {
        this._vertDrag = null;
        return;
      }
      this._vertDrag = null;
      this._rebuildZoneEditOverlay();
      this._refreshHuntZoneMesh(this._zoneEditId);
      this.saveToLocalStorage();
      // update selected object data
      if (this.selectedObject && this.selectedObject.type === 'hunt') {
        const hz = window.WorldMetrics.buildHuntZones().find(z => z.id === this._zoneEditId);
        if (hz) {
          this.selectedObject.targetData = hz;
          this.selectedObject.mesh = this.markerMeshes.get('hunt_' + hz.id);
          this.selectedObject.position.x = hz.x;
          this.selectedObject.position.z = hz.z;
        }
      }
    }

    // ---- BSP draw input (phase 1 footprint drag, phase 2 height) / place click ----
    _onBspDrawDown(e) {
      // Place mode: single click
      if (this.bspPlaceMode === 'click') {
        const pt = this._raycastGround(e.clientX, e.clientY);
        if (pt) this._placeBspAtPoint(pt);
        return;
      }
      // Phase 2: click confirms height
      if (this._bspDrawPhase === 2) {
        const prev = this._bspPreviewMesh && this._bspPreviewMesh.userData._bspPrev;
        if (prev && prev.w >= 0.4 && prev.d >= 0.4) {
          this._finishBspBrushCreate(prev);
        }
        return;
      }
      // Phase 0 → 1: start footprint
      const pt = this._raycastGround(e.clientX, e.clientY);
      if (!pt) return;
      this._clearBspGhost();
      this._bspDrawPhase = 1;
      this._bspCornerA = { x: pt.x, y: pt.y, z: pt.z };
      this._bspCornerB = { x: pt.x, y: pt.y, z: pt.z };
      this._bspBaseY = pt.y;
      this._bspHeightDragStartY = e.clientY;
      this._updateBspPreviewFootprint(this._bspCornerA, this._bspCornerB, 0.5);
    }

    _onBspDrawMove(e) {
      if (this.bspPlaceMode === 'click' && this._bspDrawPhase === 0) {
        const pt = this._raycastGround(e.clientX, e.clientY);
        if (pt) this._updateBspGhost(pt);
        return;
      }
      if (this._bspDrawPhase === 1 && this._bspCornerA) {
        const pt = this._raycastGround(e.clientX, e.clientY);
        if (!pt) return;
        this._bspCornerB = { x: pt.x, y: this._bspBaseY, z: pt.z };
        this._updateBspPreviewFootprint(this._bspCornerA, this._bspCornerB, 0.5);
        return;
      }
      if (this._bspDrawPhase === 2 && this._bspCornerA && this._bspCornerB) {
        const dy = (this._bspHeightDragStartY - e.clientY) * 0.08;
        let h = Math.max(0.3, this._bspDefaultHeight + dy);
        const grid = this._bspGrid || this.gridSnap || 0;
        if (grid > 0) h = Math.max(grid, Math.round(h / grid) * grid);
        this._updateBspPreviewFootprint(this._bspCornerA, this._bspCornerB, h);
        return;
      }
    }

    _onBspDrawUp(e) {
      if (this.bspPlaceMode === 'click') return;
      if (this._bspDrawPhase !== 1) return;
      const pt = this._raycastGround(e.clientX, e.clientY);
      if (pt && this._bspCornerA) {
        this._bspCornerB = { x: pt.x, y: this._bspBaseY, z: pt.z };
      }
      if (!this._bspCornerA || !this._bspCornerB) {
        this._bspDrawPhase = 0;
        this._clearBspPreview();
        return;
      }
      const w = Math.abs(this._bspCornerB.x - this._bspCornerA.x);
      const d = Math.abs(this._bspCornerB.z - this._bspCornerA.z);
      if (w < 0.4 && d < 0.4) {
        this._bspDrawPhase = 0;
        this._bspCornerA = null;
        this._bspCornerB = null;
        this._clearBspPreview();
        if (this.game.addChatMessage) this.game.addChatMessage('[BSP] Слишком маленький footprint — тяни дальше.', 'system');
        return;
      }
      this._bspDrawPhase = 2;
      this._bspHeightDragStartY = e.clientY;
      this._updateBspPreviewFootprint(this._bspCornerA, this._bspCornerB, this._bspDefaultHeight);
      if (this.game.addChatMessage) {
        this.game.addChatMessage('[BSP] Высота: мышь ↑↓ · клик / Enter — создать', 'system');
      }
    }

    onMouseMove(e) {
      if (!this.enabled) return;

      this._updateMouseCoords(e.clientX, e.clientY);
      this.raycaster.setFromCamera(this.mouse, this.camera);

      // Weapon grip mouse drag
      if (this._weaponMouseDrag) {
        this._updateWeaponMouseDrag(e);
        return;
      }

      // Zone edit vertex drag
      if (this._vertDrag && this._vertDrag.kind === 'zoneEdit') {
        this._updateZoneEditDrag(e);
        return;
      }

      if (!this.activeHandle && this.selectedObject && this.gizmoGroup.visible && !this.drawBspMode) {
        const activeGroup = (this.mode === 'scale') ? this.scaleGroup : ((this.mode === 'rotate') ? this.rotateGroup : this.translateGroup);
        const hits = this.raycaster.intersectObjects(activeGroup.children, true);
        if (hits.length > 0) {
          const hitObj = hits[0].object;
          const handle = hitObj.userData.visualTarget || hitObj;
          if (this.hoveredHandle !== handle) {
            if (this.hoveredHandle && this.hoveredHandle.userData && this.hoveredHandle.userData.baseMat) {
              this.hoveredHandle.material = this.hoveredHandle.userData.baseMat;
            }
            this.hoveredHandle = handle;
            if (handle && handle.material) {
              handle.material = this.materials.hover;
            }
          }
        } else if (this.hoveredHandle) {
          if (this.hoveredHandle.userData && this.hoveredHandle.userData.baseMat) {
            this.hoveredHandle.material = this.hoveredHandle.userData.baseMat;
          }
          this.hoveredHandle = null;
        }
      }

      if (!this.activeHandle || !this.selectedObject) return;

      if (this.activeHandle === 'rotY' || this.activeHandle === 'rotX' || this.activeHandle === 'rotZ') {
        const dx = e.clientX - this.dragStartMouse.x;
        const dy = e.clientY - this.dragStartMouse.y;

        // Screen angle projection
        let deltaRad = dx * 0.015 - dy * 0.005;
        try {
          const objPos = this.dragStartPos.clone();
          objPos.project(this.camera);
          if (isFinite(objPos.x) && isFinite(objPos.y) && objPos.z < 1) {
            const screenX = ((objPos.x + 1) * window.innerWidth) / 2;
            const screenY = ((-objPos.y + 1) * window.innerHeight) / 2;
            const vStart = new THREE.Vector2(this.dragStartMouse.x - screenX, this.dragStartMouse.y - screenY);
            const vCurr = new THREE.Vector2(e.clientX - screenX, e.clientY - screenY);
            if (vStart.length() > 15 && vCurr.length() > 15) {
              const a1 = Math.atan2(vStart.y, vStart.x);
              const a2 = Math.atan2(vCurr.y, vCurr.x);
              deltaRad = a2 - a1;
            }
          }
        } catch (err) {}

        if (!isFinite(deltaRad)) deltaRad = 0;

        if (e.shiftKey) {
          const deg = (deltaRad * 180) / Math.PI;
          deltaRad = (Math.round(deg / 15) * 15 * Math.PI) / 180;
        }

        const startRotY = isFinite(this.dragStartRot.y) ? this.dragStartRot.y : (this.selectedObject.rotation.y || 0);
        let newRotY = startRotY + deltaRad;
        if (e.shiftKey) {
          const degTotal = (newRotY * 180) / Math.PI;
          newRotY = (Math.round(degTotal / 15) * 15 * Math.PI) / 180;
        }

        if (!isFinite(newRotY)) newRotY = 0;

        const px = isFinite(this.dragStartPos.x) ? this.dragStartPos.x : (this.selectedObject.position.x || 0);
        const py = isFinite(this.dragStartPos.y) ? this.dragStartPos.y : (this.selectedObject.position.y || 0);
        const pz = isFinite(this.dragStartPos.z) ? this.dragStartPos.z : (this.selectedObject.position.z || 0);

        const sx = isFinite(this.dragStartScale.x) ? this.dragStartScale.x : (this.selectedObject.scale.x || 1);
        const sy = isFinite(this.dragStartScale.y) ? this.dragStartScale.y : (this.selectedObject.scale.y || 1);
        const sz = isFinite(this.dragStartScale.z) ? this.dragStartScale.z : (this.selectedObject.scale.z || 1);

        this.updateObjectTransform(px, py, pz, newRotY, sx, sy, sz);
        return;
      }

      if (this.activeHandle.startsWith('scale')) {
        const dx = e.clientX - this.dragStartMouse.x;
        const dy = e.clientY - this.dragStartMouse.y;
        // Invert dy so dragging right or up scales UP, dragging left or down scales DOWN
        const delta = dx - dy * 0.7;
        const mul = Math.exp(delta * 0.007);

        let sx = this.dragStartScale.x;
        let sy = this.dragStartScale.y;
        let sz = this.dragStartScale.z;

        const isPlaneOrUniform = (
          this.activeHandle === 'scaleAll' ||
          this.activeHandle === 'scale' ||
          this.activeHandle === 'scaleXZ' ||
          this.activeHandle === 'scaleXY' ||
          this.activeHandle === 'scaleYZ' ||
          e.shiftKey
        );

        if (this.selectedObject.type === 'bsp') {
          if (isPlaneOrUniform) {
            sx = Math.max(0.05, this.dragStartScale.x * mul);
            sy = Math.max(0.05, this.dragStartScale.y * mul);
            sz = Math.max(0.05, this.dragStartScale.z * mul);
          } else if (this.activeHandle === 'scaleX') sx = Math.max(0.05, this.dragStartScale.x * mul);
          else if (this.activeHandle === 'scaleY') sy = Math.max(0.05, this.dragStartScale.y * mul);
          else if (this.activeHandle === 'scaleZ') sz = Math.max(0.05, this.dragStartScale.z * mul);
          else {
            sx = Math.max(0.05, this.dragStartScale.x * mul);
            sy = Math.max(0.05, this.dragStartScale.y * mul);
            sz = Math.max(0.05, this.dragStartScale.z * mul);
          }
          this.updateObjectTransform(
            this.dragStartPos.x, this.dragStartPos.y, this.dragStartPos.z,
            this.selectedObject.rotation.y, sx, sy, sz
          );
          return;
        }

        if (isPlaneOrUniform) {
          sx = Math.max(0.001, this.dragStartScale.x * mul);
          sy = Math.max(0.001, this.dragStartScale.y * mul);
          sz = Math.max(0.001, this.dragStartScale.z * mul);
        } else if (this.activeHandle === 'scaleX') {
          sx = Math.max(0.001, this.dragStartScale.x * mul);
        } else if (this.activeHandle === 'scaleY') {
          sy = Math.max(0.001, this.dragStartScale.y * mul);
        } else if (this.activeHandle === 'scaleZ') {
          sz = Math.max(0.001, this.dragStartScale.z * mul);
        } else {
          sx = Math.max(0.001, this.dragStartScale.x * mul);
          sy = Math.max(0.001, this.dragStartScale.y * mul);
          sz = Math.max(0.001, this.dragStartScale.z * mul);
        }

        this.updateObjectTransform(
          this.dragStartPos.x, this.dragStartPos.y, this.dragStartPos.z,
          this.selectedObject.rotation.y, sx, sy, sz
        );
        return;
      }

      // Translate: delta from initial plane hit (smooth, no jump)
      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeIntersect)) {
        const dx = this.planeIntersect.x - this.dragStartIntersect.x;
        const dy = this.planeIntersect.y - this.dragStartIntersect.y;
        const dz = this.planeIntersect.z - this.dragStartIntersect.z;

        let newX = this.dragStartPos.x;
        let newY = this.dragStartPos.y;
        let newZ = this.dragStartPos.z;

        if (this.activeHandle === 'x') newX = this.dragStartPos.x + dx;
        else if (this.activeHandle === 'y') newY = this.dragStartPos.y + dy;
        else if (this.activeHandle === 'z') newZ = this.dragStartPos.z + dz;
        else if (this.activeHandle === 'xz') {
          newX = this.dragStartPos.x + dx;
          newZ = this.dragStartPos.z + dz;
        } else if (this.activeHandle === 'xy') {
          newX = this.dragStartPos.x + dx;
          newY = this.dragStartPos.y + dy;
        } else if (this.activeHandle === 'yz') {
          newY = this.dragStartPos.y + dy;
          newZ = this.dragStartPos.z + dz;
        }

        // Сетка только если включена — но мягко (не каждый пиксель «телепорт»)
        // Во время drag не snap'аем — snap на mouseup

        if (this.terrainSnap && (this.activeHandle === 'x' || this.activeHandle === 'z' || this.activeHandle === 'xz') && window.Terrain) {
          newY = window.Terrain.heightAt(newX, newZ);
        }

        this.updateObjectTransform(newX, newY, newZ);
      }
    }

    onMouseUp(e) {
      if (this.foliageIsDrawing) {
        this.foliageIsDrawing = false;
        this.foliageLastPos = null;
        if (this._currentFoliageStroke && (this._currentFoliageStroke.added.length > 0 || this._currentFoliageStroke.removed.length > 0)) {
          this.saveToLocalStorage();
          this.saveToServer(true);
        }
        this._currentFoliageStroke = null;
        return;
      }

      if (this.paintIsDrawing) {
        this.paintIsDrawing = false;
        this.paintLastPos = null;
        if (window.Terrain && window.Terrain.scheduleAutoSave) {
          window.Terrain.scheduleAutoSave();
        }
        return;
      }

      // finish weapon grip mouse drag
      if (this._weaponMouseDrag) {
        this._endWeaponMouseDrag();
        return;
      }

      // finish zone edit drag
      if (this._vertDrag && this._vertDrag.kind === 'zoneEdit') {
        this._finishZoneEditDrag();
        return;
      }

      if (this.activeHandle) {
        // Grid snap on release
        if (this.gridSnap > 0 && this.selectedObject && !String(this.activeHandle).startsWith('scale') &&
            this.activeHandle !== 'rotY' && this.activeHandle !== 'rotX' && this.activeHandle !== 'rotZ') {
          let x = this.selectedObject.position.x;
          let y = this.selectedObject.position.y;
          let z = this.selectedObject.position.z;
          x = Math.round(x / this.gridSnap) * this.gridSnap;
          z = Math.round(z / this.gridSnap) * this.gridSnap;
          this._dragQuiet = false;
          this.updateObjectTransform(x, y, z);
        }

        // BSP: after scale/move, refresh UV tiling materials
        if (this.selectedObject && this.selectedObject.type === 'bsp' && window.BspBrushes) {
          const o = this.selectedObject;
          const size = {
            x: (o.mesh && o.mesh.scale) ? o.mesh.scale.x : o.scale.x,
            y: (o.mesh && o.mesh.scale) ? o.mesh.scale.y : o.scale.y,
            z: (o.mesh && o.mesh.scale) ? o.mesh.scale.z : o.scale.z
          };
          window.BspBrushes.syncBrushTransform(o.id, o.position, o.rotation, size);
          if (String(this.activeHandle).indexOf('scale') === 0) {
            const mesh = window.BspBrushes.applyMaterialChange(o.id);
            if (mesh) o.mesh = mesh;
            const live = window.BspBrushes.findBrush(o.id);
            if (live) o.targetData = live;
          }
        }

        this._dragQuiet = false;
        // commit save + inspector once
        if (this.selectedObject) {
          this.saveToLocalStorage();
          this.saveToServer(true);
          this.updateInspectorFields();
        }

        if (this.hoveredHandle) this.hoveredHandle.material = this.hoveredHandle.userData.baseMat;
        this.activeHandle = null;
        this.hoveredHandle = null;
        this._dragHistPushed = false;
        // Финальный commit позиции игрока на сервер (без speed-clamp)
        if (this._pendingEditorPlayerPos && this.game.net && this.game.net.connected && this.game.net.intentEditorSetPos) {
          const p = this._pendingEditorPlayerPos;
          this.game.net.intentEditorSetPos(p.x, p.z);
          this._pendingEditorPlayerPos = null;
          this._lastEditorPosSend = Date.now();
          if (this.game.addChatMessage) {
            this.game.addChatMessage('[Редактор] Позиция игрока записана на сервер: ' +
              p.x.toFixed(1) + ', ' + p.z.toFixed(1), 'system');
          }
        }
        // Зона охоты: пересобрать меш после scale/move
        if (this.selectedObject && this.selectedObject.type === 'hunt' && this.selectedObject.id) {
          const id = this.selectedObject.id;
          delete this.selectedObject._polyDragBase;
          delete this.selectedObject._polyDragCenter;
          this._refreshHuntZoneMesh(id);
          this.selectHuntZone(id);
        }
        if (this.selectedObject && this.selectedObject.type === 'site' && this.selectedObject.id) {
          const id = this.selectedObject.id;
          delete this.selectedObject._siteDragBase;
          this._markersDirty = true;
          this.init3DMarkers();
          this.selectObjectById('site:' + id);
        }
        this.saveToLocalStorage();
        this.saveToServer(true);
      }
    }
  }

  window.SceneEditor = SceneEditor;
})();
