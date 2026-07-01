const { keyboard, mouse, Point, Button, sleep } = require('@nut-tree-fork/nut-js');
const { uiohookCodeToNutKey } = require('./keymap');

keyboard.config.autoDelayMs = 0;
mouse.config.autoDelayMs = 0;

const NUT_BUTTON = { 0: Button.LEFT, 1: Button.MIDDLE, 2: Button.RIGHT };

// Replays an approved macro's steps with their original relative timing. Only ever
// called from a direct, explicit user action (tray click, diary ▶ button, or the
// replay-last hotkey) — never fired automatically by the recorder or a monitor.
async function replayMacro(macro) {
  let lastT = 0;
  for (const step of macro.steps) {
    const wait = step.t - lastT;
    if (wait > 0) await sleep(Math.min(wait, 5000)); // cap absurd gaps (e.g. user stepped away mid-recording)
    lastT = step.t;

    if (step.type === 'keydown' || step.type === 'keyup') {
      const nutKey = uiohookCodeToNutKey(step.code);
      if (nutKey === null) continue; // unmapped key — skip rather than throw
      if (step.type === 'keydown') await keyboard.pressKey(nutKey);
      else await keyboard.releaseKey(nutKey);
    } else if (step.type === 'mousedown' || step.type === 'mouseup') {
      await mouse.setPosition(new Point(step.x, step.y));
      const btn = NUT_BUTTON[step.button] ?? Button.LEFT;
      if (step.type === 'mousedown') await mouse.pressButton(btn);
      else await mouse.releaseButton(btn);
    }
  }
}

module.exports = { replayMacro };
