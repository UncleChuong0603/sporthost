# Generated legacy inventory

Source: working tree. Regenerate with `python -m scripts.audit_nextjs_sprint0`; verify with `--check`.

AST inventory is exhaustive for Python files in the stated roots. Calls are syntactic evidence,
not proof of authorization/locking: review the business rules and acceptance matrix too.

85 Python files; 89 application HTTP routes; 21 ORM models; 108 test functions; 11 historical migrations; 34 templates/static assets.

Framework-generated OpenAPI/docs routes and the `/static` mount are described in AUDIT.md.

## Source modules

| Source | Lines | Target responsibility |
| --- | ---: | --- |
| `alembic/env.py` | 72 | operator/test tooling; see source docstring |
| `alembic/versions/0001_initial.py` | 95 | operator/test tooling; see source docstring |
| `alembic/versions/0002_member_gender.py` | 21 | operator/test tooling; see source docstring |
| `alembic/versions/0003_gender_fees.py` | 25 | operator/test tooling; see source docstring |
| `alembic/versions/0004_full_roadmap.py` | 77 | operator/test tooling; see source docstring |
| `alembic/versions/0005_club_settings.py` | 31 | operator/test tooling; see source docstring |
| `alembic/versions/0006_group_bookings.py` | 61 | operator/test tooling; see source docstring |
| `alembic/versions/0007_session_attendance.py` | 32 | operator/test tooling; see source docstring |
| `alembic/versions/0008_manual_billing.py` | 75 | operator/test tooling; see source docstring |
| `alembic/versions/0009_close_permissions_platform.py` | 39 | operator/test tooling; see source docstring |
| `alembic/versions/0010_payment_config_snapshot.py` | 18 | operator/test tooling; see source docstring |
| `alembic/versions/0011_fixed_member_fees.py` | 21 | operator/test tooling; see source docstring |
| `app/__init__.py` | 0 | operator/test tooling; see source docstring |
| `app/accounts.py` | 140 | auth; platform administration |
| `app/attendance.py` | 145 | attendance; session lifecycle |
| `app/booking_routes.py` | 62 | bookings; guest capabilities |
| `app/booking_service.py` | 184 | bookings; policies; guest capabilities |
| `app/club_deletion.py` | 62 | clubs; explicit deletion workflow |
| `app/club_settings.py` | 103 | clubs; validation and audit |
| `app/finance_models.py` | 90 | db schema; billing and platform ledger |
| `app/finance_routes.py` | 109 | billing; reconciliation |
| `app/finance_service.py` | 266 | billing; reconciliation |
| `app/mail.py` | 90 | infrastructure mail (SMTP) |
| `app/main.py` | 1013 | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| `app/models_extra.py` | 101 | db schema; scheduling, access, assets, accounts |
| `app/payment_config.py` | 33 | payments; versioned payment snapshots |
| `app/payments.py` | 324 | payments; proof review; media authorization; guest RSVP |
| `app/permissions.py` | 26 | access control |
| `app/platform_ledger.py` | 74 | platform ledger |
| `app/security.py` | 34 | rate limits |
| `app/settings.py` | 66 | server environment validation |
| `app/sports.py` | 22 | sports catalog |
| `app/storage.py` | 106 | private media (persistent VPS volume) |
| `app/workspace.py` | 416 | workspace queries; scheduling; recurring rules; dues; access |
| `index.py` | 4 | operator/test tooling; see source docstring |
| `scripts/__init__.py` | 0 | operator/test tooling; see source docstring |
| `scripts/admin.py` | 29 | operator/test tooling; see source docstring |
| `scripts/apply_nextjs_member_schema.py` | 53 | operator/test tooling; see source docstring |
| `scripts/apply_verified_release.py` | 60 | operator/test tooling; see source docstring |
| `scripts/audit_nextjs_database.py` | 96 | operator/test tooling; see source docstring |
| `scripts/audit_nextjs_sprint0.py` | 195 | operator/test tooling; see source docstring |
| `scripts/backup.py` | 103 | operator/test tooling; see source docstring |
| `scripts/backup_dokploy_source.py` | 183 | operator/test tooling; see source docstring |
| `scripts/backup_nextjs_media.py` | 91 | operator/test tooling; see source docstring |
| `scripts/check_backup_restore.py` | 98 | operator/test tooling; see source docstring |
| `scripts/check_db.py` | 31 | operator/test tooling; see source docstring |
| `scripts/check_group_concurrency.py` | 239 | operator/test tooling; see source docstring |
| `scripts/check_nextjs_auth_compatibility.py` | 53 | operator/test tooling; see source docstring |
| `scripts/check_nextjs_finance_compatibility.py` | 60 | operator/test tooling; see source docstring |
| `scripts/check_nextjs_http_evidence.py` | 105 | operator/test tooling; see source docstring |
| `scripts/create_nextjs_smtp_fixture.py` | 29 | operator/test tooling; see source docstring |
| `scripts/dokploy_api_ssh.py` | 121 | operator/test tooling; see source docstring |
| `scripts/dokploy_preflight.py` | 93 | operator/test tooling; see source docstring |
| `scripts/dokploy_smoke.py` | 55 | operator/test tooling; see source docstring |
| `scripts/migrate.py` | 44 | operator/test tooling; see source docstring |
| `scripts/retention.py` | 31 | operator/test tooling; see source docstring |
| `scripts/scrub_booking_tokens.py` | 51 | operator/test tooling; see source docstring |
| `scripts/serve.py` | 15 | operator/test tooling; see source docstring |
| `scripts/smoke_group_release.py` | 243 | operator/test tooling; see source docstring |
| `scripts/verify_dokploy_backup.py` | 188 | operator/test tooling; see source docstring |
| `scripts/verify_release.py` | 100 | operator/test tooling; see source docstring |
| `tests/conftest.py` | 59 | operator/test tooling; see source docstring |
| `tests/test_attendance.py` | 148 | operator/test tooling; see source docstring |
| `tests/test_attendance_browser.py` | 47 | operator/test tooling; see source docstring |
| `tests/test_billing.py` | 224 | operator/test tooling; see source docstring |
| `tests/test_billing_browser.py` | 57 | operator/test tooling; see source docstring |
| `tests/test_closing_permissions.py` | 122 | operator/test tooling; see source docstring |
| `tests/test_club_deletion.py` | 184 | operator/test tooling; see source docstring |
| `tests/test_club_deletion_browser.py` | 65 | operator/test tooling; see source docstring |
| `tests/test_club_settings.py` | 190 | operator/test tooling; see source docstring |
| `tests/test_club_settings_browser.py` | 124 | operator/test tooling; see source docstring |
| `tests/test_deployment.py` | 96 | operator/test tooling; see source docstring |
| `tests/test_dokploy.py` | 241 | operator/test tooling; see source docstring |
| `tests/test_dokploy_smoke.py` | 35 | operator/test tooling; see source docstring |
| `tests/test_fixed_member_fees.py` | 83 | operator/test tooling; see source docstring |
| `tests/test_flows.py` | 120 | operator/test tooling; see source docstring |
| `tests/test_group_booking_browser.py` | 50 | operator/test tooling; see source docstring |
| `tests/test_group_bookings.py` | 271 | operator/test tooling; see source docstring |
| `tests/test_guest_lookup.py` | 146 | operator/test tooling; see source docstring |
| `tests/test_hardening.py` | 101 | operator/test tooling; see source docstring |
| `tests/test_member_gender.py` | 169 | operator/test tooling; see source docstring |
| `tests/test_postgres_migrations.py` | 84 | operator/test tooling; see source docstring |
| `tests/test_real_session_browser.py` | 155 | operator/test tooling; see source docstring |
| `tests/test_roadmap.py` | 236 | operator/test tooling; see source docstring |
| `tests/test_sprint01.py` | 91 | operator/test tooling; see source docstring |

