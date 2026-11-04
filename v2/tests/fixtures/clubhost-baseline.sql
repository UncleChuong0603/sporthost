--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: clubhost; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA clubhost;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.audit_logs (
    id integer NOT NULL,
    club_id integer,
    host_id integer,
    action character varying NOT NULL,
    details character varying NOT NULL,
    created_at character varying NOT NULL
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.audit_logs_id_seq OWNED BY clubhost.audit_logs.id;


--
-- Name: booking_participants; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.booking_participants (
    id integer NOT NULL,
    booking_id integer NOT NULL,
    member_id integer,
    "position" integer NOT NULL,
    name character varying NOT NULL,
    gender character varying DEFAULT 'unspecified'::character varying NOT NULL,
    level character varying DEFAULT ''::character varying NOT NULL,
    fee_amount integer DEFAULT 0 NOT NULL,
    attendance_status character varying DEFAULT 'NOT_MARKED'::character varying NOT NULL,
    arrived_at character varying,
    left_at character varying,
    attendance_actor_id integer,
    attendance_version integer DEFAULT 0 NOT NULL,
    charge_exempt boolean DEFAULT false NOT NULL,
    fee_discount integer DEFAULT 0 NOT NULL,
    adjustment_reason character varying DEFAULT ''::character varying NOT NULL,
    CONSTRAINT ck_participant_attendance CHECK (((attendance_status)::text = ANY ((ARRAY['NOT_MARKED'::character varying, 'CHECKED_IN'::character varying, 'NO_SHOW'::character varying])::text[]))),
    CONSTRAINT ck_participant_fee CHECK ((fee_amount >= 0)),
    CONSTRAINT ck_participant_gender CHECK (((gender)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying, 'unspecified'::character varying])::text[])))
);


--
-- Name: booking_participants_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.booking_participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: booking_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.booking_participants_id_seq OWNED BY clubhost.booking_participants.id;


--
-- Name: bookings; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.bookings (
    id integer NOT NULL,
    session_id integer NOT NULL,
    member_id integer NOT NULL,
    status character varying NOT NULL,
    paid boolean NOT NULL,
    attended boolean NOT NULL,
    fee_amount integer,
    access_key character varying DEFAULT ''::character varying NOT NULL,
    qr_key character varying,
    payment_status character varying DEFAULT 'unpaid'::character varying NOT NULL,
    gender_at_booking character varying DEFAULT 'unspecified'::character varying NOT NULL,
    token_nonce character varying DEFAULT ''::character varying NOT NULL,
    token_digest character varying DEFAULT ''::character varying NOT NULL,
    channel character varying DEFAULT 'direct'::character varying NOT NULL,
    decision_reason character varying DEFAULT ''::character varying NOT NULL,
    policy_snapshot character varying DEFAULT '{}'::character varying NOT NULL,
    legacy_token_digest character varying,
    token_expires_at character varying,
    token_revoked boolean DEFAULT false NOT NULL,
    payer_mode character varying DEFAULT 'GROUP'::character varying NOT NULL,
    payment_snapshot character varying DEFAULT '{}'::character varying NOT NULL,
    CONSTRAINT ck_booking_payer_mode CHECK (((payer_mode)::text = ANY ((ARRAY['GROUP'::character varying, 'SPLIT'::character varying])::text[])))
);


--
-- Name: bookings_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.bookings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bookings_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.bookings_id_seq OWNED BY clubhost.bookings.id;


--
-- Name: charge_adjustments; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.charge_adjustments (
    id integer NOT NULL,
    batch_id integer NOT NULL,
    charge_id integer NOT NULL,
    amount integer NOT NULL,
    version integer NOT NULL,
    reason character varying NOT NULL,
    created_by integer NOT NULL,
    created_at character varying NOT NULL,
    request_key character varying NOT NULL,
    CONSTRAINT ck_adjustment_nonzero CHECK ((amount <> 0))
);


--
-- Name: charge_adjustments_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.charge_adjustments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: charge_adjustments_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.charge_adjustments_id_seq OWNED BY clubhost.charge_adjustments.id;


--
-- Name: charge_batches; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.charge_batches (
    id integer NOT NULL,
    session_id integer NOT NULL,
    version integer NOT NULL,
    snapshot character varying NOT NULL,
    issued_by integer NOT NULL,
    issued_at character varying NOT NULL,
    closed_at character varying
);


--
-- Name: charge_batches_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.charge_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: charge_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.charge_batches_id_seq OWNED BY clubhost.charge_batches.id;


--
-- Name: charges; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.charges (
    id integer NOT NULL,
    batch_id integer NOT NULL,
    booking_id integer NOT NULL,
    participant_id integer NOT NULL,
    payer_participant_id integer,
    amount integer NOT NULL,
    detail character varying NOT NULL,
    CONSTRAINT ck_charge_nonnegative CHECK ((amount >= 0))
);


