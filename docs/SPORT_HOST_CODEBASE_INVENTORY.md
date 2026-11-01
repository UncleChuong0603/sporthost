# SportHost codebase inventory

Generated from Python AST and repository files for the 2026-11-01 audit; describes source, not live database state.

## Models / tables

| File | Model | Table | Fields |
| --- | --- | --- | --- |
| `app/main.py` | `Host` | `hosts` | `id`, `email`, `password_hash`, `email_verified`, `session_version`, `is_platform_admin` |
| `app/main.py` | `Club` | `clubs` | `id`, `owner_id`, `name`, `location`, `sport_type`, `skill_guidance`, `default_capacity`, `default_approval_mode`, `cancellation_policy`, `default_fee_mode`, `venue_instructions`, `bank_name`, `account_holder`, `account_number`, `payment_note`, `qr_key`, `monthly_fee`, `monthly_fee_male`, `monthly_fee_female`, `trial_ends_at`, `pro_ends_at` |
| `app/main.py` | `Member` | `members` | `id`, `club_id`, `name`, `phone`, `kind`, `gender`, `level` |
| `app/main.py` | `GameSession` | `game_sessions` | `id`, `club_id`, `public_id`, `title`, `venue`, `starts_at`, `capacity`, `capacity_male`, `capacity_female`, `fixed_fee`, `guest_fee`, `fixed_fee_male`, `fixed_fee_female`, `guest_fee_male`, `guest_fee_female`, `is_open`, `recurring_rule_id`, `rsvp_deadline`, `is_cancelled` |
| `app/main.py` | `Booking` | `bookings` | `id`, `session_id`, `member_id`, `status`, `paid`, `attended`, `fee_amount`, `access_key`, `qr_key`, `payment_status`, `gender_at_booking` |
| `app/main.py` | `Expense` | `expenses` | `id`, `session_id`, `title`, `amount` |
| `app/main.py` | `MonthlyDue` | `monthly_dues` | `id`, `member_id`, `period`, `amount`, `paid`, `access_key`, `qr_key`, `payment_status` |
| `app/models_extra.py` | `RecurringRule` | `recurring_rules` | `id`, `club_id`, `title`, `venue`, `first_start`, `weeks`, `capacity`, `capacity_male`, `capacity_female`, `fixed_fee`, `guest_fee`, `fixed_fee_male`, `fixed_fee_female`, `guest_fee_male`, `guest_fee_female`, `rsvp_hours`, `active` |
| `app/models_extra.py` | `ClubAccess` | `club_access` | `id`, `club_id`, `host_id`, `role` |
| `app/models_extra.py` | `AuditLog` | `audit_logs` | `id`, `club_id`, `host_id`, `action`, `details`, `created_at` |
| `app/models_extra.py` | `StoredAsset` | `stored_assets` | `id`, `club_id`, `key`, `kind`, `sha256`, `size`, `created_at` |
| `app/models_extra.py` | `PaymentProof` | `payment_proofs` | `id`, `booking_id`, `due_id`, `asset_id`, `status`, `reviewed_by`, `created_at`, `reviewed_at`, `note` |
| `app/models_extra.py` | `EmailToken` | `email_tokens` | `id`, `host_id`, `purpose`, `digest`, `expires_at`, `used` |
| `app/models_extra.py` | `SubscriptionRequest` | `subscription_requests` | `id`, `club_id`, `months`, `amount`, `status`, `reference`, `created_at`, `reviewed_at`, `reviewed_by` |
| `app/security.py` | `RequestLimit` | `request_limits` | `id`, `bucket`, `hits` |

## Routes

