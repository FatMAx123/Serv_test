// ============================================================
//  SERVER / WORKERS / PERSISTENCE-CLIENT.JS
//  Client manager for Worker Thread persistence offload.
//  Dispatches writes to vCPU 2 with transparent inline fallback.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const origCopyFile = fs.promises.copyFile;
const origWriteFile = fs.promises.writeFile;
const origRename = fs.promises.rename;

let Worker = null;
try {
  ({ Worker } = require('worker_threads'));
} catch (_) {}

class PersistenceClient {
  constructor(options = {}) {
    this.workerPath = options.workerPath || path.join(__dirname, 'persistence-worker.js');
    this.disabled = !!options.disabled || process.env.DISABLE_PERSISTENCE_WORKER === '1';
    this.worker = null;
    this.nextJobId = 0;
    this.pendingJobs = new Map();
    this.tmpCounter = 0;

    // Stats
    this.stats = {
      totalWrites: 0,
      totalBytes: 0,
      workerWrites: 0,
      fallbackWrites: 0,
      errors: 0
    };

    if (!this.disabled && Worker) {
      this._initWorker();
    }
  }

  _initWorker() {
    try {
      this.worker = new Worker(this.workerPath);
      // unref allows the node process to exit naturally without hanging tests
      this.worker.unref();

      this.worker.on('message', (msg) => {
        if (!msg || typeof msg !== 'object') return;
        const job = this.pendingJobs.get(msg.id);
        if (!job) return;

        this.pendingJobs.delete(msg.id);
        if (job.timer) clearTimeout(job.timer);

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

      this.worker.on('error', (err) => {
        console.error('[PersistenceClient] Worker error:', err && err.message);
        this.stats.errors++;
        // Reject all pending jobs
        for (const [id, job] of this.pendingJobs.entries()) {
          if (job.timer) clearTimeout(job.timer);
          job.reject(err);
        }
        this.pendingJobs.clear();
        this.worker = null;
      });

      this.worker.on('exit', (code) => {
        if (code !== 0 && this.pendingJobs.size > 0) {
          console.warn(`[PersistenceClient] Worker exited unexpectedly with code ${code}`);
          for (const [id, job] of this.pendingJobs.entries()) {
            if (job.timer) clearTimeout(job.timer);
            job.reject(new Error(`Worker exited with code ${code}`));
          }
          this.pendingJobs.clear();
        }
        this.worker = null;
      });
    } catch (err) {
      console.warn('[PersistenceClient] Failed to spawn worker, using inline fallback:', err && err.message);
      this.worker = null;
    }
  }

  isWorkerActive() {
    if (this.disabled || this.worker === null) return false;
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
  async _writeAtomicInline(file, { payload, json: rawJson, label, makeBak = true }) {
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
   * Atomic file save with offload to vCPU 2.
   */
  async writeAtomic(file, opts = {}) {
    this.stats.totalWrites++;

    // If worker is not active or disabled, use inline fallback
    if (!this.isWorkerActive()) {
      return this._writeAtomicInline(file, opts);
    }

    const id = ++this.nextJobId;
    const { payload, json, label, makeBak = true } = opts;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingJobs.has(id)) {
          this.pendingJobs.delete(id);
          console.warn('[PersistenceClient] Worker write timed out, falling back inline:', file);
          this._writeAtomicInline(file, opts).then(resolve, reject);
        }
      }, 10000);

      this.pendingJobs.set(id, { resolve, reject, timer });

      try {
        this.worker.postMessage({
          id,
          type: 'write_atomic',
          file,
          payload,
          json,
          label,
          makeBak
        });
      } catch (postErr) {
        clearTimeout(timer);
        this.pendingJobs.delete(id);
        console.warn('[PersistenceClient] postMessage failed, falling back inline:', postErr && postErr.message);
        this._writeAtomicInline(file, opts).then(resolve, reject);
      }
    });
  }

  async unlink(file, opts = {}) {
    const { makeBak = true } = opts;
    if (!this.isWorkerActive()) {
      try { await fs.promises.unlink(file); } catch (e) { if (e && e.code !== 'ENOENT') throw e; }
      if (makeBak) {
        try { await fs.promises.unlink(file + '.bak'); } catch (_) {}
      }
      return { ok: true, inline: true };
    }

    const id = ++this.nextJobId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingJobs.has(id)) {
          this.pendingJobs.delete(id);
          resolve({ ok: true, timedOut: true });
        }
      }, 5000);

      this.pendingJobs.set(id, { resolve, reject, timer });

      try {
        this.worker.postMessage({ id, type: 'unlink', file, makeBak });
      } catch (_) {
        clearTimeout(timer);
        this.pendingJobs.delete(id);
        resolve({ ok: true, inline: true });
      }
    });
  }

  async ping() {
    if (!this.isWorkerActive()) return { ok: true, pong: false, inline: true };
    const id = ++this.nextJobId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingJobs.delete(id);
        resolve({ ok: false, error: 'Ping timeout' });
      }, 2000);
      this.pendingJobs.set(id, {
        resolve: (res) => { clearTimeout(timer); resolve(res); },
        reject: () => { clearTimeout(timer); resolve({ ok: false }); }
      });
      try {
        this.worker.postMessage({ id, type: 'ping' });
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
      workerActive: this.isWorkerActive()
    };
  }

  async terminate() {
    if (this.worker) {
      const w = this.worker;
      this.worker = null;
      await w.terminate();
    }
  }
}

// Global singleton instance
const defaultClient = new PersistenceClient();

module.exports = {
  PersistenceClient,
  defaultClient
};
