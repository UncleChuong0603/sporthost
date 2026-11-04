// Reviewed read model of existing clubhost at Alembic 0011. Never apply generated CREATE SQL to production.
// drizzle-kit empty-string defaults and composite-key ordering corrected against native catalog.
import { pgSchema, varchar, index, foreignKey, unique, check, serial, integer, uniqueIndex, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const clubhost = pgSchema("clubhost");


export const alembicVersionInClubhost = clubhost.table("alembic_version", {
	versionNum: varchar("version_num", { length: 32 }).primaryKey().notNull(),
});

export const membersInClubhost = clubhost.table("members", {
	id: serial().primaryKey().notNull(),
	clubId: integer("club_id").notNull(),
	name: varchar().notNull(),
	phone: varchar().notNull(),
	kind: varchar().notNull(),
	level: varchar().notNull(),
	gender: varchar().default('unspecified').notNull(),
}, (table) => [
	index("ix_members_club_id").using("btree", table.clubId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubsInClubhost.id],
			name: "members_club_id_fkey"
		}),
	unique("uq_member_phone").on(table.clubId, table.phone),
	check("ck_member_gender", sql`(gender)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying, 'unspecified'::character varying])::text[])`),
]);

export const hostsInClubhost = clubhost.table("hosts", {
	id: serial().primaryKey().notNull(),
	email: varchar().notNull(),
	passwordHash: varchar("password_hash").notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	isPlatformAdmin: boolean("is_platform_admin").default(false).notNull(),
	sessionVersion: integer("session_version").default(0).notNull(),
}, (table) => [
	uniqueIndex("ix_hosts_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
]);

export const requestLimitsInClubhost = clubhost.table("request_limits", {
	id: varchar({ length: 80 }).primaryKey().notNull(),
	bucket: integer().notNull(),
	hits: integer().notNull(),
});

export const recurringRulesInClubhost = clubhost.table("recurring_rules", {
	id: serial().primaryKey().notNull(),
	clubId: integer("club_id").notNull(),
	title: varchar().notNull(),
	venue: varchar().notNull(),
	firstStart: varchar("first_start").notNull(),
	weeks: integer().notNull(),
	capacity: integer().notNull(),
	fixedFee: integer("fixed_fee").notNull(),
	guestFee: integer("guest_fee").notNull(),
	fixedFeeMale: integer("fixed_fee_male"),
	fixedFeeFemale: integer("fixed_fee_female"),
	guestFeeMale: integer("guest_fee_male"),
	guestFeeFemale: integer("guest_fee_female"),
	capacityMale: integer("capacity_male"),
	capacityFemale: integer("capacity_female"),
	rsvpHours: integer("rsvp_hours").notNull(),
	active: boolean().notNull(),
	policyJson: varchar("policy_json").default('{}').notNull(),
}, (table) => [
	index("ix_recurring_rules_club_id").using("btree", table.clubId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubsInClubhost.id],
			name: "recurring_rules_club_id_fkey"
		}),
]);

export const clubAccessInClubhost = clubhost.table("club_access", {
	id: serial().primaryKey().notNull(),
	clubId: integer("club_id").notNull(),
	hostId: integer("host_id").notNull(),
	role: varchar().notNull(),
	permissions: varchar(),
}, (table) => [
	index("ix_club_access_club_id").using("btree", table.clubId.asc().nullsLast().op("int4_ops")),
	index("ix_club_access_host_id").using("btree", table.hostId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubsInClubhost.id],
			name: "club_access_club_id_fkey"
		}),
	foreignKey({
			columns: [table.hostId],
			foreignColumns: [hostsInClubhost.id],
			name: "club_access_host_id_fkey"
		}),
	unique("uq_club_cohost").on(table.clubId, table.hostId),
]);

export const auditLogsInClubhost = clubhost.table("audit_logs", {
	id: serial().primaryKey().notNull(),
	clubId: integer("club_id"),
	hostId: integer("host_id"),
	action: varchar().notNull(),
	details: varchar().notNull(),
	createdAt: varchar("created_at").notNull(),
}, (table) => [
	index("ix_audit_logs_club_id").using("btree", table.clubId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubsInClubhost.id],
			name: "audit_logs_club_id_fkey"
		}),
	foreignKey({
			columns: [table.hostId],
			foreignColumns: [hostsInClubhost.id],
			name: "audit_logs_host_id_fkey"
		}),
]);