--
-- Name: charges_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.charges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: charges_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.charges_id_seq OWNED BY clubhost.charges.id;


--
-- Name: club_access; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.club_access (
    id integer NOT NULL,
    club_id integer NOT NULL,
    host_id integer NOT NULL,
    role character varying NOT NULL,
    permissions character varying
);


--
-- Name: club_access_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.club_access_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: club_access_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.club_access_id_seq OWNED BY clubhost.club_access.id;


--
-- Name: clubs; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.clubs (
    id integer NOT NULL,
    owner_id integer NOT NULL,
    name character varying NOT NULL,
    location character varying NOT NULL,
    bank_name character varying DEFAULT ''::character varying NOT NULL,
    account_holder character varying DEFAULT ''::character varying NOT NULL,
    account_number character varying DEFAULT ''::character varying NOT NULL,
    payment_note character varying DEFAULT ''::character varying NOT NULL,
    monthly_fee integer DEFAULT 300000 NOT NULL,
    monthly_fee_male integer,
    monthly_fee_female integer,
    qr_key character varying,
    trial_ends_at character varying,
    pro_ends_at character varying,
    sport_type character varying DEFAULT 'badminton'::character varying NOT NULL,
    skill_guidance character varying DEFAULT ''::character varying NOT NULL,
    default_approval_mode character varying DEFAULT 'MANUAL_APPROVE'::character varying NOT NULL,
    cancellation_policy character varying DEFAULT ''::character varying NOT NULL,
    default_fee_mode character varying DEFAULT 'FIXED_PRICE'::character varying NOT NULL,
    venue_instructions character varying DEFAULT ''::character varying NOT NULL,
    default_capacity integer DEFAULT 20 NOT NULL,
    fixed_fee integer DEFAULT 50000 NOT NULL,
    fixed_fee_male integer,
    fixed_fee_female integer,
    CONSTRAINT ck_club_approval_mode CHECK (((default_approval_mode)::text = ANY ((ARRAY['MANUAL_APPROVE'::character varying, 'AUTO_APPROVE'::character varying])::text[]))),
    CONSTRAINT ck_club_default_capacity CHECK (((default_capacity >= 1) AND (default_capacity <= 200))),
    CONSTRAINT ck_club_fee_mode CHECK (((default_fee_mode)::text = ANY ((ARRAY['COST_SHARING'::character varying, 'FIXED_PRICE'::character varying])::text[])))
);


--
-- Name: clubs_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.clubs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clubs_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.clubs_id_seq OWNED BY clubhost.clubs.id;


--
-- Name: email_tokens; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.email_tokens (
    id integer NOT NULL,
    host_id integer NOT NULL,
    purpose character varying NOT NULL,
    digest character varying NOT NULL,
    expires_at character varying NOT NULL,
    used boolean NOT NULL
);


--
-- Name: email_tokens_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.email_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.email_tokens_id_seq OWNED BY clubhost.email_tokens.id;


--
-- Name: expenses; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.expenses (
    id integer NOT NULL,
    session_id integer NOT NULL,
    title character varying NOT NULL,
    amount integer NOT NULL,
    category character varying DEFAULT 'OTHER'::character varying NOT NULL,
    note character varying DEFAULT ''::character varying NOT NULL,
    created_by integer,
    created_at character varying,
    allocated boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_expense_category CHECK (((category)::text = ANY ((ARRAY['COURT'::character varying, 'EQUIPMENT'::character varying, 'OTHER'::character varying])::text[])))
);


--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.expenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.expenses_id_seq OWNED BY clubhost.expenses.id;


