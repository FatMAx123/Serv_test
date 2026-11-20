// ============================================================
//  SERVER / WORKERS / PERSISTENCE-WORKER.JS
//  Dedicated V8 Isolate for atomic file I/O & JSON serialization.
//  Executes on vCPU 2 to relieve the main game loop on vCPU 1.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parentPort, threadId } = require('worker_threads');

if (!parentPort) {
  throw new Error('persistence-worker.js must be run as a Worker Thread');
}

let tmpCounter = 0;

/**
 * Retry helper for transient file locks (especially on Windows NTFS: EBUSY, EPERM, EACCES).
 */
async function retryFs(fn, retries = 5, delayMs = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const code = err && err.code;
      const isTransient = code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
      if (isTransient && i < retries - 1) {
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Ревизия профиля, уже лежащего на диске (поле saveRev). 0 — файла нет, поле не задано
 * или файл не читается (битый файл не должен блокировать запись свежего снимка).
 */
async function diskSaveRev(file) {
  try {
    const cur = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    const r = cur && Number(cur.saveRev);
    return Number.isFinite(r) && r > 0 ? r : 0;
  } catch (_) {
    return 0;
  }
}

async function handleWriteAtomic(task) {
  const { id, file, payload, json: rawJson, makeBak = true, stateBuf, rev } = task;
  const stateArr = (stateBuf && stateBuf instanceof SharedArrayBuffer) ? new Int32Array(stateBuf) : null;
  if (stateArr && Atomics.load(stateArr, 0) !== 0) {
    return { id, ok: false, cancelled: true, threadId };
  }
  // If payload is provided, JSON.stringify runs on this background vCPU thread!
  let jsonStr = rawJson;
  if (jsonStr === undefined || jsonStr === null) {
    if (typeof payload === 'string') {
      jsonStr = payload;
    } else {
      jsonStr = JSON.stringify(payload);
    }
  }

  const dir = path.dirname(file);
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch (_) {}

  const tmp = file + '.tmp.' + process.pid + '.' + threadId + '.' + (++tmpCounter).toString(36);
  let fh = null;

  try {
    fh = await fs.promises.open(tmp, 'w');
    await fh.writeFile(jsonStr, 'utf8');
    await fh.sync();
    await fh.close();
    fh = null;

    // Atomically claim commit ownership (0 -> 2). If client already timed out (state === 1),
    // abort before touching the target file or .bak to prevent clobbering newer inline writes.
    if (stateArr && Atomics.compareExchange(stateArr, 0, 0, 2) !== 0) {
      try { await fs.promises.unlink(tmp); } catch (_) {}
      return { id, ok: false, cancelled: true, threadId };
    }

    // HIGH-1: на диске уже более свежая ревизия профиля (её записал другой процесс) —
    // устаревший снимок не применяем.
    if (Number.isFinite(rev) && rev > 0) {
      const onDisk = await diskSaveRev(file);
      if (onDisk > rev) {
        try { await fs.promises.unlink(tmp); } catch (_) {}
        return { id, ok: true, skipped: 'stale_rev', file, rev, diskRev: onDisk, threadId };
      }
    }

    if (makeBak !== false) {
      try {
        await retryFs(() => fs.promises.copyFile(file, file + '.bak'), 4, 15);
      } catch (e) {
        const code = e && e.code;
        if (code === 'ENOENT') {
          // File does not exist yet (first save) - totally normal
        } else if (code === 'EBUSY') {
          // Locked transiently on Windows, proceed with save
        } else {
          throw e;
        }
      }
    }

    await retryFs(() => fs.promises.rename(tmp, file), 5, 20);

    return {
      id,
      ok: true,
      file,
      bytes: Buffer.byteLength(jsonStr, 'utf8'),
      threadId
    };
  } catch (err) {
    if (fh) {
      try { await fh.close(); } catch (_) {}
    }
    try { await fs.promises.unlink(tmp); } catch (_) {}
    return {
      id,
      ok: false,
      error: err && err.message,
      code: err && err.code,
      threadId
    };
  }
}

async function handleUnlink(task) {
  const { id, file, makeBak = true, stateBuf } = task;
  const stateArr = (stateBuf && stateBuf instanceof SharedArrayBuffer) ? new Int32Array(stateBuf) : null;
  if (stateArr && Atomics.compareExchange(stateArr, 0, 0, 2) !== 0) {
    return { id, ok: false, cancelled: true, threadId };
  }
  try {
    try {
      await fs.promises.unlink(file);
    } catch (e) {
      if (e && e.code !== 'ENOENT') throw e;
    }
    if (makeBak) {
      try {
        await fs.promises.unlink(file + '.bak');
      } catch (e) {
        if (e && e.code !== 'ENOENT') throw e;
      }
    }
    return { id, ok: true, threadId };
  } catch (err) {
    return { id, ok: false, error: err && err.message, code: err && err.code, threadId };
  }
}

function handleEncryptVault(task) {
  const { id, rawObj, jsonStr: providedJson, vaultKeyHex } = task;
  try {
    const jsonStr = typeof providedJson === 'string' ? providedJson : JSON.stringify(rawObj);
    const keyBuf = Buffer.from(String(vaultKeyHex || ''), 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
    let ciphertext = cipher.update(jsonStr, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    const envelope = {
      v: 2,
      enc: 'aes-256-gcm',
      iv: iv.toString('hex'),
      tag: authTag,
      data: ciphertext,
      updatedAt: Date.now()
    };
    return { id, ok: true, envelope, bytes: Buffer.byteLength(jsonStr, 'utf8'), threadId };
  } catch (err) {
    return { id, ok: false, error: err && err.message, code: err && err.code, threadId };
  }
}

parentPort.on('message', async (task) => {
  if (!task || typeof task !== 'object') return;

  const { id, type } = task;

  if (type === 'write_atomic') {
    const res = await handleWriteAtomic(task);
    parentPort.postMessage(res);
  } else if (type === 'unlink') {
    const res = await handleUnlink(task);
    parentPort.postMessage(res);
  } else if (type === 'encrypt_vault') {
    const res = handleEncryptVault(task);
    parentPort.postMessage(res);
  } else if (type === 'stringify_batch') {
    try {
      const list = Array.isArray(task.items)
        ? task.items.map(it => (typeof it === 'string' ? it : JSON.stringify(it)))
        : [];
      parentPort.postMessage({ id, ok: true, list, threadId });
    } catch (err) {
      parentPort.postMessage({ id, ok: false, error: err && err.message, threadId });
    }
  } else if (type === 'ping') {
    parentPort.postMessage({ id, ok: true, pong: true, threadId });
  } else {
    parentPort.postMessage({ id, ok: false, error: 'Unknown task type: ' + type });
  }
});
