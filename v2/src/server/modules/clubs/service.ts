import "server-only";
import { and, eq, or, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { getDb, transaction } from "@/server/db/client";
import { clubsInClubhost as clubs, clubAccessInClubhost as access, auditLogsInClubhost as audit } from "@/server/db/schema";
import { requireClubAccess, capabilities, hasPermission } from "@/server/access/permissions";
import { sports } from "@/domain/catalog";
import { isVietnamProvince } from "@/domain/vietnam-provinces";
import { AppError } from "@/server/errors";
import { PRO_TRIAL_DAYS, subscriptionState } from "@/domain/subscription";

export const clubSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên CLB.").max(100), location: z.string().trim().max(180).default(""),
  sport_type: z.enum(Object.keys(sports) as [keyof typeof sports, ...(keyof typeof sports)[]]).default("badminton"),
  skill_guidance: z.string().trim().max(500).default(""), default_capacity: z.coerce.number().int().min(1).max(200).default(20),
  default_approval_mode: z.enum(["MANUAL_APPROVE", "AUTO_APPROVE"]).default("MANUAL_APPROVE"),
  cancellation_policy: z.string().trim().max(2000).default(""),
  default_fee_mode: z.enum(["FIXED_PRICE", "COST_SHARING"]).default("FIXED_PRICE"), venue_instructions: z.string().trim().max(2000).default(""),
});
type Settings = z.infer<typeof clubSchema>;
const asColumns = (v: Settings) => ({ name: v.name, location: v.location, sportType: v.sport_type, skillGuidance: v.skill_guidance, defaultCapacity: v.default_capacity, defaultApprovalMode: v.default_approval_mode, cancellationPolicy: v.cancellation_policy, defaultFeeMode: v.default_fee_mode, venueInstructions: v.venue_instructions });
function settingsOf(club: typeof clubs.$inferSelect): Settings { return { name: club.name, location: club.location, sport_type: club.sportType as Settings["sport_type"], skill_guidance: club.skillGuidance, default_capacity: club.defaultCapacity, default_approval_mode: club.defaultApprovalMode as Settings["default_approval_mode"], cancellation_policy: club.cancellationPolicy, default_fee_mode: club.defaultFeeMode as Settings["default_fee_mode"], venue_instructions: club.venueInstructions }; }
function parsedSettings(raw: unknown, previousLocation?: string) {
  const result = clubSchema.safeParse(raw);
  if (!result.success) throw new AppError(400, result.error.issues.map(i => i.message).join(" "));
  // Existing free-text locations remain editable without forcing a data migration.
  // Any newly supplied location must be one of the current province-level names.
  if (result.data.location && result.data.location !== previousLocation && !isVietnamProvince(result.data.location)) {
    throw new AppError(400, "Vui lòng chọn khu vực trong danh sách tỉnh/thành phố Việt Nam.");
  }
  return result.data;
}

export async function listClubs(hostId: number) {
  const rows = await getDb().select({ id: clubs.id, name: clubs.name, location: clubs.location, sportType: clubs.sportType, defaultCapacity: clubs.defaultCapacity, ownerId: clubs.ownerId, role: access.role, permissions: access.permissions }).from(clubs).leftJoin(access, and(eq(access.clubId, clubs.id), eq(access.hostId, hostId))).where(or(eq(clubs.ownerId, hostId), eq(access.hostId, hostId))).orderBy(desc(clubs.id));
  return rows.map(({ ownerId, role, permissions, ...club }) => ({ ...club, owner: ownerId === hostId, rights: ownerId === hostId ? ["manage_session", "manage_bookings", "check_in", "manage_finance", "edit_club_settings"] : capabilities(role ? { role, permissions } : null) }));
}

export async function createClub(hostId: number, raw: unknown) {
  const values = parsedSettings(raw);
  return transaction(async client => {
    const db = drizzle(client);
    const [club] = await db.insert(clubs).values({ ...asColumns(values), ownerId: hostId, trialEndsAt: new Date(Date.now() + PRO_TRIAL_DAYS * 86400000).toISOString() }).returning({ id: clubs.id });
    await db.insert(audit).values({ clubId: club.id, hostId, action: "Tạo CLB", details: JSON.stringify({ before: null, after: values }), createdAt: new Date().toISOString() });
    return club;
  });
}

export async function clubSettings(hostId: number, clubId: number) {
  const { club, owner, rights } = await requireClubAccess(getDb(), hostId, clubId);
  return { id: club.id, ...settingsOf(club), subscription: subscriptionState(club), owner, canEdit: hasPermission(owner, rights, "edit_club_settings"), canContacts: hasPermission(owner, rights, "contacts"), canFinance: hasPermission(owner, rights, "manage_finance") };
}

export async function sessionDefaults(hostId: number, clubId: number) {
  const { club, owner } = await requireClubAccess(getDb(), hostId, clubId, "manage_session");
  return { id: club.id, ...settingsOf(club), proActive: subscriptionState(club).active, proOwner: owner, fixed_fee: club.fixedFee, fixed_fee_male: club.fixedFeeMale, fixed_fee_female: club.fixedFeeFemale };
}

export async function updateClub(hostId: number, clubId: number, raw: Record<string, unknown>) {
  return transaction(async client => {
    const db = drizzle(client);
    await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId)).for("update");
    const { club } = await requireClubAccess(db, hostId, clubId, "edit_club_settings");
    const before = settingsOf(club);
    const values = parsedSettings({ ...before, ...raw }, before.location);
    await db.update(clubs).set(asColumns(values)).where(eq(clubs.id, clubId));
    await db.insert(audit).values({ clubId, hostId, action: "Cập nhật cài đặt CLB", details: JSON.stringify({ before, after: values }), createdAt: new Date().toISOString() });
  });
}