--
-- Name: game_sessions; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.game_sessions (
    id integer NOT NULL,
    club_id integer NOT NULL,
    public_id character varying NOT NULL,
    title character varying NOT NULL,
    venue character varying NOT NULL,
    starts_at character varying NOT NULL,
    capacity integer NOT NULL,
    fixed_fee integer NOT NULL,
    guest_fee integer NOT NULL,
    is_open boolean NOT NULL,
    fixed_fee_male integer,
    fixed_fee_female integer,
    guest_fee_male integer,
    guest_fee_female integer,
    recurring_rule_id integer,
    rsvp_deadline character varying,
    is_cancelled boolean DEFAULT false NOT NULL,
    capacity_male integer,
    capacity_female integer,
    approval_mode character varying DEFAULT 'MANUAL_APPROVE'::character varying NOT NULL,
    sport_snapshot character varying DEFAULT 'badminton'::character varying NOT NULL,
    skill_guidance character varying DEFAULT ''::character varying NOT NULL,
    venue_instructions character varying DEFAULT ''::character varying NOT NULL,
    cancellation_policy character varying DEFAULT ''::character varying NOT NULL,
    participation_conditions character varying DEFAULT ''::character varying NOT NULL,
    maps_url character varying DEFAULT ''::character varying NOT NULL,
    registration_deadline character varying,
    cancellation_deadline character varying,
    lifecycle_status character varying DEFAULT 'OPEN'::character varying NOT NULL,
    attendance_locked boolean DEFAULT false NOT NULL,
    fee_mode character varying DEFAULT 'FIXED_PRICE'::character varying NOT NULL,
    no_show_policy character varying DEFAULT 'FREE'::character varying NOT NULL,
    monthly_policy character varying DEFAULT 'SESSION_FEE'::character varying NOT NULL,
    CONSTRAINT ck_session_approval_mode CHECK (((approval_mode)::text = ANY ((ARRAY['AUTO_APPROVE'::character varying, 'MANUAL_APPROVE'::character varying])::text[]))),
    CONSTRAINT ck_session_fee_mode CHECK (((fee_mode)::text = ANY ((ARRAY['FIXED_PRICE'::character varying, 'COST_SHARING'::character varying])::text[]))),
    CONSTRAINT ck_session_lifecycle CHECK (((lifecycle_status)::text = ANY ((ARRAY['DRAFT'::character varying, 'OPEN'::character varying, 'IN_PROGRESS'::character varying, 'PLAY_FINISHED'::character varying, 'SETTLED'::character varying, 'CANCELLED'::character varying])::text[]))),
    CONSTRAINT ck_session_monthly_policy CHECK (((monthly_policy)::text = ANY ((ARRAY['EXEMPT_PAID'::character varying, 'SESSION_FEE'::character varying])::text[]))),
    CONSTRAINT ck_session_no_show CHECK (((no_show_policy)::text = ANY ((ARRAY['FREE'::character varying, 'FULL'::character varying])::text[])))
);


--
-- Name: game_sessions_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.game_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: game_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.game_sessions_id_seq OWNED BY clubhost.game_sessions.id;


--
-- Name: hosts; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.hosts (
    id integer NOT NULL,
    email character varying NOT NULL,
    password_hash character varying NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    is_platform_admin boolean DEFAULT false NOT NULL,
    session_version integer DEFAULT 0 NOT NULL
);


--
-- Name: hosts_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.hosts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hosts_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.hosts_id_seq OWNED BY clubhost.hosts.id;


--
-- Name: members; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.members (
    id integer NOT NULL,
    club_id integer NOT NULL,
    name character varying NOT NULL,
    phone character varying NOT NULL,
    kind character varying NOT NULL,
    level character varying NOT NULL,
    gender character varying DEFAULT 'unspecified'::character varying NOT NULL,
    CONSTRAINT ck_member_gender CHECK (((gender)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying, 'unspecified'::character varying])::text[])))
);


--
-- Name: members_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: members_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.members_id_seq OWNED BY clubhost.members.id;


--
-- Name: money_movements; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.money_movements (
    id integer NOT NULL,
    session_id integer NOT NULL,
    booking_id integer NOT NULL,
    payer_participant_id integer,
    amount integer NOT NULL,
    kind character varying NOT NULL,
    source character varying NOT NULL,
    reference character varying NOT NULL,
    reason character varying NOT NULL,
    confirmed_by integer NOT NULL,
    occurred_at character varying NOT NULL,
    created_at character varying NOT NULL,
    request_key character varying NOT NULL,
    proof_id integer,
    reverses_id integer,
    CONSTRAINT ck_money_kind CHECK (((kind)::text = ANY ((ARRAY['RECEIVED'::character varying, 'REFUND_RECORDED'::character varying, 'REVERSAL'::character varying])::text[]))),
    CONSTRAINT ck_money_nonzero CHECK ((amount <> 0)),
    CONSTRAINT ck_money_sign CHECK (((((kind)::text = 'RECEIVED'::text) AND (amount > 0)) OR (((kind)::text = 'REFUND_RECORDED'::text) AND (amount < 0)) OR ((kind)::text = 'REVERSAL'::text))),
    CONSTRAINT ck_money_source CHECK (((source)::text = ANY ((ARRAY['BANK_TRANSFER'::character varying, 'CASH'::character varying, 'OTHER'::character varying])::text[])))
);


--
-- Name: money_movements_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.money_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: money_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.money_movements_id_seq OWNED BY clubhost.money_movements.id;


--
-- Name: monthly_dues; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.monthly_dues (
    id integer NOT NULL,
    member_id integer NOT NULL,
    period character varying NOT NULL,
    amount integer NOT NULL,
    paid boolean NOT NULL,
    access_key character varying DEFAULT ''::character varying NOT NULL,
    qr_key character varying,
    payment_status character varying DEFAULT 'unpaid'::character varying NOT NULL,
    payment_snapshot character varying DEFAULT '{}'::character varying NOT NULL
);