export const storedAssetsInClubhost = clubhost.table("stored_assets", {
	id: serial().primaryKey().notNull(),
	clubId: integer("club_id").notNull(),
	key: varchar().notNull(),
	kind: varchar().notNull(),
	sha256: varchar().notNull(),
	size: integer().notNull(),
	createdAt: varchar("created_at").notNull(),
}, (table) => [
	index("ix_stored_assets_club_id").using("btree", table.clubId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubsInClubhost.id],
			name: "stored_assets_club_id_fkey"
		}),
	unique("stored_assets_key_key").on(table.key),
]);

export const emailTokensInClubhost = clubhost.table("email_tokens", {
	id: serial().primaryKey().notNull(),
	hostId: integer("host_id").notNull(),
	purpose: varchar().notNull(),
	digest: varchar().notNull(),
	expiresAt: varchar("expires_at").notNull(),
	used: boolean().notNull(),
}, (table) => [
	index("ix_email_tokens_host_id").using("btree", table.hostId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.hostId],
			foreignColumns: [hostsInClubhost.id],
			name: "email_tokens_host_id_fkey"
		}),
	unique("email_tokens_digest_key").on(table.digest),
]);

export const subscriptionRequestsInClubhost = clubhost.table("subscription_requests", {
	id: serial().primaryKey().notNull(),
	clubId: integer("club_id").notNull(),
	months: integer().notNull(),
	amount: integer().notNull(),
	status: varchar().notNull(),
	reference: varchar().notNull(),
	createdAt: varchar("created_at").notNull(),
	reviewedAt: varchar("reviewed_at"),
	reviewedBy: integer("reviewed_by"),
}, (table) => [
	index("ix_subscription_requests_club_id").using("btree", table.clubId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubsInClubhost.id],
			name: "subscription_requests_club_id_fkey"
		}),
	foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [hostsInClubhost.id],
			name: "subscription_requests_reviewed_by_fkey"
		}),
]);

export const bookingsInClubhost = clubhost.table("bookings", {
	id: serial().primaryKey().notNull(),
	sessionId: integer("session_id").notNull(),
	memberId: integer("member_id").notNull(),
	status: varchar().notNull(),
	paid: boolean().notNull(),
	attended: boolean().notNull(),
	feeAmount: integer("fee_amount"),
	accessKey: varchar("access_key").default('').notNull(),
	qrKey: varchar("qr_key"),
	paymentStatus: varchar("payment_status").default('unpaid').notNull(),
	genderAtBooking: varchar("gender_at_booking").default('unspecified').notNull(),
	tokenNonce: varchar("token_nonce").default('').notNull(),
	tokenDigest: varchar("token_digest").default('').notNull(),
	channel: varchar().default('direct').notNull(),
	decisionReason: varchar("decision_reason").default('').notNull(),
	policySnapshot: varchar("policy_snapshot").default('{}').notNull(),
	legacyTokenDigest: varchar("legacy_token_digest"),
	tokenExpiresAt: varchar("token_expires_at"),
	tokenRevoked: boolean("token_revoked").default(false).notNull(),
	payerMode: varchar("payer_mode").default('GROUP').notNull(),
	paymentSnapshot: varchar("payment_snapshot").default('{}').notNull(),
}, (table) => [
	index("ix_bookings_legacy_token_digest").using("btree", table.legacyTokenDigest.asc().nullsLast().op("text_ops")),
	index("ix_bookings_member_id").using("btree", table.memberId.asc().nullsLast().op("int4_ops")),
	index("ix_bookings_session_id").using("btree", table.sessionId.asc().nullsLast().op("int4_ops")),
	index("ix_bookings_token_digest").using("btree", table.tokenDigest.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [gameSessionsInClubhost.id],
			name: "bookings_session_id_fkey"
		}),
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [membersInClubhost.id],
			name: "bookings_member_id_fkey"
		}),
	unique("uq_booking_member_session").on(table.sessionId, table.memberId),
	check("ck_booking_payer_mode", sql`(payer_mode)::text = ANY ((ARRAY['GROUP'::character varying, 'SPLIT'::character varying])::text[])`),
]);

