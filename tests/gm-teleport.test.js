// ============================================================
//  TESTS / GM-TELEPORT.TEST.JS — GM-телепорт по точке и //fly.
//  - gm_teleport: только GM, неверные координаты, мёртвый GM, клэмп по границам мира.
//  - y клиента — лишь подсказка уровня для snapStandY; аудит в Mod.log.
//  - //fly [on|off] и //tp — алиасы GM-команд.
//  - Клиент: Shift+F3 только для GM/dev, стриминг мира вокруг камеры при полёте.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const createGmHandler = require(path.join(ROOT, 'server', 'handlers', 'gm-handler.js'));
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const Mod = require(path.join(ROOT, 'server', 'moderation.js'));

function makeCtx() {
  const sent = [];
  const aoi = [];
  const snaps = [];
  const ctx = {
    send: (p, m) => sent.push({ pid: p && p.pid, m }),
    broadcastAOI: (p, m) => aoi.push({ pid: p && p.pid, m }),
    broadcastAll: () => {},
    findPlayerByName: () => null,
    sanitizeCharName: (s) => String(s || ''),
    // Геодата-заглушка: высота = 7, а подсказка «крыша» (>= 20) даёт 25.
    snapStandY: (ent) => { snaps.push(ent.y); ent.y = (ent.y != null && ent.y >= 20) ? 25 : 7; },
    resetMoveBudget: () => {},
    detachPlayer: () => {},
    wsByPid: new Map(),
    saveProfileNow: () => {},
    cosmeticsPublic: () => ({}),
    itemLookup: () => null,
    mobs: new Map(),
    Mob: function () {},
    getNextId: () => 1,
    onMobDeath: () => {},
    pushWeight: () => {}
  };
  return { ctx, sent, aoi, snaps };
}

function gm(extra) {
  return Object.assign({ pid: 11, name: 'GmTester', yid: 'gm_test_yid', accessLevel: 100, gm: true, x: 10, y: 3, z: 20, dead: false }, extra || {});
}