--
-- Name: monthly_dues_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.monthly_dues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: monthly_dues_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.monthly_dues_id_seq OWNED BY clubhost.monthly_dues.id;


--
-- Name: payment_proofs; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.payment_proofs (
    id integer NOT NULL,
    booking_id integer,
    due_id integer,
    asset_id integer NOT NULL,
    status character varying NOT NULL,
    reviewed_by integer,
    created_at character varying NOT NULL,
    reviewed_at character varying,
    note character varying NOT NULL,
    reported_amount integer,
    payer_participant_id integer
);


--
-- Name: payment_proofs_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.payment_proofs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_proofs_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.payment_proofs_id_seq OWNED BY clubhost.payment_proofs.id;


--
-- Name: platform_ledger_entries; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.platform_ledger_entries (
    id integer NOT NULL,
    entry_date character varying NOT NULL,
    direction character varying NOT NULL,
    category character varying NOT NULL,
    amount integer NOT NULL,
    note character varying NOT NULL,
    created_by integer NOT NULL,
    created_at character varying NOT NULL,
    updated_by integer,
    updated_at character varying,
    version integer NOT NULL,
    request_key character varying NOT NULL,
    CONSTRAINT ck_platform_amount CHECK ((amount > 0)),
    CONSTRAINT ck_platform_direction CHECK (((direction)::text = ANY ((ARRAY['INCOME'::character varying, 'EXPENSE'::character varying])::text[])))
);


--
-- Name: platform_ledger_entries_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.platform_ledger_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_ledger_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.platform_ledger_entries_id_seq OWNED BY clubhost.platform_ledger_entries.id;


--
-- Name: recurring_rules; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.recurring_rules (
    id integer NOT NULL,
    club_id integer NOT NULL,
    title character varying NOT NULL,
    venue character varying NOT NULL,
    first_start character varying NOT NULL,
    weeks integer NOT NULL,
    capacity integer NOT NULL,
    fixed_fee integer NOT NULL,
    guest_fee integer NOT NULL,
    fixed_fee_male integer,
    fixed_fee_female integer,
    guest_fee_male integer,
    guest_fee_female integer,
    capacity_male integer,
    capacity_female integer,
    rsvp_hours integer NOT NULL,
    active boolean NOT NULL,
    policy_json character varying DEFAULT '{}'::character varying NOT NULL
);


--
-- Name: recurring_rules_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.recurring_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recurring_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.recurring_rules_id_seq OWNED BY clubhost.recurring_rules.id;


--
-- Name: request_limits; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.request_limits (
    id character varying(80) NOT NULL,
    bucket integer NOT NULL,
    hits integer NOT NULL
);


--
-- Name: stored_assets; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.stored_assets (
    id integer NOT NULL,
    club_id integer NOT NULL,
    key character varying NOT NULL,
    kind character varying NOT NULL,
    sha256 character varying NOT NULL,
    size integer NOT NULL,
    created_at character varying NOT NULL
);


--
-- Name: stored_assets_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.stored_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stored_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.stored_assets_id_seq OWNED BY clubhost.stored_assets.id;


--
-- Name: subscription_requests; Type: TABLE; Schema: clubhost; Owner: -
--

CREATE TABLE clubhost.subscription_requests (
    id integer NOT NULL,
    club_id integer NOT NULL,
    months integer NOT NULL,
    amount integer NOT NULL,
    status character varying NOT NULL,
    reference character varying NOT NULL,
    created_at character varying NOT NULL,
    reviewed_at character varying,
    reviewed_by integer
);


--
-- Name: subscription_requests_id_seq; Type: SEQUENCE; Schema: clubhost; Owner: -
--

CREATE SEQUENCE clubhost.subscription_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscription_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: clubhost; Owner: -
--

ALTER SEQUENCE clubhost.subscription_requests_id_seq OWNED BY clubhost.subscription_requests.id;


--
-- Name: audit_logs id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.audit_logs ALTER COLUMN id SET DEFAULT nextval('clubhost.audit_logs_id_seq'::regclass);


--
-- Name: booking_participants id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.booking_participants ALTER COLUMN id SET DEFAULT nextval('clubhost.booking_participants_id_seq'::regclass);


--
-- Name: bookings id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.bookings ALTER COLUMN id SET DEFAULT nextval('clubhost.bookings_id_seq'::regclass);


--
-- Name: charge_adjustments id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charge_adjustments ALTER COLUMN id SET DEFAULT nextval('clubhost.charge_adjustments_id_seq'::regclass);


--
-- Name: charge_batches id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charge_batches ALTER COLUMN id SET DEFAULT nextval('clubhost.charge_batches_id_seq'::regclass);


