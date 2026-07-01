// Watches TYPED TEXT (not just raw key combos) for near-duplicate phrases you write
// repeatedly — e.g. the same email opener, the same reply, the same commit-message
// shape — three times in a row in the same window. Same suggest-only contract as
// PatternDetector: never auto-saves, never auto-replays, only ever pre-fills the usual
// review/approve panel.
//
// Text reconstruction is best-effort US-layout ASCII (letters, digits, common
// punctuation) — good enough to compare phrases, not a full IME/layout-aware typist.
// Non-printable keys (Enter, Tab, arrows, any Ctrl/Alt combo, …) end the current
// segment rather than appear in it.
//
// Safety: nothing is ever buffered while a sensitive window (password manager,
// banking, login forms, …) is focused — checked on every single keystroke, not just
// once per segment, so a mid-typing window switch can't leak a partial password.
const { uIOhook, ensureStarted } = require('./uiohookSingleton');
const { codeToName } = require('./keymap');
const { isSensitiveWindow } = require('./sensitiveWindows');
const activeWindow = require('./activeWindow');
const config = require('../config');

const MODIFIER_NAMES = new Set(['Ctrl', 'CtrlRight', 'Alt', 'AltRight', 'Shift', 'ShiftRight', 'Meta', 'MetaRight']);
const COMMAND_MODS = new Set(['Ctrl', 'CtrlRight', 'Alt', 'AltRight', 'Meta', 'MetaRight']); // Shift is a typing modifier, not a command one
const MIN_CHARS = 8;          // shorter than this isn't worth comparing as "a phrase"
const MAX_SEGMENTS = 60;      // rolling history of completed segments
const RAW_LOG_CAP = 900;
const PAUSE_FLUSH_MS = 2500;  // a typing pause this long ends the current segment
const REPEATS = 3;
const SIMILARITY_THRESHOLD = 0.6; // word-overlap ratio (Jaccard) to count as "the same phrase"
const MIN_SPAN_MS = 1500;