export const clubsInClubhost = clubhost.table("clubs", {
	id: serial().primaryKey().notNull(),
	ownerId: integer("owner_id").notNull(),
	name: varchar().notNull(),
	location: varchar().notNull(),
	bankName: varchar("bank_name").default('').notNull(),
	accountHolder: varchar("account_holder").default('').notNull(),
	accountNumber: varchar("account_number").default('').notNull(),
	paymentNote: varchar("payment_note").default('').notNull(),
	monthlyFee: integer("monthly_fee").default(300000).notNull(),
	monthlyFeeMale: integer("monthly_fee_male"),
	monthlyFeeFemale: integer("monthly_fee_female"),
	qrKey: varchar("qr_key"),
	trialEndsAt: varchar("trial_ends_at"),
	proEndsAt: varchar("pro_ends_at"),
	sportType: varchar("sport_type").default('badminton').notNull(),
	skillGuidance: varchar("skill_guidance").default('').notNull(),
	defaultApprovalMode: varchar("default_approval_mode").default('MANUAL_APPROVE').notNull(),
	cancellationPolicy: varchar("cancellation_policy").default('').notNull(),
	defaultFeeMode: varchar("default_fee_mode").default('FIXED_PRICE').notNull(),
	venueInstructions: varchar("venue_instructions").default('').notNull(),
	defaultCapacity: integer("default_capacity").default(20).notNull(),
	fixedFee: integer("fixed_fee").default(50000).notNull(),
	fixedFeeMale: integer("fixed_fee_male"),
	fixedFeeFemale: integer("fixed_fee_female"),
}, (table) => [
	index("ix_clubs_owner_id").using("btree", table.ownerId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [hostsInClubhost.id],
			name: "clubs_owner_id_fkey"
		}),
	check("ck_club_default_capacity", sql`(default_capacity >= 1) AND (default_capacity <= 200)`),
	check("ck_club_approval_mode", sql`(default_approval_mode)::text = ANY ((ARRAY['MANUAL_APPROVE'::character varying, 'AUTO_APPROVE'::character varying])::text[])`),
	check("ck_club_fee_mode", sql`(default_fee_mode)::text = ANY ((ARRAY['COST_SHARING'::character varying, 'FIXED_PRICE'::character varying])::text[])`),
]);

export const monthlyDuesInClubhost = clubhost.table("monthly_dues", {
	id: serial().primaryKey().notNull(),
	memberId: integer("member_id").notNull(),
	period: varchar().notNull(),
	amount: integer().notNull(),
	paid: boolean().notNull(),
	accessKey: varchar("access_key").default('').notNull(),
	qrKey: varchar("qr_key"),
	paymentStatus: varchar("payment_status").default('unpaid').notNull(),
	paymentSnapshot: varchar("payment_snapshot").default('{}').notNull(),
}, (table) => [
	index("ix_monthly_dues_member_id").using("btree", table.memberId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [membersInClubhost.id],
			name: "monthly_dues_member_id_fkey"
		}),
	unique("uq_member_month").on(table.memberId, table.period),
]);