--
-- Name: charges id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charges ALTER COLUMN id SET DEFAULT nextval('clubhost.charges_id_seq'::regclass);


--
-- Name: club_access id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.club_access ALTER COLUMN id SET DEFAULT nextval('clubhost.club_access_id_seq'::regclass);


--
-- Name: clubs id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.clubs ALTER COLUMN id SET DEFAULT nextval('clubhost.clubs_id_seq'::regclass);


--
-- Name: email_tokens id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.email_tokens ALTER COLUMN id SET DEFAULT nextval('clubhost.email_tokens_id_seq'::regclass);


--
-- Name: expenses id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.expenses ALTER COLUMN id SET DEFAULT nextval('clubhost.expenses_id_seq'::regclass);


--
-- Name: game_sessions id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.game_sessions ALTER COLUMN id SET DEFAULT nextval('clubhost.game_sessions_id_seq'::regclass);


--
-- Name: hosts id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.hosts ALTER COLUMN id SET DEFAULT nextval('clubhost.hosts_id_seq'::regclass);


--
-- Name: members id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.members ALTER COLUMN id SET DEFAULT nextval('clubhost.members_id_seq'::regclass);


--
-- Name: money_movements id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.money_movements ALTER COLUMN id SET DEFAULT nextval('clubhost.money_movements_id_seq'::regclass);


--
-- Name: monthly_dues id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.monthly_dues ALTER COLUMN id SET DEFAULT nextval('clubhost.monthly_dues_id_seq'::regclass);


--
-- Name: payment_proofs id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.payment_proofs ALTER COLUMN id SET DEFAULT nextval('clubhost.payment_proofs_id_seq'::regclass);


--
-- Name: platform_ledger_entries id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.platform_ledger_entries ALTER COLUMN id SET DEFAULT nextval('clubhost.platform_ledger_entries_id_seq'::regclass);


--
-- Name: recurring_rules id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.recurring_rules ALTER COLUMN id SET DEFAULT nextval('clubhost.recurring_rules_id_seq'::regclass);


--
-- Name: stored_assets id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.stored_assets ALTER COLUMN id SET DEFAULT nextval('clubhost.stored_assets_id_seq'::regclass);


--
-- Name: subscription_requests id; Type: DEFAULT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.subscription_requests ALTER COLUMN id SET DEFAULT nextval('clubhost.subscription_requests_id_seq'::regclass);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: booking_participants booking_participants_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.booking_participants
    ADD CONSTRAINT booking_participants_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: charge_adjustments charge_adjustments_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charge_adjustments
    ADD CONSTRAINT charge_adjustments_pkey PRIMARY KEY (id);


--
-- Name: charge_batches charge_batches_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charge_batches
    ADD CONSTRAINT charge_batches_pkey PRIMARY KEY (id);


--
-- Name: charges charges_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charges
    ADD CONSTRAINT charges_pkey PRIMARY KEY (id);


--
-- Name: club_access club_access_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.club_access
    ADD CONSTRAINT club_access_pkey PRIMARY KEY (id);


--
-- Name: clubs clubs_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.clubs
    ADD CONSTRAINT clubs_pkey PRIMARY KEY (id);


--
-- Name: email_tokens email_tokens_digest_key; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.email_tokens
    ADD CONSTRAINT email_tokens_digest_key UNIQUE (digest);


--
-- Name: email_tokens email_tokens_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.email_tokens
    ADD CONSTRAINT email_tokens_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: game_sessions game_sessions_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.game_sessions
    ADD CONSTRAINT game_sessions_pkey PRIMARY KEY (id);


--
-- Name: hosts hosts_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.hosts
    ADD CONSTRAINT hosts_pkey PRIMARY KEY (id);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: money_movements money_movements_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.money_movements
    ADD CONSTRAINT money_movements_pkey PRIMARY KEY (id);


--
-- Name: monthly_dues monthly_dues_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.monthly_dues
    ADD CONSTRAINT monthly_dues_pkey PRIMARY KEY (id);


--
-- Name: payment_proofs payment_proofs_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.payment_proofs
    ADD CONSTRAINT payment_proofs_pkey PRIMARY KEY (id);


--
-- Name: platform_ledger_entries platform_ledger_entries_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.platform_ledger_entries
    ADD CONSTRAINT platform_ledger_entries_pkey PRIMARY KEY (id);


--
-- Name: platform_ledger_entries platform_ledger_entries_request_key_key; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.platform_ledger_entries
    ADD CONSTRAINT platform_ledger_entries_request_key_key UNIQUE (request_key);


--
-- Name: recurring_rules recurring_rules_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.recurring_rules
    ADD CONSTRAINT recurring_rules_pkey PRIMARY KEY (id);


