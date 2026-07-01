// Shared, ref-counted active-window-title poller — both PatternDetector and
// TextPatternDetector need "what app is focused right now" but shouldn't each run
// their own nut.js polling loop.
const { getActiveWindow } = require('@nut-tree-fork/nut-js');

let title = '';
let timer = null;
let refs = 0;

async function poll() {
  try {
    const win = await getActiveWindow();
    title = (await win.title) || '';
  } catch {
    // no focused window right now, or unsupported — keep the last known title
  }
}

function start() {
  refs++;
  if (timer) return;
  poll();
  timer = setInterval(poll, 1500);
}

function stop() {
  refs = Math.max(0, refs - 1);
  if (refs === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}

function current() {
  return title;
}

module.exports = { start, stop, current };
