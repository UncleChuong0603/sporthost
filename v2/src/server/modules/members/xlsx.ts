import "server-only";
import { inflateRawSync } from "node:zlib";
import { readSheet, type SheetData } from "read-excel-file/node";
import { memberSchema, type MemberInput } from "@/domain/member";
import { AppError } from "@/server/errors";

export const maxExcelBytes = 2 * 1024 * 1024;
export type ImportRow = { row: number; values: MemberInput | null; name: string; phone: string; status: "ready" | "invalid" | "duplicate"; message: string };
const invalid = (message = "File Excel chưa hợp lệ. Hãy lưu lại dưới dạng .xlsx rồi thử lại.") => new AppError(400, message);
const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim().replace(/\s+/g, " ");

// Bound actual inflated data before handing it to the XLSX reader. This also
// rejects huge sparse sheet coordinates, encryption, external data and formulas.
export function validateWorkbook(bytes: Buffer) {
  if (bytes.length > maxExcelBytes) throw new AppError(413, "File tối đa 2 MB, tối đa 500 thành viên mỗi lần.");
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) throw invalid();
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || end + 22 > bytes.length || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw invalid();
  const count = bytes.readUInt16LE(end + 10), directory = bytes.readUInt32LE(end + 16), size = bytes.readUInt32LE(end + 12);
  if (!count || count > 80 || directory + size !== end || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length) throw invalid();
  let cursor = directory, total = 0; const names = new Set<string>();
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw invalid();
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), compressed = bytes.readUInt32LE(cursor + 20), expanded = bytes.readUInt32LE(cursor + 24);
    const length = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32), local = bytes.readUInt32LE(cursor + 42);
    if (cursor + 46 + length + extra + comment > end || expanded > 4 * 1024 * 1024 || (total += expanded) > 12 * 1024 * 1024 || flags & 1 || ![0, 8].includes(method)) throw invalid("File quá lớn sau khi giải nén hoặc đang được bảo vệ. Dùng file mẫu và nhập tối đa 500 dòng.");
    const name = bytes.toString("utf8", cursor + 46, cursor + 46 + length);
    if (names.has(name) || !name || /(^\/|\.\.|\\|\0|:)/.test(name) || /(?:vbaProject|externalLinks|embeddings)/i.test(name)) throw invalid();
    names.add(name);
    if (local + 30 > directory || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 8) !== method) throw invalid();
    const localLength = bytes.readUInt16LE(local + 26), start = local + 30 + localLength + bytes.readUInt16LE(local + 28);
    if (start + compressed > directory || bytes.toString("utf8", local + 30, local + 30 + localLength) !== name) throw invalid();
    let data: Buffer;
    try { data = method === 0 ? bytes.subarray(start, start + compressed) : inflateRawSync(bytes.subarray(start, start + compressed), { maxOutputLength: 4 * 1024 * 1024 }); } catch { throw invalid(); }
    if (data.length !== expanded) throw invalid();
    if (/\.(xml|rels)$/i.test(name)) {
      const xml = data.toString("utf8");
      if (/<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External["']/i.test(xml)) throw invalid("File có liên kết ngoài hoặc cấu trúc không hỗ trợ. Hãy sao chép giá trị vào file mẫu.");
      if (/^xl\/worksheets\//.test(name)) {
        if (/<(?:\w+:)?f(?:\s|>)/.test(xml)) throw invalid("File có ô công thức. Trong Excel, hãy Dán đặc biệt → Giá trị rồi tải lại.");
        for (const match of xml.matchAll(/\b(?:r|ref)=["']([^"']+)["']/g)) {
          for (const address of match[1].split(":")) {
            const cell = /^([A-Z]+)(\d+)$/.exec(address);
            if (cell && (Number(cell[2]) > 501 || cell[1].length > 2 || cell[1].length === 2 && cell[1] > "AF") || /^\d+$/.test(address) && Number(address) > 501) throw invalid("Chỉ hỗ trợ 500 dòng thành viên và 32 cột. Xóa các dòng/cột thừa hoặc dùng file mẫu.");
          }
        }
      }
    }
    cursor += 46 + length + extra + comment;
  }
  if (cursor !== end || !names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) throw invalid();
}

export async function parseMembersExcel(bytes: Buffer): Promise<ImportRow[]> {
  try { validateWorkbook(bytes); } catch (error) { if (error instanceof AppError) throw error; throw invalid(); }
  let data: SheetData;
  try { data = await readSheet(bytes, 1); } catch { throw invalid(); }
  if (data.length < 2) throw invalid("File chưa có thành viên. Giữ dòng tiêu đề và nhập danh sách từ dòng 2.");
  const headers = (data[0] as unknown[]).map(value => normalized(String(value ?? "")));
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw invalid("Tên cột bị trùng. Mỗi cột chỉ xuất hiện một lần.");
  const column = (names: string[]) => headers.findIndex(h => names.includes(h));
  const columns = { name: column(["ho ten", "ho va ten", "ten"]), phone: column(["so dien thoai", "dien thoai", "sdt"]), kind: column(["loai thanh vien", "loai"]), gender: column(["gioi tinh"]), level: column(["trinh do"]) };
  if (columns.name < 0 || columns.phone < 0) throw invalid("Thiếu cột Họ tên hoặc Số điện thoại. Hãy dùng dòng tiêu đề trong file mẫu.");
  const rows: ImportRow[] = [], seen = new Set<string>();
  for (let index = 1; index < data.length; index++) {
    const raw = data[index] as unknown[];
    if (raw.every(v => v === null || v === undefined || v === "")) continue;
    const text = (key: keyof typeof columns) => columns[key] < 0 ? "" : String(raw[columns[key]] ?? "").trim();
    const name = text("name").slice(0, 500), rawPhone = text("phone").slice(0, 100), kind = normalized(text("kind")), gender = normalized(text("gender"));
    const phone = /^[35789]\d{8}$/.test(rawPhone) ? "0" + rawPhone : rawPhone;
    const parsed = memberSchema.safeParse({ name, phone, kind: !kind || ["co dinh", "fixed"].includes(kind) ? "fixed" : ["vang lai", "guest"].includes(kind) ? "guest" : kind,
      gender: !gender || ["chua cap nhat", "unspecified"].includes(gender) ? "unspecified" : ["nam", "male"].includes(gender) ? "male" : ["nu", "female"].includes(gender) ? "female" : gender, level: text("level") });
    let status: ImportRow["status"] = "ready", message = phone !== rawPhone ? "Đã thêm số 0 đầu số điện thoại." : "Sẵn sàng nhập";
    if (!parsed.success) { status = "invalid"; message = parsed.error.issues.map(issue => ({ name: "Họ tên: nhập 1–100 ký tự.", phone: "Số điện thoại chưa hợp lệ.", kind: "Loại: Cố định hoặc Vãng lai.", gender: "Giới tính: Nam, Nữ hoặc để trống.", level: "Trình độ tối đa 40 ký tự." }[String(issue.path[0])] || "Kiểm tra nội dung dòng.")).join(" "); }
    else if (seen.has(parsed.data.phone)) { status = "duplicate"; message = "Số điện thoại trùng trong file; giữ dòng hợp lệ đầu tiên."; }
    if (parsed.success) seen.add(parsed.data.phone);
    rows.push({ row: index + 1, values: parsed.success ? parsed.data : null, name, phone: parsed.success ? parsed.data.phone : rawPhone, status, message });
  }
  if (!rows.length || rows.length > 500) throw invalid("Nhập từ 1 đến 500 thành viên mỗi lần.");
  return rows;
}
