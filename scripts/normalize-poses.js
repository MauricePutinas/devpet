// Post-process normalizer: makes ALL pose clips of a creature render at the
// SAME apparent size, on ONE shared canvas, floor-anchored — regardless of how
// the source I2V / pipeline scaled each clip. Operates on the FINISHED WebMs
// (no re-keying, no re-render needed): decode (libvpx-vp9 keeps the alpha) →
// measure a robust per-pose scale → re-composite every frame onto a common
// canvas → re-encode VP9/alpha.
//
//   node scripts/normalize-poses.js <id> [--ref anim] [--target N]
//                                        [--scale pose=F,pose=F] [--qa]
//
// --scale lets you hand-tune a pose after eyeballing the QA contact sheet
// (auto head-width measuring is only the starting point — always verify visually).
const Jimp = require('jimp');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ID = process.argv[2];
if (!ID) { console.error('usage: normalize-poses.js <id> [--ref anim] [--target N] [--scale p=F,..] [--qa]'); process.exit(1); }
const ARG = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const HAS = (k) => process.argv.includes(k);
const REF_POSE = ARG('--ref', 'anim');
const TARGET = ARG('--target', null) ? Number(ARG('--target', null)) : null;
const DRY = HAS('--dry');            // only build the QA sheet, skip the slow re-encode
const QA = HAS('--qa') || DRY;
const OVERRIDE = {};
(ARG('--scale', '') || '').split(',').filter(Boolean).forEach((kv) => { const [p, f] = kv.split('='); OVERRIDE[p] = Number(f); });
// poses listed here get PER-FRAME stabilisation: each frame is rescaled so the
// creature stays the SAME size through the whole clip (kills the I2V "grows from
// small to big over 6s" zoom). Use for idle/look-type clips, NOT jumps.
const PERFRAME = new Set((ARG('--perframe', '') || '').split(',').filter(Boolean));
// like --perframe but keeps vertical motion: removes the in-clip SCALE zoom only
// (width-based, constant floor anchor) so a jump/stand-up clip stays the same SIZE
// while still jumping. Use for happy/standup; --perframe would flatten the jump.
const PFSCALE = new Set((ARG('--pfscale', '') || '').split(',').filter(Boolean));

const DIR = path.join('assets', 'creatures', ID);
// Always normalize from the pristine backup so re-runs are idempotent (never
// normalize an already-normalized clip — that compounds the scaling).
const BK = path.join('assets', '_webm_backup', ID);
const SRC = fs.existsSync(BK) ? BK : DIR;
const TMP = path.join(DIR, `_normtmp`);
const POSE_ORDER = ['anim', 'look', 'sleep', 'standup', 'happy', 'code', 'grab', 'sig', 'walk', 'alert'];
const ALPHA = 30;       // alpha threshold for "opaque"
const PAD_X = 12, PAD_TOP = 12, FLOOR_MARGIN = 10; // canvas padding (px)
const SCALE_MIN = 0.55, SCALE_MAX = 1.45; // limit upscaling (blur) of badly-small source clips

function sh(cmd, args) { return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); }
function fps(webm) {
  try { const r = sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', webm]).toString().trim();
    const [n, d] = r.split('/').map(Number); return d ? n / d : (n || 24); } catch { return 24; }
}
function decode(webm, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  sh('ffmpeg', ['-y', '-v', 'error', '-c:v', 'libvpx-vp9', '-i', webm, '-pix_fmt', 'rgba', path.join(outDir, 'f_%05d.png')]);
  return fs.readdirSync(outDir).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(outDir, f));
}

// measure subject bbox + head width on one frame
function measure(img) {
  const { width: W, height: H, data } = img.bitmap;
  let minX = W, maxX = -1, minY = H, maxY = -1, op = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(W * y + x) * 4 + 3] > ALPHA) { op++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (op < 50) return null;
  // head width = widest contiguous opaque run within the top 28% of the subject
  const headBot = minY + Math.round((maxY - minY) * 0.28);
  let hw = 0;
  for (let y = minY; y <= headBot; y++) { let run = 0, best = 0; for (let x = 0; x < W; x++) { if (data[(W * y + x) * 4 + 3] > ALPHA) { run++; if (run > best) best = run; } else run = 0; } if (best > hw) hw = best; }
  return { minX, maxX, minY, maxY, hw, cx: (minX + maxX) / 2 };
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : 0; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function smooth(arr, win) { // centered moving average (removes per-frame measurement jitter)
  const h = Math.floor(win / 2), out = [];
  for (let i = 0; i < arr.length; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - h); j <= Math.min(arr.length - 1, i + h); j++) { s += arr[j]; n++; } out.push(s / n); }
  return out;
}
// drop up to 3 leading/trailing frames whose subject width is a big outlier — these
// are usually anomalous I2V intro/outro frames that scaling can't fix and cause a "pop".
function trimOutliers(meas) {
  if (meas.length < 10) return meas;
  const medW = median(meas.map((m) => m.maxX - m.minX));
  const bad = (m) => Math.abs((m.maxX - m.minX) - medW) / medW > 0.2;
  let lo = 0, hi = meas.length - 1;
  while (lo < 3 && bad(meas[lo])) lo++;
  while (meas.length - 1 - hi < 3 && bad(meas[hi])) hi--;
  return meas.slice(lo, hi + 1);
}

