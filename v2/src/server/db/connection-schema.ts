import { boolean, integer, serial, varchar, index, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clubhost, clubsInClubhost as clubs, hostsInClubhost as accounts, membersInClubhost as members } from "./schema";

export const connectionInvites = clubhost.table("club_connection_invites", {
  clubId: integer("club_id").primaryKey().references(() => clubs.id, { onDelete: "cascade" }),
  token: varchar({ length: 48 }).notNull().unique(),
  enabled: boolean().notNull().default(true),
  createdBy: integer("created_by").references(() => accounts.id, { onDelete: "set null" }),
  createdAt: varchar("created_at").notNull(),
});
export const connectionRequests = clubhost.table("club_connection_requests", {
  id: serial().primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  name: varchar({ length: 100 }).notNull(), note: varchar({ length: 500 }).notNull().default(""),
  status: varchar().notNull(),
  memberId: integer("member_id").references(() => members.id, { onDelete: "set null" }),
  reviewedBy: integer("reviewed_by").references(() => accounts.id, { onDelete: "set null" }),
  requestedAt: varchar("requested_at").notNull(), reviewedAt: varchar("reviewed_at"), reason: varchar({ length: 500 }).notNull().default(""),
}, table => [unique().on(table.clubId, table.accountId), index("ix_connection_requests_account").on(table.accountId), index("ix_connection_requests_queue").on(table.clubId, table.status), check("connection_request_status", sql`${table.status} IN ('pending','approved','rejected','cancelled')`)]);
