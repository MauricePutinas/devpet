#!/usr/bin/env node
/**
 * Auto-changelog generator (zero dependencies, pure Node).
 *
 * Reads `git log`, groups commits by date (newest first), and rewrites the block
 * between the <!-- CHANGELOG:START --> and <!-- CHANGELOG:END --> markers in every
 * README that contains them (README.md + README.de.md).
 *
 * Run automatically by .github/workflows/changelog.yml on every push,
 * and runnable locally:  `node scripts/gen-changelog.js`
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['README.md', 'README.de.md']; // every file that may contain the markers
const START = '<!-- CHANGELOG:START -->';
const END = '<!-- CHANGELOG:END -->';
const MAX = 250; // most recent commits to include

// Conventional-commit prefix → emoji (purely cosmetic; unknown types get a bullet)
const TYPES = [
  [/^feat(\(.+?\))?!?:\s*/i, '✨'],
  [/^fix(\(.+?\))?!?:\s*/i, '🐛'],
  [/^docs(\(.+?\))?!?:\s*/i, '📝'],
  [/^style(\(.+?\))?!?:\s*/i, '💄'],
  [/^refactor(\(.+?\))?!?:\s*/i, '♻️'],
  [/^perf(\(.+?\))?!?:\s*/i, '⚡'],
  [/^test(\(.+?\))?!?:\s*/i, '✅'],
  [/^build(\(.+?\))?!?:\s*/i, '📦'],
  [/^ci(\(.+?\))?!?:\s*/i, '🤖'],
  [/^chore(\(.+?\))?!?:\s*/i, '🔧'],
];
function emojiFor(subject) {
  for (const [re, e] of TYPES) if (re.test(subject)) return e;
  return '•';
}

// Make a commit subject safe to embed in Markdown. This neutralises BOTH:
//  - HTML/script injection (a subject like `x --><img src=x onerror=...>`), and
//  - changelog-marker injection (a subject literally containing the END marker,
//    which would otherwise corrupt the file on the next run).
// Escaping < > also means the literal "<!-- CHANGELOG:END -->" can never appear
// in generated output, so the marker can never be forged from a commit message.
function sanitize(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`/g, '&#96;') // keep backticks from breaking the inline-code hash
    .trim();
}

function gitLog() {
  // Let errors propagate — a genuine git failure must NOT be mistaken for an
  // empty repo (that would overwrite a good changelog with the placeholder).
  const out = execFileSync(
    'git',
    ['log', '--no-merges', '--date=short', '--pretty=format:%ad%x1f%h%x1f%s', '-n', String(MAX)],
    { encoding: 'utf8' }
  );
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [date, hash, ...rest] = line.split('\x1f');
      return { date, hash, subject: rest.join('\x1f') };
    });
}

function buildChangelog(commits) {
  if (!commits.length) return '_No commits yet — the changelog fills in on the first push._';

  const byDate = new Map(); // insertion order = newest first (git log default)
  for (const c of commits) {
    if (!byDate.has(c.date)) byDate.set(c.date, []);
    byDate.get(c.date).push(c);
  }

  const out = [];
  for (const [date, list] of byDate) {
    out.push(`### ${date}`, '');
    for (const c of list) {
      const clean = c.subject.replace(/\s*\[skip ci\]\s*$/i, '');
      out.push(`- ${emojiFor(clean)} ${sanitize(clean)} \`${c.hash}\``);
    }
    out.push('');
  }
  return out.join('\n').trim();
}

// Replace the marker block by slicing on the FIRST start and the LAST end
// (robust against any stray marker-looking text elsewhere in the file).
function writeInto(file, body) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return false;
  const md = fs.readFileSync(p, 'utf8');
  const s = md.indexOf(START);
  const e = md.lastIndexOf(END);
  if (s === -1 || e === -1 || e < s) {
    console.warn(`! ${file}: changelog markers missing or malformed — skipped`);
    return false;
  }
  const block = `${START}\n\n${body}\n\n${END}`;
  const next = md.slice(0, s) + block + md.slice(e + END.length);
  fs.writeFileSync(p, next);
  console.log(`✓ ${file} — changelog updated`);
  return true;
}

function main() {
  let commits;
  try {
    commits = gitLog();
  } catch (err) {
    console.error('git log failed — leaving READMEs unchanged:', err.message);
    process.exit(0); // never clobber a good changelog on a transient git error
  }
  const body = buildChangelog(commits);
  let any = false;
  for (const f of FILES) any = writeInto(f, body) || any;
  if (!any) {
    console.error('No README with changelog markers found.');
    process.exit(1);
  }
}

main();
