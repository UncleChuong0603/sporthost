import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, asc, desc } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";
import { getDb, transaction } from "@/server/db/client";
import { clubsInClubhost as clubs, membersInClubhost as members, monthlyDuesInClubhost as dues, paymentProofsInClubhost as proofs } from "@/server/db/schema";
import { requireClubAccess } from "@/server/access/permissions";
import { auditChange, paymentSnapshot, type Club } from "@/server/modules/bookings/core";
import { moneySchema, optionalMoney } from "@/domain/session-policy";
import { AppError } from "@/server/errors";

export const periodSchema = z.string().regex(/^20\d\d-(0[1-9]|1[0-2])$/);
async function clubActor(db: NodePgDatabase, hostId: number, clubId: number) {
  await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId)).for("update");
  return requireClubAccess(db, hostId, clubId, "manage_finance");
}
function validate<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw); if (!result.success) throw new AppError(400, "Kiểm tra kỳ thu, số tiền và thông tin tài khoản."); return result.data;
}
export function targetPayment(target: { paymentSnapshot: string; qrKey: string | null }, club: Club) {
  const saved = JSON.parse(target.paymentSnapshot || "{}");
  if (Object.keys(saved).length) return saved as ReturnType<typeof paymentSnapshot>;
  return target.qrKey && target.qrKey !== club.qrKey ? { qr_key: null, bank_name: "", account_holder: "", account_number: "", payment_note: "" } : paymentSnapshot(club);
}
export async function clubFinancialSettings(hostId: number, clubId: number) {
  const { club } = await requireClubAccess(getDb(), hostId, clubId, "manage_finance");
  const fixed = await getDb().select({ id: members.id, name: members.name, gender: members.gender }).from(members).where(and(eq(members.clubId, clubId), eq(members.kind, "fixed"))).orderBy(asc(members.name));
  return { id: club.id, name: club.name, payment: paymentSnapshot(club), fixedFee: club.fixedFee, fixedFeeMale: club.fixedFeeMale, fixedFeeFemale: club.fixedFeeFemale, monthlyFee: club.monthlyFee, monthlyFeeMale: club.monthlyFeeMale, monthlyFeeFemale: club.monthlyFeeFemale, fixed };
}
export async function updatePrices(hostId: number, clubId: number, kind: "fixed" | "monthly", raw: unknown) {
  const value = validate(z.object({ amount: moneySchema, male: optionalMoney, female: optionalMoney }), raw);
  return transaction(async client => {
    const db = drizzle(client); const { club } = await clubActor(db, hostId, clubId);
    const next = kind === "fixed" ? { fixedFee: value.amount, fixedFeeMale: value.male, fixedFeeFemale: value.female } : { monthlyFee: value.amount, monthlyFeeMale: value.male, monthlyFeeFemale: value.female };
    await db.update(clubs).set(next).where(eq(clubs.id, clubId));
    await auditChange(db, clubId, hostId, kind === "fixed" ? "Cập nhật phí thành viên cố định" : "Cập nhật mức phí tháng", kind === "fixed" ? { amount: club.fixedFee, male: club.fixedFeeMale, female: club.fixedFeeFemale } : { amount: club.monthlyFee, male: club.monthlyFeeMale, female: club.monthlyFeeFemale }, value);
  });
}
export const bankSchema = z.object({ bankName: z.string().trim().max(80), accountHolder: z.string().trim().max(100), accountNumber: z.string().trim().max(40), paymentNote: z.string().trim().max(160) });
export async function updateBank(hostId: number, clubId: number, raw: unknown) {
  const value = validate(bankSchema, raw);
  return transaction(async client => {
    const db = drizzle(client); const { club } = await clubActor(db, hostId, clubId);
    await db.update(clubs).set(value).where(eq(clubs.id, clubId));
    await auditChange(db, clubId, hostId, "Cập nhật thông tin nhận tiền", paymentSnapshot(club), value);
  });
}
export async function removeQr(hostId: number, clubId: number) {
  return transaction(async client => { const db = drizzle(client); const { club } = await clubActor(db, hostId, clubId); await db.update(clubs).set({ qrKey: null }).where(eq(clubs.id, clubId)); await auditChange(db, clubId, hostId, "Gỡ QR cho đăng ký mới", { qr_key: club.qrKey }, { qr_key: null }); });
}
export async function saveDue(hostId: number, clubId: number, memberId: number, raw: unknown) {
  const value = validate(z.object({ period: periodSchema, amount: moneySchema }), raw);
  return transaction(async client => {
    const db = drizzle(client); const { club } = await clubActor(db, hostId, clubId);
    const [member] = await db.select().from(members).where(and(eq(members.id, memberId), eq(members.clubId, clubId), eq(members.kind, "fixed")));
    if (!member) throw new AppError(400, "Chọn thành viên cố định của CLB.");
    const [old] = await db.select().from(dues).where(and(eq(dues.memberId, memberId), eq(dues.period, value.period))).for("update");
    if (old?.paid && old.amount !== value.amount) throw new AppError(409, "Hoàn tác đã thu trước khi sửa số tiền.");
    const [due] = old ? await db.update(dues).set({ amount: value.amount }).where(eq(dues.id, old.id)).returning() : await db.insert(dues).values({ memberId, ...value, paid: false, accessKey: randomBytes(24).toString("base64url"), qrKey: club.qrKey, paymentSnapshot: JSON.stringify(paymentSnapshot(club)) }).returning();
    await auditChange(db, clubId, hostId, "Tạo / sửa phí tháng", old ? { id: old.id, amount: old.amount } : null, { id: due.id, amount: due.amount, period: due.period }); return due;
  });
}
export async function bulkDues(hostId: number, clubId: number, rawPeriod: string) {
  const period = validate(periodSchema, rawPeriod);
  return transaction(async client => {
    const db = drizzle(client); const { club } = await clubActor(db, hostId, clubId);
    const fixed = await db.select().from(members).where(and(eq(members.clubId, clubId), eq(members.kind, "fixed")));
    let created = 0;
    for (const member of fixed) {
      const override = member.gender === "male" ? club.monthlyFeeMale : member.gender === "female" ? club.monthlyFeeFemale : null;
      const result = await db.insert(dues).values({ memberId: member.id, period, amount: override ?? club.monthlyFee, paid: false, accessKey: randomBytes(24).toString("base64url"), qrKey: club.qrKey, paymentSnapshot: JSON.stringify(paymentSnapshot(club)) }).onConflictDoNothing().returning({ id: dues.id });
      created += result.length;
    }
    await auditChange(db, clubId, hostId, "Tạo phí tháng hàng loạt", null, { period, created }); return created;
  });
}
export async function toggleDue(hostId: number, dueId: number) {
  return transaction(async client => {
    const db = drizzle(client);
    const [record] = await db.select({ due: dues, member: members }).from(dues).innerJoin(members, eq(members.id, dues.memberId)).where(eq(dues.id, dueId));
    if (!record) throw new AppError(404, "Không tìm thấy khoản thu.");
    await clubActor(db, hostId, record.member.clubId);
    const [due] = await db.select().from(dues).where(eq(dues.id, dueId)).for("update");
    await db.update(dues).set({ paid: !due.paid, paymentStatus: due.paid ? "unpaid" : "confirmed" }).where(eq(dues.id, dueId));
    await auditChange(db, record.member.clubId, hostId, "Cập nhật phí tháng", { paid: due.paid }, { id: due.id, paid: !due.paid }); return record.member.clubId;
  });
}
export async function listDues(hostId: number, clubId: number, period?: string) {
  await requireClubAccess(getDb(), hostId, clubId, "manage_finance");
  return getDb().select({ id: dues.id, memberId: dues.memberId, name: members.name, period: dues.period, amount: dues.amount, paid: dues.paid, status: dues.paymentStatus, key: dues.accessKey }).from(dues).innerJoin(members, eq(members.id, dues.memberId)).where(and(eq(members.clubId, clubId), period ? eq(dues.period, validate(periodSchema, period)) : undefined)).orderBy(desc(dues.period), asc(members.name));
}
export async function dueContext(db: NodePgDatabase, key: string, lock = false) {
  if (!/^[A-Za-z0-9_-]{24,256}$/.test(key)) throw new AppError(404, "Không tìm thấy khoản thu.");
  const query = db.select().from(dues).where(eq(dues.accessKey, key));
  const [due] = await (lock ? query.for("update") : query);
  if (!due) throw new AppError(404, "Không tìm thấy khoản thu.");
  const [member] = await db.select().from(members).where(eq(members.id, due.memberId));
  const [club] = await db.select().from(clubs).where(eq(clubs.id, member.clubId));
  return { due, member, club };
}
export async function duePage(key: string) {
  const db = getDb(); const { due, member, club } = await dueContext(db, key);
  const [reported] = await db.select({ id: proofs.id }).from(proofs).where(and(eq(proofs.dueId, due.id), eq(proofs.status, "reported"))).limit(1);
  return { id: due.id, name: member.name, clubName: club.name, period: due.period, amount: due.amount, status: due.paymentStatus, paid: due.paid, canReport: !due.paid && !reported, payment: targetPayment(due, club) };
}
