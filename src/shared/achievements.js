// Trophy definitions. Each `check(stats)` runs against config.lifetimeStats (+ streak)
// and returns true once earned — cheap to evaluate on every event since lifetimeStats
// are running counters, not a rescan of the whole diary.
// `metric` + `target` mirror `check` in plain-data form (no function) so the renderer
// can show a "32 / 50" progress bar for locked trophies without needing `check` itself
// shipped over IPC (functions can't cross Electron's structured-clone IPC anyway).
const ACHIEVEMENTS = [
  { id: 'first-commit', emoji: '📦', name: { en: 'First Commit', de: 'Erster Commit' }, desc: { en: 'Make your first commit', de: 'Mach deinen ersten Commit' }, metric: 'commits', target: 1, check: (s) => s.commits >= 1 },
  { id: 'commits-50', emoji: '📦', name: { en: 'Committed', de: 'Committed' }, desc: { en: '50 commits', de: '50 Commits' }, metric: 'commits', target: 50, check: (s) => s.commits >= 50 },
  { id: 'commits-250', emoji: '🏗️', name: { en: 'Builder', de: 'Baumeister' }, desc: { en: '250 commits', de: '250 Commits' }, metric: 'commits', target: 250, check: (s) => s.commits >= 250 },
  { id: 'night-owl', emoji: '🦉', name: { en: 'Night Owl', de: 'Nachteule' }, desc: { en: '10 commits after 11pm', de: '10 Commits nach 23 Uhr' }, metric: 'nightCommits', target: 10, check: (s) => s.nightCommits >= 10 },
  { id: 'ai-teamwork', emoji: '🤖', name: { en: 'AI Teamwork', de: 'KI-Teamwork' }, desc: { en: '25 AI coding sessions', de: '25 KI-Coding-Sessions' }, metric: 'aiSessions', target: 25, check: (s) => s.aiSessions >= 25 },
  { id: 'automator', emoji: '⚙️', name: { en: 'Automator', de: 'Automatisierer' }, desc: { en: 'Approve 10 macros', de: '10 Makros freigegeben' }, metric: 'macros', target: 10, check: (s) => s.macros >= 10 },
  { id: 'time-saver', emoji: '⏱️', name: { en: 'Time Saver', de: 'Zeitsparer' }, desc: { en: 'Replay macros 50 times', de: '50× Makros abgespielt' }, metric: 'macroReplays', target: 50, check: (s) => s.macroReplays >= 50 },
  { id: 'focused-10', emoji: '🎯', name: { en: 'Focused', de: 'Fokussiert' }, desc: { en: '10 focus sessions', de: '10 Fokus-Sessions' }, metric: 'focusSessions', target: 10, check: (s) => s.focusSessions >= 10 },
  { id: 'deep-work', emoji: '🧘', name: { en: 'Deep Work', de: 'Deep Work' }, desc: { en: '10 hours of focus time', de: '10 Stunden Fokuszeit' }, metric: 'focusMinutes', target: 600, check: (s) => s.focusMinutes >= 600 },
  { id: 'streak-7', emoji: '🔥', name: { en: 'Week Streak', de: 'Wochen-Streak' }, desc: { en: '7-day streak', de: '7 Tage Streak' }, metric: 'bestStreak', target: 7, check: (s) => s.bestStreak >= 7 },
  { id: 'streak-30', emoji: '🔥', name: { en: 'Month Streak', de: 'Monats-Streak' }, desc: { en: '30-day streak', de: '30 Tage Streak' }, metric: 'bestStreak', target: 30, check: (s) => s.bestStreak >= 30 },
  { id: 'streak-100', emoji: '💎', name: { en: 'Century Streak', de: 'Hundert-Streak' }, desc: { en: '100-day streak', de: '100 Tage Streak' }, metric: 'bestStreak', target: 100, check: (s) => s.bestStreak >= 100 },
  { id: 'level-10', emoji: '⭐', name: { en: 'Level 10', de: 'Level 10' }, desc: { en: 'Reach level 10', de: 'Level 10 erreichen' }, metric: 'level', target: 10, check: (s) => s.level >= 10 },
];

function nameOf(a, lang) { return a.name[lang === 'de' ? 'de' : 'en']; }
function descOf(a, lang) { return a.desc[lang === 'de' ? 'de' : 'en']; }

// Returns the ids of any newly-earned achievements not already in `unlocked`.
function checkNew(stats, unlocked) {
  const have = new Set(unlocked || []);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.check(stats)).map((a) => a.id);
}

module.exports = { ACHIEVEMENTS, nameOf, descOf, checkNew };
