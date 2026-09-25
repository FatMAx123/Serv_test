// ============================================================
//  TESTS / GEO-MULTITIER.TEST.JS
//  Тестирование 2.5D многоярусной геодаты (Multi-Layer GeoEngine):
//  - Проход по мостам, платформам и эстакадам над водой/оврагами
//  - Проход под мостом при наличии клиренса (сохранение на нижнем ярусе)
//  - Защита от ложного срыва по уклону (slopeOk) над перепадами рельефа
//  - Блокировка столкновений с торцами и бортами настила сбоку
//  - 3D Line of Sight с учетом настила моста
// ============================================================
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const GEO = require(path.join(ROOT, 'shared', 'geo.js'));
const PC = require(path.join(ROOT, 'client', 'js', 'props-collision.js'));
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
globalThis.WorldMetrics = WM;

module.exports = async function (t) {
  t.suite('geo-multitier: инициализация тестового окружения с мостом');

  // Создаем тестовую высотную карту с глубоким оврагом / рекой (Y = -40, ниже уровня моря SEA = -35)
  const bakedW = 10;
  const bakedH = 10;
  const bakedHeights = new Float32Array(bakedW * bakedH);
  // Заполняем высоты: берега Y = 10, овраг по центру Z [4..6] с дном Y = -40
  for (let z = 0; z < bakedH; z++) {
    for (let x = 0; x < bakedW; x++) {
      if (z >= 4 && z <= 6) {
        bakedHeights[z * bakedW + x] = -40.0; // река / овраг ниже уровня моря
      } else {
        bakedHeights[z * bakedW + x] = 10.0;  // берег
      }
    }
  }

  const testTerrainData = {
    minX: 0, maxX: 100,
    minZ: 0, maxZ: 100,
    minY: -50, maxY: 50,
    bakedW: bakedW, bakedH: bakedH,
    bakedHeights: bakedHeights,
    positions: true
  };

  // Добавляем мост через овраг: от Z = 30 до Z = 70 (центр Z = 50), настил на высоте Y = 15, толщина 1 м (top = 16)
  const bridgeProp = {
    id: 'test_wooden_bridge_01',
    modelId: 'bridge_wood_plank',
    isWalkableSurface: true,
    shape: 'box',
    collision: true,
    position: { x: 50, y: 15, z: 50 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    collisionSize: { x: 8, y: 1, z: 40 } // W=8, H=1, D=40 -> X in [46..54], Z in [30..70]
  };

  const originalProps = WM.CUSTOM_PROPS;
  WM.CUSTOM_PROPS = [bridgeProp];
  PC.invalidate();

  GEO.bind({
    TerrainData: testTerrainData,
    TerrainHeight: null,
    PropsCollision: PC,
    wallSegments: []
  });

  t.ok(GEO.ready(), 'геодата успешно инициализирована');

  // 1. Тестирование многоярусного расчета высоты standY
  t.suite('geo-multitier: многоярусный расчет высоты (standY)');
  {
    // В точке (50, 50) над оврагом:
    // Земля внизу: Y = -40
    // Настил моста: Y = 16 (15 + 1)
    const yOnBridge = GEO.standY(50, 50, 16);
    t.near(yOnBridge, 16.0, 0.01, 'персонаж на мосту получает высоту настила Y = 16');

    const yOnGround = GEO.standY(50, 50, -40);
    t.near(yOnGround, -40.0, 0.01, 'персонаж под мостом на дне оврага получает высоту земли Y = -40');
  }

  // 2. Тестирование проходимости над водой по мосту (canWalk)
  t.suite('geo-multitier: проверка проходимости (canWalk)');
  {
    // На дне оврага вода (-40 < SEA = -35) -> canWalk false
    t.eq(GEO.canWalk(50, 50, -40), false, 'на дне оврага вода (Y = -40 < SEA): проход пешком запрещен');

    // На мосту над оврагом Y = 16 -> canWalk true!
    t.eq(GEO.canWalk(50, 50, 16), true, 'на настиле моста (Y = 16): проход разрешен над водной преградой');
  }

  // 3. Тестирование уклона над перепадом рельефа (slopeOk)
  t.suite('geo-multitier: проверка уклона (slopeOk)');
  {
    // Шаг вдоль моста от Z = 40 до Z = 45 на высоте 16
    const slopeBridge = GEO.slopeOk(50, 40, 50, 45, 16);
    t.eq(slopeBridge, true, 'наклон вдоль горизонтального настила моста допустим (перепад 0 м)');

    // Без указания высоты моста (по рельефу земли) произошел бы ложный обрыв
    const slopeGround = GEO.slopeOk(50, 30, 50, 45); // с берега Y=10 в овраг Y=-40 (перепад 50м на 15м)
    t.eq(slopeGround, false, 'падение в овраг без моста блокируется как недопустимый обрыв');
  }

  // 4. Движение по мосту (moveAlong)
  t.suite('geo-multitier: сквозное движение по мосту (moveAlong)');
  {
    // Проход по мосту от берега Z = 32 до противоположного берега Z = 68
    const stepBridge = GEO.moveAlong(50, 32, 50, 68, 16);
    t.eq(stepBridge.blocked, false, 'персонаж беспрепятственно прошел весь мост над оврагом');
    t.near(stepBridge.x, 50, 0.1, 'конечная координата X = 50');
    t.near(stepBridge.z, 68, 0.1, 'конечная координата Z = 68');
    t.near(stepBridge.y, 16, 0.1, 'персонаж сохранил высоту настила Y = 16 без падения на дно');
  }

  // 5. Движение под мостом (при достаточном клиренсе)
  t.suite('geo-multitier: проход под мостом');
  {
    // Мост висит на Y = 15..16. Дно оврага Y = -40. Клиренс 55 метров.
    // Персонаж на дне оврага идет от Z = 45 до Z = 55 под мостом
    const stepUnder = GEO.moveAlong(50, 45, 50, 55, -40);
    t.near(stepUnder.y, -40, 0.1, 'персонаж под мостом остался на дне оврага (Y = -40) и не притянулся к мосту');
  }

  // 6. Столкновение с торцом/боковиной моста сбоку
  t.suite('geo-multitier: коллизия с бортом моста сбоку');
  {
    // Мост по X занимает [46..54]. Если персонаж летит/прыгает на высоте Y = 15.2 (уровень настила)
    // снаружи моста (X = 40) внутрь моста (X = 50):
    const hitSide = GEO.hitsProp(40, 50, 47, 50, 15.2);
    t.eq(hitSide, true, 'попытка врезаться в торец настила моста сбоку блокируется коллизией');
  }

  // 7. 3D Line of Sight (canSee)
  t.suite('geo-multitier: 3D Line of Sight над и под мостом');
  {
    // Два игрока на мосту на высоте Y = 16 в Z = 35 и Z = 65
    const losOnBridge = GEO.canSee(50, 16 + 1.55, 35, 50, 16 + 1.1, 65);
    t.eq(losOnBridge, true, 'прямая видимость между игроками на мосту не блокируется');

    // Игрок под мостом (Y = -40) смотрит на игрока на мосту (Y = 16) прямо через сплошной настил
    const losThroughBridge = GEO.canSee(50, -40 + 1.55, 50, 50, 16 + 1.1, 50);
    t.eq(losThroughBridge, false, 'видимость сквозь сплошной настил моста блокируется');
  }

  // Восстанавливаем оригинальные пропсы
  WM.CUSTOM_PROPS = originalProps;
  PC.invalidate();
};
