'use strict';

/**
 * server/world/leaderboard-manager.js
 * ============================================================================
 * Индекс и кэш таблицы лидеров (/api/leaderboard).
 * Загружается один раз при старте сервера (из PostgreSQL или JSON-профилей)
 * и обновляется инкрементально в памяти при каждом сохранении/удалении профиля.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const CH = require('../../shared/char-rules.js');
const DB = require('../db.js');

const LB_TTL_MS = 15000;
const lbScoreOf = (level, exp) => (Number(level) || 1) * 1000 + (Number(exp) || 0);

function createLeaderboardManager(ctx) {
  const {
    players,
    dataDir = path.join(__dirname, '..', '..', 'data')
  } = ctx;

  const lbIndex = new Map(); // profileKey(yid, charId) -> { name, level, exp, score }
  let lbIndexReady = false;
  let lbCache = null;
  let lbCacheAt = 0;

  function lbTouch(yid, pr, charId) {
    if (!yid || !pr || String(yid).startsWith('bot_')) return;
    const key = CH.profileKey(yid, charId || pr.charId);
    lbIndex.set(key, {
      name: pr.name || String(yid),
      level: pr.level || 1,
      exp: pr.exp || 0,
      score: lbScoreOf(pr.level, pr.exp)
    });
  }

  function lbDrop(yid, charId) {
    if (!yid) return;
    lbIndex.delete(CH.profileKey(yid, charId));
    lbCache = null;
    lbCacheAt = 0;
  }

  async function loadLeaderboardIndex() {
    try {
      if (DB.MODE === 'postgres' && typeof DB.getPool === 'function') {
        const pool = DB.getPool();
        const r = await pool.query(
          "SELECT yid, data FROM profiles ORDER BY COALESCE((data->>'level')::int, 1) DESC, COALESCE((data->>'exp')::bigint, 0) DESC, updated DESC LIMIT 1000"
        );
        for (const row of (r.rows || [])) {
          if (!row || !row.data) continue;
          const key = String(row.yid || '');
          const idx = key.indexOf(':');
          const yid = idx >= 0 ? key.slice(0, idx) : key;
          const charId = idx >= 0 ? key.slice(idx + 1) : CH.DEFAULT_CHAR_ID;
          lbTouch(yid, row.data, charId);
        }
      } else {
        const files = (await fs.promises.readdir(dataDir).catch(() => []))
          .filter(f => f.endsWith('.json'));
        for (const f of files) {
          try {
            const raw = await fs.promises.readFile(path.join(dataDir, f), 'utf8');
            const d = JSON.parse(raw);
            if (!d || typeof d !== 'object') continue;
            const parsed = CH.parseProfileStem(f.replace(/\.json$/i, ''));
            lbTouch(parsed.yid, d, parsed.charId);
          } catch (e) { /* skip bad file */ }
        }
      }
    } catch (e) { /* ignore */ }
    lbIndexReady = true;
    lbCache = null;
    console.log('[server] leaderboard index: ' + lbIndex.size + ' профилей');
  }

  function buildLeaderboard(limit) {
    limit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)));
    const now = Date.now();
    if (lbCache && lbCache.limit === limit && now - lbCacheAt < LB_TTL_MS) return lbCache.rows;

    const byKey = new Map();
    for (const [key, r] of lbIndex) {
      byKey.set(key, { name: r.name, level: r.level, exp: r.exp, score: r.score, online: false });
    }
    if (players) {
      for (const [, p] of players) {
        if (p.yid && String(p.yid).startsWith('bot_')) continue;
        const key = CH.profileKey(p.yid || p.name || p.pid, p.charId);
        byKey.set(key, {
          name: p.name || 'Operator',
          level: p.level || 1,
          exp: p.exp || 0,
          score: lbScoreOf(p.level, p.exp),
          online: true
        });
      }
    }

    const rows = [...byKey.values()]
      .sort((a, b) => b.score - a.score || b.level - a.level || String(a.name).localeCompare(String(b.name)))
      .slice(0, limit)
      .map(r => ({ name: r.name, level: r.level, score: r.score, online: !!r.online }));
    lbCache = { limit, rows };
    lbCacheAt = now;
    return rows;
  }

  return {
    lbIndex,
    lbScoreOf,
    lbTouch,
    lbDrop,
    loadLeaderboardIndex,
    buildLeaderboard,
    isReady: () => lbIndexReady
  };
}

module.exports = {
  createLeaderboardManager,
  lbScoreOf,
  LB_TTL_MS
};

