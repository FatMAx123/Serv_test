const WebSocket = require('ws');
const PORT = process.env.PORT || 3930;
const SECRET = process.env.MOD_SECRET;
const YID = process.env.YID || 'local_itemtest01', NAME = process.env.NAME || 'ItemTester';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function login() {
  return new Promise((res) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT);
    const msgs = [];
    ws.on('message', (d) => { let m; try { m = JSON.parse(d); } catch (_) { return; } msgs.push(m); if (m.t === 'welcome') res({ ws, welcome: m, msgs }); });
    ws.on('close', (c, r) => res({ closed: c, reason: String(r) }));
    ws.on('open', () => ws.send(JSON.stringify({ t: 'login', data: b64({ uniqueID: YID, guestToken: 'itemtest-token-aaaaaaaaaa', publicName: NAME }), signature: '' })));
  });
}
let ok = 0, bad = 0;
function check(name, cond, info) { (cond ? ok++ : bad++); console.log((cond ? 'OK   ' : 'FAIL ') + name + (info !== undefined ? '  → ' + JSON.stringify(info) : '')); }
(async () => {
  const A = await login();
  if (!A.welcome) { console.log('login failed', A); process.exit(1); }
  const S = (m) => A.ws.send(JSON.stringify(m));
  async function req(m, types, ms = 600) { await sleep(400); const from = A.msgs.length; S(m); const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = A.msgs.slice(from).find(x => types.includes(x.t)); if (r) return r; await sleep(25); } return null; }
  if (process.env.PHASE === 'migrate') {
    const w = A.welcome; const self = w.self || w.me || w;
    const eq = self.equip || w.equip || {}; const pb = self.plusById || w.plusById || {};
    console.log('equip:', JSON.stringify(eq), 'inv.short_sword=', (self.inv || w.inv || {}).short_sword, 'plusById:', JSON.stringify(pb));
    check('мигр.: материал из слота «weapon2» снят в сумку', !eq.weapon2, Object.keys(eq));
    check('мигр.: призрак plusById у надетой вещи удалён', !pb.long_sword, pb);
    process.exit(bad ? 1 : 0);
  }
  const r = await fetch('http://127.0.0.1:' + PORT + '/api/admin/gm', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mod-secret': SECRET }, body: JSON.stringify({ name: NAME, accessLevel: 100 }) });
  check('выдан GM через MOD_SECRET', r.status === 200, r.status);
  await sleep(200);
  async function give(id, n) {
    for (let a = 0; a < 4; a++) {
      const from = A.msgs.length; await sleep(800);
      S({ t: 'chat', text: '//give ' + NAME + ' ' + id + ' ' + n });
      const t0 = Date.now();
      while (Date.now() - t0 < 1200) { const r = A.msgs.slice(from).find(x => x.t === 'inv_sync'); if (r) return r; await sleep(30); }
    }
    console.log('give failed', id, A.msgs.slice(-3)); return null;
  }
  for (const g of [['short_sword', 1], ['pressure_amplifier', 10], ['synthetic_oil', 3]]) await give(g[0], g[1]);
  await sleep(300);
  // H9
  let m = await req({ t: 'equip', slot: 'weapon', templateId: 'synthetic_oil' }, ['equip_ok', 'equip_fail']);
  check('H9 расходник в слот weapon — отказ', m && m.t === 'equip_fail', m && m.reason);
  m = await req({ t: 'equip', slot: 'title', templateId: 'synthetic_oil' }, ['equip_ok', 'equip_fail']);
  check('H9 расходник в слот title — отказ', m && m.t === 'equip_fail', m && m.reason);
  m = await req({ t: 'equip', slot: 'weapon2', templateId: 'pressure_amplifier' }, ['equip_ok', 'equip_fail']);
  check('H9 материал в выдуманный слот — отказ', m && m.t === 'equip_fail', m && m.reason);
  m = await req({ t: 'equip', slot: 'chest', templateId: 'short_sword', plus: 9 }, ['equip_ok', 'equip_fail']);
  check('меч с slot=chest надет в weapon, plus из пакета игнорируется', m && m.t === 'equip_ok' && m.slot === 'weapon' && (m.equip.chest || {}).templateId !== 'short_sword' && (m.equip.weapon.plus | 0) === 0, m && { slot: m.slot, eq: m.equip });
  // H10
  for (let i = 0; i < 3; i++) await req({ t: 'enchant', slot: 'weapon' }, ['enchant_ok', 'enchant_fail', 'enchant_break']);
  const sync = await give('short_sword', 1);
  check('после заточки +3 и выдачи обычного меча: в сумке меч без заточки', sync && sync.equip.weapon.plus === 3 && !(sync.plusById || {}).short_sword && sync.inv.short_sword === 1, sync && { eq: sync.equip.weapon, pb: sync.plusById, inv: sync.inv.short_sword });
  m = await req({ t: 'unequip', slot: 'weapon' }, ['unequip_ok', 'equip_fail']);
  check('снять +3 при обычном мече в сумке — отказ (без смешивания)', m && m.t === 'equip_fail' && m.reason === 'enchanted', m && m.reason);
  m = await req({ t: 'drop_item', itemId: 'short_sword', count: 1 }, ['drop_ok', 'drop_fail']);
  check('выброс меча из сумки — выпал +0 (не +3)', m && m.t === 'drop_ok' && (m.plus | 0) === 0 && !m.fromEquip, m && { plus: m.plus, fromEquip: m.fromEquip });
  m = await req({ t: 'unequip', slot: 'weapon' }, ['unequip_ok', 'equip_fail']);
  check('снять +3 — в сумке меч +3', m && m.t === 'unequip_ok' && (m.invPlus || {}).short_sword === 3, m && m.invPlus);
  m = await req({ t: 'equip', slot: 'weapon', templateId: 'short_sword' }, ['equip_ok', 'equip_fail']);
  check('надеть снова — на слоте +3, реестр сумки пуст', m && m.t === 'equip_ok' && m.equip.weapon.plus === 3 && !(m.invPlus || {}).short_sword, m && { eq: m.equip.weapon, pb: m.invPlus });
  // своп same-id: надет +3, в сумке +0 (одна копия) → надеть из сумки = поменять местами
  await give('short_sword', 1);
  m = await req({ t: 'equip', slot: 'weapon', templateId: 'short_sword' }, ['equip_ok', 'equip_fail']);
  check('надеть обычный меч поверх +3 — обмен экземплярами', m && m.t === 'equip_ok' && (m.equip.weapon.plus | 0) === 0 && (m.invPlus || {}).short_sword === 3, m && { eq: m.equip.weapon, pb: m.invPlus });
  m = await req({ t: 'drop_item', itemId: 'short_sword', count: 1 }, ['drop_ok', 'drop_fail']);
  check('выброс из сумки — выпал +3, надетый остался +0', m && m.t === 'drop_ok' && m.plus === 3 && (m.equip.weapon.plus | 0) === 0, m && { plus: m.plus, eq: m.equip.weapon });
  m = await req({ t: 'drop_item', itemId: 'short_sword', count: 1 }, ['drop_ok', 'drop_fail']);
  check('выброс надетого — выпал +0', m && m.t === 'drop_ok' && (m.plus | 0) === 0 && m.fromEquip, m && { plus: m.plus, fromEquip: m.fromEquip });
  console.log('\nИтого OK=' + ok + ' FAIL=' + bad);
  process.exit(bad ? 1 : 0);
})();
