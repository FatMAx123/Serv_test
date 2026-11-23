// ============================================================
//  TESTS / STORY-QUESTS.TEST.JS — этап 2: квесты на сбор и сюжет «Песнь и порча».
//  Цели «собрать» — квестовые предметы с квестовых мобов (≥30%), а не обычные
//  материалы по 2.5–7% (прогон экономики: 5 квестов съедали ~33 ч).
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const QD = require(path.join(ROOT, 'shared', 'quest-db.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));
const LT = require(path.join(ROOT, 'server', 'data', 'loot-tables.js'));

function bestChance(itemId) {
  let best = 0;
  for (const T of Object.values(LT.MOB_LOOT_TABLES)) {
    ['common', 'equipment', 'rare', 'crystals', 'special'].forEach((sec) => ((T[sec] && T[sec].groups) || []).forEach((g) => {
      const sum = g.items.reduce((a, b) => a + b.weight, 0) || 1;
      g.items.forEach((it) => { if (it.id === itemId) best = Math.max(best, g.chance * it.weight / sum); });
    }));
  }
  return best;
}

module.exports = function (t) {
  t.suite('Квесты на сбор: квестовый дроп, а не 2.5–7% материалов');
  const weak = [];
  for (const q of QD.all()) {
    // скрытые (секретки с редким дропом), повторяемые и цепочки боссов — по своим правилам
    if (q.repeatable || q.daily || q.type === 'hidden' || /^(epic|bounty)_/.test(q.id)) continue;
    for (const o of q.objectives || []) {
      if (o.type !== 'collect') continue;
      const ch = bestChance(o.target);
      if (ch < 0.3) weak.push(q.id + ':' + o.target + ' ' + ch.toFixed(3));
    }
  }
  t.eq(weak, [], 'у каждой разовой цели «собрать» есть источник не ниже 30%');
  t.eq(QD.get('main_04_certification_tech').objectives.filter((o) => o.target === 'repair_drone').length, 0,
    'аттестация Инженера без элитного Дрона-Ремонтника (соло)');

  t.suite('Сюжет «Песнь и порча» и групповые квесты');
  const chain = ['story_01_false_note', 'story_02_scrap_rhythm', 'story_03_monument_list', 'story_04_guard_protocol', 'story_05_boiler_silence'];
  chain.forEach((id, i) => {
    const q = QD.get(id);
    t.ok(!!q && q.type === 'side', id + ': побочный квест, основную цепочку не блокирует');
    if (i > 0) t.eq(QD.prerequisiteOf(id), chain[i - 1], id + ' идёт после ' + chain[i - 1]);
  });
  t.eq(chain.map((id) => QD.get(id).levelReq), [3, 10, 13, 16, 19], 'главы на 3/10/13/16/19');
  const party = ['party_01_friendly_fire', 'party_02_green_fog', 'party_03_boiler_voices', 'party_04_fog_beyond'];
  party.forEach((id) => t.ok(QD.get(id) && QD.get(id).party === true, id + ': групповой'));
  for (const id of chain.concat(party)) {
    const q = QD.get(id);
    const npc = NPCS.getNpc(q.npc);
    t.ok(npc && (npc.quests || []).indexOf(id) !== -1, id + ': выдаёт ' + q.npc);
    for (const o of q.objectives) {
      if (o.type === 'collect') t.ok(ITEMS.get(o.target) && ITEMS.get(o.target).type === 'quest', id + ': ' + o.target + ' — квестовый предмет');
      if (o.type === 'talk') t.ok(!!NPCS.getNpc(o.target), id + ': NPC разговора ' + o.target + ' существует');
    }
  }
  t.eq(QD.validate(), [], 'quest-db без ошибок');

  t.suite('Цепочка «Принято в ремонт»: след Приёмщика к Башне Круны');
  const repair = ['repair_01_receipts', 'repair_02_window_zero', 'repair_03_repair_log', 'repair_04_issue_window'];
  t.eq(repair.map((id) => QD.get(id) && QD.get(id).levelReq), [9, 13, 16, 19], 'звенья на 9/13/16/19');
  repair.forEach((id, i) => {
    const q = QD.get(id);
    t.ok(q.type === 'side', id + ': побочный, сюжет не блокирует');
    if (i > 0) t.eq(QD.prerequisiteOf(id), repair[i - 1], id + ' идёт после ' + repair[i - 1]);
    for (const o of q.objectives) {
      if (o.type === 'collect') {
        t.ok(ITEMS.get(o.target) && ITEMS.get(o.target).type === 'quest', id + ': ' + o.target + ' — квестовая улика');
        t.ok(bestChance(o.target) >= 0.3, id + ': ' + o.target + ' падает не реже 30%');
      }
      if (o.type === 'talk') t.ok(!!NPCS.getNpc(o.target), id + ': NPC разговора ' + o.target + ' существует');
    }
  });
  const last = QD.get('repair_04_issue_window').objectives.find((o) => o.type === 'talk');
  t.eq(last && last.target, 'issue_window', 'след кончается у Окна выдачи');
  t.ok(/Приёмщик/.test(QD.get('story_05_boiler_silence').description), 'Котёл называет имя — «Приёмщик»');

  t.suite('Реплика NPC на цели «поговорить»');
  {
    const { createQuestHandler } = require(path.join(ROOT, 'server', 'handlers', 'quest-handler.js'));
    const sent = [];
    const qh = createQuestHandler({
      QD, NPCS, EXP: require(path.join(ROOT, 'shared', 'l2-exp-table.js')),
      send: (p, m) => sent.push(m), invCount: (p, id) => (p.inv[id] | 0), giveCurrency: () => { },
      grantExpSp: () => ({ exp: 0, sp: 0 }), applyPlayerBuff: () => { }, pushEffects: () => { }, pushCombatStats: () => { },
      saveProfileNow: () => { }, pruneInv: () => { }, pushWeight: () => { }, pushQuests: () => { }
    });
    const skrip = NPCS.getNpc('archivist_skrip');
    const p = { pid: 93201, level: 9, inv: {}, x: skrip.position.x, z: skrip.position.z,
      quests: { active: { repair_01_receipts: { p: [8, 6, 4, 0] } }, done: {}, completed: {} } };
    qh.doQuestTalk(p, 'archivist_skrip');
    t.eq(p.quests.active.repair_01_receipts.p[3], 1, 'разговор со Скрипом засчитан');
    t.ok(sent.some((m) => m.t === 'msg' && /^Архивариус Скрип: «.*окна — ноль/.test(m.text)), 'Скрип произносит сюжетную реплику в чат');
  }

  t.suite('Квест выдаёт тот NPC, что указан в квесте');
  // Клиент показывает у NPC только его список quests (client/js/npc.js getAvailableQuests).
  // Главы main_05–main_08 не входили ни в один список, и сюжет 8–18 было не взять.
  const orphan = [];
  for (const q of QD.all()) {
    if (!q.npc || q.type === 'event') continue;
    const npc = NPCS.getNpc(q.npc);
    if (!npc || (npc.quests || []).indexOf(q.id) === -1) orphan.push(q.id + '@' + q.npc);
  }
  t.eq(orphan, [], 'у каждого квеста с npc этот NPC держит его в quests');
};
