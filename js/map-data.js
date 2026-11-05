// ============================================
//  MAP-DATA.JS  —  карта/миникарта/споты теперь берутся ИЗ
//  WorldMetrics, чтобы жить в ОДНОМ мире с terrain.js.
//  Больше никакого рассинхрона ±160 vs ±6400.
//  Координаты = абсолютные метры (центр острова = 0,0).
// ============================================
(function () {
  var WM = window.WorldMetrics;
  var bounds = WM.worldBounds();

  window.WORLD_BOUNDS = {
    minX: bounds.minX, maxX: bounds.maxX,
    minZ: bounds.minZ, maxZ: bounds.maxZ
  };
  // Споты/регионы только из editor hunt-zones (+ деревня map_world)
  if (WM.rebuildMobSpotsFromEditor) {
    var nSpots = WM.rebuildMobSpotsFromEditor();
    try { console.log('[map-data] mob spots from editor zones:', nSpots); } catch (e) {}
  }
  window.MAP_REGIONS   = WM.buildRegions();
  window.CITY_NPCS     = WM.buildCityNPCs();
  window.REGION_NPCS   = WM.buildRegionNPCs();
  window.MOB_SPOTS     = WM.buildSpots();
  window.TELEPORT_POINTS = WM.buildTeleports();
  window.MAP_HUNT_ZONES = (WM.buildHuntZones && WM.buildHuntZones()) || [];
  // бонус: данные для рендера рек/дорог на миникарте
  window.MAP_RIVERS = WM.buildRivers();
  window.MAP_ROADS  = WM.buildRoads();
  window.MAP_LAKES  = WM.buildLakes();
})();