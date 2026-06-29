// Turns clean transparent POSE PNGs into LIVELY looping WebMs.
// The sprite stays a single clean cut-out (alpha is pristine), so it can never
// flicker like per-frame video keying — but instead of a dull up/down bob we drive
// it with real character motion: breathing (squash & stretch), a tilt that pivots
// at the FEET (so the head/antenna swings while the feet stay planted), a gentle
// side sway, and a signature move per pose (happy bounces & shakes, sleep breathes
// slow & deep). Every channel is a sine with an INTEGER cycle count, so the loop is
// perfectly seamless. Rendering is an alpha-weighted bilinear inverse-warp → smooth,
// no dark edge fringe, even sub-pixel motion stays clean.
//   node scripts/anim-png.js <id>
// Reads assets/source/<id>/<pose>.png → writes assets/creatures/<id>/<pose>.webm
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ID = process.argv[2];
if (!ID) { console.error('usage: anim-png.js <id>'); process.exit(1); }
const SRC = path.join('assets', 'source', ID);
const OUT = path.join('assets', 'creatures', ID);
const TMP = path.join('assets', `_apngtmp_${ID}`);
const FPS = 24, NF = 48;
const POSES = ['anim', 'look', 'sleep', 'standup', 'happy'];

// Per-pose motion. cycles are INTEGERS → seamless loop. bob/sway in px; breathe is a
// squash/stretch fraction; tilt in degrees pivoting at the feet; phases in turns (0..1).
const MOT = {
  // calm idle: easy breathing, a slow lean, antenna sways via feet-pivot tilt
  anim:    { bob: 4,  bobC: 1, breathe: 0.045, brC: 1, sway: 2.5, swC: 1, swPh: 0.25, tilt: 2.6, tC: 1, tPh: 0.5 },
  // thinking: slower contemplative sway + a touch more head swing
  look:    { bob: 2.5, bobC: 1, breathe: 0.04, brC: 1, sway: 3.5, swC: 1, swPh: 0.0,  tilt: 3.2, tC: 1, tPh: 0.3 },
  // working/crouched: quicker little bob (typing feel), small steady tilt
  standup: { bob: 3,  bobC: 2, breathe: 0.05, brC: 2, sway: 1.5, swC: 1, swPh: 0.5,  tilt: 1.6, tC: 1, tPh: 0.0 },
  // celebration: big springy bounce + fast happy shake
  happy:   { bob: 13, bobC: 2, breathe: 0.10, brC: 2, sway: 2.5, swC: 2, swPh: 0.0,  tilt: 6.0, tC: 4, tPh: 0.0 },
  // sleeping: slow, deep breathing, barely any tilt
  sleep:   { bob: 2.5, bobC: 1, breathe: 0.085, brC: 1, sway: 0, swC: 1, swPh: 0.0,  tilt: 0.7, tC: 1, tPh: 0.0 },
};
const DEF = { bob: 3, bobC: 1, breathe: 0.05, brC: 1, sway: 2, swC: 1, swPh: 0, tilt: 2, tC: 1, tPh: 0 };

