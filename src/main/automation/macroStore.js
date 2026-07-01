// Persists approved macros + aggregate automation stats inside config.json (reusing
// config.js's atomic-write + backup-recovery instead of adding another storage dependency).
const config = require('./../config');

function listMacros() {
  return config.load().macros || [];
}

function saveMacro(macro) {
  const macros = [macro, ...listMacros()];
  config.save({ macros });
  return macro;
}

function deleteMacro(id) {
  config.save({ macros: listMacros().filter((m) => m.id !== id) });
}

function renameMacro(id, name) {
  const macros = listMacros();
  const macro = macros.find((m) => m.id === id);
  if (macro && name && name.trim()) {
    macro.name = name.trim();
    config.save({ macros });
  }
  return macro;
}

function getMacroStats() {
  return config.load().macroStats || { totalTimeSavedMs: 0, totalReplays: 0 };
}

// Called only after replayMacro() has actually finished running — i.e. only once the
// user's own explicit ▶ action has completed, never speculatively.
function recordReplay(id, durationMs) {
  const macros = listMacros();
  const macro = macros.find((m) => m.id === id);
  if (macro) {
    macro.timesReplayed = (macro.timesReplayed || 0) + 1;
    config.save({ macros });
  }
  const stats = getMacroStats();
  stats.totalTimeSavedMs += durationMs;
  stats.totalReplays += 1;
  config.save({ macroStats: stats });
  return stats;
}

module.exports = { listMacros, saveMacro, deleteMacro, renameMacro, getMacroStats, recordReplay };
