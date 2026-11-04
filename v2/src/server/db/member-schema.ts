import { integer, varchar, index } from "drizzle-orm/pg-core";
import { clubhost, hostsInClubhost as accounts, membersInClubhost as members } from "./schema";

// Accounts retain their legacy physical table name. A member link never grants host/cohost rights.
export const memberAccountLinks = clubhost.table("member_account_links", {
  memberId: integer("member_id").primaryKey().references(() => members.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  linkedByHostId: integer("linked_by_host_id").references(() => accounts.id, { onDelete: "set null" }),
  linkedAt: varchar("linked_at").notNull(),
}, table => [index("ix_member_account_links_account_id").on(table.accountId)]);
