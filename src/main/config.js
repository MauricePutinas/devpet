// Persistent configuration: watched folders, chosen creature, pet position, sources.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { BY_ID } = require('../shared/creatures');

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const BAK_PATH = CONFIG_PATH + '.bak'; // last-known-good copy — guards progress against corruption

const DEFAULTS = {
  creature: 'bvbcoder', // MUST be a valid id from src/shared/creatures.js — an invalid
  // default means a corrupt/missing config falls back to a creature with NO assets, so the
  // pet loads no video and looks "gone" while its speech bubbles still work.
  language: 'en', // 'en' | 'de' — UI, reactions, diary & pet voice language (toggle in tray)
  petScale: 1.0, // 0.5 – 2.5
  petPosition: null, // {x, y} or null = auto bottom-right
  petAnchor: null, // {cx, bottom} stable resize anchor (set on drag-end)
  watchedFolders: [], // absolute paths to project folders
  sources: { git: true, files: true, ai: true, macro: true },
  macros: [], // approved automations: {id,name,createdAt,durationMs,steps,timesReplayed}
  macroStats: { totalTimeSavedMs: 0, totalReplays: 0 },
  // Background pattern detection: watches for the same short action repeated 3x back-
  // to-back in the same app and SUGGESTS it (never auto-saves/auto-replays). Bigger
  // privacy footprint than the rest of the app (continuous local keystroke/click
  // watching) — kept as its own explicit, visible toggle rather than bundled into
  // `sources.macro` (which only gates whether approved-macro activity is logged).
  patternDetection: true,
  // Keyboard layout for reconstructing TYPED text in pattern detection. 'auto' picks by
  // UI language (de → QWERTZ, else US); override with 'us' or 'de'. Fixes the y/z swap,
  // umlauts (ä ö ü ß) and German punctuation for German typists.
  keyboardLayout: 'auto',
  // Claude Code stores sessions here; used as the "AI coding session" signal.
  claudeProjectsPath: path.join(os.homedir(), '.claude', 'projects'),
  ai: {
    enabled: false, // use an LLM API to write nicer diary entries
    provider: 'minimax', // 'minimax' | 'claude'
    apiKey: '', // provider API key; minimax falls back to env MINIMAX_API_KEY, claude to ANTHROPIC_API_KEY
    model: 'MiniMax-Text-01',
  },
  speechEnabled: true,
  soundEnabled: true,
  ttsEnabled: false, // free Edge neural voice for spoken reactions (off by default)
  autostart: false,
  progress: { xp: 0, level: 1 }, // gamification: the pet levels up as you code
  coins: 0, // 🪙 earned by coding, spent in the skin shop
  unlockedSkins: [], // ids of purchased locked skins (see creatures.js price field)
  // Lifetime counters — kept as running totals (incremented alongside XP) rather than
  // rescanned from the diary on every check, so achievements/streaks stay cheap to read.
  lifetimeStats: { commits: 0, files: 0, aiSessions: 0, macros: 0, macroReplays: 0, focusSessions: 0, focusMinutes: 0, nightCommits: 0, bestStreak: 0 },
  achievements: [], // unlocked trophy ids, see src/shared/achievements.js
  streakFreezes: 0, // 🧊 protects a streak through one inactive day, buyable with coins
  usedFreezeDates: [], // day-keys already bridged by a freeze — keeps streak recompute idempotent
  wellness: { enabled: true, nudgeAfterMinutes: 90 }, // gentle stretch/water reminder during long unbroken sessions
  focus: { defaultMinutes: 25 }, // Pomodoro-style focus session length
  // Read-only mobile companion: a tiny local HTTP server (same-WiFi only, token-gated)
  // showing level/streak/coins/focus — never anything from the diary, macros, or
  // keystrokes. Token is generated on first use; null here means "not generated yet".
  lanWidget: { enabled: true, token: null },
  // Optional cloud relay (opt-in, OFF by default): pushes the same tiny status snapshot
  // to a user-deployed Cloudflare Worker every ~2 min so the phone can check on the pet
  // from anywhere, not just on the same WiFi. This is the only path in DevPet where any
  // data ever leaves the local machine — see cloudflare/devpet-status-worker.js.
  cloudRelay: { enabled: false, workerUrl: '', pushToken: null, viewToken: null },
  // Automatic diary reports: a daily summary at `hour`:00, plus a weekly recap on Sundays.
  // Summarised with whatever AI key is available (DeepSeek preferred). App must be running.
  autoReport: { enabled: true, hour: 23, daily: true, weekly: true },
};

let cache = null;
// true while the cache holds DEFAULTS because config.json AND its backup were unreadable
// (transient Windows file locks from AV/cleaner tools can do this at startup). While
// tainted, every load() retries the disk and adopts the real data as soon as it appears —
// so a locked file can no longer masquerade as "progress lost" for the rest of the session.
let tainted = false;

// Append-only forensic log (userData/config.log) — records recoveries, taints and blocked
// downgrades so a "why was I level 5?!" moment is diagnosable after the fact.
function logEvent(msg) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'config.log'), new Date().toISOString() + ' ' + msg + '\n');
  } catch {}
}

