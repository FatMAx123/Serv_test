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
    const mute = Mod.muteInfo(p.yid);
    if (mute) {
      send(p, { t: 'chat_fail', ch: String(msg.ch || 'all'), reason: 'muted', until: mute.until, why: mute.reason });
      return;
    }
    let ch = String(msg.ch || 'all').toLowerCase();
    if (!CHAT_CHANNELS.has(ch)) ch = 'all';

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
      Mod.log('chat', { yid: p.yid, name: p.name, ch: 'tell', to: tgt.name, text: text });
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
    const tgt = findPlayerByName(name);
    if (!tgt) { send(p, { t: 'report_fail', reason: 'offline', name: name }); return; }
    if (tgt.pid === p.pid) { send(p, { t: 'report_fail', reason: 'self' }); return; }
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
      return {
        yid: f.yid,
        name: online ? online.name : f.name,
        online: !!online,
        level: online ? online.level : null,
        region: online ? online.region : null,
        pid: online ? online.pid : null
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
      send(p, { t: 'friend_fail', reason: 'offline' });
      return;
    }
    if ((p.friends || []).length >= MAX_FRIENDS || (q.friends || []).length >= MAX_FRIENDS) {
      send(p, { t: 'friend_fail', reason: 'full' });
      return;
    }
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
    }
    send(p, { t: 'msg', text: 'Удалён из друзей: ' + gone.name });
    send(p, friendsPayload(p));
  }

  function notifyFriends(p, online) {
    for (const f of (p.friends || [])) {
      const pid = pidByYid.get(f.yid);
      const q = pid != null ? players.get(pid) : null;
      if (!q) continue;
      send(q, { t: 'friend_status', yid: p.yid, name: p.name, online: !!online });
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
    notifyFriends
  };
};
