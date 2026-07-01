const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, nativeImage, shell, Notification, globalShortcut, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

// Transparent VP9/alpha videos flicker under hardware video decode on many GPUs
// (the alpha plane intermittently drops). Software decode is rock-steady and the
// clips are tiny, so the CPU cost is negligible. Must run before app is ready.
app.disableHardwareAcceleration();

const config = require('./config');
const diaryStore = require('./diary/diaryStore');
const reporter = require('./diary/reporter');
const progress = require('./progress');
const tts = require('./tts');

let lastTtsAt = 0; // throttle the spoken voice so bursts don't overlap
function speakLine(line, creature, lang, force) {
  if (!force && Date.now() - lastTtsAt < 5000) return; // at most one voice line every ~5s
  lastTtsAt = Date.now();
  tts.speak(line, creature, lang)
    .then((mp3) => {
      if (mp3 && mp3.length && petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('speak', 'data:audio/mpeg;base64,' + mp3.toString('base64'));
      }
    })
    .catch((e) => console.error('tts failed', e && e.message));
}
// ---- tray menu strings (the rest of the UI localises in its own renderer) ----
const TR = {
  en: {
    openDiary: '📖 Open diary', chooseCreature: 'Choose creature', size: 'Size',
    small: 'Small', medium: 'Medium', large: 'Large', huge: 'Huge', bigger: '➕ Bigger', smaller: '➖ Smaller',
    resetPos: '📍 Reset position',
    bubbles: 'Speech bubbles', sound: 'Sound', voice: '🗣️ Pet voice (Edge · free)',
    language: '🌐 Language', startup: 'Launch on Windows start', addFolder: '📂 Add project folder…',
    hidePet: 'Hide pet', showPet: 'Show pet', quit: 'Quit',
    recordStart: '⏺ Start recording (Ctrl+Alt+R)', recordStop: '⏹ Stop recording (Ctrl+Alt+R)',
    replayLast: '▶ Replay last macro (Ctrl+Alt+P)',
  },
  de: {
    openDiary: '📖 Tagebuch öffnen', chooseCreature: 'Wesen wählen', size: 'Größe',
    small: 'Klein', medium: 'Mittel', large: 'Groß', huge: 'Riesig', bigger: '➕ Größer', smaller: '➖ Kleiner',
    resetPos: '📍 Position zurücksetzen',
    bubbles: 'Sprechblasen', sound: 'Sound', voice: '🗣️ Pet-Stimme (Edge · gratis)',
    language: '🌐 Sprache', startup: 'Beim Windows-Start öffnen', addFolder: '📂 Projektordner hinzufügen…',
    hidePet: 'Pet ausblenden', showPet: 'Pet einblenden', quit: 'Beenden',
    recordStart: '⏺ Aufnahme starten (Strg+Alt+R)', recordStop: '⏹ Aufnahme stoppen (Strg+Alt+R)',
    replayLast: '▶ Letztes Makro abspielen (Strg+Alt+P)',
  },
};
function tr(lang, key) { return TR[lang === 'de' ? 'de' : 'en'][key]; }
function setLanguage(lang) {
  config.save({ language: lang });
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('lang', lang);
  if (diaryWindow && !diaryWindow.isDestroyed()) diaryWindow.webContents.send('lang', lang);
  refreshTray();
}

const { CREATURES, isUnlocked, priceOf } = require('../shared/creatures');
const { GitMonitor } = require('./monitors/gitMonitor');
const { FileMonitor } = require('./monitors/fileMonitor');
const { AIMonitor } = require('./monitors/aiMonitor');
const { Recorder } = require('./automation/recorder');
const { replayMacro } = require('./automation/player');
const macroStore = require('./automation/macroStore');
const { humanizeSteps } = require('./automation/humanize');
const { PatternDetector } = require('./automation/patternDetector');
const { TextPatternDetector } = require('./automation/textPatternDetector');
const { ACHIEVEMENTS, nameOf: achievementName, checkNew: checkNewAchievements } = require('../shared/achievements');
const streaks = require('./streaks');
const crypto = require('crypto');
const https = require('https');
const { LanServer, localIPs, PORT: LAN_PORT } = require('./lanServer');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const PET_W = 300; // base size at scale 1.0
const PET_H = 360;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const POSES = ['idle', 'blink', 'sleep', 'happy', 'alert'];
const framesCache = {};

const clampScale = (s) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(s * 100) / 100));
const petSize = () => {
  const s = clampScale(config.load().petScale || 1);
  return { w: Math.round(PET_W * s), h: Math.round(PET_H * s), s };
};

// Keep a rectangle fully inside the work area of the display it's mostly on.
function clampToScreen(x, y, w, h) {
  const wa = screen.getDisplayMatching({ x, y, width: w, height: h }).workArea;
  return {
    x: Math.max(wa.x, Math.min(x, wa.x + wa.width - w)),
    y: Math.max(wa.y, Math.min(y, wa.y + wa.height - h)),
  };
}

let petWindow = null;
let diaryWindow = null;
let tray = null;
let monitors = [];
const recorder = new Recorder();
let pendingMacro = null; // { steps, durationMs } — recorded but not yet reviewed/approved
let chatHistory = []; // "ask your pet" conversation memory, cleared when the diary window closes
let lastActivityLine = ''; // most recent pet reaction line, surfaced on the LAN status page
let pendingSuggestions = []; // [{ id, steps, durationMs, windowTitle, detectedAt }] — auto-detected candidates, never auto-saved
const MAX_SUGGESTIONS = 15;
// Single funnel for both detectors — click/hotkey patterns AND typed-text patterns end
// up in the same suggestion list, reviewed/approved through the exact same panel.
function handleSuggestion(kind, candidate) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const suggestion = { id, kind, detectedAt: Date.now(), label: null, ...candidate };
  pendingSuggestions.push(suggestion);
  if (pendingSuggestions.length > MAX_SUGGESTIONS) pendingSuggestions.shift();
  broadcastMacroState();

  // Just a heads-up bubble — never logged to the diary, never scored. Approving/
  // dismissing the suggestion still goes through the exact same review flow.
  const live = config.load();
  if (petWindow && !petWindow.isDestroyed() && live.speechEnabled) {
    const line = live.language === 'de' ? 'Das mache ich schon 3×… Vorschlag im Tagebuch! 🔍' : "Noticed that 3× now… suggestion waiting in the diary! 🔍";
    petWindow.webContents.send('suggestion-bubble', line);
  }

  // Best-effort AI label, reusing whatever diary AI key is already configured — never
  // blocks the suggestion from showing immediately, and only ever changes its headline.
  const aiCfg = resolveAi(live);
  if (aiCfg) {
    const { lines } = humanizeSteps(suggestion.steps);
    reporter.describeAutomation(lines, aiCfg, live.language)
      .then((label) => {
        if (!label) return;
        const found = pendingSuggestions.find((s) => s.id === id);
        if (found) { found.label = label; broadcastMacroState(); }
      })
      .catch(() => {});
  }
}

const patternDetector = new PatternDetector((candidate) => handleSuggestion('clicks', candidate));
const textPatternDetector = new TextPatternDetector((candidate) => handleSuggestion('text', candidate));

