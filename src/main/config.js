// Persistent configuration: watched folders, chosen creature, pet position, sources.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { BY_ID } = require('../shared/creatures');

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

const DEFAULTS = {
  creature: 'bvbcoder', // MUST be a valid id from src/shared/creatures.js — an invalid
  // default means a corrupt/missing config falls back to a creature with NO assets, so the
  // pet loads no video and looks "gone" while its speech bubbles still work.
  language: 'en', // 'en' | 'de' — UI, reactions, diary & pet voice language (toggle in tray)
  petScale: 1.0, // 0.5 – 2.5
  petPosition: null, // {x, y} or null = auto bottom-right
  petAnchor: null, // {cx, bottom} stable resize anchor (set on drag-end)
  watchedFolders: [], // absolute paths to project folders
  sources: { git: true, files: true, ai: true },
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

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    // strip a UTF-8 BOM if some editor added one — otherwise JSON.parse throws and we'd
    // silently fall back to DEFAULTS, wiping the user's progress/creature (happened once).
    cache = deepMerge(DEFAULTS, JSON.parse(raw.replace(/^﻿/, '')));
  } catch {
    cache = { ...DEFAULTS };
  }
  // self-heal: a stale/removed creature id would load no assets → invisible pet
  if (!BY_ID[cache.creature]) cache.creature = DEFAULTS.creature;
  return cache;
}

function save(patch) {
  cache = deepMerge(load(), patch);
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('config save failed', e);
  }
  return cache;
}

module.exports = { load, save, CONFIG_PATH, DEFAULTS };
