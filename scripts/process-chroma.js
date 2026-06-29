// Flicker-free keyer for SOLID/STABLE chroma-screen clips (the Lumina/Hailuo creature
// clips sit on a steady teal screen ~(55,160,155)). The old keyer flood-filled from the
// border, which catches DIFFERENT interior pockets each frame → that was the real flicker
// source. This keyer is PURELY PER-PIXEL and DETERMINISTIC: a pixel's alpha is a fixed
// function of its own colour distance to the measured background, so a stable background
// yields a stable matte — as rock-steady as the PNG sprites, but keeping the full motion.
//
//   node scripts/process-chroma.js <id> [--only pose] [--inner N] [--outer N]
//                                        [--despill N] [--protect N] [--fps N] [--qa]
// Reads  assets/source/<id>/<pose>.mp4  →  writes assets/creatures/<id>/<pose>.webm
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ID = process.argv[2];
if (!ID) { console.error('usage: process-chroma.js <id> [opts]'); process.exit(1); }
const argv = process.argv.slice(3);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes('--' + k);
const ONLY = opt('only', null);
const INNER = parseFloat(opt('inner', '40'));   // dist<=inner  → fully background (alpha 0)
const OUTER = parseFloat(opt('outer', '82'));   // dist>=outer  → fully foreground (alpha 1)
const DESPILL = parseFloat(opt('despill', '1')); // 0..1 strength of teal-cast removal on edges
const PROTECT = parseFloat(opt('protect', '26')); // G brighter than bg+this ⇒ keep (cyan eyes)
const FPS = opt('fps', null);                    // override output fps (else clip's own)
const QA = has('qa');

const SRC = path.join('assets', 'source', ID);
const OUT = path.join('assets', 'creatures', ID);
const TMP = path.join('assets', `_chromatmp_${ID}`);
const POSES = ['anim', 'look', 'sleep', 'standup', 'happy'];

function smoothstep(a, b, x) { if (x <= a) return 0; if (x >= b) return 1; const t = (x - a) / (b - a); return t * t * (3 - 2 * t); }

// median of border-ring pixels = the screen colour (robust to a stray foreground touching an edge)
function measureBg(frames) {
  const rs = [], gs = [], bs = [];
  for (const im of frames) {
    const { width: W, height: H, data: d } = im.bitmap;
    const push = (x, y) => { const i = (y * W + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); };
    for (let x = 0; x < W; x += 6) { push(x, 1); push(x, H - 2); }
    for (let y = 0; y < H; y += 6) { push(1, y); push(W - 2, y); }
  }
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  return [med(rs), med(gs), med(bs)];
}

function keyFrame(im, bg) {
  const { width: W, height: H, data: d } = im.bitmap;
  const [br, bg_, bb] = bg;
  const tealBg = Math.min(bg_, bb) - br;   // how teal the screen is (Bolt)
  const greenBg = bg_ - Math.max(br, bb);  // how pure-green the screen is (Dev/Shade)
  const isGreen = greenBg >= tealBg;
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const dr = r - br, dg = g - bg_, db = b - bb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    // Protect FOREGROUND colours that sit near the screen colour — but NOT screen spill.
    // warm = red-dominant (skin/hair); blue = blue-dominant (Shade's glow); cyan = BOTH
    // G&B lifted over a TEAL screen (Bolt's eyes). A green laptop-screen GLOW lifts only G,
    // so it is intentionally NOT protected → it gets keyed/despilled instead of left green.
    let protect = false;
    if (r - br > 44 && r >= g && r >= b - 8) protect = true;            // warm
    else if (b - bb > 38 && b >= g - 12 && b > r) protect = true;       // blue glow
    else if (!isGreen && g - bg_ > 22 && b - bb > 16) protect = true;   // cyan eyes (teal bg only)
    const a = protect ? 1 : smoothstep(INNER, OUTER, dist);
    if (a <= 0) { d[i + 3] = 0; continue; }
    // Despill the SCREEN colour out of every kept, non-protected pixel: removes the
    // green/teal edge fringe AND neutralises the green laptop-screen glow.
    if (DESPILL > 0 && !protect) {
      if (isGreen) {
        const spill = g - Math.max(r, b);
        if (spill > 0) d[i + 1] = Math.round(g - DESPILL * spill);
      } else {
        const spill = Math.min(g, b) - r;
        if (spill > 0) { d[i + 1] = Math.max(r, Math.round(g - DESPILL * spill)); d[i + 2] = Math.max(r, Math.round(b - DESPILL * spill)); }
      }
    }
    d[i + 3] = Math.round(a * 255);
  }
  return im;
}

// union bbox of all opaque content (alpha>24) → one steady crop so the sprite never jitters
function unionBox(frames) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const im of frames) {
    const { width: W, height: H, data: d } = im.bitmap;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(W * y + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// mean |Δalpha| between consecutive frames (flicker metric, 0 = perfectly stable)
function flicker(frames) {
  let sum = 0, n = 0;
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1].bitmap.data, b = frames[k].bitmap.data;
    for (let i = 3; i < a.length; i += 4) { sum += Math.abs(a[i] - b[i]); n++; }
  }
  return (sum / n).toFixed(3);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const pose of POSES) {
    if (ONLY && pose !== ONLY) continue;
    const mp4 = path.join(SRC, `${pose}.mp4`);
    if (!fs.existsSync(mp4)) continue;
    const dir = path.join(TMP, pose); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    // decode (scale to a sane working height, keep aspect even)
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', mp4, '-vf', 'scale=-2:540', path.join(dir, 'in_%04d.png')]);
    const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'default=nw=1:nk=1', mp4]).toString().trim();
    const fps = FPS || (probe.includes('/') ? (parseInt(probe) / parseInt(probe.split('/')[1])) : probe);
    const names = fs.readdirSync(dir).filter((f) => /^in_\d+\.png$/.test(f)).sort();
    const frames = [];
    for (const n of names) frames.push(await Jimp.read(path.join(dir, n)));
    const bg = measureBg(frames);
    for (const im of frames) keyFrame(im, bg);
    const fl = flicker(frames);
    const box = unionBox(frames);
    const outDir = path.join(dir, 'out'); fs.mkdirSync(outDir, { recursive: true });
    let idx = 0;
    for (const im of frames) {
      const c = im.clone().crop(box.x0, box.y0, box.w, box.h);
      const cw = c.bitmap.width + (c.bitmap.width % 2), ch = c.bitmap.height + (c.bitmap.height % 2);
      const canvas = new Jimp(cw, ch, 0x00000000); canvas.composite(c, 0, 0);
      await canvas.writeAsync(path.join(outDir, `o_${String(idx++).padStart(4, '0')}.png`));
    }
    const out = path.join(OUT, `${pose}.webm`);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(outDir, 'o_%04d.png'),
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '12', '-auto-alt-ref', '0', out]);
    console.log(`  ${pose}: bg=${bg.join(',')} frames=${frames.length} crop=${box.w}x${box.h} Δalpha=${fl} → ${out}`);
    if (QA) {
      const mid = frames[frames.length >> 1].clone().crop(box.x0, box.y0, box.w, box.h);
      for (const [bgc, tag] of [[0x8f96a0ff, 'gray'], [0xff00ffff, 'mag']]) {
        const s = new Jimp(mid.bitmap.width, mid.bitmap.height, bgc); s.composite(mid, 0, 0);
        fs.mkdirSync('_chromaqa', { recursive: true });
        await s.writeAsync(path.join('_chromaqa', `${ID}_${pose}_${tag}.png`));
      }
    }
  }
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`[${ID}] done.`);
})().catch((e) => { console.error(e); process.exit(1); });
