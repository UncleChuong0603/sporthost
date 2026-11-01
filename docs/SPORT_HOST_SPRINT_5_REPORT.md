# Sprint 5 — chốt sổ, công nợ, quyền và sổ nền tảng

## Đã thực hiện

- Chốt sổ từ PLAY_FINISHED sau phát hành, kể cả chưa thu đủ. Lưu thời điểm, tổng đối soát
  và phiên bản vào audit, SETTLED khóa danh sách/chi phí; vẫn nhận tiền, hoàn hoặc đối soát
  biên nhận sau chốt. Retry không chốt/log trùng.
- Điều chỉnh khoản phải thu bằng dòng cộng/trừ riêng, lý do bắt buộc, actor, timestamp,
  request key và version. Không thay amount của charge gốc, không viết lại snapshot hoặc
  dòng tiền cũ. Không giảm nghĩa vụ xuống âm; stale version bị chặn. Guest thấy lý do/version.
- Quyền riêng manage_session, manage_bookings, check_in, manage_finance, edit_club_settings;
  owner cấp/thu hồi trên UI và backend thực thi. Manager/finance cũ giữ mapping tương thích
  khi chưa có permissions override. Không tự nâng quyền khi migrate.
- Người chỉ điểm danh xem roster và attendance, không xem số điện thoại/link quản lý khách/
  số đã thu/chi phí. CSV có tiền và contact yêu cầu finance. Trang thành viên yêu cầu quyền
  contact; trang cài đặt chỉ owner thấy audit toàn CLB và co-host emails. Dashboard không
  cộng tiền của CLB host không có quyền thu chi. Giá công khai vẫn có thể thấy như trang kèo.
- Sổ nền tảng admin riêng, ngày/thu/chi/danh mục/tiền/ghi chú, lọc tháng, tổng hợp và sửa
  có lý do/version/audit đầy đủ. Admin không mặc nhiên có quyền CLB; trang admin chỉ đọc
  audit platform, không đọc nội dung tài chính CLB. Không dùng QR CLB hay cộng tiền CLB.
- Config billing nội bộ mặc định trial 30 ngày / 99.000đ CLB/tháng, hiển thị trên sổ admin;
  chưa tự thu phí hay thêm gateway. Lịch lặp/RSVP sẵn có giữ nguyên.
- Guest theo dõi lịch sử buổi/nhóm, số phải đóng/thực nhận/còn nợ qua capability riêng.

## File và migration

Mới: `app/permissions.py`, `platform_ledger.py`, template `platform_ledger.html`,
`alembic/versions/0009_close_permissions_platform.py`, `tests/test_closing_permissions.py`.

Sửa: `main`, `models_extra`, `attendance`, `booking_routes`, `payments`, `accounts`,
`workspace`, `finance_models`, `finance_service`, `finance_routes`; templates `game`,
`attendance`, `billing`, `participant_billing`, `club`, `members`, `settings`, `admin`;
test browser billing, scripts concurrency/smoke, README/CHANGELOG/test docs.

0009 additive: permissions nullable trên club_access; charge_adjustments có unique version/
request và FK; platform_ledger_entries độc lập với club_id, có version và request key.
Không sửa tiền lịch sử, không xóa bảng/cột. Destructive downgrade bị chặn để giữ lịch sử;
rollback dùng bản tương thích schema/ledger, backup phải được kiểm chứng trước migration.

## Kiểm chứng

- PostgreSQL schema thử: 10 kịch bản cạnh tranh pass, gồm close retry đồng thời và hai
  điều chỉnh cùng version chỉ một thành công, một 409. Các race capacity/attendance/receipt
  của sprint trước tiếp tục pass.
- Snapshot 20 bảng production 0008, restore schema riêng, migrate 0009, đối chiếu toàn bộ
  cột dữ liệu legacy không đổi. Schema thử được dọn đúng phạm vi.
- Tests chốt còn nợ, thu sau chốt, adjustment/retry/stale/negative, quyền granular/revoke,
  platform ledger/history và không ảnh hưởng tiền CLB. Browser mobile gồm chốt khi còn nợ.
- Full regression browser: **104 passed, 1 skipped in 119.51s**; kiểm tra lại riêng quyền /
  platform / luồng mobile chốt còn nợ: **5 passed in 15.11s**. Compileall/diff check pass.
- Migration production 0009 đã áp dụng sau backup/hash/restore verification; deployment
  và smoke sẽ ghi sau khi chạy hoàn tất.

## Bước tiếp

Sprint 6: kịch bản hoàn chỉnh 15 người, hardening upload/privacy/DB failure/retry, backup ảnh,
hướng dẫn host/guest/tunnel/staging và báo cáo beta. Chưa coi checklist là bằng chứng đã chạy.
