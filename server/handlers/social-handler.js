// SERVER / HANDLERS / SOCIAL-HANDLER.JS
// Чат-каналы (all/shout/party/clan/tell), список друзей и репорты
'use strict';
const MR = require('../../shared/moderation-rules.js');
const Mod = require('../moderation.js');
const Clans = require('../clans-store.js');

const CHAT_MAX_LEN = 120;
const CHAT_CHANNELS = new Set(['all', 'shout', 'party', 'clan', 'tell']);
const MAX_FRIENDS = 50;

module.exports = function createSocialHandler(ctx) {
  const {
    players,
    pidByYid,
    send,
    sendPid,
    broadcastAOI,
    broadcastRegion,
    partyOf,
    sendClan,
    isGM,
    handleGmCommand,
    sanitizeCharName,
    saveProfileNow,
    isBadKey,
    TR
  } = ctx;

  /** Игрок онлайн по имени (регистр не важен). Нужен для /tell и команд UI. */
  function findPlayerByName(name) {
    const want = String(name || '').trim().toLowerCase();
    if (!want) return null;
    for (const [, o] of players) {
      if (String(o.name || '').toLowerCase() === want) return o;
    }
    return null;
  }

  function doChat(p, msg) {
    const text = String(msg.text || '').slice(0, CHAT_MAX_LEN).trim();
    if (!text) return;
    if (text.startsWith('//')) {
      if (!isGM(p)) {
        send(p, { t: 'chat_fail', ch: 'all', reason: 'access_denied' });
        send(p, { t: 'msg', text: 'У вас нет прав администратора.' });
        Mod.log('security', { by: p.name, yid: p.yid, text: text, reason: 'unauthorized_gm_cmd' });
        return;
      }
      handleGmCommand(p, text);
      return;
    }
    const clientIp = p.clientIp || (p.ws && (p.ws.clientIp || p.ws.remoteAddress)) || '';
    const mute = Mod.muteInfo(p.yid) || (clientIp ? Mod.muteIpInfo(clientIp) : null);
    if (mute) {
      send(p, { t: 'chat_fail', ch: String(msg.ch || 'all'), reason: 'muted', until: mute.until, why: mute.reason });
      return;
    }
    let ch = String(msg.ch || 'all').toLowerCase();
    if (!CHAT_CHANNELS.has(ch)) ch = 'all';

    // Защита от спам-ботов на новых гостевых аккаунтах
    if (p.yid && (p.yid.startsWith('guest_') || p.yid.startsWith('local_'))) {
      if (ch === 'shout' && (p.level || 1) < 3) {
        send(p, { t: 'chat_fail', ch: 'shout', reason: 'level_low' });
        send(p, { t: 'msg', text: 'Крик в общий чат доступен с 3-го уровня.' });
        return;
      }
      if (ch === 'all') {
        const now = Date.now();
        if (p._lastAllChatAt && (now - p._lastAllChatAt < 3000)) {
          send(p, { t: 'chat_fail', ch: 'all', reason: 'cooldown' });
          send(p, { t: 'msg', text: 'Сообщения в чат доступны раз в 3 секунды.' });
          return;
        }
        p._lastAllChatAt = now;
      }
    }

    if (ch === 'party') {
      const pa = partyOf(p);
      if (!pa || pa.members.size <= 1) {
        send(p, { t: 'chat_fail', ch: ch, reason: 'no_party' });
        return;
      }
      const pack = { t: 'chat', ch: 'party', name: p.name, text: text };
      for (const pid of pa.members) sendPid(pid, pack);
      Mod.log('chat', { yid: p.yid, name: p.name, ch: 'party', text: text });
      return;
    }

    if (ch === 'tell') {
      const to = sanitizeCharName(msg.to);
      if (!to) {
        send(p, { t: 'chat_fail', ch: ch, reason: 'no_target' });
        return;
      }
      const tgt = findPlayerByName(to);
      if (!tgt) {
        if (typeof ctx.onTellCrossCluster === 'function') {
          ctx.onTellCrossCluster(p, to, text);
          return;
        }
        send(p, { t: 'chat_fail', ch: ch, reason: 'offline', to: to });
        return;
      }
      if (tgt.pid === p.pid) {
        send(p, { t: 'chat_fail', ch: ch, reason: 'self' });
        return;
      }
      send(tgt, { t: 'chat', ch: 'tell', name: p.name, to: tgt.name, text: text });
      send(p, { t: 'chat', ch: 'tell', name: p.name, to: tgt.name, text: text, out: true });
      Mod.log('chat', { yid: p.yid, name: p.name, ch: 'tell', to: tgt.name, len: text.length });
      return;
    }

    if (ch === 'clan') {
      const clan = Clans.ofPlayer(p);
      if (!clan) {
        send(p, { t: 'chat_fail', ch: ch, reason: 'no_clan' });
        return;
      }
      sendClan(clan, { t: 'chat', ch: 'clan', name: p.name, text: text });
      Mod.log('chat', { yid: p.yid, name: p.name, ch: 'clan', text: text });
      if (ctx.clusterIpc && typeof ctx.clusterIpc.broadcastChat === 'function') {
        ctx.clusterIpc.broadcastChat('clan', p.name, text, { clanId: clan.id });
      }
      return;
    }

    if (ch === 'shout') {
      const now = Date.now();
      if (p._lastShoutAt && (now - p._lastShoutAt < 4000)) {
        send(p, { t: 'chat_fail', ch: 'shout', reason: 'cooldown', leftMs: 4000 - (now - p._lastShoutAt) });
        send(p, { t: 'msg', text: 'Крик доступен раз в 4 секунды.' });
        return;
      }
      p._lastShoutAt = now;
      broadcastRegion(p.region, { t: 'chat', ch: 'shout', name: p.name, text: text });
      Mod.log('chat', { yid: p.yid, name: p.name, ch: 'shout', text: text });
      if (ctx.clusterIpc && typeof ctx.clusterIpc.broadcastChat === 'function') {
        ctx.clusterIpc.broadcastChat('shout', p.name, text, { region: p.region });
      }
      return;
    }

    broadcastAOI(p, { t: 'chat', ch: 'all', name: p.name, text: text });
    Mod.log('chat', { yid: p.yid, name: p.name, ch: 'all', text: text });
  }

  function doReport(p, msg) {
    const name = sanitizeCharName(msg && msg.name);
    const text = String((msg && (msg.text || msg.reason)) || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MR.REPORT_MAX);
    if (!name) { send(p, { t: 'report_fail', reason: 'args' }); return; }
    let tgt = findPlayerByName(name);
    if (!tgt && ctx.IS_CLUSTER && ctx.clusterIpc && typeof ctx.clusterIpc.findPlayerByName === 'function') {
      const remote = ctx.clusterIpc.findPlayerByName(name);
      if (remote && remote.online) {
        tgt = { pid: remote.pid, yid: remote.yid, name: remote.name };
      }
    }
    if (!tgt) { send(p, { t: 'report_fail', reason: 'offline', name: name }); return; }
    if (tgt.pid === p.pid || (tgt.yid && tgt.yid === p.yid)) { send(p, { t: 'report_fail', reason: 'self' }); return; }
    if (p._lastReport && Date.now() - p._lastReport < MR.REPORT_COOLDOWN_MS) {
      send(p, { t: 'report_fail', reason: 'rate' });
      return;
    }
    p._lastReport = Date.now();
    const r = Mod.report({
      fromYid: p.yid, fromName: p.name,
      targetYid: tgt.yid, targetName: tgt.name, text: text || 'report'
    });
    if (!r.ok) { send(p, { t: 'report_fail', reason: r.reason || 'args' }); return; }
    send(p, { t: 'report_ok', name: tgt.name });
  }

  function friendIndex(p, yid) {
    if (!Array.isArray(p.friends)) return -1;
    for (let i = 0; i < p.friends.length; i++) if (p.friends[i].yid === yid) return i;
    return -1;
  }

  function friendsPayload(p) {
    const list = (p.friends || []).map((f) => {
      const pid = pidByYid.get(f.yid);
      const online = pid != null ? players.get(pid) : null;
      const isOnline = !!online || (ctx.clusterIpc && typeof ctx.clusterIpc.isPlayerOnline === 'function' && ctx.clusterIpc.isPlayerOnline(f.yid));
      const crossPlayer = (!online && isOnline && ctx.clusterIpc && typeof ctx.clusterIpc.getPlayer === 'function') ? ctx.clusterIpc.getPlayer(f.yid) : null;
      return {
        charId: f.charId || null,
        name: online ? online.name : (crossPlayer && crossPlayer.name ? crossPlayer.name : f.name),
        online: !!isOnline,
        level: online ? online.level : (crossPlayer && crossPlayer.level ? crossPlayer.level : null),
        region: online ? online.region : (crossPlayer && crossPlayer.region ? crossPlayer.region : null),
        pid: online ? online.pid : (crossPlayer && crossPlayer.pid ? crossPlayer.pid : null)
      };
    });
    list.sort((a, b) => (a.online === b.online)
      ? String(a.name).localeCompare(String(b.name))
      : (a.online ? -1 : 1));
    return { t: 'friends', friends: list, max: MAX_FRIENDS };
  }

  function doFriendList(p) {
    send(p, friendsPayload(p));
  }

  function doFriendAdd(p, msg) {
    const name = sanitizeCharName(msg.name);
    if (!name) {
      send(p, { t: 'friend_fail', reason: 'args' });
      return;
    }
    const q = findPlayerByName(name);
    if (!q) {
      if (ctx.IS_CLUSTER && ctx.clusterIpc && typeof ctx.clusterIpc.findPlayerByName === 'function' && typeof ctx.clusterIpc.sendFriendIpc === 'function') {
        const remote = ctx.clusterIpc.findPlayerByName(name);
        if (!remote || !remote.online) {
          send(p, { t: 'friend_fail', reason: 'offline', name: name });
          return;
        }
        if (remote.pid === p.pid || remote.yid === p.yid) {
          send(p, { t: 'friend_fail', reason: 'self' });
          return;
        }
        if (friendIndex(p, remote.yid) >= 0) {
          send(p, { t: 'friend_fail', reason: 'already', name: remote.name || name });
          return;
        }
        if ((p.friends || []).length >= MAX_FRIENDS) {
          send(p, { t: 'friend_fail', reason: 'full' });
          return;
        }
        ctx.clusterIpc.sendFriendIpc({
          action: 'friend_remote_request',
          fromPid: p.pid,
          fromYid: p.yid,
          fromName: p.name,
          fromWorkerId: ctx.CURRENT_WORKER_ID || null,
          targetPid: remote.pid,
          targetYid: remote.yid,
          targetName: remote.name || name
        }, remote.workerId || null);
        return;
      }
      send(p, { t: 'friend_fail', reason: 'offline', name: name });
      return;
    }
    if (q.pid === p.pid) {
      send(p, { t: 'friend_fail', reason: 'self' });
      return;
    }
    if (friendIndex(p, q.yid) >= 0) {
      send(p, { t: 'friend_fail', reason: 'already', name: q.name });
      return;
    }
    if ((p.friends || []).length >= MAX_FRIENDS || (q.friends || []).length >= MAX_FRIENDS) {
      send(p, { t: 'friend_fail', reason: 'full' });
      return;
    }
    q._friendFrom = { pid: p.pid, at: Date.now() };
    send(q, { t: 'friend_request', from: p.pid, fromName: p.name });
    send(q, { t: 'msg', text: p.name + ' предлагает дружбу. /friend_accept' });
    send(p, { t: 'msg', text: 'Запрос дружбы отправлен: ' + q.name });
  }

  function doFriendAccept(p, msg) {
    const from = p._friendFrom;
    const wantPid = (msg && msg.pid != null) ? (msg.pid | 0) : (from ? from.pid : null);
    if (!from || wantPid == null || from.pid !== wantPid || Date.now() - from.at > TR.TRADE_TTL_MS) {
      p._friendFrom = null;
      send(p, { t: 'friend_fail', reason: 'no_request' });
      return;
    }
    const q = players.get(wantPid);
    p._friendFrom = null;
    if (!q) {
      if (ctx.IS_CLUSTER && ctx.clusterIpc && typeof ctx.clusterIpc.sendFriendIpc === 'function' && from.yid) {
        if ((p.friends || []).length >= MAX_FRIENDS) {
          send(p, { t: 'friend_fail', reason: 'full' });
          return;
        }
        ctx.clusterIpc.sendFriendIpc({
          action: 'friend_remote_accept',
          fromPid: wantPid,
          fromYid: from.yid,
          fromName: from.name,
          acceptPid: p.pid,
          acceptYid: p.yid,
          acceptName: p.name,
          acceptWorkerId: ctx.CURRENT_WORKER_ID || null
        }, from.fromWorkerId || null);
        return;
      }
      send(p, { t: 'friend_fail', reason: 'offline' });
      return;
    }
    if ((p.friends || []).length >= MAX_FRIENDS || (q.friends || []).length >= MAX_FRIENDS) {
      send(p, { t: 'friend_fail', reason: 'full' });
      return;
    }
    if (!Array.isArray(p.friends)) p.friends = [];
    if (!Array.isArray(q.friends)) q.friends = [];
    if (friendIndex(p, q.yid) < 0) p.friends.push({ yid: q.yid, name: q.name });
    if (friendIndex(q, p.yid) < 0) q.friends.push({ yid: p.yid, name: p.name });
    saveProfileNow(p);
    saveProfileNow(q);
    send(p, { t: 'msg', text: 'Теперь вы друзья: ' + q.name });
    send(q, { t: 'msg', text: 'Теперь вы друзья: ' + p.name });
    send(p, friendsPayload(p));
    send(q, friendsPayload(q));
  }

  function doFriendRemove(p, msg) {
    const name = sanitizeCharName(msg.name);
    const yid = msg.yid != null ? String(msg.yid).slice(0, 64) : null;
    let idx = -1;
    if (yid && !isBadKey(yid)) idx = friendIndex(p, yid);
    if (idx < 0 && name) {
      const low = name.toLowerCase();
      idx = (p.friends || []).findIndex((f) => String(f.name || '').toLowerCase() === low);
    }
    if (idx < 0) {
      send(p, { t: 'friend_fail', reason: 'not_friend', name: name || yid || '' });
      return;
    }
    const gone = p.friends[idx];
    p.friends.splice(idx, 1);
    saveProfileNow(p);
    const pid = pidByYid.get(gone.yid);
    const q = pid != null ? players.get(pid) : null;
    if (q) {
      const back = friendIndex(q, p.yid);
      if (back >= 0) {
        q.friends.splice(back, 1);
        saveProfileNow(q);
        send(q, { t: 'msg', text: p.name + ' удалил вас из друзей.' });
        send(q, friendsPayload(q));
      }
    } else if (ctx.IS_CLUSTER && ctx.clusterIpc && typeof ctx.clusterIpc.sendFriendIpc === 'function') {
      const remote = typeof ctx.clusterIpc.getPlayer === 'function' ? ctx.clusterIpc.getPlayer(gone.yid) : null;
      if (remote && remote.online) {
        ctx.clusterIpc.sendFriendIpc({
          action: 'friend_remote_remove',
          targetYid: gone.yid,
          removerYid: p.yid,
          removerName: p.name
        }, remote.workerId || null);
      }
    }
    send(p, { t: 'msg', text: 'Удалён из друзей: ' + gone.name });
    send(p, friendsPayload(p));
  }

  function notifyFriends(p, online) {
    const remoteByWorker = new Map();
    for (const f of (p.friends || [])) {
      const pid = pidByYid.get(f.yid);
      const q = pid != null ? players.get(pid) : null;
      if (q) {
        send(q, { t: 'friend_status', name: p.name, online: !!online });
        continue;
      }
      if (ctx.IS_CLUSTER && ctx.clusterIpc && typeof ctx.clusterIpc.sendFriendIpc === 'function' && f.yid) {
        const remote = typeof ctx.clusterIpc.getPlayer === 'function' ? ctx.clusterIpc.getPlayer(f.yid) : null;
        if (remote && remote.online) {
          const wId = remote.workerId || 0;
          let list = remoteByWorker.get(wId);
          if (!list) {
            list = [];
            remoteByWorker.set(wId, list);
          }
          list.push(f.yid);
        }
      }
    }
    for (const [wId, targetYids] of remoteByWorker) {
      ctx.clusterIpc.sendFriendIpc({
        action: 'friend_status_batch',
        senderName: p.name,
        online: !!online,
        targetYids
      }, wId || null);
    }
  }

  function handleIpcFriend(payload) {
    if (!payload || !payload.action) return;
    const action = payload.action;

    if (action === 'friend_remote_request') {
      let q = players.get(payload.targetPid);
      if (!q && payload.targetYid) {
        const lpid = pidByYid.get(payload.targetYid);
        if (lpid != null) q = players.get(lpid);
      }
      if (!q && payload.targetName) q = findPlayerByName(payload.targetName);
      if (!q) {
        sendPid(payload.fromPid, { t: 'friend_fail', reason: 'offline', name: payload.targetName || '' });
        return;
      }
      if (q.pid === payload.fromPid || q.yid === payload.fromYid) {
        sendPid(payload.fromPid, { t: 'friend_fail', reason: 'self' });
        return;
      }
      if (friendIndex(q, payload.fromYid) >= 0) {
        sendPid(payload.fromPid, { t: 'friend_fail', reason: 'already', name: q.name });
        return;
      }
      if ((q.friends || []).length >= MAX_FRIENDS) {
        sendPid(payload.fromPid, { t: 'friend_fail', reason: 'full' });
        return;
      }
      q._friendFrom = {
        pid: payload.fromPid,
        yid: payload.fromYid,
        name: payload.fromName,
        at: Date.now(),
        remote: true,
        fromWorkerId: payload.fromWorkerId || null
      };
      send(q, { t: 'friend_request', from: payload.fromPid, fromName: payload.fromName });
      send(q, { t: 'msg', text: payload.fromName + ' предлагает дружбу. /friend_accept' });
      sendPid(payload.fromPid, { t: 'msg', text: 'Запрос дружбы отправлен: ' + q.name });
      return;
    }

    if (action === 'friend_remote_accept') {
      let q = players.get(payload.fromPid);
      if (!q && payload.fromYid) {
        const lpid = pidByYid.get(payload.fromYid);
        if (lpid != null) q = players.get(lpid);
      }
      if (!q) {
        sendPid(payload.acceptPid, { t: 'friend_fail', reason: 'offline' });
        return;
      }
      if ((q.friends || []).length >= MAX_FRIENDS) {
        sendPid(payload.acceptPid, { t: 'friend_fail', reason: 'full' });
        return;
      }
      if (!Array.isArray(q.friends)) q.friends = [];
      if (friendIndex(q, payload.acceptYid) < 0) {
        q.friends.push({ yid: payload.acceptYid, name: payload.acceptName });
      }
      saveProfileNow(q);
      send(q, { t: 'msg', text: 'Теперь вы друзья: ' + payload.acceptName });
      send(q, friendsPayload(q));
      if (ctx.clusterIpc && typeof ctx.clusterIpc.sendFriendIpc === 'function') {
        ctx.clusterIpc.sendFriendIpc({
          action: 'friend_remote_accept_ack',
          acceptPid: payload.acceptPid,
          acceptYid: payload.acceptYid,
          friendYid: q.yid,
          friendName: q.name
        }, payload.acceptWorkerId || null);
      }
      return;
    }

    if (action === 'friend_remote_accept_ack') {
      let p = players.get(payload.acceptPid);
      if (!p && payload.acceptYid) {
        const lpid = pidByYid.get(payload.acceptYid);
        if (lpid != null) p = players.get(lpid);
      }
      if (!p) return;
      if ((p.friends || []).length >= MAX_FRIENDS) return;
      if (!Array.isArray(p.friends)) p.friends = [];
      if (friendIndex(p, payload.friendYid) < 0) {
        p.friends.push({ yid: payload.friendYid, name: payload.friendName });
      }
      saveProfileNow(p);
      send(p, { t: 'msg', text: 'Теперь вы друзья: ' + payload.friendName });
      send(p, friendsPayload(p));
      return;
    }

    if (action === 'friend_remote_remove') {
      const pid = payload.targetYid ? pidByYid.get(payload.targetYid) : null;
      const q = pid != null ? players.get(pid) : null;
      if (!q) return;
      const back = friendIndex(q, payload.removerYid);
      if (back >= 0) {
        q.friends.splice(back, 1);
        saveProfileNow(q);
        send(q, { t: 'msg', text: (payload.removerName || 'Игрок') + ' удалил вас из друзей.' });
        send(q, friendsPayload(q));
      }
      return;
    }

    if (action === 'friend_status_batch' && Array.isArray(payload.targetYids)) {
      for (let i = 0; i < payload.targetYids.length; i++) {
        const pid = pidByYid.get(payload.targetYids[i]);
        const q = pid != null ? players.get(pid) : null;
        if (q) {
          send(q, { t: 'friend_status', name: payload.senderName, online: !!payload.online });
        }
      }
    }
  }

  return {
    findPlayerByName,
    doChat,
    doReport,
    friendIndex,
    friendsPayload,
    doFriendList,
    doFriendAdd,
    doFriendAccept,
    doFriendRemove,
    notifyFriends,
    handleIpcFriend
  };
};
