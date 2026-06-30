// Turns raw activity events into (a) short speech-bubble reactions and
// (b) a daily diary entry. Has a built-in local writer and an optional
// Claude-API writer for a nicer narrative.
const https = require('https');
const { get: getCreature } = require('../../shared/creatures');

function persona(creature) {
  return getCreature(creature);
}

// ---- short reactions shown in the pet's speech bubble ----
// Time-of-day + commit-content aware, with rotating variety so it never feels canned.
const LINES = {
  en: {
    night: ["Still up? 🌙", "The bugs are asleep now 😴", "Go to bed! 🛏️", "One last commit, then done? 🌛", "Night shift, huh? ☕"],
    files: ["I see you coding… ✍️", "Busy busy! ⌨️", "Keep typing, I've got your back 👀", "Something's taking shape! ✨"],
    ai: ["AI power! 🤖", "Teaming up with the AI 🤝", "Let the machine help 🤖", "Teamwork with the AI! ⚡"],
    commitFix: ["Another fix? 😏", "Gotcha — bug caught! 🐛", "Fix number… I lost count 😅", "Squashed, little bug! 🔨"],
    commitTest: ["Tests! Exemplary 🧪", "Green, green, green? 🟢", "Testing makes you strong 💪", "Better safe than sorry 🧪"],
    commitBig: ["Huge commit! 💪", "Big one! 🚀", "Wow, lots going on! ✨", "Giant leap forward! 🚀"],
    commit: ["Commit saved! 🎉", "Cleanly committed ✅", "Another piece done! 🎉", "Nice commit! 👏"],
  },
  de: {
    night: ['Noch wach? 🌙', 'Die Bugs schlafen jetzt auch 😴', 'Geh ins Bett! 🛏️', 'Ein letzter Commit, dann Schluss? 🌛', 'Spätschicht, hm? ☕'],
    files: ['Ich seh dich coden… ✍️', 'Fleißig fleißig! ⌨️', 'Schreib weiter, ich pass auf 👀', 'Da entsteht was! ✨'],
    ai: ['KI-Power! 🤖', 'Zusammen mit der KI 🤝', 'Lass die Maschine ran 🤖', 'Teamwork mit der KI! ⚡'],
    commitFix: ['Schon wieder ein Fix? 😏', 'Hoppla – Bug gefangen! 🐛', 'Fix Nummer… ich zähl nicht mehr 😅', 'Erwischt, kleiner Bug! 🔨'],
    commitTest: ['Tests! Vorbildlich 🧪', 'Grün, grün, grün? 🟢', 'Testen macht stark 💪', 'Sicher ist sicher 🧪'],
    commitBig: ['Riesen-Commit! 💪', 'Großes Ding! 🚀', 'Wow, da war viel los! ✨', 'Mega-Sprung nach vorn! 🚀'],
    commit: ['Commit gespeichert! 🎉', 'Sauber abgespeichert ✅', 'Wieder ein Stück fertig! 🎉', 'Schöner Commit! 👏'],
  },
};
function pick(arr, seed) { return arr[Math.floor((seed || 0) / 1000) % arr.length] || arr[0]; }
function langOf(l) { return l === 'de' ? 'de' : 'en'; }

function reaction(event, creature, lang) {
  const L = langOf(lang);
  const P = LINES[L];
  const q = L === 'de' ? (s) => `„${s}"` : (s) => `"${s}"`;
  const p = persona(creature);
  const hour = new Date(event.ts || Date.now()).getHours();
  const night = hour >= 23 || hour < 5;
  if (event.type === 'commit') {
    const m = (event.message || '').toLowerCase();
    let pool = night ? P.night : P.commit;
    if (!night) {
      if (/\b(fix|typo|oops|bug|revert|hotfix)\b/.test(m)) pool = P.commitFix;
      else if (/test/.test(m)) pool = P.commitTest;
      else if ((event.filesChanged || 0) >= 10) pool = P.commitBig;
    }
    const lead = night ? '' : `${p.call}! `;
    return `${lead}${pick(pool, event.ts)}\n${q(truncate(event.message, 44))}`;
  }
  if (event.type === 'files') {
    if (night) return pick(P.night, event.ts);
    return `${pick(P.files, event.ts)} (${event.count} in ${event.project})`;
  }
  if (event.type === 'ai') {
    if (night) return pick(P.night, event.ts);
    return event.prompt ? `${pick(P.ai, event.ts)}\n${q(truncate(event.prompt, 50))}` : pick(P.ai, event.ts);
  }
  return `${p.emoji} …`;
}

