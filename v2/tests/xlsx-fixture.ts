import { readFileSync } from "node:fs";
import { deflateRawSync, inflateRawSync } from "node:zlib";
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let n = 0; n < 8; n++) crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1; }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipFixture(entries: Record<string, string | Buffer>) {
  const files: Buffer[] = [], directory: Buffer[] = []; let offset = 0;
  for (const [name, raw] of Object.entries(entries)) {
    const data = typeof raw === "string" ? Buffer.from(raw) : raw, compressed = deflateRawSync(data), filename = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    files.push(local, filename, compressed);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    directory.push(central, filename); offset += local.length + filename.length + compressed.length;
  }
  const index = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, index, end]);
}
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function memberWorkbook(rows: (string | number | null)[][], overrideSheet?: string) {
  const bytes = readFileSync("public/templates/thanh-vien-sporthost.xlsx"), parts: Record<string, Buffer | string> = {}; let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const compressed = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.toString("utf8", offset + 30, offset + 30 + nameLength), start = offset + 30 + nameLength + extra;
    parts[name] = inflateRawSync(bytes.subarray(start, start + compressed)); offset = start + compressed;
  }
  const data = rows.map((values, row) => `<row r="${row + 1}">${values.map((value, col) => value === null ? "" : typeof value === "number" ? `<c r="${String.fromCharCode(65 + col)}${row + 1}" t="n"><v>${value}</v></c>` : `<c r="${String.fromCharCode(65 + col)}${row + 1}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`).join("")}</row>`).join("");
  parts["xl/worksheets/sheet1.xml"] = overrideSheet ?? `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data}</sheetData></worksheet>`;
  return zipFixture(parts);
}
export const memberHeaders = ["Họ tên", "Số điện thoại", "Loại thành viên", "Giới tính", "Trình độ"];
