/* global diaryAPI */
const el = (id) => document.getElementById(id);
let cfg = null;
let currentDate = null; // YYYY-MM-DD
let creatures = [];
let EMOJI = {};
let NAME = {};
let lang = 'en';
let IMG = { trophies: {}, icons: {} }; // base64 data-URL graphics (trophies by id, icons by name)

const T = {
  en: {
    title: 'DevPet – Diary',
    back: 'Day back', fwd: 'Day forward', today: 'Today',
    level: 'Level', heroSub: 'Your coding companion',
    mCommits: 'Commits', mFiles: 'Files', mAi: 'AI', mProjects: 'Projects', mActive: 'Active',
    diaryTitle: '📖 Diary', genBtn: 'Generate report', writing: 'Writing…',
    activity: '🕑 Activity', creatures: '🐾 Creatures', size: '📐 Size',
    shopTitle: '🪙 Skin shop', equip: 'Equip', owned: 'Owned',
    shopHint: 'Earn coins by coding — commits, AI sessions & edits. Spend them to unlock new coder skins.',
    hintScroll: 'Or scroll the mouse wheel right over the pet.',
    folders: '📂 Project folders', addFolder: '+ Folder',
    hintFolders: 'Your pet watches these folders for git commits & file changes.',
    sources: '🔎 Sources', srcGit: 'Git commits & changes', srcFiles: 'File changes in the project folder', srcAi: 'AI coding sessions (Claude · Codex · Hermes)',
    srcMacro: 'Recorded macros (automation)',
    macrosTitle: '🤖 Automation', recordStart: '⏺ Start recording', recordStop: '⏹ Stop recording',
    macroHint: 'Records keyboard & mouse clicks while active. Every recording must be reviewed and approved here before it\'s saved — nothing ever replays on its own.',
    macroPendingHead: '🔍 New recording — review before approving:', macroNamePlaceholder: 'Name this automation…',
    macroApprove: '✅ Approve & save', macroDiscard: 'Discard', macroPlayTitle: 'Replay',
    macroEmpty: 'No automations yet — start a recording above.',
    macroUsed: (n) => `used ${n}×`, macroMoreSteps: 'more steps follow…',
    macroSavedTotal: (s) => `${s} saved total`,
    macroDurationSec: (s) => `${s}s`,
    patDetCheck: '🔍 Background pattern detection — clicks, hotkeys & typed text (suggests only — never auto-saves)',
    patDetHint: 'Watches for the same short action or phrase repeated 3× in a row — even across apps (e.g. copy in Excel → paste in Outlook). Skips anything typed in password/login/banking windows. Only ever shows up as a suggestion below — still needs your review and approval.',
    suggAdopt: '✅ Review', suggDismiss: 'Dismiss',
    suggDetected: (app) => `Noticed in ${app}`,
    streakTitle: '🔥 Streak', streakBest: (n) => `Best: ${n} days`, streakFreezes: (n) => `🧊 ${n} freeze${n === 1 ? '' : 's'}`,
    buyFreeze: '🧊 Buy freeze (200 🪙)', buyFreezeNoCoins: 'Not enough coins',
    focusTitle: '🎯 Focus session', focusStart: '▶ Start', focusStop: 'Stop (no reward)',
    focusHint: 'Only a fully completed session earns XP — stopping early gives nothing, on purpose.',
    trophyTitle: '🏆 Trophy case',
    askTitle: '💬 Ask your pet', askPlaceholder: 'How productive was I this week?', askSend: 'Ask',
    askHint: 'Uses the same AI key configured below — answers are based only on your real activity.',
    askNoKey: 'Set an AI key below first — I need it to answer freely.',
    askThinking: 'Thinking…', askError: "Couldn't answer that right now.",
    recapBtn: '🖼️ Create recap card', recapDone: 'Recap card saved, opened & copied to clipboard!', recapFail: 'Recap card failed.',
    recapWeek: 'Week', recapDay: 'Day',
    wellnessTitle: '💧 Wellness nudges', wellnessCheck: 'Remind me to take a break', wellnessAfter: 'Nudge after (minutes of continuous activity)',
    macroRename: 'Rename', focusCustom: 'Custom…', focusCustomPlaceholder: 'minutes',
    trophyProgress: (v, t) => `${v} / ${t}`,
    lanTitle: '📱 Mobile companion (local network)', lanEnabledCheck: 'Enabled',
    lanHint: "Open this on your phone while it's on the SAME WiFi as this PC to see level, streak, coins & focus countdown — read-only, nothing from your diary or macros ever leaves this network.",
    lanRegen: '🔄 New link (invalidates the old one)', lanCopy: 'Copy', lanCopied: 'Copied!',
    lanNone: 'No local network address found.',
    cloudTitle: '☁️ Cloud companion (from anywhere)',
    cloudHint: 'Opt-in only. Pushes the same tiny status (level, streak, coins, focus) to a Worker YOU deploy — the only thing in DevPet that ever leaves your PC. Setup file: cloudflare/devpet-status-worker.js in the project folder.',
    cloudWorkerUrlLabel: 'Worker URL (after you deploy it)',
    cloudPushTokenLabel: 'PUSH_TOKEN secret (paste into Cloudflare)', cloudViewTokenLabel: 'VIEW_TOKEN secret (paste into Cloudflare)',
    cloudShareUrlLabel: 'Your phone-anywhere link',
    cloudTest: '📡 Send test push now', cloudRegen: '🔄 New tokens',
    cloudTestOk: '✅ Pushed! Try the link.', cloudTestFail: 'Not configured yet — set the Worker URL first.',
    cloudNoUrl: 'Set a Worker URL first.',
    aiReport: '✨ AI report (optional)', aiCheck: 'Let an AI write the diary', apiKeyLabel: 'API key', modelLabel: 'Model',
    aiHint: 'Without a key your pet writes the report locally (offline). The key stays on your machine only.',
    demo: 'Load demo data', openData: 'Open data folder',
    reportPlaceholder: 'Choose "Generate report" so your pet sums up the day.',
    reportEmptyDay: 'No activity on this day yet. Once you code, your pet collects entries.',
    reportPickDay: 'Click "Generate report" so your pet sums up this day.',
    fromClaude: '✨ by Claude', fromMiniMax: '✨ by MiniMax', fromDeepSeek: '✨ by DeepSeek', local: '📝 local', weeklyTitle: 'Weekly recap',
    noEvents: 'No events.', showLess: '▲ Show less', remove: 'Remove', aiSession: 'AI coding session',
    noFolders: 'No folders yet — add your project.',
    todayPrefix: 'Today', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    eventsN: (n) => `${n} events`,
    showAll: (n) => `▾ Show all ${n} entries`,
    filesEdited: (n) => `${n} file${n === 1 ? '' : 's'} edited`,
    filesBurst: (t, n) => `${t} files across ${n} writing bursts`,
    aiSessionsN: (n, t) => `${n} AI sessions · ${t} messages`,
    aiLatest: (p) => `latest: "${p}"`,
    messagesN: (n) => `${n} messages`,
    commitFiles: (h, f, a) => `${h} · ${f} file${f === 1 ? '' : 's'}${a ? ' · ' + a : ''}`,
    quote: (s) => `"${s}"`,
    viewProjects: 'By project', viewTimeline: 'Timeline',
    otherProject: 'Other', noProjects: 'No named projects yet — switch to Timeline for the raw feed.',
    projectsN: (n) => `${n} project${n === 1 ? '' : 's'}`,
    sessionsN: (n) => `${n} AI session${n === 1 ? '' : 's'}`,
    dCommits: 'Commits', dFiles: 'Edited files', dPrompts: 'Your messages',
    justNow: 'just now', minsAgo: (n) => `${n} min ago`, hrsAgo: (n) => `${n} h ago`,
  },
  de: {
    title: 'DevPet – Tagebuch',
    back: 'Tag zurück', fwd: 'Tag vor', today: 'Heute',
    level: 'Level', heroSub: 'Dein Coding-Begleiter',
    mCommits: 'Commits', mFiles: 'Dateien', mAi: 'KI', mProjects: 'Projekte', mActive: 'Aktiv',
    diaryTitle: '📖 Tagebuch', genBtn: 'Bericht erstellen', writing: 'Schreibe…',
    activity: '🕑 Aktivität', creatures: '🐾 Wesen', size: '📐 Größe',
    shopTitle: '🪙 Skin-Shop', equip: 'Anlegen', owned: 'Im Besitz',
    shopHint: 'Verdiene Münzen beim Coden — Commits, KI-Sessions & Änderungen. Gib sie aus, um neue Coder-Skins freizuschalten.',
    hintScroll: 'Oder direkt über dem Pet mit dem Mausrad scrollen.',
    folders: '📂 Projektordner', addFolder: '+ Ordner',
    hintFolders: 'Diese Ordner beobachtet dein Pet auf Git-Commits & Dateiänderungen.',
    sources: '🔎 Quellen', srcGit: 'Git-Commits & Änderungen', srcFiles: 'Dateiänderungen im Projektordner', srcAi: 'KI-Coding-Sessions (Claude · Codex · Hermes)',
    srcMacro: 'Aufgezeichnete Makros (Automatisierung)',
    macrosTitle: '🤖 Automatisierung', recordStart: '⏺ Aufnahme starten', recordStop: '⏹ Aufnahme stoppen',
    macroHint: 'Zeichnet Tastatur & Mausklicks auf, solange aktiv. Jede Aufnahme muss hier geprüft und freigegeben werden, bevor sie gespeichert wird — nichts spielt von selbst ab.',
    macroPendingHead: '🔍 Neue Aufnahme — vor Freigabe prüfen:', macroNamePlaceholder: 'Automatisierung benennen…',
    macroApprove: '✅ Freigeben & speichern', macroDiscard: 'Verwerfen', macroPlayTitle: 'Abspielen',
    macroEmpty: 'Noch keine Automatisierungen — starte oben eine Aufnahme.',
    macroUsed: (n) => `${n}× genutzt`, macroMoreSteps: 'weitere Schritte folgen…',
    macroSavedTotal: (s) => `${s} insgesamt gespart`,
    macroDurationSec: (s) => `${s}s`,
    patDetCheck: '🔍 Muster-Erkennung im Hintergrund — Klicks, Hotkeys & getippter Text (nur Vorschläge — speichert nie automatisch)',
    patDetHint: 'Achtet auf dieselbe kurze Aktion oder Textphrase, 3× hintereinander — auch app-übergreifend (z. B. Kopieren in Excel → Einfügen in Outlook). Lässt Passwort-/Login-/Banking-Fenster komplett aus. Landet nur als Vorschlag unten — braucht trotzdem deine Prüfung und Freigabe.',
    suggAdopt: '✅ Prüfen', suggDismiss: 'Verwerfen',
    suggDetected: (app) => `Bemerkt in ${app}`,
    streakTitle: '🔥 Streak', streakBest: (n) => `Beste: ${n} Tage`, streakFreezes: (n) => `🧊 ${n} Freeze${n === 1 ? '' : 's'}`,
    buyFreeze: '🧊 Freeze kaufen (200 🪙)', buyFreezeNoCoins: 'Nicht genug Münzen',
    focusTitle: '🎯 Fokus-Session', focusStart: '▶ Starten', focusStop: 'Stoppen (keine Belohnung)',
    focusHint: 'Nur eine komplett durchgehaltene Session gibt XP — vorzeitiges Stoppen bringt absichtlich nichts.',
    trophyTitle: '🏆 Trophäen-Regal',
    askTitle: '💬 Frag dein Pet', askPlaceholder: 'Wie produktiv war ich diese Woche?', askSend: 'Fragen',
    askHint: 'Nutzt denselben KI-Key wie unten konfiguriert — Antworten basieren nur auf deiner echten Aktivität.',
    askNoKey: 'Trag unten erst einen KI-Key ein — den brauche ich zum freien Antworten.',
    askThinking: 'Denke nach…', askError: 'Konnte das gerade nicht beantworten.',
    recapBtn: '🖼️ Recap-Karte erstellen', recapDone: 'Karte gespeichert, geöffnet & in Zwischenablage kopiert!', recapFail: 'Karte fehlgeschlagen.',
    recapWeek: 'Woche', recapDay: 'Tag',
    wellnessTitle: '💧 Wellness-Erinnerungen', wellnessCheck: 'An Pause erinnern', wellnessAfter: 'Erinnern nach (Minuten durchgehender Aktivität)',
    macroRename: 'Umbenennen', focusCustom: 'Eigene…', focusCustomPlaceholder: 'Minuten',
    trophyProgress: (v, t) => `${v} / ${t}`,
    lanTitle: '📱 Mobile-Begleiter (lokales Netzwerk)', lanEnabledCheck: 'Aktiviert',
    lanHint: 'Öffne das auf deinem Handy, solange es im GLEICHEN WLAN wie dieser PC ist — zeigt Level, Streak, Coins & Fokus-Countdown. Nur lesend, nichts aus Tagebuch oder Makros verlässt je dieses Netzwerk.',
    lanRegen: '🔄 Neuer Link (macht den alten ungültig)', lanCopy: 'Kopieren', lanCopied: 'Kopiert!',
    lanNone: 'Keine lokale Netzwerkadresse gefunden.',
    cloudTitle: '☁️ Cloud-Begleiter (von überall)',
    cloudHint: 'Nur auf Wunsch. Schickt denselben winzigen Status (Level, Streak, Coins, Fokus) an einen Worker, den DU deployst — das Einzige in DevPet, das je deinen PC verlässt. Setup-Datei: cloudflare/devpet-status-worker.js im Projektordner.',
    cloudWorkerUrlLabel: 'Worker-URL (nach dem Deploy)',
    cloudPushTokenLabel: 'PUSH_TOKEN Secret (bei Cloudflare einfügen)', cloudViewTokenLabel: 'VIEW_TOKEN Secret (bei Cloudflare einfügen)',
    cloudShareUrlLabel: 'Dein Von-überall-Link fürs Handy',
    cloudTest: '📡 Test-Push jetzt senden', cloudRegen: '🔄 Neue Tokens',
    cloudTestOk: '✅ Gesendet! Probier den Link.', cloudTestFail: 'Noch nicht eingerichtet — erst Worker-URL setzen.',
    cloudNoUrl: 'Erst eine Worker-URL setzen.',
    aiReport: '✨ KI-Bericht (optional)', aiCheck: 'Tagebuch von einer KI schreiben lassen', apiKeyLabel: 'API-Key', modelLabel: 'Modell',
    aiHint: 'Ohne Key schreibt dein Pet den Bericht lokal (offline). Der Key bleibt nur auf deinem Rechner.',
    demo: 'Demo-Daten laden', openData: 'Datenordner öffnen',
    reportPlaceholder: 'Wähle „Bericht erstellen", damit dein Pet den Tag zusammenfasst.',
    reportEmptyDay: 'Noch keine Aktivität an diesem Tag. Sobald du codest, sammelt dein Pet Einträge.',
    reportPickDay: 'Klick auf „Bericht erstellen", damit dein Pet diesen Tag zusammenfasst.',
    fromClaude: '✨ von Claude', fromMiniMax: '✨ von MiniMax', fromDeepSeek: '✨ von DeepSeek', local: '📝 lokal', weeklyTitle: 'Wochenrückblick',
    noEvents: 'Keine Ereignisse.', showLess: '▲ Weniger anzeigen', remove: 'Entfernen', aiSession: 'KI-Coding-Session',
    noFolders: 'Noch keine Ordner – füge dein Projekt hinzu.',
    todayPrefix: 'Heute', days: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    eventsN: (n) => `${n} Ereignisse`,
    showAll: (n) => `▾ Alle ${n} Einträge anzeigen`,
    filesEdited: (n) => `${n} Datei${n === 1 ? '' : 'en'} bearbeitet`,
    filesBurst: (t, n) => `${t} Dateien in ${n} Schreib-Phasen`,
    aiSessionsN: (n, t) => `${n} KI-Sessions · ${t} Nachrichten`,
    aiLatest: (p) => `zuletzt: „${p}"`,
    messagesN: (n) => `${n} Nachrichten`,
    commitFiles: (h, f, a) => `${h} · ${f} Datei${f === 1 ? '' : 'en'}${a ? ' · ' + a : ''}`,
    quote: (s) => `„${s}"`,
    viewProjects: 'Nach Projekt', viewTimeline: 'Verlauf',
    otherProject: 'Sonstiges', noProjects: 'Noch keine benannten Projekte — wechsle zu „Verlauf" für die Roh-Liste.',
    projectsN: (n) => `${n} Projekt${n === 1 ? '' : 'e'}`,
    sessionsN: (n) => `${n} KI-Session${n === 1 ? '' : 's'}`,
    dCommits: 'Commits', dFiles: 'Bearbeitete Dateien', dPrompts: 'Deine Nachrichten',
    justNow: 'gerade eben', minsAgo: (n) => `vor ${n} Min`, hrsAgo: (n) => `vor ${n} Std`,
  },
};
function tt(k) { return T[lang === 'de' ? 'de' : 'en'][k]; }
function applyStatic() {
  const D = T[lang === 'de' ? 'de' : 'en'];
  document.documentElement.lang = lang === 'de' ? 'de' : 'en';
  document.title = D.title;
  document.querySelectorAll('[data-i18n]').forEach((e) => { const v = D[e.dataset.i18n]; if (typeof v === 'string') e.textContent = v; });
  document.querySelectorAll('[data-i18n-title]').forEach((e) => { const v = D[e.dataset.i18nTitle]; if (typeof v === 'string') e.title = v; });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((e) => { const v = D[e.dataset.i18nPlaceholder]; if (typeof v === 'string') e.placeholder = v; });
}