| Method | Path | Handler | File:line |
| --- | --- | --- | --- |
| GET | `/account` | `account` | `app/accounts.py:69` |
| POST | `/account/password` | `password` | `app/accounts.py:74` |
| POST | `/account/verify-email` | `send_verification` | `app/accounts.py:83` |
| GET | `/verify-email` | `verification_page` | `app/accounts.py:93` |
| POST | `/verify-email` | `verification` | `app/accounts.py:100` |
| GET | `/forgot-password` | `forgot` | `app/accounts.py:108` |
| POST | `/forgot-password` | `request_reset` | `app/accounts.py:111` |
| GET | `/reset-password` | `reset_page` | `app/accounts.py:125` |
| POST | `/reset-password` | `reset_password` | `app/accounts.py:130` |
| GET | `/admin` | `admin` | `app/accounts.py:137` |
| POST | `/admin/clubs/{club_id}/trial` | `extend_trial` | `app/accounts.py:145` |
| GET | `/` | `home` | `app/main.py:394` |
| GET | `/signup` | `signup_page` | `app/main.py:399` |
| POST | `/signup` | `signup` | `app/main.py:402` |
| GET | `/login` | `login_page` | `app/main.py:417` |
| POST | `/login` | `login` | `app/main.py:420` |
| POST | `/logout` | `logout` | `app/main.py:433` |
| GET | `/dashboard` | `dashboard` | `app/main.py:438` |
| POST | `/clubs` | `create_club` | `app/main.py:444` |
| GET | `/clubs/{club_id}` | `club_page` | `app/main.py:454` |
| POST | `/clubs/{club_id}/settings` | `update_club` | `app/main.py:468` |
| POST | `/clubs/{club_id}/members/{member_id}/edit` | `update_member` | `app/main.py:478` |
| POST | `/clubs/{club_id}/members` | `add_member` | `app/main.py:494` |
| POST | `/clubs/{club_id}/games` | `create_game` | `app/main.py:505` |
| POST | `/clubs/{club_id}/dues` | `add_due` | `app/main.py:514` |
| POST | `/dues/{due_id}/toggle` | `toggle_due` | `app/main.py:527` |
| GET | `/games/{game_id}` | `game_page` | `app/main.py:538` |
| POST | `/games/{game_id}/fixed` | `add_fixed_to_game` | `app/main.py:557` |
| POST | `/games/{game_id}/bookings/{booking_id}/{action}` | `change_booking` | `app/main.py:572` |
| POST | `/games/{game_id}/toggle-open` | `toggle_open` | `app/main.py:602` |
| POST | `/games/{game_id}/expenses` | `add_expense` | `app/main.py:608` |
| GET | `/join/{public_id}` | `join_page` | `app/main.py:639` |
| POST | `/join/{public_id}/lookup` | `lookup_guest` | `app/main.py:646` |
| POST | `/join/{public_id}` | `join` | `app/main.py:662` |
| GET | `/games/{game_id}/export.csv` | `export_game` | `app/main.py:703` |
| GET | `/health` | `health` | `app/main.py:713` |
| GET | `/ready` | `readiness` | `app/main.py:718` |
| POST | `/clubs/{club_id}/payment-settings` | `payment_settings` | `app/payments.py:59` |
| POST | `/clubs/{club_id}/payment-settings/remove-qr` | `remove_qr` | `app/payments.py:75` |
| POST | `/clubs/{club_id}/monthly-prices` | `monthly_prices` | `app/payments.py:81` |
| GET | `/clubs/{club_id}/qr` | `host_qr` | `app/payments.py:90` |
| GET | `/attend/{key}` | `participant_page` | `app/payments.py:96` |
| POST | `/attend/{key}/rsvp` | `rsvp` | `app/payments.py:105` |
| POST | `/attend/{key}/cancel` | `cancel_participant` | `app/payments.py:121` |
| GET | `/attend/{key}/qr` | `participant_qr` | `app/payments.py:128` |
| POST | `/attend/{key}/proof` | `upload_proof` | `app/payments.py:135` |
| GET | `/dues/pay/{key}` | `due_page` | `app/payments.py:151` |
| GET | `/dues/pay/{key}/qr` | `due_qr` | `app/payments.py:161` |
| POST | `/dues/pay/{key}/proof` | `due_proof` | `app/payments.py:170` |
| GET | `/payments/review` | `review_page` | `app/payments.py:187` |
| GET | `/proofs/{proof_id}/image` | `proof_image` | `app/payments.py:207` |
| POST | `/proofs/{proof_id}/review` | `review_proof` | `app/payments.py:215` |
| POST | `/games/{game_id}/invite-fixed` | `invite_fixed` | `app/workspace.py:137` |
| POST | `/games/{game_id}/settings` | `edit_game` | `app/workspace.py:148` |
| POST | `/rules/{rule_id}/stop` | `stop_rule` | `app/workspace.py:170` |
| POST | `/rules/{rule_id}/extend` | `extend_rule` | `app/workspace.py:178` |
| GET | `/clubs` | `clubs_page` | `app/workspace.py:188` |
| GET | `/schedule` | `schedule_page` | `app/workspace.py:193` |
| POST | `/workspace/games` | `workspace_create_game` | `app/workspace.py:205` |
| POST | `/rules/{rule_id}/generate` | `regenerate` | `app/workspace.py:230` |
| GET | `/members` | `members_page` | `app/workspace.py:239` |
| POST | `/workspace/members` | `workspace_member` | `app/workspace.py:247` |
| GET | `/finance` | `finance_page` | `app/workspace.py:260` |
| GET | `/finance/export.csv` | `export_finance` | `app/workspace.py:275` |
| POST | `/clubs/{club_id}/dues/bulk` | `bulk_dues` | `app/workspace.py:285` |
| GET | `/clubs/{club_id}/settings` | `settings_page` | `app/workspace.py:299` |
| POST | `/clubs/{club_id}/cohosts` | `add_cohost` | `app/workspace.py:307` |
| POST | `/clubs/{club_id}/cohosts/{access_id}/remove` | `remove_cohost` | `app/workspace.py:320` |
| POST | `/games/{game_id}/cancel` | `cancel_game` | `app/workspace.py:327` |

