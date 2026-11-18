// ============================================================
//  SERVER / CORE / AOI-HELPER.JS
//  Помощник выборки NativeSpatialGrid::queryRadius с защитой
//  приоритетных кандидатов (цель, группа, живые игроки) от обрезки
//  буфера при экстремальной плотности ботов в зоне.
// ============================================================
'use strict';

const NATIVE_QUERY_BUF_CAP = 4096;

/**
 * Опрашивает нативный C++ AVX2 SpatialGrid и гарантирует, что текущая цель,
 * участники группы и живые игроки (при переполнении буфера 4096 ботами)
 * не выпадут из расчёта AOI. Работает поверх переиспользуемых Set без аллокаций.
 *
 * @param {object} ctx
 */
function queryNativeAoiWithRescue(ctx) {
  const {
    p,
    partySet,
    isMeBot,
    aoiRadius,
    nativeSpatialGrid,
    spatialGrid,
    nativePBuf,
    nativeMBuf,
    players,
    mobs,
    borderGhosts,
    dist2,
    onPlayer,
    onMob,
    seenPartySet,
    overflowSeenSet
  } = ctx;

  const res = nativeSpatialGrid.queryRadius(p.x, p.z, aoiRadius, nativePBuf, nativeMBuf);
  const pCap = nativePBuf ? nativePBuf.length : NATIVE_QUERY_BUF_CAP;
  const pOverflow = res.players >= pCap;

  const targetType = p.target ? p.target.type : null;
  const targetPid = (targetType === 'p' && p.target.pid) ? p.target.pid : 0;
  const combatTargetPid = (p.combatTargetPid && p.combatTargetPid !== targetPid) ? p.combatTargetPid : 0;
  const targetMid = (targetType === 'm' && p.target.mid) ? p.target.mid : 0;

  const checkGhostsAfter = Boolean(borderGhosts && borderGhosts.size > 0 && !nativeSpatialGrid._ghostsInserted);
  const trackSeen = pOverflow || checkGhostsAfter;

  let seenTargetP = targetPid <= 0;
  let seenCombatP = combatTargetPid <= 0;
  let seenTargetM = targetMid <= 0;

  if (partySet && partySet.size > 0) seenPartySet.clear();
  if (trackSeen) overflowSeenSet.clear();

  for (let i = 0; i < res.players; i++) {
    const pid = nativePBuf[i];
    if (pid === targetPid) seenTargetP = true;
    if (pid === combatTargetPid) seenCombatP = true;
    if (partySet && partySet.has(pid)) seenPartySet.add(pid);
    if (trackSeen) overflowSeenSet.add(pid);
    const pl = players.get(pid) || (borderGhosts.size > 0 ? borderGhosts.get(pid) : null);
    if (pl) onPlayer(pl);
  }

  // Гарантируем попадание членов группы в кандидаты AOI независимо от порядка ячеек
  if (partySet && partySet.size > 0) {
    for (const mPid of partySet) {
      if (mPid === p.pid || seenPartySet.has(mPid)) continue;
      if (mPid === targetPid) seenTargetP = true;
      if (mPid === combatTargetPid) seenCombatP = true;
      if (trackSeen) overflowSeenSet.add(mPid);
      const mpl = players.get(mPid) || (borderGhosts.size > 0 ? borderGhosts.get(mPid) : null);
      if (mpl) onPlayer(mpl);
    }
  }

  // Гарантируем попадание текущей боевой цели-игрока
  if (!seenTargetP && targetPid !== p.pid) {
    if (trackSeen) overflowSeenSet.add(targetPid);
    const tpl = players.get(targetPid) || (borderGhosts.size > 0 ? borderGhosts.get(targetPid) : null);
    if (tpl) onPlayer(tpl);
  }
  if (!seenCombatP && combatTargetPid !== p.pid) {
    if (trackSeen) overflowSeenSet.add(combatTargetPid);
    const ctpl = players.get(combatTargetPid) || (borderGhosts.size > 0 ? borderGhosts.get(combatTargetPid) : null);
    if (ctpl) onPlayer(ctpl);
  }

  // При переполнении 4096-слотового буфера живой наблюдатель добирает всех живых игроков из JS spatialGrid
  // (в tick() JS spatialGrid индексирует только живых игроков без ботов)
  if (pOverflow && !isMeBot && spatialGrid) {
    spatialGrid.forEachCandidate(p.x, p.z, aoiRadius, (pl) => {
      if (!pl || pl.pid === p.pid || overflowSeenSet.has(pl.pid)) return;
      overflowSeenSet.add(pl.pid);
      onPlayer(pl);
    }, null);
  }

  for (let i = 0; i < res.mobs; i++) {
    const mid = nativeMBuf[i];
    if (mid === targetMid) seenTargetM = true;
    const mb = mobs.get(mid);
    if (mb) onMob(mb);
  }
  if (!seenTargetM && targetMid > 0) {
    const tMb = mobs.get(targetMid);
    if (tMb) onMob(tMb);
  }

  if (checkGhostsAfter) {
    const maxGhostR2 = aoiRadius * aoiRadius;
    for (const [, ghost] of borderGhosts) {
      if (!ghost || players.has(ghost.pid)) continue;
      if (overflowSeenSet.has(ghost.pid)) continue;
      if (dist2(p.x, p.z, ghost.x, ghost.z) <= maxGhostR2) {
        overflowSeenSet.add(ghost.pid);
        onPlayer(ghost);
      }
    }
  }
}

module.exports = {
  NATIVE_QUERY_BUF_CAP,
  queryNativeAoiWithRescue
};
