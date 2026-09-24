'use strict';

/**
 * Party System Handler (L2-like)
 * 
 * Manages:
 * - Party creation, invitations, accept/decline
 * - Member management: leave, kick, dismiss, leader transfer
 * - Party loot modes: finders, random, turn
 * - Party exp distribution: pot bonus formula + level-weighted split
 * - Party member state broadcasting (pushParty)
 */

const { MSG_PARTY } = require('../ipc-hub.js');
const PARTY_LOOT_MODES = new Set(['finders', 'random', 'turn']);

function createPartyHandler(deps) {
  const {
    parties,
    players,
    send,
    sendPid: rawSendPid,
    dist2,
    checkRate,
    CS,
    G,
    EXP,
    grantExpSp,
    getNextId,
    PARTY_INVITE_R2 = 50 * 50,
    PARTY_EXP_R2 = 130 * 130,
    clusterIpc,
    IS_CLUSTER,
    CURRENT_WORKER_ID,
    findPlayerByName
  } = deps;

  const sendPid = typeof rawSendPid === 'function' ? rawSendPid : ((pid, msg) => {
    const p = players.get(pid);
    if (p && typeof send === 'function') send(p, msg);
  });

  function partyOf(p) {
    return p.partyId ? parties.get(p.partyId) : null;
  }

  function partyMembers(p) {
    const pa = partyOf(p);
    return pa ? [...pa.members].map(id => players.get(id)).filter(Boolean) : [p];
  }

  function serializeParty(pa) {
    if (!pa) return null;
    const memberDataObj = {};
    if (pa.memberData) {
      for (const [mid, md] of pa.memberData) memberDataObj[mid] = md;
    }
    return {
      id: pa.id,
      leader: pa.leader,
      members: Array.from(pa.members),
      lootMode: pa.lootMode || 'random',
      lootTurn: pa.lootTurn || 0,
      memberData: memberDataObj
    };
  }

  function sendPartyIpc(payload) {
    if (!IS_CLUSTER || !clusterIpc) return;
    if (typeof clusterIpc.broadcastParty === 'function') {
      clusterIpc.broadcastParty(payload);
    } else if (typeof clusterIpc.sendToPrimary === 'function') {
      clusterIpc.sendToPrimary(MSG_PARTY, payload);
    } else if (typeof clusterIpc.sendParty === 'function') {
      clusterIpc.sendParty(payload.action, payload);
    }
  }

  function broadcastPartySync(pa) {
    if (!IS_CLUSTER || !clusterIpc || !pa) return;
    sendPartyIpc({
      action: 'party_sync',
      party: serializeParty(pa)
    });
  }

  function broadcastPartyDisband(partyId) {
    if (!IS_CLUSTER || !clusterIpc || !partyId) return;
    sendPartyIpc({
      action: 'party_disband',
      partyId: partyId
    });
  }

  function pushParty(pa) {
    if (!pa) return;
    if (!pa.memberData) pa.memberData = new Map();

    let hasRemoteMembers = false;
    for (const id of pa.members) {
      const p = players.get(id);
      if (p) {
        const cd = (CS && typeof CS.getClass === 'function') ? CS.getClass(p.cls) : null;
        pa.memberData.set(p.pid, {
          pid: p.pid,
          name: p.name,
          cls: p.cls,
          className: cd ? cd.name : p.cls,
          level: p.level || 1,
          x: p.x,
          z: p.z,
          hp: p.hp,
          maxHp: p.maxHp || 100,
          energy: p.energy != null ? p.energy : 50,
          maxEnergy: p.maxEnergy || 50,
          isLeader: p.pid === pa.leader
        });
      } else {
        hasRemoteMembers = true;
      }
    }

    if (IS_CLUSTER && clusterIpc && hasRemoteMembers) {
      for (const id of pa.members) {
        const p = players.get(id);
        if (p) {
          sendPartyIpc({
            action: 'party_member_update',
            partyId: pa.id,
            member: {
              pid: p.pid,
              hp: p.hp,
              maxHp: p.maxHp || 100,
              energy: p.energy != null ? p.energy : 50,
              maxEnergy: p.maxEnergy || 50,
              level: p.level || 1,
              x: p.x,
              z: p.z
            }
          });
        }
      }
    }

    const snap = [...pa.members].map(id => {
      const d = pa.memberData.get(id);
      if (d) {
        d.isLeader = (d.pid === pa.leader);
        return d;
      }
      return null;
    }).filter(Boolean);

    pa.members.forEach(id => sendPid(id, {
      t: 'party',
      leader: pa.leader,
      members: snap,
      lootMode: pa.lootMode || 'random'
    }));
  }

  function splitExpToParty(p, totalExp, mobLevel, mobMeta) {
    mobMeta = mobMeta || {};
    // C1: рядом по дистанции, не hunt-зона. Мёртвые не в котле.
    const mem = partyMembers(p).filter((m) =>
      m && !m.dead && (m.hp == null || m.hp > 0) &&
      dist2(m.x, m.z, p.x, p.z) <= PARTY_EXP_R2
    );
    const payloadBase = {
      mobId: mobMeta.mobId || null,
      mobName: mobMeta.mobName || null,
      mobLevel: mobLevel != null ? mobLevel : null
    };
    const raw = Math.max(0, Math.floor(+totalExp || 0));
    if (mem.length <= 1) {
      const gained = Math.floor(raw * G.expModifier(p.level, mobLevel));
      const g = grantExpSp(p, gained, mobLevel);
      send(p, Object.assign({
        t: 'reward_exp',
        exp: g.exp,
        sp: g.sp,
        level: p.level,
        selfExp: p.exp,
        selfSp: p.sp,
        expToNext: EXP.expToNext(p.level)
      }, payloadBase));
      return;
    }
    // C1: pot × (1 + 0.1×(n−1)), сплит по уровню, penalty — у каждого свой.
    const bonus = (EXP.partyExpBonus ? EXP.partyExpBonus(mem.length) : (1 + 0.1 * (mem.length - 1)));
    const pot = Math.floor(raw * bonus);
    const sumLvl = mem.reduce((s, m) => s + m.level, 0) || 1;
    mem.forEach((m) => {
      const share = Math.floor(pot * m.level / sumLvl);
      const gained = Math.floor(share * G.expModifier(m.level, mobLevel));
      const g = grantExpSp(m, gained, mobLevel);
      send(m, Object.assign({
        t: 'party_exp',
        exp: g.exp,
        sp: g.sp,
        level: m.level,
        selfExp: m.exp,
        selfSp: m.sp,
        expToNext: EXP.expToNext(m.level),
        partyBonus: bonus,
        partySize: mem.length
      }, payloadBase));
    });
  }

  function handleIpcParty(payload) {
    if (!payload || !payload.action) return;
    const action = payload.action;

    if (action === 'party_sync') {
      const sp = payload.party;
      if (!sp || !sp.id) return;
      let pa = parties.get(sp.id);
      if (!pa) {
        pa = {
          id: sp.id,
          leader: sp.leader,
          members: new Set(sp.members),
          lootMode: sp.lootMode || 'random',
          lootTurn: sp.lootTurn || 0,
          memberData: new Map()
        };
        parties.set(pa.id, pa);
      } else {
        pa.leader = sp.leader;
        pa.members = new Set(sp.members);
        pa.lootMode = sp.lootMode || 'random';
        pa.lootTurn = sp.lootTurn || 0;
        if (!pa.memberData) pa.memberData = new Map();
      }
      if (sp.memberData) {
        for (const k of Object.keys(sp.memberData)) {
          pa.memberData.set(+k, sp.memberData[k]);
        }
      }
      for (const mid of pa.members) {
        const localP = players.get(mid);
        if (localP) localP.partyId = pa.id;
      }
      for (const [, pl] of players) {
        if (pl.partyId === pa.id && !pa.members.has(pl.pid)) {
          pl.partyId = null;
          send(pl, { t: 'party', leader: null, members: [] });
        }
      }
      pushParty(pa);
      return;
    }

    if (action === 'party_member_update') {
      const partyId = payload.partyId;
      const mem = payload.member;
      if (!partyId || !mem || !mem.pid) return;
      const pa = parties.get(partyId);
      if (pa && pa.memberData) {
        const prev = pa.memberData.get(mem.pid) || {};
        pa.memberData.set(mem.pid, Object.assign(prev, mem));
        const localMembers = [...pa.members].filter(id => players.has(id));
        if (localMembers.length > 0) {
          const snap = [...pa.members].map(id => {
            const d = pa.memberData.get(id);
            if (d) {
              d.isLeader = (d.pid === pa.leader);
              return d;
            }
            return null;
          }).filter(Boolean);
          localMembers.forEach(id => sendPid(id, {
            t: 'party',
            leader: pa.leader,
            members: snap,
            lootMode: pa.lootMode || 'random'
          }));
        }
      }
      return;
    }

    if (action === 'party_disband') {
      const partyId = payload.partyId;
      if (!partyId) return;
      const pa = parties.get(partyId);
      if (pa) {
        for (const mid of pa.members) {
          const localP = players.get(mid);
          if (localP) {
            localP.partyId = null;
            send(localP, { t: 'party', leader: null, members: [] });
          }
        }
        parties.delete(partyId);
      }
      return;
    }

    if (action === 'party_remote_invite') {
      let tgt = players.get(payload.targetPid);
      if (!tgt && payload.targetName && typeof findPlayerByName === 'function') {
        tgt = findPlayerByName(payload.targetName);
      }
      if (!tgt) return;
      if (tgt.partyId) {
        const tgtPa = partyOf(tgt);
        if (tgtPa && tgtPa.members.size > 1) {
          sendPid(payload.fromPid, { t: 'msg', text: tgt.name + ' уже в группе.' });
          return;
        }
      }
      tgt._inviteFrom = payload.fromPid;
      tgt._inviteFromName = payload.fromName;
      send(tgt, { t: 'party_invite_dialog', from: payload.fromPid, fromName: payload.fromName });
      send(tgt, { t: 'msg', text: payload.fromName + ' зовёт в группу. /accept ' + payload.fromName });
      return;
    }

    if (action === 'party_remote_accept') {
      const fromPid = payload.leaderPid;
      const from = players.get(fromPid);
      if (!from) return;
      let pa = partyOf(from);
      if (!pa) {
        const id = typeof getNextId === 'function' ? getNextId() : ('pt_' + Date.now());
        pa = { id: id, leader: from.pid, members: new Set([from.pid]), lootMode: 'random', lootTurn: 0, memberData: new Map() };
        parties.set(pa.id, pa);
        from.partyId = pa.id;
      }
      if (pa.members.size >= 9) {
        sendPid(payload.joinerPid, { t: 'msg', text: 'Группа полна или распалась.' });
        return;
      }
      if (!pa.memberData) pa.memberData = new Map();
      if (payload.joinerData) pa.memberData.set(payload.joinerPid, payload.joinerData);
      pa.members.add(payload.joinerPid);
      pushParty(pa);
      broadcastPartySync(pa);
      for (const id of pa.members) {
        const mem = players.get(id);
        if (mem) send(mem, { t: 'msg', text: (payload.joinerData ? payload.joinerData.name : 'Игрок') + ' вступил в группу.' });
      }
      return;
    }
  }

  function handlePartyMessage(p, msg) {
    switch (msg.t) {
      case 'party_invite': {
        const targetName = msg.name || msg.target || '';
        let tgt = players.get(msg.pid | 0);
        if (!tgt && targetName && typeof findPlayerByName === 'function') {
          tgt = findPlayerByName(targetName);
        }
        if (!tgt) {
          if (IS_CLUSTER && clusterIpc) {
            sendPartyIpc({
              action: 'party_remote_invite',
              fromPid: p.pid,
              fromName: p.name,
              targetPid: msg.pid | 0,
              targetName: targetName
            });
            send(p, { t: 'msg', text: 'Приглашение отправлено: ' + (targetName || msg.pid) });
            return true;
          }
          return true;
        }
        if (tgt.pid === p.pid) {
          send(p, { t: 'msg', text: 'Нельзя пригласить самого себя.' });
          return true;
        }
        if (tgt.partyId) {
          const tgtPa = partyOf(tgt);
          if (!tgtPa || tgtPa.members.size <= 1) {
            if (tgtPa) {
              parties.delete(tgtPa.id);
              broadcastPartyDisband(tgtPa.id);
            }
            tgt.partyId = null;
          } else {
            send(p, { t: 'msg', text: 'Игрок уже в группе.' });
            return true;
          }
        }
        let pa = partyOf(p);
        if (pa && pa.members.size <= 1) {
          parties.delete(pa.id);
          broadcastPartyDisband(pa.id);
          p.partyId = null;
          pa = null;
        }
        if (p.partyId && partyOf(p) && partyOf(p).leader !== p.pid) {
          send(p, { t: 'msg', text: 'Только лидер зовёт в группу.' });
          return true;
        }
        if (!IS_CLUSTER && dist2(p.x, p.z, tgt.x, tgt.z) > PARTY_INVITE_R2) {
          send(p, { t: 'msg', text: 'Игрок слишком далеко.' });
          return true;
        }
        if (pa && pa.members.size >= 9) {
          send(p, { t: 'msg', text: 'Группа полна.' });
          return true;
        }
        tgt._inviteFrom = p.pid;
        send(tgt, { t: 'party_invite_dialog', from: p.pid, fromName: p.name });
        send(tgt, { t: 'msg', text: p.name + ' зовёт в группу. /accept ' + p.name });
        send(p, { t: 'msg', text: 'Приглашение отправлено: ' + tgt.name });
        return true;
      }

      case 'party_accept': {
        const fromPid = p._inviteFrom;
        if (fromPid == null) {
          send(p, { t: 'msg', text: 'Нет приглашения в группу.' });
          return true;
        }
        const from = players.get(fromPid);
        if (!from) {
          if (IS_CLUSTER && clusterIpc) {
            sendPartyIpc({
              action: 'party_remote_accept',
              leaderPid: fromPid,
              joinerPid: p.pid,
              joinerData: {
                pid: p.pid,
                name: p.name,
                cls: p.cls,
                level: p.level || 1,
                x: p.x,
                z: p.z,
                hp: p.hp,
                maxHp: p.maxHp || 100,
                energy: p.energy != null ? p.energy : 50,
                maxEnergy: p.maxEnergy || 50
              }
            });
            p._inviteFrom = null;
            return true;
          }
          p._inviteFrom = null;
          send(p, { t: 'msg', text: 'Приглашение устарело.' });
          return true;
        }
        let pa = partyOf(from);
        if (!pa) {
          const id = typeof getNextId === 'function' ? getNextId() : ('pt_' + Date.now());
          pa = { id: id, leader: from.pid, members: new Set([from.pid]), lootMode: 'random', lootTurn: 0, memberData: new Map() };
          parties.set(pa.id, pa);
          from.partyId = pa.id;
        }
        if (pa.members.size >= 9) {
          p._inviteFrom = null;
          send(p, { t: 'msg', text: 'Группа полна или распалась.' });
          return true;
        }
        p._inviteFrom = null;
        if (p.partyId) {
          const old = partyOf(p);
          if (old) {
            old.members.delete(p.pid);
            if (old.members.size <= 1) {
              for (const id of old.members) {
                const mem = players.get(id);
                if (mem) {
                  mem.partyId = null;
                  send(mem, { t: 'party', leader: null, members: [] });
                }
              }
              parties.delete(old.id);
              broadcastPartyDisband(old.id);
            } else {
              if (old.leader === p.pid) old.leader = [...old.members][0];
              pushParty(old);
              broadcastPartySync(old);
            }
          }
          p.partyId = null;
        }
        pa.members.add(p.pid);
        p.partyId = pa.id;
        pushParty(pa);
        broadcastPartySync(pa);
        for (const id of pa.members) {
          const mem = players.get(id);
          if (mem) send(mem, { t: 'msg', text: p.name + ' вступил в группу.' });
        }
        return true;
      }

      case 'party_leave': {
        const pa = partyOf(p);
        if (!pa) {
          p.partyId = null;
          send(p, { t: 'party', leader: null, members: [] });
          return true;
        }
        pa.members.delete(p.pid);
        p.partyId = null;
        send(p, { t: 'party', leader: null, members: [] });
        send(p, { t: 'msg', text: 'Вы вышли из группы.' });

        if (pa.members.size <= 1) {
          for (const id of pa.members) {
            const mem = players.get(id);
            if (mem) {
              mem.partyId = null;
              send(mem, { t: 'party', leader: null, members: [] });
              send(mem, { t: 'msg', text: 'Группа распущена (остался один игрок).' });
            }
          }
          parties.delete(pa.id);
          broadcastPartyDisband(pa.id);
        } else {
          if (pa.leader === p.pid) {
            pa.leader = [...pa.members][0];
            const newLeader = players.get(pa.leader);
            if (newLeader) send(newLeader, { t: 'msg', text: 'Вы стали лидером группы.' });
          }
          pushParty(pa);
          broadcastPartySync(pa);
          for (const id of pa.members) {
            const mem = players.get(id);
            if (mem) send(mem, { t: 'msg', text: p.name + ' вышел из группы.' });
          }
        }
        return true;
      }

      case 'party_kick': {
        const pa = partyOf(p);
        if (!pa) {
          send(p, { t: 'msg', text: 'Вы не в группе.' });
          return true;
        }
        if (pa.leader !== p.pid) {
          send(p, { t: 'msg', text: 'Только лидер может исключать из группы.' });
          return true;
        }
        const tgtPid = msg.pid != null ? (msg.pid | 0) : null;
        if (tgtPid == null || tgtPid === p.pid) {
          send(p, { t: 'msg', text: 'Нельзя исключить самого себя.' });
          return true;
        }
        if (!pa.members.has(tgtPid)) {
          send(p, { t: 'msg', text: 'Игрок не в вашей группе.' });
          return true;
        }
        pa.members.delete(tgtPid);
        const tgt = players.get(tgtPid);
        if (tgt) {
          tgt.partyId = null;
          send(tgt, { t: 'party', leader: null, members: [] });
          send(tgt, { t: 'msg', text: 'Вы исключены из группы.' });
        } else {
          sendPid(tgtPid, { t: 'party', leader: null, members: [] });
          sendPid(tgtPid, { t: 'msg', text: 'Вы исключены из группы.' });
        }
        if (pa.members.size <= 1) {
          for (const id of pa.members) {
            const mem = players.get(id);
            if (mem) {
              mem.partyId = null;
              send(mem, { t: 'party', leader: null, members: [] });
              send(mem, { t: 'msg', text: 'Группа распущена (остался один игрок).' });
            }
          }
          parties.delete(pa.id);
          broadcastPartyDisband(pa.id);
        } else {
          pushParty(pa);
          broadcastPartySync(pa);
          for (const id of pa.members) {
            const mem = players.get(id);
            if (mem) send(mem, { t: 'msg', text: (tgt ? tgt.name : 'Игрок') + ' исключён из группы.' });
          }
        }
        return true;
      }

      case 'party_dismiss': {
        const pa = partyOf(p);
        if (!pa) {
          p.partyId = null;
          send(p, { t: 'party', leader: null, members: [] });
          return true;
        }
        if (pa.leader !== p.pid) {
          send(p, { t: 'msg', text: 'Только лидер может распустить группу.' });
          return true;
        }
        for (const id of pa.members) {
          const mem = players.get(id);
          if (mem) {
            mem.partyId = null;
            send(mem, { t: 'party', leader: null, members: [] });
            send(mem, { t: 'msg', text: 'Группа распущена лидером.' });
          } else {
            sendPid(id, { t: 'party', leader: null, members: [] });
            sendPid(id, { t: 'msg', text: 'Группа распущена лидером.' });
          }
        }
        parties.delete(pa.id);
        broadcastPartyDisband(pa.id);
        return true;
      }

      case 'party_leader': {
        const pa = partyOf(p);
        if (!pa) return true;
        if (pa.leader !== p.pid) {
          send(p, { t: 'msg', text: 'Только лидер может передать права лидера.' });
          return true;
        }
        const tgtPid = msg.pid != null ? (msg.pid | 0) : null;
        if (tgtPid == null || !pa.members.has(tgtPid)) {
          send(p, { t: 'msg', text: 'Выберите члена группы.' });
          return true;
        }
        pa.leader = tgtPid;
        pushParty(pa);
        broadcastPartySync(pa);
        const newLeader = players.get(tgtPid);
        for (const id of pa.members) {
          const mem = players.get(id);
          if (mem) send(mem, { t: 'msg', text: (newLeader ? newLeader.name : 'Игрок') + ' назначен лидером группы.' });
        }
        return true;
      }

      case 'party_loot': {
        const pa = partyOf(p);
        if (!pa) {
          send(p, { t: 'msg', text: 'Вы не в группе.' });
          return true;
        }
        if (pa.leader !== p.pid) {
          send(p, { t: 'msg', text: 'Режим лута меняет только лидер группы.' });
          return true;
        }
        const mode = String(msg.mode || '').toLowerCase();
        if (!PARTY_LOOT_MODES.has(mode)) {
          send(p, { t: 'msg', text: 'Режимы лута: finders, random, turn.' });
          return true;
        }
        pa.lootMode = mode;
        pa.lootTurn = 0;
        const label = { finders: 'кто нашёл — того и лут', random: 'случайно', turn: 'по очереди' };
        for (const id of pa.members) {
          sendPid(id, { t: 'msg', text: 'Режим лута группы: ' + (label[mode] || mode) + '.' });
        }
        pushParty(pa);
        broadcastPartySync(pa);
        return true;
      }

      default:
        return false;
    }
  }

  return {
    PARTY_LOOT_MODES,
    partyOf,
    partyMembers,
    pushParty,
    splitExpToParty,
    handlePartyMessage,
    handleIpcParty
  };
}

module.exports = {
  PARTY_LOOT_MODES,
  createPartyHandler
};
