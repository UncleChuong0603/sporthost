import { findCurrentHost } from "@/server/auth/service";
import { requireClubAccess, type Capability } from "@/server/access/permissions";
import { getDb } from "@/server/db/client";
import { gameSessionsInClubhost as sessions, storedAssetsInClubhost as assets, paymentProofsInClubhost as proofs } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { validEmailToken } from "@/server/auth/email-tokens";
import { AppError } from "@/server/errors";

// Preserve legacy 401/403/404 HTTP statuses using a stable Proxy response, before page streaming begins.
// Services repeat authorization at the data boundary; this is an HTTP compatibility guard only.
export async function pageAccess(url: URL, cookie: string) {
  const path = url.pathname;
  if (["/verify-email", "/reset-password"].includes(path)) { await validEmailToken(url.searchParams.get("token") || "", path === "/verify-email" ? "verify" : "reset"); return; }
  if (!/^(?:\/(?:dashboard|account|clubs|members|schedule|finance|payments\/review|admin)(?:\/.*)?|\/games\/\d+(?:\/.*)?|\/proofs\/\d+\/image)$/.test(path)) return;
  const host = await findCurrentHost(cookie); if (!host) throw new AppError(401, "Vui lòng đăng nhập để tiếp tục.");
  if (/^\/admin(?:\/|$)/.test(path) && !host.isPlatformAdmin) throw new AppError(403, "Chỉ quản trị nền tảng được truy cập trang này.");
  const db = getDb();
  let club: number | null = null, capability: Capability = "view";
  const clubMatch = /^\/clubs\/(\d+)(?:\/(settings|access|qr))?$/.exec(path);
  if (clubMatch) { club = Number(clubMatch[1]); capability = clubMatch[2] === "qr" ? "manage_finance" : "view"; }
  const gameMatch = /^\/games\/(\d+)(?:\/(billing|export\.csv))?$/.exec(path);
  if (gameMatch) {
    const [game] = await db.select({ club: sessions.clubId }).from(sessions).where(eq(sessions.id, Number(gameMatch[1])));
    if (!game) throw new AppError(404, "Không tìm thấy buổi chơi."); club = game.club; capability = gameMatch[2] ? "manage_finance" : "view";
  }
  const proofMatch = /^\/proofs\/(\d+)\/image$/.exec(path);
  if (proofMatch) {
    const [proof] = await db.select({ club: assets.clubId }).from(proofs).innerJoin(assets, eq(assets.id, proofs.assetId)).where(eq(proofs.id, Number(proofMatch[1])));
    if (!proof) throw new AppError(404, "Không tìm thấy biên nhận."); club = proof.club; capability = "manage_finance";
  }
  if (["/members", "/schedule", "/finance", "/finance/export.csv", "/payments/review", "/schedule/new"].includes(path) && url.searchParams.get("club_id")) {
    club = Number(url.searchParams.get("club_id")); capability = path.startsWith("/finance") || path === "/payments/review" ? "manage_finance" : path === "/members" ? "contacts" : path === "/schedule/new" ? "manage_session" : "view";
  }
  if (club !== null) { if (!Number.isSafeInteger(club) || club < 1) throw new AppError(400, "CLB chưa hợp lệ."); await requireClubAccess(db, host.id, club, capability); }
}
