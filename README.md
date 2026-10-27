# SportHost Beta

Quản lý CLB cầu lông cho host — [mở bản thử nghiệm](https://sporthost.vercel.app).
FastAPI, Jinja2, SQLAlchemy, PostgreSQL/Alembic, Vercel và private Blob.

## Chức năng

- Workspace có sidebar, tổng quan, lịch, thành viên, thu chi, cài đặt từng CLB và hỗ trợ mobile.
- Lịch tuần, RSVP riêng, ưu tiên member, duyệt vãng lai, danh sách chờ và điểm danh.
- Nam/nữ, phí riêng theo giới tính/loại thành viên; giới hạn tổng và chỗ nam/nữ tùy chọn.
- Vãng lai nhập điện thoại trước, tự điền hồ sơ trong CLB, kiểm tra rồi xác nhận.
- Upload QR, biên nhận riêng tư và đối soát thủ công; phí tháng, chi phí, CSV.
- Đồng quản lý, quyền điều hành/thu chi, audit, tài khoản và quản trị Pro trial miễn phí.

[Chi tiết tính năng](FULL_ROADMAP.md) · [Triển khai](DEPLOY_VERCEL.md) · [Vận hành](OPERATIONS.md)

**Email thật cần cấu hình SMTP.** Hiện đổi mật khẩu trong phiên đăng nhập hoạt động;
quên mật khẩu/xác minh email chỉ gửi được khi dịch vụ email được cấu hình.
Upload biên nhận không tự xác nhận đã thu. Chưa thu phí phần mềm trong beta.

## Chạy local

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Mở http://127.0.0.1:8000/signup. SQLite và ảnh local chỉ dùng development/test.
Staging/production yêu cầu PostgreSQL, HTTPS cookie, khóa bí mật và private Blob.
Migration chạy riêng, không chạy khi app khởi động hoặc Vercel build.

## Kiểm thử

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Bộ mặc định dùng SQLite tạm. PostgreSQL, migration giữ dữ liệu, private Blob,
backup/restore và trình duyệt được kiểm chứng riêng trong schema/tài khoản test.
Không chạy kiểm thử ghi dữ liệu trên CLB đang dùng. Chưa kiểm thử tải lớn.

## Nguồn gốc

Dựa trên `clubhost-sprint01-postgresql.zip`; giữ schema/cookie `clubhost` để tương thích.
`SPRINT_0_1.md`, `BUILD_PLAN.md`, `CODEX_PROMPT.md` là tài liệu bàn giao cũ;
trạng thái hiện tại ở README, FULL_ROADMAP và OPERATIONS. UI áp dụng UI UX Pro Max;
quyết định thiết kế lưu tại `design-system/sporthost/MASTER.md`.
