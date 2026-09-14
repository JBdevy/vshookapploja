// App Store PNG encoding: composites transparent edge pixels on the icon's
// black matte and emits RGB. Opaque artwork pixels remain unchanged.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const path = new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', import.meta.url);
const png = readFileSync(path);
const chunks = [];
for (let offset = 8; offset < png.length;) {
  const length = png.readUInt32BE(offset);
  chunks.push({ type: png.toString('ascii', offset + 4, offset + 8), data: png.subarray(offset + 8, offset + 8 + length) });
  offset += length + 12;
}
const header = Buffer.from(chunks.find(chunk => chunk.type === 'IHDR').data);
if (header[9] === 2) {
  console.log('IOS_ICON_RGB_OK: already RGB.');
  process.exit(0);
}
assert.equal(header[8], 8);
assert.equal(header[9], 6);
assert.equal(header[12], 0, 'non-interlaced PNG required');
const width = header.readUInt32BE(0), height = header.readUInt32BE(4);
const raw = inflateSync(Buffer.concat(chunks.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data)));
const rgb = Buffer.alloc(height * (width * 3 + 1));
let previous = Buffer.alloc(width * 4);
const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
for (let y = 0; y < height; ++y) {
  const start = y * (width * 4 + 1), filter = raw[start], row = Buffer.alloc(width * 4);
  assert(filter <= 4);
  for (let x = 0; x < row.length; ++x) {
    const a = x >= 4 ? row[x - 4] : 0, b = previous[x], c = x >= 4 ? previous[x - 4] : 0;
    const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
    row[x] = (raw[start + 1 + x] + prediction) & 255;
  }
  for (let x = 0; x < width; ++x) {
    const alpha = row[x * 4 + 3] / 255;
    for (let channel = 0; channel < 3; ++channel) {
      rgb[y * (width * 3 + 1) + 1 + x * 3 + channel] = Math.round(row[x * 4 + channel] * alpha);
    }
  }
  previous = row;
}
const crc = data => {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let bit = 0; bit < 8; ++bit) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  result.write(type, 4, 4, 'ascii');
  data.copy(result, 8);
  result.writeUInt32BE(crc(result.subarray(4, 8 + data.length)), 8 + data.length);
  return result;
};
header[9] = 2;
writeFileSync(path, Buffer.concat([png.subarray(0, 8), chunk('IHDR', header), chunk('IDAT', deflateSync(rgb)), chunk('IEND', Buffer.alloc(0))]));
console.log('IOS_ICON_RGB_OK: RGB App Store encoding, preserving opaque artwork.');