// ---------------- Pet window ----------------
function petStartPosition() {
  const cfg = config.load();
  const { w, h } = petSize();
  // Always clamp the saved spot onto a CURRENTLY connected display — otherwise a
  // disconnected monitor or changed resolution leaves the pet stranded off-screen
  // (looks like it vanished).
  if (cfg.petPosition) return clampToScreen(cfg.petPosition.x, cfg.petPosition.y, w, h);
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - w - 24, y: wa.y + wa.height - h - 8 };
}

// Bring the pet back to a guaranteed-visible default spot (bottom-right of the primary
// display) and re-anchor there. Recovers a pet that drifted off-screen or behind a window.
function resetPetPosition() {
  const { w, h } = petSize();
  // place it on whichever monitor the user is currently on (cursor), bottom-right
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const x = wa.x + wa.width - w - 24;
  const y = wa.y + wa.height - h - 8;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setBounds({ x, y, width: w, height: h });
    petWindow.showInactive();
  }
  config.save({ petPosition: { x, y }, petAnchor: { cx: x + w / 2, bottom: y + h } });
}

function createPetWindow() {
  const pos = petStartPosition();
  const { w, h } = petSize();
  petWindow = new BrowserWindow({
    width: w,
    height: h,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'petPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.loadFile(path.join(__dirname, '..', 'renderer', 'pet', 'index.html'));
  // Start click-through; renderer enables interaction only over the pet itself.
  petWindow.setIgnoreMouseEvents(true, { forward: true });

  petWindow.on('moved', savePetGeometry);
}

// Persist current position AND the bottom-centre anchor (the "intended" spot).
// The anchor is the stable reference for resizing so the pet never drifts.
function savePetGeometry() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const b = petWindow.getBounds();
  config.save({
    petPosition: { x: b.x, y: b.y },
    petAnchor: { cx: b.x + b.width / 2, bottom: b.y + b.height },
  });
}

// Resize the pet window around its stored bottom-centre anchor so the creature
// grows from its feet and returns to the same spot (clamping is display-only and
// never overwrites the anchor → no cumulative drift).
function setPetScale(scale) {
  const s = clampScale(scale);
  const cfg = config.load();
  if (!petWindow || petWindow.isDestroyed()) { config.save({ petScale: s }); return s; }
  const b = petWindow.getBounds();
  const anchor = cfg.petAnchor || { cx: b.x + b.width / 2, bottom: b.y + b.height };
  const w = Math.round(PET_W * s);
  const h = Math.round(PET_H * s);
  let x = Math.round(anchor.cx - w / 2);
  let y = Math.round(anchor.bottom - h);
  ({ x, y } = clampToScreen(x, y, w, h));
  petWindow.setBounds({ x, y, width: w, height: h });
  config.save({ petScale: s, petPosition: { x, y } }); // keep petAnchor as the stable intent
  if (diaryWindow && !diaryWindow.isDestroyed()) diaryWindow.webContents.send('scale-changed', s);
  refreshTray();
  return s;
}

// Broadcast the global cursor position + pet bounds so the pet can look/walk
// toward the mouse.
let cursorTimer = null;
function startCursorBroadcast() {
  if (cursorTimer) clearInterval(cursorTimer);
  cursorTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return;
    const c = screen.getCursorScreenPoint();
    const b = petWindow.getBounds();
    petWindow.webContents.send('cursor', { cx: c.x, cy: c.y, bx: b.x, by: b.y, bw: b.width, bh: b.height });
  }, 90);
}

