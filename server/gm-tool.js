#!/usr/bin/env node
// ============================================================
//  SERVER / GM-TOOL.JS  —  Консольная утилита управления GM вне игры
//  Консоль администратора Project Steam.
//  Команды:
//    node server/gm-tool.js list [--gm] [--online]
//    node server/gm-tool.js set <имя_или_yid> [accessLevel=100]
//    node server/gm-tool.js revoke <имя_или_yid>
//    node server/gm-tool.js info <имя_или_yid>
//    node server/gm-tool.js rebuild
// ============================================================
'use strict';

const path = require('path');
const PlayerDb = require('./player-db.js');

function printBanner() {
  console.log('============================================================');
  console.log('   PROJECT STEAM: ORIGINS  —  GM & PLAYER ADMINISTRATION TOOL');
  console.log('============================================================');
}

function printUsage() {
  printBanner();
  console.log('Использование: node server/gm-tool.js <команда> [параметры]\n');
  console.log('Команды:');
  console.log('  list [--gm] [--online] [--search <query>]   Список всех игроков в базе');
  console.log('  set <имя_или_yid> [level=100]               Выдать статус GM / уровень доступа');
  console.log('  revoke <имя_или_yid>                        Снять статус GM (accessLevel = 0)');
  console.log('  info <имя_или_yid>                          Подробная карточка персонажа');
  console.log('  rebuild                                     Пересканировать каталог data/ и обновить базу');
  console.log('\nПримеры:');
  console.log('  npm run gm -- list');
  console.log('  npm run gm -- list --gm');
  console.log('  npm run gm -- set "Operator-965b" 100');
  console.log('  npm run gm -- revoke "Operator-965b"');
  console.log('  npm run gm -- info "Operator-965b"');
  console.log('============================================================');
}

