import "server-only";
import { and, eq, inArray, ne, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getDb, transaction } from "@/server/db/client";
import { membersInClubhost as members, clubsInClubhost as clubs, bookingsInClubhost as bookings, bookingParticipantsInClubhost as people } from "@/server/db/schema";
import { requireClubAccess } from "@/server/access/permissions";
import { phoneAliases } from "@/domain/catalog";
import { memberSchema } from "@/domain/member";
import { AppError } from "@/server/errors";

export async function listMembers(hostId: number, clubId: number) {
  await requireClubAccess(getDb(), hostId, clubId, "contacts");
  return getDb().select({ id: members.id, name: members.name, phone: members.phone, kind: members.kind, gender: members.gender, level: members.level }).from(members).where(eq(members.clubId, clubId)).orderBy(asc(members.name));
}

export async function saveMember(hostId: number, clubId: number, memberId: number | null, raw: Record<string, unknown>) {
  return transaction(async client => {
    const db = drizzle(client);
    await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId)).for("update");
    await requireClubAccess(db, hostId, clubId, "manage_bookings");
    const [existing] = memberId ? await db.select().from(members).where(and(eq(members.id, memberId), eq(members.clubId, clubId))) : [];
    if (memberId && !existing) throw new AppError(404, "Không tìm thấy thành viên.");
    const parsed = memberSchema.safeParse({ gender: existing?.gender || "unspecified", level: existing?.level || "", ...raw });
    if (!parsed.success) throw new AppError(400, "Kiểm tra tên, số điện thoại, giới tính và loại thành viên.");
    const values = parsed.data;
    const [duplicate] = await db.select({ id: members.id }).from(members).where(and(eq(members.clubId, clubId), inArray(members.phone, phoneAliases(values.phone)), memberId ? ne(members.id, memberId) : undefined));
    if (duplicate) throw new AppError(409, "Số điện thoại này đã có trong câu lạc bộ.", "phone_exists");
    if (!memberId) {
      const [row] = await db.insert(members).values({ ...values, clubId }).returning({ id: members.id });
      return row;
    }
    await db.update(members).set(values).where(eq(members.id, memberId));
    if (existing?.gender !== values.gender) {
      const affected = await db.update(bookings).set({ genderAtBooking: values.gender }).where(and(eq(bookings.memberId, memberId), ne(bookings.status, "confirmed"))).returning({ id: bookings.id });
      if (affected.length) await db.update(people).set({ gender: values.gender }).where(and(inArray(people.bookingId, affected.map(b => b.id)), eq(people.position, 0)));
    }
    return { id: memberId };
  });
}
