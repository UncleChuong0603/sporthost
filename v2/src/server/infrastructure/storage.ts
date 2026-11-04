import "server-only";
import sharp from "sharp";
import { mkdir, open, rename, unlink, readFile, realpath, stat } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { getConfig } from "@/server/config";
import { AppError } from "@/server/errors";

const formats: Record<string, string> = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" };
export async function sanitizeImage(upload: File, kind: "qr" | "proof") {
  const max = (kind === "qr" ? 2 : 3) * 1024 * 1024;
  if (!formats[upload.type] || upload.size <= 0 || upload.size > max) throw new AppError(400, "Chỉ nhận ảnh PNG, JPEG hoặc WebP; tối đa 2 MB cho QR và 3 MB cho biên nhận.");
  try {
    const raw = Buffer.from(await upload.arrayBuffer());
    if (raw.length !== upload.size || raw.length > max) throw Error("Invalid size");
    const options = { limitInputPixels: 16_000_000, failOn: "warning" as const };
    const metadata = await sharp(raw, options).metadata();
    if (metadata.format !== formats[upload.type] || !metadata.width || !metadata.height || metadata.width * metadata.height > 16_000_000 || (metadata.pages ?? 1) > 1) throw Error("Invalid image");
    // Decode and re-encode, removing EXIF, scripts, filenames and all other supplied metadata.
    const data = await sharp(raw, options).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
    if (data.length > 3 * 1024 * 1024) throw Error("Converted image too large");
    return { data, sha256: createHash("sha256").update(data).digest("hex") };
  } catch { throw new AppError(400, "Ảnh không hợp lệ hoặc quá lớn. Vui lòng chọn ảnh nhỏ hơn."); }
}
async function storageRoot() {
  const config = getConfig();
  if (!config.STORAGE_ROOT || !isAbsolute(config.STORAGE_ROOT)) throw new AppError(503, "Kho ảnh đang được cấu hình.");
  if (!config.deployed) await mkdir(config.STORAGE_ROOT, { recursive: true });
  try { const root = await realpath(config.STORAGE_ROOT); if (!(await stat(root)).isDirectory()) throw Error(); return root; }
  catch { throw new AppError(503, "Kho ảnh chưa sẵn sàng."); }
}
function pathFor(root: string, key: string) {
  if (!/^clubs\/[1-9]\d*\/(qr|proof)\/[A-Za-z0-9_-]{24,128}\.png$/.test(key)) throw new AppError(404, "Không tìm thấy ảnh.");
  const path = resolve(root, key), inside = relative(root, path);
  if (inside.startsWith("..") || isAbsolute(inside)) throw new AppError(404, "Không tìm thấy ảnh.");
  return path;
}
function checkInside(root: string, path: string) {
  const inside = relative(root, path);
  if (inside.startsWith("..") || isAbsolute(inside)) throw new AppError(404, "Không tìm thấy ảnh.");
}
export async function putImage(data: Buffer, clubId: number, kind: "qr" | "proof") {
  if (!Number.isSafeInteger(clubId) || clubId < 1) throw new Error("Invalid club");
  const root = await storageRoot();
  const key = `clubs/${clubId}/${kind}/${randomBytes(24).toString("base64url")}.png`;
  const destination = pathFor(root, key); await mkdir(dirname(destination), { recursive: true });
  checkInside(root, await realpath(dirname(destination)));
  const temporary = destination + ".tmp";
  try {
    const file = await open(temporary, "wx", 0o600);
    try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
    await rename(temporary, destination); return key;
  } catch { throw new AppError(503, "Chưa lưu được ảnh. Vui lòng thử lại sau."); }
  finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}
export async function readImage(key: string) {
  const root = await storageRoot(); const path = pathFor(root, key);
  // Volume paths are runtime data, never files to package into the standalone image.
  try { checkInside(root, await realpath(/* turbopackIgnore: true */ path)); const info = await stat(/* turbopackIgnore: true */ path); if (!info.isFile() || info.size > 3 * 1024 * 1024) throw new AppError(404, "Không tìm thấy ảnh."); return await readFile(/* turbopackIgnore: true */ path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new AppError(404, "Không tìm thấy ảnh."); throw error; }
}
export async function deleteImage(key: string) {
  const root = await storageRoot(); const path = pathFor(root, key);
  try { checkInside(root, await realpath(/* turbopackIgnore: true */ path)); await unlink(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
