# Sprint 3 — điều hành buổi đánh tại sân

## Tính năng

- Ba tab Đăng ký, Điểm danh, Thanh toán; danh sách điểm danh dạng thẻ trên điện thoại.
- Điểm danh từng người trong nhóm, có mặt/vắng, thời điểm đến và về sớm theo giờ Việt Nam.
- Vắng mặt trả chỗ; người đã về vẫn được tính đã tham gia, không tự giảm tiền. Nhận lại
  người vắng hoặc thay người phải kiểm tra lại giới hạn tổng/nam/nữ.
- Thêm walk-in và check-in ngay, cùng khóa hàng session với duyệt nhóm. Retry không thêm
  người trùng. Theo cấu trúc liên hệ hiện có, walk-in cần số điện thoại; không yêu cầu account.
- Thay người và sửa điểm danh có audit trước/sau, người thực hiện, lý do khi hoàn tác.
  Optimistic version chặn ghi đè thao tác host khác; retry cùng trạng thái không ghi log trùng.
- OPEN → IN_PROGRESS → PLAY_FINISHED, mở lại cần lý do. Kết thúc không đánh dấu đã thu.
- Khóa sửa attendance khi attendance_locked/SETTLED; Sprint 4 sẽ khóa khi phát hành charges.
  Guest không được tự sửa nhóm sau khi bất kỳ người nào đã có điểm danh.
- Owner/manager được thao tác, finance không được sửa attendance; truy vấn theo đúng CLB.

Không thêm override vượt sân: host phải xử lý người vắng/chỗ trống trước khi thêm người.
Không suy diễn một booking chưa được điểm danh là no-show. Tới muộn ghi nhận qua timestamp
đến thực tế; không tự giảm phí theo số phút. Phần tiền vẫn giữ nguyên cho tới engine Sprint 4.

## Files và migration

Mới: `app/attendance.py`, `app/templates/attendance.html`,
`alembic/versions/0007_session_attendance.py`, `tests/test_attendance.py`,
`tests/test_attendance_browser.py` và báo cáo này.

Sửa: `app/main.py`, `booking_service.py`, `workspace.py`; templates `game.html`,
`participant.html`; `style.css`, `workspace.js`; scripts `check_group_concurrency.py`,
`smoke_group_release.py`; README, CHANGELOG và hướng dẫn test.

Migration 0007 chỉ thêm 2 cột session và 5 cột participant trong schema SportHost, constraints,
FK actor. Booking legacy attended=true được map CHECKED_IN, false vẫn NOT_MARKED; không
bịa thời điểm đến. Session hủy map CANCELLED; không tự đoán buổi cũ đã kết thúc/chốt sổ.
Không sửa fee/paid/proofs/dues; destructive downgrade bị chặn để giữ bằng chứng điểm danh.

## Kiểm chứng

- Full suite với `SPORTHOST_BROWSER_TESTS=1`: **90 passed, 1 skipped in 117.65s**.
- Edge 375×812: nhóm 3 người, 2 đến/1 vắng, walk-in, về sớm, kết thúc, không tràn ngang
  và không lỗi JS; ảnh kiểm tra private trong `.vercel/test-artifacts/attendance-mobile.png`.
- PostgreSQL schema thử: 3 race capacity cũ và 2 race mới (hai host cập nhật trái nhau;
  hai walk-in tranh một chỗ vừa trống) đều pass, không overbook/ghi đè.
- `verify_release`: snapshot 17 bảng production 0006, restore vào schema ngẫu nhiên,
  upgrade 0007, đối chiếu mọi cột legacy không đổi, cleanup schema thử thành công.
- Compileall và `git diff --check` pass. Test PostgreSQL theo tên DB riêng vẫn opt-in/skip;
  kiểm chứng PostgreSQL thực tế trên đã chạy riêng, không thay bằng SQLite.

Release production hoàn tất: commit `4db623f` đã push main, migration 0007 đã áp dụng sau
backup/restore, deployment `dpl_9eV9Y79FN19pMeTFE2jQ467tEmoM` READY trên
https://sporthost.vercel.app. `smoke_group_release --run --attendance` pass cả regression
MANUAL/AUTO Sprint 2 và nhóm 3 người/2 đến/1 vắng, walk-in, checkout, stale version,
guest edit freeze, kết thúc mà không tự ghi đã thu. Chỉ tài khoản/CLB QA của lượt chạy được dọn.

## Tiếp theo

Sprint 4: phí cố định/chia đều, chi phí có phân loại, bản nháp và phát hành charges,
snapshot/khóa attendance, tách payer, ledger thu nhiều lần/thiếu/thừa/hoàn và QR tĩnh.
Chưa tuyên bố hoàn thành tình huống 15 người tới chốt sổ; phần tài chính/chốt sổ còn Sprint 4–5.
