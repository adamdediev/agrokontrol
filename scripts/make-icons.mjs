// Генерирует PNG-иконки приложения без внешних зависимостей
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

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
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, maskable) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const bg = [4, 120, 87];
  const r = maskable ? 0 : size * 0.22;
  const s = maskable ? 0.62 : 0.78; // масштаб листа
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      // скруглённый квадрат
      const cx = Math.max(r - x, 0, x - (size - 1 - r));
      const cy = Math.max(r - y, 0, y - (size - 1 - r));
      const inside = r === 0 || cx * cx + cy * cy <= r * r;
      if (!inside) { raw[i + 3] = 0; continue; }
      // лист: эллипс, повёрнутый на 45°
      const nx = (x / size - 0.5) / s, ny = (y / size - 0.5) / s;
      const u = (nx - ny) / Math.SQRT2, v = (nx + ny) / Math.SQRT2;
      const leaf = (u * u) / (0.36 * 0.36) + (v * v) / (0.19 * 0.19) <= 1;
      const vein = Math.abs(v) < 0.018 && Math.abs(u) < 0.3;
      const white = leaf && !vein;
      raw[i] = white ? 255 : bg[0];
      raw[i + 1] = white ? 255 : bg[1];
      raw[i + 2] = white ? 255 : bg[2];
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
writeFileSync("public/icon-192.png", png(192, false));
writeFileSync("public/icon-512.png", png(512, false));
writeFileSync("public/icon-maskable-512.png", png(512, true));
writeFileSync("public/apple-touch-icon.png", png(180, true));
console.log("icons ok");
