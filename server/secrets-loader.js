// ============================================================
//  SERVER / SECRETS-LOADER.JS
//  Автономный менеджер криптографических секретов и переменных окружения.
//  Поддерживает .env.secrets, data/.secrets.env и .env без внешних зависимостей.
//  В продакшене гарантирует наличие стойких случайных ключей KEY_PEPPER и
//  KEY_VAULT_SECRET (>= 32 байт / 64 hex) с персистентным сохранением.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

function parseEnvText(content) {
  const result = {};
  if (!content || typeof content !== 'string') return result;
  const lines = content.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) result[key] = val;
  }
  return result;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const parsed = parseEnvText(text);
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] == null || process.env[k] === '') {
        process.env[k] = v;
      }
    }
    return true;
  } catch (err) {
    console.warn('[secrets-loader] Не удалось прочитать ' + filePath + ':', err && err.message);
    return false;
  }
}

/**
 * Инициализация и загрузка секретов из персистентных хранилищ.
 */
function initSecrets(options = {}) {
  const root = options.rootDir || ROOT_DIR;
  const dataDir = options.dataDir || DATA_DIR;

  // 1. Порядок поиска env-файлов (от наиболее специфичных к общим)
  const candidateFiles = [
    path.join(root, '.env.secrets'),
    path.join(dataDir, '.secrets.env'),
    path.join(root, '.env.production'),
    path.join(root, '.env')
  ];

  for (const f of candidateFiles) {
    loadEnvFile(f);
  }

  // 2. Проверка и автоматическая генерация стойких криптографических секретов
  const isWeakSecret = (val, defaultMarker) => {
    const s = String(val || '');
    return s.length < 32 || s.includes('builtin') || s.includes(defaultMarker);
  };

  if (isWeakSecret(process.env.KEY_PEPPER, 'ps_secret_server_pepper_2026') ||
      isWeakSecret(process.env.KEY_VAULT_SECRET, 'ps_vault_master_secret_2026')) {
    const secretsEnvPath = path.join(dataDir, '.secrets.env');
    const diskCandidates = [
      path.join(root, '.env.secrets'),
      secretsEnvPath,
      path.join(root, '.env.production'),
      path.join(root, '.env')
    ];

    const diskParsed = {};
    for (const f of diskCandidates) {
      if (!fs.existsSync(f)) continue;
      try {
        const parsed = parseEnvText(fs.readFileSync(f, 'utf8'));
        for (const [k, v] of Object.entries(parsed)) {
          if (diskParsed[k] == null || diskParsed[k] === '') diskParsed[k] = v;
        }
      } catch (_) {}
    }

    // Если в env стоял слабый/тестовый маркер, а на диске уже лежит стойкий секрет —
    // берём стойкий секрет с диска и ни в коем случае не затираем data/.secrets.env.
    if (isWeakSecret(process.env.KEY_PEPPER, 'ps_secret_server_pepper_2026') &&
        !isWeakSecret(diskParsed.KEY_PEPPER, 'ps_secret_server_pepper_2026')) {
      process.env.KEY_PEPPER = diskParsed.KEY_PEPPER;
    }
    if (isWeakSecret(process.env.KEY_VAULT_SECRET, 'ps_vault_master_secret_2026') &&
        !isWeakSecret(diskParsed.KEY_VAULT_SECRET, 'ps_vault_master_secret_2026')) {
      process.env.KEY_VAULT_SECRET = diskParsed.KEY_VAULT_SECRET;
    }

    const existingSecrets = fs.existsSync(secretsEnvPath)
      ? parseEnvText((() => { try { return fs.readFileSync(secretsEnvPath, 'utf8'); } catch (_) { return ''; } })())
      : {};
    const curPep = !isWeakSecret(process.env.KEY_PEPPER, 'ps_secret_server_pepper_2026')
      ? process.env.KEY_PEPPER
      : (!isWeakSecret(existingSecrets.KEY_PEPPER, 'ps_secret_server_pepper_2026') ? existingSecrets.KEY_PEPPER : '');
    const curVs = !isWeakSecret(process.env.KEY_VAULT_SECRET, 'ps_vault_master_secret_2026')
      ? process.env.KEY_VAULT_SECRET
      : (!isWeakSecret(existingSecrets.KEY_VAULT_SECRET, 'ps_vault_master_secret_2026') ? existingSecrets.KEY_VAULT_SECRET : '');

    const stillNeedPepper = isWeakSecret(curPep, 'ps_secret_server_pepper_2026');
    const stillNeedVault = isWeakSecret(curVs, 'ps_vault_master_secret_2026');

    // Генерируем 256-битные секреты только для отсутствующих/слабых ключей, сохраняя уже существующие стойкие.
    if (stillNeedPepper || stillNeedVault) {
      if (!fs.existsSync(dataDir)) {
        try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {}
      }

      const generatedPepper = stillNeedPepper ? crypto.randomBytes(32).toString('hex') : curPep;
      const generatedVault = stillNeedVault ? crypto.randomBytes(32).toString('hex') : curVs;

      const fileContent = [
        '# ============================================================',
        '#  PROJECT STEAM: ORIGINS — СЕРВЕРНЫЕ КРИПТОГРАФИЧЕСКИЕ КЛЮЧИ',
        '#  Файл сгенерирован автоматически. НЕ ПЕРЕДАВАТЬ В ПУБЛИЧНЫЙ ДОСТУП!',
        '# ============================================================',
        `KEY_PEPPER=${generatedPepper}`,
        `KEY_VAULT_SECRET=${generatedVault}`,
        `GENERATED_AT=${new Date().toISOString()}`,
        ''
      ].join('\n');

      try {
        fs.writeFileSync(secretsEnvPath, fileContent, { mode: 0o600 });
        if (stillNeedPepper) process.env.KEY_PEPPER = generatedPepper;
        if (stillNeedVault) process.env.KEY_VAULT_SECRET = generatedVault;
        console.log('[secrets-loader] 🔐 Сгенерированы и сохранены персистентные криптографические секреты в ' + secretsEnvPath);
      } catch (writeErr) {
        if (stillNeedPepper) process.env.KEY_PEPPER = generatedPepper;
        if (stillNeedVault) process.env.KEY_VAULT_SECRET = generatedVault;
        console.warn('[secrets-loader] ⚠️ Не удалось записать secrets на диск, применены в памяти:', writeErr && writeErr.message);
      }
    }
  }

  // В dev-режиме разрешаем дефолтные секреты для локальных изолированных тестов, если не задано иное
  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEFAULT_KEY_SECRETS == null) {
    process.env.ALLOW_DEFAULT_KEY_SECRETS = '1';
  }

  return {
    hasPepper: (process.env.KEY_PEPPER || '').length >= 32,
    hasVaultSecret: (process.env.KEY_VAULT_SECRET || '').length >= 32,
    isProd: process.env.NODE_ENV === 'production'
  };
}

// Автоматический запуск при require
initSecrets();

module.exports = {
  initSecrets,
  loadEnvFile,
  parseEnvText
};
