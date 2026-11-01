# Sprint 2 — đăng ký nhóm và quản lý chỗ

## Phạm vi đã triển khai

Tiếp tục action plan theo yêu cầu người dùng ngày 01/11/2026, bao gồm cho phép push,
deploy và kiểm thử production. Sprint 1 đã deploy commit `7a8ae26` và smoke production pass.
Không đổi stack hay database; schema runtime vẫn là `clubhost`.

- Guest đăng ký nhóm tối đa 20 người không cần account; một liên hệ chính, tên/trình độ/
  giới tính tùy chọn từng người, mỗi người một chỗ. Nhóm được xét nguyên nhóm.
- AUTO_APPROVE hoặc MANUAL_APPROVE override theo buổi; không đủ chỗ → waitlist cả nhóm.
  Nhóm PENDING không được báo đã giữ chỗ. MANUAL waitlist cần host duyệt; AUTO đôn nhóm
  phù hợp khi hủy, dưới cùng khóa hàng session; member RSVP hiện có vẫn được giữ.
- Public hiển thị môn, sân/Google Maps, trình độ, hướng dẫn, điều kiện, chính sách, hạn,
  chỗ còn và CTA theo trạng thái. Không hiển thị tên/điện thoại/link riêng của người khác.
- Snapshot chính sách theo buổi; booking giữ chính sách/hạn hủy đã chấp nhận. Thay đổi
  CLB không đổi buổi đã tạo; sửa policy buổi sau khi có đăng ký cần lý do, audit đủ trước/sau.
- Guest sửa người đi cùng/số người theo hạn. Tăng nhóm phải kiểm tra chỗ và duyệt lại;
  nếu không đủ chỗ giữ nguyên nhóm đang confirmed. Đã có điểm danh hoặc giao dịch thì
  không tự sửa cơ sở thu. Hủy vẫn giữ khoản đã thu để host đối soát/hoàn thủ công.
- Link riêng dùng nonce ngẫu nhiên + HMAC server-secret, DB chỉ lưu hash của capability.
  Hạn mặc định 180 ngày, rate limiting, host thu hồi hoặc cấp lại. Link cũ map SHA-256,
  plaintext được scrub sau deploy; không dùng ID/điện thoại để cấp quyền quản lý.
- Có nút cập nhật trạng thái, lưu/copy link, hướng dẫn nhờ host cấp lại sau xác minh.
  Host cần báo thay đổi thủ công; không giả định hệ thống đã gửi email/SMS.
- UI nhóm dùng label và native form controls; mobile 375px kiểm tra đăng ký 3 người,
  xem link riêng, host duyệt, cập nhật trạng thái và hủy. Bảng host/CSV bổ sung số người
  và tên đi cùng; phí booking là tổng nhóm, không cộng lần nữa theo participants.

## Files và migration

Files mới:

- `app/booking_service.py`: policy, capacity theo người, token, khởi tạo booking legacy-compatible.
- `app/booking_routes.py`: guest edit và host rotate/revoke capability.
- `app/templates/party_fields.html`, `session_policy_fields.html`, `public/static/booking.js`.
- `alembic/versions/0006_group_bookings.py`.
- `tests/test_group_bookings.py`, `tests/test_group_booking_browser.py`.
- `scripts/check_group_concurrency.py`, `apply_verified_release.py`,
  `scrub_booking_tokens.py`, `smoke_group_release.py`.

Files sửa:

- `app/main.py`, `models_extra.py`, `workspace.py`, `payments.py`.
- Templates `base`, `components`, `forms`, `game`, `join`, `participant`; `style.css`.
- `tests/conftest.py`, `test_club_settings.py`, `test_postgres_migrations.py`.
- `scripts/verify_release.py`, README, CHANGELOG và tài liệu sprint/test.

Migration 0006:

- Bảng `booking_participants`; mỗi booking cũ backfill đúng một row, giữ ID booking,
  `fee_amount`, paid/payment status, member/session/proof và các nghĩa vụ tháng.