export const gameSessionsInClubhost = clubhost.table("game_sessions", {
	id: serial().primaryKey().notNull(),
	clubId: integer("club_id").notNull(),
	publicId: varchar("public_id").notNull(),
	title: varchar().notNull(),
	venue: varchar().notNull(),
	startsAt: varchar("starts_at").notNull(),
	capacity: integer().notNull(),
	fixedFee: integer("fixed_fee").notNull(),
	guestFee: integer("guest_fee").notNull(),
	isOpen: boolean("is_open").notNull(),
	fixedFeeMale: integer("fixed_fee_male"),
	fixedFeeFemale: integer("fixed_fee_female"),
	guestFeeMale: integer("guest_fee_male"),
	guestFeeFemale: integer("guest_fee_female"),
	recurringRuleId: integer("recurring_rule_id"),
	rsvpDeadline: varchar("rsvp_deadline"),
	isCancelled: boolean("is_cancelled").default(false).notNull(),
	capacityMale: integer("capacity_male"),
	capacityFemale: integer("capacity_female"),
	approvalMode: varchar("approval_mode").default('MANUAL_APPROVE').notNull(),
	sportSnapshot: varchar("sport_snapshot").default('badminton').notNull(),
	skillGuidance: varchar("skill_guidance").default('').notNull(),
	venueInstructions: varchar("venue_instructions").default('').notNull(),
	cancellationPolicy: varchar("cancellation_policy").default('').notNull(),
	participationConditions: varchar("participation_conditions").default('').notNull(),
	mapsUrl: varchar("maps_url").default('').notNull(),
	registrationDeadline: varchar("registration_deadline"),
	cancellationDeadline: varchar("cancellation_deadline"),
	lifecycleStatus: varchar("lifecycle_status").default('OPEN').notNull(),
	attendanceLocked: boolean("attendance_locked").default(false).notNull(),
	feeMode: varchar("fee_mode").default('FIXED_PRICE').notNull(),
	noShowPolicy: varchar("no_show_policy").default('FREE').notNull(),
	monthlyPolicy: varchar("monthly_policy").default('SESSION_FEE').notNull(),
}, (table) => [
	index("ix_game_sessions_club_id").using("btree", table.clubId.asc().nullsLast().op("int4_ops")),
	uniqueIndex("ix_game_sessions_public_id").using("btree", table.publicId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubsInClubhost.id],
			name: "game_sessions_club_id_fkey"
		}),
	foreignKey({
			columns: [table.recurringRuleId],
			foreignColumns: [recurringRulesInClubhost.id],
			name: "game_sessions_recurring_rule_id_fkey"
		}),
	unique("uq_rule_occurrence").on(table.recurringRuleId, table.startsAt),
	check("ck_session_approval_mode", sql`(approval_mode)::text = ANY ((ARRAY['AUTO_APPROVE'::character varying, 'MANUAL_APPROVE'::character varying])::text[])`),
	check("ck_session_lifecycle", sql`(lifecycle_status)::text = ANY ((ARRAY['DRAFT'::character varying, 'OPEN'::character varying, 'IN_PROGRESS'::character varying, 'PLAY_FINISHED'::character varying, 'SETTLED'::character varying, 'CANCELLED'::character varying])::text[])`),
	check("ck_session_fee_mode", sql`(fee_mode)::text = ANY ((ARRAY['FIXED_PRICE'::character varying, 'COST_SHARING'::character varying])::text[])`),
	check("ck_session_no_show", sql`(no_show_policy)::text = ANY ((ARRAY['FREE'::character varying, 'FULL'::character varying])::text[])`),
	check("ck_session_monthly_policy", sql`(monthly_policy)::text = ANY ((ARRAY['EXEMPT_PAID'::character varying, 'SESSION_FEE'::character varying])::text[])`),
]);

export const bookingParticipantsInClubhost = clubhost.table("booking_participants", {
	id: serial().primaryKey().notNull(),
	bookingId: integer("booking_id").notNull(),
	memberId: integer("member_id"),
	position: integer().notNull(),
	name: varchar().notNull(),
	gender: varchar().default('unspecified').notNull(),
	level: varchar().default('').notNull(),
	feeAmount: integer("fee_amount").default(0).notNull(),
	attendanceStatus: varchar("attendance_status").default('NOT_MARKED').notNull(),
	arrivedAt: varchar("arrived_at"),
	leftAt: varchar("left_at"),
	attendanceActorId: integer("attendance_actor_id"),
	attendanceVersion: integer("attendance_version").default(0).notNull(),
	chargeExempt: boolean("charge_exempt").default(false).notNull(),
	feeDiscount: integer("fee_discount").default(0).notNull(),
	adjustmentReason: varchar("adjustment_reason").default('').notNull(),
}, (table) => [
	index("ix_booking_participants_booking_id").using("btree", table.bookingId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookingsInClubhost.id],
			name: "booking_participants_booking_id_fkey"
		}),
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [membersInClubhost.id],
			name: "booking_participants_member_id_fkey"
		}),
	foreignKey({
			columns: [table.attendanceActorId],
			foreignColumns: [hostsInClubhost.id],
			name: "booking_participants_attendance_actor_id_fkey"
		}),
	unique("uq_booking_participant_position").on(table.bookingId, table.position),
	check("ck_participant_gender", sql`(gender)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying, 'unspecified'::character varying])::text[])`),
	check("ck_participant_fee", sql`fee_amount >= 0`),
	check("ck_participant_attendance", sql`(attendance_status)::text = ANY ((ARRAY['NOT_MARKED'::character varying, 'CHECKED_IN'::character varying, 'NO_SHOW'::character varying])::text[])`),
]);

