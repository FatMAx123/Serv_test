'use strict';

/**
 * server/handlers/console-commands.js
 * ============================================================================
 * Интерактивная консоль администратора в терминале сервера:
 * setgm, revokegm, setaura, list, announce, kick, status, help.
 * ============================================================================
 */

function createConsoleCommands(ctx) {
  const {
    IS_CLUSTER,
    players,
    mobs,
    wsByPid,
    PlayerDb,
    sanitizeCharName,
    findPlayerByName,
    resolveAuraType,
    cosmeticsPublic,
    saveProfileNow,
    send,
    sendJson,
    broadcastAOI,
    broadcastWorld,
    detachPlayer
  } = ctx;

  function setupConsoleCommands() {
    if (IS_CLUSTER) return;
    if (!process.stdin || !process.stdin.isTTY) return;
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    rl.on('line', (line) => {
      const raw = String(line || '').trim();
      if (!raw) return;
      handleConsoleCommand(raw);
    });
    console.log('[console] В терминале сервера доступны команды: setgm <имя> [lvl], revokegm <имя>, list, announce <текст>, kick <имя>, help');
  }

  async function handleConsoleCommand(raw) {
    const parts = String(raw || '').trim().split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase().replace(/^\/+/, '');
    const args = parts.slice(1);

    if (cmd === 'help') {
      console.log('\n--- Консольные команды сервера ---');
      console.log('  setgm <имя> [уровень=100]  — Выдать права GM/Админа (50..100)');
      console.log('  revokegm <имя>             — Снять права GM (accessLevel=0)');
      console.log('  setaura <имя> <тип>        — Изменить ауру игрока (cyan|blue|red|gold|hero|off)');
      console.log('  list                       — Список игроков онлайн');
      console.log('  announce <сообщение>       — Оповещение всем игрокам');
      console.log('  kick <имя>                 — Кикнуть игрока');
      console.log('  status                     — Состояние сервера');
      console.log('----------------------------------\n');
      return;
    }

    if (cmd === 'setgm' || cmd === 'gm') {
      if (!args[0]) {
        console.log('Использование: setgm <имя_персонажа> [уровень=100]');
        return;
      }
      const name = sanitizeCharName(args[0]);
      const rawLvl = args[1] !== undefined ? parseInt(args[1], 10) : 100;
      const lvl = Math.max(0, Math.min(100, Number.isFinite(rawLvl) ? rawLvl : 100));
      try {
        await PlayerDb.setAccessLevel(name, lvl, 'console');
        const onlineP = findPlayerByName(name);
        if (onlineP) {
          onlineP.accessLevel = lvl;
          onlineP.gm = lvl >= 50;
          send(onlineP, { t: 'msg', text: `Консоль сервера установила вам AccessLevel ${lvl} (GM: ${onlineP.gm ? 'ДА' : 'НЕТ'}).` });
        }
        console.log(`[console] Игроку "${name}" успешно установлен AccessLevel ${lvl} (GM: ${lvl >= 50 ? 'ДА' : 'НЕТ'})!`);
        if (onlineP) console.log(`[console] Игрок "${name}" онлайн — права применены немедленно.`);
        else console.log(`[console] Игрок "${name}" оффлайн — права будут активны при входе.`);
      } catch (e) {
        console.log(`[console] Ошибка: ${e && e.message}`);
      }
      return;
    }

    if (cmd === 'revokegm') {
      if (!args[0]) {
        console.log('Использование: revokegm <имя_персонажа>');
        return;
      }
      const name = sanitizeCharName(args[0]);
      try {
        await PlayerDb.revokeAccess(name, 'console');
        const onlineP = findPlayerByName(name);
        if (onlineP) {
          onlineP.accessLevel = 0;
          onlineP.gm = false;
          send(onlineP, { t: 'msg', text: 'Консоль сервера сняла с вас права GM (AccessLevel 0).' });
        }
        console.log(`[console] Статус GM с игрока "${name}" успешно снят.`);
      } catch (e) {
        console.log(`[console] Ошибка: ${e && e.message}`);
      }
      return;
    }

    if (cmd === 'setaura' || cmd === 'aura') {
      if (!args[0]) {
        console.log('Использование: setaura <имя_персонажа> <cyan|blue|red|gold|hero|off>');
        console.log('Примеры: setaura фывфа red  или  setaura Admin gold');
        return;
      }
      let auraType = null;
      let targetName = null;
      if (args.length === 1) {
        console.log('Укажите тип ауры: setaura <имя> <cyan|blue|red|gold|hero|off>');
        return;
      }
      if (resolveAuraType(args[0])) {
        auraType = resolveAuraType(args[0]);
        targetName = args.slice(1).join(' ').trim();
      } else if (resolveAuraType(args[args.length - 1])) {
        auraType = resolveAuraType(args[args.length - 1]);
        targetName = args.slice(0, args.length - 1).join(' ').trim();
      } else {
        console.log('Неизвестный тип ауры. Доступно: cyan (циан), blue (синий), red (красный), gold (золотой), hero (герой), off (выкл).');
        return;
      }
      targetName = sanitizeCharName(targetName);
      const onlineP = findPlayerByName(targetName);
      if (onlineP) {
        onlineP.cosmetics = onlineP.cosmetics || {};
        onlineP.cosmetics.aura = auraType === 'none' ? 'none' : auraType;
        if (auraType && auraType !== 'none') {
          if (!Array.isArray(onlineP.cosmetics.auras)) onlineP.cosmetics.auras = [];
          if (!onlineP.cosmetics.auras.includes(auraType)) onlineP.cosmetics.auras.push(auraType);
        }
        saveProfileNow(onlineP);
        const cosPub = cosmeticsPublic(onlineP);
        const cosPkt = {
          t: 'cosmetic',
          pid: onlineP.pid,
          title: cosPub.title,
          titleName: cosPub.titleName,
          titleColor: cosPub.titleColor,
          nameColor: cosPub.nameColor,
          aura: cosPub.aura
        };
        send(onlineP, cosPkt);
        broadcastAOI(onlineP, cosPkt);
        send(onlineP, { t: 'msg', text: `[Консоль] Ваша аура изменена на: ${auraType === 'none' ? 'ВЫКЛЮЧЕНА' : auraType}.` });
        console.log(`[console] Аура игрока "${onlineP.name}" успешно изменена на: ${auraType} (онлайн, применена немедленно)!`);
      } else if (PlayerDb && PlayerDb.setAura) {
        try {
          const res = await PlayerDb.setAura(targetName, auraType);
          if (res && res.ok) {
            console.log(`[console] Аура игрока "${res.name || targetName}" сохранена: ${auraType} (оффлайн, активируется при входе)!`);
          } else {
            console.log(`[console] Персонаж не найден: "${targetName}"`);
          }
        } catch (e) {
          console.log(`[console] Ошибка: ${e && e.message}`);
        }
      } else {
        console.log(`[console] Персонаж не найден: "${targetName}"`);
      }
      return;
    }

    if (cmd === 'list' || cmd === 'players') {
      const online = Array.from(players.values());
      console.log(`\nОнлайн игроков (${online.length}):`);
      for (const p of online) {
        console.log(`  - ${p.name} (ур.${p.level}, GM: ${p.gm ? 'ДА (' + p.accessLevel + ')' : 'нет'}, x=${p.x.toFixed(1)}, z=${p.z.toFixed(1)})`);
      }
      console.log('');
      return;
    }

    if (cmd === 'announce' || cmd === 'say') {
      const text = args.join(' ').trim();
      if (!text) {
        console.log('Использование: announce <текст>');
        return;
      }
      broadcastWorld({ t: 'announce', text: '[АДМИНИСТРАЦИЯ]: ' + text, kind: 'gm' });
      console.log(`[console] Объявление разослано: "${text}"`);
      return;
    }

    if (cmd === 'kick') {
      if (!args[0]) {
        console.log('Использование: kick <имя_персонажа>');
        return;
      }
      const name = sanitizeCharName(args[0]);
      const target = findPlayerByName(name);
      if (!target) {
        console.log(`[console] Игрок "${name}" не найден в онлайне.`);
        return;
      }
      const ws = wsByPid.get(target.pid);
      if (ws) {
        try {
          sendJson(ws, { t: 'msg', text: 'Вы отключены администратором сервера через консоль.' });
          ws.close(4011, 'kicked by console');
        } catch (_) { }
      }
      detachPlayer(target.pid);
      console.log(`[console] Игрок "${name}" отключен от сервера.`);
      return;
    }

    if (cmd === 'status') {
      console.log(`[console] Подключений: ${players.size} игроков, мобов в памяти: ${mobs.size}`);
      return;
    }

    console.log(`[console] Неизвестная команда: "${cmd}". Введите "help" для списка команд.`);
  }

  return {
    setupConsoleCommands,
    handleConsoleCommand
  };
}

module.exports = {
  createConsoleCommands
};

