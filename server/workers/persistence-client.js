// ============================================================
//  SERVER / WORKERS / PERSISTENCE-CLIENT.JS
//  Client manager for Worker Thread persistence offload.
//  Dispatches writes to vCPU 2 with transparent inline fallback.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const origCopyFile = fs.promises.copyFile;
const origWriteFile = fs.promises.writeFile;
const origRename = fs.promises.rename;

let Worker = null;
try {
  ({ Worker } = require('worker_threads'));
} catch (_) {}

/**
 * Ревизия профиля на диске (поле saveRev). 0 — файла нет, поле не задано или файл битый
 * (битый файл не должен блокировать запись свежего снимка).
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

class PersistenceClient {
  constructor(options = {}) {
    this.workerPath = options.workerPath || path.join(__dirname, 'persistence-worker.js');
    this.disabled = !!options.disabled || process.env.DISABLE_PERSISTENCE_WORKER === '1';
    this.workers = [];
    this.roundRobin = 0;
    this.nextJobId = 0;
    this.pendingJobs = new Map();
    this.fileLocks = new Map();
    this.tmpCounter = 0;
    this._terminating = false;
    this._respawnTimers = new Set();
    this.writeTimeoutMs = options.writeTimeoutMs || 10000;
    this.unlinkTimeoutMs = options.unlinkTimeoutMs || 5000;
    this.respawnDelayMs = options.respawnDelayMs != null ? options.respawnDelayMs : 50;

    const numCpus = os.cpus() ? os.cpus().length : 4;
    const defaultPool = Math.max(1, Math.min(4, Math.floor(numCpus / 2))); // e.g. 2 for 4 vCPUs, 1 for 2 vCPUs
    this.poolSize = options.poolSize || parseInt(process.env.PERSISTENCE_WORKERS || String(defaultPool), 10);

    // Stats
    this.stats = {
      totalWrites: 0,
      totalBytes: 0,
      workerWrites: 0,
      fallbackWrites: 0,
      respawns: 0,
      errors: 0
    };

    this._workersInitialized = false;
    if (!this.disabled && Worker && !options.lazy) {
      this._workersInitialized = true;
      this._initWorkers();
    }
  }

  get worker() {
    return this.workers.length > 0 ? this.workers[0] : null;
  }

  set worker(w) {
    if (!w) {
      this.workers = [];
    } else {
      this.workers = [w];
    }
    this._workersInitialized = true;
  }

  async _withFileLock(file, fn) {
    if (!file) return fn();
    const key = path.resolve(String(file));
    const prev = this.fileLocks.get(key) || Promise.resolve();
    let release;
    const next = new Promise((r) => { release = r; });
    const chain = prev.then(() => next, () => next);
    this.fileLocks.set(key, chain);
    await prev.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
      if (this.fileLocks.get(key) === chain) {
        this.fileLocks.delete(key);
      }
    }
  }

  _initWorkers() {
    for (let i = 0; i < this.poolSize; i++) {
      this._spawnWorker(i);
    }
  }

  _handleWorkerDown(w, idx, reasonErr, shouldRespawn) {
    if (w && w._downHandled) return;
    if (w) w._downHandled = true;
    const pos = this.workers.indexOf(w);
    if (pos !== -1) this.workers.splice(pos, 1);

    for (const [id, job] of this.pendingJobs.entries()) {
      if (job.worker !== w) continue;
      this.pendingJobs.delete(id);
      if (job.timer) clearTimeout(job.timer);
      if (job.commitTimer) clearTimeout(job.commitTimer);
      if (job.stateArr && Atomics.compareExchange(job.stateArr, 0, 0, 1) !== 0) {
        // Worker already committed rename right before exit
        if (typeof job.onAlreadyCommitted === 'function') {
          job.onAlreadyCommitted();
          continue;
        }
      }
      if (typeof job.onWorkerCrash === 'function') {
        job.onWorkerCrash(reasonErr);
      } else {
        job.reject(reasonErr);
      }
    }

    if (shouldRespawn && !this.disabled && !this._terminating && Worker && this.workers.length < this.poolSize) {
      const spawnNow = () => {
        if (this.disabled || this._terminating || this.workers.length >= this.poolSize) return;
        this.stats.respawns++;
        this._spawnWorker(idx);
      };
      if (this.respawnDelayMs <= 0) {
        spawnNow();
      } else {
        const t = setTimeout(() => {
          this._respawnTimers.delete(t);
          spawnNow();
        }, this.respawnDelayMs);
        if (t.unref) t.unref();
        this._respawnTimers.add(t);
      }
    }
  }

  _spawnWorker(idx) {
    if (this.disabled || this._terminating || !Worker) return null;
    try {
      const w = new Worker(this.workerPath);
      w._poolIdx = idx;
      // unref allows the node process to exit naturally without hanging tests
      w.unref();

      w.on('message', (msg) => {
        if (!msg || typeof msg !== 'object') return;
        const job = this.pendingJobs.get(msg.id);
        if (!job) return;

        this.pendingJobs.delete(msg.id);
        if (job.timer) clearTimeout(job.timer);
        if (job.commitTimer) clearTimeout(job.commitTimer);

        if (msg.cancelled) {
          if (typeof job.onWorkerCrash === 'function') {
            job.onWorkerCrash(new Error('Worker job cancelled'));
          } else {
            job.reject(new Error('Worker job cancelled'));
          }
          return;
        }

        if (msg.ok) {
          this.stats.workerWrites++;
          if (msg.bytes) this.stats.totalBytes += msg.bytes;
          job.resolve(msg);
        } else {
          this.stats.errors++;
          const err = new Error(msg.error || 'Persistence worker error');
          if (msg.code) err.code = msg.code;
          job.reject(err);
        }
      });

      w.on('error', (err) => {
        console.error(`[PersistenceClient] Worker #${idx} error:`, err && err.message);
        this.stats.errors++;
        this._handleWorkerDown(w, idx, err || new Error('Worker error'), true);
      });

      w.on('exit', (code) => {
        const unexpected = !this._terminating && code !== 0;
        if (unexpected) {
          console.warn(`[PersistenceClient] Worker #${idx} exited unexpectedly with code ${code}`);
        }
        this._handleWorkerDown(
          w,
          idx,
          new Error(`Worker #${idx} exited with code ${code}`),
          !this._terminating
        );
      });

      this.workers.push(w);
      return w;
    } catch (err) {
      console.warn(`[PersistenceClient] Failed to spawn worker #${idx}, using inline fallback:`, err && err.message);
      return null;
    }
  }

  _ensureWorkers() {
    if (this._workersInitialized || this.disabled || !Worker || this._terminating) return;
    this._workersInitialized = true;
    this._initWorkers();
  }

  _nextWorker() {
    if (this.workers.length === 0 && !this._workersInitialized) {
      this._ensureWorkers();
    }
    if (this.workers.length === 0) return null;
    const w = this.workers[this.roundRobin % this.workers.length];
    this.roundRobin++;
    return w;
  }

  isWorkerActive() {
    if (this.disabled) return false;
    if (this.workers.length === 0 && !this._workersInitialized) {
      this._ensureWorkers();
    }
    if (this.worker === null) return false;
    if (fs.promises.copyFile !== origCopyFile || fs.promises.writeFile !== origWriteFile || fs.promises.rename !== origRename) {
      return false;
    }
    return true;
  }

  /**
   * Transient file locks retry helper (Windows NTFS support).
   */
  async _retryFs(fn, retries = 5, delayMs = 20) {
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
   * Synchronous / inline atomic file write fallback.
   */
  async _writeAtomicInline(file, { payload, json: rawJson, label, makeBak = true, rev }) {
    this.stats.fallbackWrites++;
    let jsonStr = rawJson;
    if (jsonStr === undefined || jsonStr === null) {
      jsonStr = (typeof payload === 'string') ? payload : JSON.stringify(payload);
    }

    const dir = path.dirname(file);
    try {
      await fs.promises.mkdir(dir, { recursive: true });
    } catch (_) {}

    const tmp = file + '.tmp.' + process.pid + '.' + (++this.tmpCounter).toString(36);
    let fh = null;

    try {
      fh = await fs.promises.open(tmp, 'w');
      await fh.writeFile(jsonStr, 'utf8');
      await fh.sync();
      await fh.close();
      fh = null;

      // HIGH-1: более свежая ревизия профиля уже на диске — устаревший снимок не применяем.
      if (Number.isFinite(rev) && rev > 0) {
        const onDisk = await diskSaveRev(file);
        if (onDisk > rev) {
          try { await fs.promises.unlink(tmp); } catch (_) {}
          this.stats.staleSkips = (this.stats.staleSkips || 0) + 1;
          return { ok: true, skipped: 'stale_rev', file, rev, diskRev: onDisk, inline: true };
        }
      }

      if (makeBak !== false) {
        try {
          await this._retryFs(() => fs.promises.copyFile(file, file + '.bak'), 4, 15);
        } catch (e) {
          const code = e && e.code;
          if (code === 'ENOENT') {
            // First save, ignore
          } else if (code === 'EBUSY') {
            // Transient lock on Windows, proceed
          } else {
            throw e;
          }
        }
      }

      await this._retryFs(() => fs.promises.rename(tmp, file), 5, 20);
      const bytes = Buffer.byteLength(jsonStr, 'utf8');
      this.stats.totalBytes += bytes;
      return { ok: true, file, bytes, inline: true };
    } catch (e) {
      if (fh) {
        try { await fh.close(); } catch (_) {}
      }
      try { await fs.promises.unlink(tmp); } catch (_) {}
      this.stats.errors++;
      console.error('[PersistenceClient] Inline write error:', label || file, e && e.message);
      throw e;
    }
  }

  /**
   * Atomic file save with offload to vCPU Worker pool.
   */
  async writeAtomic(file, opts = {}) {
    this.stats.totalWrites++;
    return this._withFileLock(file, () => this._writeAtomicUnlocked(file, opts));
  }

  async _writeAtomicUnlocked(file, opts = {}) {
    // If worker is not active or disabled, use inline fallback
    if (!this.isWorkerActive()) {
      return this._writeAtomicInline(file, opts);
    }

    const targetWorker = this._nextWorker();
    if (!targetWorker) {
      return this._writeAtomicInline(file, opts);
    }

    const id = ++this.nextJobId;
    const { payload, json, label, makeBak = true, rev } = opts;
    const stateBuf = typeof SharedArrayBuffer === 'function' ? new SharedArrayBuffer(4) : null;
    const stateArr = stateBuf ? new Int32Array(stateBuf) : null;

    return new Promise((resolve, reject) => {
      const fallbackInline = () => {
        this._writeAtomicInline(file, opts).then(resolve, reject);
      };

      const timer = setTimeout(() => {
        if (!this.pendingJobs.has(id)) return;
        if (stateArr && Atomics.compareExchange(stateArr, 0, 0, 1) !== 0) {
          // Worker already claimed commit stage (state === 2); start hard commit watchdog so caller never hangs forever
          const job = this.pendingJobs.get(id);
          if (job && !job.commitTimer) {
            const commitGraceMs = Math.max(5000, this.commitTimeoutMs || 15000);
            job.commitTimer = setTimeout(() => {
              if (!this.pendingJobs.has(id)) return;
              this.pendingJobs.delete(id);
              const err = new Error('[PersistenceClient] Worker commit stage timed out: ' + file);
              console.error(err.message);
              try {
                if (targetWorker && typeof targetWorker.terminate === 'function') {
                  targetWorker.terminate().catch(() => {});
                }
              } catch (_) {}
              reject(err);
            }, commitGraceMs);
            if (job.commitTimer.unref) job.commitTimer.unref();
          }
          return;
        }
        this.pendingJobs.delete(id);
        console.warn('[PersistenceClient] Worker write timed out, falling back inline:', file);
        fallbackInline();
      }, this.writeTimeoutMs);

      this.pendingJobs.set(id, {
        resolve,
        reject,
        timer,
        commitTimer: null,
        worker: targetWorker,
        file,
        stateArr,
        onWorkerCrash: () => fallbackInline(),
        onAlreadyCommitted: () => resolve({ id, ok: true, file })
      });

      try {
        targetWorker.postMessage({
          id,
          type: 'write_atomic',
          file,
          payload,
          json,
          label,
          makeBak,
          stateBuf,
          rev: Number.isFinite(rev) ? rev : undefined
        });
      } catch (postErr) {
        clearTimeout(timer);
        this.pendingJobs.delete(id);
        console.warn('[PersistenceClient] postMessage failed, falling back inline:', postErr && postErr.message);
        fallbackInline();
      }
    });
  }

  async _unlinkInline(file, makeBak = true) {
    try { await fs.promises.unlink(file); } catch (e) { if (e && e.code !== 'ENOENT') throw e; }
    if (makeBak) {
      try { await fs.promises.unlink(file + '.bak'); } catch (_) {}
    }
    return { ok: true, inline: true };
  }

  async unlink(file, opts = {}) {
    return this._withFileLock(file, () => this._unlinkUnlocked(file, opts));
  }

  async _unlinkUnlocked(file, opts = {}) {
    const { makeBak = true } = opts;
    if (!this.isWorkerActive()) {
      return this._unlinkInline(file, makeBak);
    }

    const targetWorker = this._nextWorker();
    if (!targetWorker) {
      return this._unlinkInline(file, makeBak);
    }

    const id = ++this.nextJobId;
    const stateBuf = typeof SharedArrayBuffer === 'function' ? new SharedArrayBuffer(4) : null;
    const stateArr = stateBuf ? new Int32Array(stateBuf) : null;

    return new Promise((resolve, reject) => {
      const fallbackInline = () => {
        this._unlinkInline(file, makeBak).then(resolve, reject);
      };

      const timer = setTimeout(() => {
        if (!this.pendingJobs.has(id)) return;
        if (stateArr && Atomics.compareExchange(stateArr, 0, 0, 1) !== 0) {
          const job = this.pendingJobs.get(id);
          if (job && !job.commitTimer) {
            const commitGraceMs = Math.max(5000, this.commitTimeoutMs || 15000);
            job.commitTimer = setTimeout(() => {
              if (!this.pendingJobs.has(id)) return;
              this.pendingJobs.delete(id);
              const err = new Error('[PersistenceClient] Worker unlink commit timed out: ' + file);
              try {
                if (targetWorker && typeof targetWorker.terminate === 'function') {
                  targetWorker.terminate().catch(() => {});
                }
              } catch (_) {}
              reject(err);
            }, commitGraceMs);
            if (job.commitTimer.unref) job.commitTimer.unref();
          }
          return;
        }
        this.pendingJobs.delete(id);
        fallbackInline();
      }, this.unlinkTimeoutMs);

      this.pendingJobs.set(id, {
        resolve,
        reject,
        timer,
        commitTimer: null,
        worker: targetWorker,
        file,
        stateArr,
        onWorkerCrash: () => fallbackInline(),
        onAlreadyCommitted: () => resolve({ ok: true })
      });

      try {
        targetWorker.postMessage({ id, type: 'unlink', file, makeBak, stateBuf });
      } catch (_) {
        clearTimeout(timer);
        this.pendingJobs.delete(id);
        fallbackInline();
      }
    });
  }

  _encryptVaultInline(rawObj, vaultKeyBuf) {
    const jsonStr = typeof rawObj === 'string' ? rawObj : JSON.stringify(rawObj);
    const keyBuf = Buffer.isBuffer(vaultKeyBuf) ? vaultKeyBuf : Buffer.from(String(vaultKeyBuf || ''), 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
    let ciphertext = cipher.update(jsonStr, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return {
      v: 2,
      enc: 'aes-256-gcm',
      iv: iv.toString('hex'),
      tag: authTag,
      data: ciphertext,
      updatedAt: Date.now()
    };
  }

  /**
   * Offload JSON.stringify + AES-256-GCM encryption of AccountKeyManager vault to Worker Thread.
   */
  async encryptVault(rawObj, vaultKeyBuf) {
    if (!this.isWorkerActive()) {
      return this._encryptVaultInline(rawObj, vaultKeyBuf);
    }
    const targetWorker = this._nextWorker();
    if (!targetWorker) {
      return this._encryptVaultInline(rawObj, vaultKeyBuf);
    }
    const id = ++this.nextJobId;
    const vaultKeyHex = Buffer.isBuffer(vaultKeyBuf) ? vaultKeyBuf.toString('hex') : String(vaultKeyBuf || '');
    return new Promise((resolve, reject) => {
      const fallbackInline = () => {
        try {
          resolve(this._encryptVaultInline(rawObj, vaultKeyBuf));
        } catch (e) {
          reject(e);
        }
      };

      const timer = setTimeout(() => {
        if (this.pendingJobs.has(id)) {
          this.pendingJobs.delete(id);
          fallbackInline();
        }
      }, 5000);

      this.pendingJobs.set(id, {
        resolve: (msg) => resolve(msg.envelope),
        reject,
        timer,
        worker: targetWorker,
        onWorkerCrash: () => fallbackInline()
      });

      try {
        targetWorker.postMessage({ id, type: 'encrypt_vault', rawObj, vaultKeyHex });
      } catch (_) {
        clearTimeout(timer);
        this.pendingJobs.delete(id);
        fallbackInline();
      }
    });
  }

  /**
   * Offload batch JSON.stringify to vCPU Worker pool (used by PgBackend.saveBatch).
   */
  async stringifyBatch(items) {
    if (!Array.isArray(items) || items.length === 0) return [];
    if (!this.isWorkerActive()) {
      return items.map(it => (typeof it === 'string' ? it : JSON.stringify(it)));
    }
    const targetWorker = this._nextWorker();
    if (!targetWorker) {
      return items.map(it => (typeof it === 'string' ? it : JSON.stringify(it)));
    }
    const id = ++this.nextJobId;
    return new Promise((resolve, reject) => {
      const fallbackInline = () => {
        try {
          resolve(items.map(it => (typeof it === 'string' ? it : JSON.stringify(it))));
        } catch (e) {
          reject(e);
        }
      };

      const timer = setTimeout(() => {
        if (this.pendingJobs.has(id)) {
          this.pendingJobs.delete(id);
          fallbackInline();
        }
      }, 5000);

      this.pendingJobs.set(id, {
        resolve: (msg) => resolve(msg.list || []),
        reject,
        timer,
        worker: targetWorker,
        onWorkerCrash: () => fallbackInline()
      });

      try {
        targetWorker.postMessage({ id, type: 'stringify_batch', items });
      } catch (_) {
        clearTimeout(timer);
        this.pendingJobs.delete(id);
        fallbackInline();
      }
    });
  }

  async ping() {
    if (!this.isWorkerActive()) return { ok: true, pong: false, inline: true };
    const targetWorker = this._nextWorker();
    if (!targetWorker) return { ok: true, pong: false, inline: true };
    const id = ++this.nextJobId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingJobs.delete(id);
        resolve({ ok: false, error: 'Ping timeout' });
      }, 2000);
      this.pendingJobs.set(id, {
        resolve: (res) => { clearTimeout(timer); resolve(res); },
        reject: () => { clearTimeout(timer); resolve({ ok: false }); },
        timer,
        worker: targetWorker
      });
      try {
        targetWorker.postMessage({ id, type: 'ping' });
      } catch (e) {
        clearTimeout(timer);
        this.pendingJobs.delete(id);
        resolve({ ok: false, error: e.message });
      }
    });
  }

  getStats() {
    return {
      ...this.stats,
      activeJobs: this.pendingJobs.size,
      workerCount: this.workers.length,
      workerActive: this.isWorkerActive()
    };
  }

  async terminate() {
    this._terminating = true;
    for (const t of this._respawnTimers) {
      clearTimeout(t);
    }
    this._respawnTimers.clear();
    const list = this.workers.slice();
    this.workers = [];
    await Promise.all(list.map(w => {
      try {
        return w.terminate();
      } catch (_) {
        return Promise.resolve();
      }
    }));
  }
}

// Global singleton instance
const defaultClient = new PersistenceClient();

module.exports = {
  PersistenceClient,
  defaultClient
};
