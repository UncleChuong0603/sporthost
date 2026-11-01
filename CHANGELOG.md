# Changelog

## 2026-11-01 — Action plan Sprint 0/1, chưa deploy

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
- Approval/fee defaults hiện chỉ là cấu hình; engine auto approval, booking nhóm,
  COST_SHARING, ledger và chốt sổ tiếp tục ở Sprint 2–5. PostgreSQL online migration
  chưa kiểm chứng trong môi trường này; không migrate production.
