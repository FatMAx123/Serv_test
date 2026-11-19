'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getArg(name, def) {
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return def;
}

const VAULT_SECRET = process.env.KEY_VAULT_SECRET || '';
if (!VAULT_SECRET || VAULT_SECRET.length < 16) {
  console.error('Ошибка: требуется переменная окружения KEY_VAULT_SECRET (минимум 16 символов).');
  process.exit(1);
}
const VAULT_SALT = process.env.KEY_VAULT_SALT || 'ps_vault_storage_salt_2026';
const VAULT_KEY = crypto.scryptSync(VAULT_SECRET, VAULT_SALT, 32);

const targetYid = getArg('yid', '');
const hashesRaw = getArg('hashes', '');
const hashes = hashesRaw.split(',').map(s => s.trim()).filter(Boolean);
const targetPath = getArg('file', '') || path.join(__dirname, '..', 'data', 'account_keys.json');

if (!targetYid || hashes.length === 0) {
  console.error('Использование: KEY_VAULT_SECRET=... node scripts/rebind-key.js --yid=<yid> --hashes=<h1,h2> [--file=path]');
  process.exit(1);
}

function updateVaultFile(filePath, yid, keyHashes) {
  let vault = { byHash: {}, updatedAt: Date.now() };

  if (fs.existsSync(filePath)) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (raw.enc === 'aes-256-gcm' && raw.data) {
      const decipher = crypto.createDecipheriv('aes-256-gcm', VAULT_KEY, Buffer.from(raw.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(raw.tag, 'hex'));
      const dec = Buffer.concat([decipher.update(Buffer.from(raw.data, 'hex')), decipher.final()]).toString('utf8');
      vault = JSON.parse(dec);
    } else if (raw.byHash) {
      vault = raw;
    }
  }

  if (!vault.byHash) vault.byHash = {};
  const now = Date.now();

  for (const h of keyHashes) {
    const existing = vault.byHash[h];
    vault.byHash[h] = {
      yid,
      createdAt: (existing && existing.createdAt) || now,
      updatedAt: now
    };
  }

  vault.updatedAt = now;

  const jsonStr = JSON.stringify(vault);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', VAULT_KEY, iv);
  let ciphertext = cipher.update(jsonStr, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  const envelope = {
    v: 2,
    enc: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag: authTag,
    data: ciphertext,
    updatedAt: now
  };

  fs.writeFileSync(filePath, JSON.stringify(envelope));
  console.log('Successfully saved encrypted vault to:', filePath);
}

updateVaultFile(targetPath, targetYid, hashes);
