// Stores activity events on disk, one JSON file per day.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DIR = path.join(app.getPath('userData'), 'diary');

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fileFor(key) {
  return path.join(DIR, `${key}.json`);
}

function ensure() {
  fs.mkdirSync(DIR, { recursive: true });
}

function readDay(key) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(key), 'utf8'));
  } catch {
    return { date: key, events: [], report: null };
  }
}

function writeDay(key, data) {
  ensure();
  fs.writeFileSync(fileFor(key), JSON.stringify(data, null, 2));
}

function add(event) {
  const key = dayKey(event.ts || Date.now());
  const day = readDay(key);
  day.events.push(event);
  day.report = null; // invalidate cached report
  writeDay(key, day);
  return day;
}

function getDay(key = dayKey()) {
  return readDay(key);
}

function saveReport(key, report) {
  const day = readDay(key);
  day.report = report;
  writeDay(key, day);
}

// per-project AI headline cache: { projectKey: { h: contentHash, t: text } }
function saveSummaries(key, summaries) {
  const day = readDay(key);
  day.activitySummaries = summaries;
  writeDay(key, day);
}

function listDates() {
  ensure();
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort()
    .reverse();
}

module.exports = { add, getDay, saveReport, saveSummaries, listDates, dayKey, DIR };
