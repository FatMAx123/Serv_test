// ============================================================
//  WATER.JS — простой целый океан.
//  Большая плоскость на SEA. Вырез суши по heightmap террейна.
//  Камеру НЕ трогает. Координаты: мир XZ, Y = Terrain.seaLevel.
// ============================================================
(function () {
  'use strict';
  var THREE = window.THREE;
  var WD = window.WaterData;
  var WM = window.WorldMetrics;

  var waterRoot = null;
  var waterMesh = null;
  var waterMat = null;
  var hTex = null;
  var n0 = null;
  var n1 = null;

  function seaY() {
    if (window.Terrain && typeof window.Terrain.seaLevel === 'number') return window.Terrain.seaLevel;
    return -35.0;
  }

  // bounds heightmap = terrain data (остров)
  function terrainBounds() {
    var TD = window.TerrainData;
    if (TD && isFinite(TD.minX)) {
      return { minX: TD.minX, minZ: TD.minZ, W: TD.maxX - TD.minX, H: TD.maxZ - TD.minZ };
    }
    if (WM) return { minX: WM.MIN_X, minZ: WM.MIN_Z, W: WM.W, H: WM.H };
    return { minX: -2000, minZ: -2000, W: 4000, H: 4000 };
  }

  var SRGB = 'vec3 srgbE(vec3 c){return mix(pow(c*1.055,vec3(1.0/2.4))-vec3(0.055),c*12.92,lessThan(c,vec3(0.0031308)));}';
  var NOISE = [
    'float w_hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float w_vnoise(vec2 p){vec2 i=floor(p),f=fract(p);float a=w_hash(i),b=w_hash(i+vec2(1,0)),c=w_hash(i+vec2(0,1)),d=w_hash(i+vec2(1,1));vec2 u=f*f*(3.0-2.0*f);return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}',
    'float w_fbm(vec2 p){float s=0.0,a=0.5;for(int i=0;i<4;i++){s+=a*w_vnoise(p);p*=2.1;a*=0.5;}return s;}'
  ].join('\n');

  // нойз-рельеф воды в VS (hash/value noise, не только sin-волны)
  var oceanVS = [
    'uniform float time;',
    'varying vec3 vW; varying vec3 vN; varying float vCrest; varying vec2 vUv;',
    'float hsh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float vn(vec2 p){vec2 i=floor(p),f=fract(p);float a=hsh(i),b=hsh(i+vec2(1,0)),c=hsh(i+vec2(0,1)),d=hsh(i+vec2(1,1));vec2 u=f*f*(3.0-2.0*f);return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}',
    'float fbmH(vec2 p){float s=0.0,a=0.5;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.05+vec2(1.7,9.2);a*=0.5;}return s;}',
    'void main(){',
    '  vec3 P = position;',
    '  vec2 xz = P.xz;',
    // --- лёгкий нойз-рельеф + спокойные волны ---
    '  float nA = fbmH(xz * 0.04 + vec2(time * 0.08, time * 0.06));',
    '  float nB = fbmH(xz * 0.10 + vec2(-time * 0.12, time * 0.09) + 13.7);',
    '  float relief = (nA * 0.6 + nB * 0.4) * 2.0 - 1.0;',
    '  float w = sin(dot(xz, vec2(0.02,0.015)) - time*0.85)*0.14;',
    '  w += sin(dot(xz, vec2(-0.017,0.024)) - time*1.1)*0.09;',
    '  float h = relief * 0.28 + w;',
    '  P.y += h; vCrest = h;',
    '  float e = 0.4;',
    '  float hx = ((fbmH((xz+vec2(e,0.0))*0.04+vec2(time*0.08,time*0.06))*0.6',
    '            + fbmH((xz+vec2(e,0.0))*0.10+vec2(-time*0.12,time*0.09)+13.7)*0.4)*2.0-1.0)*0.28',
    '            + sin(dot(xz+vec2(e,0.0),vec2(0.02,0.015))-time*0.85)*0.14',
    '            + sin(dot(xz+vec2(e,0.0),vec2(-0.017,0.024))-time*1.1)*0.09;',
    '  float hz = ((fbmH((xz+vec2(0.0,e))*0.04+vec2(time*0.08,time*0.06))*0.6',
    '            + fbmH((xz+vec2(0.0,e))*0.10+vec2(-time*0.12,time*0.09)+13.7)*0.4)*2.0-1.0)*0.28',
    '            + sin(dot(xz+vec2(0.0,e),vec2(0.02,0.015))-time*0.85)*0.14',
    '            + sin(dot(xz+vec2(0.0,e),vec2(-0.017,0.024))-time*1.1)*0.09;',
    '  vec3 N = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));',
    '  vec4 wp = modelMatrix * vec4(P,1.0);',
    '  vW = wp.xyz; vN = normalize(mat3(modelMatrix)*N); vUv = uv;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  var oceanFS = [
    'precision highp float;', SRGB, NOISE,
    'uniform float time, sea, uHMin, uHMax, uNight;',
    'uniform sampler2D uN0, uN1, uH;',
    'uniform vec3 uSun, uSunCol, uSkyT, uSkyH, uCam;',
    'uniform vec3 uFogColor; uniform float uFogNear, uFogFar;',
    'uniform vec2 uWMin, uWSize;',
    'varying vec3 vW; varying vec3 vN; varying float vCrest; varying vec2 vUv;',
    // Небо в отражении: ночь — почти чёрное, без светящегося горизонта
    'vec3 skyColor(vec3 dir){',
    '  float t=clamp(dir.y*0.5+0.5,0.0,1.0);',
    '  vec3 s=mix(uSkyH,uSkyT,pow(t,0.55));',
    '  float sunDisk=pow(max(dot(normalize(dir),uSun),0.0), mix(48.0, 120.0, uNight));',
    '  // днём блик солнца; ночью — крошечный лунный, не заливает горизонт',
    '  s+=uSunCol*sunDisk*mix(1.15, 0.12, uNight);',
    '  // ночь: давим и топ, и горизонт в чернильный тон',
    '  vec3 ink=vec3(0.004,0.006,0.012);',
    '  s=mix(s, ink, uNight*0.97);',
    '  // чуть лунного цвета у zenith reflection, не у горизонта',
    '  s+=uSunCol*pow(max(dir.y,0.0),3.0)*uNight*0.06;',
    '  return s;',
    '}',
    'void main(){',
    '  float waterY = sea;',
    '  vec2 uvW = (vW.xz - uWMin) / uWSize;',
    '  float landH;',
    '  if(uvW.x<0.0||uvW.x>1.0||uvW.y<0.0||uvW.y>1.0){',
    '    landH = waterY - 50.0;',
    '  } else {',
    '    float hn = texture2D(uH, clamp(uvW,0.0,1.0)).r;',
    '    landH = uHMin + hn*(uHMax-uHMin);',
    '  }',
    '  if(landH > waterY + 0.6) discard;',

    '  vec2 uv0 = vW.xz * 0.015 + vec2( time*0.014,  time*0.010);',
    '  vec2 uv1 = vW.xz * 0.032 + vec2(-time*0.018,  time*0.012);',
    '  vec2 r0 = texture2D(uN0, uv0).rg * 2.0 - 1.0;',
    '  vec2 r1 = texture2D(uN1, uv1).rg * 2.0 - 1.0;',
    '  vec2 rip = r0 * 0.45 + r1 * 0.35;',
    '  vec3 N = normalize(vec3(vN.x + rip.x * 0.28, max(vN.y, 0.35), vN.z + rip.y * 0.28));',

    '  vec3 V = normalize(uCam - vW);',
    '  float depth = max(0.0, waterY - landH);',
    '  float shore = 1.0 - smoothstep(0.0, 5.0, depth);',
    '  vec3 bodyDay = mix(vec3(0.04,0.16,0.24), vec3(0.02,0.08,0.14), smoothstep(0.0,20.0,depth));',
    '  bodyDay = mix(bodyDay, vec3(0.12,0.26,0.28), shore*0.45);',
    '  vec3 bodyNight = mix(vec3(0.008,0.014,0.022), vec3(0.003,0.006,0.012), smoothstep(0.0,20.0,depth));',
    '  bodyNight = mix(bodyNight, vec3(0.012,0.018,0.028), shore*0.18);',
    '  vec3 body = mix(bodyDay, bodyNight, uNight);',
    '  vec3 R = reflect(-V, N);',
    // Fresnel слабее ночью — нет «зеркальной полосы» горизонта
    '  float F = 0.04 + 0.96*pow(1.0-max(dot(N,V),0.0),5.0);',
    '  F *= mix(1.0, 0.18, uNight);',
    '  vec3 lin = mix(body, skyColor(R), F);',
    '  float spec = pow(max(dot(N, normalize(uSun+V)),0.0), mix(48.0, 110.0, uNight));',
    '  lin += uSunCol * spec * mix(0.65, 0.10, uNight);',

    '  float nFoam = w_fbm(vW.xz * 1.8 + time * 0.12);',
    '  float foamBand = 1.0 - smoothstep(0.0, 2.8, depth);',
    '  float foam = foamBand * (0.35 + 0.45 * nFoam);',
    '  foam += smoothstep(0.28, 0.48, abs(vCrest)) * 0.18 * (1.0 - shore * 0.4);',
    '  foam = clamp(foam, 0.0, 0.7) * mix(1.0, 0.15, uNight);',
    '  vec3 foamCol = mix(vec3(0.90, 0.94, 0.97), vec3(0.25, 0.30, 0.38), uNight);',
    '  lin = mix(lin, foamCol, foam * 0.55);',

    '  float fogF = smoothstep(uFogNear, uFogFar, length(uCam-vW));',
    // ночной fog почти чёрный — не поднимает яркость горизонта
    '  vec3 fogCol = mix(uFogColor, vec3(0.004,0.006,0.01), uNight*0.95);',
    '  lin = mix(lin, fogCol, fogF*mix(0.75, 0.97, uNight));',
    '  gl_FragColor = vec4(srgbE(lin), 1.0);',
    '}'
  ].join('\n');

  // ---- Реки (window.RiverData, scripts/operators-territory/river.js) ----
  // Плоская лента по тальвегу: уровень воды падает по течению, края уходят под берег.
  // aDepth (уровень − земля) в вершинах даёт мягкую кромку, пену у берега и цвет глубины.
  var riverVS = [
    'attribute float aDepth; attribute vec2 aFlow;',
    'varying vec3 vW; varying float vDepth; varying vec2 vFlow;',
    'void main(){',
    '  vec4 wp = modelMatrix * vec4(position,1.0);',
    '  vW = wp.xyz; vDepth = aDepth; vFlow = aFlow;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  var riverFS = [
    'precision highp float;', SRGB, NOISE,
    'uniform float time, uNight;',
    'uniform sampler2D uN0, uN1;',
    'uniform vec3 uSun, uSunCol, uSkyT, uSkyH, uCam;',
    'uniform vec3 uFogColor; uniform float uFogNear, uFogFar;',
    'varying vec3 vW; varying float vDepth; varying vec2 vFlow;',
    'void main(){',
    '  float depth = vDepth;',
    '  if (depth < -0.05) discard;',
    // течение: рябь бежит вдоль ленты (vFlow.y — метры по течению), поперёк — vFlow.x
    '  vec2 f0 = vec2(vFlow.x * 0.055, vFlow.y * 0.030 - time * 0.21);',
    '  vec2 f1 = vec2(vFlow.x * 0.090 + 0.37, vFlow.y * 0.062 - time * 0.39);',
    '  vec2 r0 = texture2D(uN0, f0).rg * 2.0 - 1.0;',
    '  vec2 r1 = texture2D(uN1, f1).rg * 2.0 - 1.0;',
    '  vec2 rip = r0 * 0.55 + r1 * 0.45;',
    '  vec3 N = normalize(vec3(rip.x * 0.30, 1.0, rip.y * 0.30));',
    '  vec3 V = normalize(uCam - vW);',
    '  float t = clamp(depth / 0.9, 0.0, 1.0);',
    '  float tDeep = smoothstep(1.0, 6.0, depth);',
    // мутная вода после аварии: у берега — илисто-оливковая, на стрежне — тёмная бирюза
    '  vec3 bodyDay = mix(vec3(0.15,0.17,0.11), vec3(0.03,0.075,0.08), smoothstep(0.05, 0.85, t));',
    '  bodyDay = mix(bodyDay, vec3(0.012,0.045,0.055), tDeep);',
    '  vec3 bodyNight = mix(vec3(0.012,0.016,0.014), vec3(0.004,0.008,0.012), t);',
    '  vec3 body = mix(bodyDay, bodyNight, uNight);',
    '  vec3 R = reflect(-V, N);',
    '  float sky_t = clamp(R.y*0.5+0.5,0.0,1.0);',
    '  vec3 sky = mix(uSkyH, uSkyT, pow(sky_t,0.55)) * 0.78;',
    '  sky = mix(sky, vec3(0.004,0.006,0.012), uNight*0.95);',
    // мутная речная вода отражает слабее моря: без «молочной» плёнки на скользящих углах
    '  float F = 0.02 + 0.55*pow(1.0-max(dot(N,V),0.0),5.0);',
    '  F *= mix(0.9, 0.18, uNight);',
    '  vec3 lin = mix(body, sky, F);',
    '  float spec = pow(max(dot(N, normalize(uSun+V)),0.0), mix(60.0, 120.0, uNight));',
    '  lin += uSunCol * spec * mix(0.55, 0.08, uNight);',
    // пена: кромка берега + полосы на перекатах
    '  float nF = w_fbm(vec2(vFlow.x * 0.35, vFlow.y * 0.22 - time * 0.9));',
    '  float foam = (1.0 - smoothstep(0.02, 0.20, depth)) * (0.30 + 0.50 * nF);',
    '  foam += smoothstep(0.62, 0.86, nF) * 0.16 * (1.0 - t * 0.6);',
    '  foam = clamp(foam, 0.0, 0.65) * mix(1.0, 0.12, uNight);',
    '  lin = mix(lin, mix(vec3(0.86,0.88,0.82), vec3(0.22,0.26,0.30), uNight), foam * 0.5);',
    '  float fogF = smoothstep(uFogNear, uFogFar, length(uCam-vW));',
    '  vec3 fogCol = mix(uFogColor, vec3(0.004,0.006,0.01), uNight*0.95);',
    '  lin = mix(lin, fogCol, fogF*mix(0.75, 0.97, uNight));',
    '  float alpha = mix(0.0, 0.95, smoothstep(-0.02, 0.26, depth));',
    '  alpha = max(alpha, foam * 0.8);',
    '  gl_FragColor = vec4(srgbE(lin), alpha);',
    '}'
  ].join('\n');

  var riverRoot = null;
  var riverMat = null;
  var RIVER_CROSS = 15;    // вершин поперёк: мягкая кромка по aDepth и на широком озере
  var RIVER_CHUNK = 40;    // точек на кусок (~240 м): отсечение по фрустуму без лишних draw call

  function buildRivers(scene) {
    var RD = window.RiverData;
    if (!RD || !RD.rivers || !RD.rivers.length || !waterMat) return;
    // глубина по мешу рельефа (сетка bakedHeights 14 м слишком груба для кромки воды)
    var THm = window.TerrainHeight;
    var hRaw = (window.Terrain && window.Terrain.heightAtRaw) || (window.Terrain && window.Terrain.heightAt);
    var hAt = function (x, z) {
      var y = (THm && THm.groundY) ? THm.groundY(x, z, 600, 1200) : null;
      return (y == null || !isFinite(y)) ? (hRaw ? hRaw(x, z) : -999) : y;
    };
    if (!THm && !hRaw) return;
    var wu = waterMat.uniforms;
    // те же объекты uniform, что у океана: update()/setAtmosphere() ведут и реку
    riverMat = new THREE.ShaderMaterial({
      uniforms: {
        time: wu.time, uNight: wu.uNight, uN0: wu.uN0, uN1: wu.uN1,
        uSun: wu.uSun, uSunCol: wu.uSunCol, uSkyT: wu.uSkyT, uSkyH: wu.uSkyH, uCam: wu.uCam,
        uFogColor: wu.uFogColor, uFogNear: wu.uFogNear, uFogFar: wu.uFogFar
      },
      vertexShader: riverVS,
      fragmentShader: riverFS,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide
    });
    riverRoot = new THREE.Group();
    riverRoot.name = 'RiverRoot';
    var K = RIVER_CROSS;
    for (var ri = 0; ri < RD.rivers.length; ri++) {
      var pts = RD.rivers[ri].pts;
      if (!pts || pts.length < 2) continue;
      var dist = [0];
      for (var i = 1; i < pts.length; i++) dist.push(dist[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      for (var c0 = 0; c0 < pts.length - 1; c0 += RIVER_CHUNK) {
        var c1 = Math.min(pts.length - 1, c0 + RIVER_CHUNK);
        var rows = c1 - c0 + 1;
        var pos = new Float32Array(rows * K * 3);
        var dep = new Float32Array(rows * K);
        var flow = new Float32Array(rows * K * 2);
        for (var r = 0; r < rows; r++) {
          var j = c0 + r;
          var p = pts[j];
          var q = pts[Math.min(pts.length - 1, j + 1)], o = pts[Math.max(0, j - 1)];
          var tx = q[0] - o[0], tz = q[1] - o[1], tl = Math.hypot(tx, tz) || 1;
          var nx = tz / tl, nz = -tx / tl;   // вправо по течению
          for (var k = 0; k < K; k++) {
            var u = k / (K - 1);
            var off = -p[3] + (p[3] + p[4]) * u;
            var x = p[0] + nx * off, z = p[1] + nz * off;
            var vi = r * K + k;
            pos[vi * 3] = x; pos[vi * 3 + 1] = p[2]; pos[vi * 3 + 2] = z;
            var dh = p[2] - hAt(x, z);
            dep[vi] = Math.max(-1.0, Math.min(3.0, dh));
            flow[vi * 2] = off; flow[vi * 2 + 1] = dist[j];
          }
        }
        var idx = [];
        for (var r2 = 0; r2 < rows - 1; r2++) {
          for (var k2 = 0; k2 < K - 1; k2++) {
            var a = r2 * K + k2, b = a + 1, cc = a + K, d = cc + 1;
            // лента идёт по течению, вправо — +k: обход против часовой сверху
            idx.push(a, cc, b, b, cc, d);
          }
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
        geo.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2));
        geo.setIndex(idx);
        geo.computeBoundingSphere();
        var mesh = new THREE.Mesh(geo, riverMat);
        mesh.name = 'RiverChunk_' + ri + '_' + c0;
        mesh.renderOrder = 2;
        mesh.matrixAutoUpdate = false;
        riverRoot.add(mesh);
      }
    }
    // водопады (раструб водовода → озеро): вертикальная лента, рябь бежит вниз
    for (var fr = 0; fr < RD.rivers.length; fr++) {
      var falls = RD.rivers[fr].falls || [];
      for (var fi = 0; fi < falls.length; fi++) {
        var fl = falls[fi];
        var topY = fl.top != null ? fl.top : hAt(fl.x - fl.dx * 1.2, fl.z - fl.dz * 1.2) + 0.9;
        var botY = fl.bottom;
        if (!(topY > botY + 0.3)) continue;
        var ox = -fl.dz * fl.w * 0.5, oz = fl.dx * fl.w * 0.5;
        var ROWS = 6, fpos = [], fdep = [], fflow = [], fidx = [];
        for (var rr = 0; rr <= ROWS; rr++) {
          var tt = rr / ROWS;
          // струя отходит от стены и падает по дуге
          var out = 0.4 + 1.8 * tt * tt;
          var yy = topY + (botY - topY) * tt;
          var cx = fl.x + fl.dx * out, cz = fl.z + fl.dz * out;
          fpos.push(cx - ox, yy, cz - oz, cx + ox, yy, cz + oz);
          fdep.push(2.0, 2.0);
          fflow.push(-fl.w * 0.5, (topY - yy) * 3.0, fl.w * 0.5, (topY - yy) * 3.0);
          if (rr < ROWS) { var b0 = rr * 2; fidx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3, b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2); }
        }
        var fg = new THREE.BufferGeometry();
        fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
        fg.setAttribute('aDepth', new THREE.Float32BufferAttribute(fdep, 1));
        fg.setAttribute('aFlow', new THREE.Float32BufferAttribute(fflow, 2));
        fg.setIndex(fidx);
        fg.computeBoundingSphere();
        var fm = new THREE.Mesh(fg, riverMat);
        fm.name = 'RiverFall_' + fr + '_' + fi;
        fm.renderOrder = 3;
        riverRoot.add(fm);
      }
    }
    scene.add(riverRoot);
    console.log('[Water] rivers:', riverRoot.children.length, 'chunks');
  }

  function hash2(x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, y) {
    var s = 0, a = 0.5, f = 1, i;
    for (i = 0; i < 4; i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; }
    return s;
  }
  function genNormalTex(size, freq, seed) {
    var h = new Float32Array(size * size), x, y;
    for (y = 0; y < size; y++)
      for (x = 0; x < size; x++)
        h[y * size + x] = fbm((x / size) * freq + seed, (y / size) * freq + seed * 1.7);
    var data = new Uint8Array(size * size * 4);
    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) {
        var xl = h[y * size + ((x - 1 + size) % size)];
        var xr = h[y * size + ((x + 1) % size)];
        var yu = h[((y - 1 + size) % size) * size + x];
        var yd = h[((y + 1) % size) * size + x];
        var nx = -(xr - xl) * 2.5, ny = 2.0, nz = -(yd - yu) * 2.5;
        var inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        var i = (y * size + x) * 4;
        data[i] = (nx * inv * 0.5 + 0.5) * 255;
        data[i + 1] = (nz * inv * 0.5 + 0.5) * 255;
        data[i + 2] = (ny * inv * 0.5 + 0.5) * 255;
        data[i + 3] = 255;
      }
    }
    var tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  function genHeightTex(res) {
    var b = terrainBounds();
    var sea = seaY();
    var hAt = (window.Terrain && window.Terrain.heightAtRaw) || (window.Terrain && window.Terrain.heightAt) || function () { return sea - 30; };
    var grid = new Float32Array(res * res);
    var hMin = 1e9, hMax = -1e9, ix, iz;
    for (iz = 0; iz < res; iz++) {
      for (ix = 0; ix < res; ix++) {
        var x = b.minX + (ix / (res - 1)) * b.W;
        var z = b.minZ + (iz / (res - 1)) * b.H;
        var hv = hAt(x, z);
        // void −308 → глубокое море, без полос
        if (hv < sea - 80) hv = sea - 40;
        grid[iz * res + ix] = hv;
        if (hv < hMin) hMin = hv;
        if (hv > hMax) hMax = hv;
      }
    }
    hMin = Math.min(hMin, sea - 40);
    hMax = Math.max(hMax, sea + 30);
    var span = Math.max(1e-3, hMax - hMin);
    var data = new Uint8Array(res * res * 4);
    for (iz = 0; iz < res; iz++) {
      for (ix = 0; ix < res; ix++) {
        var i = iz * res + ix;
        var v = Math.max(0, Math.min(255, ((grid[i] - hMin) / span) * 255));
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
        data[i * 4 + 3] = 255;
      }
    }
    var tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    tex.userData = { hMin: hMin, hMax: hMax, bounds: b };
    return tex;
  }

  function build(scene) {
    if (!scene || !THREE) return;

    n0 = genNormalTex(256, 5.5, 1.7);
    n1 = genNormalTex(256, 9.0, 9.3);
    hTex = genHeightTex(256);
    var b = hTex.userData.bounds;
    var ud = hTex.userData;
    var sea = seaY();
    var fog = (window.game && window.game.scene && window.game.scene.fog) || null;

    waterMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        sea: { value: sea },
        uHMin: { value: ud.hMin },
        uHMax: { value: ud.hMax },
        uN0: { value: n0 },
        uN1: { value: n1 },
        uH: { value: hTex },
        uWMin: { value: new THREE.Vector2(b.minX, b.minZ) },
        uWSize: { value: new THREE.Vector2(b.W, b.H) },
        uSun: { value: new THREE.Vector3(0.4, 0.5, 0.3).normalize() },
        uSunCol: { value: new THREE.Color(0xfff0d0) },
        uSkyT: { value: new THREE.Color(0x5a9ec8) },
        uSkyH: { value: new THREE.Color(0xd4b896) },
        uCam: { value: new THREE.Vector3(0, 40, 40) },
        uFogColor: { value: fog ? fog.color.clone() : new THREE.Color(0xc0c8cc) },
        uFogNear: { value: fog ? fog.near : 140 },
        uFogFar: { value: fog ? fog.far : 2400 },
        uNight: { value: 0.0 }
      },
      vertexShader: oceanVS,
      fragmentShader: oceanFS,
      transparent: false,
      depthWrite: true,
      side: THREE.FrontSide
    });

    // целая большая плоскость (не рваный FBX 16 verts)
    var size = 12000;
    // плотнее сетка — нойз-рельеф в VS читается
    var geo = new THREE.PlaneGeometry(size, size, 192, 192);
    geo.rotateX(-Math.PI / 2);

    waterMesh = new THREE.Mesh(geo, waterMat);
    waterMesh.name = 'OceanPlane';
    waterMesh.frustumCulled = false;
    waterMesh.renderOrder = 1;
    waterMesh.userData = waterMesh.userData || {};
    waterMesh.userData.editorKey = 'water';
    waterMesh.userData.editorLabel = 'Океан';

    waterRoot = new THREE.Group();
    waterRoot.name = 'WaterRoot';
    waterRoot.userData = waterRoot.userData || {};
    waterRoot.userData.editorKey = 'water_root';
    waterRoot.position.set(0, sea, 0);
    waterRoot.add(waterMesh);
    scene.add(waterRoot);

    console.log('[Water] solid ocean plane', size, 'at SEA', sea);
    try { buildRivers(scene); } catch (eRiver) { console.warn('[Water] rivers:', eRiver && eRiver.message); }
  }

  function update(t) {
    if (!waterMat || !waterMat.uniforms) return;
    var u = waterMat.uniforms;
    u.time.value = t;
    if (waterRoot) u.sea.value = waterRoot.position.y;
    var game = window.game;
    if (game && game.camera) {
      game.camera.getWorldPosition(u.uCam.value);
    }
    // Направление светила: ночью — луна (dayNight), днём — солнце
    var dn = game && game.dayNight;
    if (dn && dn._sunDir && dn._moonDir) {
      var night = (typeof dn._lastNight === 'number') ? dn._lastNight : 0;
      if (night > 0.45 && dn._moonDir.y > -0.05) {
        u.uSun.value.copy(dn._moonDir).normalize();
      } else {
        u.uSun.value.copy(dn._sunDir).normalize();
      }
    } else if (game && game.sun) {
      if (game.sun.target) {
        u.uSun.value.subVectors(game.sun.position, game.sun.target.position).normalize();
      } else {
        u.uSun.value.copy(game.sun.position).normalize();
      }
    }
    var fog = game && game.scene && game.scene.fog;
    if (fog) {
      u.uFogColor.value.copy(fog.color);
      u.uFogNear.value = fog.near;
      u.uFogFar.value = fog.far;
    }
  }

  /** DayNight → океан: цвет неба/светила/ночь (иначе днём-цвета = белый блин ночью) */
  function setAtmosphere(opts) {
    if (!waterMat || !waterMat.uniforms || !opts) return;
    var u = waterMat.uniforms;
    if (opts.sunDir) u.uSun.value.copy(opts.sunDir).normalize();
    if (opts.sunColor) u.uSunCol.value.copy(opts.sunColor);
    if (opts.skyTop) u.uSkyT.value.copy(opts.skyTop);
    if (opts.skyHorizon) u.uSkyH.value.copy(opts.skyHorizon);
    if (typeof opts.night === 'number') u.uNight.value = Math.max(0, Math.min(1, opts.night));
  }

  window.WaterSystem = {
    build: build,
    update: update,
    setAtmosphere: setAtmosphere,
    get mesh() { return waterMesh; },
    get root() { return waterRoot; }
  };
})();