function truncate(s, n) {
  s = (s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---- noise / cleanup so the diary stays meaningful ----
const CODE_EXT = new Set(('js jsx ts tsx mjs cjs vue svelte py rb go rs java kt c h cpp hpp cc cs php swift dart scala sh bash ps1 sql htm html css scss sass less json json5 yaml yml toml ini cfg conf env xml md mdx txt rst gd glsl wgsl hlsl shader astro prisma graphql gql proto ipynb').split(' '));
const NOISE_DIR = new Set(('appdata temp tmp cache caches .cache cookies gpucache indexeddb network dist build out .next coverage __pycache__ .venv venv node_modules .git wsl docker onedrive packages webstorage sentry blob_storage').split(' '));
function meaningfulFile(p) {
  const parts = String(p).split(/[\\/]/);
  for (const s of parts) { const ls = s.toLowerCase(); if (NOISE_DIR.has(ls) || ls.startsWith('codex-index') || ls.startsWith('etilqs_')) return false; }
  const base = parts[parts.length - 1].toLowerCase(), dot = base.lastIndexOf('.');
  return dot > 0 && CODE_EXT.has(base.slice(dot + 1));
}
const GENERIC = new Set(['maurice', 'projekte', 'documents', 'downloads', 'temp', 'appdata', 'newproject', 'users', 'desktop', 'project', 'session']);
// prettier display names for folder names that don't read well (keyed by alnum-lowercased form)
const PROJECT_ALIAS = { aviasemblekopie: 'Sky Hauler', aviasemble: 'Sky Hauler', skyhauler: 'Sky Hauler' };
function cleanName(name) {
  let s = String(name || '').trim();
  if (!s || /^wf_[0-9a-f-]+$/i.test(s)) return null; // workflow temp worktrees
  s = s.replace(/^(?:[A-Za-z]--)?(?:Users-[^-]+-)?(?:Desktop-|Documents-(?:New-project-)?|Projekte-)+/i, '').trim(); // strip encoded path artifacts
  const key = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key || GENERIC.has(key)) return null;
  return PROJECT_ALIAS[key] || s;
}
function cleanProjects(events) {
  const map = new Map(); // dedupe key -> nicest display form
  const nicer = (a, b) => ((a.includes(' ') ? 0 : 1) + a.length * 0.01) < ((b.includes(' ') ? 0 : 1) + b.length * 0.01);
  for (const e of events) {
    const c = cleanName(e.project);
    if (!c) continue;
    const key = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cur = map.get(key);
    if (!cur || nicer(c, cur)) map.set(key, c);
  }
  return [...map.values()];
}
function goodPrompt(p) {
  p = String(p || '').trim();
  if (p.length < 6) return false;
  if (p.startsWith('/') || p.startsWith('<') || p.startsWith('@')) return false;
  if (/[A-Za-z]:[\\/]/.test(p)) return false;                       // absolute Windows path anywhere
  if (/(^|\s)\/(Users|home|mnt|[a-z])\//i.test(p)) return false;    // absolute unix path
  if (/\.(png|jpe?g|mp4|mov|webm|gif|zip|exe|jsonl?)\b/i.test(p)) return false;
  if (/^\[.*interrupted/i.test(p)) return false;
  // agent / system / persona boilerplate — not something the user typed
  if (/^(you are|you're|you have been|you will|your task|here are|here's|reminder\b|i need you to|analyze |bewerte |du bist|du baust|# )/i.test(p)) return false;
  if (/(Maurice is a|developer who wants|low-poly arcade|Unity project at|You are auditing|CORE-SYSTEM-PROMPT|Autonomous loop|subsystem maps|session is being continued|ran out of context|project context|read carefully|being invoked)/i.test(p)) return false;
  return true;
}

// ---- aggregate stats ----
function buildStats(events) {
  const stats = { commits: [], fileBursts: 0, filesTouched: new Set(), aiSessions: 0, aiMessages: 0, aiPrompts: [], projects: [], first: null, last: null };
  const aiSeen = new Set();
  const prompts = new Map();
  for (const e of events) {
    stats.first = stats.first == null ? e.ts : Math.min(stats.first, e.ts);
    stats.last = stats.last == null ? e.ts : Math.max(stats.last, e.ts);
    if (e.type === 'commit') { stats.commits.push(e); continue; }
    if (e.type === 'files') {
      const mf = (e.files || []).filter(meaningfulFile);
      if (mf.length) { stats.fileBursts++; mf.forEach((f) => stats.filesTouched.add(`${e.project}/${f}`)); }
    } else if (e.type === 'ai') {
      const cp = (cleanName(e.project) || 'session').toLowerCase();
      const bucket = `${e.tool || ''}|${cp}|${Math.floor((e.ts || 0) / 1800000)}`; // one "session" per tool+project per 30 min
      if (!aiSeen.has(bucket)) { aiSeen.add(bucket); stats.aiSessions++; }
      stats.aiMessages += e.messages || 0;
      if (goodPrompt(e.prompt)) { const k = e.prompt.slice(0, 80); if (!prompts.has(k)) prompts.set(k, e.prompt.trim()); }
    }
  }
  stats.projects = cleanProjects(events);
  stats.aiPrompts = [...prompts.values()];
  return stats;
}

function fmtTime(ts) {
  if (!ts) return '–';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---- local (offline) diary writer ----
function localReport(events, creature, lang, period = 'day') {
  const L = langOf(lang);
  const p = persona(creature);
  const week = period === 'week';
  const q = L === 'de' ? (s) => `„${s}"` : (s) => `"${s}"`;
  if (!events.length) {
    return L === 'de'
      ? `${p.emoji} ${p.name} hat ${week ? 'diese Woche' : 'heute'} noch nichts gesehen. Fang an zu coden – ich pass auf! ✨`
      : `${p.emoji} ${p.name} hasn't seen anything ${week ? 'this week' : 'yet today'}. Start coding — I'm watching! ✨`;
  }
  const s = buildStats(events);
  const span = s.first && s.last ? `${fmtTime(s.first)}–${fmtTime(s.last)}` : '';
  const projects = [...s.projects].filter(Boolean);
  const projList = projects.slice(0, 6).join(', ') + (projects.length > 6 ? ` +${projects.length - 6}` : '');
  const lines = [];

  if (L === 'de') {
    lines.push(`${p.emoji} Liebes Tagebuch,`, '');
    lines.push(`${week ? 'diese Woche war produktiv' : 'heute war ein produktiver Tag'}${span ? ` (${span})` : ''}! Mein Mensch hat an ${projects.length} Projekt${projects.length === 1 ? '' : 'en'} gearbeitet${projects.length ? `: ${projList}` : ''}.`, '');
    if (s.commits.length) {
      lines.push(`📦 **${s.commits.length} Commit${s.commits.length === 1 ? '' : 's'}**`);
      for (const c of s.commits.slice(0, 8)) lines.push(`   • ${fmtTime(c.ts)} – ${q(truncate(c.message, 60))} (${c.hash}, ${c.filesChanged} Dateien)`);
      if (s.commits.length > 8) lines.push(`   • … und ${s.commits.length - 8} weitere`);
      lines.push('');
    }
    if (s.filesTouched.size) lines.push(`✍️ **${s.filesTouched.size} Dateien** bearbeitet in ${s.fileBursts} Schreib-Phasen.`, '');
    if (s.aiSessions) {
      lines.push(`🤖 **${s.aiSessions} KI-Coding-Session${s.aiSessions === 1 ? '' : 's'}** (${s.aiMessages} Nachrichten).`);
      if (s.aiPrompts.length) { lines.push('   Worum es ging:'); for (const x of s.aiPrompts.slice(0, 5)) lines.push(`   • ${q(truncate(x, 70))}`); }
      lines.push('');
    }
    lines.push(`Ein guter Tag. ${p.call}! – Dein ${p.name}`);
  } else {
    lines.push(`${p.emoji} Dear diary,`, '');
    lines.push(`${week ? 'this week was productive' : 'today was a productive day'}${span ? ` (${span})` : ''}! My human worked on ${projects.length} project${projects.length === 1 ? '' : 's'}${projects.length ? `: ${projList}` : ''}.`, '');
    if (s.commits.length) {
      lines.push(`📦 **${s.commits.length} commit${s.commits.length === 1 ? '' : 's'}**`);
      for (const c of s.commits.slice(0, 8)) lines.push(`   • ${fmtTime(c.ts)} – ${q(truncate(c.message, 60))} (${c.hash}, ${c.filesChanged} files)`);
      if (s.commits.length > 8) lines.push(`   • … and ${s.commits.length - 8} more`);
      lines.push('');
    }
    if (s.filesTouched.size) lines.push(`✍️ **${s.filesTouched.size} files** edited across ${s.fileBursts} writing bursts.`, '');
    if (s.aiSessions) {
      lines.push(`🤖 **${s.aiSessions} AI coding session${s.aiSessions === 1 ? '' : 's'}** (${s.aiMessages} messages).`);
      if (s.aiPrompts.length) { lines.push('   What it was about:'); for (const x of s.aiPrompts.slice(0, 5)) lines.push(`   • ${q(truncate(x, 70))}`); }
      lines.push('');
    }
    lines.push(`A good day. ${p.call}! — Your ${p.name}`);
  }
  return lines.join('\n');
}

// ---- optional Claude-API diary writer ----
function callClaude({ apiKey, model, prompt, system }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: 700,
      system: system || undefined,
      messages: [{ role: 'user', content: prompt }],
    });
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) return reject(new Error(json.error.message || 'API error'));
            const text = (json.content || []).map((b) => b.text || '').join('').trim();
            resolve(text || '');
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---- optional MiniMax-API diary writer (OpenAI-style chat completion) ----
function callMiniMax({ apiKey, model, prompt, system }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model || 'MiniMax-Text-01',
      messages: [
        { role: 'system', content: system || 'You are a cute desktop pet writing a warm developer diary.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 700,
      temperature: 0.85,
    });
    const req = https.request(
      {
        hostname: 'api.minimax.io',
        path: '/v1/text/chatcompletion_v2',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + apiKey,
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const br = json.base_resp || {};
            if (br.status_code && br.status_code !== 0) return reject(new Error('MiniMax ' + br.status_code + ': ' + br.status_msg));
            const text = ((json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '').trim();
            resolve(text || '');
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---- optional DeepSeek-API writer (OpenAI-compatible, very cheap) ----
// json=true forces a JSON object (used for the per-project headlines); json=false
// returns free-form prose (used for the daily/weekly diary report).
function callDeepSeek({ apiKey, model, prompt, system, json = true }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: system || (json ? 'You reply only as compact JSON.' : 'You are a cute desktop pet writing a warm developer diary.') },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
      temperature: json ? 0.3 : 0.8,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    });
    const req = https.request(
      {
        hostname: 'api.deepseek.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + apiKey,
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) return reject(new Error(json.error.message || 'DeepSeek API error'));
            const text = ((json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '').trim();
            resolve(text || '');
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function aiReport(events, creature, aiConfig, lang, period = 'day') {
  const L = langOf(lang);
  const p = persona(creature);
  const s = buildStats(events);
  const provider = (aiConfig && aiConfig.provider) || 'minimax';
  const apiKey =
    (aiConfig && aiConfig.apiKey) ||
    (provider === 'minimax' ? process.env.MINIMAX_API_KEY
      : provider === 'deepseek' ? process.env.DEEPSEEK_API_KEY
      : process.env.ANTHROPIC_API_KEY) ||
    '';
  if (!apiKey) throw new Error('no api key');

  const week = period === 'week';
  const facts = {
    projects: [...s.projects].slice(0, 10),
    timespan: s.first ? `${fmtTime(s.first)}–${fmtTime(s.last)}` : '',
    commits: s.commits.map((c) => ({ msg: c.message, files: c.filesChanged })),
    files_edited: s.filesTouched.size,
    ai_sessions: s.aiSessions,
    ai_topics: s.aiPrompts.slice(0, 10),
  };
  const system = L === 'de'
    ? 'Du bist ein süßes Desktop-Haustier, das ein warmherziges Entwickler-Tagebuch schreibt.'
    : 'You are a cute desktop pet writing a warm, playful developer diary.';
  const prompt = L === 'de'
    ? `Du bist „${p.name}", ein süßes Desktop-Haustier eines Programmierers. ` +
      (week
        ? `Schreibe einen WOCHENRÜCKBLICK (Deutsch, 1. Person, max. 260 Wörter) über die Coding-WOCHE deines Menschen: was lief, woran wurde gearbeitet, kleine Höhepunkte. `
        : `Schreibe einen kurzen, warmherzigen Tagebuch-Eintrag (Deutsch, 1. Person, max. 180 Wörter) über den Coding-TAG deines Menschen. `) +
      `Nutze ein paar passende Emojis, bleib konkret anhand der Fakten, erfinde nichts dazu. Beende mit einer kleinen Grußformel.\n\nFakten als JSON:\n${JSON.stringify(facts, null, 2)}`
    : `You are "${p.name}", a cute desktop pet belonging to a programmer. ` +
      (week
        ? `Write a WEEKLY recap (English, first person, max 260 words) of your human's coding WEEK: what happened, what they worked on, little highlights. `
        : `Write a short, warm diary entry (English, first person, max 180 words) about your human's coding DAY. `) +
      `Use a few fitting emojis, stay concrete based on the facts, don't make anything up. End with a little sign-off.\n\nFacts as JSON:\n${JSON.stringify(facts, null, 2)}`;

  const model = (aiConfig && aiConfig.model) ||
    (provider === 'minimax' ? 'MiniMax-Text-01' : provider === 'deepseek' ? 'deepseek-v4-flash' : 'claude-sonnet-4-6');
  const text =
    provider === 'minimax' ? await callMiniMax({ apiKey, model, prompt, system })
    : provider === 'deepseek' ? await callDeepSeek({ apiKey, model, prompt, system, json: false })
    : await callClaude({ apiKey, model, prompt, system });
  return text || localReport(events, creature, lang, period);
}

async function generate(events, creature, aiConfig, lang, period = 'day') {
  if (aiConfig && aiConfig.enabled) {
    const provider = aiConfig.provider || 'minimax';
    try {
      return { text: await aiReport(events, creature, aiConfig, lang, period), engine: provider, period };
    } catch (e) {
      return { text: localReport(events, creature, lang, period), engine: 'local', period, warning: e.message };
    }
  }
  return { text: localReport(events, creature, lang, period), engine: 'local', period };
}

// ---- per-project AI headline summaries (for the Activity "by project" view) ----
// Collect, per named project, the user's OWN intent signal (good prompts + commit
// messages), newest-first and deduped, so each project can be summarised into one line.
function projectIntents(events) {
  const map = new Map();
  for (const e of events) {
    const name = cleanName(e.project);
    if (!name) continue; // only named projects get an AI headline
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    let g = map.get(key);
    if (!g) { g = { key, name, items: [] }; map.set(key, g); }
    if (e.type === 'commit' && e.message) g.items.push({ t: e.message, ts: e.ts });
    else if (e.type === 'ai' && goodPrompt(e.prompt)) g.items.push({ t: e.prompt, ts: e.ts });
  }
  const out = [];
  for (const g of map.values()) {
    g.items.sort((a, b) => b.ts - a.ts);
    const seen = new Set(), intents = [];
    for (const it of g.items) {
      const k = it.t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
      if (!k || seen.has(k)) continue;
      seen.add(k); intents.push(it.t.slice(0, 180));
      if (intents.length >= 8) break;
    }
    if (intents.length) out.push({ key: g.key, name: g.name, intents });
  }
  return out;
}

function parseJsonMap(raw) {
  if (!raw) return {};
  let s = String(raw).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try {
    const o = JSON.parse(s); const out = {};
    for (const k of Object.keys(o)) if (typeof o[k] === 'string') out[k] = o[k].trim().replace(/^["'„]+|["'""]+$/g, '').slice(0, 90);
    return out;
  } catch { return {}; }
}

// aiConfig = { provider, apiKey, model } (already resolved by the caller). Batches all
// projects into ONE call. Returns { projectKey: "short past-tense headline" }.
async function summarize(projects, aiConfig, lang) {
  if (!aiConfig || !aiConfig.apiKey || !projects || !projects.length) return {};
  const L = langOf(lang);
  const payload = {};
  for (const p of projects) payload[p.key] = p.intents;
  const system = L === 'de'
    ? 'Du fasst Entwickler-Arbeit extrem knapp zusammen. Antworte ausschließlich als kompaktes JSON.'
    : 'You summarize developer work extremely concisely. Reply only as compact JSON.';
  const prompt = L === 'de'
    ? 'Unten die eigenen Nachrichten/Prompts eines Entwicklers pro Projekt (sein Text, neueste zuerst). '
      + 'Erzeuge für JEDES Projekt EINE knappe Überschrift, die zusammenfasst, WAS erledigt/bearbeitet wurde '
      + '(Deutsch, Ergebnis/Vergangenheit, max. 6 Wörter, kein Punkt, keine Anführungszeichen). '
      + 'Beispiele: Insel-Flackern gefixt; Pet-Animationen optimiert; Texturen verbessert. '
      + 'Antworte NUR als JSON-Objekt {projektKey: "Überschrift"}.\n\n' + JSON.stringify(payload)
    : 'Below are a developer\'s own messages/prompts per project (their text, newest first). '
      + 'For EACH project produce ONE concise headline summarizing WHAT was done '
      + '(English, result/past tense, max 6 words, no period, no quotes). '
      + 'Examples: Fixed island flicker; Optimized pet animations; Improved textures. '
      + 'Reply ONLY as a JSON object {projectKey: "headline"}.\n\n' + JSON.stringify(payload);
  const raw = aiConfig.provider === 'anthropic'
    ? await callClaude({ apiKey: aiConfig.apiKey, model: aiConfig.model || 'claude-haiku-4-5-20251001', prompt, system })
    : aiConfig.provider === 'deepseek'
      ? await callDeepSeek({ apiKey: aiConfig.apiKey, model: aiConfig.model || 'deepseek-v4-flash', prompt, system })
      : await callMiniMax({ apiKey: aiConfig.apiKey, model: aiConfig.model || 'MiniMax-Text-01', prompt, system });
  return parseJsonMap(raw);
}

module.exports = { reaction, generate, buildStats, persona, projectIntents, summarize };