--
-- Name: request_limits request_limits_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.request_limits
    ADD CONSTRAINT request_limits_pkey PRIMARY KEY (id);


--
-- Name: stored_assets stored_assets_key_key; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.stored_assets
    ADD CONSTRAINT stored_assets_key_key UNIQUE (key);


--
-- Name: stored_assets stored_assets_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.stored_assets
    ADD CONSTRAINT stored_assets_pkey PRIMARY KEY (id);


--
-- Name: subscription_requests subscription_requests_pkey; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.subscription_requests
    ADD CONSTRAINT subscription_requests_pkey PRIMARY KEY (id);


--
-- Name: charge_adjustments uq_adjustment_request; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charge_adjustments
    ADD CONSTRAINT uq_adjustment_request UNIQUE (batch_id, request_key);


--
-- Name: charge_adjustments uq_adjustment_version; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charge_adjustments
    ADD CONSTRAINT uq_adjustment_version UNIQUE (batch_id, version);


--
-- Name: charges uq_batch_participant; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charges
    ADD CONSTRAINT uq_batch_participant UNIQUE (batch_id, participant_id);


--
-- Name: bookings uq_booking_member_session; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.bookings
    ADD CONSTRAINT uq_booking_member_session UNIQUE (session_id, member_id);


--
-- Name: booking_participants uq_booking_participant_position; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.booking_participants
    ADD CONSTRAINT uq_booking_participant_position UNIQUE (booking_id, "position");


--
-- Name: club_access uq_club_cohost; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.club_access
    ADD CONSTRAINT uq_club_cohost UNIQUE (club_id, host_id);


--
-- Name: monthly_dues uq_member_month; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.monthly_dues
    ADD CONSTRAINT uq_member_month UNIQUE (member_id, period);


--
-- Name: members uq_member_phone; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.members
    ADD CONSTRAINT uq_member_phone UNIQUE (club_id, phone);


--
-- Name: money_movements uq_money_proof; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.money_movements
    ADD CONSTRAINT uq_money_proof UNIQUE (proof_id);


--
-- Name: money_movements uq_money_request; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.money_movements
    ADD CONSTRAINT uq_money_request UNIQUE (session_id, request_key);


--
-- Name: money_movements uq_money_reversal; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.money_movements
    ADD CONSTRAINT uq_money_reversal UNIQUE (reverses_id);


--
-- Name: game_sessions uq_rule_occurrence; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.game_sessions
    ADD CONSTRAINT uq_rule_occurrence UNIQUE (recurring_rule_id, starts_at);


--
-- Name: charge_batches uq_session_charge_batch; Type: CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charge_batches
    ADD CONSTRAINT uq_session_charge_batch UNIQUE (session_id);


--
-- Name: ix_audit_logs_club_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_audit_logs_club_id ON clubhost.audit_logs USING btree (club_id);


--
-- Name: ix_booking_participants_booking_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_booking_participants_booking_id ON clubhost.booking_participants USING btree (booking_id);


--
-- Name: ix_bookings_legacy_token_digest; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_bookings_legacy_token_digest ON clubhost.bookings USING btree (legacy_token_digest);


--
-- Name: ix_bookings_member_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_bookings_member_id ON clubhost.bookings USING btree (member_id);


--
-- Name: ix_bookings_session_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_bookings_session_id ON clubhost.bookings USING btree (session_id);


--
-- Name: ix_bookings_token_digest; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_bookings_token_digest ON clubhost.bookings USING btree (token_digest);


--
-- Name: ix_charge_adjustments_batch_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_charge_adjustments_batch_id ON clubhost.charge_adjustments USING btree (batch_id);


--
-- Name: ix_charge_adjustments_charge_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_charge_adjustments_charge_id ON clubhost.charge_adjustments USING btree (charge_id);


--
-- Name: ix_charge_batches_session_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_charge_batches_session_id ON clubhost.charge_batches USING btree (session_id);


--
-- Name: ix_charges_batch_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_charges_batch_id ON clubhost.charges USING btree (batch_id);


--
-- Name: ix_charges_booking_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_charges_booking_id ON clubhost.charges USING btree (booking_id);


--
-- Name: ix_club_access_club_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_club_access_club_id ON clubhost.club_access USING btree (club_id);


--
-- Name: ix_club_access_host_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_club_access_host_id ON clubhost.club_access USING btree (host_id);


--
-- Name: ix_clubs_owner_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_clubs_owner_id ON clubhost.clubs USING btree (owner_id);


--
-- Name: ix_email_tokens_host_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_email_tokens_host_id ON clubhost.email_tokens USING btree (host_id);


--
-- Name: ix_expenses_session_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_expenses_session_id ON clubhost.expenses USING btree (session_id);


--
-- Name: ix_game_sessions_club_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_game_sessions_club_id ON clubhost.game_sessions USING btree (club_id);


