// SERVER / HANDLERS / GM-HANDLER.JS — GM-команды, полномочия (AccessLevel) и аудит.
'use strict';

const G = require('../../shared/game-rules.js');
const MOB_DB = require('../../shared/mob-db.js');
const COS = require('../../shared/cosmetics-db.js');
const WM = require('../../shared/world-metrics.js');
const Mod = require('../moderation.js');
const PlayerDb = require('../player-db.js');

function isGM(p) {
  if (!p || p.nonGm) return false;
  const lvl = (p.accessLevel | 0);
  if (lvl >= 50) return true;
  if (p.gm === true) return true;
  if (p.yid && String(p.yid).startsWith('local_')) return true;
  if (process.env.NODE_ENV !== 'production') {
    if (process.env.AUTO_DEV_GM === '1' && p.dev === true) return true;
    if (p.yid && String(p.yid).startsWith('itest_') && p.yid !== 'itest_regular' && !p.nonGm) return true;
  }
  if (process.env.GM_YIDS) {
    const list = process.env.GM_YIDS.split(',').map(s => s.trim().toLowerCase());
    if (list.includes(String(p.yid || '').toLowerCase())) return true;
  }
  if (process.env.GM_CHARS) {
    const list = process.env.GM_CHARS.split(',').map(s => s.trim().toLowerCase());
    if (list.includes(String(p.name || '').toLowerCase())) return true;
  }
  if (PlayerDb && PlayerDb.isGM && PlayerDb.isGM(p.yid, p.name)) return true;
  return false;
}

function resolveAuraType(str) {
  if (!str) return null;
  const s = String(str).trim().toLowerCase();
  if (s === 'blue' || s === '1' || s === 'синий' || s === 'champion_blue') return 'champion_blue';
  if (s === 'red' || s === '2' || s === 'красный' || s === 'champion_red') return 'champion_red';
  if (s === 'gold' || s === '3' || s === 'золотой' || s === 'золото' || s === 'champion_gold') return 'champion_gold';
  if (s === 'hero' || s === '4' || s === 'герой' || s === 'hero_aura') return 'hero_aura';
  if (s === 'cyan' || s === 'gm' || s === 'default' || s === 'циан' || s === 'gm_champion') return 'gm_champion';
  if (s === 'off' || s === '0' || s === 'none' || s === 'выкл' || s === 'выключить' || s === 'нет' || s === 'снять') return 'none';
  if (COS && COS.AURAS && COS.AURAS[s]) return s;
  return null;
}