module.exports = function (t) {
  const logs = [];
  const origLog = Mod.log;
  Mod.log = function (kind, row) { logs.push({ kind, row }); };
  try {
    t.suite('gm_teleport: права и валидация');
    {
      const { ctx, sent } = makeCtx();
      const h = createGmHandler(ctx);
      t.ok(typeof h.handleGmTeleport === 'function', 'gm-handler экспортирует handleGmTeleport');

      const plain = { pid: 2, name: 'Player', yid: 'yd_regular', accessLevel: 0, gm: false, x: 1, y: 1, z: 1, nonGm: true };
      t.eq(h.handleGmTeleport(plain, { x: 50, z: 60 }), false, 'обычный игрок не может телепортироваться');
      t.eq(plain.x, 1, 'позиция обычного игрока не изменилась');
      t.ok(logs.some(l => l.kind === 'security' && l.row.reason === 'unauthorized_gm_teleport'), 'попытка без прав пишется в security-лог');

      const g1 = gm();
      t.eq(h.handleGmTeleport(g1, { x: 'abc', z: 5 }), false, 'нечисловые координаты отклоняются');
      t.eq(h.handleGmTeleport(g1, { x: NaN, z: 5 }), false, 'NaN отклоняется');
      t.eq(g1.x, 10, 'после отказа позиция GM не изменилась');

      const dead = gm({ dead: true });
      t.eq(h.handleGmTeleport(dead, { x: 50, z: 60 }), false, 'мёртвый GM не телепортируется');
      t.ok(sent.some(s => /мёртв/.test(String(s.m.text || ''))), 'мёртвому GM объяснили причину');
    }

    t.suite('gm_teleport: перемещение, высота, аудит');
    {
      const { ctx, sent, aoi, snaps } = makeCtx();
      const h = createGmHandler(ctx);
      const g2 = gm();
      const b = WM.worldBounds();
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      t.eq(h.handleGmTeleport(g2, { x: cx, z: cz, src: 'map' }), true, 'GM телепортирован в центр мира');
      t.ok(Math.abs(g2.x - cx) < 1e-6 && Math.abs(g2.z - cz) < 1e-6, 'x/z совпадают с точкой');
      t.eq(snaps[snaps.length - 1], null, 'без подсказки y геодата получает null (уровень по умолчанию), а не старую высоту');
      t.eq(g2.y, 7, 'высоту ставит сервер (snapStandY)');
      const sync = sent.filter(s => s.m.t === 'self_sync').pop();
      t.ok(sync && sync.m.x === g2.x && sync.m.z === g2.z && sync.m.y === 7, 'клиент получил self_sync с новой позицией');
      t.ok(aoi.some(a => a.m.t === 'teleport_fx'), 'окружающим разослан teleport_fx');
      const row = logs.filter(l => l.kind === 'gm' && l.row.cmd === 'gm_teleport').pop();
      t.ok(row && row.row.src === 'map' && row.row.fromX === 10 && row.row.fromZ === 20, 'аудит: источник и точка отправления');

      const g3 = gm();
      h.handleGmTeleport(g3, { x: cx, z: cz, y: 40, src: 'fly_down' });
      t.eq(snaps[snaps.length - 1], 40, 'y камеры передан геодате как подсказка');
      t.eq(g3.y, 25, 'подсказка y выбирает верхний уровень (крыша/мост)');

      const g4 = gm();
      h.handleGmTeleport(g4, { x: b.maxX + 99999, z: b.minZ - 99999 });
      t.eq(g4.x, b.maxX, 'x клэмпится по правой границе мира');
      t.eq(g4.z, b.minZ, 'z клэмпится по нижней границе мира');
    }

    t.suite('GM-команды //fly и //tp');
    {
      const { ctx, sent } = makeCtx();
      const h = createGmHandler(ctx);
      const g5 = gm();
      h.handleGmCommand(g5, '//fly');
      let fly = sent.filter(s => s.m.t === 'gm_fly').pop();
      t.ok(fly && fly.m.on === null, '//fly без аргумента — переключение');
      h.handleGmCommand(g5, '//fly on');
      fly = sent.filter(s => s.m.t === 'gm_fly').pop();
      t.eq(fly.m.on, true, '//fly on');
      h.handleGmCommand(g5, '//fly off');
      fly = sent.filter(s => s.m.t === 'gm_fly').pop();
      t.eq(fly.m.on, false, '//fly off');

      h.handleGmCommand(g5, '//tp 123 456');
      t.ok(g5.x === 123 && g5.z === 456, '//tp x z — алиас //teleport');
    }
  } finally {
    Mod.log = origLog;
  }

  t.suite('Клиент: GM-полёт камеры и телепорт');
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, 'client', 'js', f), 'utf8');
    const cam = read('camera3d.js');
    t.ok(/self\.flyMode \|\| self\.canFly\(\)/.test(cam), 'Shift+F3 включает полёт только при canFly() (GM/dev/редактор)');
    t.ok(cam.includes('window.isCameraFlyActive'), 'camera3d.js экспортирует isCameraFlyActive');
    t.ok(read('terrain.js').includes('isCameraFlyActive'), 'террейн стримится вокруг камеры в полёте');
    t.ok(read('l2-visibility.js').includes('isCameraFlyActive'), 'L2Vis считает дистанции от камеры в полёте');
    const main = read('main.js');
    t.ok(main.includes('gmTeleportTo(') && main.includes("'fly_click'") && main.includes('gmTeleportUnderCamera'), 'main.js: Ctrl+ЛКМ и T в GM-полёте');
    const net = read('net-ws.js');
    t.ok(net.includes("t: 'gm_teleport'") && net.includes("case 'gm_fly':") && net.includes("case 'gm_update':"), 'net-ws.js: gm_teleport / gm_fly / gm_update');
    t.ok(read('map-renderer.js').includes("'map')"), 'большая карта: Ctrl+ЛКМ — GM-телепорт');
    const server = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
    t.ok(server.includes("case 'gm_teleport':") && server.includes('gmHandler.handleGmTeleport(p, msg)'), "server.js маршрутизирует 'gm_teleport'");
  }
};
