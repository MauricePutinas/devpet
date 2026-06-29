// Watches project folders for file changes using Node's built-in recursive fs.watch
// (supported on Windows & macOS). Debounces bursts into single "coding activity" events.
const fs = require('fs');
const path = require('path');

// Only real source/text files count as "coding". Everything else (temp, caches,
// app data, OS churn, binaries) is noise — especially when a broad folder like the
// home directory is watched. Whitelist by extension + block known noise folders.
const CODE_EXT = new Set((
  'js jsx ts tsx mjs cjs vue svelte py rb go rs java kt kts c h cpp hpp cc cs php ' +
  'swift dart scala sh bash zsh ps1 psm1 sql htm html css scss sass less ' +
  'json json5 yaml yml toml ini cfg conf env xml md mdx markdown txt rst tex ' +
  'r lua pl pm ex exs erl clj cljs edn gradle properties gd glsl wgsl hlsl shader ' +
  'astro prisma graphql gql proto ipynb'
).split(' '));
const NAME_OK = new Set(['makefile', 'dockerfile', '.gitignore', 'cmakelists.txt']);
const NOISE_DIR = new Set((
  'appdata temp tmp cache caches .cache cookies gpucache servicecache "code cache" ' +
  '"local storage" "session storage" indexeddb "service worker" "network" dist build out ' +
  '.next .nuxt .turbo coverage __pycache__ .venv venv node_modules .git .idea .vscode ' +
  'wsl docker onedrive packages webstorage sentry blob_storage logs bin obj target .gradle'
).match(/"[^"]+"|\S+/g).map((s) => s.replace(/"/g, '')));

function accept(rel) {
  const parts = rel.split(/[\\/]/);
  for (const p of parts) {
    const lp = p.toLowerCase();
    if (NOISE_DIR.has(lp) || lp.startsWith('codex-index') || lp.startsWith('etilqs_')) return false;
  }
  const base = parts[parts.length - 1].toLowerCase();
  if (NAME_OK.has(base)) return true;
  const dot = base.lastIndexOf('.');
  if (dot < 1) return false; // no extension (or dotfile) → not a tracked source file
  return CODE_EXT.has(base.slice(dot + 1));
}

class FileMonitor {
  constructor(folders, onEvent, { debounceMs = 4000 } = {}) {
    this.folders = folders;
    this.onEvent = onEvent;
    this.debounceMs = debounceMs;
    this.watchers = [];
    this.pending = new Map(); // project -> Set(files)
    this.timer = null;
  }

  start() {
    for (const folder of this.folders) {
      try {
        const watcher = fs.watch(folder, { recursive: true }, (_evt, filename) => {
          if (!filename) return;
          const rel = filename.toString();
          if (!accept(rel)) return;
          const project = path.basename(folder);
          if (!this.pending.has(project)) this.pending.set(project, new Set());
          this.pending.get(project).add(rel);
          this.schedule();
        });
        watcher.on('error', () => {});
        this.watchers.push(watcher);
      } catch (e) {
        console.error('fs.watch failed for', folder, e.message);
      }
    }
  }

  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  flush() {
    this.timer = null;
    for (const [project, files] of this.pending) {
      const list = [...files];
      this.onEvent({
        type: 'files',
        source: 'files',
        project,
        count: list.length,
        files: list.slice(0, 12),
        ts: Date.now(),
      });
    }
    this.pending.clear();
  }

  stop() {
    for (const w of this.watchers) {
      try { w.close(); } catch {}
    }
    this.watchers = [];
    if (this.timer) clearTimeout(this.timer);
  }
}

module.exports = { FileMonitor };
