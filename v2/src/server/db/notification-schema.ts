import { integer, serial, varchar, boolean, index, unique } from "drizzle-orm/pg-core";
import { clubhost, hostsInClubhost as accounts, membersInClubhost as members, clubsInClubhost as clubs, bookingsInClubhost as bookings, monthlyDuesInClubhost as dues } from "./schema";
export const notifications = clubhost.table("notifications", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  clubId: integer("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
  dueId: integer("due_id").references(() => dues.id, { onDelete: "cascade" }),
  eventKey: varchar("event_key", { length: 200 }).notNull(), kind: varchar("kind", { length: 40 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(), createdAt: varchar("created_at").notNull(), readAt: varchar("read_at"),
}, table => [index("ix_notifications_account_id").on(table.accountId, table.id.desc()), index("ix_notifications_booking_id").on(table.bookingId, table.id.desc()), index("ix_notifications_due_id").on(table.dueId), index("ix_notifications_member_id").on(table.memberId), index("ix_notifications_club_id").on(table.clubId), unique("notifications_event_unique").on(table.accountId, table.eventKey)]);
export const notificationPreferences = clubhost.table("notification_preferences", {
  accountId: integer("account_id").primaryKey().references(() => accounts.id, { onDelete: "cascade" }),
  remindersEnabled: boolean("reminders_enabled").notNull().default(false), updatedAt: varchar("updated_at").notNull(),
});
export const reminderSettings = clubhost.table("reminder_settings", {
  clubId: integer("club_id").primaryKey().references(() => clubs.id, { onDelete: "cascade" }),
  rsvpEnabled: boolean("rsvp_enabled").notNull().default(false), paymentEnabled: boolean("payment_enabled").notNull().default(false),
  rsvpLeadHours: integer("rsvp_lead_hours").notNull().default(24), paymentIntervalDays: integer("payment_interval_days").notNull().default(3), updatedAt: varchar("updated_at").notNull(),
});
