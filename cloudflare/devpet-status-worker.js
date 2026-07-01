// DevPet cloud status relay — deploy this as a Cloudflare Worker named "devpet-status".
//
// What it does: stores ONE small JSON blob (level, streak, coins, focus countdown,
// last reaction line) that the desktop app pushes every ~2 minutes, and serves it back
// to a mobile page so you can check on your pet from anywhere. Never sees diary text,
// macro content, or keystrokes — only the same handful of numbers already shown in the
// tray tooltip.
//
// Setup (Cloudflare dashboard, no CLI needed):
//   1. Workers & Pages → Create → "Create Worker" → name it "devpet-status" → paste this
//      file's content into the editor, replacing the default code → Deploy.
//   2. Settings → Variables → KV Namespace Bindings → Add binding:
//        Variable name: DEVPET_STATUS   →   KV namespace: DEVPET_STATUS (already created)
//   3. Settings → Variables → Environment Variables → add two SECRETS (click "Encrypt"):
//        PUSH_TOKEN = <the push token shown in DevPet's diary "Cloud companion" card>
//        VIEW_TOKEN = <the view token shown in the same card>
//   4. Copy the Worker's URL (looks like https://devpet-status.<your-subdomain>.workers.dev)
//      and paste it into DevPet's diary "Cloud companion" card.
//
// That's it — DevPet starts pushing, and the URL shown in that same card
// (…/?t=<viewToken>) is what you open on your phone, from anywhere.

const PAGE_HEAD = `<!doctype html>
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
  body{display:flex;align-items:center;justify-content:center;padding:20px;
    background-image:radial-gradient(480px 360px at 15% -8%, rgba(139,124,255,.28), transparent 60%),
      radial-gradient(420px 360px at 105% 8%, rgba(52,224,196,.20), transparent 58%);}
  .card{width:100%;max-width:380px;border-radius:28px;padding:28px 24px;text-align:center;
    background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.015));border:1px solid var(--glass-brd)}
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
    const ageMin = d.ts ? Math.round((Date.now() - d.ts) / 60000) : null;
    document.getElementById('updated').textContent = ageMin != null ? ('updated ' + ageMin + 'm ago') : '';
    document.getElementById('err').hidden = true;
  } catch (e) {
    document.getElementById('err').hidden = false;
    document.getElementById('err').textContent = 'Not reachable right now.';
  }
}
refresh();
setInterval(refresh, 30000);
</script>
</body>
</html>`;

const STATUS_KEY = 'status';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const token = url.searchParams.get('t') || '';

    // desktop app → worker: store the latest snapshot
    if (url.pathname === '/push' && request.method === 'PUT') {
      if (token !== env.PUSH_TOKEN) return new Response('Forbidden', { status: 403 });
      let body;
      try { body = await request.text(); } catch { return new Response('Bad request', { status: 400 }); }
      if (body.length > 4096) return new Response('Payload too large', { status: 413 }); // it's a handful of numbers, never more
      await env.DEVPET_STATUS.put(STATUS_KEY, body, { expirationTtl: 3600 }); // stale after 1h with the app closed
      return new Response('OK');
    }

    // phone → worker: read the latest snapshot
    if (url.pathname === '/status') {
      if (token !== env.VIEW_TOKEN) return new Response('Forbidden', { status: 403 });
      const data = (await env.DEVPET_STATUS.get(STATUS_KEY)) || '{}';
      return new Response(data, { headers: { 'content-type': 'application/json; charset=utf-8' } });
    }

    // phone → worker: the mobile page itself
    if (token !== env.VIEW_TOKEN) return new Response('Forbidden', { status: 403 });
    return new Response(PAGE_HEAD, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  },
};