function setHero(id) {
  el('avatarEmoji').textContent = EMOJI[id] || '🐶';
  el('creatureName').textContent = NAME[id] || 'DevPet';
}

async function renderProgress() {
  try {
    const p = await diaryAPI.getProgress();
    if (!p) return;
    renderTaintBanner(p.tainted);
    el('levelNum').textContent = p.level;
    el('xpFill').style.right = `${Math.round((1 - (p.pct || 0)) * 100)}%`;
    el('xpText').textContent = `${p.intoLevel} / ${p.levelSpan} XP`;
    const coins = p.coins || 0;
    ['coinNum', 'coinShop'].forEach((id) => { const e = el(id); if (e) e.textContent = coins; });
  } catch {}
}

// Shown when the config file couldn't be read at startup (transient lock): the numbers on
// screen are temporary defaults, NOT lost progress — the app re-reads the file and heals
// itself, so tell the user instead of scaring them with "Level 1".
function renderTaintBanner(on) {
  let b = document.getElementById('taintBanner');
  if (!on) { if (b) b.remove(); return; }
  if (b) return;
  b = document.createElement('div');
  b.id = 'taintBanner';
  b.style.cssText = 'position:sticky;top:0;z-index:50;background:#3a2a10;color:#ffc465;border:1px solid #ffc46555;border-radius:10px;padding:10px 14px;margin:8px 12px;font-size:13px;font-weight:600;';
  b.textContent = lang === 'de'
    ? '⚠️ Fortschritt konnte gerade nicht von der Festplatte gelesen werden — die Anzeige ist vorübergehend falsch. Deine Daten sind sicher; die App lädt sie automatisch nach (oder starte sie einmal neu).'
    : '⚠️ Your progress file could not be read just now — the numbers shown are temporary. Your data is safe; the app reloads it automatically (or restart once).';
  document.body.prepend(b);
}

