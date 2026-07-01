// uiohook-napi's uIOhook is a shared singleton emitter — both the manual Recorder and
// the background PatternDetector subscribe to it independently (fine, EventEmitters
// support many listeners), but .start() itself must only ever be called once.
const { uIOhook } = require('uiohook-napi');

let started = false;
function ensureStarted() {
  if (started) return;
  uIOhook.start();
  started = true;
}

module.exports = { uIOhook, ensureStarted };
