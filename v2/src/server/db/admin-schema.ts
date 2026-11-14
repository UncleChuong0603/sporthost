import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  timestamp,
  varchar,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { clubhost, hostsInClubhost as accounts } from "./schema";

// Reviewed additive 0003 schema, deployed explicitly before the application release.
export const accountControls = clubhost.table("account_controls", {
  accountId: integer("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  suspended: boolean().notNull().default(false),
});
export const entityRegistry = clubhost.table(
  "entity_registry",
  {
    entityType: varchar("entity_type", { length: 20 }).notNull(),
    entityId: integer("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.entityType, table.entityId] }),
    check(
      "entity_registry_entity_type_check",
      sql`${table.entityType} IN ('user','club','session','host')`,
    ),
    index("ix_entity_registry_created").on(
      table.entityType,
      table.createdAt,
      table.entityId,
    ),
  ],
);
export const adminAuditEvents = clubhost.table(
  "admin_audit_events",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorId: integer("actor_id")
      .notNull()
      .references(() => accounts.id),
    action: varchar({ length: 60 }).notNull(),
    targetType: varchar("target_type", { length: 20 }).notNull(),
    targetId: integer("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    reason: varchar({ length: 500 }).notNull(),
    changes: jsonb().notNull(),
  },
  (table) => [
    index("ix_admin_audit_created").on(table.createdAt.desc(), table.id.desc()),
    index("ix_admin_audit_actor").on(table.actorId, table.createdAt.desc()),
    index("ix_admin_audit_action").on(table.action, table.createdAt.desc()),
    index("ix_admin_audit_target").on(
      table.targetType,
      table.targetId,
      table.id.desc(),
    ),
  ],
);
