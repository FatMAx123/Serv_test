/**
 * ============================================================================
 *  GPU PROCEDURAL WIND & FOLIAGE SWAY SYSTEM (Three.js Vertex Shader Injection)
 * ============================================================================
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'project_steam_wind_settings';

  const defaultSettings = {
    enabled: true,
    strength: 0.60,    // Общая сила / амплитуда (0.0 - 2.0)
    speed: 1.20,       // Скорость волны ветра (0.1 - 3.0)
    turbulence: 0.60,  // Хаотичность / порывы / трепет листьев (0.0 - 2.0)
    angle: 45.0        // Направление ветра в градусах (0° - 360°)
  };

  const uniforms = {
    uWindTime: { value: 0.0 },
    uWindStrength: { value: defaultSettings.strength },
    uWindSpeed: { value: defaultSettings.speed },
    uWindTurbulence: { value: defaultSettings.turbulence },
    uWindDir: { value: new THREE.Vector2(Math.cos(0.785398), Math.sin(0.785398)) }, // 45 deg default
    uWindEnabled: { value: 1.0 }
  };

  class WindSystem {
    constructor() {
      this.enabled = defaultSettings.enabled;
      this.strength = defaultSettings.strength;
      this.speed = defaultSettings.speed;
      this.turbulence = defaultSettings.turbulence;
      this.angle = defaultSettings.angle;

      this.uniforms = uniforms;
      this._time = 0.0;
      this._listeners = new Set();

      this.loadSettings();
      this.updateDirectionVector();
    }

    updateDirectionVector() {
      const rad = (this.angle * Math.PI) / 180.0;
      this.uniforms.uWindDir.value.set(Math.cos(rad), Math.sin(rad));
    }

    setStrength(val) {
      this.strength = Math.max(0.0, Math.min(2.0, parseFloat(val) || 0.0));
      this.uniforms.uWindStrength.value = this.strength;
      this._notifyChange();
    }

    setSpeed(val) {
      this.speed = Math.max(0.1, Math.min(3.0, parseFloat(val) || 1.0));
      this.uniforms.uWindSpeed.value = this.speed;
      this._notifyChange();
    }

    setTurbulence(val) {
      this.turbulence = Math.max(0.0, Math.min(2.0, parseFloat(val) || 0.0));
      this.uniforms.uWindTurbulence.value = this.turbulence;
      this._notifyChange();
    }

    setAngle(val) {
      this.angle = ((parseFloat(val) || 0.0) % 360 + 360) % 360;
      this.updateDirectionVector();
      this._notifyChange();
    }

    setEnabled(val) {
      this.enabled = !!val;
      this.uniforms.uWindEnabled.value = this.enabled ? 1.0 : 0.0;
      this._notifyChange();
    }

    resetDefaults() {
      this.enabled = defaultSettings.enabled;
      this.strength = defaultSettings.strength;
      this.speed = defaultSettings.speed;
      this.turbulence = defaultSettings.turbulence;
      this.angle = defaultSettings.angle;

      this.uniforms.uWindStrength.value = this.strength;
      this.uniforms.uWindSpeed.value = this.speed;
      this.uniforms.uWindTurbulence.value = this.turbulence;
      this.uniforms.uWindEnabled.value = this.enabled ? 1.0 : 0.0;
      this.updateDirectionVector();

      this.saveSettings();
      this._notifyChange();
    }

    onChange(fn) {
      if (typeof fn === 'function') this._listeners.add(fn);
    }

    offChange(fn) {
      this._listeners.delete(fn);
    }

    _notifyChange() {
      this._listeners.forEach(fn => {
        try { fn(this); } catch (e) { console.error('[WindSystem] listener error:', e); }
      });
    }

    update(dt) {
      if (!this.enabled || this.strength <= 0.0001) {
        this.uniforms.uWindEnabled.value = 0.0;
        return;
      }
      this.uniforms.uWindEnabled.value = 1.0;
      this._time += (dt || 0.016) * this.speed;
      this.uniforms.uWindTime.value = this._time;
      this.uniforms.uWindStrength.value = this.strength;
      this.uniforms.uWindSpeed.value = this.speed;
      this.uniforms.uWindTurbulence.value = this.turbulence;
    }

    loadSettings(explicit) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const cfg = JSON.parse(raw);
          if (cfg) {
            if (cfg.enabled !== undefined) this.enabled = !!cfg.enabled;
            if (cfg.strength !== undefined) this.strength = parseFloat(cfg.strength) || defaultSettings.strength;
            if (cfg.speed !== undefined) this.speed = parseFloat(cfg.speed) || defaultSettings.speed;
            if (cfg.turbulence !== undefined) this.turbulence = parseFloat(cfg.turbulence) || defaultSettings.turbulence;
            if (cfg.angle !== undefined) this.angle = parseFloat(cfg.angle) || defaultSettings.angle;
          }
        }
      } catch (e) {}

      if (window.EDITOR_OVERRIDES_DATA && window.EDITOR_OVERRIDES_DATA.windSettings) {
        const w = window.EDITOR_OVERRIDES_DATA.windSettings;
        if (w.enabled !== undefined) this.enabled = !!w.enabled;
        if (w.strength !== undefined) this.strength = parseFloat(w.strength);
        if (w.speed !== undefined) this.speed = parseFloat(w.speed);
        if (w.turbulence !== undefined) this.turbulence = parseFloat(w.turbulence);
        if (w.angle !== undefined) this.angle = parseFloat(w.angle);
      }
      // Явно переданные настройки (снапшот редактора / undo) имеют приоритет.
      if (explicit && typeof explicit === 'object') {
        const w = explicit;
        if (w.enabled !== undefined) this.enabled = !!w.enabled;
        if (w.strength !== undefined) this.strength = parseFloat(w.strength);
        if (w.speed !== undefined) this.speed = parseFloat(w.speed);
        if (w.turbulence !== undefined) this.turbulence = parseFloat(w.turbulence);
        if (w.angle !== undefined) this.angle = parseFloat(w.angle);
      }

      this.uniforms.uWindStrength.value = this.strength;
      this.uniforms.uWindSpeed.value = this.speed;
      this.uniforms.uWindTurbulence.value = this.turbulence;
      this.uniforms.uWindEnabled.value = this.enabled ? 1.0 : 0.0;
      this.updateDirectionVector();
    }

    saveSettings() {
      const snap = {
        enabled: this.enabled,
        strength: this.strength,
        speed: this.speed,
        turbulence: this.turbulence,
        angle: this.angle
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
      } catch (e) {}

      if (window.EDITOR_OVERRIDES_DATA) {
        window.EDITOR_OVERRIDES_DATA.windSettings = snap;
      }
      return snap;
    }

    /**
     * Injects GPU wind sway vertex shader into a Three.js material.
     * @param {THREE.Material} material 
     * @param {string} foliageType - 'tree', 'bush', 'flower', 'grass'
     */
    applyWindToMaterial(material, foliageType = 'bush') {
      if (!material || !material.isMaterial) return material;
      // Only skip if already truly applied on THIS material instance
      if (material._windShaderApplied && typeof material.onBeforeCompile === 'function') {
        return material;
      }

      material.userData = material.userData || {};
      material.userData.hasWindShader = true;
      material.userData.foliageType = foliageType;
      material._windShaderApplied = true;

      // Unique program cache key in Three.js so onBeforeCompile is compiled per foliage type
      material.customProgramCacheKey = () => 'wind_shader_v3_' + foliageType;

      let swayCoeff = 0.08;
      let flutterCoeff = 0.04;

      if (foliageType === 'tree') {
        swayCoeff = 0.08;
        flutterCoeff = 0.035;
      } else if (foliageType === 'trunk') {
        swayCoeff = 0.04;
        flutterCoeff = 0.0;
      } else if (foliageType === 'flower' || foliageType === 'poppy') {
        swayCoeff = 0.10;
        flutterCoeff = 0.025;
      } else if (foliageType === 'grass' || foliageType === 'pratia') {
        swayCoeff = 0.08;
        flutterCoeff = 0.04;
      } else if (foliageType === 'bush') {
        swayCoeff = 0.07;
        flutterCoeff = 0.025;
      }

      const origOnBeforeCompile = material.onBeforeCompile;

      material.onBeforeCompile = (shader, renderer) => {
        if (typeof origOnBeforeCompile === 'function') {
          origOnBeforeCompile(shader, renderer);
        }

        // Link global uniforms
        shader.uniforms.uWindTime = uniforms.uWindTime;
        shader.uniforms.uWindStrength = uniforms.uWindStrength;
        shader.uniforms.uWindSpeed = uniforms.uWindSpeed;
        shader.uniforms.uWindTurbulence = uniforms.uWindTurbulence;
        shader.uniforms.uWindDir = uniforms.uWindDir;
        shader.uniforms.uWindEnabled = uniforms.uWindEnabled;

        // Vertex shader header injections
        const windHeader = `
          uniform float uWindTime;
          uniform float uWindStrength;
          uniform float uWindSpeed;
          uniform float uWindTurbulence;
          uniform vec2 uWindDir;
          uniform float uWindEnabled;
        `;

        shader.vertexShader = windHeader + '\n' + shader.vertexShader;

        // Vertex transformation injection:
        // Projects world wind vector onto model's local coordinate axes (supporting rotated instances!)
        // Normalizes height to world space meters to prevent unscaled FBX models (e.g. 500 units tall)
        // from swaying 50x too violently or fluttering into static.
        const windChunk = `
          #include <begin_vertex>

          if (uWindEnabled > 0.5 && uWindStrength > 0.0005) {
            #if defined(USE_INSTANCING)
              vec4 _instWPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
              vec2 _wXZ = _instWPos.xz;
              float _scaleY = length(instanceMatrix[1].xyz);
              vec3 _worldWind = vec3(uWindDir.x, 0.0, uWindDir.y);
              vec3 _axisX = normalize(instanceMatrix[0].xyz);
              vec3 _axisZ = normalize(instanceMatrix[2].xyz);
              vec3 _localWind = vec3(dot(_axisX, _worldWind), 0.0, dot(_axisZ, _worldWind));
            #else
              vec4 _mWorldPos = modelMatrix * vec4(position, 1.0);
              vec2 _wXZ = _mWorldPos.xz;
              float _scaleY = length(modelMatrix[1].xyz);
              vec3 _worldWind = vec3(uWindDir.x, 0.0, uWindDir.y);
              vec3 _axisX = normalize(modelMatrix[0].xyz);
              vec3 _axisZ = normalize(modelMatrix[2].xyz);
              vec3 _localWind = vec3(dot(_axisX, _worldWind), 0.0, dot(_axisZ, _worldWind));
            #endif

            float _effectiveScaleY = max(0.0001, _scaleY);
            float _worldH = max(0.0, position.y) * _effectiveScaleY;
            _worldH = min(_worldH, 20.0);

            if (_worldH > 0.05) {
              // Coherent spatial wave across world space
              float _phase = dot(_wXZ, uWindDir * 0.06) + uWindTime * 1.8;
              float _mainWave = sin(_phase) + sin(_phase * 0.43 + 0.8) * 0.3;

              // Flutter on leaves/branches (uses coherent phase + subtle local variation)
              float _flutter = sin(_phase * 2.6 + dot(position.xz * _effectiveScaleY * 0.25, vec2(1.2, -0.9))) * uWindTurbulence;

              // Scale displacement in world meters, then convert back to model's local coordinates
              float _swayMeters = (_mainWave * ${swayCoeff.toFixed(3)} + _flutter * ${flutterCoeff.toFixed(3)}) * uWindStrength * _worldH;
              float _swayLocal = _swayMeters / _effectiveScaleY;

              transformed.x += _localWind.x * _swayLocal;
              transformed.z += _localWind.z * _swayLocal;

              // Physical stem preservation
              transformed.y -= abs(_swayLocal) * 0.04;
            }
          }
        `;

        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', windChunk);
      };

      material.needsUpdate = true;
      return material;
    }

    /**
     * Traverses a Three.js scene or object and ensures wind is applied to all organic foliage meshes.
     * @param {THREE.Object3D} root 
     */
    applyWindToScene(root) {
      if (!root || !root.traverse) return;
      root.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const name = (obj.name || '').toLowerCase();
        const parentName = (obj.parent && obj.parent.name ? obj.parent.name : '').toLowerCase();
        const isNonFoliage = /rock|stone|boulder|house|forge|building|wall|shop|market|stall|tent|fence|barrier|barrel|crate|plank|wood|stump|log|mannequin|statue|monument|bench|chapel|boiler|airship|tp_zone/i.test(name) || /rock|stone|boulder|house|forge|building|wall|shop|market|stall|tent|fence|barrier|barrel|crate|plank|wood|stump|log|mannequin|statue|monument|bench|chapel|boiler|airship|tp_zone/i.test(parentName);
        if (isNonFoliage) return;

        const isTree = /tree|spruce|pine/i.test(name) || /tree|spruce|pine/i.test(parentName);
        const isFlower = /poppy|flower/i.test(name) || /poppy|flower/i.test(parentName);
        const isGrass = /grass|pratia/i.test(name) || /grass|pratia/i.test(parentName);
        const isBush = /bush|fern|plant|foliage|branch|leaf|leaves/i.test(name) || /bush|fern|plant|foliage|branch|leaf|leaves/i.test(parentName);

        if (isTree || isFlower || isGrass || isBush) {
          let folType = 'bush';
          if (isTree) folType = 'tree';
          else if (isFlower) folType = 'flower';
          else if (isGrass) folType = 'grass';

          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => this.applyWindToMaterial(m, folType));
          } else {
            this.applyWindToMaterial(obj.material, folType);
          }
        }
      });
    }
  }

  window.WindSystem = new WindSystem();
})();
