// Generates simple PNG icons (tray + app) with zero dependencies.
// Draws a little paw on a cream rounded square. Run: npm run icons
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cream = [247, 241, 227];
  const brown = [74, 59, 53];
  const s = size;
  const r = s * 0.22; // corner radius for bg
  // paw geometry (normalized to size)
  const pad = { x: s * 0.5, y: s * 0.62, rx: s * 0.2, ry: s * 0.17 };
  const toes = [
    { x: s * 0.3, y: s * 0.4, r: s * 0.085 },
    { x: s * 0.43, y: s * 0.3, r: s * 0.09 },
    { x: s * 0.57, y: s * 0.3, r: s * 0.09 },
    { x: s * 0.7, y: s * 0.4, r: s * 0.085 },
  ];

  const inRounded = (x, y) => {
    const dx = Math.min(x, s - 1 - x);
    const dy = Math.min(y, s - 1 - y);
    if (dx >= r && dy >= r) return true;
    if (dx >= r || dy >= r) return true;
    const cx = x < s / 2 ? r : s - 1 - r;
    const cy = y < s / 2 ? r : s - 1 - r;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      if (!inRounded(x + 0.5, y + 0.5)) {
        rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 0;
        continue;
      }
      let col = cream;
      let onPaw = ((x - pad.x) / pad.rx) ** 2 + ((y - pad.y) / pad.ry) ** 2 <= 1;
      for (const t of toes) {
        if ((x - t.x) ** 2 + (y - t.y) ** 2 <= t.r * t.r) onPaw = true;
      }
      if (onPaw) col = brown;
      rgba[i] = col[0]; rgba[i + 1] = col[1]; rgba[i + 2] = col[2]; rgba[i + 3] = 255;
    }
  }
  return encodePNG(s, s, rgba);
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'tray.png'), draw(32));
fs.writeFileSync(path.join(outDir, 'icon.png'), draw(256));
console.log('Wrote assets/tray.png and assets/icon.png');
