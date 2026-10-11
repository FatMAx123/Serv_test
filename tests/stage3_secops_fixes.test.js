// ============================================================
//  TESTS / STAGE3_SECOPS_FIXES.TEST.JS
//  Модульные тесты для Этапа 3: SecOps, защита секретов и обратного прокси.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const SEC = require('../server/security-config.js');
const SecretsLoader = require('../server/secrets-loader.js');

module.exports = function(t) {
  t.suite('stage3: secrets-loader (стойкие криптографические секреты)');

  // 1. Парсер .env
  const parsed = SecretsLoader.parseEnvText(`
    # Комментарий
    KEY_TEST=hello_world
    KEY_QUOTED="quoted value"
    KEY_SINGLE='single quoted'
    INVALID_LINE
    EMPTY_VAL=
  `);
  t.ok(parsed.KEY_TEST === 'hello_world', 'KEY_TEST спарсен корректно');
  t.ok(parsed.KEY_QUOTED === 'quoted value', 'Двойные кавычки сняты');
  t.ok(parsed.KEY_SINGLE === 'single quoted', 'Одинарные кавычки сняты');
  t.ok(parsed.EMPTY_VAL === '', 'Пустое значение спарсено как пустая строка');
  t.ok(!('INVALID_LINE' in parsed), 'Невалидная строка проигнорирована');

  // 2. Наличие стойких ключей после вызова initSecrets
  const res = SecretsLoader.initSecrets();
  t.ok(res.hasPepper === true, 'KEY_PEPPER инициализирован (длина >= 32)');
  t.ok(res.hasVaultSecret === true, 'KEY_VAULT_SECRET инициализирован (длина >= 32)');
  t.ok((process.env.KEY_PEPPER || '').length >= 32, 'process.env.KEY_PEPPER заполнен');
  t.ok((process.env.KEY_VAULT_SECRET || '').length >= 32, 'process.env.KEY_VAULT_SECRET заполнен');

  t.suite('stage3: account-keys (интеграция с persistent secrets)');
  const AccountKeys = require('../server/account-keys.js');
  t.ok(typeof AccountKeys.hash === 'function', 'AccountKeys.hash доступен');
  t.ok(typeof AccountKeys.multiStageHash === 'function', 'AccountKeys.multiStageHash доступен');
  const h1 = AccountKeys.hash('MySecretPassword123');
  t.ok(h1 && h1.length >= 64, 'multiStageHash генерирует устойчивый хэш');

  t.suite('stage3: security-config (валидация IP и защита от спуфинга)');

  // 3. isValidIp
  t.ok(SEC.isValidIp('127.0.0.1') === true, '127.0.0.1 валиден');
  t.ok(SEC.isValidIp('192.168.1.100') === true, '192.168.1.100 валиден');
  t.ok(SEC.isValidIp('8.8.8.8') === true, '8.8.8.8 валиден');
  t.ok(SEC.isValidIp('256.1.1.1') === false, '256.1.1.1 невалиден (октет > 255)');
  t.ok(SEC.isValidIp('abc.def.ghi.jkl') === false, 'буквенный адрес невалиден');
  t.ok(SEC.isValidIp('1.2.3.4.5') === false, '5 октетов невалидны');
  t.ok(SEC.isValidIp('') === false, 'пустая строка невалидна');
  t.ok(SEC.isValidIp(null) === false, 'null невалиден');
  t.ok(SEC.isValidIp('::1') === true, 'IPv6 loopback валиден');
  t.ok(SEC.isValidIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334') === true, 'IPv6 адрес валиден');

  // 4. resolveClientIp с недоверенного адреса (напрямую от клиента без TRUST_PROXY)
  const untrustedRemote = '203.0.113.195';
  const savedTrust = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;
  try {
    const spoofedIp = SEC.resolveClientIp(untrustedRemote, (header) => {
      if (header === 'x-forwarded-for') return '1.2.3.4, 5.6.7.8';
      if (header === 'x-real-ip') return '1.1.1.1';
      return '';
    });
    t.ok(spoofedIp === untrustedRemote, 'Недоверенное подключение игнорирует прокси-заголовки (защита от спуфинга)', 'получен: ' + spoofedIp);
  } finally {
    if (savedTrust !== undefined) process.env.TRUST_PROXY = savedTrust;
  }

  // 5. resolveClientIp с доверенного прокси (127.0.0.1 / Nginx)
  const loopbackRemote = '127.0.0.1';

  // 5.1 Приоритет X-Real-IP (установлен Nginx)
  const realIpResult = SEC.resolveClientIp(loopbackRemote, (header) => {
    if (header === 'x-real-ip') return '198.51.100.42';
    if (header === 'x-forwarded-for') return '10.0.0.1, 198.51.100.42';
    return '';
  });
  t.ok(realIpResult === '198.51.100.42', 'Доверенное подключение с X-Real-IP возвращает реальный IP клиента');

  // 5.2 X-Forwarded-For: клиент подделал заголовок '8.8.8.8', прокси дописал '198.51.100.77'
  const xffAntiSpoof = SEC.resolveClientIp(loopbackRemote, (header) => {
    if (header === 'x-forwarded-for') return '8.8.8.8, 198.51.100.77';
    return '';
  });
  t.ok(xffAntiSpoof === '198.51.100.77', 'X-Forwarded-For выбирает реальный адрес справа, блокируя спуфинг слева', 'получен: ' + xffAntiSpoof);

  // 5.3 X-Forwarded-For с промежуточным доверенным прокси на loopback
  const xffChainWithProxy = SEC.resolveClientIp(loopbackRemote, (header) => {
    if (header === 'x-forwarded-for') return 'attacker.spoof, 198.51.100.99, 127.0.0.1';
    return '';
  });
  t.ok(xffChainWithProxy === '198.51.100.99', 'Цепочка X-Forwarded-For корректно пропускает loopback прокси справа');

  // 5.4 CF-Connecting-IP (Cloudflare)
  const cfResult = SEC.resolveClientIp(loopbackRemote, (header) => {
    if (header === 'cf-connecting-ip') return '172.68.1.20';
    return '';
  });
  t.ok(cfResult === '172.68.1.20', 'CF-Connecting-IP распознаётся от доверенного прокси');

  t.suite('stage3: dev-binding (привязка хоста 127.0.0.1 в dev-режиме)');
  const srvCode = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
  t.ok(srvCode.includes("const BIND_HOST = process.env.HOST || (SEC.isProd() ? '0.0.0.0' : '127.0.0.1');"),
    'server.js динамически выбирает BIND_HOST: 127.0.0.1 в dev и 0.0.0.0 в prod');
  t.ok(srvCode.includes('netTransport.listen(PORT, BIND_HOST'),
    'netTransport.listen слушает BIND_HOST');
  t.ok(srvCode.includes('server.listen(PORT, BIND_HOST'),
    'server.listen слушает BIND_HOST');

  const clCode = fs.readFileSync(path.join(__dirname, '../server/cluster-manager.js'), 'utf8');
  t.ok(clCode.includes("const BIND_HOST = process.env.HOST || (SEC.isProd() ? '0.0.0.0' : '127.0.0.1');"),
    'cluster-manager.js динамически выбирает BIND_HOST');
  t.ok(clCode.includes('uwsApp.listen(BIND_HOST, self.port'),
    'uwsApp.listen слушает BIND_HOST');
  t.ok(clCode.includes('this.httpServer.listen(this.port, BIND_HOST'),
    'cluster httpServer.listen слушает BIND_HOST');

  t.suite('stage3: ecosystem.config.js & deploy sanitization');
  const ecoCode = fs.readFileSync(path.join(__dirname, '../ecosystem.config.js'), 'utf8');
  t.ok(ecoCode.includes("ALLOW_DEFAULT_KEY_SECRETS: process.env.ALLOW_DEFAULT_KEY_SECRETS || '0'"),
    'ecosystem.config.js требует строгие секреты по умолчанию в продакшене (fail-closed)');
  t.ok(ecoCode.includes("ALLOW_INSECURE_AUTH: process.env.ALLOW_INSECURE_AUTH || (process.env.YANDEX_APP_SECRET ? '0' : '1')"),
    'ecosystem.config.js автоматически отключает ALLOW_INSECURE_AUTH при наличии YANDEX_APP_SECRET');

  const gitignoreCode = fs.readFileSync(path.join(__dirname, '../.gitignore'), 'utf8');
  t.ok(gitignoreCode.includes('.env*') || (gitignoreCode.includes('.env') && gitignoreCode.includes('.env.*')),
    '.gitignore защищает все варианты .env файлов');
  t.ok(gitignoreCode.includes('data/.secrets.env'),
    '.gitignore защищает data/.secrets.env');

  const deployCode = fs.readFileSync(path.join(__dirname, '../scripts/deploy-vps.js'), 'utf8');
  t.ok(deployCode.includes('--exclude="data/.secrets.env"'),
    'deploy-vps.js исключает data/.secrets.env из архива (защита продакшн-секретов VPS)');
  t.ok(deployCode.includes('--exclude=".env*"'),
    'deploy-vps.js исключает .env файлы из архива');
};