--
-- Name: ix_game_sessions_public_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE UNIQUE INDEX ix_game_sessions_public_id ON clubhost.game_sessions USING btree (public_id);


--
-- Name: ix_hosts_email; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE UNIQUE INDEX ix_hosts_email ON clubhost.hosts USING btree (email);


--
-- Name: ix_members_club_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_members_club_id ON clubhost.members USING btree (club_id);


--
-- Name: ix_money_movements_booking_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_money_movements_booking_id ON clubhost.money_movements USING btree (booking_id);


--
-- Name: ix_money_movements_session_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_money_movements_session_id ON clubhost.money_movements USING btree (session_id);


--
-- Name: ix_monthly_dues_member_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_monthly_dues_member_id ON clubhost.monthly_dues USING btree (member_id);


--
-- Name: ix_payment_proofs_booking_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_payment_proofs_booking_id ON clubhost.payment_proofs USING btree (booking_id);


--
-- Name: ix_payment_proofs_due_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_payment_proofs_due_id ON clubhost.payment_proofs USING btree (due_id);


--
-- Name: ix_recurring_rules_club_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_recurring_rules_club_id ON clubhost.recurring_rules USING btree (club_id);


--
-- Name: ix_stored_assets_club_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_stored_assets_club_id ON clubhost.stored_assets USING btree (club_id);


--
-- Name: ix_subscription_requests_club_id; Type: INDEX; Schema: clubhost; Owner: -
--

CREATE INDEX ix_subscription_requests_club_id ON clubhost.subscription_requests USING btree (club_id);


--
-- Name: audit_logs audit_logs_club_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.audit_logs
    ADD CONSTRAINT audit_logs_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubhost.clubs(id);


--
-- Name: audit_logs audit_logs_host_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.audit_logs
    ADD CONSTRAINT audit_logs_host_id_fkey FOREIGN KEY (host_id) REFERENCES clubhost.hosts(id);


--
-- Name: booking_participants booking_participants_attendance_actor_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.booking_participants
    ADD CONSTRAINT booking_participants_attendance_actor_id_fkey FOREIGN KEY (attendance_actor_id) REFERENCES clubhost.hosts(id);


--
-- Name: booking_participants booking_participants_booking_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.booking_participants
    ADD CONSTRAINT booking_participants_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES clubhost.bookings(id);


--
-- Name: booking_participants booking_participants_member_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.booking_participants
    ADD CONSTRAINT booking_participants_member_id_fkey FOREIGN KEY (member_id) REFERENCES clubhost.members(id);


--
-- Name: bookings bookings_member_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.bookings
    ADD CONSTRAINT bookings_member_id_fkey FOREIGN KEY (member_id) REFERENCES clubhost.members(id);


--
-- Name: bookings bookings_session_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.bookings
    ADD CONSTRAINT bookings_session_id_fkey FOREIGN KEY (session_id) REFERENCES clubhost.game_sessions(id);


--
-- Name: charge_adjustments charge_adjustments_batch_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charge_adjustments
    ADD CONSTRAINT charge_adjustments_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES clubhost.charge_batches(id);


--
-- Name: charge_adjustments charge_adjustments_charge_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charge_adjustments
    ADD CONSTRAINT charge_adjustments_charge_id_fkey FOREIGN KEY (charge_id) REFERENCES clubhost.charges(id);


--
-- Name: charge_adjustments charge_adjustments_created_by_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charge_adjustments
    ADD CONSTRAINT charge_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES clubhost.hosts(id);


--
-- Name: charge_batches charge_batches_issued_by_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charge_batches
    ADD CONSTRAINT charge_batches_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES clubhost.hosts(id);


--
-- Name: charge_batches charge_batches_session_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charge_batches
    ADD CONSTRAINT charge_batches_session_id_fkey FOREIGN KEY (session_id) REFERENCES clubhost.game_sessions(id);


--
-- Name: charges charges_batch_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charges
    ADD CONSTRAINT charges_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES clubhost.charge_batches(id);


--
-- Name: charges charges_booking_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charges
    ADD CONSTRAINT charges_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES clubhost.bookings(id);


--
-- Name: charges charges_participant_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charges
    ADD CONSTRAINT charges_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES clubhost.booking_participants(id);


--
-- Name: charges charges_payer_participant_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.charges
    ADD CONSTRAINT charges_payer_participant_id_fkey FOREIGN KEY (payer_participant_id) REFERENCES clubhost.booking_participants(id);


--
-- Name: club_access club_access_club_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.club_access
    ADD CONSTRAINT club_access_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubhost.clubs(id);


--
-- Name: club_access club_access_host_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.club_access
    ADD CONSTRAINT club_access_host_id_fkey FOREIGN KEY (host_id) REFERENCES clubhost.hosts(id);


