// Tiny read-only HTTP server (Node's built-in `http`, no new dependency) so a phone on
// the SAME WiFi can check on the pet — level, streak, coins, focus countdown, last
// reaction line. Token-gated so randoms on a shared/office network can't just guess the
// URL; nothing here ever accepts writes, and it never leaves the local network.
const http = require('http');
const os = require('os');
const { URL } = require('url');

const PORT = 4827;

function localIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>DevPet</title>
<style>
  :root{ --bg:#0a0b11; --glass:rgba(255,255,255,.06); --glass-brd:rgba(255,255,255,.10);
    --text:#eef0f7; --text-soft:#a4a9ba; --text-dim:#6f7689;
    --grad:linear-gradient(135deg,#8b7cff 0%,#6a8bff 45%,#34e0c4 100%);
    --grad-warm:linear-gradient(90deg,#ffb24d,#ffc465 60%,#ffe1a6); }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;background:var(--bg);color:var(--text);font-family:-apple-system,'Segoe UI',system-ui,sans-serif}
  body{
    display:flex;align-items:center;justify-content:center;padding:20px;
    background-image:
      radial-gradient(480px 360px at 15% -8%, rgba(139,124,255,.28), transparent 60%),
      radial-gradient(420px 360px at 105% 8%, rgba(52,224,196,.20), transparent 58%);
  }
  .card{width:100%;max-width:380px;border-radius:28px;padding:28px 24px;text-align:center;
    background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.015));
    border:1px solid var(--glass-brd)}
  .avatar{font-size:76px;line-height:1;margin-bottom:8px;filter:drop-shadow(0 10px 20px rgba(139,124,255,.4))}
  .name{font-size:22px;font-weight:800}
  .level{margin-top:6px;display:inline-flex;font-size:13px;font-weight:800;color:#2c2118;
    background:var(--grad-warm);padding:4px 12px;border-radius:99px}
  .xpbar{height:8px;border-radius:99px;background:rgba(255,255,255,.08);margin:14px 0;overflow:hidden}
  .xpfill{height:100%;width:0%;background:var(--grad);border-radius:99px;transition:width .4s}
  .stats{display:flex;gap:12px;margin-bottom:14px}
  .stat{flex:1;padding:14px 8px;border-radius:16px;background:var(--glass);border:1px solid var(--glass-brd)}
  .stat .n{font-size:26px;font-weight:800}
  .stat .l{font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.6px;margin-top:2px}
  .focus{display:inline-flex;gap:6px;font-weight:800;font-size:14px;padding:8px 16px;border-radius:99px;
    background:var(--grad);color:#0a0b11;margin-bottom:14px}
  .focus.hidden{display:none}
  .line{font-size:13.5px;color:var(--text-soft);font-style:italic;line-height:1.5;min-height:20px}
  .updated{margin-top:16px;font-size:10.5px;color:var(--text-dim)}
  .err{color:#ff7a90;font-size:13px;margin-top:10px}
</style>
</head>
<body>
  <div class="card">
    <div class="avatar" id="avatar">🐶</div>
    <div class="name" id="name">DevPet</div>
    <div><span class="level" id="level">⭐ Level 1</span></div>
    <div class="xpbar"><div class="xpfill" id="xpfill"></div></div>
    <div class="stats">
      <div class="stat"><div class="n" id="streak">0</div><div class="l">🔥 Streak</div></div>
      <div class="stat"><div class="n" id="coins">0</div><div class="l">🪙 Coins</div></div>
    </div>
    <div class="focus hidden" id="focusBox">🎯 <span id="focusTime">--:--</span></div>
    <div class="line" id="line">…</div>
    <div class="updated" id="updated"></div>
    <div class="err" id="err" hidden></div>
  </div>
<script>
async function refresh() {
  try {
    const t = new URLSearchParams(location.search).get('t') || '';
    const res = await fetch('/status?t=' + encodeURIComponent(t));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    document.getElementById('avatar').textContent = d.emoji || '🐶';
    document.getElementById('name').textContent = d.name || 'DevPet';
    document.getElementById('level').textContent = '⭐ Level ' + (d.level || 1);
    document.getElementById('xpfill').style.width = Math.round((d.xpPct || 0) * 100) + '%';
    document.getElementById('streak').textContent = d.streak || 0;
    document.getElementById('coins').textContent = d.coins || 0;
    const fb = document.getElementById('focusBox');
    if (d.focusRemainingMs != null) {
      fb.classList.remove('hidden');
      const s = Math.max(0, Math.round(d.focusRemainingMs / 1000));
      document.getElementById('focusTime').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    } else fb.classList.add('hidden');
    document.getElementById('line').textContent = d.lastLine || '';
    document.getElementById('updated').textContent = new Date().toLocaleTimeString();
    document.getElementById('err').hidden = true;
  } catch (e) {
    document.getElementById('err').hidden = false;
    document.getElementById('err').textContent = 'Not reachable — same WiFi as your PC?';
  }
}
refresh();
setInterval(refresh, 20000);
</script>
</body>
</html>`;

class LanServer {
  constructor(getToken, getStatus) {
    this.getToken = getToken; // () => string
    this.getStatus = getStatus; // () => plain JSON-serializable object
    this.server = null;
  }

  start() {
    if (this.server) return;
    this.server = http.createServer((req, res) => this._handle(req, res));
    this.server.on('error', (e) => console.error('lan server error', e.message));
    this.server.listen(PORT, '0.0.0.0');
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  isRunning() {
    return !!this.server;
  }

  _handle(req, res) {
    let url;
    try {
      url = new URL(req.url, `http://localhost:${PORT}`);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }
    const token = url.searchParams.get('t');
    if (!token || token !== this.getToken()) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('Forbidden');
      return;
    }
    if (url.pathname === '/status') {
      let body;
      try {
        body = JSON.stringify(this.getStatus());
      } catch {
        res.writeHead(500).end('{}');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(body);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE);
  }
}

module.exports = { LanServer, localIPs, PORT };