// ---------------- Diary window ----------------
function createDiaryWindow() {
  if (diaryWindow && !diaryWindow.isDestroyed()) {
    diaryWindow.show();
    diaryWindow.focus();
    return;
  }
  diaryWindow = new BrowserWindow({
    width: 760,
    height: 720,
    minWidth: 520,
    minHeight: 480,
    title: 'DevPet – Tagebuch',
    icon: iconImage('icon.png'),
    backgroundColor: '#f7f1e3',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'diaryPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  diaryWindow.setMenuBarVisibility(false);
  diaryWindow.loadFile(path.join(__dirname, '..', 'renderer', 'diary', 'diary.html'));
  diaryWindow.on('closed', () => { diaryWindow = null; chatHistory = []; });
}

function iconImage(name) {
  const p = path.join(ASSETS, name);
  try {
    if (fs.existsSync(p)) return nativeImage.createFromPath(p);
  } catch {}
  return nativeImage.createEmpty();
}

// Loads a creature's pose PNGs as base64 data URLs (cached). Returns {} if the
// creature has no generated frames yet, so the renderer can fall back.
function loadFrames(id) {
  if (framesCache[id]) return framesCache[id];
  const dir = path.join(ASSETS, 'creatures', id);
  const out = {};
  let files = [];
  try { files = fs.readdirSync(dir); } catch {}
  for (const f of files) {
    if (f.endsWith('.png')) {
      try { out[f.replace(/\.png$/, '')] = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64'); } catch {}
    }
  }
  // optional Blender-rendered transparent WebM loops (idle + reaction clips)
  const vid = (file, key) => {
    try { out[key] = 'data:video/webm;base64,' + fs.readFileSync(path.join(dir, file)).toString('base64'); } catch {}
  };
  vid('anim.webm', 'video');
  vid('happy.webm', 'videoHappy');
  vid('alert.webm', 'videoAlert');
  vid('look.webm', 'videoLook');
  vid('sleep.webm', 'videoSleep');
  vid('walk.webm', 'videoWalk');
  vid('standup.webm', 'videoStandup');
  vid('code.webm', 'videoCode'); // "coding" reaction clip (King), played when reacting to coding activity
  vid('grab.webm', 'videoGrab'); // "picked up" reaction — played while the pet is being dragged
  vid('sig.webm', 'videoSig');   // skin's exclusive signature move — played when the cursor approaches
  if (out.idle || out.video) framesCache[id] = out;
  return out;
}

// ---------------- Tray ----------------
function buildTrayMenu() {
  const cfg = config.load();
  const L = cfg.language === 'de' ? 'de' : 'en';
  const groups = {};
  for (const c of CREATURES) (groups[c.group] = groups[c.group] || []).push(c);
  const creatureSubmenu = Object.entries(groups).map(([group, list]) => ({
    label: group,
    submenu: list.map((c) => {
      const locked = !isUnlocked(c.id, cfg.unlockedSkins);
      return {
        label: locked ? `🔒 ${c.name} · ${c.price}🪙` : `${c.emoji} ${c.name}`,
        type: locked ? 'normal' : 'radio',
        enabled: !locked, // unlock paid skins in the diary shop
        checked: !locked && cfg.creature === c.id,
        click: locked ? undefined : () => setCreature(c.id),
      };
    }),
  }));
  const sizes = [[tr(L, 'small'), 0.7], [tr(L, 'medium'), 1.0], [tr(L, 'large'), 1.4], [tr(L, 'huge'), 2.0]];
  const sizeSubmenu = [
    ...sizes.map(([label, s]) => ({
      label: `${label} (${Math.round(s * 100)}%)`,
      type: 'radio',
      checked: Math.abs((cfg.petScale || 1) - s) < 0.05,
      click: () => setPetScale(s),
    })),
    { type: 'separator' },
    { label: tr(L, 'bigger'), accelerator: 'CommandOrControl+Plus', click: () => setPetScale((cfg.petScale || 1) + 0.1) },
    { label: tr(L, 'smaller'), accelerator: 'CommandOrControl+-', click: () => setPetScale((cfg.petScale || 1) - 0.1) },
  ];
  const ps = progress.state();
  const barLen = 10, filled = Math.round(ps.pct * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  return Menu.buildFromTemplate([
    { label: `⭐ Level ${ps.level}`, enabled: false },
    { label: `   ${bar}  ${ps.intoLevel}/${ps.levelSpan} XP`, enabled: false },
    { type: 'separator' },
    { label: tr(L, 'openDiary'), click: () => createDiaryWindow() },
    { type: 'separator' },
    { label: recorder.isRecording() ? tr(L, 'recordStop') : tr(L, 'recordStart'), click: () => toggleRecording() },
    { label: tr(L, 'replayLast'), click: () => replayLastMacro(), enabled: macroStore.listMacros().length > 0 },
    { type: 'separator' },
    { label: tr(L, 'chooseCreature'), submenu: creatureSubmenu },
    { label: tr(L, 'size'), submenu: sizeSubmenu },
    { label: tr(L, 'resetPos'), click: () => resetPetPosition() },
    {
      label: tr(L, 'bubbles'),
      type: 'checkbox',
      checked: cfg.speechEnabled !== false,
      click: () => { config.save({ speechEnabled: !(cfg.speechEnabled !== false) }); refreshTray(); },
    },
    {
      label: tr(L, 'sound'),
      type: 'checkbox',
      checked: cfg.soundEnabled !== false,
      click: () => {
        const on = !(cfg.soundEnabled !== false);
        config.save({ soundEnabled: on });
        if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('sound-enabled', on);
        refreshTray();
      },
    },
    {
      label: tr(L, 'voice'),
      type: 'checkbox',
      checked: cfg.ttsEnabled === true,
      click: () => {
        const on = !(cfg.ttsEnabled === true);
        config.save({ ttsEnabled: on });
        if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('tts-enabled', on);
        refreshTray();
      },
    },
    {
      label: tr(L, 'language'),
      submenu: [
        { label: '🇬🇧 English', type: 'radio', checked: L === 'en', click: () => setLanguage('en') },
        { label: '🇩🇪 Deutsch', type: 'radio', checked: L === 'de', click: () => setLanguage('de') },
      ],
    },
    {
      label: tr(L, 'startup'),
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: () => {
        const on = !app.getLoginItemSettings().openAtLogin;
        applyAutostart(on);
        config.save({ autostart: on });
        refreshTray();
      },
    },
    { label: tr(L, 'addFolder'), click: () => addFolderDialog() },
    {
      label: petWindow && petWindow.isVisible() ? tr(L, 'hidePet') : tr(L, 'showPet'),
      click: () => {
        if (!petWindow) return;
        if (petWindow.isVisible()) petWindow.hide();
        else petWindow.show();
        refreshTray();
      },
    },
    { type: 'separator' },
    { label: tr(L, 'quit'), click: () => { app.isQuitting = true; app.quit(); } },
  ]);
}

function refreshTray() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  tray = new Tray(iconImage('tray.png'));
  tray.setToolTip('DevPet – dein Coding-Begleiter');
  tray.on('click', () => createDiaryWindow());
  refreshTray();
}

// ---------------- Monitors ----------------
// Single funnel for every activity event — folder monitors AND the macro automation
// module both feed through here, so diary logging / XP / pet reactions stay consistent.
// `xpOverride` lets a caller (macro replay) scale the reward to actual seconds saved
// instead of using the flat per-type default.
function emitActivity(event, xpOverride) {
  // "Sources → Recorded macros" toggle: recording/replay itself always works (it's a
  // manual, explicitly-approved action either way) — this only controls whether it's
  // logged to the diary and earns XP, mirroring how the other sources gate their feed.
  if ((event.type === 'macro' || event.type === 'macroReplay') && config.load().sources.macro === false) return null;
  diaryStore.add(event);
  const live = config.load(); // read fresh: creature/speech can change without restart
  const prog = progress.award(event.type, xpOverride); // gamification XP
  const lifetimeStats = updateLifetimeCounters(event);
  checkAchievements(lifetimeStats);
  trackWellness(event);
  const reactionLine = reporter.reaction(event, live.creature, live.language);
  lastActivityLine = reactionLine; // feeds the LAN mobile-companion status snapshot
  if (petWindow && !petWindow.isDestroyed()) {
    if (live.speechEnabled) {
      petWindow.webContents.send('activity', { ...event, line: reactionLine });
      if (live.ttsEnabled) speakLine(reactionLine, live.creature, live.language);
    }
    if (prog.leveledUp) {
      petWindow.webContents.send('levelup', prog);
      const lvl = live.language === 'de' ? `Level ${prog.level}! Wir werden stärker!` : `Level ${prog.level}! We're getting stronger!`;
      if (live.ttsEnabled) speakLine(lvl, live.creature, live.language, true);
    }
  }
  if (prog.leveledUp) refreshTray();
  if (diaryWindow && !diaryWindow.isDestroyed()) {
    diaryWindow.webContents.send('events-updated');
  }
  return prog;
}

// Running lifetime counters (never rescans the whole diary) that feed the trophy case
// and the streak's achievement tiers.
function updateLifetimeCounters(event) {
  const cfg = config.load();
  const s = { ...cfg.lifetimeStats };
  if (event.type === 'commit') {
    s.commits = (s.commits || 0) + 1;
    const hour = new Date(event.ts || Date.now()).getHours();
    if (hour >= 23 || hour < 5) s.nightCommits = (s.nightCommits || 0) + 1;
  } else if (event.type === 'files') {
    s.files = (s.files || 0) + 1;
  } else if (event.type === 'ai') {
    s.aiSessions = (s.aiSessions || 0) + 1;
  } else if (event.type === 'macro') {
    s.macros = (s.macros || 0) + 1;
  } else if (event.type === 'macroReplay') {
    s.macroReplays = (s.macroReplays || 0) + 1;
  } else if (event.type === 'focus') {
    s.focusSessions = (s.focusSessions || 0) + 1;
    s.focusMinutes = (s.focusMinutes || 0) + Math.round((event.durationMs || 0) / 60000);
  }
  config.save({ lifetimeStats: s });
  return s;
}

function checkAchievements(lifetimeStats) {
  const cfg = config.load();
  const streak = streaks.computeStreak();
  const statCheck = { ...lifetimeStats, bestStreak: streak.best, level: (cfg.progress && cfg.progress.level) || 1 };
  const newly = checkNewAchievements(statCheck, cfg.achievements);
  if (!newly.length) return newly;
  config.save({ achievements: [...(cfg.achievements || []), ...newly] });
  const live = config.load();
  for (const id of newly) {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) continue;
    if (petWindow && !petWindow.isDestroyed()) {
      const line = `🏆 ${a.emoji} ${achievementName(a, live.language)}!`;
      petWindow.webContents.send('activity', { type: 'achievement', line, ts: Date.now() });
      if (live.speechEnabled && live.ttsEnabled) speakLine(line, live.creature, live.language, true);
    }
  }
  refreshTray();
  if (diaryWindow && !diaryWindow.isDestroyed()) diaryWindow.webContents.send('events-updated');
  return newly;
}

function startMonitors() {
  stopMonitors();
  const cfg = config.load();
  const folders = (cfg.watchedFolders || []).filter((f) => {
    try { return fs.existsSync(f); } catch { return false; }
  });

  if (cfg.sources.git && folders.length) {
    const gm = new GitMonitor(folders, emitActivity);
    gm.start();
    monitors.push(gm);
  }
  if (cfg.sources.files && folders.length) {
    const fm = new FileMonitor(folders, emitActivity);
    fm.start();
    monitors.push(fm);
  }
  if (cfg.sources.ai) {
    const am = new AIMonitor(emitActivity, { claudeDir: cfg.claudeProjectsPath });
    am.start();
    monitors.push(am);
  }
}

function stopMonitors() {
  for (const m of monitors) { try { m.stop(); } catch {} }
  monitors = [];
}

// ---------------- Automation (macros) ----------------
// Hard rule: nothing here ever runs on its own. Recording only ever starts/stops on an
// explicit user action (hotkey, tray, or diary button). A finished recording becomes a
// "pending" macro that must be reviewed (humanized step list) and explicitly approved
// before it's saved — and even once saved, replay only ever fires from a direct ▶ click
// or the replay-last hotkey. No auto-detection, no silent execution.
function macroPendingPayload() {
  if (!pendingMacro) return null;
  const { lines, truncated } = humanizeSteps(pendingMacro.steps);
  return { durationMs: pendingMacro.durationMs, stepsCount: pendingMacro.steps.length, preview: lines, truncated };
}

function suggestionsPayload() {
  return pendingSuggestions.map((s) => {
    const { lines, truncated } = humanizeSteps(s.steps);
    return {
      id: s.id, kind: s.kind, label: s.label,
      durationMs: s.durationMs, windowTitle: s.windowTitle, appPath: s.appPath, textPreview: s.textPreview,
      detectedAt: s.detectedAt, preview: lines, truncated,
    };
  });
}

function broadcastMacroState() {
  const payload = {
    recording: recorder.isRecording(),
    patternDetection: patternDetector.isEnabled() || textPatternDetector.isEnabled(),
    pending: macroPendingPayload(),
    suggestions: suggestionsPayload(),
  };
  if (diaryWindow && !diaryWindow.isDestroyed()) diaryWindow.webContents.send('macro:state', payload);
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('macro-recording', payload.recording);
}

function applyPatternDetectionConfig() {
  const on = config.load().patternDetection !== false;
  if (on) { patternDetector.start(); textPatternDetector.start(); }
  else { patternDetector.stop(); textPatternDetector.stop(); }
  broadcastMacroState();
}

// Promotes a detected suggestion into the SAME review/approve slot a manual recording
// uses — it still has to be named and explicitly approved, exactly like any other macro.
function adoptSuggestion(id) {
  const idx = pendingSuggestions.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const [s] = pendingSuggestions.splice(idx, 1);
  pendingMacro = { steps: s.steps, durationMs: s.durationMs };
  broadcastMacroState();
  return macroPendingPayload();
}

function dismissSuggestion(id) {
  pendingSuggestions = pendingSuggestions.filter((s) => s.id !== id);
  broadcastMacroState();
}

function toggleRecording() {
  if (recorder.isRecording()) {
    pendingMacro = recorder.stop(); // null if nothing meaningful was recorded
    broadcastMacroState();
    if (pendingMacro) createDiaryWindow(); // bring the review panel to front
  } else {
    pendingMacro = null; // starting fresh discards any unreviewed previous recording
    recorder.start();
    broadcastMacroState();
  }
  refreshTray();
}

function approveMacro(name) {
  if (!pendingMacro) return null;
  const macro = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name && name.trim() ? name.trim() : `Makro ${new Date().toLocaleString('de-DE')}`,
    createdAt: Date.now(),
    durationMs: pendingMacro.durationMs,
    steps: pendingMacro.steps,
    timesReplayed: 0,
  };
  macroStore.saveMacro(macro);
  pendingMacro = null;
  emitActivity({ type: 'macro', source: 'macro', name: macro.name, ts: Date.now() });
  broadcastMacroState();
  refreshTray();
  return macro;
}

function discardPendingMacro() {
  pendingMacro = null;
  broadcastMacroState();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Replay types blindly into whatever window currently has focus — a short countdown
// gives the user a real chance to switch to the right window (or do nothing) before
// any keystrokes/clicks actually fire. Shown as a direct bubble, not the queued
// activity system, so each second's text replaces the last instantly.
async function safetyCountdown(seconds) {
  const live = config.load();
  if (!petWindow || petWindow.isDestroyed() || live.speechEnabled === false) {
    await sleep(seconds * 1000); // keep the safety window even if bubbles are off
    return;
  }
  for (let i = seconds; i >= 1; i--) {
    const line = live.language === 'de' ? `⏳ Richtiges Fenster? Start in ${i}…` : `⏳ Right window? Starting in ${i}…`;
    petWindow.webContents.send('countdown-bubble', line);
    await sleep(1000);
  }
}

async function replayMacroById(id) {
  const macro = macroStore.listMacros().find((m) => m.id === id);
  if (!macro) return { ok: false, error: 'not-found' };
  try {
    await safetyCountdown(3);
    await replayMacro(macro);
    const stats = macroStore.recordReplay(id, macro.durationMs);
    const seconds = Math.round(macro.durationMs / 1000);
    const xp = Math.min(20, Math.max(2, Math.round(seconds / 3)));
    emitActivity(
      { type: 'macroReplay', source: 'macro', name: macro.name, durationMs: macro.durationMs, ts: Date.now() },
      { xp, coins: Math.round(xp / 2) }
    );
    return { ok: true, stats };
  } catch (err) {
    console.error('macro replay failed', err.message);
    return { ok: false, error: String((err && err.message) || err) };
  }
}

async function replayLastMacro() {
  const macros = macroStore.listMacros();
  if (!macros.length) return;
  await replayMacroById(macros[0].id);
}

// ---------------- Wellness nudges ----------------
// Purely a heads-up bubble tied to real work signals already flowing through
// emitActivity — no extra capture, no diary log, no XP. A 15+ minute gap between
// events counts as "you took a break" and resets the continuous-session clock.
let continuousSince = null;
let lastRealActivityTs = 0;
let wellnessNudgedThisStretch = false;
const WELLNESS_GAP_RESET_MS = 15 * 60000;

function trackWellness(event) {
  if (event.type !== 'commit' && event.type !== 'files' && event.type !== 'ai') return;
  const now = event.ts || Date.now();
  if (!continuousSince || now - lastRealActivityTs > WELLNESS_GAP_RESET_MS) {
    continuousSince = now;
    wellnessNudgedThisStretch = false;
  }
  lastRealActivityTs = now;

  const cfg = config.load();
  if (cfg.wellness && cfg.wellness.enabled === false) return;
  const thresholdMs = ((cfg.wellness && cfg.wellness.nudgeAfterMinutes) || 90) * 60000;
  if (wellnessNudgedThisStretch || now - continuousSince < thresholdMs) return;
  wellnessNudgedThisStretch = true;
  if (petWindow && !petWindow.isDestroyed() && cfg.speechEnabled) {
    const line = cfg.language === 'de'
      ? '💧 Schon lang dran! Kurz aufstehen, trinken, Augen entspannen?'
      : "💧 You've been at it a while! Quick stretch, water, rest your eyes?";
    petWindow.webContents.send('activity', { type: 'wellness', line, ts: now });
  }
}

// ---------------- Focus sessions ----------------
// A completed session (the full planned duration, timed by main.js itself so it fires
// even if no window is open) earns XP/coins via the normal emitActivity path. Stopping
// early gives nothing — same "finish what you start" incentive as a real Pomodoro timer.
let focusSession = null; // { startedAt, plannedMinutes }
let focusTimer = null;

function focusStatePayload() {
  if (!focusSession) return null;
  const elapsedMs = Date.now() - focusSession.startedAt;
  return {
    startedAt: focusSession.startedAt,
    plannedMinutes: focusSession.plannedMinutes,
    remainingMs: Math.max(0, focusSession.plannedMinutes * 60000 - elapsedMs),
  };
}

function broadcastFocusState() {
  const payload = focusStatePayload();
  if (diaryWindow && !diaryWindow.isDestroyed()) diaryWindow.webContents.send('focus:state', payload);
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('focus-state', payload);
}

function startFocusSession(minutes) {
  const m = Number(minutes) > 0 ? Number(minutes) : (config.load().focus.defaultMinutes || 25);
  if (focusTimer) clearTimeout(focusTimer);
  focusSession = { startedAt: Date.now(), plannedMinutes: m };
  focusTimer = setTimeout(completeFocusSession, m * 60000);
  broadcastFocusState();
  return focusStatePayload();
}

function completeFocusSession() {
  if (!focusSession) return;
  const durationMs = Date.now() - focusSession.startedAt;
  focusSession = null;
  focusTimer = null;
  emitActivity({ type: 'focus', source: 'focus', durationMs, ts: Date.now() });
  broadcastFocusState();
}

function stopFocusSessionEarly() {
  if (!focusSession) return { durationMs: 0, completed: false };
  const durationMs = Date.now() - focusSession.startedAt;
  focusSession = null;
  if (focusTimer) { clearTimeout(focusTimer); focusTimer = null; }
  broadcastFocusState();
  return { durationMs, completed: false };
}

// ---------------- Streak freeze shop ----------------
const FREEZE_COST = 200;
function buyStreakFreeze() {
  const cfg = config.load();
  const coins = cfg.coins || 0;
  if (coins < FREEZE_COST) return { ok: false, reason: 'coins', coins, price: FREEZE_COST };
  const streakFreezes = (cfg.streakFreezes || 0) + 1;
  config.save({ coins: coins - FREEZE_COST, streakFreezes });
  refreshTray();
  if (diaryWindow && !diaryWindow.isDestroyed()) diaryWindow.webContents.send('events-updated');
  return { ok: true, coins: coins - FREEZE_COST, streakFreezes };
}

// ---------------- Weekly recap card (shareable PNG) ----------------
let currentRecapData = null;

async function generateRecapCard(period) {
  const isDay = period === 'day';
  const cfg = config.load();
  const events = isDay ? diaryStore.getDay().events : weekEvents();
  const s = reporter.buildStats(events);
  const p = reporter.persona(cfg.creature);
  const now = new Date();
  const fmtDay = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
  const quote = (s.commits[0] && s.commits[0].message) || (s.aiPrompts && s.aiPrompts[0]) || '';
  let range;
  if (isDay) {
    range = fmtDay(now);
  } else {
    const start = new Date(now); start.setDate(now.getDate() - 6);
    range = `${fmtDay(start)} – ${fmtDay(now)}`;
  }

  currentRecapData = {
    lang: cfg.language,
    period: isDay ? 'day' : 'week',
    emoji: p.emoji,
    name: p.name,
    range,
    commits: s.commits.length,
    files: s.filesTouched.size,
    aiSessions: s.aiSessions,
    macrosCreated: s.macrosCreated || 0,
    macroTimeSavedSec: Math.round((s.macroTimeSavedMs || 0) / 1000),
    level: (cfg.progress && cfg.progress.level) || 1,
    streak: streaks.computeStreak().current,
    quote,
  };

  // Windows clamps a BrowserWindow's CREATE-time size to the display's work area (our
  // 1350px-tall card is taller than most screens' usable height) — creating it small
  // and then resizing via setContentSize bypasses that clamp so capturePage() actually
  // gets the full 1080x1350 card instead of a cropped one.
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    frame: false,
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'recapPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    win.setContentSize(1080, 1350, false);
    await win.loadFile(path.join(__dirname, '..', 'renderer', 'recap', 'recap.html'));
    await new Promise((resolve) => setTimeout(resolve, 400)); // let fonts/layout settle before capture
    const image = await win.webContents.capturePage();
    const dir = path.join(app.getPath('userData'), 'exports');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `devpet-recap-${isDay ? 'day' : 'week'}-${diaryStore.dayKey()}.png`);
    fs.writeFileSync(file, image.toPNG());
    clipboard.writeImage(image); // so it's a one-click paste into whatever you're sharing to
    // Open the folder robustly. showItemInFolder() can make Explorer pop a "path not
    // available" dialog for a just-created folder; openPath() returns a catchable error
    // instead, so a shell hiccup never throws a scary dialog at the user.
    const openErr = await shell.openPath(dir);
    if (openErr) console.error('open exports folder failed:', openErr);
    return { ok: true, file };
  } catch (e) {
    console.error('recap card generation failed', e.message);
    return { ok: false, error: e.message };
  } finally {
    win.destroy();
  }
}