function pad(str, len) {
  const s = String(str == null ? '' : str);
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = (args[0] || '').toLowerCase();

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printUsage();
    process.exit(0);
  }

  await PlayerDb.init();

  if (cmd === 'list') {
    const gmOnly = args.includes('--gm');
    const onlineOnly = args.includes('--online');
    let search = '';
    const searchIdx = args.indexOf('--search');
    if (searchIdx >= 0 && args[searchIdx + 1]) {
      search = args[searchIdx + 1];
    }

    const rows = PlayerDb.list({ gmOnly, onlineOnly, search });
    printBanner();
    console.log(`Найдено персонажей: ${rows.length}` + (gmOnly ? ' [только GM]' : '') + (onlineOnly ? ' [только онлайн]' : ''));
    console.log('---------------------------------------------------------------------------------------------------------');
    console.log(`| ${pad('Имя персонажа', 16)} | ${pad('Аккаунт (YID)', 20)} | ${pad('Слот', 6)} | ${pad('Ур.', 3)} | ${pad('Класс', 12)} | ${pad('Access', 6)} | ${pad('GM', 5)} | ${pad('Статус', 7)} |`);
    console.log('---------------------------------------------------------------------------------------------------------');

    for (const r of rows) {
      const gmFlag = r.gm ? ' [GM]' : '  -  ';
      const status = r.online ? 'ONLINE ' : 'OFFLINE';
      console.log(`| ${pad(r.name, 16)} | ${pad(r.yid, 20)} | ${pad(r.charId, 6)} | ${pad(r.level, 3)} | ${pad(r.cls, 12)} | ${pad(r.accessLevel, 6)} | ${pad(gmFlag, 5)} | ${pad(status, 7)} |`);
    }
    console.log('---------------------------------------------------------------------------------------------------------');
    process.exit(0);
  }

  if (cmd === 'set') {
    const target = args[1];
    if (!target) {
      console.error('Ошибка: укажите имя персонажа или YID. Пример: node server/gm-tool.js set "PlayerName" 100');
      process.exit(1);
    }
    const level = args[2] != null ? parseInt(args[2], 10) : 100;
    try {
      const res = await PlayerDb.setAccessLevel(target, level, 'cli_gm_tool');
      printBanner();
      console.log(`[УСПЕХ] Статус GM обновлён!`);
      console.log(`  Цель:         ${res.target}`);
      console.log(`  Имя в базе:   ${res.name || '-'}`);
      console.log(`  YID:          ${res.yid || '-'}`);
      console.log(`  AccessLevel:  ${res.accessLevel} (GM: ${res.gm ? 'ДА' : 'НЕТ'})`);
      console.log('Данные сохранены в characters.json, gm-access.json и файл профиля.');
      process.exit(0);
    } catch (e) {
      console.error('[ОШИБКА]:', e.message);
      process.exit(1);
    }
  }

  if (cmd === 'revoke' || cmd === 'remove') {
    const target = args[1];
    if (!target) {
      console.error('Ошибка: укажите имя персонажа или YID. Пример: node server/gm-tool.js revoke "PlayerName"');
      process.exit(1);
    }
    try {
      const res = await PlayerDb.revokeAccess(target, 'cli_revoke');
      printBanner();
      console.log(`[УСПЕХ] Статус GM снят!`);
      console.log(`  Цель:         ${res.target}`);
      console.log(`  AccessLevel:  0 (Обычный игрок)`);
      process.exit(0);
    } catch (e) {
      console.error('[ОШИБКА]:', e.message);
      process.exit(1);
    }
  }

  if (cmd === 'info') {
    const target = args[1];
    if (!target) {
      console.error('Ошибка: укажите имя персонажа или YID.');
      process.exit(1);
    }
    const rec = PlayerDb.find(target);
    if (!rec) {
      console.error(`Игрок "${target}" не найден в базе персонажей.`);
      process.exit(1);
    }
    printBanner();
    console.log(`Информация о персонаже: ${rec.name}`);
    console.log('------------------------------------------------------------');
    console.log(`  Имя:          ${rec.name}`);
    console.log(`  Аккаунт (YID):${rec.yid}`);
    console.log(`  Слот:         ${rec.charId}`);
    console.log(`  Уровень:      ${rec.level} (EXP: ${rec.exp}, SP: ${rec.sp})`);
    console.log(`  Класс:        ${rec.cls} (Tier: ${rec.classTier})`);
    console.log(`  Раса / Пол:   ${rec.race} / ${rec.gender}`);
    console.log(`  AccessLevel:  ${rec.accessLevel} ${rec.gm ? '★ [GM / Администратор]' : '[Обычный игрок]'}`);
    console.log(`  HP / Пар:     ${rec.hp}/${rec.maxHp} | ${rec.energy}/${rec.maxEnergy}`);
    console.log(`  Координаты:   X=${rec.x.toFixed(1)}, Y=${rec.y.toFixed(1)}, Z=${rec.z.toFixed(1)}`);
    console.log(`  Карма / PK:   ${rec.karma} / ${rec.pk}`);
    console.log(`  Статус:       ${rec.online ? 'В СЕТИ (ONLINE)' : 'НЕ В СЕТИ (OFFLINE)'}`);
    console.log(`  Создан:       ${rec.createdAt ? new Date(rec.createdAt).toLocaleString() : '-'}`);
    console.log(`  Был в сети:   ${rec.lastSeen ? new Date(rec.lastSeen).toLocaleString() : '-'}`);
    console.log('------------------------------------------------------------');
    process.exit(0);
  }

  if (cmd === 'rebuild' || cmd === 'sync') {
    printBanner();
    console.log('Пересканирование каталога профилей data/ ...');
    const res = await PlayerDb.rebuildIndex();
    console.log(`[УСПЕХ] База игроков синхронизирована. Всего персонажей: ${res.count}`);
    process.exit(0);
  }

  console.error(`Неизвестная команда: "${cmd}". Выполните "node server/gm-tool.js help"`);
  process.exit(1);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Непредвиденная ошибка:', err);
    process.exit(1);
  });
}

module.exports = { main };
