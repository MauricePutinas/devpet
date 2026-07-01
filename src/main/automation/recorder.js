const { uIOhook, ensureStarted } = require('./uiohookSingleton');

// Records global keyboard + mouse-click events into a lightweight step list.
// Continuous mouse movement is intentionally NOT captured (keeps macros small
// and replay reliable across different window layouts) — only clicks with
// their coordinates at the time of the click.
//
// Recording never replays or executes anything by itself — it only produces a
// step list that main.js hands to the user for review before it can ever be
// saved as a macro.
class Recorder {
  constructor() {
    this.recording = false;
    this.steps = [];
    this.startedAt = 0;
    // Listeners are attached immediately but no-op via the `recording` guard in
    // _push — this shares uIOhook with PatternDetector's own listeners safely.
    uIOhook.on('keydown', (e) => this._push({ type: 'keydown', code: e.keycode }));
    uIOhook.on('keyup', (e) => this._push({ type: 'keyup', code: e.keycode }));
    uIOhook.on('mousedown', (e) => this._push({ type: 'mousedown', button: e.button, x: e.x, y: e.y }));
    uIOhook.on('mouseup', (e) => this._push({ type: 'mouseup', button: e.button, x: e.x, y: e.y }));
  }

  _push(step) {
    if (!this.recording) return;
    step.t = Date.now() - this.startedAt;
    this.steps.push(step);
  }

  start() {
    ensureStarted();
    this.steps = [];
    this.startedAt = Date.now();
    this.recording = true;
  }

  /** @returns {{steps: Array, durationMs: number} | null} null if nothing meaningful was recorded */
  stop() {
    this.recording = false;
    const durationMs = Date.now() - this.startedAt;
    const steps = this.steps;
    this.steps = [];
    if (steps.length === 0) return null;
    return { steps, durationMs };
  }

  isRecording() {
    return this.recording;
  }
}

module.exports = { Recorder };