--
-- Name: clubs clubs_owner_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.clubs
    ADD CONSTRAINT clubs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES clubhost.hosts(id);


--
-- Name: email_tokens email_tokens_host_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.email_tokens
    ADD CONSTRAINT email_tokens_host_id_fkey FOREIGN KEY (host_id) REFERENCES clubhost.hosts(id);


--
-- Name: expenses expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.expenses
    ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES clubhost.hosts(id);


--
-- Name: expenses expenses_session_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.expenses
    ADD CONSTRAINT expenses_session_id_fkey FOREIGN KEY (session_id) REFERENCES clubhost.game_sessions(id);


--
-- Name: game_sessions game_sessions_club_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.game_sessions
    ADD CONSTRAINT game_sessions_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubhost.clubs(id);


--
-- Name: game_sessions game_sessions_recurring_rule_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.game_sessions
    ADD CONSTRAINT game_sessions_recurring_rule_id_fkey FOREIGN KEY (recurring_rule_id) REFERENCES clubhost.recurring_rules(id);


--
-- Name: members members_club_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.members
    ADD CONSTRAINT members_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubhost.clubs(id);


--
-- Name: money_movements money_movements_booking_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.money_movements
    ADD CONSTRAINT money_movements_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES clubhost.bookings(id);


--
-- Name: money_movements money_movements_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.money_movements
    ADD CONSTRAINT money_movements_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES clubhost.hosts(id);


--
-- Name: money_movements money_movements_payer_participant_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.money_movements
    ADD CONSTRAINT money_movements_payer_participant_id_fkey FOREIGN KEY (payer_participant_id) REFERENCES clubhost.booking_participants(id);


--
-- Name: money_movements money_movements_proof_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.money_movements
    ADD CONSTRAINT money_movements_proof_id_fkey FOREIGN KEY (proof_id) REFERENCES clubhost.payment_proofs(id);


--
-- Name: money_movements money_movements_reverses_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.money_movements
    ADD CONSTRAINT money_movements_reverses_id_fkey FOREIGN KEY (reverses_id) REFERENCES clubhost.money_movements(id);


--
-- Name: money_movements money_movements_session_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.money_movements
    ADD CONSTRAINT money_movements_session_id_fkey FOREIGN KEY (session_id) REFERENCES clubhost.game_sessions(id);


--
-- Name: monthly_dues monthly_dues_member_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.monthly_dues
    ADD CONSTRAINT monthly_dues_member_id_fkey FOREIGN KEY (member_id) REFERENCES clubhost.members(id);


--
-- Name: payment_proofs payment_proofs_asset_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.payment_proofs
    ADD CONSTRAINT payment_proofs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES clubhost.stored_assets(id);


--
-- Name: payment_proofs payment_proofs_booking_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.payment_proofs
    ADD CONSTRAINT payment_proofs_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES clubhost.bookings(id);


--
-- Name: payment_proofs payment_proofs_due_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.payment_proofs
    ADD CONSTRAINT payment_proofs_due_id_fkey FOREIGN KEY (due_id) REFERENCES clubhost.monthly_dues(id);


--
-- Name: payment_proofs payment_proofs_payer_participant_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.payment_proofs
    ADD CONSTRAINT payment_proofs_payer_participant_id_fkey FOREIGN KEY (payer_participant_id) REFERENCES clubhost.booking_participants(id);


--
-- Name: payment_proofs payment_proofs_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.payment_proofs
    ADD CONSTRAINT payment_proofs_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES clubhost.hosts(id);


--
-- Name: platform_ledger_entries platform_ledger_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.platform_ledger_entries
    ADD CONSTRAINT platform_ledger_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES clubhost.hosts(id);


--
-- Name: platform_ledger_entries platform_ledger_entries_updated_by_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.platform_ledger_entries
    ADD CONSTRAINT platform_ledger_entries_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES clubhost.hosts(id);


--
-- Name: recurring_rules recurring_rules_club_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.recurring_rules
    ADD CONSTRAINT recurring_rules_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubhost.clubs(id);


--
-- Name: stored_assets stored_assets_club_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.stored_assets
    ADD CONSTRAINT stored_assets_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubhost.clubs(id);


--
-- Name: subscription_requests subscription_requests_club_id_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.subscription_requests
    ADD CONSTRAINT subscription_requests_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubhost.clubs(id);


--
-- Name: subscription_requests subscription_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: clubhost; Owner: -
--

ALTER TABLE ONLY clubhost.subscription_requests
    ADD CONSTRAINT subscription_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES clubhost.hosts(id);


--
-- PostgreSQL database dump complete
--



INSERT INTO clubhost.alembic_version(version_num) VALUES ('0011_fixed_member_fees');