// ---------------- LAN mobile companion (read-only, same-WiFi only) ----------------
function ensureLanToken() {
  const cfg = config.load();
  if (cfg.lanWidget && cfg.lanWidget.token) return cfg.lanWidget.token;
  const token = crypto.randomBytes(9).toString('base64url');
  config.save({ lanWidget: { enabled: cfg.lanWidget ? cfg.lanWidget.enabled !== false : true, token } });
  return token;
}

function lanStatusSnapshot() {
  const cfg = config.load();
  const p = reporter.persona(cfg.creature);
  const prog = progress.state();
  const streak = streaks.computeStreak();
  const focus = focusStatePayload();
  return {
    emoji: p.emoji,
    name: p.name,
    level: prog.level,
    xpPct: prog.pct,
    coins: prog.coins,
    streak: streak.current,
    focusRemainingMs: focus ? focus.remainingMs : null,
    lastLine: lastActivityLine,
    ts: Date.now(),
  };
}

const lanServer = new LanServer(ensureLanToken, lanStatusSnapshot);

function applyLanWidgetConfig() {
  ensureLanToken();
  const cfg = config.load();
  if (cfg.lanWidget && cfg.lanWidget.enabled === false) lanServer.stop();
  else lanServer.start();
}

// ---------------- Cloud relay (opt-in — the only path that ever leaves this machine) ----------------
function ensureCloudTokens() {
  const cfg = config.load();
  const cr = cfg.cloudRelay || {};
  if (cr.pushToken && cr.viewToken) return;
  config.save({
    cloudRelay: {
      ...cr,
      pushToken: cr.pushToken || crypto.randomBytes(9).toString('base64url'),
      viewToken: cr.viewToken || crypto.randomBytes(9).toString('base64url'),
    },
  });
}

