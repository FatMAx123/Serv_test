#!/usr/bin/env node
// ============================================================
//  SCRIPTS / DEV-ACCOUNT-LINK.JS — только для локальной разработки
//  Вход логином на локальный аккаунт (yid) с персонажами — например, профилем,
//  скопированным с боевого сервера (боевой пароль локально не проверить: другие ключи).
//
//  node scripts/dev-account-link.js <логин> <yid> --password
//      спросит пароль (ввод скрыт) и задаст локальный вход «логин + пароль» → yid;
//  node scripts/dev-account-link.js <логин> <yid>
//      перепривяжет уже существующий локальный логин к yid (пароль прежний).
//
//  Пишет реестр data/account_keys.json корня проекта (локальные ключи data/.secrets.env) и
//  копирует его в последнюю дев-сборку (builds/dev/LATEST), если у неё те же ключи.
//  Локальный сервер и дев-сервер на это время должны быть ОСТАНОВЛЕНЫ.
// ============================================================
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2).filter(a => a !== '--password');
const askPassword = process.argv.includes('--password');
const [loginRaw, yid] = args;
if (!loginRaw || !yid) {
  console.error('Использование: node scripts/dev-account-link.js <логин> <yid> [--password]');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') { console.error('Только для локальной разработки.'); process.exit(1); }
const login = String(loginRaw).trim().toLowerCase();
process.env.ALLOW_INSECURE_DEV = process.env.ALLOW_INSECURE_DEV || '1';

function readHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    if (!stdin.isTTY) {   // ввод из конвейера
      let buf = '';
      stdin.setEncoding('utf8');
      stdin.on('data', d => { buf += d; });
      stdin.on('end', () => resolve(buf.split(/\r?\n/)[0]));
      return;
    }
    let pw = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData);
        process.stdout.write('\n'); resolve(pw);
      } else if (ch === '\u0003') { process.stdout.write('\n'); process.exit(1); }
      else if (ch === '\u0008' || ch === '\u007f') { pw = pw.slice(0, -1); }
      else { pw += ch; }
    };
    stdin.on('data', onData);
  });
}

(async () => {
  if (!fs.existsSync(path.join(ROOT, 'data', yid + '.json'))) {
    console.warn('⚠️  В data/ нет профиля ' + yid + '.json — вход заработает, но персонажей не будет.');
  }
  const AK = require(path.join(ROOT, 'server', 'account-keys.js'));
  await AK.init();
  if (AK.loadFailed) throw new Error('локальный реестр аккаунтов не расшифрован');

  const existing = AK.byLogin.get(login);
  if (askPassword) {
    const pw = await readHidden('Пароль для входа «' + login + '» (локально): ');
    if (!pw) throw new Error('пустой пароль');
    if (existing && existing.yid !== yid) {   // логин был заведён на пустой аккаунт — освобождаем
      AK.byLogin.delete(login);
      if (AK.byYid.get(existing.yid) === 'login:' + login) AK.byYid.delete(existing.yid);
    }
    const r = await AK.setCodeword(yid, pw, '', true, login);
    if (!r || r.ok === false) throw new Error((r && (r.message || r.error)) || 'не удалось задать пароль');
  } else {
    if (!existing) throw new Error('локального логина «' + login + '» нет — запустите с --password');
    if (AK.byYid.get(existing.yid) === 'login:' + login) AK.byYid.delete(existing.yid);
    existing.yid = yid;
    existing.updatedAt = Date.now();
    AK.byYid.set(yid, 'login:' + login);
    await AK._persist();
  }
  await new Promise(r => setTimeout(r, 400));
  console.log('✅ Локальный вход «' + login + '» → ' + yid);

  // та же связка — в последней дев-сборке (если у неё те же локальные ключи)
  const latestFile = path.join(ROOT, 'builds', 'dev', 'LATEST');
  if (fs.existsSync(latestFile)) {
    const dev = path.join(ROOT, 'builds', 'dev', fs.readFileSync(latestFile, 'utf8').trim(), 'data');
    const secA = path.join(ROOT, 'data', '.secrets.env'), secB = path.join(dev, '.secrets.env');
    if (fs.existsSync(secA) && fs.existsSync(secB) && fs.readFileSync(secA, 'utf8') === fs.readFileSync(secB, 'utf8')) {
      fs.copyFileSync(path.join(ROOT, 'data', 'account_keys.json'), path.join(dev, 'account_keys.json'));
      for (const f of fs.readdirSync(path.join(ROOT, 'data')).filter(n => n.startsWith(yid + '.') || n === yid + '.json')) {
        if (/\.json$/.test(f)) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(dev, f));
      }
      console.log('✅ То же — в дев-сборке ' + path.relative(ROOT, path.dirname(dev)));
    } else {
      console.log('ℹ️  Последняя дев-сборка собрана со своими ключами — пересоберите: node scripts/build-local.js --dev');
    }
  }
  process.exit(0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
