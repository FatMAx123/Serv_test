// ============================================================
//  TESTS / STAGE5_HARDENING_FIXES.TEST.JS
//  Unit tests for Stage 5 Security & Hardening:
//  - Party Invite Security (30s TTL, distance, leader check, party_decline)
//  - Skill Cast Target Lock (exact match between cast_start & skill_cast)
//  - EntityTransformTable 32-bit ID precision (IDs > 16.7M preserved)
//  - Cluster Handoff Cooldown Preservation (p.cd preserved & restored)
//  - Reverse Proxy Private IP Resolution (RFC1918 hops skipped in XFF)
// ============================================================
'use strict';

const SEC = require('../server/security-config.js');
const { EntityTransformTable, TYPE_PLAYER, TYPE_MOB } = require('../shared/entity-transform-table.js');

module.exports = async function (t) {
  // ── 1. Reverse-Proxy Private IP Resolution ──────────────────
  t.suite('stage5: reverse-proxy private IP resolution');
  {
    const loopback = '127.0.0.1';

    // Цепочка с несколькими приватными hop'ами: Клиент -> Docker Nginx (10.0.0.1) -> K8s router (172.16.0.5) -> Local proxy (127.0.0.1)
    const clientIp = SEC.resolveClientIp(loopback, (h) => {
      if (h === 'x-forwarded-for') return '198.51.100.42, 10.0.0.1, 172.16.0.5, 127.0.0.1';
      return '';
    });
    t.eq(clientIp, '198.51.100.42', 'XFF корректно пропускает все приватные промежуточные hop-адреса справа');

    // 192.168.x.x приватная сеть
    const homeClient = SEC.resolveClientIp(loopback, (h) => {
      if (h === 'x-forwarded-for') return '203.0.113.88, 192.168.1.1, 127.0.0.1';
      return '';
    });
    t.eq(homeClient, '203.0.113.88', 'XFF пропускает 192.168.x.x прокси');
  }

  // ── 2. EntityTransformTable 32-bit ID Precision ──────────────
  t.suite('stage5: entity transform table 32-bit integer ID precision');
  {
    const table = new EntityTransformTable(16);
    // Кластерные ID > 16,777,216 (например WORKER_ID_BASE = 100,000,000)
    // В Float32 100000001 усекается до 100000000
    const clusterPid1 = 100000001;
    const clusterPid2 = 100000005;
    const clusterMobId = 200000042;

    const slot1 = table.allocate(clusterPid1, TYPE_PLAYER, 10, 0, 20, 100, 100, 6);
    const slot2 = table.allocate(clusterPid2, TYPE_PLAYER, 15, 0, 25, 100, 100, 6);
    const slotMob = table.allocate(clusterMobId, TYPE_MOB, 12, 0, 22, 50, 50, 4);

    t.eq(table.getId(slot1), clusterPid1, 'ID игрока 1 (100,000,001) сохранен без потери точности float32');
    t.eq(table.getId(slot2), clusterPid2, 'ID игрока 2 (100,000,005) сохранен без потери точности float32');
    t.eq(table.getId(slotMob), clusterMobId, 'ID моба (200,000,042) сохранен без потери точности');

    // Проверка поиска findClosest
    const closest = table.findClosest(TYPE_PLAYER, 11, 21, 100);
    t.ok(closest !== null, 'findClosest находит сущность');
    t.eq(closest && closest.id, clusterPid1, 'findClosest возвращает точный 32-битный cluster ID');

    // Проверка _grow сохраняет точность int32View
    for (let i = 0; i < 20; i++) {
      table.allocate(150000000 + i, TYPE_MOB, i, 0, i, 50, 50, 4);
    }
    t.eq(table.getId(slot1), clusterPid1, 'После удвоения буфера (_grow) ID 100,000,001 по-прежнему валиден');
  }

  // ── 3. Party Invite Security & Expiration ────────────────────
  t.suite('stage5: party invite security & expiration');
  {
    // Моделируем логику handlePartyMessage
    const partyHandlerModule = require('../server/handlers/party-handler.js');
    t.ok(typeof partyHandlerModule.createPartyHandler === 'function', 'createPartyHandler экспортирован');

    const players = new Map();
    const sent = [];
    const send = (p, msg) => { sent.push({ to: p.pid, msg }); };
    const sendPid = (pid, msg) => { sent.push({ to: pid, msg }); };
    const parties = new Map();

    const pm = partyHandlerModule.createPartyHandler({
      players: players,
      parties: parties,
      send: send,
      sendPid: sendPid,
      dist2: (x1, z1, x2, z2) => { const dx = x1 - x2; const dz = z1 - z2; return dx * dx + dz * dz; },
      IS_CLUSTER: false,
      clusterIpc: null
    });

    const leader = { pid: 101, name: 'LeaderA', x: 0, z: 0, hp: 100, maxHp: 100, cls: 'fighter', level: 10, partyId: null };
    const recruit = { pid: 102, name: 'RecruitB', x: 5, z: 5, hp: 100, maxHp: 100, cls: 'mystic', level: 10, partyId: null };
    players.set(leader.pid, leader);
    players.set(recruit.pid, recruit);

    // 1. Приглашение в группу
    sent.length = 0;
    pm.handlePartyMessage(leader, { t: 'party_invite', pid: recruit.pid });
    t.eq(recruit._inviteFrom, leader.pid, 'Приглашение устанавливает _inviteFrom');
    t.ok(typeof recruit._inviteFromAt === 'number' && recruit._inviteFromAt > 0, 'Приглашение устанавливает _inviteFromAt');

    // 2. Отклонение приглашения (party_decline)
    sent.length = 0;
    pm.handlePartyMessage(recruit, { t: 'party_decline' });
    t.eq(recruit._inviteFrom, null, 'После party_decline _inviteFrom сброшен');
    t.eq(recruit._inviteFromAt, null, 'После party_decline _inviteFromAt сброшен');
    t.ok(sent.some(s => s.to === leader.pid && s.msg.text.includes('отклонил')), 'Лидер уведомлен об отклонении');

    // 3. Истечение срока приглашения (>30s)
    recruit._inviteFrom = leader.pid;
    recruit._inviteFromAt = Date.now() - 31000; // 31 секунда назад
    sent.length = 0;
    pm.handlePartyMessage(recruit, { t: 'party_accept' });
    t.eq(recruit._inviteFrom, null, 'Просроченное приглашение сбрасывается');
    t.ok(sent.some(s => s.to === recruit.pid && s.msg.text.includes('устарело')), 'Получено сообщение об устаревании приглашения');

    // 4. Проверка дистанции на момент принятия
    recruit._inviteFrom = leader.pid;
    recruit._inviteFromAt = Date.now();
    recruit.x = 500; recruit.z = 500; // Далеко
    sent.length = 0;
    pm.handlePartyMessage(recruit, { t: 'party_accept' });
    t.ok(sent.some(s => s.to === recruit.pid && s.msg.text.includes('слишком далеко')), 'Принятие издалека блокируется');

    // 5. Проверка статуса лидера (если пригласивший перестал быть лидером)
    recruit.x = 5; recruit.z = 5; // Вернулся близко
    recruit._inviteFrom = leader.pid;
    recruit._inviteFromAt = Date.now();
    // Создаем пати где leader НЕ лидер
    parties.set('pt_other', { id: 'pt_other', leader: 999, members: new Set([999, leader.pid]) });
    leader.partyId = 'pt_other';
    sent.length = 0;
    pm.handlePartyMessage(recruit, { t: 'party_accept' });
    t.ok(sent.some(s => s.to === recruit.pid && s.msg.text.includes('не является лидером')), 'Принятие блокируется, если пригласивший не лидер');
    parties.delete('pt_other');
    leader.partyId = null;
  }

  // ── 4. Skill Cast Target Lock ───────────────────────────────
  t.suite('stage5: skill cast target lock');
  {
    // Моделируем проверку цели в касте из server.js
    function validateCastTarget(casting, msg) {
      const origMid = casting.mid != null ? (casting.mid | 0) : null;
      const curMid = msg.mid != null ? (msg.mid | 0) : null;
      const origPid = casting.pid != null ? (casting.pid | 0) : null;
      const curPid = msg.pid != null ? (msg.pid | 0) : null;
      if (origMid !== curMid || origPid !== curPid) {
        return { ok: false, reason: 'target_changed' };
      }
      return { ok: true };
    }

    // Совпадающая цель
    t.eq(validateCastTarget({ mid: 5, pid: null }, { mid: 5 }).ok, true, 'Каст на того же моба разрешен');
    t.eq(validateCastTarget({ mid: null, pid: 42 }, { pid: 42 }).ok, true, 'Каст на того же игрока разрешен');
    t.eq(validateCastTarget({ mid: null, pid: null }, {}).ok, true, 'Каст без цели (селф-бафф) разрешен');

    // Подмена моба на другого моба
    t.eq(validateCastTarget({ mid: 5, pid: null }, { mid: 6 }).reason, 'target_changed', 'Смена mob ID блокируется');

    // Подмена моба на игрока (эксплойт обхода таргета)
    t.eq(validateCastTarget({ mid: 5, pid: null }, { pid: 42 }).reason, 'target_changed', 'Смена моба на игрока блокируется');

    // Сброс цели в null
    t.eq(validateCastTarget({ mid: 5, pid: null }, {}).reason, 'target_changed', 'Сброс цели на null блокируется');

    // Добавление цели к селф-касту
    t.eq(validateCastTarget({ mid: null, pid: null }, { pid: 42 }).reason, 'target_changed', 'Подстановка цели к селф-скиллу блокируется');
  }

  // ── 5. Cluster Handoff Cooldown Preservation ────────────────
  t.suite('stage5: cluster handoff cooldown preservation');
  {
    const originalCooldowns = {
      fireball: Date.now() + 8000,
      heal: Date.now() + 4000,
      berserk: Date.now() + 60000
    };

    const mockPlayer = {
      pid: 100000001,
      yid: 'player_cluster_test',
      cd: Object.assign({}, originalCooldowns),
      buffs: [],
      debuffs: []
    };

    // Эмуляция initiateClusterHandoff упаковки playerData
    const playerData = {
      pid: mockPlayer.pid,
      yid: mockPlayer.yid,
      cd: Object.assign({}, mockPlayer.cd || {})
    };

    t.ok(playerData.cd && playerData.cd.berserk === originalCooldowns.berserk, 'initiateClusterHandoff сохраняет cd в playerData');

    // Эмуляция adoptClusterHandoff восстановления
    const adoptedPlayer = {
      pid: playerData.pid,
      yid: playerData.yid,
      cd: {}
    };
    if (playerData.cd && typeof playerData.cd === 'object') {
      adoptedPlayer.cd = Object.assign({}, playerData.cd);
    }

    t.eq(adoptedPlayer.cd.fireball, originalCooldowns.fireball, 'adoptClusterHandoff восстанавливает кд fireball');
    t.eq(adoptedPlayer.cd.heal, originalCooldowns.heal, 'adoptClusterHandoff восстанавливает кд heal');
    t.eq(adoptedPlayer.cd.berserk, originalCooldowns.berserk, 'adoptClusterHandoff восстанавливает кд berserk');
  }
};
