// ============================================================
//  TESTS / NET-PACK.TEST.JS — квантизация и дельта `upd` (PLAN 4.4).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NP = require(path.join(ROOT, 'shared', 'net-pack.js'));

module.exports = function (t) {
  t.suite('net-pack: квантизация');
  t.eq(NP.SCALE, 100, 'шкала 1 см');
  t.eq(NP.qCoord(1.23456), 1.23, 'метры → 2 знака');
  t.eq(NP.qCoord(-99.37655), -99.38, 'отрицательные округляются');
  t.eq(NP.qCoord(NaN), 0, 'NaN → 0, не в JSON');
  t.eq(NP.qHp(100.9), 100, 'HP — целые');
  t.eq(NP.qHp(-3), 0, 'HP не уходит в минус');
  const packed = NP.pack('p12', 8.12345, -246.4, 77.2);
  t.eq(packed, { k: 'p12', x: 8.12, z: -246.4, hp: 77 }, 'pack режет хвост float64');

  t.suite('net-pack: дельта');
  const a = NP.delta(null, 'm1', 10.001, 20.004, 50);
  t.ok(a.pack && a.sig, 'первый снимок всегда уходит');
  const b = NP.delta(a.sig, 'm1', 10.001, 20.004, 50);
  t.eq(b.pack, null, 'то же квантованное положение — не шлём');
  t.eq(b.sig, a.sig, 'сигнатура стабильна');
  const c = NP.delta(a.sig, 'm1', 10.02, 20.004, 50);
  t.ok(c.pack && c.pack.x === 10.02, 'сдвиг на 2 см — пакет', JSON.stringify(c.pack));
  const d = NP.delta(a.sig, 'm1', 10.001, 20.004, 51);
  t.ok(d.pack && d.pack.hp === 51, 'смена HP — пакет даже без хода');
  const e = NP.delta(a.sig, 'm1', 10.004, 20.004, 50);
  t.eq(e.pack, null, 'сдвиг меньше 0.5 см внутри той же клетки — тишина');

  t.suite('net-pack: сервер подключил дельту и deflate');
  const srv = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  t.ok(/require\('\.\.\/shared\/net-pack\.js'\)/.test(srv), 'server.js требует net-pack');
  t.ok(/perMessageDeflate:\s*WS_DEFLATE/.test(srv), 'WebSocketServer с perMessageDeflate');
  t.ok(/clientNoContextTakeover:\s*true/.test(srv) && /serverNoContextTakeover:\s*true/.test(srv),
    'deflate без context takeover (память на сокет)');
  t.ok(/function pushPosUpd/.test(srv) && /NP\.delta/.test(srv),
    'тик кладёт в upd только изменившееся');
  t.ok(/rememberPos\(p, ek, s\.x, s\.z, s\.hp\)/.test(srv),
    'aoi.enter сидирует lastUpd — тот же тик не дублирует снимок');
};
