// Free neural text-to-speech via Microsoft Edge's online "Read aloud" voices.
// No API key, no cost, no quota. Self-contained WebSocket client over TLS so we
// stay dependency-free (pure Node, like the rest of the app). Returns MP3 bytes.
//
// Each creature gets its own German neural voice + prosody so the pet sounds like
// a character, not a narrator: big beasts speak deep & slow, tiny ones squeaky.
const tls = require('tls');
const crypto = require('crypto');

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const HOST = 'speech.platform.bing.com';
const WSS_PATH = '/consumer/speech/synthesize/readaloud/edge/v1';
// Edge sends its current full version in Sec-MS-GEC-Version; the service rejects
// stale versions with 403, so keep this roughly current with Edge stable.
const CHROMIUM_VERSION = '149.0.4022.96';
const CHROMIUM_MAJOR = CHROMIUM_VERSION.split('.')[0];
const SEC_VERSION = '1-' + CHROMIUM_VERSION;
const UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`;
const ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

// pitch in Hz (+ = higher/cuter), rate in % (+ = faster). All voices are German.
// Per-creature voice + prosody, per language. Only voices that actually exist in
// the Edge catalogue (verified against the live voices/list). English has a real
// "cute" child voice (en-US-AnaNeural); German has none, so its little creatures
// get a bright female voice pitched high. en-AU / en-GB / de-AT / de-CH add accent.
const DEFAULT = {
  en: { voice: 'en-US-AriaNeural', pitch: 12, rate: 6 },
  de: { voice: 'de-DE-KatjaNeural', pitch: 14, rate: 6 },
};
// Per-creature voices. Unknown ids fall back to DEFAULT (voiceFor below), so this only
// needs the creatures that ship — the three coder skins share a youthful coder voice.
const CODER_EN = { voice: 'en-US-GuyNeural', pitch: 8, rate: 6 };
const CODER_DE = { voice: 'de-DE-ConradNeural', pitch: 8, rate: 6 };
const DARK_EN = { voice: 'en-US-ChristopherNeural', pitch: -12, rate: -2 }; // deep & menacing
const DARK_DE = { voice: 'de-DE-ConradNeural', pitch: -14, rate: -2 };
const KING_EN = { voice: 'en-GB-RyanNeural', pitch: -2, rate: -2 };        // noble, regal
const KING_DE = { voice: 'de-DE-ConradNeural', pitch: -2, rate: -2 };
const VOICES = {
  en: { bvbcoder: CODER_EN, coolcoder: CODER_EN, bluestarcoder: CODER_EN, darkcoder: DARK_EN, kingcoder: KING_EN },
  de: { bvbcoder: CODER_DE, coolcoder: CODER_DE, bluestarcoder: CODER_DE, darkcoder: DARK_DE, kingcoder: KING_DE },
};

function voiceFor(id, lang) {
  const L = lang === 'de' ? 'de' : 'en';
  return (VOICES[L] && VOICES[L][id]) || DEFAULT[L];
}

// --- Edge "DRM" token: SHA-256 of (5-min-bucketed Windows filetime + token) ---
function secMsGec() {
  const WIN_EPOCH = 11644473600; // seconds between 1601-01-01 and 1970-01-01
  let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  ticks = ticks - (ticks % 300); // round down to the nearest 5 minutes
  ticks = ticks * 1e7; // to 100-nanosecond intervals (matches edge-tts behaviour)
  const str = ticks.toFixed(0) + TRUSTED_TOKEN;
  return crypto.createHash('sha256').update(str, 'ascii').digest('hex').toUpperCase();
}

// --- tiny WebSocket helpers (client frames must be masked) ---
function encodeFrame(opcode, payload) {
  const out = Buffer.isBuffer(payload) ? Buffer.from(payload) : Buffer.from(payload, 'utf8');
  const len = out.length; // MUST be the UTF-8 byte length, not the string length
  let header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = 0x80 | len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 0x80 | 127; header.writeUInt32BE(Math.floor(len / 2 ** 32), 2); header.writeUInt32BE(len >>> 0, 6); }
  header[0] = 0x80 | opcode; // FIN + opcode
  const mask = crypto.randomBytes(4);
  for (let i = 0; i < out.length; i++) out[i] ^= mask[i & 3];
  return Buffer.concat([header, mask, out]);
}

// parse one server frame from the buffer; returns null if incomplete
function parseFrame(b) {
  if (b.length < 2) return null;
  const fin = (b[0] & 0x80) !== 0;
  const opcode = b[0] & 0x0f;
  const masked = (b[1] & 0x80) !== 0;
  let len = b[1] & 0x7f;
  let off = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (b.length < 10) return null; len = b.readUInt32BE(2) * 2 ** 32 + b.readUInt32BE(6); off = 10; }
  let maskKey = null;
  if (masked) { if (b.length < off + 4) return null; maskKey = b.slice(off, off + 4); off += 4; }
  if (b.length < off + len) return null;
  let payload = b.slice(off, off + len);
  if (masked) { payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i & 3]; }
  return { fin, opcode, payload, rest: b.slice(off + len) };
}

function buildSSML(text, v) {
  const pitch = (v.pitch >= 0 ? '+' : '') + v.pitch + 'Hz';
  const rate = (v.rate >= 0 ? '+' : '') + v.rate + '%';
  const locale = v.voice.split('-').slice(0, 2).join('-'); // e.g. en-US, de-DE
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
    `<voice name='${v.voice}'><prosody pitch='${pitch}' rate='${rate}' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// keep emoji/symbols out of the spoken text (the bubble still shows them)