function pushCloudStatus() {
  const cfg = config.load();
  const cr = cfg.cloudRelay;
  if (!cr || !cr.enabled || !cr.workerUrl || !cr.pushToken) return;
  let target;
  try {
    target = new URL(`${cr.workerUrl.replace(/\/$/, '')}/push?t=${encodeURIComponent(cr.pushToken)}`);
  } catch {
    return;
  }
  const body = JSON.stringify(lanStatusSnapshot());
  const req = https.request(
    {
      hostname: target.hostname,
      path: target.pathname + target.search,
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeout: 8000,
    },
    (res) => res.resume() // drain — we don't need the response body
  );
  req.on('error', (e) => console.error('cloud push failed', e.message));
  req.on('timeout', () => req.destroy());
  req.write(body);
  req.end();
}

let cloudPushTimer = null;
function applyCloudRelayConfig() {
  ensureCloudTokens();
  if (cloudPushTimer) { clearInterval(cloudPushTimer); cloudPushTimer = null; }
  const cfg = config.load();
  if (cfg.cloudRelay && cfg.cloudRelay.enabled && cfg.cloudRelay.workerUrl) {
    pushCloudStatus();
    cloudPushTimer = setInterval(pushCloudStatus, 120000);
  }
}

// ---------------- Actions ----------------
function applyAutostart(on) {
  try { app.setLoginItemSettings({ openAtLogin: !!on }); } catch (e) { console.error('autostart failed', e); }
}

