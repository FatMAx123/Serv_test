// SERVER / HANDLERS / CLAN-HANDLER.JS
// Управление кланами 1–20, склад клана (CWH), гербы и состав
'use strict';
const Clans = require('../clans-store.js');
const CL = require('../../shared/clan-rules.js');
const CH = require('../../shared/char-rules.js');
const NPCS = require('../../shared/npc-services.js');
const {
  equippedCount,
  equippedPlus
} = require('./item-plus-utils.js');

module.exports = function createClanHandler(ctx) {
  const {
    players,
    pidByYid,
    send,
    broadcastAOI,
    currencyOf,
    takeCurrency,
    giveCurrency,
    saveProfileNow,
    sanitizeCharName,
    findPlayerByName,
    TR,
    npcForService,
    isWarehouseNpc,
    isBadKey,
    invCount,
    pruneInv,
    pruneCounts,
    canCarryMore,
    pushWeight
  } = ctx;

  function clanTagOf(p) {
    if (!p || !p.clanId) return { clanId: null, clanName: null, crestHash: null };
    const c = Clans.get(p.clanId);
    if (!c) return { clanId: null, clanName: null, crestHash: null };
    return { clanId: c.id, clanName: c.name, crestHash: c.crest ? c.crest.hash : null };
  }

  function clanMemberOnline(m) {
    if (!m) return null;
    const pid = pidByYid.get(m.yid);
    const q = pid != null ? players.get(pid) : null;
    if (q && CH.sameChar(q, m)) return q;
    return null;
  }

  function clanOnline(c) {
    const out = [];
    if (!c) return out;
    for (const m of c.members) {
      const q = clanMemberOnline(m);
      if (q) out.push(q);
    }
    return out;
  }

  function sendClan(c, pack) {
    for (const q of clanOnline(c)) send(q, pack);
  }

  function bindClan(p, clan) {
    p.clanId = clan ? clan.id : null;
  }

  function clanPayload(c) {
    if (!c) return { t: 'clan', clan: null };
    return {
      t: 'clan',
      clan: {
        id: c.id,
        name: c.name,
        level: c.level | 0,
        reputation: c.reputation | 0,
        cap: CL.memberCap(c.level),
        whSlots: CL.whSlots(c.level),
        leaderYid: c.leaderYid,
        leaderCharId: CH.normalizeCharId(c.leaderCharId),
        crestHash: c.crest ? c.crest.hash : null,
        createCost: CL.CREATE_COST,
        createLevel: CL.CREATE_LEVEL,
        members: c.members.map((m) => {
          const online = clanMemberOnline(m);
          return {
            yid: m.yid,
            charId: CH.normalizeCharId(m.charId),
            name: online ? online.name : m.name,
            rank: m.rank,
            online: !!online,
            level: online ? online.level : null,
            pid: online ? online.pid : null
          };
        })
      }
    };
  }

  function sendCrest(p, c) {
    if (!p || !c || !c.crest) return;
    send(p, {
      t: 'clan_crest',
      clanId: c.id,
      w: c.crest.w,
      h: c.crest.h,
      rgba: c.crest.rgba,
      hash: c.crest.hash
    });
  }

  function pushClan(c) {
    if (!c) return;
    const pack = clanPayload(c);
    for (const q of clanOnline(c)) {
      send(q, pack);
      sendCrest(q, c);
    }
  }

  function broadcastClanTag(p) {
    const tag = clanTagOf(p);
    const pack = { t: 'clan_tag', pid: p.pid, clanId: tag.clanId, clanName: tag.clanName, crestHash: tag.crestHash };
    send(p, pack);
    broadcastAOI(p, pack);
  }

  function notifyClan(p, online) {
    const c = Clans.ofPlayer(p);
    if (!c) return;
    const mem = Clans.memberOf(c, p.yid, p.charId);
    if (mem && p.name) mem.name = p.name;
    sendClan(c, {
      t: 'clan_status',
      yid: p.yid,
      charId: p.charId,
      name: p.name,
      online: !!online,
      pid: p.pid,
      level: p.level
    });
  }

  function addClanReputation(p, amount) {
    const n = Math.max(0, Math.floor(+amount) || 0);
    if (!n || !p) return;
    const c = Clans.ofPlayer(p);
    if (!c) return;
    c.reputation = (c.reputation | 0) + n;
    Clans.save(c);
    sendClan(c, clanPayload(c));
  }

  function failClan(p, reason, extra) {
    send(p, Object.assign({ t: 'clan_fail', reason: reason }, extra || {}));
  }

  /** Удаление слота: рядовой выходит, последний лидер распускает, лидер с составом — отказ. */
  function clanLeaveOnCharDelete(yid, charId) {
    const c = Clans.ofKey(yid, charId);
    if (!c) return { ok: true };
    const me = Clans.memberOf(c, yid, charId);
    if (!me) return { ok: true };
    if (me.rank === 'leader' && c.members.length > 1) return { ok: false, reason: 'clan_leader' };
    if (me.rank === 'leader') {
      const online = clanOnline(c);
      const members = c.members.slice();
      Clans.remove(c);
      for (const m of members) Clans.reindexMember(m.yid, m.charId, null);
      for (const q of online) {
        bindClan(q, null);
        send(q, { t: 'clan', clan: null });
        send(q, { t: 'clan_ok', op: 'disband' });
        broadcastClanTag(q);
      }
      return { ok: true };
    }
    dropMember(c, yid, charId);
    Clans.save(c);
    pushClan(c);
    return { ok: true };
  }

  function doClanInfo(p) {
    const c = Clans.ofPlayer(p);
    send(p, clanPayload(c));
    if (c) sendCrest(p, c);
  }

  function doClanCreate(p, msg) {
    const name = CL.sanitizeClanName(msg && msg.name);
    if (!name) { failClan(p, 'name'); return; }
    const check = CL.canCreate(p.level, currencyOf(p), !!Clans.ofPlayer(p));
    if (!check.ok) { failClan(p, check.reason, { need: check.need }); return; }
    if (Clans.byName(name)) { failClan(p, 'taken', { name: name }); return; }
    if (!takeCurrency(p, CL.CREATE_COST)) { failClan(p, 'funds', { need: CL.CREATE_COST }); return; }
    const made = Clans.create({ name: name, leaderYid: p.yid, leaderCharId: p.charId, leaderName: p.name });
    if (!made.ok) {
      giveCurrency(p, CL.CREATE_COST);
      failClan(p, made.reason, { name: name });
      return;
    }
    bindClan(p, made.clan);
    saveProfileNow(p);
    send(p, { t: 'clan_ok', op: 'create', currency: currencyOf(p) });
    pushClan(made.clan);
    broadcastClanTag(p);
  }

  function doClanInvite(p, msg) {
    const c = Clans.ofPlayer(p);
    if (!c) { failClan(p, 'no_clan'); return; }
    const me = Clans.memberOf(c, p.yid, p.charId);
    const can = CL.canInvite(me ? me.rank : '', c.members.length, c.level);
    if (!can.ok) { failClan(p, can.reason, { cap: can.cap }); return; }
    const name = sanitizeCharName(msg && msg.name);
    if (!name) { failClan(p, 'args'); return; }
    const q = findPlayerByName(name);
    if (!q) { failClan(p, 'offline', { name: name }); return; }
    if (q.pid === p.pid) { failClan(p, 'self'); return; }
    if (Clans.ofPlayer(q)) { failClan(p, 'busy', { name: q.name }); return; }
    q._clanFrom = { pid: p.pid, clanId: c.id, at: Date.now() };
    send(q, { t: 'clan_invite', from: p.pid, fromName: p.name, clanName: c.name, clanId: c.id });
    send(p, { t: 'msg', text: 'Приглашение в клан отправлено: ' + q.name });
  }

  function doClanAccept(p, msg) {
    const from = p._clanFrom;
    const wantPid = (msg && msg.pid != null) ? (msg.pid | 0) : (from ? from.pid : null);
    if (!from || wantPid == null || from.pid !== wantPid || Date.now() - from.at > TR.TRADE_TTL_MS) {
      p._clanFrom = null;
      failClan(p, 'no_invite');
      return;
    }
    p._clanFrom = null;
    if (Clans.ofPlayer(p)) { failClan(p, 'already'); return; }
    const c = Clans.get(from.clanId);
    if (!c) { failClan(p, 'gone'); return; }
    const cap = CL.memberCap(c.level);
    if (c.members.length >= cap) { failClan(p, 'full', { cap: cap }); return; }
    if (Clans.memberOf(c, p.yid, p.charId)) { failClan(p, 'already'); return; }
    c.members.push({ yid: p.yid, charId: CH.normalizeCharId(p.charId), name: p.name, rank: 'member', joinedAt: Date.now() });
    Clans.reindexMember(p.yid, p.charId, c.id);
    bindClan(p, c);
    Clans.save(c);
    send(p, { t: 'clan_ok', op: 'join' });
    pushClan(c);
    broadcastClanTag(p);
  }

  function dropMember(c, yid, charId) {
    const wantC = CH.normalizeCharId(charId);
    const idx = c.members.findIndex((m) => m.yid === yid && CH.normalizeCharId(m.charId) === wantC);
    if (idx < 0) return null;
    const gone = c.members[idx];
    c.members.splice(idx, 1);
    Clans.reindexMember(yid, charId, null);
    const q = clanMemberOnline(gone);
    if (q) {
      bindClan(q, null);
      send(q, { t: 'clan', clan: null });
      broadcastClanTag(q);
    }
    return gone;
  }

  function doClanLeave(p) {
    const c = Clans.ofPlayer(p);
    if (!c) { failClan(p, 'no_clan'); return; }
    const me = Clans.memberOf(c, p.yid, p.charId);
    const can = CL.canLeave(me ? me.rank : '', c.members.length);
    if (!can.ok) { failClan(p, can.reason); return; }
    if (c.members.length <= 1) {
      doClanDisband(p);
      return;
    }
    dropMember(c, p.yid, p.charId);
    Clans.save(c);
    send(p, { t: 'clan_ok', op: 'leave' });
    pushClan(c);
  }

  function doClanKick(p, msg) {
    const c = Clans.ofPlayer(p);
    if (!c) { failClan(p, 'no_clan'); return; }
    const me = Clans.memberOf(c, p.yid, p.charId);
    const name = sanitizeCharName(msg && msg.name);
    if (!name) { failClan(p, 'args'); return; }
    const tgt = c.members.find((m) => String(m.name || '').toLowerCase() === name.toLowerCase());
    if (!tgt) { failClan(p, 'not_member', { name: name }); return; }
    const can = CL.canKick(me ? me.rank : '', tgt.rank);
    if (!can.ok) { failClan(p, can.reason); return; }
    dropMember(c, tgt.yid, tgt.charId);
    Clans.save(c);
    send(p, { t: 'clan_ok', op: 'kick', name: tgt.name });
    pushClan(c);
  }

  function doClanPromote(p, msg) {
    const c = Clans.ofPlayer(p);
    if (!c) { failClan(p, 'no_clan'); return; }
    const me = Clans.memberOf(c, p.yid, p.charId);
    const name = sanitizeCharName(msg && msg.name);
    const next = String((msg && msg.rank) || 'officer').toLowerCase();
    if (!name) { failClan(p, 'args'); return; }
    const tgt = c.members.find((m) => String(m.name || '').toLowerCase() === name.toLowerCase());
    if (!tgt) { failClan(p, 'not_member', { name: name }); return; }
    const can = CL.canPromote(me ? me.rank : '', tgt.rank, next);
    if (!can.ok) { failClan(p, can.reason); return; }
    tgt.rank = next;
    Clans.save(c);
    send(p, { t: 'clan_ok', op: 'promote', name: tgt.name, rank: next });
    pushClan(c);
  }

  function doClanLeader(p, msg) {
    const c = Clans.ofPlayer(p);
    if (!c) { failClan(p, 'no_clan'); return; }
    const me = Clans.memberOf(c, p.yid, p.charId);
    const can = CL.canTransferLeader(me ? me.rank : '');
    if (!can.ok) { failClan(p, can.reason); return; }
    const name = sanitizeCharName(msg && msg.name);
    if (!name) { failClan(p, 'args'); return; }
    const tgt = c.members.find((m) => String(m.name || '').toLowerCase() === name.toLowerCase());
    if (!tgt) { failClan(p, 'not_member', { name: name }); return; }
    if (tgt.yid === p.yid && CH.normalizeCharId(tgt.charId) === CH.normalizeCharId(p.charId)) {
      failClan(p, 'self'); return;
    }
    me.rank = 'officer';
    tgt.rank = 'leader';
    c.leaderYid = tgt.yid;
    c.leaderCharId = CH.normalizeCharId(tgt.charId);
    Clans.save(c);
    send(p, { t: 'clan_ok', op: 'leader', name: tgt.name });
    pushClan(c);
  }

  function doClanDisband(p) {
    const c = Clans.ofPlayer(p);
    if (!c) { failClan(p, 'no_clan'); return; }
    const me = Clans.memberOf(c, p.yid, p.charId);
    const can = CL.canDisband(me ? me.rank : '');
    if (!can.ok) { failClan(p, can.reason); return; }
    const online = clanOnline(c);
    const members = c.members.slice();
    Clans.remove(c);
    for (const m of members) Clans.reindexMember(m.yid, m.charId, null);
    for (const q of online) {
      bindClan(q, null);
      send(q, { t: 'clan', clan: null });
      send(q, { t: 'clan_ok', op: 'disband' });
      broadcastClanTag(q);
    }
  }

  function doClanLevelUp(p) {
    const c = Clans.ofPlayer(p);
    if (!c) { failClan(p, 'no_clan'); return; }
    const me = Clans.memberOf(c, p.yid, p.charId);
    const can = CL.canLevelUp(me ? me.rank : '', c.level, c.reputation, currencyOf(p));
    if (!can.ok) { failClan(p, can.reason, { need: can.need }); return; }
    if (!takeCurrency(p, can.cost)) { failClan(p, 'funds', { need: can.cost }); return; }
    c.reputation = Math.max(0, (c.reputation | 0) - can.rep);
    c.level = can.next;
    Clans.save(c);
    saveProfileNow(p);
    send(p, { t: 'clan_ok', op: 'levelup', level: c.level, currency: currencyOf(p) });
    pushClan(c);
  }

  function doClanCrest(p, msg) {
    const c = Clans.ofPlayer(p);
    if (!c) { failClan(p, 'no_clan'); return; }
    const me = Clans.memberOf(c, p.yid, p.charId);
    const can = CL.canSetCrest(me ? me.rank : '');
    if (!can.ok) { failClan(p, can.reason); return; }
    const n = CL.normalizeCrest(msg);
    if (!n.ok) { failClan(p, n.reason || 'crest'); return; }
    c.crest = { w: n.w, h: n.h, rgba: n.rgba, hash: n.hash };
    Clans.save(c);
    send(p, { t: 'clan_ok', op: 'crest', hash: n.hash });
    pushClan(c);
    for (const q of clanOnline(c)) broadcastClanTag(q);
  }

  function cwhPayload(p, npc, c, extra) {
    const base = {
      npcId: npc.id,
      scope: 'clan',
      clanId: c.id,
      clanName: c.name,
      wh: c.wh,
      whPlus: c.whPlusById,
      invPlus: p.plusById,
      slots: NPCS.invSlotsUsed(c.wh),
      cap: CL.whSlots(c.level),
      fee: NPCS.WH_FEE_PER_STACK,
      currency: currencyOf(p),
      inv: p.inv,
      equip: p.equip || {}
    };
    return Object.assign(base, extra || {});
  }

  function doClanWhOpen(p, npcId) {
    const npc = npcForService(p, npcId, 'cwh_fail', isWarehouseNpc);
    if (!npc) return;
    if (p.dead) { send(p, { t: 'cwh_fail', reason: 'dead', npcId: npc.id }); return; }
    if (p.trade || p.store) { send(p, { t: 'cwh_fail', reason: 'busy', npcId: npc.id }); return; }
    if (p.isFlagged || (p._lastCombatAt && Date.now() - p._lastCombatAt < 5000)) {
      send(p, { t: 'cwh_fail', reason: 'combat', npcId: npc.id });
      send(p, { t: 'msg', text: 'Нельзя пользоваться складом во время боя или PvP-флага!' });
      return;
    }
    const c = Clans.ofPlayer(p);
    if (!c) { send(p, { t: 'cwh_fail', reason: 'no_clan', npcId: npc.id }); return; }
    send(p, cwhPayload(p, npc, c, { t: 'cwh_open', npcName: npc.name }));
  }

  function doClanWhPut(p, msg) {
    const npc = npcForService(p, msg.npcId, 'cwh_fail', isWarehouseNpc);
    if (!npc) return;
    if (p.dead) { send(p, { t: 'cwh_fail', reason: 'dead', npcId: npc.id }); return; }
    if (p.trade || p.store) { send(p, { t: 'cwh_fail', reason: 'busy', npcId: npc.id }); return; }
    if (p.isFlagged || (p._lastCombatAt && Date.now() - p._lastCombatAt < 5000)) {
      send(p, { t: 'cwh_fail', reason: 'combat', npcId: npc.id });
      send(p, { t: 'msg', text: 'Нельзя пользоваться складом во время боя или PvP-флага!' });
      return;
    }
    const c = Clans.ofPlayer(p);
    if (!c) { send(p, { t: 'cwh_fail', reason: 'no_clan', npcId: npc.id }); return; }
    const itemId = String(msg.itemId || '').toLowerCase();
    if (!itemId || isBadKey(itemId)) { send(p, { t: 'cwh_fail', reason: 'args', npcId: npc.id }); return; }
    const storable = NPCS.whStorable(itemId);
    if (!storable.ok) { send(p, { t: 'cwh_fail', reason: storable.reason, npcId: npc.id, itemId }); return; }
    const have = invCount(p, itemId);
    if (have < 1) { send(p, { t: 'cwh_fail', reason: 'none', npcId: npc.id, itemId }); return; }
    let count = Math.floor(+msg.count || 1);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count > have) count = have;
    const plusOk = NPCS.plusMoveOk(
      p.inv, p.plusById, c.wh, c.whPlusById, itemId, count,
      { fromLocked: equippedCount(p, itemId), fromExtraPlus: equippedPlus(p, itemId) }
    );
    if (!plusOk) { send(p, { t: 'cwh_fail', reason: 'enchanted', npcId: npc.id, itemId }); return; }
    const cap = CL.whSlots(c.level);
    const fit = NPCS.canFit(c.wh, itemId, count, cap);
    if (!fit.ok) {
      send(p, { t: 'cwh_fail', reason: 'wh_full', npcId: npc.id, itemId, need: fit.need, free: fit.free });
      return;
    }
    const fee = NPCS.whDepositFee(itemId, count);
    if (currencyOf(p) < fee) {
      send(p, { t: 'cwh_fail', reason: 'funds', npcId: npc.id, itemId, need: fee, have: currencyOf(p) });
      return;
    }
    takeCurrency(p, fee);
    p.inv[itemId] = have - count;
    c.wh[itemId] = (Math.max(0, Math.floor(Number(c.wh[itemId]))) || 0) + count;
    pruneInv(p);
    pruneCounts(c.wh);
    NPCS.plusMove(p.plusById, c.whPlusById, itemId);
    saveProfileNow(p);
    Clans.save(c);
    send(p, cwhPayload(p, npc, c, { t: 'cwh_ok', op: 'put', itemId, count, fee }));
  }

  function doClanWhTake(p, msg) {
    const npc = npcForService(p, msg.npcId, 'cwh_fail', isWarehouseNpc);
    if (!npc) return;
    if (p.dead) { send(p, { t: 'cwh_fail', reason: 'dead', npcId: npc.id }); return; }
    if (p.trade || p.store) { send(p, { t: 'cwh_fail', reason: 'busy', npcId: npc.id }); return; }
    if (p.isFlagged || (p._lastCombatAt && Date.now() - p._lastCombatAt < 5000)) {
      send(p, { t: 'cwh_fail', reason: 'combat', npcId: npc.id });
      send(p, { t: 'msg', text: 'Нельзя пользоваться складом во время боя или PvP-флага!' });
      return;
    }
    const c = Clans.ofPlayer(p);
    if (!c) { send(p, { t: 'cwh_fail', reason: 'no_clan', npcId: npc.id }); return; }
    const me = Clans.memberOf(c, p.yid, p.charId);
    if (!me || !CL.canWhTake(me.rank).ok) {
      send(p, { t: 'cwh_fail', reason: 'rank', npcId: npc.id });
      return;
    }
    const itemId = String(msg.itemId || '').toLowerCase();
    if (!itemId || isBadKey(itemId)) { send(p, { t: 'cwh_fail', reason: 'args', npcId: npc.id }); return; }
    const have = Object.prototype.hasOwnProperty.call(c.wh, itemId) ? (Math.max(0, Math.floor(Number(c.wh[itemId]))) || 0) : 0;
    if (have < 1) { send(p, { t: 'cwh_fail', reason: 'none', npcId: npc.id, itemId }); return; }
    let count = Math.floor(+msg.count || 1);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count > have) count = have;
    const plusOk = NPCS.plusMoveOk(
      c.wh, c.whPlusById, p.inv, p.plusById, itemId, count,
      { toLocked: equippedCount(p, itemId), toExtraPlus: equippedPlus(p, itemId) }
    );
    if (!plusOk) { send(p, { t: 'cwh_fail', reason: 'enchanted', npcId: npc.id, itemId }); return; }
    const fit = NPCS.canFit(p.inv, itemId, count);
    if (!fit.ok) {
      send(p, { t: 'cwh_fail', reason: 'inv_full', npcId: npc.id, itemId, need: fit.need, free: fit.free });
      return;
    }
    const carry = canCarryMore(p, itemId, count);
    if (!carry.ok) {
      send(p, { t: 'cwh_fail', reason: 'weight', npcId: npc.id, itemId, weight: carry.load, maxWeight: carry.max });
      return;
    }
    c.wh[itemId] = have - count;
    p.inv[itemId] = invCount(p, itemId) + count;
    pruneCounts(c.wh);
    pruneInv(p);
    NPCS.plusMove(c.whPlusById, p.plusById, itemId);
    saveProfileNow(p);
    Clans.save(c);
    send(p, cwhPayload(p, npc, c, { t: 'cwh_ok', op: 'take', itemId, count, fee: 0 }));
    pushWeight(p);
  }

  return {
    clanTagOf,
    clanMemberOnline,
    clanOnline,
    sendClan,
    bindClan,
    clanPayload,
    sendCrest,
    pushClan,
    broadcastClanTag,
    notifyClan,
    addClanReputation,
    failClan,
    clanLeaveOnCharDelete,
    doClanInfo,
    doClanCreate,
    doClanInvite,
    doClanAccept,
    dropMember,
    doClanLeave,
    doClanKick,
    doClanPromote,
    doClanLeader,
    doClanDisband,
    doClanLevelUp,
    doClanCrest,
    cwhPayload,
    doClanWhOpen,
    doClanWhPut,
    doClanWhTake
  };
};
