// ============================================================
//  RENDER-SETUP.JS — r185 пайплайн, v3.
//  Свет как на рефах L2 Talking Island: низкое тёплое солнце,
//  бирюзово-жёлтое небо, тёплая дымка вдали.
//  PMREM / scene.environment УБРАНЫ намеренно -> в сцене нет
//  источника отражений, ни один материал не блестит.
//  Небо = меш Sky (фон), вода рисует отражения своим шейдером.
// ============================================================
(function () {
  'use strict';
  function apply(renderer, scene) {
    var THREE = window.THREE;
    THREE.ColorManagement.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;          // мягко, без пересвета
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    scene.background = new THREE.Color(0x87ceeb);

    var sky = new window.THREE_SKY();
    sky.scale.setScalar(10000);
    scene.add(sky);                                // небо как фон (без envMap)
    var su = sky.material.uniforms;
    su.turbidity.value = 4.0;          // взвесь -> жёлтый горизонт (как реф)
    su.rayleigh.value = 1.0;           // бирюзово-белый верх
    su.mieCoefficient.value = 0.005;
    su.mieDirectionalG.value = 0.8;

    var sun = new THREE.Vector3();
    var elevation = 13, azimuth = 135;             // низкое тёплое солнце
    var phi = THREE.MathUtils.degToRad(90 - elevation);
    var theta = THREE.MathUtils.degToRad(azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    su.sunPosition.value.copy(sun);
    window.__SUN_DIR = sun.clone();

    // НИКАКОГО PMREM / scene.environment -> нет отражений нигде
    // THREE.Fog: скрывает подгрузку чанков террейна (DayNight крутит near/far/color)
    scene.fog = new THREE.Fog(new THREE.Color(0x87ceeb), 450, 1150);
    return { sun: sun, sky: sky, envMap: null, elevation: elevation, azimuth: azimuth };
  }
  window.RenderSetup = { apply: apply };
})();