## Application routes

| Method | Path | Source handler | Target module |
| --- | --- | --- | --- |
| GET | `/` | `app/main.py:527` `home` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| GET | `/account` | `app/accounts.py:55` `account` | auth; platform administration |
| POST | `/account/password` | `app/accounts.py:60` `password` | auth; platform administration |
| POST | `/account/verify-email` | `app/accounts.py:69` `send_verification` | auth; platform administration |
| GET | `/admin` | `app/accounts.py:126` `admin` | auth; platform administration |
| POST | `/admin/clubs/{club_id}/trial` | `app/accounts.py:134` `extend_trial` | auth; platform administration |
| GET | `/admin/platform-ledger` | `app/platform_ledger.py:28` `ledger_page` | platform ledger |
| POST | `/admin/platform-ledger` | `app/platform_ledger.py:46` `create` | platform ledger |
| POST | `/admin/platform-ledger/{entry_id}/edit` | `app/platform_ledger.py:63` `edit` | platform ledger |
| GET | `/attend/{key}` | `app/payments.py:124` `participant_page` | payments; proof review; media authorization; guest RSVP |
| POST | `/attend/{key}/cancel` | `app/payments.py:162` `cancel_participant` | payments; proof review; media authorization; guest RSVP |
| POST | `/attend/{key}/edit` | `app/booking_routes.py:10` `edit_party` | bookings; guest capabilities |
| POST | `/attend/{key}/payer` | `app/finance_routes.py:87` `guest_payer` | billing; reconciliation |
| POST | `/attend/{key}/proof` | `app/payments.py:180` `upload_proof` | payments; proof review; media authorization; guest RSVP |
| GET | `/attend/{key}/qr` | `app/payments.py:172` `participant_qr` | payments; proof review; media authorization; guest RSVP |
| POST | `/attend/{key}/rsvp` | `app/payments.py:142` `rsvp` | payments; proof review; media authorization; guest RSVP |
| GET | `/clubs` | `app/workspace.py:253` `clubs_page` | workspace queries; scheduling; recurring rules; dues; access |
| POST | `/clubs` | `app/main.py:577` `create_club` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| GET | `/clubs/{club_id}` | `app/main.py:587` `club_page` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/clubs/{club_id}/cohosts` | `app/workspace.py:380` `add_cohost` | workspace queries; scheduling; recurring rules; dues; access |
| POST | `/clubs/{club_id}/cohosts/{access_id}/remove` | `app/workspace.py:402` `remove_cohost` | workspace queries; scheduling; recurring rules; dues; access |
| POST | `/clubs/{club_id}/delete` | `app/main.py:612` `delete_club` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/clubs/{club_id}/dues` | `app/main.py:666` `add_due` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/clubs/{club_id}/dues/bulk` | `app/workspace.py:356` `bulk_dues` | workspace queries; scheduling; recurring rules; dues; access |
| POST | `/clubs/{club_id}/fixed-prices` | `app/payments.py:97` `fixed_prices` | payments; proof review; media authorization; guest RSVP |
| POST | `/clubs/{club_id}/games` | `app/main.py:652` `create_game` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/clubs/{club_id}/members` | `app/main.py:641` `add_member` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/clubs/{club_id}/members/{member_id}/edit` | `app/main.py:623` `update_member` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/clubs/{club_id}/monthly-prices` | `app/payments.py:109` `monthly_prices` | payments; proof review; media authorization; guest RSVP |
| POST | `/clubs/{club_id}/payment-settings` | `app/payments.py:75` `payment_settings` | payments; proof review; media authorization; guest RSVP |
| POST | `/clubs/{club_id}/payment-settings/remove-qr` | `app/payments.py:91` `remove_qr` | payments; proof review; media authorization; guest RSVP |
| GET | `/clubs/{club_id}/qr` | `app/payments.py:118` `host_qr` | payments; proof review; media authorization; guest RSVP |
| GET | `/clubs/{club_id}/settings` | `app/workspace.py:370` `settings_page` | workspace queries; scheduling; recurring rules; dues; access |
| POST | `/clubs/{club_id}/settings` | `app/main.py:602` `update_club` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| GET | `/dashboard` | `app/main.py:571` `dashboard` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| GET | `/dues/pay/{key}` | `app/payments.py:213` `due_page` | payments; proof review; media authorization; guest RSVP |
| POST | `/dues/pay/{key}/proof` | `app/payments.py:235` `due_proof` | payments; proof review; media authorization; guest RSVP |
| GET | `/dues/pay/{key}/qr` | `app/payments.py:224` `due_qr` | payments; proof review; media authorization; guest RSVP |
| POST | `/dues/{due_id}/toggle` | `app/main.py:679` `toggle_due` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| GET | `/finance` | `app/workspace.py:330` `finance_page` | workspace queries; scheduling; recurring rules; dues; access |
| GET | `/finance/export.csv` | `app/workspace.py:346` `export_finance` | workspace queries; scheduling; recurring rules; dues; access |
| GET | `/forgot-password` | `app/accounts.py:94` `forgot` | auth; platform administration |
| POST | `/forgot-password` | `app/accounts.py:100` `request_reset` | auth; platform administration |
| GET | `/games/{game_id}` | `app/main.py:690` `game_page` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| GET | `/games/{game_id}/billing` | `app/finance_routes.py:56` `billing` | billing; reconciliation |
| POST | `/games/{game_id}/billing/adjustments` | `app/finance_routes.py:49` `adjust` | billing; reconciliation |
| POST | `/games/{game_id}/billing/bookings/{booking_id}/money` | `app/finance_routes.py:95` `money_entry` | billing; reconciliation |
| POST | `/games/{game_id}/billing/bookings/{booking_id}/payer` | `app/finance_routes.py:81` `payer` | billing; reconciliation |
| POST | `/games/{game_id}/billing/close` | `app/finance_routes.py:43` `close` | billing; reconciliation |
| POST | `/games/{game_id}/billing/issue` | `app/finance_routes.py:61` `issue_charges` | billing; reconciliation |
| POST | `/games/{game_id}/billing/participants/{person_id}` | `app/finance_routes.py:67` `draft_adjustment` | billing; reconciliation |
| POST | `/games/{game_id}/bookings/{booking_id}/private-link/revoke` | `app/booking_routes.py:55` `revoke_link` | bookings; guest capabilities |
| POST | `/games/{game_id}/bookings/{booking_id}/private-link/rotate` | `app/booking_routes.py:42` `rotate_link` | bookings; guest capabilities |
| POST | `/games/{game_id}/bookings/{booking_id}/{action}` | `app/main.py:739` `change_booking` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/games/{game_id}/cancel` | `app/workspace.py:409` `cancel_game` | workspace queries; scheduling; recurring rules; dues; access |
| POST | `/games/{game_id}/expenses` | `app/main.py:797` `add_expense` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| GET | `/games/{game_id}/export.csv` | `app/main.py:928` `export_game` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/games/{game_id}/fixed` | `app/main.py:721` `add_fixed_to_game` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/games/{game_id}/invite-fixed` | `app/workspace.py:170` `invite_fixed` | workspace queries; scheduling; recurring rules; dues; access |
| POST | `/games/{game_id}/lifecycle/{action}` | `app/attendance.py:66` `transition` | attendance; session lifecycle |
| POST | `/games/{game_id}/participants/{person_id}/attendance` | `app/attendance.py:86` `attendance` | attendance; session lifecycle |
| POST | `/games/{game_id}/participants/{person_id}/replace` | `app/attendance.py:97` `replace_person` | attendance; session lifecycle |
| POST | `/games/{game_id}/settings` | `app/workspace.py:184` `edit_game` | workspace queries; scheduling; recurring rules; dues; access |
| POST | `/games/{game_id}/toggle-open` | `app/main.py:790` `toggle_open` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/games/{game_id}/walk-ins` | `app/attendance.py:122` `walk_in` | attendance; session lifecycle |
| GET | `/health` | `app/main.py:939` `health` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| GET | `/join/{public_id}` | `app/main.py:849` `join_page` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/join/{public_id}` | `app/main.py:872` `join` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/join/{public_id}/lookup` | `app/main.py:856` `lookup_guest` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| GET | `/login` | `app/main.py:550` `login_page` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/login` | `app/main.py:553` `login` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/logout` | `app/main.py:566` `logout` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| GET | `/members` | `app/workspace.py:306` `members_page` | workspace queries; scheduling; recurring rules; dues; access |
| GET | `/payments/review` | `app/payments.py:252` `review_page` | payments; proof review; media authorization; guest RSVP |
| GET | `/proofs/{proof_id}/image` | `app/payments.py:274` `proof_image` | payments; proof review; media authorization; guest RSVP |
| POST | `/proofs/{proof_id}/review` | `app/payments.py:282` `review_proof` | payments; proof review; media authorization; guest RSVP |
| GET | `/ready` | `app/main.py:944` `readiness` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| GET | `/reset-password` | `app/accounts.py:114` `reset_page` | auth; platform administration |
| POST | `/reset-password` | `app/accounts.py:119` `reset_password` | auth; platform administration |
| POST | `/rules/{rule_id}/extend` | `app/workspace.py:243` `extend_rule` | workspace queries; scheduling; recurring rules; dues; access |
| POST | `/rules/{rule_id}/generate` | `app/workspace.py:297` `regenerate` | workspace queries; scheduling; recurring rules; dues; access |
| POST | `/rules/{rule_id}/stop` | `app/workspace.py:235` `stop_rule` | workspace queries; scheduling; recurring rules; dues; access |
| GET | `/schedule` | `app/workspace.py:258` `schedule_page` | workspace queries; scheduling; recurring rules; dues; access |
| GET | `/signup` | `app/main.py:532` `signup_page` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| POST | `/signup` | `app/main.py:535` `signup` | shared core; auth, clubs, members, sessions, bookings, dues, exports, health |
| GET | `/verify-email` | `app/accounts.py:79` `verification_page` | auth; platform administration |
| POST | `/verify-email` | `app/accounts.py:86` `verification` | auth; platform administration |
| POST | `/workspace/games` | `app/workspace.py:270` `workspace_create_game` | workspace queries; scheduling; recurring rules; dues; access |
| POST | `/workspace/members` | `app/workspace.py:317` `workspace_member` | workspace queries; scheduling; recurring rules; dues; access |

