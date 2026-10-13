// Generates public/icon-192.png and public/icon-512.png without extra dependencies.
// Design: brand-green rounded square with a soft white "sun/flower" mark.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const GREEN = [0x28, 0x57, 0x4a];
const WHITE = [0xff, 0xff, 0xff];
const PEACH = [0xf6, 0xe3, 0xce];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function icon(size, opaque = false) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = opaque ? 0 : size * 0.23; // iOS masks corners itself and rejects transparency
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // rounded-square mask (full-bleed is fine for maskable too)
      const dx = Math.max(r - x, 0, x - (size - 1 - r));
      const dy = Math.max(r - y, 0, y - (size - 1 - r));
      const inside = opaque || dx * dx + dy * dy <= r * r;
      let col = GREEN;
      const px = x - c, py = y - c;
      const dist = Math.hypot(px, py);
      const ang = Math.atan2(py, px);
      // eight soft petals around a center
      const petal = size * (0.2 + 0.07 * Math.cos(ang * 8));
      if (dist < petal) col = WHITE;
      if (dist < size * 0.085) col = PEACH;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; raw[o + 3] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const out = process.argv[2] ?? 'public';
for (const s of [192, 512]) writeFileSync(`${out}/icon-${s}.png`, icon(s));
// iOS app icon: 1024px, square, fully opaque.
const iosIcon = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';
try {
  writeFileSync(iosIcon, icon(1024, true));
  console.log('icons written (web + iOS)');
} catch {
  console.log('icons written (web only; no iOS project yet)');
}