function setCreature(id) {
  if (!isUnlocked(id, config.load().unlockedSkins)) return false; // locked skin — buy it first
  config.save({ creature: id });
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('creature', id);
  if (diaryWindow && !diaryWindow.isDestroyed()) diaryWindow.webContents.send('events-updated');
  refreshTray();
  return true;
}

// Spend coins to unlock a paid skin. Returns {ok, reason?, coins, unlockedSkins}.
function buySkin(id) {
  const cfg = config.load();
  const price = priceOf(id);
  if (!price) return { ok: false, reason: 'free' };
  if ((cfg.unlockedSkins || []).includes(id)) return { ok: false, reason: 'owned' };
  const coins = cfg.coins || 0;
  if (coins < price) return { ok: false, reason: 'coins', coins, price };
  const unlockedSkins = [...(cfg.unlockedSkins || []), id];
  config.save({ coins: coins - price, unlockedSkins });
  refreshTray();
  if (diaryWindow && !diaryWindow.isDestroyed()) diaryWindow.webContents.send('events-updated');
  return { ok: true, coins: coins - price, unlockedSkins };
}

async function addFolderDialog() {
  const res = await dialog.showOpenDialog({
    title: 'Projektordner wählen',
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return null;
  const cfg = config.load();
  const set = new Set(cfg.watchedFolders || []);
  res.filePaths.forEach((p) => set.add(p));
  config.save({ watchedFolders: [...set] });
  startMonitors();
  if (diaryWindow && !diaryWindow.isDestroyed()) diaryWindow.webContents.send('events-updated');
  return [...set];
}

// ---------------- IPC ----------------
function registerIpc() {
  // pet window dragging / interaction
  ipcMain.handle('window:getBounds', () => (petWindow ? petWindow.getBounds() : null));
  ipcMain.on('window:move', (_e, x, y) => {
    if (!petWindow) return;
    const b = petWindow.getBounds();
    const p = clampToScreen(Math.round(x), Math.round(y), b.width, b.height);
    petWindow.setPosition(p.x, p.y);
  });
  ipcMain.on('window:dragEnd', savePetGeometry);
  ipcMain.on('pet:setInteractive', (_e, interactive) => {
    if (petWindow) petWindow.setIgnoreMouseEvents(!interactive, { forward: true });
  });
  ipcMain.on('pet:contextMenu', () => { if (tray) tray.popUpContextMenu(buildTrayMenu()); });
  ipcMain.on('diary:open', () => createDiaryWindow());

  // size
  ipcMain.handle('pet:getScale', () => config.load().petScale || 1);
  ipcMain.handle('pet:setScale', (_e, s) => setPetScale(s));
  ipcMain.on('pet:nudgeScale', (_e, delta) => setPetScale((config.load().petScale || 1) + delta));

  // shared
  ipcMain.handle('config:get', () => config.load());
  ipcMain.handle('config:set', (_e, patch) => {
    const cfg = config.save(patch || {});
    startMonitors();
    applyPatternDetectionConfig();
    applyLanWidgetConfig();
    applyCloudRelayConfig();
    if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('creature', cfg.creature);
    refreshTray();
    return cfg;
  });
  ipcMain.on('creature:set', (_e, id) => setCreature(id));
  ipcMain.handle('creature:get', () => config.load().creature);
  ipcMain.handle('creatures:getFrames', async (_e, id) => loadFrames(id));
  ipcMain.handle('creatures:list', () => CREATURES);
  // 🪙 skin shop: list paid skins with ownership, and buy with coins
  ipcMain.handle('shop:list', () => {
    const cfg = config.load();
    return CREATURES.filter((c) => c.price).map((c) => {
      let thumb = '';
      try { thumb = 'data:image/png;base64,' + fs.readFileSync(path.join(ASSETS, 'creatures', c.id, 'thumb.png')).toString('base64'); } catch {}
      return { id: c.id, name: c.name, emoji: c.emoji, price: c.price, owned: (cfg.unlockedSkins || []).includes(c.id), thumb };
    });
  });
  ipcMain.handle('shop:buy', (_e, id) => buySkin(id));
  ipcMain.handle('app:getProgress', () => progress.state());
  ipcMain.handle('app:getLang', () => config.load().language || 'en');
  ipcMain.on('pet:speak', (_e, text) => { // pet was clicked → say a line aloud
    const live = config.load();
    if (live.ttsEnabled && text) speakLine(String(text), live.creature, live.language);
  });
  ipcMain.handle('app:getSounds', () => {
    const cfg = config.load();
    const read = (f) => {
      try { return 'data:audio/wav;base64,' + fs.readFileSync(path.join(ASSETS, 'sounds', f)).toString('base64'); } catch { return null; }
    };
    return { happy: read('happy.wav'), alert: read('alert.wav'), enabled: cfg.soundEnabled !== false };
  });

  // automation (macros) — see the comment above the functions for the review/approve rule
  ipcMain.handle('macro:toggleRecording', () => { toggleRecording(); return { recording: recorder.isRecording() }; });
  ipcMain.handle('macro:getState', () => ({ recording: recorder.isRecording(), pending: macroPendingPayload() }));
  ipcMain.handle('macro:approve', (_e, name) => approveMacro(name));
  ipcMain.handle('macro:discard', () => { discardPendingMacro(); return true; });
  ipcMain.handle('macro:list', () => macroStore.listMacros());
  ipcMain.handle('macro:replay', (_e, id) => replayMacroById(id));
  ipcMain.handle('macro:delete', (_e, id) => {
    macroStore.deleteMacro(id);
    if (diaryWindow && !diaryWindow.isDestroyed()) diaryWindow.webContents.send('events-updated');
  });
  ipcMain.handle('macro:rename', (_e, id, name) => {
    const macro = macroStore.renameMacro(id, name);
    if (diaryWindow && !diaryWindow.isDestroyed()) diaryWindow.webContents.send('events-updated');
    return macro;
  });
  ipcMain.handle('macro:getStats', () => macroStore.getMacroStats());
  ipcMain.handle('macro:adoptSuggestion', (_e, id) => adoptSuggestion(id));
  ipcMain.handle('macro:dismissSuggestion', (_e, id) => { dismissSuggestion(id); return true; });

  // folders
  ipcMain.handle('folders:add', () => addFolderDialog());
  ipcMain.handle('folders:remove', (_e, folder) => {
    const cfg = config.load();
    const next = (cfg.watchedFolders || []).filter((f) => f !== folder);
    config.save({ watchedFolders: next });
    startMonitors();
    return next;
  });

  // diary
  ipcMain.handle('diary:getDay', (_e, date) => diaryStore.getDay(date || undefined));
  ipcMain.handle('diary:listDates', () => diaryStore.listDates());
  ipcMain.handle('diary:generate', async (_e, date) => {
    const cfg = config.load();
    const key = date || diaryStore.dayKey();
    const day = diaryStore.getDay(key);
    const result = await reporter.generate(day.events, cfg.creature, aiCfgFor(cfg), cfg.language, 'day');
    diaryStore.saveReport(key, result);
    return result;
  });
  ipcMain.handle('diary:seedDemo', () => {
    seedDemoEvents();
    if (diaryWindow && !diaryWindow.isDestroyed()) diaryWindow.webContents.send('events-updated');
    return true;
  });

  // per-project AI headline summaries for the Activity "by project" view.
  // Key resolution: diary settings → local .secrets/minimax.key → env. Cached per project
  // (content-hashed) in the day file so a project is only re-summarised when it changes.
  const hashStr = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h.toString(36); };
  ipcMain.handle('activity:summaries', async (_e, date) => {
    try {
      const cfg = config.load();
      const ai = resolveAi(cfg);
      if (!ai) return {}; // no key anywhere → renderer keeps the raw-prompt headlines
      const key = date || diaryStore.dayKey();
      const day = diaryStore.getDay(key);
      if (!day || !day.events.length) return {};
      const projects = reporter.projectIntents(day.events);
      if (!projects.length) return {};
      const cache = day.activitySummaries || {};
      const out = {};
      const need = [];
      for (const p of projects) {
        const h = hashStr(ai.provider + '|' + p.intents.join(''));
        const c = cache[p.key];
        if (c && c.h === h && c.t) out[p.key] = c.t;
        else need.push({ p, h });
      }
      if (need.length) {
        const res = await reporter.summarize(need.map((n) => n.p), ai, cfg.language);
        for (const n of need) {
          const t = res[n.p.key];
          if (t) { cache[n.p.key] = { h: n.h, t }; out[n.p.key] = t; }
        }
        diaryStore.saveSummaries(key, cache);
      }
      return out;
    } catch { return {}; }
  });
  ipcMain.handle('app:openUserData', async () => {
    const ud = app.getPath('userData');
    if (!(await shell.openPath(ud))) return ud; // empty string = success
    // Running inside an MSIX/AppContainer sandbox: app.getPath() returns a virtualized
    // path Explorer can't resolve. Find the real de-virtualized data folder under
    // %LOCALAPPDATA%\Packages\*\LocalCache\Roaming\DevPet and open that instead.
    try {
      const base = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local'), 'Packages');
      for (const pkg of fs.readdirSync(base)) {
        const real = path.join(base, pkg, 'LocalCache', 'Roaming', 'DevPet');
        if (fs.existsSync(path.join(real, 'diary')) && !(await shell.openPath(real))) return real;
      }
    } catch (e) { console.error('openUserData fallback failed', e.message); }
    return ud;
  });

  // focus sessions
  ipcMain.handle('focus:start', (_e, minutes) => startFocusSession(minutes));
  ipcMain.handle('focus:stop', () => stopFocusSessionEarly());
  ipcMain.handle('focus:getState', () => focusStatePayload());

  // streaks, lifetime stats, achievements
  ipcMain.handle('progress:getStreak', () => streaks.computeStreak());
  ipcMain.handle('progress:getLifetimeStats', () => config.load().lifetimeStats);
  ipcMain.handle('progress:getAchievements', () => {
    const cfg = config.load();
    const streak = streaks.computeStreak();
    return {
      unlocked: cfg.achievements || [],
      // strip the `check` function — IPC's structured clone can't serialize functions
      all: ACHIEVEMENTS.map((a) => ({ id: a.id, emoji: a.emoji, name: a.name, desc: a.desc, metric: a.metric, target: a.target })),
      stats: { ...cfg.lifetimeStats, bestStreak: streak.best, level: (cfg.progress && cfg.progress.level) || 1 },
    };
  });
  ipcMain.handle('progress:buyFreeze', () => buyStreakFreeze());

  // ask your pet (reuses whatever diary AI key is already configured; remembers the
  // last few exchanges for this diary-window session so follow-up questions work)
  ipcMain.handle('diary:ask', async (_e, question) => {
    const cfg = config.load();
    const aiCfg = resolveAi(cfg);
    if (!aiCfg) return { ok: false, reason: 'no-key' };
    try {
      const answer = await reporter.askPet(question, weekEvents(), aiCfg, cfg.language, chatHistory);
      if (!answer) return { ok: false, reason: 'empty' };
      chatHistory.push({ role: 'user', text: question }, { role: 'pet', text: answer });
      if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);
      return { ok: true, answer };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    }
  });

  // shareable weekly recap card (PNG)
  ipcMain.handle('recap:generate', (_e, period) => generateRecapCard(period));
  ipcMain.handle('recap:getData', () => currentRecapData);

  // LAN mobile companion
  ipcMain.handle('lan:getInfo', () => ({
    enabled: lanServer.isRunning(),
    port: LAN_PORT,
    token: ensureLanToken(),
    ips: localIPs(),
  }));
  ipcMain.handle('lan:regenerateToken', () => {
    const token = crypto.randomBytes(9).toString('base64url');
    const cfg = config.load();
    config.save({ lanWidget: { enabled: cfg.lanWidget ? cfg.lanWidget.enabled !== false : true, token } });
    return token;
  });

  // cloud relay (opt-in)
  ipcMain.handle('cloud:getInfo', () => {
    ensureCloudTokens();
    return config.load().cloudRelay;
  });
  ipcMain.handle('cloud:setConfig', (_e, patch) => {
    config.save({ cloudRelay: { ...(config.load().cloudRelay || {}), ...patch } });
    applyCloudRelayConfig();
    return config.load().cloudRelay;
  });
  ipcMain.handle('cloud:regenerateTokens', () => {
    config.save({
      cloudRelay: {
        ...(config.load().cloudRelay || {}),
        pushToken: crypto.randomBytes(9).toString('base64url'),
        viewToken: crypto.randomBytes(9).toString('base64url'),
      },
    });
    applyCloudRelayConfig();
    return config.load().cloudRelay;
  });
  ipcMain.handle('cloud:pushNow', () => { pushCloudStatus(); return true; });
}

