/* global petAPI */
const petEl = document.getElementById('pet');
const facer = document.getElementById('facer');
const bubble = document.getElementById('bubble');
const vids = [document.getElementById('vidA'), document.getElementById('vidB')];

const SLEEP_AFTER = 75_000;

let creature = 'bvbcoder';
let frames = {};
let state = 'idle';
let baseState = 'idle';
let sleeping = false;
let dragging = false;
let walking = false;
let lastActivity = Date.now();
let front = 0;
let facing = 1;
let oneShotTimer = null;
let setSeq = 0; // guards the crossfade reveal against rapid state changes
let wasNear = false; // rising-edge detection for the signature-on-approach move

// geometry from the cursor broadcast
let cursorX = 0, cursorY = 0, petX = null, petY = 0, bw = 300, bh = 360;

const STATE_VID = { idle: 'video', look: 'videoLook', happy: 'videoHappy', sleep: 'videoSleep', walk: 'videoWalk', alert: 'videoAlert', standup: 'videoStandup', code: 'videoCode', grab: 'videoGrab', sig: 'videoSig' };
const ONESHOT = new Set(['happy', 'alert', 'standup', 'code', 'sig']);
const STR = {
  en: { idle: ['…', "I'm watching 👀", 'Back to coding?'], levelup: (lv) => `🎉 LEVEL ${lv}!\nKeep it up — I grow stronger with you 💪` },
  de: { idle: ['…', 'Ich pass auf 👀', 'Coden wir weiter?'], levelup: (lv) => `🎉 LEVEL ${lv}!\nWeiter so – ich werd stärker mit dir 💪` },
};
let lang = 'en';
function L() { return STR[lang === 'de' ? 'de' : 'en']; }

/* ---------- sound ---------- */
let soundOn = true;
const audio = { happy: null, alert: null };
async function loadSounds() {
  try {
    const s = await petAPI.getSounds();
    soundOn = s.enabled !== false;
    if (s.happy) audio.happy = new Audio(s.happy);
    if (s.alert) audio.alert = new Audio(s.alert);
  } catch {}
}
function playSound(n) { if (soundOn && audio[n]) { try { audio[n].currentTime = 0; audio[n].play().catch(() => {}); } catch {} } }
petAPI.onSoundEnabled((v) => { soundOn = v; });

/* ---------- spoken voice (free Edge TTS, sent from main as a data URL) ---------- */
let voice = null;
petAPI.onSpeak((url) => {
  try {
    if (voice) { voice.pause(); }
    voice = new Audio(url);
    voice.play().catch(() => {});
  } catch {}
});

/* ---------- state machine (crossfade between video loops) ---------- */
function srcFor(st) { return frames[STATE_VID[st]] || frames.video; }

function setState(st) {
  const src = srcFor(st);
  if (!src) return;
  const isOne = ONESHOT.has(st);
  if (st === state && !isOne) return;
  state = st;
  petEl.classList.toggle('fx-happy', st === 'happy'); // sparkles
  petEl.classList.toggle('fx-sleep', st === 'sleep');  // Zzz
  if (oneShotTimer) { clearTimeout(oneShotTimer); oneShotTimer = null; }
  const mySeq = ++setSeq;
  const cur = vids[front];
  const nxt = vids[1 - front];
  nxt.onended = null; nxt.onerror = null; nxt.onloadeddata = null;
  nxt.loop = !isOne;

  // Only crossfade once the new clip's first frame is actually decoded — otherwise
  // the transparent VP9 video briefly paints an opaque black rectangle while loading.
  let revealed = false;
  const reveal = () => {
    if (revealed || mySeq !== setSeq) return; // ignore stale/superseded reveals
    revealed = true; nxt.onloadeddata = null;
    nxt.classList.add('on');
    cur.classList.remove('on');
    front = 1 - front;
  };
  const recover = () => {
    if (oneShotTimer) { clearTimeout(oneShotTimer); oneShotTimer = null; }
    nxt.onended = null; nxt.onerror = null; decide(true);
  };

  nxt.onloadeddata = reveal;
  nxt.onerror = () => { if (isOne) recover(); else reveal(); };
  if (isOne) { nxt.onended = recover; oneShotTimer = setTimeout(recover, 4500); }
  nxt.setAttribute('src', src);
  nxt.load(); // force (re)load so loadeddata fires even when replaying the same clip
  setTimeout(reveal, 400); // safety net if loadeddata is slow/missing
  nxt.play().catch(() => { if (isOne) recover(); else reveal(); });
}

function decide(force) {
  if (dragging) return;
  if (ONESHOT.has(state) && !force) return;
  if (sleeping) return setState('sleep');
  if (walking) return setState('walk');
  if (near() && frames.videoLook) return setState('look'); // only if a real look clip exists
  setState('idle');
}

function near() { return Math.hypot(cursorX - (petX + bw / 2), cursorY - (petY + bh * 0.6)) < bw * 1.25; }
function setFacing(d) { if (d !== facing) { facing = d; facer.classList.toggle('left', d < 0); } }

