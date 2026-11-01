# Changelog

## 2026-11-01 — Action plan Sprint 6

- E2E mobile đủ luồng 15 người tới chốt sổ còn nợ, không thu trùng tháng/không coi ảnh là tiền.
- Privacy phone lookup, autofill chỉ khi có capability; token review không chứa profile.
- MIME khớp nội dung ảnh, request size guard, DB/constraint errors an toàn và rollback/retry.
- Snapshot QR/text cả booking chưa phát hành và phí tháng; legacy thiếu phiên bản yêu cầu xác minh.
- Migration additive `0010_payment_config_snapshot`, backup/restore PostgreSQL + ảnh synthetic,
  hướng dẫn host/guest, staging/tunnel/rollback và giới hạn pilot. 110 tests pass, 1 opt-in skip.

## 2026-11-01 — Action plan Sprint 5

- Chốt sổ khi còn nợ, thu/hoàn sau chốt, điều chỉnh cộng/trừ có lý do/version và giữ charge gốc.
- Quyền co-host riêng cho buổi/booking/điểm danh/thu chi/settings; chặn đọc contact/finance
  và CSV khi thiếu quyền, admin platform không mặc nhiên đọc audit hoặc sửa tiền CLB.
- Sổ thu chi riêng của SportHost: lọc tháng, lịch sử chỉnh sửa và billing config nội bộ.
- Migration additive `0009_close_permissions_platform`, PostgreSQL close/adjustment races.

## 2026-11-01 — Action plan Sprint 4

- Engine FIXED_PRICE/COST_SHARING, làm tròn chính xác tới 1 VND, policy phí tháng/no-show
  công khai trước đăng ký; miễn/giảm có lý do, chi phí phân loại và khoản CLB tự chịu.
- Bản nháp, phát hành một lần, snapshot cơ sở/QR/ngân hàng, khóa attendance/expense/payer.
- GROUP/SPLIT không thu trùng, ledger nhiều lần bank/cash, thiếu/thừa/hoàn/hoàn tác có audit.
- Nhiều biên nhận, hash chống ảnh trùng; xác nhận phải nhập tiền thực nhận, retry không ghi trùng.
- Sổ thu chi/dashboard/CSV theo khoản đã phát hành và net receipts; duyệt waitlist tại sân
  không cần mở đăng ký public trở lại. Migration additive `0008_manual_billing`.

## 2026-11-01 — Action plan Sprint 3

- Điểm danh từng người, vắng mặt trả chỗ, giờ đến/về sớm, thay người có lý do/audit.
- Walk-in kiểm tra sức chứa atomically; version chặn hai host ghi đè, retry không thêm trùng.
- Ba tab mobile; mở/đang đánh/kết thúc tách khỏi thu tiền và chốt sổ.
- Migration additive `0007_session_attendance`; backfill bằng chứng attendance legacy.
- 90 tests pass, 1 opt-in skipped; kiểm chứng thêm 2 race PostgreSQL và restore/migration.

## 2026-11-01 — Action plan Sprint 2

- Đăng ký nhóm không tài khoản; một liên hệ/thanh toán chính, mỗi người chiếm một slot.
- AUTO_APPROVE / MANUAL_APPROVE theo buổi, waitlist nguyên nhóm và PostgreSQL row lock
  cho mọi đường duyệt/sửa/hủy/đôn nhóm; không duyệt một phần hoặc overbook.
- Snapshot môn, hướng dẫn, điều kiện/chính sách theo buổi; booking giữ hạn/chính sách hủy
  đã chấp nhận, host đổi chính sách sau đăng ký cần lý do và audit trước/sau.
- Link khách mới không lưu plaintext; hash + 180 ngày, rate limit, thu hồi/cấp lại.
  Link cũ giữ tương thích bằng legacy digest sau cutover có kiểm chứng.
- Form người đi cùng trên mobile, trạng thái giữ chỗ rõ, lưu/copy link riêng, sửa/hủy,
  số người/nhóm trong bảng host và CSV; không lộ danh sách khách trên trang kèo public.
- Migration `0006_group_bookings` additive; scripts kiểm chứng backup/restore, migration
  và 3 kịch bản tranh chỗ PostgreSQL trong schema thử riêng; smoke production tenant riêng.
- Chưa thuộc sprint này: per-person attendance, AA, payment ledger, tách payer, chốt sổ.

## 2026-11-01 — Action plan Sprint 0/1

- Audit 69 route declarations, 15 models/tables, migrations và các luồng hiện có;
  baseline 46 tests pass. Thêm gap analysis, inventory, kịch bản E2E và hướng dẫn test.
- Thêm danh mục môn mở rộng, cài đặt CLB và migration additive `0005_club_settings`.
- Owner-only update, CSRF, validation atomic và audit đầy đủ trước/sau; form cũ không
  xóa các settings mới khi không gửi field tương ứng.
- Form tạo buổi lấy giới hạn ban đầu theo CLB; giữ số host tự sửa khi đổi CLB.
- Chuẩn hóa nhãn tiếng Việt, danh sách chờ/điểm danh/thành viên cố định, môn và chi phí
  dụng cụ. Không thay đổi enum/API tokens hoặc dữ liệu tiền cũ.
- Thêm 24 tests settings/migration SQL và 3 browser scenarios; thêm PostgreSQL migration
  integration opt-in với database/schema test riêng. Default tests không dùng DB/Blob/SMTP thật.
- Sprint 1 được kiểm chứng trên PostgreSQL bằng backup/restore vào schema riêng,
  migrate production 0005 sau khi người dùng cho phép; push `7a8ae26`, Vercel deploy
  và smoke tạo/sửa CLB/CSRF/isolation pass. Không đổi đích DB hoặc SSH.
