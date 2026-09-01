import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, "../assets");
mkdirSync(output, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, number) => {
  let value = number;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name, data) {
  const type = Buffer.from(name);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, crc]);
}

function pixel(size, x, y) {
  const nx = x / size;
  const ny = y / size;
  let r = Math.round(10 + ny * 5);
  let g = Math.round(116 - ny * 58);
  let b = Math.round(126 - ny * 47);
  const sun = Math.hypot(nx - 0.70, ny - 0.29) < 0.105;
  if (sun) [r, g, b] = [247, 198, 105];
  const crest = 0.57 + 0.08 * Math.sin(nx * Math.PI * 2.2 + 0.5) - 0.16 * Math.exp(-Math.pow((nx - 0.34) / 0.2, 2));
  const lower = 0.72 + 0.035 * Math.sin(nx * Math.PI * 3.2);
  if (ny > crest && ny < lower) [r, g, b] = [234, 248, 244];
  if (ny >= lower) [r, g, b] = [50, 195, 178];
  return [r, g, b, 255];
}

function makePng(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(size, x, y);
      const offset = row + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

for (const size of [192, 512]) writeFileSync(resolve(output, `icon-${size}.png`), makePng(size));
console.log("Icônes PWA générées dans assets/");