function sleepMs(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {}
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const k of Object.keys(override || {})) {
    if (override[k] && typeof override[k] === 'object' && !Array.isArray(override[k])) {
      out[k] = deepMerge(base[k] || {}, override[k]);
    } else {
      out[k] = override[k];
    }
  }
  return out;
}

// Read + parse a config file, tolerating a stray UTF-8 BOM (some editors add one,
// which would otherwise make JSON.parse throw and wipe the user's progress/creature).
function readConfig(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
}

// Read the config with retries: a transient lock (antivirus / cleaner tools scanning the
// file, or a rename mid-flight) fails for milliseconds, not minutes — retrying bridges it.
// Each attempt tries the main file first, then the last-known-good backup.
function tryReadWithRetry(attempts) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) sleepMs(60);
    try { return { data: readConfig(CONFIG_PATH), source: 'config.json' }; } catch (e) { lastErr = e; }
    try { return { data: readConfig(BAK_PATH), source: 'backup' }; } catch {}
  }
  return { data: null, error: lastErr };
}

function adopt(data) {
  cache = data ? deepMerge(DEFAULTS, data) : { ...DEFAULTS };
  // self-heal: a stale/removed creature id would load no assets → invisible pet
  if (!BY_ID[cache.creature]) cache.creature = DEFAULTS.creature;
  return cache;
}

function load() {
  if (cache && !tainted) return cache;
  if (cache && tainted) {
    // Defaults are only a stopgap — keep watching the disk and switch to the real
    // data the moment the file becomes readable again.
    const r = tryReadWithRetry(1);
    if (r.data) {
      tainted = false;
      logEvent('RECOVERED: adopted real config from ' + r.source + ' after a tainted start');
      return adopt(r.data);
    }
    return cache;
  }
  const r = tryReadWithRetry(4);
  if (!r.data) {
    const missing = !fs.existsSync(CONFIG_PATH) && !fs.existsSync(BAK_PATH);
    tainted = !missing; // a genuinely fresh install starts clean, not tainted
    if (tainted) logEvent('TAINTED: config.json and backup unreadable (' + (r.error && r.error.message) + ') — serving defaults, will keep retrying');
  } else if (r.source === 'backup') {
    logEvent('config.json unreadable, recovered from backup');
    console.warn('config.json unreadable, recovered from backup');
  }
  return adopt(r.data);
}

function isTainted() { return tainted; }

// Write via a temp file + rename so a crash mid-write can never leave a half-written
// (corrupt) config.json. Falls back to a direct write if the rename is refused.
function writeAtomic(p, data) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, data);
  try {
    fs.renameSync(tmp, p);
  } catch {
    fs.writeFileSync(p, data);
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// Downgrade guard: XP only ever grows, so an outgoing save with LESS xp than the file on
// disk means our in-memory state is poisoned (defaults after a failed read) or racing a
// healthier instance. In that case the disk wins for everything gamification-related —
// a level/skin/achievement rollback can structurally never reach the disk.
function guardDowngrade(disk, next, patch) {
  const diskXp = disk && disk.progress ? disk.progress.xp || 0 : 0;
  const nextXp = next && next.progress ? next.progress.xp || 0 : 0;
  if (diskXp <= nextXp) return next; // normal case: we're at or ahead of the disk
  logEvent('DOWNGRADE BLOCKED: attempted save with xp=' + nextXp + ' over disk xp=' + diskXp + ' — disk state preserved');
  console.warn('config: blocked a progress downgrade (memory xp', nextXp, '< disk xp', diskXp + ')');
  // Rebuild from the trusted disk state, re-apply the caller's patch on top, then pin
  // every protected field back to the disk (the patch itself may carry poisoned values).
  const healed = deepMerge(deepMerge(DEFAULTS, disk), patch || {});
  healed.progress = disk.progress;
  healed.coins = disk.coins;
  for (const k of ['unlockedSkins', 'achievements', 'usedFreezeDates']) {
    const a = Array.isArray(disk[k]) ? disk[k] : [];
    const b = Array.isArray(healed[k]) ? healed[k] : [];
    healed[k] = [...new Set([...a, ...b])]; // union — never lose an unlock from either side
  }
  if (disk.lifetimeStats) {
    healed.lifetimeStats = { ...healed.lifetimeStats };
    for (const [k, v] of Object.entries(disk.lifetimeStats)) {
      healed.lifetimeStats[k] = Math.max(v || 0, (healed.lifetimeStats && healed.lifetimeStats[k]) || 0);
    }
  }
  healed.streakFreezes = Math.max(disk.streakFreezes || 0, healed.streakFreezes || 0);
  tainted = false; // we just adopted the trusted disk state — cache is healthy again
  return healed;
}

function save(patch) {
  cache = deepMerge(load(), patch);
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    // Snapshot the current good config as a backup before overwriting, so progress can
    // always be recovered. Only back up when the existing file actually parses — never
    // let a corrupt file clobber a good backup.
    let disk = null;
    try { disk = readConfig(CONFIG_PATH); fs.copyFileSync(CONFIG_PATH, BAK_PATH); } catch {}
    if (disk) cache = guardDowngrade(disk, cache, patch);
    writeAtomic(CONFIG_PATH, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('config save failed', e);
  }
  return cache;
}

module.exports = { load, save, isTainted, CONFIG_PATH, BAK_PATH, DEFAULTS };