## Persisted models

Types below are ORM annotations, not PostgreSQL DDL. Relationship fields are marked as relationships
in the JSON mapping. The read-only database report is the authority for physical columns/defaults.

### `audit_logs` — `AuditLog`

Source: `app/models_extra.py:45`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `club_id` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('clubs.id'), index=True)` |
| `host_id` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('hosts.id'))` |
| `action` | `Mapped[str]` | `inferred` |
| `details` | `Mapped[str]` | `mapped_column(default='')` |
| `created_at` | `Mapped[str]` | `mapped_column(default=utc_now)` |
### `booking_participants` — `BookingParticipant`

Source: `app/main.py:199`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `booking_id` | `Mapped[int]` | `mapped_column(ForeignKey('bookings.id'), index=True)` |
| `member_id` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('members.id'))` |
| `position` | `Mapped[int]` | `inferred` |
| `name` | `Mapped[str]` | `inferred` |
| `gender` | `Mapped[str]` | `mapped_column(default='unspecified', server_default='unspecified')` |
| `level` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `fee_amount` | `Mapped[int]` | `mapped_column(default=0, server_default='0')` |
| `attendance_status` | `Mapped[str]` | `mapped_column(default='NOT_MARKED', server_default='NOT_MARKED')` |
| `arrived_at` | `Mapped[str &#124; None]` | `inferred` |
| `left_at` | `Mapped[str &#124; None]` | `inferred` |
| `attendance_actor_id` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('hosts.id'))` |
| `attendance_version` | `Mapped[int]` | `mapped_column(default=0, server_default='0')` |
| `charge_exempt` | `Mapped[bool]` | `mapped_column(default=False, server_default=false())` |
| `fee_discount` | `Mapped[int]` | `mapped_column(default=0, server_default='0')` |
| `adjustment_reason` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `booking` | `Mapped['Booking']` | `relationship(back_populates='participants')` |

Constraints: `(UniqueConstraint('booking_id', 'position', name='uq_booking_participant_position'), CheckConstraint("gender IN ('male','female','unspecified')", name='ck_participant_gender'), CheckConstraint("attendance_status IN ('NOT_MARKED','CHECKED_IN','NO_SHOW')", name='ck_participant_attendance'), CheckConstraint('fee_amount >= 0', name='ck_participant_fee'))`.

### `bookings` — `Booking`

Source: `app/main.py:161`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `session_id` | `Mapped[int]` | `mapped_column(ForeignKey('game_sessions.id'), index=True)` |
| `member_id` | `Mapped[int]` | `mapped_column(ForeignKey('members.id'), index=True)` |
| `status` | `Mapped[str]` | `mapped_column(default='pending')` |
| `paid` | `Mapped[bool]` | `mapped_column(default=False)` |
| `attended` | `Mapped[bool]` | `mapped_column(default=False)` |
| `fee_amount` | `Mapped[int &#124; None]` | `inferred` |
| `_legacy_access_key` | `Mapped[str]` | `mapped_column('access_key', default='', server_default='')` |
| `token_nonce` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `token_digest` | `Mapped[str]` | `mapped_column(default='', server_default='', index=True)` |
| `legacy_token_digest` | `Mapped[str &#124; None]` | `mapped_column(index=True)` |
| `token_expires_at` | `Mapped[str &#124; None]` | `inferred` |
| `token_revoked` | `Mapped[bool]` | `mapped_column(default=False, server_default=false())` |
| `channel` | `Mapped[str]` | `mapped_column(default='direct', server_default='direct')` |
| `decision_reason` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `policy_snapshot` | `Mapped[str]` | `mapped_column(default='{}', server_default='{}')` |
| `payer_mode` | `Mapped[str]` | `mapped_column(default='GROUP', server_default='GROUP')` |
| `payment_snapshot` | `Mapped[str]` | `mapped_column(default='{}', server_default='{}')` |
| `participants` | `Mapped[list['BookingParticipant']]` | `relationship(back_populates='booking', cascade='all, delete-orphan', order_by='BookingParticipant.position', lazy='selectin')` |
| `qr_key` | `Mapped[str &#124; None]` | `inferred` |
| `payment_status` | `Mapped[str]` | `mapped_column(default='unpaid', server_default='unpaid')` |
| `gender_at_booking` | `Mapped[str]` | `mapped_column(default='unspecified', server_default='unspecified')` |

Constraints: `(UniqueConstraint('session_id', 'member_id', name='uq_booking_member_session'), CheckConstraint("payer_mode IN ('GROUP','SPLIT')", name='ck_booking_payer_mode'))`.

### `charge_adjustments` — `ChargeAdjustment`

Source: `app/finance_models.py:59`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `batch_id` | `Mapped[int]` | `mapped_column(ForeignKey('charge_batches.id'), index=True)` |
| `charge_id` | `Mapped[int]` | `mapped_column(ForeignKey('charges.id'), index=True)` |
| `amount` | `Mapped[int]` | `inferred` |
| `version` | `Mapped[int]` | `inferred` |
| `reason` | `Mapped[str]` | `inferred` |
| `created_by` | `Mapped[int]` | `mapped_column(ForeignKey('hosts.id'))` |
| `created_at` | `Mapped[str]` | `mapped_column(default=utc_now)` |
| `request_key` | `Mapped[str]` | `inferred` |

Constraints: `(UniqueConstraint('batch_id', 'version', name='uq_adjustment_version'), UniqueConstraint('batch_id', 'request_key', name='uq_adjustment_request'), CheckConstraint('amount!=0', name='ck_adjustment_nonzero'))`.

### `charge_batches` — `ChargeBatch`

Source: `app/finance_models.py:8`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `session_id` | `Mapped[int]` | `mapped_column(ForeignKey('game_sessions.id'), index=True)` |
| `version` | `Mapped[int]` | `mapped_column(default=1)` |
| `snapshot` | `Mapped[str]` | `inferred` |
| `issued_by` | `Mapped[int]` | `mapped_column(ForeignKey('hosts.id'))` |
| `issued_at` | `Mapped[str]` | `mapped_column(default=utc_now)` |
| `closed_at` | `Mapped[str &#124; None]` | `inferred` |

Constraints: `(UniqueConstraint('session_id', name='uq_session_charge_batch'),)`.

### `charges` — `Charge`

Source: `app/finance_models.py:20`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `batch_id` | `Mapped[int]` | `mapped_column(ForeignKey('charge_batches.id'), index=True)` |
| `booking_id` | `Mapped[int]` | `mapped_column(ForeignKey('bookings.id'), index=True)` |
| `participant_id` | `Mapped[int]` | `mapped_column(ForeignKey('booking_participants.id'))` |
| `payer_participant_id` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('booking_participants.id'))` |
| `amount` | `Mapped[int]` | `inferred` |
| `detail` | `Mapped[str]` | `inferred` |

Constraints: `(UniqueConstraint('batch_id', 'participant_id', name='uq_batch_participant'), CheckConstraint('amount >= 0', name='ck_charge_nonnegative'))`.

### `club_access` — `ClubAccess`

Source: `app/models_extra.py:35`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `club_id` | `Mapped[int]` | `mapped_column(ForeignKey('clubs.id'), index=True)` |
| `host_id` | `Mapped[int]` | `mapped_column(ForeignKey('hosts.id'), index=True)` |
| `role` | `Mapped[str]` | `inferred` |
| `permissions` | `Mapped[str &#124; None]` | `inferred` |

Constraints: `(UniqueConstraint('club_id', 'host_id', name='uq_club_cohost'),)`.

### `clubs` — `Club`

Source: `app/main.py:73`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `owner_id` | `Mapped[int]` | `mapped_column(ForeignKey('hosts.id'), index=True)` |
| `name` | `Mapped[str]` | `inferred` |
| `location` | `Mapped[str]` | `mapped_column(default='')` |
| `sport_type` | `Mapped[str]` | `mapped_column(default='badminton', server_default='badminton')` |
| `skill_guidance` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `default_capacity` | `Mapped[int]` | `mapped_column(default=20, server_default='20')` |
| `default_approval_mode` | `Mapped[str]` | `mapped_column(default='MANUAL_APPROVE', server_default='MANUAL_APPROVE')` |
| `cancellation_policy` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `default_fee_mode` | `Mapped[str]` | `mapped_column(default='FIXED_PRICE', server_default='FIXED_PRICE')` |
| `venue_instructions` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `bank_name` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `account_holder` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `account_number` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `payment_note` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `qr_key` | `Mapped[str &#124; None]` | `inferred` |
| `fixed_fee` | `Mapped[int]` | `mapped_column(default=50000, server_default='50000')` |
| `fixed_fee_male` | `Mapped[int &#124; None]` | `inferred` |
| `fixed_fee_female` | `Mapped[int &#124; None]` | `inferred` |
| `monthly_fee` | `Mapped[int]` | `mapped_column(default=300000, server_default='300000')` |
| `monthly_fee_male` | `Mapped[int &#124; None]` | `inferred` |
| `monthly_fee_female` | `Mapped[int &#124; None]` | `inferred` |
| `trial_ends_at` | `Mapped[str &#124; None]` | `inferred` |
| `pro_ends_at` | `Mapped[str &#124; None]` | `inferred` |

Constraints: `(CheckConstraint('default_capacity BETWEEN 1 AND 200', name='ck_club_default_capacity'), CheckConstraint("default_approval_mode IN ('MANUAL_APPROVE', 'AUTO_APPROVE')", name='ck_club_approval_mode'), CheckConstraint("default_fee_mode IN ('COST_SHARING', 'FIXED_PRICE')", name='ck_club_fee_mode'))`.

### `email_tokens` — `EmailToken`

Source: `app/models_extra.py:81`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `host_id` | `Mapped[int]` | `mapped_column(ForeignKey('hosts.id'), index=True)` |
| `purpose` | `Mapped[str]` | `inferred` |
| `digest` | `Mapped[str]` | `mapped_column(unique=True)` |
| `expires_at` | `Mapped[str]` | `inferred` |
| `used` | `Mapped[bool]` | `mapped_column(default=False)` |
### `expenses` — `Expense`

Source: `app/main.py:223`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `session_id` | `Mapped[int]` | `mapped_column(ForeignKey('game_sessions.id'), index=True)` |
| `title` | `Mapped[str]` | `inferred` |
| `amount` | `Mapped[int]` | `inferred` |
| `category` | `Mapped[str]` | `mapped_column(default='OTHER', server_default='OTHER')` |
| `note` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `created_by` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('hosts.id'))` |
| `created_at` | `Mapped[str &#124; None]` | `inferred` |
| `allocated` | `Mapped[bool]` | `mapped_column(default=True, server_default='true')` |

Constraints: `(CheckConstraint("category IN ('COURT','EQUIPMENT','OTHER')", name='ck_expense_category'),)`.

### `game_sessions` — `GameSession`

Source: `app/main.py:119`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `club_id` | `Mapped[int]` | `mapped_column(ForeignKey('clubs.id'), index=True)` |
| `public_id` | `Mapped[str]` | `mapped_column(unique=True, index=True)` |
| `title` | `Mapped[str]` | `inferred` |
| `venue` | `Mapped[str]` | `mapped_column(default='')` |
| `starts_at` | `Mapped[str]` | `inferred` |
| `capacity` | `Mapped[int]` | `inferred` |
| `capacity_male` | `Mapped[int &#124; None]` | `inferred` |
| `capacity_female` | `Mapped[int &#124; None]` | `inferred` |
| `fixed_fee` | `Mapped[int]` | `mapped_column(default=0)` |
| `guest_fee` | `Mapped[int]` | `mapped_column(default=0)` |
| `fixed_fee_male` | `Mapped[int &#124; None]` | `inferred` |
| `fixed_fee_female` | `Mapped[int &#124; None]` | `inferred` |
| `guest_fee_male` | `Mapped[int &#124; None]` | `inferred` |
| `guest_fee_female` | `Mapped[int &#124; None]` | `inferred` |
| `is_open` | `Mapped[bool]` | `mapped_column(default=True)` |
| `recurring_rule_id` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('recurring_rules.id'))` |
| `rsvp_deadline` | `Mapped[str &#124; None]` | `inferred` |
| `is_cancelled` | `Mapped[bool]` | `mapped_column(default=False, server_default=false())` |
| `approval_mode` | `Mapped[str]` | `mapped_column(default='MANUAL_APPROVE', server_default='MANUAL_APPROVE')` |
| `sport_snapshot` | `Mapped[str]` | `mapped_column(default='badminton', server_default='badminton')` |
| `skill_guidance` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `venue_instructions` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `cancellation_policy` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `participation_conditions` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `maps_url` | `Mapped[str]` | `mapped_column(default='', server_default='')` |
| `registration_deadline` | `Mapped[str &#124; None]` | `inferred` |
| `cancellation_deadline` | `Mapped[str &#124; None]` | `inferred` |
| `lifecycle_status` | `Mapped[str]` | `mapped_column(default='OPEN', server_default='OPEN')` |
| `attendance_locked` | `Mapped[bool]` | `mapped_column(default=False, server_default=false())` |
| `fee_mode` | `Mapped[str]` | `mapped_column(default='FIXED_PRICE', server_default='FIXED_PRICE')` |
| `no_show_policy` | `Mapped[str]` | `mapped_column(default='FREE', server_default='FREE')` |
| `monthly_policy` | `Mapped[str]` | `mapped_column(default='SESSION_FEE', server_default='SESSION_FEE')` |

Constraints: `(UniqueConstraint('recurring_rule_id', 'starts_at', name='uq_rule_occurrence'), CheckConstraint("approval_mode IN ('AUTO_APPROVE','MANUAL_APPROVE')", name='ck_session_approval_mode'), CheckConstraint("lifecycle_status IN ('DRAFT','OPEN','IN_PROGRESS','PLAY_FINISHED','SETTLED','CANCELLED')", name='ck_session_lifecycle'), CheckConstraint("fee_mode IN ('FIXED_PRICE','COST_SHARING')", name='ck_session_fee_mode'), CheckConstraint("no_show_policy IN ('FREE','FULL')", name='ck_session_no_show'), CheckConstraint("monthly_policy IN ('EXEMPT_PAID','SESSION_FEE')", name='ck_session_monthly_policy'))`.

### `hosts` — `Host`

Source: `app/main.py:64`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `email` | `Mapped[str]` | `mapped_column(unique=True, index=True)` |
| `password_hash` | `Mapped[str]` | `inferred` |
| `email_verified` | `Mapped[bool]` | `mapped_column(default=False, server_default=false())` |
| `session_version` | `Mapped[int]` | `mapped_column(default=0, server_default='0')` |
| `is_platform_admin` | `Mapped[bool]` | `mapped_column(default=False, server_default=false())` |
### `members` — `Member`

Source: `app/main.py:105`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `club_id` | `Mapped[int]` | `mapped_column(ForeignKey('clubs.id'), index=True)` |
| `name` | `Mapped[str]` | `inferred` |
| `phone` | `Mapped[str]` | `inferred` |
| `kind` | `Mapped[str]` | `mapped_column(default='fixed')` |
| `gender` | `Mapped[str]` | `mapped_column(default='unspecified', server_default='unspecified')` |
| `level` | `Mapped[str]` | `mapped_column(default='')` |

Constraints: `(UniqueConstraint('club_id', 'phone', name='uq_member_phone'), CheckConstraint("gender IN ('male', 'female', 'unspecified')", name='ck_member_gender'))`.

### `money_movements` — `MoneyMovement`

Source: `app/finance_models.py:33`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `session_id` | `Mapped[int]` | `mapped_column(ForeignKey('game_sessions.id'), index=True)` |
| `booking_id` | `Mapped[int]` | `mapped_column(ForeignKey('bookings.id'), index=True)` |
| `payer_participant_id` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('booking_participants.id'))` |
| `amount` | `Mapped[int]` | `inferred` |
| `kind` | `Mapped[str]` | `inferred` |
| `source` | `Mapped[str]` | `inferred` |
| `reference` | `Mapped[str]` | `mapped_column(default='')` |
| `reason` | `Mapped[str]` | `mapped_column(default='')` |
| `confirmed_by` | `Mapped[int]` | `mapped_column(ForeignKey('hosts.id'))` |
| `occurred_at` | `Mapped[str]` | `mapped_column(default=utc_now)` |
| `created_at` | `Mapped[str]` | `mapped_column(default=utc_now)` |
| `request_key` | `Mapped[str]` | `inferred` |
| `proof_id` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('payment_proofs.id'))` |
| `reverses_id` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('money_movements.id'))` |

Constraints: `(UniqueConstraint('session_id', 'request_key', name='uq_money_request'), UniqueConstraint('proof_id', name='uq_money_proof'), UniqueConstraint('reverses_id', name='uq_money_reversal'), CheckConstraint('amount != 0', name='ck_money_nonzero'), CheckConstraint("(kind='RECEIVED' AND amount>0) OR (kind='REFUND_RECORDED' AND amount<0) OR kind='REVERSAL'", name='ck_money_sign'), CheckConstraint("kind IN ('RECEIVED','REFUND_RECORDED','REVERSAL')", name='ck_money_kind'), CheckConstraint("source IN ('BANK_TRANSFER','CASH','OTHER')", name='ck_money_source'))`.

### `monthly_dues` — `MonthlyDue`

Source: `app/main.py:236`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `member_id` | `Mapped[int]` | `mapped_column(ForeignKey('members.id'), index=True)` |
| `period` | `Mapped[str]` | `inferred` |
| `amount` | `Mapped[int]` | `inferred` |
| `paid` | `Mapped[bool]` | `mapped_column(default=False)` |
| `access_key` | `Mapped[str]` | `mapped_column(default=lambda: secrets.token_urlsafe(24), server_default='')` |
| `qr_key` | `Mapped[str &#124; None]` | `inferred` |
| `payment_status` | `Mapped[str]` | `mapped_column(default='unpaid', server_default='unpaid')` |
| `payment_snapshot` | `Mapped[str]` | `mapped_column(default='{}', server_default='{}')` |

Constraints: `(UniqueConstraint('member_id', 'period', name='uq_member_month'),)`.

### `payment_proofs` — `PaymentProof`

Source: `app/models_extra.py:66`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `booking_id` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('bookings.id'), index=True)` |
| `due_id` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('monthly_dues.id'), index=True)` |
| `asset_id` | `Mapped[int]` | `mapped_column(ForeignKey('stored_assets.id'))` |
| `status` | `Mapped[str]` | `mapped_column(default='reported')` |
| `reviewed_by` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('hosts.id'))` |
| `created_at` | `Mapped[str]` | `mapped_column(default=utc_now)` |
| `reviewed_at` | `Mapped[str &#124; None]` | `inferred` |
| `note` | `Mapped[str]` | `mapped_column(default='')` |
| `reported_amount` | `Mapped[int &#124; None]` | `inferred` |
| `payer_participant_id` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('booking_participants.id'))` |
### `platform_ledger_entries` — `PlatformLedgerEntry`

Source: `app/finance_models.py:75`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `entry_date` | `Mapped[str]` | `inferred` |
| `direction` | `Mapped[str]` | `inferred` |
| `category` | `Mapped[str]` | `inferred` |
| `amount` | `Mapped[int]` | `inferred` |
| `note` | `Mapped[str]` | `inferred` |
| `created_by` | `Mapped[int]` | `mapped_column(ForeignKey('hosts.id'))` |
| `created_at` | `Mapped[str]` | `mapped_column(default=utc_now)` |
| `updated_by` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('hosts.id'))` |
| `updated_at` | `Mapped[str &#124; None]` | `inferred` |
| `version` | `Mapped[int]` | `mapped_column(default=0)` |
| `request_key` | `Mapped[str]` | `mapped_column(unique=True)` |