Total route declarations: 69. Authorization is enforced in handlers via `require_host`, `owned_club`, `owned_session`, `admin_host`, or capability links. See gap analysis for read-permission limitations.

## Templates

- `app/templates/account.html`
- `app/templates/admin.html`
- `app/templates/auth.html`
- `app/templates/base.html`
- `app/templates/club.html`
- `app/templates/club_settings_fields.html`
- `app/templates/clubs.html`
- `app/templates/components.html`
- `app/templates/dashboard.html`
- `app/templates/due_payment.html`
- `app/templates/email_action.html`
- `app/templates/error.html`
- `app/templates/finance.html`
- `app/templates/forms.html`
- `app/templates/game.html`
- `app/templates/icons.html`
- `app/templates/join.html`
- `app/templates/member_fields.html`
- `app/templates/members.html`
- `app/templates/participant.html`
- `app/templates/payment_review.html`
- `app/templates/schedule.html`
- `app/templates/session_fees.html`
- `app/templates/settings.html`

## Migrations

- `alembic/versions/0001_initial.py`: `None` -> `0001_initial`
- `alembic/versions/0002_member_gender.py`: `0001_initial` -> `0002_member_gender`
- `alembic/versions/0003_gender_fees.py`: `0002_member_gender` -> `0003_gender_fees`
- `alembic/versions/0004_full_roadmap.py`: `0003_gender_fees` -> `0004_full_roadmap`
- `alembic/versions/0005_club_settings.py`: `0004_full_roadmap` -> `0005_club_settings`

## Test modules

