# Sprint 6 — kiểm chứng end-to-end và hardening beta

## Tính năng và sửa lỗi

- Tra điện thoại không còn trả tên/giới tính/trình độ hoặc chứa profile trong signed token.
  Token review chỉ mang phone đã nhập, game và version HMAC. Chỉ cookie capability hợp lệ
  của chính booking mới được autofill. Không lấy link quản lý bằng phone. Hồ sơ đã có yêu
  cầu nhập đúng họ tên hoặc nhờ host xác minh; không tự đổi tên cũ khi người lạ nhập số.
- Giữ guest không account, phone normalization, lookup trước xác nhận, signed review chống
  đổi phone/stale profile và rate limits. Tests autofill cũ được chuyển sang kiểm chứng
  autofill sau khi đã có capability; giữ regression đăng ký/aliases/không nhân contact.
- Upload kiểm tra MIME khớp PNG/JPEG/WebP thực tế, magic/decoder, size và pixel limit;
  chặn content-length quá 5MB trước parse. Không nhận SVG/HTML/path traversal. Storage
  local override chỉ test/development để diễn tập media riêng, production vẫn private Blob.
- Lỗi kết nối DB/constraint trả 503/409 an toàn, no-store; không trả driver exception,
  credentials hoặc SQL parameters. Fault injection chứng minh rollback cả sau flush tiền,
  rồi retry request key chỉ một movement. Không thử ngắt DB production.
- Snapshot đồng thời QR + text ngân hàng cho booking chưa phát hành và nghĩa vụ tháng;
  charges đã phát hành dùng snapshot batch như Sprint 4. Không ghép QR cũ với bank text mới.
  Dữ liệu legacy thiếu lịch sử và QR đã khác CLB: ẩn QR/text, yêu cầu host xác minh;
  không bịa lịch sử ngân hàng. Thêm nhãn truy cập cho input QR.
- Giữ copy số tiền/nội dung, status/retry và thông báo thủ công, tiếng Việt/mobile.
  Không tự giả định email/SMS/Facebook notification đã gửi.

## Files và migration

Mới: `app/payment_config.py`, `alembic/versions/0010_payment_config_snapshot.py`,
`scripts/check_backup_restore.py`, `tests/test_hardening.py`, `test_real_session_browser.py`,
`docs/SPORT_HOST_USER_GUIDE.md`, `SPORT_HOST_BETA_OPERATIONS.md` và báo cáo này.

Sửa: `app/main.py`, `storage.py`, `payments.py`; templates `join`, `settings`, `participant`,
`due_payment`; tests `test_guest_lookup`; scripts concurrency/smoke; `.env.example`, README,
CHANGELOG, gap analysis, E2E scenarios và testing docs.

Migration 0010 chỉ thêm `payment_snapshot` vào bookings/monthly_dues, default `{}`;
không sửa cột tiền/paid/token/QR legacy, không cố suy ra account trước đây. Downgrade
destructive bị chặn. Backup source 0009 gồm 22 bảng, restore schema ngẫu nhiên và migrate
0010, mọi cột legacy đối chiếu không đổi. Không thay stack/DB/SSH hoặc schema khác.

## Kiểm chứng thực chạy

- Full suite Edge enabled: **110 passed, 1 skipped in 131.54s**. Sau thêm guard dung lượng
  request, chạy lại hardening: **5 passed in 4.98s**. Compileall và diff whitespace check pass.
- F-01 `test_real_session_browser.py`: mobile 375×812 hoàn chỉnh qua trang host/guest,
  tạo buổi thứ Sáu, QR tĩnh, 8 fixed đã đóng tháng và 10 người khách (một nhóm 3), duyệt
  7 khách/3 chờ, hủy/nhận lại, một no-show, walk-in, về sớm, nhập sân 900k + cầu 150k,
  draft/issue, ngân hàng đủ/tiền mặt đủ/chuyển thiếu/ảnh chưa có tiền, chốt khi còn nợ.
  Đối soát **1.050.000đ phải thu = 500.000đ thực nhận + 550.000đ công nợ**; ảnh chưa duyệt
  không ghi paid, fixed tháng không thu trùng; không tràn ngang/không lỗi JS/không lộ nhóm khác.
- Regression browser trước đó gồm desktop, mobile ngang/dọc, nhóm, điểm danh và billing.
- PostgreSQL: **10 race scenarios pass** (capacity/group approval, attendance/walk-in,
  issue/duplicate receipt/distinct receipts, close/versioned adjustment). Fixture migration
  legacy giữ một participant, fee/paid và link riêng cũ.
- `check_backup_restore`: **21 model tables + private image pass**, restore sang schema và
  thư mục ảnh khác, hash khớp, session invalidation và sequence ID đúng; dọn 2 schema thử.
- `verify_release`: backup 22 bảng schema production 0009, restore và migrate 0010 pass;
  mọi cột legacy không đổi. Production release ghi sau khi deployment/smoke hoàn tất.

## Tài liệu và giới hạn thực tế

Hướng dẫn host/guest theo luồng thật và vận hành staging/tunnel/release/rollback/backup
đã viết riêng. Không có chặn triển khai source trong môi trường hiện tại. Phạm vi còn lại
để pilot và vận hành được ghi rõ, không coi các kiểm tra tự động là chứng nhận tải lớn:

- Runtime PostgreSQL hiện là endpoint Vercel trực tiếp; giữ nguyên đích, chưa chạy tunnel thật.
- SMTP thực tế, Safari/Facebook in-app browser trên thiết bị thật, HA/tải lớn và lịch backup
  provider chưa được xác minh trong phiên này. Cần pilot vài host trước mở rộng.
- Backup/restore ảnh thử có hash và media destination riêng; không chứng nhận đã sao lưu
  toàn bộ object store production. Production smoke chỉ tenant QA, không ghi nhận tiền thật.
- Guest capability dùng chung trong nhóm; không thêm SMS OTP/danh tính mạnh. Chủ số liên hệ
  mất link cần host xác minh/cấp lại. Thu tháng legacy vẫn đủ/chưa đủ; tiền buổi có ledger nhiều lần.
- Đến muộn/về sớm không tự giảm phí, host miễn/giảm có lý do. Không có override vượt sân;
  cần giải phóng chỗ hợp lệ. Không auto-transfer/VietQR/API ngân hàng/marketplace.