export const paymentProofsInClubhost = clubhost.table("payment_proofs", {
	id: serial().primaryKey().notNull(),
	bookingId: integer("booking_id"),
	dueId: integer("due_id"),
	assetId: integer("asset_id").notNull(),
	status: varchar().notNull(),
	reviewedBy: integer("reviewed_by"),
	createdAt: varchar("created_at").notNull(),
	reviewedAt: varchar("reviewed_at"),
	note: varchar().notNull(),
	reportedAmount: integer("reported_amount"),
	payerParticipantId: integer("payer_participant_id"),
}, (table) => [
	index("ix_payment_proofs_booking_id").using("btree", table.bookingId.asc().nullsLast().op("int4_ops")),
	index("ix_payment_proofs_due_id").using("btree", table.dueId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookingsInClubhost.id],
			name: "payment_proofs_booking_id_fkey"
		}),
	foreignKey({
			columns: [table.dueId],
			foreignColumns: [monthlyDuesInClubhost.id],
			name: "payment_proofs_due_id_fkey"
		}),
	foreignKey({
			columns: [table.assetId],
			foreignColumns: [storedAssetsInClubhost.id],
			name: "payment_proofs_asset_id_fkey"
		}),
	foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [hostsInClubhost.id],
			name: "payment_proofs_reviewed_by_fkey"
		}),
	foreignKey({
			columns: [table.payerParticipantId],
			foreignColumns: [bookingParticipantsInClubhost.id],
			name: "payment_proofs_payer_participant_id_fkey"
		}),
]);

export const expensesInClubhost = clubhost.table("expenses", {
	id: serial().primaryKey().notNull(),
	sessionId: integer("session_id").notNull(),
	title: varchar().notNull(),
	amount: integer().notNull(),
	category: varchar().default('OTHER').notNull(),
	note: varchar().default('').notNull(),
	createdBy: integer("created_by"),
	createdAt: varchar("created_at"),
	allocated: boolean().default(true).notNull(),
}, (table) => [
	index("ix_expenses_session_id").using("btree", table.sessionId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [gameSessionsInClubhost.id],
			name: "expenses_session_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [hostsInClubhost.id],
			name: "expenses_created_by_fkey"
		}),
	check("ck_expense_category", sql`(category)::text = ANY ((ARRAY['COURT'::character varying, 'EQUIPMENT'::character varying, 'OTHER'::character varying])::text[])`),
]);

export const chargeBatchesInClubhost = clubhost.table("charge_batches", {
	id: serial().primaryKey().notNull(),
	sessionId: integer("session_id").notNull(),
	version: integer().notNull(),
	snapshot: varchar().notNull(),
	issuedBy: integer("issued_by").notNull(),
	issuedAt: varchar("issued_at").notNull(),
	closedAt: varchar("closed_at"),
}, (table) => [
	index("ix_charge_batches_session_id").using("btree", table.sessionId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [gameSessionsInClubhost.id],
			name: "charge_batches_session_id_fkey"
		}),
	foreignKey({
			columns: [table.issuedBy],
			foreignColumns: [hostsInClubhost.id],
			name: "charge_batches_issued_by_fkey"
		}),
	unique("uq_session_charge_batch").on(table.sessionId),
]);

export const chargesInClubhost = clubhost.table("charges", {
	id: serial().primaryKey().notNull(),
	batchId: integer("batch_id").notNull(),
	bookingId: integer("booking_id").notNull(),
	participantId: integer("participant_id").notNull(),
	payerParticipantId: integer("payer_participant_id"),
	amount: integer().notNull(),
	detail: varchar().notNull(),
}, (table) => [
	index("ix_charges_batch_id").using("btree", table.batchId.asc().nullsLast().op("int4_ops")),
	index("ix_charges_booking_id").using("btree", table.bookingId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [chargeBatchesInClubhost.id],
			name: "charges_batch_id_fkey"
		}),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookingsInClubhost.id],
			name: "charges_booking_id_fkey"
		}),
	foreignKey({
			columns: [table.participantId],
			foreignColumns: [bookingParticipantsInClubhost.id],
			name: "charges_participant_id_fkey"
		}),
	foreignKey({
			columns: [table.payerParticipantId],
			foreignColumns: [bookingParticipantsInClubhost.id],
			name: "charges_payer_participant_id_fkey"
		}),
	unique("uq_batch_participant").on(table.batchId, table.participantId),
	check("ck_charge_nonnegative", sql`amount >= 0`),
]);