Constraints: `(CheckConstraint('amount>0', name='ck_platform_amount'), CheckConstraint("direction IN ('INCOME','EXPENSE')", name='ck_platform_direction'))`.

### `recurring_rules` — `RecurringRule`

Source: `app/models_extra.py:13`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `club_id` | `Mapped[int]` | `mapped_column(ForeignKey('clubs.id'), index=True)` |
| `title` | `Mapped[str]` | `inferred` |
| `venue` | `Mapped[str]` | `inferred` |
| `first_start` | `Mapped[str]` | `inferred` |
| `weeks` | `Mapped[int]` | `inferred` |
| `capacity` | `Mapped[int]` | `inferred` |
| `capacity_male` | `Mapped[int &#124; None]` | `inferred` |
| `capacity_female` | `Mapped[int &#124; None]` | `inferred` |
| `fixed_fee` | `Mapped[int]` | `inferred` |
| `guest_fee` | `Mapped[int]` | `inferred` |
| `fixed_fee_male` | `Mapped[int &#124; None]` | `inferred` |
| `fixed_fee_female` | `Mapped[int &#124; None]` | `inferred` |
| `guest_fee_male` | `Mapped[int &#124; None]` | `inferred` |
| `guest_fee_female` | `Mapped[int &#124; None]` | `inferred` |
| `rsvp_hours` | `Mapped[int]` | `inferred` |
| `active` | `Mapped[bool]` | `mapped_column(default=True)` |
| `policy_json` | `Mapped[str]` | `mapped_column(default='{}', server_default='{}')` |
### `request_limits` — `RequestLimit`

