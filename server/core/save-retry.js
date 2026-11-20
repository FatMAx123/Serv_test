// SERVER / CORE / SAVE-RETRY.JS — очередь повторов неудавшихся сохранений профилей.
// Раньше профиль снимался из «грязных» ДО записи, и при ошибке (диск полон, мастер кластера не
// ответил) прогресс до следующего изменения терялся, а у вышедшего игрока — насовсем.
// Храним самый свежий снимок на профиль; устаревший снимок при повторе отсекает проверка saveRev.
'use strict';

const FAILED_SAVES_MAX = 5000;

function createSaveRetry(ctx) {
  const DB = ctx.DB;
  const failed = new Map(); // `${yid}:${charId}` -> { yid, charId, data }

  function onSaveFailed(item) {
    if (!item || !item.yid || !item.data) return;
    const key = item.yid + ':' + (item.charId || 'c0');
    const prev = failed.get(key);
    const prevRev = prev ? Number(prev.data && prev.data.saveRev) || 0 : -1;
    const rev = Number(item.data.saveRev) || 0;
    if (prev && prevRev > rev) return;
    if (!prev && failed.size >= FAILED_SAVES_MAX) {
      console.error('[DB] очередь повторов сохранений переполнена — снимок не поставлен:', key);
      return;
    }
    failed.set(key, { yid: item.yid, charId: item.charId, data: item.data });
  }

  /** Повторить до limit снимков (небольшими порциями, чтобы не забить очередь записи). */
  function retry(limit) {
    if (failed.size === 0) return;
    let n = Math.max(1, limit | 0);
    for (const [key, item] of failed) {
      failed.delete(key);
      try {
        const r = DB.save(item.yid, item.data, item.charId);
        if (r && typeof r.catch === 'function') r.catch(() => onSaveFailed(item));
      } catch (_) { onSaveFailed(item); }
      if (--n <= 0) break;
    }
  }

  /** saveBatch / save с постановкой упавших снимков в очередь повторов. */
  function saveBatch(batch, label) {
    if (!batch || batch.length === 0) return;
    const onErr = (e) => {
      console.error('[DB] ' + label + ':', e && e.message);
      for (const item of batch) onSaveFailed(item);
    };
    try {
      if (typeof DB.saveBatch === 'function') {
        const r = DB.saveBatch(batch);
        if (r && typeof r.catch === 'function') r.catch(onErr);
      } else {
        for (const item of batch) {
          const r = DB.save(item.yid, item.data, item.charId);
          if (r && typeof r.catch === 'function') {
            r.catch((e) => { console.error('[DB] save', item.yid, e && e.message); onSaveFailed(item); });
          }
        }
      }
    } catch (e) { onErr(e); }
  }

  /** Забрать все снимки (для финальной записи при остановке). */
  function drain() {
    const out = [...failed.values()];
    failed.clear();
    return out;
  }

  return { onSaveFailed, retry, saveBatch, drain, size: () => failed.size };
}

module.exports = { createSaveRetry, FAILED_SAVES_MAX };
