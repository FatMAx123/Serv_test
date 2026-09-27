// ============================================================
//  SERVER / WORKERS / PERSISTENCE-WORKER.JS
//  Dedicated V8 Isolate for atomic file I/O & JSON serialization.
//  Executes on vCPU 2 to relieve the main game loop on vCPU 1.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
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

async function handleWriteAtomic(task) {
  const { id, file, payload, json: rawJson, makeBak = true } = task;
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
  const { id, file, makeBak = true } = task;
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

parentPort.on('message', async (task) => {
  if (!task || typeof task !== 'object') return;

  const { id, type } = task;

  if (type === 'write_atomic') {
    const res = await handleWriteAtomic(task);
    parentPort.postMessage(res);
  } else if (type === 'unlink') {
    const res = await handleUnlink(task);
    parentPort.postMessage(res);
  } else if (type === 'ping') {
    parentPort.postMessage({ id, ok: true, pong: true, threadId });
  } else {
    parentPort.postMessage({ id, ok: false, error: 'Unknown task type: ' + type });
  }
});
