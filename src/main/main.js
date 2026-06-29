const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, screen, nativeImage, shell } = require('electron');
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
  },
  de: {
    openDiary: '📖 Tagebuch öffnen', chooseCreature: 'Wesen wählen', size: 'Größe',
    small: 'Klein', medium: 'Mittel', large: 'Groß', huge: 'Riesig', bigger: '➕ Größer', smaller: '➖ Kleiner',
    resetPos: '📍 Position zurücksetzen',
    bubbles: 'Sprechblasen', sound: 'Sound', voice: '🗣️ Pet-Stimme (Edge · gratis)',
    language: '🌐 Sprache', startup: 'Beim Windows-Start öffnen', addFolder: '📂 Projektordner hinzufügen…',
    hidePet: 'Pet ausblenden', showPet: 'Pet einblenden', quit: 'Beenden',
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
  diaryWindow.on('closed', () => { diaryWindow = null; });
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
function startMonitors() {
  stopMonitors();
  const cfg = config.load();
  const folders = (cfg.watchedFolders || []).filter((f) => {
    try { return fs.existsSync(f); } catch { return false; }
  });

  const onEvent = (event) => {
    diaryStore.add(event);
    const live = config.load(); // read fresh: creature/speech can change without restart
    const prog = progress.award(event.type); // gamification XP
    if (petWindow && !petWindow.isDestroyed()) {
      if (live.speechEnabled) {
        const line = reporter.reaction(event, live.creature, live.language);
        petWindow.webContents.send('activity', { ...event, line });
        if (live.ttsEnabled) speakLine(line, live.creature, live.language);
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
  };

  if (cfg.sources.git && folders.length) {
    const gm = new GitMonitor(folders, onEvent);
    gm.start();
    monitors.push(gm);
  }
  if (cfg.sources.files && folders.length) {
    const fm = new FileMonitor(folders, onEvent);
    fm.start();
    monitors.push(fm);
  }
  if (cfg.sources.ai) {
    const am = new AIMonitor(onEvent, { claudeDir: cfg.claudeProjectsPath });
    am.start();
    monitors.push(am);
  }
}

function stopMonitors() {
  for (const m of monitors) { try { m.stop(); } catch {} }
  monitors = [];
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
    const result = await reporter.generate(day.events, cfg.creature, cfg.ai, cfg.language);
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
  const readSecret = (name) => { try { return fs.readFileSync(path.join(__dirname, '..', '..', '.secrets', name), 'utf8').trim() || null; } catch { return null; } };
  const resolveAi = (cfg) => {
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
  };
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

// ---------------- Lifecycle ----------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => createDiaryWindow());

  app.whenReady().then(() => {
    registerIpc();
    applyAutostart(config.load().autostart);
    createPetWindow();
    createTray();
    startMonitors();
    startCursorBroadcast();
    // First run: if there are no events at all yet, seed a small demo day.
    if (diaryStore.listDates().length === 0) seedDemoEvents();
  });

  app.on('window-all-closed', () => { /* stay alive in tray */ });
  app.on('before-quit', () => { app.isQuitting = true; stopMonitors(); });
}
