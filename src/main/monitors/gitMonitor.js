// Watches one or more git repos for new commits and working-tree changes.
// Uses the `git` CLI (no extra dependency). Polls on an interval.
const { execFile } = require('child_process');
const path = require('path');

function git(repo, args) {
  return new Promise((resolve) => {
    execFile('git', ['-C', repo, ...args], { windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(stdout.toString());
    });
  });
}

class GitMonitor {
  constructor(repos, onEvent, { intervalMs = 8000 } = {}) {
    this.repos = repos;
    this.onEvent = onEvent;
    this.intervalMs = intervalMs;
    this.lastCommit = new Map(); // repo -> hash
    this.timer = null;
  }

  async start() {
    // Seed: remember current HEAD so we only report *new* commits.
    for (const repo of this.repos) {
      const head = await git(repo, ['rev-parse', 'HEAD']);
      if (head) this.lastCommit.set(repo, head.trim());
    }
    this.timer = setInterval(() => this.tick().catch(() => {}), this.intervalMs);
  }

  async tick() {
    for (const repo of this.repos) {
      const isRepo = await git(repo, ['rev-parse', '--is-inside-work-tree']);
      if (!isRepo) continue;

      const headOut = await git(repo, ['rev-parse', 'HEAD']);
      const head = headOut && headOut.trim();
      const prev = this.lastCommit.get(repo);

      if (head && head !== prev) {
        // List commits between prev and head (newest first).
        const range = prev ? `${prev}..${head}` : '-1';
        const log = await git(repo, [
          'log',
          prev ? range : '-1',
          '--pretty=%H%x1f%s%x1f%an%x1f%ad',
          '--date=iso',
        ]);
        const lines = (log || '').split('\n').filter(Boolean);
        for (const line of lines.reverse()) {
          const [hash, subject, author, date] = line.split('\x1f');
          const stat = await git(repo, ['show', '--stat', '--oneline', '--format=', hash]);
          const filesChanged = stat ? stat.split('\n').filter((l) => l.includes('|')).length : 0;
          this.onEvent({
            type: 'commit',
            source: 'git',
            project: path.basename(repo),
            repo,
            message: subject,
            hash: hash.slice(0, 7),
            author,
            filesChanged,
            ts: Date.now(),
          });
        }
        this.lastCommit.set(repo, head);
      }
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { GitMonitor };