// Keyboard layouts: physical key NAME (US-positional, from keymap.js codeToName) → the
// character it actually produces. US is the classic default; DE (QWERTZ) fixes the y/z
// swap, umlauts (ä ö ü ß) and German punctuation/shift so reconstructed phrases are
// readable AND match correctly for German typists. Picked automatically from the app
// language, overridable via config.keyboardLayout ('auto' | 'us' | 'de').
// AltGr (right-Alt) third-level chars ARE captured on DE (@ € { } [ ] \\ ~ µ ² ³) — see
// _handleKey, which treats right-Alt as a third-level shift rather than a command modifier.
// Remaining gap: the ISO "<>" key has no uiohook name, so AltGr+< ('|') still can't be seen.
const LAYOUTS = {
  us: {
    swap: null,
    altgr: null, // classic US keyboard has no AltGr third level
    digitShift: { 0: ')', 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(' },
    punct: { Space: ' ', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`' },
    punctShift: { Comma: '<', Period: '>', Slash: '?', Semicolon: ':', Quote: '"', BracketLeft: '{', BracketRight: '}', Backslash: '|', Minus: '_', Equal: '+', Backquote: '~' },
  },
  de: {
    swap: { Y: 'Z', Z: 'Y' }, // QWERTZ swaps the physical Y and Z keys
    // AltGr (right-Alt) third level. Windows delivers AltGr as Ctrl+RightAlt; _handleKey
    // resolves it to these characters instead of treating the combo as a command.
    altgr: { Q: '@', E: '€', M: 'µ', 2: '²', 3: '³', 7: '{', 8: '[', 9: ']', 0: '}', Minus: '\\', BracketRight: '~' },
    digitShift: { 0: '=', 1: '!', 2: '"', 3: '§', 4: '$', 5: '%', 6: '&', 7: '/', 8: '(', 9: ')' },
    punct: { Space: ' ', Comma: ',', Period: '.', Slash: '-', Semicolon: 'ö', Quote: 'ä', BracketLeft: 'ü', BracketRight: '+', Backslash: '#', Minus: 'ß', Equal: '´', Backquote: '^' },
    punctShift: { Comma: ';', Period: ':', Slash: '_', Semicolon: 'Ö', Quote: 'Ä', BracketLeft: 'Ü', BracketRight: '*', Backslash: "'", Minus: '?', Equal: '`', Backquote: '°' },
  },
};

function resolveLayout() {
  const cfg = config.load();
  const l = cfg.keyboardLayout;
  if (l === 'de' || l === 'us') return LAYOUTS[l];
  return cfg.language === 'de' ? LAYOUTS.de : LAYOUTS.us; // 'auto'
}

function charFor(name, shift, altgr, L) {
  if (!name) return null;
  if (altgr) return (L.altgr && L.altgr[name]) || null; // AltGr third level; unmapped key = non-text
  if (/^[A-Z]$/.test(name)) { const c = (L.swap && L.swap[name]) || name; return shift ? c : c.toLowerCase(); }
  if (/^[0-9]$/.test(name)) return shift ? L.digitShift[name] : name;
  if (shift && L.punctShift[name]) return L.punctShift[name];
  if (L.punct[name]) return L.punct[name];
  return null; // non-printable → caller treats this as a segment boundary
}

function similarity(a, b) {
  const wa = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wb = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / new Set([...wa, ...wb]).size;
}

class TextPatternDetector {
  constructor(onSuggestion) {
    this.onSuggestion = onSuggestion; // ({ steps, durationMs, windowTitle, textPreview }) => void
    this.enabled = false;
    this.rawLog = []; // shared raw buffer, same shape as PatternDetector's
    this.held = new Set();
    this.activeCodes = new Set();
    this.bareMod = false; // a command modifier is down with no key pressed yet → a lone tap should end the segment
    this.buffer = ''; // in-progress segment text
    this.bufferStartRaw = -1; // rawLog index where the current segment began
    this.bufferWin = '';
    this.lastCharAt = 0;
    this.segments = []; // { text, win, rawStart, rawEnd, startTs, endTs }
    this.suggestedToday = new Map();
    this._flushTimer = null;

    this._onKeydown = (e) => this._handleKey(e, 'down');
    this._onKeyup = (e) => this._handleKey(e, 'up');
  }

  start() {
    if (this.enabled) return;
    this.enabled = true;
    ensureStarted();
    activeWindow.start();
    uIOhook.on('keydown', this._onKeydown);
    uIOhook.on('keyup', this._onKeyup);
    this._flushTimer = setInterval(() => {
      if (this.buffer && Date.now() - this.lastCharAt > PAUSE_FLUSH_MS) this._flushSegment();
    }, 1000);
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    activeWindow.stop();
    uIOhook.off('keydown', this._onKeydown);
    uIOhook.off('keyup', this._onKeyup);
    if (this._flushTimer) clearInterval(this._flushTimer);
    this._flushTimer = null;
    this.rawLog = [];
    this.segments = [];
    this.buffer = '';
  }

  isEnabled() {
    return this.enabled;
  }

  _pushRaw(step) {
    step.t = Date.now();
    this.rawLog.push(step);
    if (this.rawLog.length > RAW_LOG_CAP) {
      const drop = this.rawLog.length - RAW_LOG_CAP;
      this.rawLog.splice(0, drop);
      this.bufferStartRaw -= drop; // keep the in-progress segment's start index valid
      if (this.bufferStartRaw < 0) this._resetBuffer(); // trimmed past it — safest to just drop it
    }
    return this.rawLog.length - 1;
  }

  _resetBuffer() {
    this.buffer = '';
    this.bufferStartRaw = -1;
    this.bufferWin = '';
  }

  _handleKey(e, phase) {
    if (!this.enabled) return;
    const win = activeWindow.current();
    if (isSensitiveWindow(win)) { this._resetBuffer(); return; } // never touch this window's keystrokes at all

    const idx = this._pushRaw({ type: phase === 'down' ? 'keydown' : 'keyup', code: e.keycode });
    const name = codeToName(e.keycode);

    if (name && MODIFIER_NAMES.has(name)) {
      // Don't flush on the modifier press itself: Windows delivers AltGr as Ctrl+RightAlt,
      // so flushing here would chop the word right before an AltGr char (e.g. the "@" in an
      // address). Instead we ARM a "bare tap" flag on a command-modifier down and only flush
      // when it's released with no key pressed in between — that restores the old lone
      // Ctrl/Alt/Win-tap segment boundary, while any intervening key (text OR command) disarms
      // it (cleared below) so AltGr combos and real shortcuts stay intact.
      if (phase === 'down') {
        this.held.add(name);
        if (COMMAND_MODS.has(name)) this.bareMod = true;
      } else {
        this.held.delete(name);
        if (COMMAND_MODS.has(name) && this.bareMod) { this.bareMod = false; this._flushSegment(); }
      }
      return;
    }
    if (phase === 'up') { this.activeCodes.delete(e.keycode); return; }
    if (this.activeCodes.has(e.keycode)) return; // OS key-repeat while held
    this.activeCodes.add(e.keycode);
    this.bareMod = false; // a real key was pressed → whatever modifiers are held aren't a bare tap

    const L = resolveLayout();
    const shift = this.held.has('Shift') || this.held.has('ShiftRight');
    // AltGr = right-Alt held; on a layout with a third level it produces a real character
    // (@ € { } …) rather than acting as a command modifier.
    const altGrChar = this.held.has('AltRight') ? charFor(name, false, true, L) : null;

    // A held command modifier (Ctrl / left-Alt / Meta — or a right-Alt that is NOT yielding
    // an AltGr char) means a shortcut, not typing → end the current segment.
    if (!altGrChar && (this.held.has('Ctrl') || this.held.has('CtrlRight') || this.held.has('Alt') || this.held.has('AltRight') || this.held.has('Meta') || this.held.has('MetaRight'))) {
      this._flushSegment();
      return;
    }

    if (name === 'Backspace') {
      this.buffer = this.buffer.slice(0, -1);
      this.lastCharAt = Date.now();
      return;
    }
    if (name === 'Enter' || name === 'Tab' || name === 'Escape') {
      this._flushSegment();
      return;
    }
    const ch = altGrChar || charFor(name, shift, false, L);
    if (ch === null) { this._flushSegment(); return; } // arrows, F-keys, Delete, Home/End, … → boundary

    if (!this.buffer) { this.bufferStartRaw = idx; this.bufferWin = win; }
    else if (this.bufferWin !== win) { this._flushSegment(); this.bufferStartRaw = idx; this.bufferWin = win; }
    this.buffer += ch;
    this.lastCharAt = Date.now();
  }

  _flushSegment() {
    const text = this.buffer.trim();
    const startRaw = this.bufferStartRaw;
    const win = this.bufferWin;
    this._resetBuffer();
    if (text.length < MIN_CHARS || startRaw < 0) return;

    const endRaw = this.rawLog.length - 1;
    const startTs = this.rawLog[startRaw] ? this.rawLog[startRaw].t : Date.now();
    const endTs = this.rawLog[endRaw] ? this.rawLog[endRaw].t : startTs;
    this.segments.push({ text, win, rawStart: startRaw, rawEnd: endRaw, startTs, endTs });
    if (this.segments.length > MAX_SEGMENTS) this.segments.shift();
    this._checkForRepeat();
  }

  _checkForRepeat() {
    const s = this.segments;
    const n = s.length;
    if (n < REPEATS) return;
    const tail = s[n - 1], mid = s[n - 2], prev = s[n - 3];
    if (tail.win !== mid.win || mid.win !== prev.win) return; // keep text-pattern matching single-window (simpler, and typed phrases rarely span an app switch mid-sentence)
    const simA = similarity(tail.text, mid.text);
    const simB = similarity(mid.text, prev.text);
    if (simA < SIMILARITY_THRESHOLD || simB < SIMILARITY_THRESHOLD) return;

    const spanMs = tail.endTs - tail.startTs;
    if (spanMs < MIN_SPAN_MS && (tail.endTs - prev.startTs) < MIN_SPAN_MS) return;

    const normKey = tail.text.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
    const hashKey = `${tail.win}::${normKey}`;
    const today = new Date().toDateString();
    if (this.suggestedToday.get(hashKey) === today) return;
    this.suggestedToday.set(hashKey, today);
    this._emitSuggestion(tail);
  }

  _emitSuggestion(seg) {
    const slice = this.rawLog.slice(seg.rawStart, seg.rawEnd + 1);
    if (!slice.length) return;
    const t0 = slice[0].t;
    const steps = slice.map((r) => ({ type: r.type, code: r.code, t: r.t - t0 }));
    const durationMs = steps[steps.length - 1].t;
    if (durationMs <= 0) return;
    this.onSuggestion({ steps, durationMs, windowTitle: seg.win, textPreview: seg.text.slice(0, 140) });
  }
}

module.exports = { TextPatternDetector };
