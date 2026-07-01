// Watches keyboard + mouse activity in the background and looks for the SAME short
// action sequence repeated back-to-back at least 3 times — then hands it to main.js
// as a *suggestion* only. It never records, saves, or replays anything by itself: a
// suggestion just pre-fills the normal review/approve panel a manually-recorded macro
// already goes through.
//
// Deliberately app-PATH aware, not app-locked: the most valuable automations are almost
// always cross-app (copy a value in Excel, switch to Outlook, paste it) — so the match
// key includes which window each step happened in, and the same multi-app "shape" has
// to repeat, rather than requiring the whole thing to stay inside one window.
//
// Precision over recall on purpose (per the "no useless suggestions" requirement):
//  - the 3 repeats must be immediately consecutive (not just "somewhere in the day")
//  - the pattern must be at least MIN_LEN distinct actions long
//  - the whole occurrence must span at least MIN_SPAN_MS (skips trivial fast blips)
//  - nothing is ever captured while a sensitive window (password manager, banking, …) is focused
//  - the exact same pattern (incl. its app path) is only ever suggested once per calendar day
const { uIOhook, ensureStarted } = require('./uiohookSingleton');
const { codeToName } = require('./keymap');
const { isSensitiveWindow } = require('./sensitiveWindows');
const activeWindow = require('./activeWindow');

const MODIFIER_NAMES = new Set(['Ctrl', 'CtrlRight', 'Alt', 'AltRight', 'Shift', 'ShiftRight', 'Meta', 'MetaRight']);
const MIN_LEN = 4;        // shortest action sequence worth suggesting
const MAX_LEN = 12;       // longest sequence we bother scanning for (keeps the check cheap)
const REPEATS = 3;        // how many immediate back-to-back repeats trigger a suggestion
const MIN_SPAN_MS = 1500; // a single occurrence must take at least this long
const RAW_LOG_CAP = 900;  // rolling raw-event buffer size

class PatternDetector {
  constructor(onSuggestion) {
    this.onSuggestion = onSuggestion; // ({ steps, durationMs, windowTitle, appPath }) => void
    this.enabled = false;
    this.rawLog = []; // { type, code?, button?, x?, y?, t: epochMs, win }
    this.suggestedToday = new Map(); // "appPath::tokenKey" -> dateString

    this._onKeydown = (e) => this._pushRaw({ type: 'keydown', code: e.keycode });
    this._onKeyup = (e) => this._pushRaw({ type: 'keyup', code: e.keycode });
    this._onMousedown = (e) => this._pushRaw({ type: 'mousedown', button: e.button, x: e.x, y: e.y });
    this._onMouseup = (e) => this._pushRaw({ type: 'mouseup', button: e.button, x: e.x, y: e.y });
  }

  start() {
    if (this.enabled) return;
    this.enabled = true;
    ensureStarted();
    activeWindow.start();
    uIOhook.on('keydown', this._onKeydown);
    uIOhook.on('keyup', this._onKeyup);
    uIOhook.on('mousedown', this._onMousedown);
    uIOhook.on('mouseup', this._onMouseup);
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    activeWindow.stop();
    uIOhook.off('keydown', this._onKeydown);
    uIOhook.off('keyup', this._onKeyup);
    uIOhook.off('mousedown', this._onMousedown);
    uIOhook.off('mouseup', this._onMouseup);
    this.rawLog = [];
  }

  isEnabled() {
    return this.enabled;
  }

  _pushRaw(step) {
    if (!this.enabled) return;
    const win = activeWindow.current();
    if (isSensitiveWindow(win)) return; // never buffer anything seen while a sensitive window is focused
    step.t = Date.now();
    step.win = win;
    this.rawLog.push(step);
    if (this.rawLog.length > RAW_LOG_CAP) this.rawLog.splice(0, this.rawLog.length - RAW_LOG_CAP);
    this._checkForPattern();
  }

  // Rebuilds the "action token" stream fresh from the raw log every time (cheap: the
  // log is capped, so this is at most a few hundred entries) rather than maintaining a
  // second structure that could drift out of sync with it.
  _tokenize() {
    const tokens = [];
    const held = new Set();
    const activeCodes = new Set();
    for (let i = 0; i < this.rawLog.length; i++) {
      const s = this.rawLog[i];
      if (s.type === 'keydown' || s.type === 'keyup') {
        const name = codeToName(s.code);
        if (name && MODIFIER_NAMES.has(name)) {
          if (s.type === 'keydown') held.add(name); else held.delete(name);
          continue;
        }
        if (s.type === 'keyup') { activeCodes.delete(s.code); continue; }
        if (activeCodes.has(s.code)) continue; // OS key-repeat while held
        activeCodes.add(s.code);
        const mods = [...held].sort().join('+');
        tokens.push({ token: (mods ? mods + '+' : '') + (name || s.code), ts: s.t, win: s.win, rawIndex: i });
      } else if (s.type === 'mousedown') {
        tokens.push({ token: `click${s.button}`, ts: s.t, win: s.win, rawIndex: i });
      }
    }
    return tokens;
  }

  // A token's "identity" for matching purposes includes which window it happened in —
  // this is what lets a cross-app sequence (Excel → Outlook → Excel) repeat as a whole
  // "shape" without requiring every step to be in the same single window.
  static _tokenKey(t) {
    return `${t.win}${t.token}`;
  }

  _checkForPattern() {
    const tokens = this._tokenize();
    const n = tokens.length;
    const maxLen = Math.min(MAX_LEN, Math.floor(n / REPEATS));
    for (let L = maxLen; L >= MIN_LEN; L--) {
      if (n < L * REPEATS) continue;
      const groups = [];
      for (let g = 0; g < REPEATS; g++) groups.push(tokens.slice(n - (g + 1) * L, n - g * L));
      const key = groups[0].map(PatternDetector._tokenKey).join('|');
      const allMatch = groups.every((g) => g.length === L && g.map(PatternDetector._tokenKey).join('|') === key);
      if (!allMatch) continue;

      const tail = groups[0];
      const spanMs = tail[tail.length - 1].ts - tail[0].ts;
      if (spanMs < MIN_SPAN_MS) continue;

      const today = new Date().toDateString();
      if (this.suggestedToday.get(key) === today) continue; // already suggested — try a shorter L instead
      this.suggestedToday.set(key, today);
      this._emitSuggestion(tail, tokens, n - L);
      return; // longest qualifying pattern wins; don't also fire shorter sub-patterns for the same event
    }
  }

  _emitSuggestion(tail, tokens, tailStartIdx) {
    const rawStart = tail[0].rawIndex;
    const nextTokenIdx = tailStartIdx + tail.length;
    const rawEnd = nextTokenIdx < tokens.length ? tokens[nextTokenIdx].rawIndex - 1 : this.rawLog.length - 1;
    const slice = this.rawLog.slice(rawStart, rawEnd + 1);
    if (!slice.length) return;
    const t0 = slice[0].t;
    const steps = slice.map((s) => ({ type: s.type, code: s.code, button: s.button, x: s.x, y: s.y, t: s.t - t0 }));
    const durationMs = steps[steps.length - 1].t;
    if (durationMs <= 0) return;
    // distinct windows visited, in order, deduped consecutively — e.g. "Excel.xlsx → Outlook"
    const appPath = [];
    for (const t of tail) if (appPath[appPath.length - 1] !== t.win) appPath.push(t.win);
    this.onSuggestion({ steps, durationMs, windowTitle: tail[0].win, appPath });
  }
}

module.exports = { PatternDetector };