async function run() {
  const poses = POSE_ORDER.filter((p) => fs.existsSync(path.join(SRC, `${p}.webm`)));
  if (!poses.length) { console.error('no pose webms for', ID); process.exit(1); }
  console.log(`[${ID}] normalizing poses: ${poses.join(', ')}  (source: ${SRC})`);

  const D = {};
  for (const pose of poses) {
    const webm = path.join(SRC, `${pose}.webm`);
    const frames = decode(webm, path.join(TMP, pose));
    let meas = [];
    for (const f of frames) { const img = await Jimp.read(f); const mm = measure(img); if (mm) meas.push({ f, W: img.bitmap.width, H: img.bitmap.height, ...mm }); }
    if (!meas.length) { console.log(`  ${pose}: EMPTY, skipping`); continue; }
    meas = trimOutliers(meas); // drop glitch intro/outro frames
    const hws = meas.map((m) => m.hw);
    D[pose] = {
      frames, fps: fps(webm),
      hw: median(hws),                          // robust scale signal
      floorRef: pct(meas.map((m) => m.maxY), 0.8), // robust ground contact (ignore outlier dips)
      cx: median(meas.map((m) => m.cx)),
      meas,
    };
    const wob = Math.round(100 * (Math.max(...hws) - Math.min(...hws)) / Math.max(1, median(hws)));
    console.log(`  ${pose}: frames=${frames.length} medHeadW=${Math.round(D[pose].hw)} floorRef=${D[pose].floorRef} cx=${Math.round(D[pose].cx)} inClipWobble=${wob}%`);
  }

  // 2) per-pose scale: bring every pose's head width to the reference's
  const ref = D[REF_POSE] || D[poses[0]];
  const target = TARGET || ref.hw;
  for (const p of Object.keys(D)) {
    const raw = target / D[p].hw;
    const poseScale = OVERRIDE[p] != null ? OVERRIDE[p] : clamp(raw, SCALE_MIN, SCALE_MAX);
    D[p].scale = poseScale;
    D[p].rawScale = raw;
    if (PERFRAME.has(p)) {
      // stabilise: rescale each frame to the clip's median subject height so the
      // creature never grows/shrinks during the clip; keep gesture + match anim via poseScale.
      const heights = D[p].meas.map((m) => m.maxY - m.minY);
      const medH = median(heights);
      const sH = smooth(heights, 7);
      D[p].sArr = sH.map((h) => poseScale * clamp(medH / h, 0.6, 1.6));
      D[p].scxArr = smooth(D[p].meas.map((m) => m.cx), 7);
      D[p].sflArr = smooth(D[p].meas.map((m) => m.maxY), 7);
      D[p].wob = Math.round(100 * (Math.max(...heights) - Math.min(...heights)) / Math.max(1, medH));
    } else if (PFSCALE.has(p)) {
      // remove SCALE zoom but keep the jump: width-based per-frame scale, CONSTANT
      // floor anchor (so grounded frames sit on the floor and jump frames rise above).
      const widths = D[p].meas.map((m) => m.maxX - m.minX);
      const medW = median(widths);
      const sW = smooth(widths, 7);
      D[p].sArr = sW.map((w) => poseScale * clamp(medW / w, 0.6, 1.6));
      D[p].scxArr = smooth(D[p].meas.map((m) => m.cx), 7);
      D[p].sflArr = D[p].meas.map(() => D[p].floorRef); // constant floor → jump preserved
      D[p].wob = Math.round(100 * (Math.max(...widths) - Math.min(...widths)) / Math.max(1, medW));
      D[p].pfs = true;
    }
    if (D[p].sArr) { // keep every frame's scale near the pose median → no single-frame "pop" (e.g. anomalous I2V intro frame)
      const medS = median(D[p].sArr);
      D[p].sArr = D[p].sArr.map((s) => clamp(s, medS * 0.78, medS * 1.28));
    }
  }
  // per-frame params for pose p at frame i (constant unless that pose is stabilised)
  const fp = (p, i) => D[p].sArr ? { s: D[p].sArr[i], cx: D[p].scxArr[i], fl: D[p].sflArr[i] } : { s: D[p].scale, cx: D[p].cx, fl: D[p].floorRef };
  console.log(`  target headW=${Math.round(target)} (ref=${REF_POSE})`);
  for (const p of Object.keys(D)) {
    const capped = OVERRIDE[p] == null && Math.abs(D[p].scale - D[p].rawScale) > 0.01 ? `  ⚠ capped from ${D[p].rawScale.toFixed(2)} (bad source clip)` : '';
    const pf = D[p].sArr ? (D[p].pfs ? `  🤸 scale-zoom removed, jump kept (was ${D[p].wob}%)` : `  🎞 per-frame stabilised (in-clip zoom ${D[p].wob}% → removed)`) : '';
    console.log(`    ${p.padEnd(8)} scale=${D[p].scale.toFixed(3)}${OVERRIDE[p] != null ? ' (manual)' : ''}${capped}${pf}`);
  }

  // 3) common canvas that fits every scaled pose, floor-anchored & centered
  let maxLeft = 0, maxRight = 0, maxTop = 0;
  for (const p of Object.keys(D)) {
    D[p].meas.forEach((m, i) => {
      const { s, cx, fl } = fp(p, i);
      maxLeft = Math.max(maxLeft, (cx - m.minX) * s);
      maxRight = Math.max(maxRight, (m.maxX - cx) * s);
      maxTop = Math.max(maxTop, (fl - m.minY) * s);
    });
  }
  const even = (n) => { n = Math.ceil(n); return n % 2 ? n + 1 : n; };
  const CW = even(2 * Math.max(maxLeft, maxRight) + 2 * PAD_X);
  const CH = even(maxTop + PAD_TOP + FLOOR_MARGIN);
  const FLOOR_Y = CH - FLOOR_MARGIN;
  console.log(`  canvas=${CW}x${CH} floorY=${FLOOR_Y}`);

  // 4) composite every frame onto the canvas, re-encode each pose (skipped in --dry)
  for (const p of (DRY ? [] : Object.keys(D))) {
    const outDir = path.join(TMP, `${p}_out`); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
    let idx = 0;
    for (let i = 0; i < D[p].meas.length; i++) {
      const m = D[p].meas[i];
      const { s, cx, fl } = fp(p, i);
      const img = await Jimp.read(m.f);
      if (Math.abs(s - 1) > 0.002) img.resize(Math.max(1, Math.round(m.W * s)), Math.max(1, Math.round(m.H * s)), Jimp.RESIZE_BICUBIC);
      const canvas = new Jimp(CW, CH, 0x00000000);
      canvas.composite(img, Math.round(CW / 2 - cx * s), Math.round(FLOOR_Y - fl * s));
      await canvas.writeAsync(path.join(outDir, `f_${String(idx++).padStart(5, '0')}.png`));
    }
    const out = path.join(DIR, `${p}.webm`);
    sh('ffmpeg', ['-y', '-v', 'error', '-framerate', String(D[p].fps), '-i', path.join(outDir, 'f_%05d.png'),
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '20', '-auto-alt-ref', '0', out]);
    console.log(`  wrote ${out} (${idx} frames @ ${D[p].fps.toFixed(1)}fps)`);
  }

  // 5) QA contact sheet: one representative frame per pose over magenta
  if (QA) {
    const cols = Object.keys(D).length;
    const sheet = new Jimp(CW * cols, CH, 0xff00ffff);
    // faint horizontal rulers every 80px so pose heights are easy to compare by eye
    for (let y = FLOOR_Y; y >= 0; y -= 80) for (let x = 0; x < sheet.bitmap.width; x++) sheet.setPixelColor(0xd070d0ff, x, y);
    let c = 0;
    for (const p of Object.keys(D)) {
      const midI = Math.floor(D[p].meas.length * 0.4);
      const mid = D[p].meas[midI];
      const { s, cx, fl } = fp(p, midI);
      const img = await Jimp.read(mid.f);
      if (Math.abs(s - 1) > 0.002) img.resize(Math.round(mid.W * s), Math.round(mid.H * s), Jimp.RESIZE_BICUBIC);
      sheet.composite(img, c * CW + Math.round(CW / 2 - cx * s), Math.round(FLOOR_Y - fl * s));
      // floor line for reference
      for (let x = 0; x < CW; x++) sheet.setPixelColor(0x00ff00ff, c * CW + x, FLOOR_Y);
      c++;
    }
    const qaPath = path.join('_measqa', `norm_${ID}.png`);
    fs.mkdirSync('_measqa', { recursive: true });
    if (sheet.bitmap.width > 1600) sheet.resize(1600, Jimp.AUTO);
    await sheet.writeAsync(qaPath);
    console.log(`  QA sheet -> ${qaPath}`);
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`[${ID}] done.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
