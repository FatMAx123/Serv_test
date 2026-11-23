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
};