function renderPills() {
  const wrap = el('creaturePills');
  wrap.innerHTML = '';
  const unlocked = (cfg && cfg.unlockedSkins) || [];
  // hide locked paid skins here — they live in the shop until bought
  const owned = creatures.filter((c) => !c.price || unlocked.includes(c.id));
  const groups = {};
  for (const c of owned) (groups[c.group] = groups[c.group] || []).push(c);
  for (const [group, list] of Object.entries(groups)) {
    const h = document.createElement('div');
    h.className = 'pill-group-label';
    h.textContent = group;
    wrap.appendChild(h);
    const row = document.createElement('div');
    row.className = 'pills';
    for (const c of list) {
      const b = document.createElement('button');
      b.className = 'pill' + (cfg && cfg.creature === c.id ? ' active' : '');
      b.dataset.cr = c.id;
      b.textContent = `${c.emoji} ${c.name}`;
      b.addEventListener('click', () => {
        diaryAPI.setCreature(c.id);
        document.querySelectorAll('.pill').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        setHero(c.id);
      });
      row.appendChild(b);
    }
    wrap.appendChild(row);
  }
}

/* ---------- skin shop ---------- */
async function renderShop() {
  const grid = el('shopGrid');
  if (!grid || !diaryAPI.getShop) return;
  let skins = [];
  try { skins = await diaryAPI.getShop(); } catch {}
  grid.innerHTML = skins.map((s) => `
    <div class="skin${s.owned ? ' owned' : ''}" data-id="${s.id}">
      <div class="skin-thumb">${s.thumb ? `<img src="${s.thumb}" alt="${esc(s.name)}">` : esc(s.emoji)}</div>
      <div class="skin-name">${esc(s.name)}</div>
      <button class="skin-btn${s.owned ? ' is-owned' : ''}" data-id="${s.id}" data-owned="${s.owned ? 1 : 0}">
        ${s.owned ? tt('equip') : `🪙 ${s.price}`}
      </button>
    </div>`).join('');
  grid.querySelectorAll('.skin-btn').forEach((b) =>
    b.addEventListener('click', () => onSkinBtn(b.dataset.id, b.dataset.owned === '1')));
}

async function onSkinBtn(id, owned) {
  if (owned) { // already unlocked → equip it
    diaryAPI.setCreature(id);
    setHero(id);
    document.querySelectorAll('.pill').forEach((x) => x.classList.toggle('active', x.dataset.cr === id));
    return;
  }
  let res = null;
  try { res = await diaryAPI.buySkin(id); } catch {}
  if (res && res.ok) {
    await renderProgress();   // refresh coin balance
    await renderShop();       // now shows "Equip"
    renderPills();            // skin now appears in the creature pills
  } else { // not enough coins → shake the card
    const card = el('shopGrid') && el('shopGrid').querySelector(`.skin[data-id="${id}"]`);
    if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
  }
}

function todayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtDateLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${tt('days')[date.getDay()]}, ${d}.${m}.${y}`;
}

function esc(s) {
  return (s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function renderMarkdownish(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

async function loadConfig() {
  cfg = await diaryAPI.getConfig();
  lang = cfg.language || 'en';
  applyStatic();
  setHero(cfg.creature);
  document.querySelectorAll('.pill').forEach((p) => {
    p.classList.toggle('active', p.dataset.cr === cfg.creature);
  });
  el('srcGit').checked = !!cfg.sources.git;
  el('srcFiles').checked = !!cfg.sources.files;
  el('srcAi').checked = !!cfg.sources.ai;
  el('srcMacro').checked = cfg.sources.macro !== false;
  el('patternDetect').checked = cfg.patternDetection !== false;
  el('wellnessEnabled').checked = !cfg.wellness || cfg.wellness.enabled !== false;
  el('wellnessMinutes').value = String((cfg.wellness && cfg.wellness.nudgeAfterMinutes) || 90);
  el('aiEnabled').checked = !!cfg.ai.enabled;
  el('apiKey').value = cfg.ai.apiKey || '';
  el('aiModel').value = cfg.ai.model || 'claude-sonnet-4-6';
  const pct = Math.round((cfg.petScale || 1) * 100);
  el('sizeSlider').value = pct;
  el('sizeVal').textContent = `${pct}%`;
  renderFolders();
  renderPills();   // reflect unlocked skins (hide locked ones)
  renderShop();    // refresh shop ownership/balance
}

function renderFolders() {
  const ul = el('folders');
  ul.innerHTML = '';
  const folders = cfg.watchedFolders || [];
  if (!folders.length) {
    ul.innerHTML = `<li class="empty">${tt('noFolders')}</li>`;
    return;
  }
  for (const f of folders) {
    const li = document.createElement('li');
    li.className = 'folder';
    const span = document.createElement('span');
    span.textContent = f;
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.title = tt('remove');
    btn.onclick = async () => {
      cfg.watchedFolders = await diaryAPI.removeFolder(f);
      renderFolders();
    };
    li.append(span, btn);
    ul.append(li);
  }
}

async function refreshDates() {
  const dates = await diaryAPI.listDates();
  if (!dates.includes(todayKey())) dates.unshift(todayKey());
  const sel = el('dateSelect');
  sel.innerHTML = '';
  for (const dkey of dates) {
    const o = document.createElement('option');
    o.value = dkey;
    o.textContent = dkey === todayKey() ? `${tt('todayPrefix')} · ${fmtDateLabel(dkey)}` : fmtDateLabel(dkey);
    sel.append(o);
  }
  if (!currentDate || !dates.includes(currentDate)) currentDate = dates[0];
  sel.value = currentDate;
}

async function loadDay() {
  const day = await diaryAPI.getDay(currentDate);
  el('dateSelect').value = currentDate;

  // report: prefer a manual report, else the auto-generated 23:00 one
  const badge = el('engineBadge');
  const rep = (day.report && day.report.text) ? day.report
    : (day.autoReport && day.autoReport.text) ? day.autoReport : null;
  let html = '';
  if (rep) {
    html = renderMarkdownish(rep.text);
    badge.classList.remove('hidden');
    const eng = rep.engine;
    if (eng === 'claude') { badge.textContent = tt('fromClaude'); badge.className = 'badge'; }
    else if (eng === 'minimax') { badge.textContent = tt('fromMiniMax'); badge.className = 'badge'; }
    else if (eng === 'deepseek') { badge.textContent = tt('fromDeepSeek'); badge.className = 'badge'; }
    else { badge.textContent = tt('local'); badge.className = 'badge local'; }
  } else {
    badge.classList.add('hidden');
  }
  // weekly recap (generated on Sundays) appended below the daily entry
  if (day.weekly && day.weekly.text) {
    html += `<div class="weekly"><div class="weekly-h">📅 ${tt('weeklyTitle')}</div>${renderMarkdownish(day.weekly.text)}</div>`;
  }
  if (html) el('report').innerHTML = html;
  else el('report').textContent = day.events.length ? tt('reportPickDay') : tt('reportEmptyDay');

  renderReportStats(day.events);
  projectSummaries = {}; // fetched fresh for this day
  renderActivity(day.events);
  el('genBtn').disabled = day.events.length === 0;
}

// Hide OS / cache / temp churn so the timeline shows only real code edits, even
// for activity recorded before the monitor filter existed.
const CODE_EXT = new Set(('js jsx ts tsx mjs cjs vue svelte py rb go rs java kt c h cpp hpp cc cs php swift dart scala sh bash ps1 sql htm html css scss sass less json json5 yaml yml toml ini cfg conf env xml md mdx txt rst gd glsl wgsl hlsl shader astro prisma graphql gql proto ipynb').split(' '));
const NOISE_DIR = new Set(('appdata temp tmp cache caches .cache cookies gpucache indexeddb network dist build out .next coverage __pycache__ .venv venv node_modules .git .idea .vscode wsl docker onedrive packages webstorage sentry blob_storage').split(' '));
function meaningful(p) {
  const parts = String(p).split(/[\\/]/);
  for (const s of parts) { const ls = s.toLowerCase(); if (NOISE_DIR.has(ls) || ls.startsWith('codex-index') || ls.startsWith('etilqs_')) return false; }
  const base = parts[parts.length - 1].toLowerCase(), dot = base.lastIndexOf('.');
  return dot > 0 && CODE_EXT.has(base.slice(dot + 1));
}
const cleanFiles = (files) => [...new Set((files || []).filter(meaningful))];
const baseName = (p) => String(p).split(/[\\/]/).pop();

const GENERIC = new Set(['maurice', 'projekte', 'documents', 'downloads', 'temp', 'appdata', 'newproject', 'users', 'desktop', 'project', 'session']);
const PROJECT_ALIAS = { aviasemblekopie: 'Sky Hauler', aviasemble: 'Sky Hauler', skyhauler: 'Sky Hauler' };
function cleanProject(name) {
  let s = String(name || '').trim();
  if (!s || /^wf_[0-9a-f-]+$/i.test(s)) return null;
  s = s.replace(/^(?:[A-Za-z]--)?(?:Users-[^-]+-)?(?:Desktop-|Documents-(?:New-project-)?|Projekte-)+/i, '').trim();
  const key = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key || GENERIC.has(key)) return null;
  return PROJECT_ALIAS[key] || s;
}
const projectKeyOf = (name) => { const c = cleanProject(name); return c ? c.toLowerCase().replace(/[^a-z0-9]/g, '') : null; };
function dayStats(events) {
  let commits = 0, first = null, last = null, aiSessions = 0;
  const files = new Set(), aiSeen = new Set(), projMap = new Map();
  for (const e of events) {
    first = first == null ? e.ts : Math.min(first, e.ts);
    last = last == null ? e.ts : Math.max(last, e.ts);
    if (e.type === 'commit') commits++;
    else if (e.type === 'files') cleanFiles(e.files).forEach((f) => files.add(f));
    else if (e.type === 'ai') {
      const cp = (cleanProject(e.project) || 'session').toLowerCase();
      const b = `${e.tool || ''}|${cp}|${Math.floor((e.ts || 0) / 1800000)}`;
      if (!aiSeen.has(b)) { aiSeen.add(b); aiSessions++; }
    }
    const c = cleanProject(e.project);
    if (c) { const k = c.toLowerCase().replace(/[^a-z0-9]/g, ''); if (!projMap.has(k)) projMap.set(k, c); }
  }
  return { commits, files: files.size, aiSessions, projects: [...projMap.values()], first, last };
}
function renderReportStats(events) {
  const box = el('reportStats');
  if (!events.length) { box.innerHTML = ''; box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const d = dayStats(events);
  const active = d.first && d.last ? Math.max(1, Math.round((d.last - d.first) / 3600000)) : 0;
  const cards = [
    ['commits', '📦', d.commits, tt('mCommits')],
    ['files', '✍️', d.files, tt('mFiles')],
    ['ai', '🤖', d.aiSessions, tt('mAi')],
    ['projects', '🐾', d.projects.length, tt('mProjects')],
    ['active', '⏱️', active + 'h', tt('mActive')],
  ].map(([key, emoji, val, lab]) => `<div class="metric"><div class="m-ico">${IMG.icons[key] ? `<img class="m-img" src="${IMG.icons[key]}" alt="">` : emoji}</div><div class="m-val">${val}</div><div class="m-lab">${lab}</div></div>`).join('');
  const top = d.projects.slice(0, 10);
  const chips = top.map((p) => `<span class="rchip">${esc(p)}</span>`).join('') +
    (d.projects.length > 10 ? `<span class="rchip more">+${d.projects.length - 10}</span>` : '');
  box.innerHTML = `<div class="metrics">${cards}</div>${d.projects.length ? `<div class="rchips">${chips}</div>` : ''}`;
}

/* ---------- semantic per-project activity ---------- */
let activityView = 'projects'; // 'projects' | 'timeline'
let currentEvents = [];
let projectSummaries = {};     // projectKey -> AI one-line headline (filled async)
let summariesToken = 0;

function truncate(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
// prefer the nicest display form of a project name (spaced + short)
const nicerName = (a, b) => ((a.includes(' ') ? 0 : 1) + a.length * 0.01) < ((b.includes(' ') ? 0 : 1) + b.length * 0.01);
// Your own AI prompt is the richest "what was I doing" signal — but a session's captured
// "last user message" is sometimes an AGENT/SYSTEM prompt (subagents, workflows, autonomous
// loops, persona briefs) rather than something you typed. Drop those, plus pasted paths,
// media filenames and tool-interrupt artifacts, so entries read like your real intent.
function goodPrompt(p) {
  p = String(p || '').trim();
  if (p.length < 6) return false;
  if (p.startsWith('/') || p.startsWith('<') || p.startsWith('@')) return false;
  if (/[A-Za-z]:[\\/]/.test(p)) return false;                       // absolute Windows path anywhere
  if (/(^|\s)\/(Users|home|mnt|[a-z])\//i.test(p)) return false;    // absolute unix path
  if (/\.(png|jpe?g|mp4|mov|webm|gif|zip|exe|jsonl?)\b/i.test(p)) return false;
  if (/^\[.*interrupted/i.test(p)) return false;
  // agent / system / persona boilerplate — not something you typed yourself
  if (/^(you are|you're|you have been|you will|your task|here are|here's|reminder\b|i need you to|analyze |bewerte |du bist|du baust|# )/i.test(p)) return false;
  if (/(Maurice is a|developer who wants|low-poly arcade|Unity project at|You are auditing|CORE-SYSTEM-PROMPT|Autonomous loop|subsystem maps|session is being continued|ran out of context|project context|read carefully|being invoked)/i.test(p)) return false;
  return true;
}
function relTime(ts) {
  if (!ts) return '';
  if (currentDate !== todayKey()) return fmtTime(ts);
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return tt('justNow');
  if (mins < 60) return tt('minsAgo')(mins);
  const h = Math.round(mins / 60);
  return h < 24 ? tt('hrsAgo')(h) : fmtTime(ts);
}

// Bucket a day's events by project and harvest the meaningful signal — commit messages,
// distinct AI prompts, file names, session counts. This is what turns "47 file events"
// into "DevPet — made the pets flicker-free".
function projectGroups(events) {
  const map = new Map();
  for (const e of events) {
    const name = cleanProject(e.project);
    const key = name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : '__other';
    let g = map.get(key);
    if (!g) { g = { key, name: name || null, commits: [], prompts: [], files: new Set(), ai: new Set(), tools: new Set(), last: 0 }; map.set(key, g); }
    if (name && (!g.name || nicerName(name, g.name))) g.name = name;
    g.last = Math.max(g.last, e.ts || 0);
    if (e.type === 'commit') g.commits.push(e);
    else if (e.type === 'ai') {
      g.ai.add(`${e.tool || ''}|${(name || 'session').toLowerCase()}|${Math.floor((e.ts || 0) / 1800000)}`);
      if (e.tool) g.tools.add(e.tool);
      if (goodPrompt(e.prompt)) g.prompts.push(e);
      cleanFiles(e.files).forEach((f) => g.files.add(baseName(f))); // files the AI edited = what was actually done
    } else if (e.type === 'files') {
      cleanFiles(e.files).forEach((f) => g.files.add(baseName(f)));
    }
  }
  // keep groups that carry real meaning (a name, a commit, or a prompt); drop pure noise
  return [...map.values()]
    .filter((g) => g.name || g.commits.length || g.prompts.length)
    .sort((a, b) => b.last - a.last);
}

function projectCard(g) {
  const li = document.createElement('li');
  li.className = 'event pcard';
  const aiN = g.ai.size, commitN = g.commits.length, fileN = g.files.size;
  const filesList = [...g.files];

  // newest-first, deduped. Commit messages describe WHAT WAS DONE; prompts are what the
  // user asked — kept separate so the card leads with the outcome, not the request.
  const dedupe = (items) => {
    const seen = new Set(), out = [];
    for (const it of items.sort((a, b) => b.ts - a.ts)) {
      const k = String(it.text || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
      if (!k || seen.has(k)) continue;
      seen.add(k); out.push(it);
    }
    return out;
  };
  const commitsU = dedupe(g.commits.map((c) => ({ text: c.message, ts: c.ts })));
  const promptsU = dedupe(g.prompts.map((e) => ({ text: e.prompt, ts: e.ts })));

  const aiSummary = projectSummaries[g.key];
  // headline = what was DONE: AI summary → newest commit → "N files edited" → newest prompt
  const headline = aiSummary ? truncate(aiSummary, 90)
    : commitsU.length ? truncate(commitsU[0].text, 90)
      : fileN ? tt('filesEdited')(fileN)
        : promptsU.length ? truncate(promptsU[0].text, 90)
          : tt('sessionsN')(aiN || 1);

  // collapsed "what was done" line = the edited files (concrete artifacts, not the prompt)
  const doneFiles = filesList.length
    ? filesList.slice(0, 8).join(' · ') + (filesList.length > 8 ? ` +${filesList.length - 8}` : '')
    : '';

  const ico = commitN ? '📦' : (fileN ? '✍️' : (aiN ? '🤖' : '•'));
  const chips = [];
  if (commitN) chips.push(`📦&nbsp;${commitN}`);
  if (aiN) chips.push(`🤖&nbsp;${aiN}`);
  if (fileN) chips.push(`✍️&nbsp;${fileN}`);
  if (g.tools.size) chips.push(esc([...g.tools].join(' · ')));

  // expandable detail: full commits, every edited file, every message — untruncated
  const parts = [];
  if (commitsU.length) parts.push(`<div class="dsec"><div class="dlab">📦 ${tt('dCommits')}</div>${commitsU.map((c) => `<div class="dline">${esc(c.text)}</div>`).join('')}</div>`);
  if (filesList.length) parts.push(`<div class="dsec"><div class="dlab">✍️ ${tt('dFiles')} · ${filesList.length}</div><div class="dfiles">${filesList.map((f) => `<span class="dfile">${esc(f)}</span>`).join('')}</div></div>`);
  if (promptsU.length) parts.push(`<div class="dsec"><div class="dlab">💬 ${tt('dPrompts')}</div>${promptsU.map((p) => `<div class="dline you">${esc(p.text)}</div>`).join('')}</div>`);
  const expandable = parts.length > 0;

  li.innerHTML = `
    <div class="ico">${ico}</div>
    <div class="body">
      <div class="phead"><span class="pname">${esc(g.name || tt('otherProject'))}</span><span class="time">${relTime(g.last)}</span>${expandable ? '<span class="caret">▾</span>' : ''}</div>
      <div class="msg">${aiSummary ? '<span class="spark">✨</span> ' : ''}${esc(headline)}</div>
      ${doneFiles ? `<div class="done"><span class="done-i">✍️</span><span class="done-f">${esc(doneFiles)}</span></div>` : ''}
      <div class="pmeta">${chips.map((c) => `<span class="mchip">${c}</span>`).join('')}</div>
      ${expandable ? `<div class="detail">${parts.join('')}</div>` : ''}
    </div>`;
  if (expandable) {
    li.classList.add('clickable');
    li.addEventListener('click', () => li.classList.toggle('expanded'));
  }
  return li;
}

function paintProjectCards() {
  const ul = el('timeline');
  ul.innerHTML = '';
  const groups = projectGroups(currentEvents);
  el('eventCount').textContent = groups.length ? tt('projectsN')(groups.length) : '';
  if (!groups.length) { ul.innerHTML = `<li class="empty">${tt('noProjects')}</li>`; return; }
  for (const g of groups) ul.append(projectCard(g));
}
function renderProjectView(events) {
  currentEvents = events;
  paintProjectCards();      // instant: render with raw-prompt headlines
  fetchSummaries();         // then upgrade headlines to AI one-liners when ready
}
// Ask the main process for AI-distilled per-project headlines (cached/cheap). Guarded by a
// token + date check so a slow response can't overwrite a newer day or the timeline view.
async function fetchSummaries() {
  if (!diaryAPI.getActivitySummaries) return;
  const token = ++summariesToken;
  const date = currentDate;
  try {
    const sums = await diaryAPI.getActivitySummaries(date);
    if (token !== summariesToken || date !== currentDate || activityView !== 'projects') return;
    if (sums && Object.keys(sums).length) { projectSummaries = sums; paintProjectCards(); }
  } catch {}
}

function setActivityView(v) {
  activityView = v;
  el('viewProjects').classList.toggle('active', v === 'projects');
  el('viewTimeline').classList.toggle('active', v === 'timeline');
  renderActivity(currentEvents);
}
function renderActivity(events) {
  currentEvents = events;
  if (activityView === 'timeline') renderTimeline(events);
  else renderProjectView(events);
}

let timelineExpanded = false;
const TIMELINE_LIMIT = 40; // groups shown before "show all"

function renderTimeline(rawEvents) {
  const ul = el('timeline');
  ul.innerHTML = '';
  // drop file-bursts that were pure OS/temp noise; keep their meaningful files on _cf
  const events = rawEvents.filter((e) => {
    if (e.type !== 'files') return true;
    e._cf = cleanFiles(e.files);
    return e._cf.length > 0;
  });
  el('eventCount').textContent = events.length ? tt('eventsN')(events.length) : '';
  if (!events.length) {
    ul.innerHTML = `<li class="empty">${tt('noEvents')}</li>`;
    return;
  }
  const sorted = [...events].sort((a, b) => b.ts - a.ts);
  // Collapse consecutive bursts of the same type into one row (commits stay individual,
  // since each is a meaningful milestone). Keeps the list short instead of 1000s of rows.
  const groups = [];
  for (const ev of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.type === ev.type && ev.type !== 'commit') last.items.push(ev);
    else groups.push({ type: ev.type, items: [ev] });
  }
  const shown = timelineExpanded ? groups : groups.slice(0, TIMELINE_LIMIT);
  for (const g of shown) ul.append(eventRow(g));
  if (groups.length > TIMELINE_LIMIT) {
    const li = document.createElement('li');
    li.className = 'more';
    li.textContent = timelineExpanded ? tt('showLess') : tt('showAll')(groups.length);
    li.addEventListener('click', () => { timelineExpanded = !timelineExpanded; renderTimeline(events); });
    ul.append(li);
  }
}

function eventRow(g) {
  const li = document.createElement('li');
  li.className = 'event';
  const n = g.items.length;
  const first = g.items[0]; // newest (list is desc)
  const last = g.items[n - 1];
  const span = n > 1 ? `${fmtTime(last.ts)}–${fmtTime(first.ts)}` : fmtTime(first.ts);
  let ico = '•', msg = '', sub = '';
  if (g.type === 'commit') {
    ico = '📦';
    msg = tt('quote')(first.message);
    sub = tt('commitFiles')(first.hash, first.filesChanged, first.author || '');
  } else if (g.type === 'files') {
    ico = '✍️';
    const cf = [...new Set(g.items.flatMap((e) => e._cf || cleanFiles(e.files)))];
    msg = n > 1 ? tt('filesBurst')(cf.length, n) : tt('filesEdited')(cf.length);
    sub = cf.slice(0, 5).map(baseName).join(', ');
  } else if (g.type === 'ai') {
    ico = '🤖';
    const total = g.items.reduce((s, e) => s + (e.messages || 0), 0);
    const tools = [...new Set(g.items.map((e) => e.tool).filter(Boolean))];
    const toolLabel = tools.length ? tools.join(' · ') : 'AI';
    msg = n > 1 ? tt('aiSessionsN')(n, total) : (first.prompt ? tt('quote')(first.prompt) : tt('aiSession'));
    sub = n > 1
      ? (first.prompt ? `${toolLabel} · ${tt('aiLatest')(first.prompt)}` : toolLabel)
      : `${toolLabel} · ${tt('messagesN')(first.messages || 0)}`;
  }
  li.innerHTML = `
    <div class="ico">${ico}${n > 1 ? `<span class="cnt">${n}</span>` : ''}</div>
    <div class="body">
      <div><span class="time">${span}</span><span class="proj">${esc(first.project || '?')}</span></div>
      <div class="msg">${esc(msg)}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
    </div>`;
  return li;
}

/* ---------- events ---------- */
el('genBtn').addEventListener('click', async () => {
  el('genBtn').disabled = true;
  el('genBtn').textContent = tt('writing');
  try {
    await diaryAPI.generate(currentDate);
    await loadDay();
  } finally {
    el('genBtn').textContent = tt('genBtn');
    el('genBtn').disabled = false;
  }
});

el('viewProjects').addEventListener('click', () => setActivityView('projects'));
el('viewTimeline').addEventListener('click', () => setActivityView('timeline'));

el('dateSelect').addEventListener('change', (e) => { currentDate = e.target.value; loadDay(); });
el('todayBtn').addEventListener('click', async () => { currentDate = todayKey(); await refreshDates(); loadDay(); });
el('prevDay').addEventListener('click', () => stepDay(1));
el('nextDay').addEventListener('click', () => stepDay(-1));

async function stepDay(dir) {
  const sel = el('dateSelect');
  const opts = [...sel.options].map((o) => o.value);
  const i = opts.indexOf(currentDate);
  const ni = i + dir;
  if (ni < 0 || ni >= opts.length) return;
  currentDate = opts[ni];
  loadDay();
}

el('addFolder').addEventListener('click', async () => {
  const folders = await diaryAPI.addFolder();
  if (folders) { cfg.watchedFolders = folders; renderFolders(); }
});

function bindSources() {
  const apply = () =>
    diaryAPI.setConfig({
      sources: { git: el('srcGit').checked, files: el('srcFiles').checked, ai: el('srcAi').checked, macro: el('srcMacro').checked },
    });
  ['srcGit', 'srcFiles', 'srcAi', 'srcMacro'].forEach((id) => el(id).addEventListener('change', apply));
}
function bindAi() {
  const apply = () =>
    diaryAPI.setConfig({
      ai: { enabled: el('aiEnabled').checked, apiKey: el('apiKey').value.trim(), model: el('aiModel').value },
    });
  el('aiEnabled').addEventListener('change', apply);
  el('aiModel').addEventListener('change', apply);
  el('apiKey').addEventListener('change', apply);
}
function bindSize() {
  el('sizeSlider').addEventListener('input', async (e) => {
    const pct = Number(e.target.value);
    el('sizeVal').textContent = `${pct}%`;
    await diaryAPI.setScale(pct / 100);
  });
}
function bindWellness() {
  const apply = () => diaryAPI.setConfig({
    wellness: { enabled: el('wellnessEnabled').checked, nudgeAfterMinutes: Number(el('wellnessMinutes').value) },
  });
  el('wellnessEnabled').addEventListener('change', apply);
  el('wellnessMinutes').addEventListener('change', apply);
}

el('demoBtn').addEventListener('click', async () => {
  await diaryAPI.seedDemo();
  await refreshDates();
  currentDate = todayKey();
  loadDay();
});
el('dataBtn').addEventListener('click', () => diaryAPI.openUserData());

diaryAPI.onUpdate(async () => { await loadConfig(); await refreshDates(); loadDay(); renderProgress(); renderMacroList(); renderMacroStats(); renderStreak(); renderTrophies(); });
if (diaryAPI.onLang) diaryAPI.onLang(async (l) => { lang = l || 'en'; applyStatic(); await refreshDates(); loadDay(); refreshMacroState(); renderTrophies(); });
diaryAPI.onScale((s) => {
  const pct = Math.round(s * 100);
  el('sizeSlider').value = pct;
  el('sizeVal').textContent = `${pct}%`;
});

// Keep a long-open window in sync: re-fetch config (unlocked skins), shop & progress
// whenever the window regains focus or becomes visible again — so a diary left open
// across a level-up / skin unlock never shows a stale level or locked skins.
async function refreshLive() {
  if (refreshLive._busy) return; // don't stack refreshes (e.g. focus firing mid skin-purchase)
  refreshLive._busy = true;
  try {
    cfg = await diaryAPI.getConfig();
    renderPills();
    await renderShop();
    await renderProgress();
    await refreshMacroState();
    await renderMacroList();
    await renderMacroStats();
    await renderStreak();
    await renderTrophies();
  } catch {} finally { refreshLive._busy = false; }
}
window.addEventListener('focus', refreshLive);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLive(); });

/* ---------- automation / macros ----------
   Recording/replay only ever runs on an explicit click here (or the global hotkeys /
   tray, which route through the same main-process functions) — nothing auto-fires. */
function renderMacroState(state) {
  const btn = el('macroRecordBtn');
  const recording = !!(state && state.recording);
  btn.textContent = recording ? tt('recordStop') : tt('recordStart');
  btn.classList.toggle('is-recording', recording);

  const patCb = el('patternDetect');
  if (state && typeof state.patternDetection === 'boolean' && document.activeElement !== patCb) {
    patCb.checked = state.patternDetection;
  }

  const pendingBox = el('macroPending');
  const pending = state && state.pending;
  if (pending) {
    pendingBox.classList.remove('hidden');
    el('macroPreview').innerHTML = pending.preview.map((l) => `<div>${esc(l)}</div>`).join('')
      + (pending.truncated ? `<div class="more">… ${tt('macroMoreSteps')}</div>` : '');
  } else {
    pendingBox.classList.add('hidden');
  }

  renderSuggestions((state && state.suggestions) || []);
}

function renderSuggestions(suggestions) {
  const ul = el('macroSuggestions');
  ul.innerHTML = '';
  for (const s of suggestions) {
    const li = document.createElement('li');
    li.className = 'macro-row sugg-row';
    const appLabel = (s.appPath && s.appPath.length > 1) ? s.appPath.join(' → ') : (s.windowTitle || '?');
    const kindIcon = s.kind === 'text' ? '✍️' : '🖱️';
    const headline = s.label
      ? `<div class="sugg-headline"><span class="spark">✨</span> ${esc(s.label)}</div>`
      : '';
    const textPreview = s.textPreview
      ? `<div class="sugg-text">${tt('quote')(esc(s.textPreview))}</div>`
      : '';
    li.innerHTML = `
      <div class="sugg-head">
        <span class="sugg-app">${kindIcon} ${esc(appLabel)}</span>
        <span class="sugg-meta">${tt('macroDurationSec')((s.durationMs / 1000).toFixed(1))} · ${relTime(s.detectedAt)}</span>
      </div>
      ${headline}
      ${textPreview}
      <div class="sugg-preview">${s.preview.map((l) => `<div>${esc(l)}</div>`).join('')}${s.truncated ? `<div>… ${tt('macroMoreSteps')}</div>` : ''}</div>
      <div class="sugg-actions">
        <button class="sugg-adopt">${tt('suggAdopt')}</button>
        <button class="sugg-dismiss">${tt('suggDismiss')}</button>
      </div>`;
    li.querySelector('.sugg-adopt').addEventListener('click', async () => { await diaryAPI.adoptSuggestion(s.id); });
    li.querySelector('.sugg-dismiss').addEventListener('click', async () => { await diaryAPI.dismissSuggestion(s.id); });
    ul.appendChild(li);
  }
}

async function refreshMacroState() {
  try { renderMacroState(await diaryAPI.getMacroState()); } catch {}
}

async function renderMacroStats() {
  const badge = el('macroSavedBadge');
  try {
    const stats = await diaryAPI.getMacroStats();
    if (stats && stats.totalReplays) {
      badge.textContent = tt('macroSavedTotal')(tt('macroDurationSec')(Math.round(stats.totalTimeSavedMs / 1000)));
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch { badge.classList.add('hidden'); }
}

async function renderMacroList() {
  const ul = el('macroList');
  let macros = [];
  try { macros = await diaryAPI.listMacros(); } catch {}
  if (!macros.length) { ul.innerHTML = `<li class="empty">${tt('macroEmpty')}</li>`; return; }
  ul.innerHTML = '';
  for (const m of macros) {
    const li = document.createElement('li');
    li.className = 'macro-row';
    li.innerHTML = `
      <div class="macro-info">
        <div class="macro-name" data-name="${esc(m.name)}">${esc(m.name)}</div>
        <div class="macro-meta">${tt('macroDurationSec')((m.durationMs / 1000).toFixed(1))} · ${tt('macroUsed')(m.timesReplayed || 0)}</div>
      </div>
      <button class="macro-rename" title="${tt('macroRename')}">✏️</button>
      <button class="macro-play" title="${tt('macroPlayTitle')}">▶</button>
      <button class="macro-del" title="${tt('remove')}">✕</button>`;
    li.querySelector('.macro-play').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try { await diaryAPI.replayMacro(m.id); } finally { b.disabled = false; }
    });
    li.querySelector('.macro-del').addEventListener('click', () => diaryAPI.deleteMacro(m.id));
    li.querySelector('.macro-rename').addEventListener('click', () => {
      const nameEl = li.querySelector('.macro-name');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = m.name;
      input.maxLength = 48;
      input.className = 'macro-rename-input';
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      const commit = async () => {
        const val = input.value.trim();
        if (val && val !== m.name) await diaryAPI.renameMacro(m.id, val);
        else renderMacroList();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') renderMacroList(); });
      input.addEventListener('blur', commit);
    });
    ul.appendChild(li);
  }
}

el('macroRecordBtn').addEventListener('click', () => diaryAPI.toggleMacroRecording());
el('macroApproveBtn').addEventListener('click', async () => {
  await diaryAPI.approveMacro(el('macroName').value);
  el('macroName').value = '';
});
el('macroDiscardBtn').addEventListener('click', () => diaryAPI.discardMacro());
el('patternDetect').addEventListener('change', (e) => diaryAPI.setConfig({ patternDetection: e.target.checked }));

if (diaryAPI.onMacroState) {
  diaryAPI.onMacroState((s) => { renderMacroState(s); renderMacroList(); renderMacroStats(); });
}

/* ---------- streak ---------- */
async function renderStreak() {
  let s = { current: 0, best: 0, freezes: 0 };
  try { s = await diaryAPI.getStreak(); } catch {}
  el('streakNum').textContent = s.current;
  el('streakCurrent').textContent = s.current;
  el('streakBest').textContent = tt('streakBest')(s.best);
  el('streakFreezeCount').textContent = tt('streakFreezes')(s.freezes);
}
el('buyFreezeBtn').addEventListener('click', async () => {
  const res = await diaryAPI.buyFreeze();
  if (res && res.ok) { await renderStreak(); await renderProgress(); }
  else {
    const btn = el('buyFreezeBtn');
    const original = btn.textContent;
    btn.textContent = tt('buyFreezeNoCoins');
    setTimeout(() => { btn.textContent = original; }, 1800);
  }
});

/* ---------- focus sessions ---------- */
let focusCountdownTimer = null;
function fmtCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function renderFocusState(state) {
  if (focusCountdownTimer) { clearInterval(focusCountdownTimer); focusCountdownTimer = null; }
  if (!state) {
    el('focusIdle').classList.remove('hidden');
    el('focusActive').classList.add('hidden');
    return;
  }
  el('focusIdle').classList.add('hidden');
  el('focusActive').classList.remove('hidden');
  let remaining = state.remainingMs;
  el('focusCountdown').textContent = fmtCountdown(remaining);
  focusCountdownTimer = setInterval(() => {
    remaining -= 1000;
    if (remaining <= 0) { clearInterval(focusCountdownTimer); focusCountdownTimer = null; renderFocusState(null); return; }
    el('focusCountdown').textContent = fmtCountdown(remaining);
  }, 1000);
}
el('focusMinutes').addEventListener('change', (e) => {
  el('focusCustomMinutes').classList.toggle('hidden', e.target.value !== 'custom');
  if (e.target.value === 'custom') el('focusCustomMinutes').focus();
});
el('focusStartBtn').addEventListener('click', async () => {
  const isCustom = el('focusMinutes').value === 'custom';
  const minutes = isCustom ? (Number(el('focusCustomMinutes').value) || 25) : (Number(el('focusMinutes').value) || 25);
  renderFocusState(await diaryAPI.startFocus(minutes));
});
el('focusStopBtn').addEventListener('click', async () => {
  await diaryAPI.stopFocus();
  renderFocusState(null);
});
if (diaryAPI.onFocusState) diaryAPI.onFocusState(renderFocusState);

/* ---------- trophy case ---------- */
async function renderTrophies() {
  const grid = el('trophyGrid');
  let data = { unlocked: [], all: [], stats: {} };
  try { data = await diaryAPI.getAchievements(); } catch {}
  const unlocked = new Set(data.unlocked || []);
  const stats = data.stats || {};
  grid.innerHTML = (data.all || []).map((a) => {
    const locked = !unlocked.has(a.id);
    const name = (a.name && a.name[lang === 'de' ? 'de' : 'en']) || a.id;
    const desc = (a.desc && a.desc[lang === 'de' ? 'de' : 'en']) || '';
    let progressHtml = '';
    if (locked && a.metric && a.target) {
      const val = Math.min(a.target, stats[a.metric] || 0);
      const pct = Math.round((val / a.target) * 100);
      progressHtml = `<div class="t-progress"><div class="t-progress-bar"><div class="t-progress-fill" style="width:${pct}%"></div></div>
        <div class="t-progress-text">${tt('trophyProgress')(val, a.target)}</div></div>`;
    }
    return `<div class="trophy${locked ? ' locked' : ''}" title="${esc(desc)}">
      <div class="t-icon">${IMG.trophies[a.id]
        ? `<img class="t-img${locked ? ' locked' : ''}" src="${IMG.trophies[a.id]}" alt="">`
        : (locked ? '🔒' : a.emoji)}</div>
      <div class="t-name">${esc(name)}</div>
      ${progressHtml}
    </div>`;
  }).join('');
}

/* ---------- ask your pet ---------- */
function addChatMsg(role, text) {
  const log = el('chatLog');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}
async function sendChat() {
  const input = el('chatInput');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';
  addChatMsg('you', question);
  const thinking = addChatMsg('pet', tt('askThinking'));
  const res = await diaryAPI.askPet(question);
  if (res && res.ok) {
    thinking.textContent = res.answer;
  } else if (res && res.reason === 'no-key') {
    thinking.textContent = tt('askNoKey');
    thinking.classList.add('error');
  } else {
    thinking.textContent = tt('askError');
    thinking.classList.add('error');
  }
}
el('chatSendBtn').addEventListener('click', sendChat);
el('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

/* ---------- weekly recap card ---------- */
el('recapBtn').addEventListener('click', async () => {
  const btn = el('recapBtn');
  const original = btn.textContent;
  btn.disabled = true;
  const period = el('recapPeriod').value;
  const res = await diaryAPI.generateRecap(period);
  btn.textContent = (res && res.ok) ? tt('recapDone') : tt('recapFail');
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2200);
});

/* ---------- LAN mobile companion ---------- */
async function renderLanInfo() {
  let info = { enabled: false, port: 4827, token: '', ips: [] };
  try { info = await diaryAPI.getLanInfo(); } catch {}
  el('lanEnabled').checked = info.enabled;
  const ul = el('lanUrls');
  ul.innerHTML = '';
  if (!info.ips.length) {
    ul.innerHTML = `<li class="empty">${tt('lanNone')}</li>`;
    return;
  }
  for (const ip of info.ips) {
    const url = `http://${ip}:${info.port}/?t=${info.token}`;
    const li = document.createElement('li');
    li.className = 'lan-url';
    li.innerHTML = `<span>${esc(url)}</span><button class="ghost-btn">${tt('lanCopy')}</button>`;
    li.querySelector('button').addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(url); } catch {}
      const b = e.currentTarget;
      const orig = b.textContent;
      b.textContent = tt('lanCopied');
      setTimeout(() => { b.textContent = orig; }, 1500);
    });
    ul.appendChild(li);
  }
}
el('lanEnabled').addEventListener('change', async (e) => {
  await diaryAPI.setConfig({ lanWidget: { enabled: e.target.checked } });
  renderLanInfo();
});
el('lanRegenBtn').addEventListener('click', async () => { await diaryAPI.regenerateLanToken(); renderLanInfo(); });

