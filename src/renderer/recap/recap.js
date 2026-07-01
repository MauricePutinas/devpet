const L = { de: {
  headlineWeek: 'Coding-Woche', headlineDay: 'Coding-Tag',
  commits: 'Commits', files: 'Dateien', ai: 'KI-Sessions', saved: 'gespart',
  footer: (lvl, streak) => `⭐ Level ${lvl} · 🔥 ${streak} Tage Streak`,
}, en: {
  headlineWeek: 'Coding Week', headlineDay: 'Coding Day',
  commits: 'Commits', files: 'Files', ai: 'AI sessions', saved: 'saved',
  footer: (lvl, streak) => `⭐ Level ${lvl} · 🔥 ${streak}-day streak`,
} };

function fmtSaved(sec, lang) {
  if (sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  return lang === 'de' ? `${m} Min` : `${m} min`;
}

(async () => {
  const d = (await recapAPI.getData()) || {};
  const lang = d.lang === 'de' ? 'de' : 'en';
  const t = L[lang];

  document.getElementById('avatar').textContent = d.emoji || '🐶';
  document.getElementById('range').textContent = d.range || '';
  document.getElementById('headline').textContent = d.period === 'day' ? t.headlineDay : t.headlineWeek;

  const metrics = [
    [d.commits || 0, t.commits],
    [d.files || 0, t.files],
    [d.aiSessions || 0, t.ai],
    [fmtSaved(d.macroTimeSavedSec || 0, lang), t.saved],
  ];
  document.getElementById('metrics').innerHTML = metrics
    .map(([n, l]) => `<div class="metric"><div class="n">${n}</div><div class="l">${l}</div></div>`)
    .join('');

  document.getElementById('quote').textContent = d.quote ? `"${d.quote}"` : '';
  document.getElementById('footerLine').textContent = t.footer(d.level || 1, d.streak || 0);
})();
