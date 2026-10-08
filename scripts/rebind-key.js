const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VAULT_SECRET = process.env.KEY_VAULT_SECRET || 'ps_vault_master_secret_2026_aes256gcm';
const VAULT_KEY = crypto.scryptSync(VAULT_SECRET, 'ps_vault_storage_salt_2026', 32);

function updateVaultFile(filePath) {
  let vault = { byHash: {}, updatedAt: Date.now() };

  if (fs.existsSync(filePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (raw.enc === 'aes-256-gcm' && raw.data) {
        const decipher = crypto.createDecipheriv('aes-256-gcm', VAULT_KEY, Buffer.from(raw.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(raw.tag, 'hex'));
        const dec = Buffer.concat([decipher.update(Buffer.from(raw.data, 'hex')), decipher.final()]).toString('utf8');
        vault = JSON.parse(dec);
      } else if (raw.byHash) {
        vault = raw;
      }
    } catch (e) {
      console.warn('Could not decrypt existing vault, starting fresh:', e.message);
    }
  }

  if (!vault.byHash) vault.byHash = {};

  // Re-bind user key hashes to local_hnuzlv9blmp (char: фывфа)
  const hash1 = 'ms4_af1619401b1ddbc525eeb746dd3620199bb3f21e7e2036a1d0d57c39c62508cb';
  const hash2 = 'ms4_2c8ba644a74a3dd3dfcf6e6d34c064ad17725fab5b5d85fbced1b2025e382ef0';
  const targetYid = 'local_hnuzlv9blmp';
  const now = Date.now();

  vault.byHash[hash1] = {
    yid: targetYid,
    createdAt: 1791462922961,
    updatedAt: now
  };
  vault.byHash[hash2] = {
    yid: targetYid,
    createdAt: 1791462966477,
    updatedAt: now
  };

  vault.updatedAt = now;

  // Re-encrypt
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

  // Verification read
  const verifyRaw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const verifyDecipher = crypto.createDecipheriv('aes-256-gcm', VAULT_KEY, Buffer.from(verifyRaw.iv, 'hex'));
  verifyDecipher.setAuthTag(Buffer.from(verifyRaw.tag, 'hex'));
  const verifyDec = Buffer.concat([verifyDecipher.update(Buffer.from(verifyRaw.data, 'hex')), verifyDecipher.final()]).toString('utf8');
  const parsed = JSON.parse(verifyDec);
  console.log('Verification successful! Entries in vault:', Object.keys(parsed.byHash));
  console.log('hash1 maps to:', parsed.byHash[hash1]);
}

const targetPath = process.argv[2] || path.join(__dirname, '..', 'data', 'account_keys.json');
updateVaultFile(targetPath);