// Demo events so the prototype shows something on first run.
function seedDemoEvents() {
  const now = Date.now();
  const demo = [
    { type: 'ai', source: 'ai', project: 'DESKTOP-PET', prompt: 'Baue ein Desktop-Pet mit Hund und Fabelwesen', messages: 24, toolUses: 11, ts: now - 5400000 },
    { type: 'files', source: 'files', project: 'DESKTOP-PET', count: 9, files: ['src/main/main.js', 'src/renderer/pet/pet.js'], ts: now - 4200000 },
    { type: 'commit', source: 'git', project: 'DESKTOP-PET', message: 'feat: animiertes Pet auf dem Desktop', hash: 'a1b2c3d', author: 'Maurice', filesChanged: 7, ts: now - 3600000 },
    { type: 'files', source: 'files', project: 'DESKTOP-PET', count: 4, files: ['src/main/diary/reporter.js'], ts: now - 1800000 },
    { type: 'commit', source: 'git', project: 'DESKTOP-PET', message: 'feat: automatisches Tagebuch + Reports', hash: 'e4f5a6b', author: 'Maurice', filesChanged: 5, ts: now - 600000 },
  ];
  demo.forEach((e) => diaryStore.add(e));
}

// ---------------- AI key resolution + automatic reports ----------------
function readSecret(name) {
  try { return fs.readFileSync(path.join(__dirname, '..', '..', '.secrets', name), 'utf8').trim() || null; } catch { return null; }
}
function resolveAi(cfg) {
  const a = cfg.ai || {};
  if (a.apiKey) {
    const m = a.model || '';
    const provider = /^claude/i.test(m) ? 'anthropic' : /deepseek/i.test(m) ? 'deepseek' : 'minimax';
    return { provider, apiKey: a.apiKey, model: a.model };
  }
  const ds = readSecret('deepseek.key') || process.env.DEEPSEEK_API_KEY; // cheapest → preferred
  if (ds) return { provider: 'deepseek', apiKey: ds, model: 'deepseek-v4-flash' };
  const mm = readSecret('minimax.key') || process.env.MINIMAX_API_KEY;
  if (mm) return { provider: 'minimax', apiKey: mm, model: 'MiniMax-Text-01' };
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-haiku-4-5-20251001' };
  return null;
}
// turn a resolved key into the aiConfig reporter.generate expects (always "enabled")
function aiCfgFor(cfg) {
  const ai = resolveAi(cfg);
  return ai ? { enabled: true, ...ai } : { enabled: false };
}

