# ClubHost — hướng dẫn tiếp tục coding sau Sprint 0/1

Đọc `README.md`, `SPRINT_0_1.md`, `BUILD_PLAN.md`, `app/settings.py`, `alembic/env.py`, `alembic/versions/0001_initial.py`, tests trước khi sửa.

## Trạng thái
- Sprint 0/1 source đã có PostgreSQL config, dedicated schema + Alembic, SSH operator guide, read-only preflight, host/club/member CRUD cơ bản.
- SQLite chỉ dùng test/demo.
- **Chưa kết nối thực tế tới PostgreSQL đang hoạt động**, không được chạy migration lên DB đó khi chưa có thông tin/backup và quyền rõ ràng.

## Tiếp theo
1. Với disposable PostgreSQL staging được cấp quyền, cài psycopg, dựng SSH tunnel, chạy `python -m scripts.check_db` read-only, đánh giá schema collision và tạo schema ClubHost có kiểm soát, sau đó thử Alembic migration.
2. Viết integration tests PostgreSQL riêng không bao giờ mặc định nhắm production; test hạn quyền app account, CRUD, tenant isolation, schema scoping, migration history.
3. Sprint 2: lịch định kỳ + RSVPs, capacity atomic; Sprint 3: upload ảnh QR tĩnh do host cung cấp (không VietQR), proof và host xác nhận thủ công.

Quy tắc: giữ tất cả existing data của các app khác, không sửa schema `public` hoặc prefix ứng dụng khác, không thêm marketplace hay crawl Facebook.