/* ---------- cloud relay (opt-in) ---------- */
function copyBtnFeedback(btn) {
  const orig = btn.textContent;
  btn.textContent = tt('lanCopied');
  setTimeout(() => { btn.textContent = orig; }, 1500);
}
async function renderCloudInfo() {
  let cr = { enabled: false, workerUrl: '', pushToken: '', viewToken: '' };
  try { cr = await diaryAPI.getCloudInfo(); } catch {}
  el('cloudEnabled').checked = !!cr.enabled;
  if (document.activeElement !== el('cloudWorkerUrl')) el('cloudWorkerUrl').value = cr.workerUrl || '';
  el('cloudPushToken').textContent = cr.pushToken || '–';
  el('cloudViewToken').textContent = cr.viewToken || '–';
  el('cloudShareUrl').textContent = cr.workerUrl
    ? `${cr.workerUrl.replace(/\/$/, '')}/?t=${cr.viewToken}`
    : '–';
}
el('cloudEnabled').addEventListener('change', async (e) => {
  await diaryAPI.setCloudConfig({ enabled: e.target.checked });
  renderCloudInfo();
});
el('cloudWorkerUrl').addEventListener('change', async (e) => {
  await diaryAPI.setCloudConfig({ workerUrl: e.target.value.trim() });
  renderCloudInfo();
});
el('cloudCopyPush').addEventListener('click', async (e) => {
  try { await navigator.clipboard.writeText(el('cloudPushToken').textContent); } catch {}
  copyBtnFeedback(e.currentTarget);
});
el('cloudCopyView').addEventListener('click', async (e) => {
  try { await navigator.clipboard.writeText(el('cloudViewToken').textContent); } catch {}
  copyBtnFeedback(e.currentTarget);
});
el('cloudCopyShare').addEventListener('click', async (e) => {
  const txt = el('cloudShareUrl').textContent;
  if (txt === '–') return;
  try { await navigator.clipboard.writeText(txt); } catch {}
  copyBtnFeedback(e.currentTarget);
});
el('cloudTestBtn').addEventListener('click', async () => {
  const result = el('cloudTestResult');
  const cr = await diaryAPI.getCloudInfo();
  if (!cr.workerUrl) { result.textContent = tt('cloudTestFail'); return; }
  await diaryAPI.pushCloudNow();
  result.textContent = tt('cloudTestOk');
  setTimeout(() => { result.textContent = ''; }, 4000);
});
el('cloudRegenBtn').addEventListener('click', async () => { await diaryAPI.regenerateCloudTokens(); renderCloudInfo(); });

/* ---------- init ---------- */
(async () => {
  try { if (diaryAPI.getAssetImages) IMG = (await diaryAPI.getAssetImages()) || IMG; } catch {}
  creatures = await diaryAPI.listCreatures();
  EMOJI = Object.fromEntries(creatures.map((c) => [c.id, c.emoji]));
  NAME = Object.fromEntries(creatures.map((c) => [c.id, c.name]));
  renderPills();
  await loadConfig();
  currentDate = todayKey();
  await refreshDates();
  await loadDay();
  await renderProgress();
  bindSources();
  bindAi();
  bindSize();
  bindWellness();
  await refreshMacroState();
  await renderMacroList();
  await renderMacroStats();
  await renderStreak();
  await renderTrophies();
  await renderLanInfo();
  await renderCloudInfo();
  renderFocusState(await diaryAPI.getFocusState());
})();
