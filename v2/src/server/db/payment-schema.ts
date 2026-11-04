import { bigint, integer, varchar, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clubhost, clubsInClubhost as clubs, hostsInClubhost as hosts } from "./schema";

// Additive schema; deployed explicitly, never created at application startup.
export const paymentOrders = clubhost.table("payment_orders", {
  orderCode: bigint("order_code", { mode: "number" }).primaryKey(),
  clubId: integer("club_id").references(() => clubs.id, { onDelete: "set null" }),
  hostId: integer("host_id").notNull().references(() => hosts.id),
  clubName: varchar("club_name", { length: 100 }).notNull(),
  amount: integer().notNull(), originalAmount: integer("original_amount").notNull(),
  periodDays: integer("period_days").notNull(),
  status: varchar({ length: 20 }).notNull(),
  paymentLinkId: varchar("payment_link_id", { length: 100 }),
  checkoutUrl: varchar("checkout_url", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true, mode: "string" }),
  activatedUntil: varchar("activated_until"),
}, table => [
  index("ix_payment_orders_club").on(table.clubId, table.createdAt),
  uniqueIndex("uq_payment_orders_link").on(table.paymentLinkId),
  uniqueIndex("uq_payment_orders_active_club").on(table.clubId).where(sql`${table.status} IN ('CREATING','PENDING')`),
  check("ck_payment_order_status", sql`${table.status} IN ('CREATING','PENDING','PAID','CANCELLED','EXPIRED')`),
  check("ck_payment_order_amount", sql`${table.amount} > 0 AND ${table.originalAmount} >= ${table.amount} AND ${table.periodDays} > 0`),
]);
