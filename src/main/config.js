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

function load() {
  if (cache) return cache;
  let data = null;
  try {
    data = readConfig(CONFIG_PATH);
  } catch (e1) {
    // Main file missing/corrupt — recover from the last-known-good backup before
    // ever falling back to DEFAULTS (which would look like lost progress).
    try {
      data = readConfig(BAK_PATH);
      console.warn('config.json unreadable, recovered from backup:', e1.message);
    } catch {
      data = null;
    }
  }
  cache = data ? deepMerge(DEFAULTS, data) : { ...DEFAULTS };
  // self-heal: a stale/removed creature id would load no assets → invisible pet
  if (!BY_ID[cache.creature]) cache.creature = DEFAULTS.creature;
  return cache;
}

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

function save(patch) {
  cache = deepMerge(load(), patch);
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    // Snapshot the current good config as a backup before overwriting, so progress can
    // always be recovered. Only back up when the existing file actually parses — never
    // let a corrupt file clobber a good backup.
    try { readConfig(CONFIG_PATH); fs.copyFileSync(CONFIG_PATH, BAK_PATH); } catch {}
    writeAtomic(CONFIG_PATH, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('config save failed', e);
  }
  return cache;
}

module.exports = { load, save, CONFIG_PATH, BAK_PATH, DEFAULTS };