- `tests/test_club_settings.py`: `test_create_and_edit_all_settings_and_complete_audit`, `test_create_with_each_catalog_sport`, `test_invalid_settings_are_rejected_atomically`, `test_legacy_forms_and_database_defaults_preserve_existing_settings`, `test_owner_only_settings_csrf_and_cross_tenant_access`, `test_sport_labels_and_legacy_financial_data_remain_independent`, `test_new_migration_only_adds_settings_in_dedicated_schema`
- `tests/test_club_settings_browser.py`: `test_club_settings_mobile_and_desktop`
- `tests/test_deployment.py`: `test_vercel_accepts_provider_url_and_defaults_to_production`, `test_vercel_rejects_ephemeral_sqlite_even_with_development_env`, `test_vercel_requires_database_and_secure_cookies`, `test_vercel_entrypoint_import_never_connects_or_creates_tables`, `test_beta_signup_and_static_assets`, `test_ready_reports_database_failure_without_exposing_details`
- `tests/test_flows.py`: `test_full_host_guest_booking_finance_and_tenant_isolation`, `test_password_validation_and_public_close`, `test_monthly_dues_duplicates_and_host_login`
- `tests/test_guest_lookup.py`: `test_phone_first_lookup_autofills_without_registering`, `test_unknown_number_is_blank_until_user_confirms`, `test_lookup_does_not_read_another_club_profile`, `test_lookup_token_cannot_confirm_a_different_phone`, `test_changed_profile_requires_a_fresh_confirmation`, `test_lookup_handles_invalid_phones_closed_sessions_and_limits`, `test_vietnam_phone_formats_find_the_same_guest`, `test_lookup_finds_legacy_international_phone_without_duplicate_member`
- `tests/test_member_gender.py`: `test_host_can_add_and_edit_gender_independently_of_member_kind`, `test_unknown_existing_gender_and_invalid_input_do_not_become_male`, `test_public_gender_roster_totals_csv_and_profile_ownership`, `test_gender_migration_preserves_existing_data_and_stays_in_schema`, `test_gender_price_rules_and_zero_fee`, `test_gender_prices_apply_to_bookings_without_changing_history`
- `tests/test_postgres_migrations.py`: `test_club_settings_postgres_upgrade_preserves_legacy_data_and_other_schema`
- `tests/test_roadmap.py`: `test_sidebar_workspaces_filters_and_finance_monthly_generation`, `test_weekly_generation_rsvp_capacity_cancel_and_private_keys`, `test_private_qr_proof_manual_review_and_role_separation`, `test_bad_image_is_rejected_without_creating_asset`, `test_password_change_invalidates_other_sessions_and_one_use_reset`, `test_admin_requires_a_verified_email_and_explicit_allowlist`, `test_gender_quota_rsvp_and_waitlist_promote_only_eligible_players`, `test_recurring_extend_stop_and_invitation_idempotence`, `test_monthly_proof_rejection_resubmission_and_confirm`, `test_browser_errors_are_readable_and_do_not_echo_passwords`
- `tests/test_sprint01.py`: `test_club_and_member_edit_and_ownership`, `test_readiness_uses_live_db_connection`, `test_settings_rejects_production_sqlite_and_public_schema`, `test_postgres_migration_ddl_is_schema_qualified_and_non_destructive`

## Runtime / operations

- `app/settings.py`: PostgreSQL dedicated schema, psycopg, env validation; no credentials recorded here.
- `alembic/env.py`: schema preflight, unknown-table/history refusal, schema-scoped version table and migrations.
- `scripts/check_db.py`: read-only preflight. `scripts/migrate.py`: explicit operator-only migration.
- `scripts/backup.py`, `scripts/retention.py`, `scripts/admin.py`: manual operator utilities.
- `app/storage.py`: Pillow image re-encoding, local development storage or private Blob.
- `app/security.py`: database-backed request limits. `app/accounts.py`: account/email/admin workflows.
- `public/static/style.css`, `workspace.js`, `join.js`: responsive UI and progressive JavaScript.
- `Dockerfile`, `vercel.json`, `index.py`: existing deployment entrypoints; no auto migrations.