let reportTimer = null;
function notifyDiaryUpdated() { if (diaryWindow && !diaryWindow.isDestroyed()) diaryWindow.webContents.send('events-updated'); }
function notifyUser(title, body) {
  try { if (Notification.isSupported()) new Notification({ title, body, icon: iconImage('icon.png') }).show(); } catch {}
}

async function runDailyReport(key) {
  const cfg = config.load();
  key = key || diaryStore.dayKey();
  const day = diaryStore.getDay(key);
  if (!day.events.length) return null;
  const result = await reporter.generate(day.events, cfg.creature, aiCfgFor(cfg), cfg.language, 'day');
  diaryStore.saveAutoReport(key, result);
  notifyDiaryUpdated();
  notifyUser(cfg.language === 'de' ? '📔 Tagesbericht fertig' : '📔 Daily report ready',
    cfg.language === 'de' ? `${reporter.persona(cfg.creature).name} hat deinen Coding-Tag zusammengefasst.`
      : `${reporter.persona(cfg.creature).name} summed up your coding day.`);
  return result;
}

// the last 7 days of events (including the given / today's day)
function weekEvents(endKey) {
  const end = endKey ? new Date(endKey + 'T12:00:00') : new Date();
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end); d.setDate(d.getDate() - i);
    out.push(...(diaryStore.getDay(diaryStore.dayKey(d.getTime())).events || []));
  }
  return out;
}

async function runWeeklyReport(key) {
  const cfg = config.load();
  key = key || diaryStore.dayKey();
  const events = weekEvents(key);
  if (!events.length) return null;
  const result = await reporter.generate(events, cfg.creature, aiCfgFor(cfg), cfg.language, 'week');
  diaryStore.saveWeekly(key, result);
  notifyDiaryUpdated();
  notifyUser(cfg.language === 'de' ? '📅 Wochenbericht fertig' : '📅 Weekly recap ready',
    cfg.language === 'de' ? `${reporter.persona(cfg.creature).name} hat deine Coding-Woche zusammengefasst.`
      : `${reporter.persona(cfg.creature).name} recapped your coding week.`);
  return result;
}

// Arm a one-shot timer for the next `hour`:00; on fire write the daily report (+ the
// weekly recap on Sundays), then re-arm for the next day.
function scheduleReports() {
  if (reportTimer) { clearTimeout(reportTimer); reportTimer = null; }
  const ar = config.load().autoReport || {};
  if (ar.enabled === false) return;
  const hour = Number.isInteger(ar.hour) ? ar.hour : 23;
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  reportTimer = setTimeout(async () => {
    try {
      const a = config.load().autoReport || {};
      if (a.enabled !== false) {
        if (a.daily !== false) await runDailyReport();
        if (a.weekly !== false && new Date().getDay() === 0) await runWeeklyReport(); // Sunday
      }
    } catch (e) { console.error('auto report failed:', e.message); }
    scheduleReports();
  }, next - now);
}

// If the app launches after the scheduled hour and today's report isn't written yet,
// catch up — so a 23:00 that was missed (app was closed) still produces a report.
async function catchUpReports() {
  try {
    const ar = config.load().autoReport || {};
    if (ar.enabled === false) return;
    const hour = Number.isInteger(ar.hour) ? ar.hour : 23;
    if (new Date().getHours() < hour) return;
    const key = diaryStore.dayKey();
    const day = diaryStore.getDay(key);
    if (ar.daily !== false && day.events.length && !day.autoReport) await runDailyReport(key);
    if (ar.weekly !== false && new Date().getDay() === 0 && !day.weekly) await runWeeklyReport(key);
  } catch (e) { console.error('catch-up report failed:', e.message); }
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Alt+R', toggleRecording);
  globalShortcut.register('CommandOrControl+Alt+P', replayLastMacro);
}

// ---------------- Lifecycle ----------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => createDiaryWindow());

  app.whenReady().then(() => {
    registerIpc();
    registerShortcuts();
    applyAutostart(config.load().autostart);
    createPetWindow();
    createTray();
    startMonitors();
    applyPatternDetectionConfig();
    applyLanWidgetConfig();
    applyCloudRelayConfig();
    startCursorBroadcast();
    // First run: if there are no events at all yet, seed a small demo day.
    if (diaryStore.listDates().length === 0) seedDemoEvents();
    scheduleReports();   // auto daily report at 23:00 (+ weekly recap on Sundays)
    catchUpReports();    // …and catch up if the app launched after that time
  });

  app.on('window-all-closed', () => { /* stay alive in tray */ });
  app.on('before-quit', () => {
    app.isQuitting = true;
    stopMonitors();
    globalShortcut.unregisterAll();
    if (recorder.isRecording()) recorder.stop(); // don't leave the global input hook attached
    patternDetector.stop();
    textPatternDetector.stop();
    if (focusTimer) clearTimeout(focusTimer);
    lanServer.stop();
    if (cloudPushTimer) clearInterval(cloudPushTimer);
  });
}