- Thêm cột policy snapshot/override/deadlines vào game, policy JSON cho recurring rule.
- Thêm nonce/hash/legacy hash/expiry/revocation/channel/decision reason/accepted policy
  vào booking; indexes và constraints. Không thay enum API chỉ để dịch text.
- Giai đoạn expand giữ access_key cũ để app cũ tiếp tục chạy trong lúc deploy. Sau khi
  app mới READY, chạy scrub chỉ schema clubhost, backfill booking phát sinh lúc cutover,
  kiểm tra không còn plaintext và old links vẫn được xác thực bằng legacy digest.
- Không DROP/TRUNCATE bảng sản phẩm hoặc schema khác. Downgrade destructive bị chặn;
  giữ schema mới và roll back code cần phối hợp cutover token. Sau scrub không dùng app
  cũ phụ thuộc plaintext; phương án phục hồi là bản backup đã kiểm chứng và release review.

## Kiểm chứng

Đã thực chạy trước release:

- `$env:SPORTHOST_BROWSER_TESTS='1'; python -m pytest -q`: **83 passed, 1 skipped in 89.82s**,
  gồm Edge desktop/mobile, nhóm 3 người, policy/idempotency và test cũ.
- `python -m scripts.check_group_concurrency --env-file PRIVATE_ENV`: pass trên PostgreSQL
  thật trong schema `sporthost_group_check_<random>`; hai khách tranh 1 chỗ, hai nhóm auto,
  hai host requests duyệt cùng lúc. Chỉ một nhóm confirmed, không vượt tổng chỗ/không tách nhóm.
- Fixture 0005→0006 có booking cũ: đúng một participant, giữ phí/paid, link cũ mở được.
- `python -m scripts.verify_release`: backup riêng 16 bảng source revision 0005, restore
  đầy đủ vào schema ngẫu nhiên, migrate 0006, đối chiếu mọi cột cũ không đổi. Bản backup
  nằm ngoài Git trong `.vercel/release-checks`; không in bản ghi hoặc credentials vào chat.
- Compileall và `git diff --check` pass.

**Release production đã hoàn tất:** migration 0006 sau backup/restore và kiểm tra hash,
push commit `b88f166` lên `main`, Vercel deployment `dpl_C8S3DJUrQRs5Fb1nXuTog5x68QPe`
READY và alias `https://sporthost.vercel.app`.
`scrub_booking_tokens --apply` xác minh 0 plaintext legacy còn lại tại cutover.
`smoke_group_release --run` pass hai luồng MANUAL/AUTO: nhóm, capacity, sửa/hủy,
waitlist, hash link, rotate, CSRF và cross-tenant denial. Chỉ dữ liệu QA của lượt chạy
được dọn. `/health`, `/ready`, `booking.js` trả 200.
Rà soát sau release phát hiện menu quản lý link lặp trong `<title>`; đã sửa template
và thêm assertion tiêu đề/không lặp (không cần migration).

Test SQLite mặc định vẫn không trỏ tới production. Một pytest
PostgreSQL opt-in theo naming policy cũ có thể skip, nhưng các kiểm chứng PostgreSQL
thực tế bên trên được chạy bằng script schema riêng, không thay bằng SQLite.

## Giới hạn và bước tiếp

- Một người liên hệ thanh toán cả nhóm trong Sprint 2; tách payer từng người ở Sprint 4.
- Điểm danh vẫn boolean booking cũ; per-person attendance/no-show/walk-in/chuyển trạng thái
  IN_PROGRESS/PLAY_FINISHED là Sprint 3. Chưa tuyên bố hoàn thành E2E 15 người.
- AA, partial/overpay/refund ledger, chốt sổ, granular finance read permissions và platform
  ledger tiếp tục Sprint 4–5. Không thay dữ liệu tiền legacy dựa vào ảnh biên nhận.
- SMTP, mobile roster cải thiện, QR/text snapshot và hardening tổng thể tiếp tục theo gap analysis.
- PostgreSQL deployment hiện dùng endpoint do Vercel cấu hình, không thấy tunnel trong URL
  runtime. Giữ nguyên cấu hình đang vận hành; không chuyển DB hay sửa SSH theo giả định.