function cropAlpha(img) {
  const { width: W, height: H, data: d } = img.bitmap;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(W * y + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return img.crop(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

// Inverse-warp the base sprite into a (cw x ch) frame. Transform (applied to the base,
// origin at the FEET = bottom-centre): scale (sx,sy) → rotate deg about feet → translate
// to (pivotX+offX, pivotY+offY). Sampling is alpha-weighted bilinear so transparent
// neighbours never bleed dark colour into the silhouette edge.
function warp(base, cw, ch, sx, sy, degRad, pivotX, pivotY, offX, offY) {
  const { width: bw, height: bh, data: bd } = base.bitmap;
  const out = new Jimp(cw, ch, 0x00000000);
  const od = out.bitmap.data;
  const cos = Math.cos(-degRad), sin = Math.sin(-degRad);
  const fx = bw / 2, fy = bh; // feet pivot in base coords
  for (let Y = 0; Y < ch; Y++) {
    for (let X = 0; X < cw; X++) {
      const dx = X - pivotX - offX, dy = Y - pivotY - offY;
      const rx = (dx * cos - dy * sin) / sx;   // undo rotation then scale
      const ry = (dx * sin + dy * cos) / sy;
      const bx = fx + rx, by = fy + ry;
      if (bx < 0 || by < 0 || bx >= bw - 1 || by >= bh - 1) continue;
      const x0 = bx | 0, y0 = by | 0, x1 = x0 + 1, y1 = y0 + 1;
      const ax = bx - x0, ay = by - y0;
      const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
      const i00 = (y0 * bw + x0) * 4, i10 = (y0 * bw + x1) * 4, i01 = (y1 * bw + x0) * 4, i11 = (y1 * bw + x1) * 4;
      const a00 = bd[i00 + 3], a10 = bd[i10 + 3], a01 = bd[i01 + 3], a11 = bd[i11 + 3];
      const aw00 = w00 * a00, aw10 = w10 * a10, aw01 = w01 * a01, aw11 = w11 * a11;
      const aSum = aw00 + aw10 + aw01 + aw11;
      const oi = (Y * cw + X) * 4;
      od[oi + 3] = Math.round(w00 * a00 + w10 * a10 + w01 * a01 + w11 * a11);
      if (aSum > 0) {
        for (let c = 0; c < 3; c++) {
          od[oi + c] = Math.round((aw00 * bd[i00 + c] + aw10 * bd[i10 + c] + aw01 * bd[i01 + c] + aw11 * bd[i11 + c]) / aSum);
        }
      }
    }
  }
  return out;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const pose of POSES) {
    const pf = path.join(SRC, `${pose}.png`);
    if (!fs.existsSync(pf)) continue;
    const base = cropAlpha(await Jimp.read(pf));
    const bw = base.bitmap.width, bh = base.bitmap.height;
    const m = { ...DEF, ...(MOT[pose] || {}) };
    const tiltRadMax = Math.abs(m.tilt) * Math.PI / 180;
    const sinT = Math.sin(tiltRadMax);
    // canvas: room for sway + the head's sideways sweep when tilting about the feet,
    // plus head-/foot-room for the bob and a little breathing stretch.
    let padX = Math.ceil(m.sway + bh * sinT + bw * 0.04 + 6);
    let padTop = Math.ceil(m.bob + bh * m.breathe + (bw / 2) * sinT + 6);
    let padBot = Math.ceil(m.bob + 6);
    let cw = bw + 2 * padX, ch = bh + padTop + padBot;
    cw += cw % 2; ch += ch % 2;
    const pivotX = cw / 2, pivotY = ch - padBot; // feet sit here
    const dir = path.join(TMP, pose); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < NF; i++) {
      const th = 2 * Math.PI * i / NF;
      const breath = m.breathe * Math.sin(m.brC * th);
      const sy = 1 + breath, sx = 1 - breath * 0.6;             // gentle volume-ish squash
      const deg = m.tilt * Math.sin(m.tC * th + m.tPh * 2 * Math.PI) * Math.PI / 180;
      const offX = m.sway * Math.sin(m.swC * th + m.swPh * 2 * Math.PI);
      const offY = -m.bob * Math.sin(m.bobC * th); // smooth seamless bob
      const frame = warp(base, cw, ch, sx, sy, deg, pivotX, pivotY, offX, offY);
      await frame.writeAsync(path.join(dir, `f_${String(i).padStart(4, '0')}.png`));
    }
    const out = path.join(OUT, `${pose}.webm`);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f_%04d.png'),
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '14', '-auto-alt-ref', '0', out]);
    console.log(`  ${pose}: ${bw}x${bh} lively(bob${m.bob} tilt${m.tilt}° breathe${m.breathe}) → ${out}`);
  }
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`[${ID}] done.`);
})().catch((e) => { console.error(e); process.exit(1); });
