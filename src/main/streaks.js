// Consecutive-day activity streak, with an optional 🧊 freeze token bridging one gap
// day. Recomputed on demand (cheap: reads a handful of small day-files) rather than
// tracked incrementally, so it's always correct even after edits/demo-seeding.
const config = require('./config');
const diaryStore = require('./diary/diaryStore');

const MAX_WALK_DAYS = 400; // safety cap — plenty for any real streak length

function dayKeyOffset(offsetDays) {
  return diaryStore.dayKey(Date.now() - offsetDays * 86400000);
}

function hasActivity(key) {
  const day = diaryStore.getDay(key);
  return !!(day && day.events && day.events.length);
}

/** @returns {{ current: number, best: number, freezes: number }} */
function computeStreak() {
  const cfg = config.load();
  let freezes = cfg.streakFreezes || 0;
  const usedDates = new Set(cfg.usedFreezeDates || []);
  let streak = 0;
  let offset = 0;
  let changed = false;

  // An empty "today so far" shouldn't look like a broken streak before the day is even
  // over — only start counting from today if it already has activity.
  if (!hasActivity(dayKeyOffset(0))) offset = 1;

  while (offset < MAX_WALK_DAYS) {
    const key = dayKeyOffset(offset);
    if (hasActivity(key)) { streak++; offset++; continue; }
    if (usedDates.has(key)) { streak++; offset++; continue; } // gap already bridged earlier
    if (freezes > 0) {
      freezes--;
      usedDates.add(key);
      changed = true;
      streak++;
      offset++;
      continue;
    }
    break; // real gap, no freeze available
  }

  if (changed) config.save({ streakFreezes: freezes, usedFreezeDates: [...usedDates] });

  const best = Math.max(streak, (cfg.lifetimeStats && cfg.lifetimeStats.bestStreak) || 0);
  if (best !== ((cfg.lifetimeStats && cfg.lifetimeStats.bestStreak) || 0)) {
    config.save({ lifetimeStats: { ...cfg.lifetimeStats, bestStreak: best } });
  }

  return { current: streak, best, freezes: config.load().streakFreezes || 0 };
}

module.exports = { computeStreak };