export const moneyMovementsInClubhost = clubhost.table("money_movements", {
	id: serial().primaryKey().notNull(),
	sessionId: integer("session_id").notNull(),
	bookingId: integer("booking_id").notNull(),
	payerParticipantId: integer("payer_participant_id"),
	amount: integer().notNull(),
	kind: varchar().notNull(),
	source: varchar().notNull(),
	reference: varchar().notNull(),
	reason: varchar().notNull(),
	confirmedBy: integer("confirmed_by").notNull(),
	occurredAt: varchar("occurred_at").notNull(),
	createdAt: varchar("created_at").notNull(),
	requestKey: varchar("request_key").notNull(),
	proofId: integer("proof_id"),
	reversesId: integer("reverses_id"),
}, (table) => [
	index("ix_money_movements_booking_id").using("btree", table.bookingId.asc().nullsLast().op("int4_ops")),
	index("ix_money_movements_session_id").using("btree", table.sessionId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [gameSessionsInClubhost.id],
			name: "money_movements_session_id_fkey"
		}),
	foreignKey({
			columns: [table.bookingId],
			foreignColumns: [bookingsInClubhost.id],
			name: "money_movements_booking_id_fkey"
		}),
	foreignKey({
			columns: [table.payerParticipantId],
			foreignColumns: [bookingParticipantsInClubhost.id],
			name: "money_movements_payer_participant_id_fkey"
		}),
	foreignKey({
			columns: [table.confirmedBy],
			foreignColumns: [hostsInClubhost.id],
			name: "money_movements_confirmed_by_fkey"
		}),
	foreignKey({
			columns: [table.proofId],
			foreignColumns: [paymentProofsInClubhost.id],
			name: "money_movements_proof_id_fkey"
		}),
	foreignKey({
			columns: [table.reversesId],
			foreignColumns: [table.id],
			name: "money_movements_reverses_id_fkey"
		}),
	unique("uq_money_request").on(table.sessionId, table.requestKey),
	unique("uq_money_proof").on(table.proofId),
	unique("uq_money_reversal").on(table.reversesId),
	check("ck_money_nonzero", sql`amount <> 0`),
	check("ck_money_sign", sql`(((kind)::text = 'RECEIVED'::text) AND (amount > 0)) OR (((kind)::text = 'REFUND_RECORDED'::text) AND (amount < 0)) OR ((kind)::text = 'REVERSAL'::text)`),
	check("ck_money_kind", sql`(kind)::text = ANY ((ARRAY['RECEIVED'::character varying, 'REFUND_RECORDED'::character varying, 'REVERSAL'::character varying])::text[])`),
	check("ck_money_source", sql`(source)::text = ANY ((ARRAY['BANK_TRANSFER'::character varying, 'CASH'::character varying, 'OTHER'::character varying])::text[])`),
]);

export const chargeAdjustmentsInClubhost = clubhost.table("charge_adjustments", {
	id: serial().primaryKey().notNull(),
	batchId: integer("batch_id").notNull(),
	chargeId: integer("charge_id").notNull(),
	amount: integer().notNull(),
	version: integer().notNull(),
	reason: varchar().notNull(),
	createdBy: integer("created_by").notNull(),
	createdAt: varchar("created_at").notNull(),
	requestKey: varchar("request_key").notNull(),
}, (table) => [
	index("ix_charge_adjustments_batch_id").using("btree", table.batchId.asc().nullsLast().op("int4_ops")),
	index("ix_charge_adjustments_charge_id").using("btree", table.chargeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.batchId],
			foreignColumns: [chargeBatchesInClubhost.id],
			name: "charge_adjustments_batch_id_fkey"
		}),
	foreignKey({
			columns: [table.chargeId],
			foreignColumns: [chargesInClubhost.id],
			name: "charge_adjustments_charge_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [hostsInClubhost.id],
			name: "charge_adjustments_created_by_fkey"
		}),
	unique("uq_adjustment_version").on(table.batchId, table.version),
	unique("uq_adjustment_request").on(table.batchId, table.requestKey),
	check("ck_adjustment_nonzero", sql`amount <> 0`),
]);

export const platformLedgerEntriesInClubhost = clubhost.table("platform_ledger_entries", {
	id: serial().primaryKey().notNull(),
	entryDate: varchar("entry_date").notNull(),
	direction: varchar().notNull(),
	category: varchar().notNull(),
	amount: integer().notNull(),
	note: varchar().notNull(),
	createdBy: integer("created_by").notNull(),
	createdAt: varchar("created_at").notNull(),
	updatedBy: integer("updated_by"),
	updatedAt: varchar("updated_at"),
	version: integer().notNull(),
	requestKey: varchar("request_key").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [hostsInClubhost.id],
			name: "platform_ledger_entries_created_by_fkey"
		}),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [hostsInClubhost.id],
			name: "platform_ledger_entries_updated_by_fkey"
		}),
	unique("platform_ledger_entries_request_key_key").on(table.requestKey),
	check("ck_platform_amount", sql`amount > 0`),
	check("ck_platform_direction", sql`(direction)::text = ANY ((ARRAY['INCOME'::character varying, 'EXPENSE'::character varying])::text[])`),
]);
