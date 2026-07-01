// XP & levels: the pet "levels up" as you code. Persisted in config.progress.
// Commits are worth the most; AI sessions and file bursts give a little.
const config = require('./config');

const XP_FOR = { commit: 25, ai: 8, files: 3, macro: 15 };
const COINS_FOR = { commit: 10, ai: 3, files: 1, macro: 6 }; // 🪙 earned alongside XP
const LEVELUP_BONUS = 20;                          // 🪙 extra on each level-up

// Smooth curve: level 1 at 0 xp, level 2 at 50, 3 at 200, 4 at 450, 5 at 800 …
function levelFor(xp) { return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 50)); }
function xpAtLevel(level) { return 50 * (level - 1) * (level - 1); } // cumulative xp where `level` begins

// `custom` lets a caller override the flat XP_FOR/COINS_FOR lookup — used by macro
// replays, whose reward scales with actual seconds saved instead of a fixed amount.
function award(type, custom) {
  const cfg = config.load();
  const prev = cfg.progress || { xp: 0, level: 1 };
  const gained = custom && custom.xp != null ? custom.xp : (XP_FOR[type] || 0);
  const xp = prev.xp + gained;
  const level = levelFor(xp);
  const leveledUp = level > (prev.level || 1);
  const gainedCoins = (custom && custom.coins != null ? custom.coins : (COINS_FOR[type] || 0)) + (leveledUp ? LEVELUP_BONUS : 0);
  const coins = (cfg.coins || 0) + gainedCoins;
  if (gained || gainedCoins) config.save({ progress: { xp, level }, coins });
  return { xp, level, leveledUp, gained, gainedCoins, coins };
}

function state() {
  const cfg = config.load();
  const p = cfg.progress || { xp: 0, level: 1 };
  const start = xpAtLevel(p.level);
  const next = xpAtLevel(p.level + 1);
  return {
    xp: p.xp,
    level: p.level,
    intoLevel: p.xp - start,
    levelSpan: next - start,
    pct: Math.max(0, Math.min(1, (p.xp - start) / (next - start))),
    coins: cfg.coins || 0,
  };
}

module.exports = { award, state, levelFor };
