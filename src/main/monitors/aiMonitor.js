// Detects AI coding-session activity across multiple AI tools by watching each
// tool's session logs. A "provider" = { dir, match, parse } so new tools are easy
// to add. Currently: Claude Code (~/.claude/projects/**/*.jsonl), Codex
// (~/.codex/sessions/**/rollout-*.jsonl), and Hermes (sqlite store — activity only).
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');

function prettyProject(dirName) {
  // Claude encodes the project's absolute path using '-' as the separator.
  let s = dirName.replace(/^[A-Za-z]--/, '');
  s = s.replace(/^Users-[^-]+-/, '').replace(/^Desktop-/, '');
  return s || dirName;
}

function readSlice(file, from, to) {
  try {
    const fd = fs.openSync(file, 'r');
    const len = Math.max(0, to - from);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, from);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch { return ''; }
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === 'string' ? p : (p && (p.text || p.input_text)) || '')).join(' ');
  return '';
}

// ---- per-tool chunk parsers → { lastUser, toolUses, messages, cwd } ----
function parseClaude(chunk) {
  let lastUser = '', toolUses = 0, messages = 0, cwd = '';
  for (const line of chunk.split('\n')) {
    if (!line) continue;
    let obj; try { obj = JSON.parse(line); } catch { continue; }
    messages++;
    if (obj.cwd) cwd = obj.cwd;
    const msg = obj.message || obj;
    if (obj.type === 'user' && msg && msg.content) { const t = extractText(msg.content).trim(); if (t && !t.startsWith('<')) lastUser = t; }
    if (obj.type === 'assistant' && msg && Array.isArray(msg.content)) toolUses += msg.content.filter((p) => p && p.type === 'tool_use').length;
  }
  return { lastUser, toolUses, messages, cwd };
}
function parseCodex(chunk) {
  let lastUser = '', toolUses = 0, messages = 0, cwd = '';
  for (const line of chunk.split('\n')) {
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const p = o.payload || o;
    const t = o.type || p.type;
    if (t === 'session_meta' && p.cwd) cwd = p.cwd;
    if (t === 'response_item') {
      messages++;
      if (p.role === 'user') { const txt = extractText(p.content).trim(); if (txt && !txt.startsWith('<')) lastUser = txt; }
      if (p.role === 'assistant' && Array.isArray(p.content)) toolUses += p.content.filter((c) => c && /call$|tool_use/.test(c.type || '')).length;
    } else if (t === 'function_call' || t === 'local_shell_call' || (p && /call$/.test(p.type || ''))) toolUses++;
  }
  return { lastUser, toolUses, messages, cwd };
}
function growthOnly() { return { lastUser: '', toolUses: 0, messages: 1, cwd: '' }; } // sqlite-backed: just register activity

function buildProviders(claudeDir) {
  return [
    {
      name: 'claude', label: 'Claude Code', recursive: true, read: true,
      dir: claudeDir || path.join(HOME, '.claude', 'projects'),
      match: (f) => f.endsWith('.jsonl'), parse: parseClaude,
      project: (file, cwd) => (cwd ? path.basename(cwd) : prettyProject(path.basename(path.dirname(file)))),
    },
    {
      name: 'codex', label: 'Codex', recursive: true, read: true,
      dir: path.join(HOME, '.codex', 'sessions'),
      match: (f) => /rollout-.*\.jsonl$/i.test(f), parse: parseCodex,
      project: (file, cwd) => (cwd ? path.basename(cwd) : ''),
    },
    {
      name: 'hermes', label: 'Hermes', recursive: false, read: false,
      dir: path.join(LOCALAPPDATA, 'hermes'),
      match: (f) => /(?:^|[\\/])(?:state|memory_store)\.db$/i.test(f), parse: growthOnly,
      project: () => 'Hermes',
    },
  ];
}

class AIMonitor {
  constructor(onEvent, { claudeDir, debounceMs = 5000, minGapMs = 90000 } = {}) {
    this.onEvent = onEvent;
    this.debounceMs = debounceMs;
    this.minGapMs = minGapMs; // a long session keeps appending — emit at most one event per file per gap
    this.providers = buildProviders(claudeDir);
    this.sizes = new Map();
    this.lastEmit = new Map();
    this.watchers = [];
    this.pending = new Map(); // file -> provider
    this.timer = null;
  }

  start() {
    for (const prov of this.providers) {
      if (!fs.existsSync(prov.dir)) continue;
      this.seed(prov);
      try {
        const watcher = fs.watch(prov.dir, { recursive: prov.recursive }, (_evt, filename) => {
          if (!filename) return;
          const fn = filename.toString();
          if (!prov.match(fn)) return;
          const file = path.join(prov.dir, fn);
          if (!this.pending.has(file)) { this.sizes.set(file, this.sizes.get(file) || 0); this.pending.set(file, prov); }
          this.schedule();
        });
        watcher.on('error', () => {});
        this.watchers.push(watcher);
      } catch (e) { console.error('AI watch failed', prov.name, e.message); }
    }
  }

  seed(prov) {
    const walk = (dir, depth) => {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (prov.recursive && depth < 6) walk(full, depth + 1); }
        else if (prov.match(e.name)) { try { this.sizes.set(full, fs.statSync(full).size); } catch {} }
      }
    };
    walk(prov.dir, 0);
  }

  schedule() { if (this.timer) return; this.timer = setTimeout(() => this.flush(), this.debounceMs); }

  flush() {
    this.timer = null;
    const now = Date.now();
    for (const [file, prov] of this.pending) {
      let size = 0;
      try { size = fs.statSync(file).size; } catch { continue; }
      const oldSize = this.sizes.get(file) || 0;
      if (size <= oldSize) { this.sizes.set(file, size); continue; }
      this.sizes.set(file, size);
      if (now - (this.lastEmit.get(file) || 0) < this.minGapMs) continue; // throttle a continuous session
      let parsed;
      if (prov.read) { parsed = prov.parse(readSlice(file, oldSize, size)); if (!parsed.messages) continue; }
      else parsed = prov.parse();
      this.lastEmit.set(file, now);
      this.onEvent({
        type: 'ai', source: 'ai', tool: prov.label,
        project: prov.project(file, parsed.cwd) || prov.label,
        prompt: parsed.lastUser ? parsed.lastUser.slice(0, 140) : '',
        toolUses: parsed.toolUses, messages: parsed.messages, ts: now,
      });
    }
    this.pending.clear();
  }

  stop() {
    for (const w of this.watchers) { try { w.close(); } catch {} }
    this.watchers = [];
    if (this.timer) clearTimeout(this.timer);
  }
}

module.exports = { AIMonitor };
