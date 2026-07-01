// Turns a raw recorded step list into a short, readable action summary — shown in the
// diary's approval panel so the user can actually see what they're about to save/replay,
// not just a step count. Display-only; recorder.js's raw steps stay the source of truth.
const { codeToName } = require('./keymap');

const KEY_LABELS = {
  Enter: 'Enter', Space: 'Leertaste', Tab: 'Tab', Backspace: 'Rücktaste',
  Escape: 'Esc', Delete: 'Entf', Insert: 'Einfg',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  PageUp: 'Bild ↑', PageDown: 'Bild ↓', Home: 'Pos1', End: 'Ende',
};
const MODIFIER_LABELS = { Ctrl: 'Strg', CtrlRight: 'Strg', Alt: 'Alt', AltRight: 'Alt', Shift: 'Shift', ShiftRight: 'Shift', Meta: 'Win', MetaRight: 'Win' };
const MOD_ORDER = ['Strg', 'Alt', 'Shift', 'Win'];

function humanizeSteps(steps, { limit = 60 } = {}) {
  const held = new Set(); // modifier display names currently held down
  const activeCodes = new Set(); // suppress duplicate lines from OS key-repeat while held
  const lines = [];

  for (const step of steps) {
    if (lines.length >= limit) break;

    if (step.type === 'keydown' || step.type === 'keyup') {
      const name = codeToName(step.code);
      const modLabel = name && MODIFIER_LABELS[name];
      if (modLabel) {
        if (step.type === 'keydown') held.add(modLabel);
        else held.delete(modLabel);
        continue;
      }
      if (step.type === 'keyup') { activeCodes.delete(step.code); continue; }
      if (activeCodes.has(step.code)) continue; // auto-repeat while the key stays held
      activeCodes.add(step.code);
      const keyLabel = KEY_LABELS[name] || name || '?';
      const mods = MOD_ORDER.filter((m) => held.has(m));
      lines.push(`⌨️ ${[...mods, keyLabel].join(' + ')}`);
    } else if (step.type === 'mousedown') {
      const label = step.button === 2 ? 'Rechtsklick' : step.button === 1 ? 'Mittelklick' : 'Klick';
      lines.push(`🖱️ ${label} bei (${step.x}, ${step.y})`);
    }
  }

  return { lines, truncated: steps.length > 0 && lines.length >= limit };
}

module.exports = { humanizeSteps };
