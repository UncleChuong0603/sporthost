# SportHost Beta

Ứng dụng quản lý CLB cầu lông dành cho host, dựa trên ClubHost Sprint 0–1.
FastAPI, Jinja2, SQLAlchemy, PostgreSQL và Alembic; beta đã chạy trên Vercel.

**Bản thử nghiệm:** https://sporthost.vercel.app/signup

Triển khai ngày 27/10/2026: Vercel Singapore, Neon PostgreSQL riêng cho beta (gói Free,
Singapore), schema `clubhost`, Alembic `0003_gender_fees`. Database VPS hiện tại không bị thay đổi.

## Chức năng hiện có

- Đăng ký/đăng nhập host; tạo và sửa CLB, member cố định/vãng lai.
- Member có giới tính Nam/Nữ độc lập với loại cố định/vãng lai; dữ liệu cũ là Chưa cập nhật.
- Từng buổi có phí chung và phí nam/nữ tùy chọn cho cả member và khách vãng lai.
  Để trống dùng phí chung, nhập 0 để miễn phí. Sức chứa vẫn tính chung cho mọi người chơi.
- Booking giữ mức phí lúc đăng ký, nên sửa giới tính/loại member không đổi tiền buổi cũ.
  Phí tháng vẫn do host nhập theo từng member.
- Tạo buổi đánh thủ công, link đăng ký khách, duyệt khách và danh sách chờ.
- Điểm danh, thu tiền thủ công, phí tháng, chi phí và xuất CSV.
- Phân tách dữ liệu theo host, CSRF và cookie HttpOnly.
- Schema PostgreSQL `clubhost`; migration riêng, không tự tạo bảng khi khởi động app.

**Hướng dẫn đưa host test: [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md).**

## Chạy local

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Mở http://127.0.0.1:8000/signup. `.env` được đọc tự động; SQLite chỉ dùng cho local/test.

## Kiểm thử

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Bộ test mặc định dùng SQLite tạm, không truy cập database thật. Test cấu hình Vercel và
SQL PostgreSQL offline không thay thế kiểm thử migration trên PostgreSQL thật.

Đã kiểm thử bổ sung trên PostgreSQL thật và URL Vercel: đăng ký host, tạo CLB/member,
tenant isolation, public guest booking, hai lượt duyệt đồng thời với capacity=1,
thu tiền/chi phí, CSV và readiness. Migration bổ sung giới tính và giá đã được thử trên
schema PostgreSQL riêng, xác minh dữ liệu cũ và giá booking đã thu được giữ nguyên.
Các bản ghi thử được xóa sau kiểm tra.

## Phạm vi beta

Chưa có lịch lặp, RSVP tự động, upload QR/biên nhận, email verification, reset mật khẩu
hoặc rate limit. Luồng xác nhận booking đã khóa hàng buổi đánh trên PostgreSQL để tuần tự
hóa kiểm tra sức chứa; đã xác minh hai lượt duyệt đồng thời chỉ xác nhận một booking
khi capacity=1. Đây chưa phải kiểm thử tải lớn.
SportHost Beta có `noindex` để tránh lập chỉ mục, đây không phải cơ chế hạn chế truy cập.

## Nguồn gốc

Source nhập từ `clubhost-sprint01-postgresql.zip`; bản alpha giữ nguyên bên ngoài repo.
Giữ schema và tên cookie `clubhost` để tương thích. `SPRINT_0_1.md`, `BUILD_PLAN.md` và
`CODEX_PROMPT.md` là tài liệu bàn giao/roadmap cũ, không phải trạng thái triển khai mới
hoặc yêu cầu cần thực thi trong đợt này. Trạng thái mới ghi ở README và DEPLOY_VERCEL.md.