function clean(s) {
  return String(s || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Synthesize `text` in the given creature's voice. Resolves to an MP3 Buffer
 * (empty if there was nothing speakable). Rejects on network/protocol failure.
 */
function speak(text, creatureId, lang) {
  const clean_ = clean(text);
  if (!clean_) return Promise.resolve(Buffer.alloc(0));
  const v = voiceFor(creatureId, lang);

  return new Promise((resolve, reject) => {
    const query = `TrustedClientToken=${TRUSTED_TOKEN}&Sec-MS-GEC=${secMsGec()}` +
      `&Sec-MS-GEC-Version=${SEC_VERSION}&ConnectionId=${crypto.randomBytes(16).toString('hex')}`;
    const wsKey = crypto.randomBytes(16).toString('base64');
    const socket = tls.connect(443, HOST, { servername: HOST }, () => {
      if (process.env.TTSDEBUG) console.error('[tts] TLS up, GET ?' + query.slice(0, 60) + '… ver=' + SEC_VERSION);
      socket.write(
        `GET ${WSS_PATH}?${query} HTTP/1.1\r\n` +
        `Host: ${HOST}\r\n` +
        `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${wsKey}\r\nSec-WebSocket-Version: 13\r\n` +
        `Origin: ${ORIGIN}\r\nUser-Agent: ${UA}\r\n` +
        `Pragma: no-cache\r\nCache-Control: no-cache\r\n\r\n`
      );
    });

    let handshakeDone = false;
    let buf = Buffer.alloc(0);
    const audio = [];
    let fragOpcode = null, fragParts = [];
    let done = false;
    const timer = setTimeout(() => fail(new Error('tts timeout')), 15000);

    function fail(e) { if (done) return; if (process.env.TTSDEBUG) console.error('[tts] fail handshakeDone=' + handshakeDone + ' bytes=' + buf.length, e && e.message); done = true; clearTimeout(timer); try { socket.destroy(); } catch {} reject(e); }
    function finish() { if (done) return; done = true; clearTimeout(timer); try { socket.end(); } catch {} resolve(Buffer.concat(audio)); }

    function dispatch(opcode, payload) {
      if (opcode === 0x8) return finish();              // close
      if (opcode === 0x9) return socket.write(encodeFrame(0xA, payload)); // ping → pong
      if (opcode === 0x2) {                              // binary = audio chunk
        if (payload.length < 2) return;
        const headerLen = payload.readUInt16BE(0);
        const chunk = payload.slice(2 + headerLen);
        if (chunk.length) audio.push(chunk);
      } else if (opcode === 0x1) {                       // text = control message
        if (payload.toString().includes('Path:turn.end')) finish();
      }
    }

    function onFrame(f) {
      if (f.opcode === 0x0) { // continuation of a fragmented message
        fragParts.push(f.payload);
        if (f.fin) { const o = fragOpcode; const full = Buffer.concat(fragParts); fragOpcode = null; fragParts = []; dispatch(o, full); }
        return;
      }
      if ((f.opcode === 0x1 || f.opcode === 0x2) && !f.fin) { fragOpcode = f.opcode; fragParts = [f.payload]; return; }
      dispatch(f.opcode, f.payload);
    }

    socket.on('error', fail);
    socket.on('close', () => { if (!done) finish(); }); // server closed after audio
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!handshakeDone) {
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;
        const statusLine = buf.slice(0, idx).toString().split('\r\n')[0];
        if (!/ 101 /.test(statusLine)) return fail(new Error('ws handshake failed: ' + statusLine));
        handshakeDone = true;
        buf = buf.slice(idx + 4);
        const ts = new Date().toString();
        socket.write(encodeFrame(0x1,
          `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"${OUTPUT_FORMAT}"}}}}`));
        socket.write(encodeFrame(0x1,
          `X-RequestId:${crypto.randomBytes(16).toString('hex')}\r\nContent-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n${buildSSML(clean_, v)}`));
      }
      let res;
      while ((res = parseFrame(buf))) { buf = res.rest; onFrame(res); }
    });
  });
}

module.exports = { speak, voiceFor, VOICES };