function createGmHandler(ctx) {
  const {
    send,
    sendJson,
    broadcastAll,
    broadcastAOI,
    findPlayerByName,
    sanitizeCharName,
    snapStandY,
    resetMoveBudget,
    detachPlayer,
    wsByPid,
    saveProfileNow,
    cosmeticsPublic,
    itemLookup,
    mobs,
    Mob,
    getNextId,
    onMobDeath,
    pushWeight
  } = ctx;

  function handleGmCommand(p, rawText) {
    const clean = rawText.slice(2).trim();
    const parts = clean.split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();
    const args = parts.slice(1);
    const lvl = (p.accessLevel | 0) || (p.gm ? 100 : 0);

    if (cmd === 'help') {
      send(p, { t: 'msg', text: '=== Команды GM (AccessLevel: ' + lvl + ') ===' });
      send(p, { t: 'msg', text: '//help, //announce <текст>, //kick <имя>, //teleport <x> <z> | <имя>' });
      send(p, { t: 'msg', text: '//goto <имя>, //recall <имя>, //mute <имя> [мин] [причина], //unmute <имя>, //info <имя>' });
      if (lvl >= 100) {
        send(p, { t: 'msg', text: '//invul, //heal [имя], //res [имя], //flash, //speed <1..10>, //aura [ник] <cyan|blue|red|gold|hero|off>, //give <имя> <item> [кол-во]' });
        send(p, { t: 'msg', text: '//spawn <mobId> [кол-во], //killmob, //oneshot [имя], //ban <имя> [мин] [причина], //unban <имя>' });
        send(p, { t: 'msg', text: '//setgm <имя> [0..100], //revokegm <имя>' });
      }
      return;
    }

    if (cmd === 'kick') {
      const targetName = sanitizeCharName(args[0]);
      if (!targetName) {
        send(p, { t: 'msg', text: 'Использование: //kick <имя>' });
        return;
      }
      const tgt = findPlayerByName(targetName);
      if (!tgt) {
        send(p, { t: 'msg', text: 'Игрок не найден в сети: ' + targetName });
        return;
      }
      const tgtPid = tgt.pid;
      const tgtName = tgt.name;
      const tgtYid = tgt.yid;
      const ws = wsByPid.get(tgtPid);
      if (ws) {
        try {
          sendJson(ws, { t: 'msg', text: 'Вы были отключены администратором.' });
          ws.close(4011, 'kicked by GM');
        } catch (_) {}
      }
      detachPlayer(tgtPid);
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'kick', target: tgtName, targetYid: tgtYid });
      send(p, { t: 'msg', text: 'Игрок ' + tgtName + ' кикнут.' });
      return;
    }

    if (cmd === 'announce') {
      const annText = args.join(' ').trim();
      if (!annText) {
        send(p, { t: 'msg', text: 'Использование: //announce <текст>' });
        return;
      }
      broadcastAll({ t: 'chat', ch: 'announce', name: '[Анонс]', text: annText });
      if (ctx.clusterIpc && typeof ctx.clusterIpc.broadcastAnnounce === 'function') {
        ctx.clusterIpc.broadcastAnnounce(annText);
      }
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'announce', text: annText });
      return;
    }

    if (cmd === 'teleport') {
      if (args.length >= 2 && Number.isFinite(+args[0]) && Number.isFinite(+args[1])) {
        const tx = Math.max(-20000, Math.min(20000, +args[0]));
        const tz = Math.max(-20000, Math.min(20000, +args[1]));
        p.x = tx;
        p.z = tz;
        snapStandY(p);
        resetMoveBudget(p);
        send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });
        broadcastAOI(p, { t: 'teleport_fx', pid: p.pid, x: p.x, y: p.y, z: p.z });
        Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'teleport', x: tx, z: tz });
        send(p, { t: 'msg', text: 'Телепортирован в (' + tx.toFixed(1) + ', ' + tz.toFixed(1) + ').' });
        return;
      }
      if (args.length >= 1) {
        const targetName = sanitizeCharName(args[0]);
        const tgt = findPlayerByName(targetName);
        if (!tgt) {
          send(p, { t: 'msg', text: 'Игрок не найден: ' + targetName });
          return;
        }
        p.x = tgt.x;
        p.z = tgt.z;
        p.y = tgt.y;
        resetMoveBudget(p);
        send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });
        broadcastAOI(p, { t: 'teleport_fx', pid: p.pid, x: p.x, y: p.y, z: p.z });
        Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'teleport_to_char', target: tgt.name });
        send(p, { t: 'msg', text: 'Телепортирован к игроку ' + tgt.name + '.' });
        return;
      }
      send(p, { t: 'msg', text: 'Использование: //teleport <x> <z> или //teleport <имя>' });
      return;
    }

    if (cmd === 'goto') {
      if (!args[0]) {
        send(p, { t: 'msg', text: 'Использование: //goto <имя>' });
        return;
      }
      const targetName = sanitizeCharName(args[0]);
      const tgt = findPlayerByName(targetName);
      if (!tgt) {
        send(p, { t: 'msg', text: 'Игрок не найден: ' + targetName });
        return;
      }
      p.x = tgt.x;
      p.z = tgt.z;
      p.y = tgt.y;
      resetMoveBudget(p);
      send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });
      broadcastAOI(p, { t: 'teleport_fx', pid: p.pid, x: p.x, y: p.y, z: p.z });
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'goto', target: tgt.name });
      send(p, { t: 'msg', text: 'Телепортирован к игроку ' + tgt.name + '.' });
      return;
    }

    if (cmd === 'recall') {
      if (!args[0]) {
        send(p, { t: 'msg', text: 'Использование: //recall <имя>' });
        return;
      }
      const targetName = sanitizeCharName(args[0]);
      const tgt = findPlayerByName(targetName);
      if (!tgt) {
        send(p, { t: 'msg', text: 'Игрок не найден в сети: ' + targetName });
        return;
      }
      tgt.x = p.x; tgt.y = p.y; tgt.z = p.z;
      snapStandY(tgt);
      resetMoveBudget(tgt);
      send(tgt, { t: 'self_sync', x: tgt.x, y: tgt.y, z: tgt.z });
      broadcastAOI(tgt, { t: 'teleport_fx', pid: tgt.pid, x: tgt.x, y: tgt.y, z: tgt.z });
      send(tgt, { t: 'msg', text: 'Вы были призваны администратором ' + p.name + '.' });
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'recall', target: tgt.name, targetYid: tgt.yid });
      send(p, { t: 'msg', text: 'Игрок ' + tgt.name + ' призван к вам.' });
      return;
    }

    if (cmd === 'info') {
      if (!args[0]) {
        send(p, { t: 'msg', text: 'Использование: //info <имя>' });
        return;
      }
      const targetName = sanitizeCharName(args[0]);
      const tgt = findPlayerByName(targetName);
      if (tgt) {
        send(p, { t: 'msg', text: `[Онлайн] ${tgt.name} (Ур: ${tgt.level} ${tgt.cls}) YID: ${tgt.yid} PID: ${tgt.pid}` });
        send(p, { t: 'msg', text: `Позиция: (${tgt.x.toFixed(1)}, ${tgt.y.toFixed(1)}, ${tgt.z.toFixed(1)}) HP: ${tgt.hp}/${tgt.maxHp} Пар: ${tgt.energy}/${tgt.maxEnergy}` });
        send(p, { t: 'msg', text: `AccessLevel: ${tgt.accessLevel} (GM: ${tgt.gm ? 'ДА' : 'НЕТ'}) Винты: ${tgt.inv && tgt.inv.copper_parts ? tgt.inv.copper_parts : 0}` });
        return;
      }
      const dbRec = (PlayerDb && PlayerDb.getByName) ? PlayerDb.getByName(targetName) : null;
      if (dbRec) {
        send(p, { t: 'msg', text: `[Оффлайн] ${dbRec.name} (Ур: ${dbRec.level} ${dbRec.cls}) YID: ${dbRec.yid} CharId: ${dbRec.charId}` });
        send(p, { t: 'msg', text: `Позиция: (${dbRec.x.toFixed(1)}, ${dbRec.y.toFixed(1)}, ${dbRec.z.toFixed(1)}) AccessLevel: ${dbRec.accessLevel}` });
        send(p, { t: 'msg', text: `Был в сети: ${new Date(dbRec.lastSeen || 0).toLocaleString()}` });
        return;
      }
      send(p, { t: 'msg', text: 'Персонаж не найден: ' + targetName });
      return;
    }

    if (cmd === 'mute') {
      if (!args[0]) {
        send(p, { t: 'msg', text: 'Использование: //mute <имя> [минуты=15] [причина]' });
        return;
      }
      const targetName = sanitizeCharName(args[0]);
      const mins = Math.max(1, Math.min(43200, parseInt(args[1], 10) || 15));
      const reason = args.slice(2).join(' ').trim() || 'Нарушение правил чата';
      let targetYid = null;
      const tgt = findPlayerByName(targetName);
      if (tgt) targetYid = tgt.yid;
      else {
        const dbRec = (PlayerDb && PlayerDb.getByName) ? PlayerDb.getByName(targetName) : null;
        if (dbRec) targetYid = dbRec.yid;
      }
      if (!targetYid) {
        send(p, { t: 'msg', text: 'Персонаж не найден: ' + targetName });
        return;
      }
      Mod.setMute(targetYid, { ttlSec: mins * 60, reason: reason, by: p.name });
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'mute', target: targetName, targetYid: targetYid, mins: mins, reason: reason });
      if (tgt) send(tgt, { t: 'msg', text: `[Модерация] Вам выдан мут на ${mins} мин. Причина: ${reason}` });
      send(p, { t: 'msg', text: `Игрок ${targetName} получил мут на ${mins} мин. Причина: ${reason}` });
      return;
    }

    if (cmd === 'unmute') {
      if (!args[0]) {
        send(p, { t: 'msg', text: 'Использование: //unmute <имя>' });
        return;
      }
      const targetName = sanitizeCharName(args[0]);
      let targetYid = null;
      const tgt = findPlayerByName(targetName);
      if (tgt) targetYid = tgt.yid;
      else {
        const dbRec = (PlayerDb && PlayerDb.getByName) ? PlayerDb.getByName(targetName) : null;
        if (dbRec) targetYid = dbRec.yid;
      }
      if (!targetYid) {
        send(p, { t: 'msg', text: 'Персонаж не найден: ' + targetName });
        return;
      }
      Mod.clearMute(targetYid);
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'unmute', target: targetName, targetYid: targetYid });
      if (tgt) send(tgt, { t: 'msg', text: '[Модерация] Мут чата снят администратором.' });
      send(p, { t: 'msg', text: `Мут с игрока ${targetName} снят.` });
      return;
    }

    // ── Команды Полного Администратора (AccessLevel >= 100) ───────────────────
    if (cmd === 'invul') {
      if (lvl < 100) {
        send(p, { t: 'msg', text: 'Команда //invul требует AccessLevel 100 (Администратор).' });
        return;
      }
      p.invul = !p.invul;
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'invul', enabled: p.invul });
      send(p, { t: 'msg', text: 'Режим неуязвимости: ' + (p.invul ? 'ВКЛ' : 'ВЫКЛ') });
      return;
    }

    if (cmd === 'heal') {
      if (lvl < 100) {
        send(p, { t: 'msg', text: 'Команда //heal требует AccessLevel 100 (Администратор).' });
        return;
      }
      const targetName = args[0] ? sanitizeCharName(args[0]) : null;
      const tgt = targetName ? findPlayerByName(targetName) : p;
      if (!tgt) {
        send(p, { t: 'msg', text: 'Игрок не найден: ' + targetName });
        return;
      }
      tgt.dead = false;
      tgt.hp = tgt.maxHp;
      tgt.energy = tgt.maxEnergy;
      send(tgt, { t: 'self_sync', hp: tgt.hp, energy: tgt.energy, dead: false });
      broadcastAOI(tgt, { t: 'stat_sync', pid: tgt.pid, hp: tgt.hp, maxHp: tgt.maxHp });
      broadcastAOI(tgt, { t: 'heal_fx', pid: tgt.pid, amount: tgt.maxHp });
      send(tgt, { t: 'msg', text: 'Ваше здоровье и энергия полностью восстановлены.' });
      if (tgt !== p) send(p, { t: 'msg', text: `Игрок ${tgt.name} полностью исцелен.` });
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'heal', target: tgt.name });
      return;
    }

    if (cmd === 'res' || cmd === 'resurrect' || cmd === 'возродить') {
      if (lvl < 100) {
        send(p, { t: 'msg', text: 'Команда //' + cmd + ' требует AccessLevel 100 (Администратор).' });
        return;
      }
      let tgt = null;
      if (args[0]) {
        const targetName = sanitizeCharName(args[0]);
        tgt = findPlayerByName(targetName);
        if (!tgt) {
          send(p, { t: 'msg', text: 'Игрок не найден: ' + targetName });
          return;
        }
      } else {
        if (p.dead) {
          tgt = p;
        } else if (p.target && p.target.pid != null && ctx.players && ctx.players.get(p.target.pid | 0)) {
          tgt = ctx.players.get(p.target.pid | 0);
        } else {
          let bestDist = 45;
          const plist = ctx.players ? Array.from(ctx.players.values()) : [];
          for (const other of plist) {
            if (!other || other.pid === p.pid || !other.dead) continue;
            const d = Math.hypot((other.x || 0) - p.x, (other.z || 0) - p.z);
            if (d < bestDist) {
              bestDist = d;
              tgt = other;
            }
          }
          if (!tgt) tgt = p;
        }
      }
      if (ctx.resurrectPlayer) {
        ctx.resurrectPlayer(tgt, p);
      } else {
        tgt.dead = false;
        tgt.hp = tgt.maxHp;
        tgt.energy = tgt.maxEnergy;
        send(tgt, { t: 'you_revived', mode: 'resurrect', by: p.name });
        broadcastAOI(tgt, { t: 'player_revived', pid: tgt.pid, x: tgt.x, z: tgt.z, mode: 'resurrect' });
        broadcastAOI(tgt, { t: 'resurrect_fx', pid: tgt.pid, casterPid: p.pid, x: tgt.x, y: tgt.y, z: tgt.z });
      }
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'resurrect', target: tgt.name });
      return;
    }

    if (cmd === 'flash' || cmd === 'флэш' || cmd === 'speed') {
      if (lvl < 100) {
        send(p, { t: 'msg', text: 'Команда //' + cmd + ' требует AccessLevel 100 (Администратор).' });
        return;
      }
      let mul;
      if (args[0] != null && args[0] !== '') {
        const parsed = parseFloat(args[0]);
        mul = Number.isFinite(parsed) ? Math.max(1, Math.min(10, parsed)) : 1;
      } else {
        mul = (p.gmSpeedMul && p.gmSpeedMul > 1) ? 1 : 3.5;
      }
      p.gmSpeedMul = mul;
      p.flashSpeed = mul > 1;
      resetMoveBudget(p);
      const isFast = mul > 1;
      send(p, {
        t: 'msg',
        text: isFast
          ? `⚡ СКОРОСТЬ ФЛЭША АКТИВИРОВАНА: ${mul}x (Спидфорс ВКЛ)`
          : `⚡ Скорость GM установлена в 1.0x (норма).`
      });
      send(p, { t: 'self_sync', gmSpeedMul: mul, flashSpeed: isFast });
      broadcastAOI(p, {
        t: 'flash_fx',
        pid: p.pid,
        active: isFast,
        speedMul: mul,
        burst: isFast,
        x: p.x,
        y: p.y,
        z: p.z
      });
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: cmd, mul: mul });
      return;
    }

    if (cmd === 'give') {
      if (lvl < 100) {
        send(p, { t: 'msg', text: 'Команда //give требует AccessLevel 100 (Администратор).' });
        return;
      }
      if (args.length < 2) {
        send(p, { t: 'msg', text: 'Использование: //give <имя> <itemId> [count] [plus]' });
        return;
      }
      const targetName = sanitizeCharName(args[0]);
      const itemId = String(args[1] || '').toLowerCase();
      const count = Math.max(1, Math.min(1000000, parseInt(args[2], 10) || 1));
      const plus = Math.max(0, Math.min(20, parseInt(args[3], 10) || 0));

      const tgt = findPlayerByName(targetName);
      if (!tgt) {
        send(p, { t: 'msg', text: 'Игрок не найден: ' + targetName });
        return;
      }
      const tpl = itemLookup(itemId);
      if (!tpl && itemId !== 'copper_parts') {
        send(p, { t: 'msg', text: 'Предмет не найден: ' + itemId });
        return;
      }
      if (!tgt.inv) tgt.inv = {};
      if (itemId === 'copper_parts') {
        tgt.inv.copper_parts = (tgt.inv.copper_parts || 0) + count;
      } else {
        tgt.inv[itemId] = (tgt.inv[itemId] || 0) + count;
        if (tpl && (tpl.type === 'weapon' || tpl.type === 'armor' || tpl.type === 'shield') && plus > 0) {
          if (!tgt.plusById) tgt.plusById = {};
          tgt.plusById[itemId] = Math.max(tgt.plusById[itemId] || 0, plus);
        }
      }

      if (typeof pushWeight === 'function') pushWeight(tgt);
      // BUG-DB-01: Немедленная персистентность профиля цели при GM-выдаче предметов
      if (typeof saveProfileNow === 'function') saveProfileNow(tgt);
      send(tgt, { t: 'inv_sync', inv: tgt.inv, equip: tgt.equip, plusById: tgt.plusById });
      send(tgt, { t: 'msg', text: 'Администратор выдал вам: ' + count + 'x ' + (tpl ? tpl.name : itemId) });
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'give', target: tgt.name, itemId: itemId, count: count, plus: plus });
      send(p, { t: 'msg', text: 'Выдано ' + count + 'x ' + itemId + ' игроку ' + tgt.name + '.' });
      return;
    }

    if (cmd === 'spawn') {
      if (lvl < 100) {
        send(p, { t: 'msg', text: 'Команда //spawn требует AccessLevel 100 (Администратор).' });
        return;
      }
      if (!args[0]) {
        send(p, { t: 'msg', text: 'Использование: //spawn <mobId> [count=1]' });
        return;
      }
      const mobId = String(args[0] || '').toLowerCase();
      const count = Math.max(1, Math.min(10, parseInt(args[1], 10) || 1));
      const isBoss = !!(G.BOSSES && G.BOSSES[mobId]);
      const mobDef = (MOB_DB && MOB_DB.MOBS && MOB_DB.MOBS[mobId]) || (G.MOBS && G.MOBS[mobId]) || (isBoss ? G.BOSSES[mobId] : null);
      if (!mobDef) {
        send(p, { t: 'msg', text: 'Моб не найден: ' + mobId + '. Проверьте ID моба.' });
        return;
      }
      const mlvl = mobDef.level || 1;
      for (let i = 0; i < count; i++) {
        const ox = (Math.random() - 0.5) * 3;
        const oz = (Math.random() - 0.5) * 3;
        const bd = isBoss ? G.BOSSES[mobId] : null;
        const nm = new Mob(getNextId(), mobId, mlvl, p.x + ox, p.z + oz, bd, {
          boss: isBoss, respawnSec: 0
        });
        const hz = (WM && WM.huntZoneAt) ? WM.huntZoneAt(p.x, p.z) : null;
        nm.huntZoneId = hz ? hz.id : null;
        mobs.set(nm.mid, nm);
      }
      send(p, { t: 'msg', text: `Заспавнено ${count}x ${mobDef.name || mobId} рядом с вами.` });
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'spawn', mobId: mobId, count: count });
      return;
    }

    if (cmd === 'killmob') {
      if (lvl < 100) {
        send(p, { t: 'msg', text: 'Команда //killmob требует AccessLevel 100 (Администратор).' });
        return;
      }
      let nearest = null, nearDist = 15;
      for (const m of mobs.values()) {
        if (m.dead) continue;
        const d = Math.hypot(m.x - p.x, m.z - p.z);
        if (d < nearDist) {
          nearest = m;
          nearDist = d;
        }
      }
      if (!nearest) {
        send(p, { t: 'msg', text: 'В радиусе 15 м нет живых мобов.' });
        return;
      }
      nearest.hp = 0;
      if (onMobDeath) onMobDeath(p, nearest);
      send(p, { t: 'msg', text: `Моб ${nearest.mobId} (ID: ${nearest.mid}) уничтожен.` });
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'killmob', mobId: nearest.mobId, mid: nearest.mid });
      return;
    }

    if (cmd === 'oneshot' || cmd === 'ваншот' || cmd === 'kill') {
      if (lvl < 100) {
        send(p, { t: 'msg', text: 'Команда //' + cmd + ' требует AccessLevel 100 (Администратор).' });
        return;
      }
      if (args[0]) {
        const targetName = sanitizeCharName(args[0]);
        const tgt = findPlayerByName(targetName);
        if (tgt) {
          tgt.hp = 0;
          tgt.dead = true;
          send(tgt, { t: 'hit', dmg: 9999999, by: 'gm_' + p.pid, crit: true });
          broadcastAOI(tgt, { t: 'dmg_player', pid: tgt.pid, dmg: 9999999, crit: true, by: p.pid });
          send(tgt, { t: 'msg', text: 'Вы были повержены администратором ' + p.name + '.' });
          send(p, { t: 'msg', text: `Игрок ${tgt.name} ваншотнут.` });
          Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'oneshot_player', target: tgt.name, targetYid: tgt.yid });
          return;
        }
      }
      let nearest = null, nearDist = 45;
      for (const m of mobs.values()) {
        if (m.dead || m.hp <= 0) continue;
        const d = Math.hypot(m.x - p.x, m.z - p.z);
        if (d < nearDist) {
          nearest = m;
          nearDist = d;
        }
      }
      if (!nearest) {
        send(p, { t: 'msg', text: 'В радиусе 45 м нет живых целей.' });
        return;
      }
      nearest.hp = 0;
      if (onMobDeath) onMobDeath(p, nearest);
      broadcastAOI(p, { t: 'dmg', mid: nearest.mid, dmg: 9999999, crit: true, by: p.pid, skillId: 'gm_oneshot' });
      send(p, { t: 'msg', text: `Цель ${nearest.mobId} (ID: ${nearest.mid}) ваншотнута.` });
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'oneshot_mob', mobId: nearest.mobId, mid: nearest.mid });
      return;
    }

    if (cmd === 'ban') {
      if (lvl < 100) {
        send(p, { t: 'msg', text: 'Команда //ban требует AccessLevel 100 (Администратор).' });
        return;
      }
      if (!args[0]) {
        send(p, { t: 'msg', text: 'Использование: //ban <имя> [минуты=1440] [причина]' });
        return;
      }
      const targetName = sanitizeCharName(args[0]);
      const mins = Math.max(1, Math.min(525600, parseInt(args[1], 10) || 1440));
      const reason = args.slice(2).join(' ').trim() || 'Нарушение правил сервера';
      let targetYid = null;
      const tgt = findPlayerByName(targetName);
      if (tgt) {
        targetYid = tgt.yid;
        const tgtPid = tgt.pid;
        const ws = wsByPid.get(tgtPid);
        if (ws) {
          try {
            sendJson(ws, { t: 'msg', text: `Вы заблокированы на ${mins} мин. Причина: ${reason}` });
            ws.close(4012, 'banned by GM');
          } catch (_) {}
        }
        detachPlayer(tgtPid);
      } else {
        const dbRec = (PlayerDb && PlayerDb.getByName) ? PlayerDb.getByName(targetName) : null;
        if (dbRec) targetYid = dbRec.yid;
      }
      if (!targetYid) {
        send(p, { t: 'msg', text: 'Персонаж не найден: ' + targetName });
        return;
      }
      Mod.setBan(targetYid, { ttlSec: mins * 60, reason: reason, by: p.name });
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'ban', target: targetName, targetYid: targetYid, mins: mins, reason: reason });
      send(p, { t: 'msg', text: `Аккаунт игрока ${targetName} заблокирован на ${mins} мин. Причина: ${reason}` });
      return;
    }

    if (cmd === 'unban') {
      if (lvl < 100) {
        send(p, { t: 'msg', text: 'Команда //unban требует AccessLevel 100 (Администратор).' });
        return;
      }
      if (!args[0]) {
        send(p, { t: 'msg', text: 'Использование: //unban <имя>' });
        return;
      }
      const targetName = sanitizeCharName(args[0]);
      let targetYid = null;
      const dbRec = (PlayerDb && PlayerDb.getByName) ? PlayerDb.getByName(targetName) : null;
      if (dbRec) targetYid = dbRec.yid;
      if (!targetYid) {
        send(p, { t: 'msg', text: 'Персонаж не найден: ' + targetName });
        return;
      }
      Mod.clearBan(targetYid);
      Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'unban', target: targetName, targetYid: targetYid });
      send(p, { t: 'msg', text: `Блокировка с игрока ${targetName} снята.` });
      return;
    }

    if (cmd === 'setgm') {
      if (lvl < 100) {
        send(p, { t: 'msg', text: 'Команда //setgm доступна только Главному Администратору (AccessLevel 100).' });
        return;
      }
      if (!args[0]) {
        send(p, { t: 'msg', text: 'Использование: //setgm <имя> [уровень 0..100, по умолч. 100]' });
        return;
      }
      const targetName = sanitizeCharName(args[0]);
      const targetLvl = Math.max(0, Math.min(100, parseInt(args[1], 10) || 100));
      PlayerDb.setAccessLevel(targetName, targetLvl, 'setgm_by_' + p.name).then((res) => {
        if (res && res.ok) {
          const tgt = findPlayerByName(targetName);
          if (tgt) {
            tgt.accessLevel = targetLvl;
            tgt.gm = targetLvl >= 50;
            if (tgt.gm) {
              tgt.skills = tgt.skills || {};
              tgt.skills.test_immortal = 1;
              tgt.skills.gm_oneshot = 1;
              tgt.skills.gm_resurrect = 1;
              tgt.skills.gm_speed = 1;
              delete tgt.skills.gm_flash;
              send(tgt, { t: 'self_sync', skills: tgt.skills });
            }
          }
          send(p, { t: 'msg', text: `Игроку ${targetName} установлен AccessLevel ${targetLvl} (GM: ${res.gm ? 'ДА' : 'НЕТ'}).` });
          Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'setgm', target: targetName, accessLevel: targetLvl });
        } else {
          send(p, { t: 'msg', text: `Ошибка при установке GM для ${targetName}: ${res && res.reason}` });
        }
      }).catch((err) => {
        send(p, { t: 'msg', text: `Ошибка: ${err && err.message}` });
      });
      return;
    }

    if (cmd === 'revokegm') {
      if (lvl < 100) {
        send(p, { t: 'msg', text: 'Команда //revokegm доступна только Главному Администратору (AccessLevel 100).' });
        return;
      }
      if (!args[0]) {
        send(p, { t: 'msg', text: 'Использование: //revokegm <имя>' });
        return;
      }
      const targetName = sanitizeCharName(args[0]);
      PlayerDb.revokeAccess(targetName, 'revokegm_by_' + p.name).then((res) => {
        if (res && res.ok) {
          const tgt = findPlayerByName(targetName);
          if (tgt) {
            tgt.accessLevel = 0;
            tgt.gm = false;
            if (tgt.skills) {
              delete tgt.skills.test_immortal;
              delete tgt.skills.gm_oneshot;
              delete tgt.skills.gm_resurrect;
              delete tgt.skills.gm_flash;
              delete tgt.skills.gm_speed;
              tgt.gmSpeedMul = 1;
              tgt.flashSpeed = false;
              send(tgt, { t: 'self_sync', skills: tgt.skills, gmSpeedMul: 1, flashSpeed: false });
            }
          }
          send(p, { t: 'msg', text: `Статус GM с игрока ${targetName} снят (AccessLevel 0).` });
          Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'revokegm', target: targetName });
        } else {
          send(p, { t: 'msg', text: `Ошибка при снятии GM с ${targetName}: ${res && res.reason}` });
        }
      }).catch((err) => {
        send(p, { t: 'msg', text: `Ошибка: ${err && err.message}` });
      });
      return;
    }

    if (cmd === 'aura' || cmd === 'setaura' || cmd === 'аура' || cmd === 'сетаура') {
      if (!args[0]) {
        send(p, { t: 'msg', text: 'Использование: //aura [ник] <cyan|blue|red|gold|hero|off>' });
        send(p, { t: 'msg', text: 'Примеры: //aura red, //aura фывфа gold, //aura blue Nagibator' });
        return;
      }

      let auraType = null;
      let targetName = null;

      if (args.length === 1) {
        auraType = resolveAuraType(args[0]);
        if (!auraType) {
          send(p, { t: 'msg', text: `Укажите тип ауры: //aura ${args[0]} <cyan|blue|red|gold|hero|off>` });
          return;
        }
        targetName = p.name;
      } else {
        if (resolveAuraType(args[0])) {
          auraType = resolveAuraType(args[0]);
          targetName = args.slice(1).join(' ').trim();
        } else if (resolveAuraType(args[args.length - 1])) {
          auraType = resolveAuraType(args[args.length - 1]);
          targetName = args.slice(0, args.length - 1).join(' ').trim();
        } else {
          send(p, { t: 'msg', text: 'Неизвестный тип ауры. Доступно: cyan (циан), blue (синий), red (красный), gold (золотой), hero (герой), off (выкл).' });
          send(p, { t: 'msg', text: 'Примеры: //aura red, //aura фывфа gold, //aura blue Nagibator' });
          return;
        }
      }

      targetName = sanitizeCharName(targetName);
      const tgt = targetName ? findPlayerByName(targetName) : p;

      if (tgt) {
        tgt.cosmetics = tgt.cosmetics || {};
        tgt.cosmetics.aura = auraType === 'none' ? 'none' : auraType;
        saveProfileNow(tgt);
        const cosPub = cosmeticsPublic(tgt);
        const cosPkt = {
          t: 'cosmetic',
          pid: tgt.pid,
          title: cosPub.title,
          titleName: cosPub.titleName,
          titleColor: cosPub.titleColor,
          nameColor: cosPub.nameColor,
          aura: cosPub.aura
        };
        send(tgt, cosPkt);
        broadcastAOI(tgt, cosPkt);

        const auraDesc = auraType === 'none' ? 'ВЫКЛЮЧЕНА' : auraType;
        send(p, { t: 'msg', text: `Аура игрока ${tgt.name} изменена на: ${auraDesc}.` });
        if (tgt !== p) {
          send(tgt, { t: 'msg', text: `Администратор ${p.name} изменил вашу ауру на: ${auraDesc}.` });
        }
        Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'aura', target: tgt.name, aura: auraType });
        return;
      }

      if (PlayerDb && PlayerDb.setAura) {
        PlayerDb.setAura(targetName, auraType).then((res) => {
          if (res && res.ok) {
            const auraDesc = auraType === 'none' ? 'ВЫКЛЮЧЕНА' : auraType;
            send(p, { t: 'msg', text: `[Оффлайн] Аура игрока ${res.name || targetName} сохранена: ${auraDesc}.` });
            Mod.log('gm', { by: p.name, yid: p.yid, cmd: 'aura', target: targetName, aura: auraType, offline: true });
          } else {
            send(p, { t: 'msg', text: `Персонаж не найден: ${targetName}` });
          }
        }).catch((e) => {
          send(p, { t: 'msg', text: `Ошибка сохранения ауры: ${e && e.message}` });
        });
        return;
      }

      send(p, { t: 'msg', text: `Персонаж не найден в сети: ${targetName}` });
      return;
    }

    send(p, { t: 'msg', text: 'Неизвестная команда: //' + cmd + '. Введите //help для списка доступных команд.' });
  }

  return {
    isGM,
    resolveAuraType,
    handleGmCommand
  };
}

createGmHandler.isGM = isGM;
createGmHandler.resolveAuraType = resolveAuraType;

module.exports = createGmHandler;