Source: `app/security.py:12`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[str]` | `mapped_column(String(80), primary_key=True)` |
| `bucket` | `Mapped[int]` | `mapped_column(Integer)` |
| `hits` | `Mapped[int]` | `mapped_column(Integer)` |
### `stored_assets` — `StoredAsset`

Source: `app/models_extra.py:55`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `club_id` | `Mapped[int]` | `mapped_column(ForeignKey('clubs.id'), index=True)` |
| `key` | `Mapped[str]` | `mapped_column(unique=True)` |
| `kind` | `Mapped[str]` | `inferred` |
| `sha256` | `Mapped[str]` | `inferred` |
| `size` | `Mapped[int]` | `inferred` |
| `created_at` | `Mapped[str]` | `mapped_column(default=utc_now)` |
### `subscription_requests` — `SubscriptionRequest`

Source: `app/models_extra.py:91`.

| Attribute | Type | Mapping / client defaults |
| --- | --- | --- |
| `id` | `Mapped[int]` | `mapped_column(primary_key=True)` |
| `club_id` | `Mapped[int]` | `mapped_column(ForeignKey('clubs.id'), index=True)` |
| `months` | `Mapped[int]` | `inferred` |
| `amount` | `Mapped[int]` | `inferred` |
| `status` | `Mapped[str]` | `mapped_column(default='pending')` |
| `reference` | `Mapped[str]` | `inferred` |
| `created_at` | `Mapped[str]` | `mapped_column(default=utc_now)` |
| `reviewed_at` | `Mapped[str &#124; None]` | `inferred` |
| `reviewed_by` | `Mapped[int &#124; None]` | `mapped_column(ForeignKey('hosts.id'))` |

## Historical migrations

| Revision | Parent | Source |
| --- | --- | --- |
| `0001_initial` | `None` | `alembic/versions/0001_initial.py` |
| `0002_member_gender` | `0001_initial` | `alembic/versions/0002_member_gender.py` |
| `0003_gender_fees` | `0002_member_gender` | `alembic/versions/0003_gender_fees.py` |
| `0004_full_roadmap` | `0003_gender_fees` | `alembic/versions/0004_full_roadmap.py` |
| `0005_club_settings` | `0004_full_roadmap` | `alembic/versions/0005_club_settings.py` |
| `0006_group_bookings` | `0005_club_settings` | `alembic/versions/0006_group_bookings.py` |
| `0007_session_attendance` | `0006_group_bookings` | `alembic/versions/0007_session_attendance.py` |
| `0008_manual_billing` | `0007_session_attendance` | `alembic/versions/0008_manual_billing.py` |
| `0009_close_permissions_platform` | `0008_manual_billing` | `alembic/versions/0009_close_permissions_platform.py` |
| `0010_payment_config_snapshot` | `0009_close_permissions_platform` | `alembic/versions/0010_payment_config_snapshot.py` |
| `0011_fixed_member_fees` | `0010_payment_config_snapshot` | `alembic/versions/0011_fixed_member_fees.py` |

## Test inventory

These are test function counts, not collected parametrized case counts. Execution results live in VALIDATION.md.

### `tests/test_attendance.py`

- `test_partial_group_attendance_no_show_walk_in_and_early_exit` (line 25)
- `test_version_conflict_idempotent_retry_and_explicit_correction_reason` (line 52)
- `test_session_finish_is_not_paid_or_settled_and_reopen_requires_reason` (line 72)
- `test_walk_in_capacity_tenant_scope_and_duplicate_phone` (line 93)
- `test_replacement_and_any_attendance_block_guest_party_edit` (line 110)
- `test_cohost_roles_and_cancelled_session_backend_guards` (line 129)

### `tests/test_attendance_browser.py`

- `test_host_runs_partial_group_on_mobile_without_horizontal_table` (line 11)

### `tests/test_billing.py`

- `test_exact_aa_rounding_issue_retry_and_locked_basis` (line 45)
- `test_partial_bank_cash_overpayment_refund_reversal_and_no_boolean_bypass` (line 71)
- `test_split_group_separate_obligations_and_payer_isolation` (line 100)
- `test_no_show_paid_monthly_late_exit_waiver_and_loss` (line 114)
- `test_proofs_are_reports_review_explicit_amount_duplicate_and_multiple_reports` (line 138)
- `test_issue_requires_finished_attendance_and_cross_tenant_access` (line 163)
- `test_qr_and_bank_details_snapshot_together_and_legacy_money_opening_once` (line 176)
- `test_published_full_no_show_waiver_zero_billable_and_policy_freeze` (line 195)
- `test_host_receives_waitlisted_group_at_court_without_reopening_public_registration` (line 214)

### `tests/test_billing_browser.py`

- `test_mobile_issue_report_review_partial_then_cash` (line 12)

### `tests/test_closing_permissions.py`

- `test_close_unpaid_collect_after_close_adjust_and_preserve_original` (line 13)
- `test_granular_checkin_cannot_read_finance_contact_private_links_or_mutate_other_areas` (line 50)
- `test_custom_finance_settings_permissions_and_revocation` (line 73)
- `test_platform_ledger_admin_only_history_and_no_club_side_effect` (line 97)

### `tests/test_club_deletion.py`

- `test_owner_can_delete_empty_club_and_keep_audit` (line 49)
- `test_exact_confirmation_name_required` (line 71)
- `test_csrf_authentication_and_owner_only_even_with_all_permissions` (line 78)
- `test_deletes_populated_club_and_files_without_touching_other_club` (line 98)
- `test_commit_failure_rolls_back_and_keeps_images` (line 159)
- `test_storage_failure_is_logged_after_database_commit` (line 175)

### `tests/test_club_deletion_browser.py`

- `test_delete_club_confirmation` (line 13)

### `tests/test_club_settings.py`

- `test_create_and_edit_all_settings_and_complete_audit` (line 49)
- `test_create_with_each_catalog_sport` (line 77)
- `test_invalid_settings_are_rejected_atomically` (line 92)
- `test_legacy_forms_and_database_defaults_preserve_existing_settings` (line 106)
- `test_owner_only_settings_csrf_and_cross_tenant_access` (line 122)
- `test_sport_labels_and_legacy_financial_data_remain_independent` (line 142)
- `test_new_migration_only_adds_settings_in_dedicated_schema` (line 173)

### `tests/test_club_settings_browser.py`

- `test_club_settings_mobile_and_desktop` (line 43)

### `tests/test_deployment.py`

- `test_vercel_accepts_provider_url_and_defaults_to_production` (line 15)
- `test_vercel_rejects_ephemeral_sqlite_even_with_development_env` (line 24)
- `test_vercel_requires_database_and_secure_cookies` (line 32)
- `test_vercel_entrypoint_import_never_connects_or_creates_tables` (line 43)
- `test_beta_signup_and_static_assets` (line 67)
- `test_ready_reports_database_failure_without_exposing_details` (line 78)

### `tests/test_dokploy.py`

- `test_dokploy_requires_https_cookie_origin_and_explicit_hosts` (line 29)
- `test_read_only_preview_blocks_mutations_before_database_access` (line 46)
- `test_read_only_preview_uses_postgres_read_only_sessions` (line 59)
- `test_dokploy_import_never_connects_or_migrates` (line 78)
- `test_self_hosted_headers_and_disabled_reset` (line 97)
- `test_readiness_rejects_reachable_database_with_old_club_schema` (line 109)
- `test_resend_disabled_or_missing_key_never_claims_delivery` (line 128)
- `test_resend_retries_are_bounded_and_idempotent` (line 144)
- `test_private_local_media_survives_separate_process_restart` (line 169)
- `test_production_refuses_implicit_ephemeral_storage` (line 192)
- `test_blob_stays_private_outside_vercel` (line 200)
- `test_resend_transport_failure_and_provider_backoff` (line 211)
- `test_proxy_client_ip_and_scheme_require_trusted_source` (line 232)

### `tests/test_dokploy_smoke.py`

- `test_smoke_uses_only_get_through_loopback_host_route` (line 10)
- `test_smoke_refuses_host_override_on_public_origin` (line 31)

### `tests/test_fixed_member_fees.py`

- `test_fixed_member_defaults_reach_single_and_recurring_bookings` (line 19)
- `test_invalid_fixed_member_prices_are_atomic` (line 66)
- `test_fixed_member_prices_require_finance_access_and_csrf` (line 75)

### `tests/test_flows.py`

- `test_full_host_guest_booking_finance_and_tenant_isolation` (line 47)
- `test_password_validation_and_public_close` (line 84)
- `test_legacy_monthly_dues_duplicates_and_host_login` (line 98)

### `tests/test_group_booking_browser.py`

- `test_mobile_facebook_guest_group_and_private_link` (line 11)

### `tests/test_group_bookings.py`

- `test_manual_whole_group_capacity_and_payment_total` (line 58)
- `test_auto_approval_waitlist_and_group_cancellation_promote_atomically` (line 87)
- `test_edit_growth_requires_capacity_and_manual_reapproval` (line 103)
- `test_tokens_legacy_hash_rotation_expiry_revoke_and_cross_club` (line 128)
- `test_policy_snapshot_deadlines_safe_maps_and_financial_freeze` (line 159)
- `test_group_gender_quota_reject_reason_and_profile_privacy` (line 197)
- `test_invalid_group_rolls_back_new_contact_and_no_unowned_reactivation` (line 214)
- `test_host_policy_edits_need_reason_and_preserve_accepted_booking_policy` (line 229)
- `test_paid_cancellation_keeps_money_and_duplicate_guest_submit_is_idempotent` (line 255)

### `tests/test_guest_lookup.py`

- `test_phone_first_lookup_preserves_privacy_then_autofills_only_own_booking` (line 40)
- `test_unknown_number_is_blank_until_user_confirms` (line 64)
- `test_lookup_does_not_read_another_club_profile` (line 76)
- `test_lookup_token_cannot_confirm_a_different_phone` (line 87)
- `test_changed_profile_requires_a_fresh_confirmation` (line 96)
- `test_lookup_handles_invalid_phones_closed_sessions_and_limits` (line 111)
- `test_vietnam_phone_formats_find_the_same_guest` (line 128)
- `test_lookup_finds_legacy_international_phone_without_duplicate_member` (line 136)

### `tests/test_hardening.py`

- `test_lookup_and_signed_payload_do_not_disclose_profiles_or_grant_private_link` (line 16)
- `test_upload_magic_and_mime_both_required_and_paths_confined` (line 28)
- `test_database_failure_safe_message_and_no_partial_money_then_retry` (line 43)
- `test_xss_escaped_in_group_policy_and_private_pages` (line 70)
- `test_monthly_and_unissued_booking_qr_bank_details_stay_together` (line 77)

### `tests/test_member_gender.py`

- `test_host_can_add_and_edit_gender_independently_of_member_kind` (line 36)
- `test_unknown_existing_gender_and_invalid_input_do_not_become_male` (line 56)
- `test_public_gender_roster_totals_csv_and_profile_ownership` (line 69)
- `test_gender_migration_preserves_existing_data_and_stays_in_schema` (line 106)
- `test_gender_price_rules_and_zero_fee` (line 129)
- `test_gender_prices_apply_to_bookings_without_changing_history` (line 135)

### `tests/test_postgres_migrations.py`

- `test_club_settings_postgres_upgrade_preserves_legacy_data_and_other_schema` (line 17)

### `tests/test_real_session_browser.py`

- `test_facebook_to_closed_session_15_players_mobile` (line 18)

### `tests/test_roadmap.py`

- `test_sidebar_workspaces_filters_and_finance_monthly_generation` (line 54)
- `test_weekly_generation_rsvp_capacity_cancel_and_private_keys` (line 70)
- `test_private_qr_proof_manual_review_and_role_separation` (line 96)
- `test_bad_image_is_rejected_without_creating_asset` (line 133)
- `test_password_change_invalidates_other_sessions_and_one_use_reset` (line 141)
- `test_admin_requires_a_verified_email_and_explicit_allowlist` (line 157)
- `test_gender_quota_rsvp_and_waitlist_promote_only_eligible_players` (line 168)
- `test_recurring_extend_stop_and_invitation_idempotence` (line 199)
- `test_monthly_proof_rejection_resubmission_and_confirm` (line 214)
- `test_browser_errors_are_readable_and_do_not_echo_passwords` (line 231)

### `tests/test_sprint01.py`

- `test_club_and_member_edit_and_ownership` (line 22)
- `test_readiness_uses_live_db_connection` (line 40)
- `test_settings_rejects_production_sqlite_and_public_schema` (line 46)
- `test_postgres_migration_ddl_is_schema_qualified_and_non_destructive` (line 67)

## Templates and assets

| File | Lines |
| --- | ---: |
| `app/templates/account.html` | 5 |
| `app/templates/admin.html` | 5 |
| `app/templates/attendance.html` | 24 |
| `app/templates/auth.html` | 6 |
| `app/templates/base.html` | 42 |
| `app/templates/billing.html` | 17 |
| `app/templates/club.html` | 12 |
| `app/templates/club_settings_fields.html` | 11 |
| `app/templates/clubs.html` | 7 |
| `app/templates/components.html` | 17 |
| `app/templates/dashboard.html` | 20 |
| `app/templates/due_payment.html` | 2 |
| `app/templates/email_action.html` | 4 |
| `app/templates/error.html` | 3 |
| `app/templates/finance.html` | 9 |
| `app/templates/forms.html` | 38 |
| `app/templates/game.html` | 19 |
| `app/templates/icons.html` | 27 |
| `app/templates/join.html` | 67 |
| `app/templates/member_fields.html` | 4 |
| `app/templates/members.html` | 9 |
| `app/templates/participant.html` | 22 |
| `app/templates/participant_billing.html` | 5 |
| `app/templates/party_fields.html` | 14 |
| `app/templates/payment_review.html` | 3 |
| `app/templates/platform_ledger.html` | 8 |
| `app/templates/schedule.html` | 8 |
| `app/templates/session_fees.html` | 19 |
| `app/templates/session_policy_fields.html` | 15 |
| `app/templates/settings.html` | 29 |
| `public/static/booking.js` | 34 |
| `public/static/join.js` | 63 |
| `public/static/style.css` | 13 |
| `public/static/workspace.js` | 78 |
