import { integer, varchar, primaryKey, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clubhost, hostsInClubhost as accounts, clubsInClubhost as clubs } from "./schema";
export const hostTourPreferences = clubhost.table("host_tour_preferences", {
  accountId: integer("account_id").primaryKey().references(() => accounts.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("new"), missionId: varchar("mission_id", { length: 40 }),
  clubId: integer("club_id").references(() => clubs.id, { onDelete: "set null" }),
  revision: integer("revision").notNull().default(0), updatedAt: varchar("updated_at").notNull(),
}, t => [index("ix_host_tour_preferences_club").on(t.clubId), check("host_tour_preferences_status_check", sql`${t.status} IN ('new','active','paused','dismissed')`), check("host_tour_preferences_revision_check", sql`${t.revision} >= 0`)]);
export const hostTourProgress = clubhost.table("host_tour_progress", {
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  clubId: integer("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  missionId: varchar("mission_id", { length: 40 }).notNull(), completedAt: varchar("completed_at"), skippedAt: varchar("skipped_at"),
}, t => [primaryKey({ columns: [t.accountId, t.clubId, t.missionId] }), index("ix_host_tour_progress_club").on(t.clubId)]);