/* ---------- creature loading ---------- */
async function render(id) {
  creature = id;
  let f = {};
  try { f = (await petAPI.getFrames(id)) || {}; } catch {}
  frames = f;
  sleeping = false; walking = false; state = '';
  vids.forEach((v) => { v.onended = null; v.onerror = null; v.classList.remove('on'); });
  front = 0;
  setState('idle');
}
(async () => {
  loadSounds();
  try { lang = (await petAPI.getLang()) || 'en'; } catch {}
  try { await render((await petAPI.getCreature()) || 'bvbcoder'); } catch { await render('bvbcoder'); }
})();
petAPI.onCreature(render);
petAPI.onLang((l) => { lang = l || 'en'; });

/* ---------- wake / sleep ---------- */
function wake() {
  lastActivity = Date.now();
  if (sleeping) {
    sleeping = false;
    if (frames.videoStandup) setState('standup'); // "stand up" once, then idle
    else decide(true);
  }
}
setInterval(() => {
  if (dragging || walking) return;
  if (!sleeping && Date.now() - lastActivity > SLEEP_AFTER && !near()) { sleeping = true; decide(true); }
}, 3000);

/* ---------- cursor: look at it when near, face it when nearby ---------- */
petAPI.onCursor((d) => {
  cursorX = d.cx; cursorY = d.cy; petY = d.by; bw = d.bw; bh = d.bh;
  if (!walking) petX = d.bx;
  const n = near();
  // fresh approach (cursor enters the zone) → play this skin's exclusive signature move once
  if (n && !wasNear && !sleeping && !dragging && frames.videoSig && !ONESHOT.has(state)) setState('sig');
  wasNear = n;
  if (n) { walking = false; if (!sleeping) lastActivity = Date.now(); }
  decide();
});

/* ---------- autonomous walking disabled — pets stay put (no wander) ---------- */

/* ---------- click-through toggle ---------- */
let interactive = false;
window.addEventListener('mousemove', (e) => {
  const r = petEl.getBoundingClientRect();
  const inside = e.clientX >= r.left + r.width * 0.08 && e.clientX <= r.right - r.width * 0.08 &&
    e.clientY >= r.top + r.height * 0.06 && e.clientY <= r.bottom - 4;
  const v = inside || dragging;
  if (v !== interactive) { interactive = v; petAPI.setInteractive(v); }
});

/* ---------- wheel resize (scroll the wheel right over the pet) ---------- */
petEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  petAPI.nudgeScale(e.deltaY < 0 ? 0.1 : -0.1);
  wake();
}, { passive: false });
petEl.addEventListener('pointerenter', wake);

/* ---------- dragging ---------- */
let dragReady = false, moved = false, sx = 0, sy = 0, wx = 0, wy = 0;
petEl.addEventListener('pointerdown', async (e) => {
  if (e.button !== 0) return;
  try { petEl.setPointerCapture(e.pointerId); } catch {}
  dragging = true; dragReady = false; moved = false; walking = false;
  sx = e.screenX; sy = e.screenY; wake();
  const b = await petAPI.getBounds();
  wx = b ? b.x : 0; wy = b ? b.y : 0; dragReady = true;
});
petEl.addEventListener('pointermove', (e) => {
  if (!dragging || !dragReady) return;
  const dx = e.screenX - sx, dy = e.screenY - sy;
  if (Math.abs(dx) + Math.abs(dy) > 3) {
    if (!moved && frames.videoGrab) setState('grab'); // "picked up" reaction on the first real drag move
    moved = true;
  }
  petX = wx + dx; petY = wy + dy;
  petAPI.moveWindow(petX, petY);
});
petEl.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  try { petEl.releasePointerCapture(e.pointerId); } catch {}
  if (!moved) onClick(); else { petAPI.endDrag(); decide(true); }
});
petEl.addEventListener('dblclick', () => petAPI.openDiary());
petEl.addEventListener('contextmenu', (e) => { e.preventDefault(); petAPI.contextMenu(); });

function onClick() {
  wake(); playSound('happy'); setState('happy');
  const idle = L().idle;
  const line = idle[Math.floor(Math.random() * idle.length)];
  showBubble(line, 2200);
  petAPI.requestSpeak(line); // speak it too, if the voice is enabled
}

/* ---------- speech bubble ---------- */
const queue = []; let busy = false;
function showBubble(t, ms = 5200) { queue.push({ t, ms }); if (!busy) next(); }
function next() {
  const it = queue.shift();
  if (!it) { busy = false; bubble.classList.remove('show'); return; }
  busy = true; bubble.textContent = it.t; bubble.classList.add('show');
  setTimeout(() => { bubble.classList.remove('show'); setTimeout(next, 240); }, it.ms);
}

/* ---------- activity from monitors ---------- */
petAPI.onActivity((ev) => {
  wake();
  if (ev.type === 'commit') { playSound('happy'); setState('happy'); }
  // non-commit = file edits / AI coding sessions → the pet "comments" on your coding.
  // If this creature has a coding clip (King 👑), play it; otherwise just the sound.
  else { playSound('alert'); if (frames.videoCode) setState('code'); }
  if (ev && ev.line) showBubble(ev.line);
});

/* ---------- level up celebration ---------- */
petAPI.onLevelUp((p) => {
  wake();
  playSound('happy');
  if (frames.videoHappy) setState('happy');
  petEl.classList.add('fx-happy'); // confetti sparkles
  showBubble(L().levelup(p.level), 4200);
  setTimeout(() => { if (state !== 'happy') petEl.classList.remove('fx-happy'); }, 4200);
});
