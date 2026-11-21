// SERVER / CORE / TRANSFER-SAVE.JS — атомарное сохранение переносов между профилями.
// Обмен и личная лавка меняют два профиля, клан-склад — профиль и клан. Раньше записи шли
// независимо, и падение процесса между ними давало дюп или потерю. Теперь все записи
// переноса — одной операцией DB.saveAtomic (транзакция Postgres / журнал файловой БД).
'use strict';

function createTransferSave(ctx) {
  const {
    DB,
    Clans,
    profileOf,
    lbTouch = () => {},
    onProfileSaveFailed = () => {},
    saveProfileNow,
    isSyntheticBot = () => false,
    dirtyProfiles = null
  } = ctx;

  /** Снимок профиля для переноса (снимает профиль из очереди write-behind). */
  function profileTxnItem(p) {
    if (!p || p._handedOff) return null;
    if (p.yid && isSyntheticBot(p.yid)) return null;
    const key = p._profileKey || (p._profileKey = p.yid + ':' + (p.charId || 'c0'));
    if (dirtyProfiles) dirtyProfiles.delete(key);
    const pr = profileOf(p);
    lbTouch(p.yid, pr, p.charId);
    return { kind: 'profile', yid: p.yid, charId: p.charId, data: pr };
  }

  /**
   * Сохранить перенос одной операцией. clan — склад клана (вклад/выдача), иначе null.
   * При ошибке снимки профилей уходят в очередь повторов, склад клана — обычной записью.
   */
  function saveTransferAtomic(playersList, clan) {
    const items = (playersList || []).map(profileTxnItem).filter(Boolean);
    const onFail = (e) => {
      console.error('[DB] атомарный перенос не записан:', e && e.message);
      for (const it of items) onProfileSaveFailed(it);
      if (clan && Clans && typeof Clans.persistOnly === 'function') {
        try { const r = Clans.persistOnly(clan); if (r && r.catch) r.catch(() => {}); } catch (_) { }
      }
    };
    try {
      let r;
      if (clan && Clans && typeof Clans.saveWhAtomic === 'function') r = Clans.saveWhAtomic(clan, items);
      else if (DB && typeof DB.saveAtomic === 'function') r = DB.saveAtomic(items);
      else {
        for (const p of playersList || []) saveProfileNow(p);
        if (clan && Clans) Clans.saveWh(clan);
        return;
      }
      if (r && typeof r.catch === 'function') r.catch(onFail);
    } catch (e) { onFail(e); }
  }

  return { profileTxnItem, saveTransferAtomic };
}

module.exports = { createTransferSave };
