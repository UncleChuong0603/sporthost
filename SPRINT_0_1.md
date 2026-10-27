# ClubHost — Sprint 0 + Sprint 1 (PostgreSQL / SSH)

**Bản giao:** Sprint 0+1, 27/10/2026. **Trạng thái:** source và bộ test offline đã hoàn thành. **Chưa kết nối/migrate database thật** vì chưa có endpoint, schema được cấp, quyền hoặc SSH key. Không có thao tác nào được chạy lên máy chủ của bạn.

## 0. Ranh giới an toàn

- Các bảng của ClubHost nằm **chỉ** trong PostgreSQL schema `clubhost` (hoặc `DB_SCHEMA` khác riêng do DBA chấp thuận). Dự án không thao tác với `public`.
- `app/main.py` không chạy `metadata.create_all()` trên PostgreSQL; **chỉ Alembic** tạo bảng.
- `alembic/env.py` yêu cầu schema tồn tại; **không tự tạo schema** trên DB dùng chung. Nếu schema chưa có, dừng và yêu cầu người quản trị tạo schema sau backup.
- `alembic upgrade head` chỉ chạy **một lần theo thay đổi version** trên target/schema đã duyệt, bằng role `clubhost_migrator`. Không chạy migration trên DB production trước khi thử ở staging và chụp snapshot/backup có thể khôi phục.
- `downgrade()` chủ động chặn DROP TABLE tự động. Các thủ tục khôi phục dữ liệu cần có kế hoạch thủ công.
- SQLite chỉ dành cho test/demo local. **Production/staging bắt buộc PostgreSQL**.
- Nên tạo **database hoặc schema riêng trên DB sẵn có**, *không* sử dụng role có SUPERUSER hoặc quyền với các ứng dụng khác.

## 1. Chuẩn bị thông tin (giữ bí mật riêng)

Từ server/DB admin, lấy (không gửi password hay key vào chat):
1. SSH host/IP hoặc hostname, SSH username, SSH port (thường 22), và fingerprint host key đã xác minh qua kênh tin cậy.
2. Hostname/IP **nội bộ nhìn từ SSH server** của PostgreSQL, ví dụ `127.0.0.1` nếu DB trên chính SSH server, DB port mặc định 5432.
3. Tên database đã tồn tại; schema `clubhost` đã được tạo riêng và chưa có bảng ứng dụng khác.
4. Tài khoản migration `clubhost_migrator` có quyền CREATE trong schema; tài khoản runtime `clubhost_app` chỉ có quyền USAGE schema và CRUD bảng ClubHost; cho phép sử dụng sequence.
5. Có backup và quyền restore thật của database hiện tại trước khi migrate.

`provision_schema.example.sql` chỉ là template cho DBA duyệt, **không phải script tự chạy**.

## 2. SSH tunnel từ máy Windows / PowerShell

Dùng cửa sổ PowerShell số 1 (đảm bảo `ssh` và host key đã được xác minh):

```powershell
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 `
  -L 127.0.0.1:55432:PRIVATE_DB_HOST:5432 SSH_USER@SSH_HOST
```

- Thay `PRIVATE_DB_HOST` bằng địa chỉ PostgreSQL nhìn từ máy SSH server, **không** phải địa chỉ local laptop.
- Nếu SSH chạy port khác 22: thêm `-p SSH_PORT`. Đường hầm dùng port **localhost 55432**, không public DB port ra Internet.
- Nếu dùng private key ở path đã được cấp: thêm `-i C:\path\to\your\key` (KHÔNG copy private key vào repo).
- Terminal này phải tiếp tục chạy khi app kết nối. Production cần tunnel/supervisor bền vững nếu app không nằm cùng private network. Nếu app và DB ở cùng máy hay cùng mạng riêng được bảo vệ, cân nhắc kết nối trực tiếp bằng mạng nội bộ + TLS thay vì tunnel không cần thiết.
- Nếu laptop port 55432 đã bị dùng, thay nó bằng một port local chưa bị chiếm và sửa `DATABASE_URL` tương ứng.

Cửa sổ PowerShell số 2:

```powershell
cd path\to\clubhost-sprint01
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

$env:APP_ENV = "development"
$env:DB_SCHEMA = "clubhost"
# Lấy URL đầy đủ từ secret store/password manager. Password đặc biệt phải URL-encode.
$env:DATABASE_URL = "postgresql+psycopg://clubhost_app:YOUR_PASSWORD@127.0.0.1:55432/YOUR_EXISTING_DB"
$env:SECRET_KEY = "GENERATE_A_SECURE_RANDOM_STRING_AT_LEAST_32_CHARS"
$env:COOKIE_SECURE = "false"  # CHỈ local HTTP

python -m scripts.check_db     # READ-ONLY; không tạo/sửa bảng
```

Nếu kết nối thành công, lệnh in version, database, role và schema có tồn tại hay không. Kiểm tra tên DB, schema, role đúng với kỳ vọng **trước khi migration**.

## 3. Migration an toàn (chỉ sau phê duyệt + backup)

Trước hết **không chạy lệnh nâng cấp này trên production**. Chuẩn bị một môi trường staging/disposable PostgreSQL riêng; kiểm tra migration và rollback qua backup. Dùng `DATABASE_URL` của **tài khoản migrator** tạm thời, và chắc chắn trỏ đúng database/schema được phép:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://clubhost_migrator:YOUR_PASSWORD@127.0.0.1:55432/YOUR_STAGING_DB"
python -m scripts.check_db
alembic -c alembic.ini current
alembic -c alembic.ini upgrade head
alembic -c alembic.ini current
```

Không chuyển sang production nếu `alembic current` bất thường, schema đã có dữ liệu không thuộc ClubHost, backup chưa kiểm chứng, hoặc quyền tài khoản chưa tách riêng.

Đổi lại `$env:DATABASE_URL` về user `clubhost_app` đã được cấp quyền và chạy `python -m scripts.check_db`. Khi đã migrate và truy cập được bảng ClubHost, chạy app:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Truy cập `http://127.0.0.1:8000/signup`, `/health` (liveness), `/ready` (DB readiness).

**Lưu ý production:** `APP_ENV=production`, `COOKIE_SECURE=true`, HTTPS reverse proxy, secret 32+ ký tự random; không dùng `--reload`. Bản này chưa đủ tiêu chuẩn public launch (rate limit, audit log, backup restore, chống spam... còn ở Sprint 4).

## 4. Tính năng Sprint 1 trong source

- Đăng ký/đăng nhập host, session cookie HttpOnly + CSRF (giữ từ Alpha).
- Tạo CLB, xem dashboard và **sửa tên/khu vực CLB**.
- Thêm member cố định / vãng lai, **sửa tên, số điện thoại, loại member, trình độ**.
- Tenant isolation ở HTTP route: host B không xem hoặc sửa CLB/member thuộc host A.
- `/health` liveness + `/ready` kiểm tra `SELECT 1` (không chứa password).
- Đã giữ nguyên workflow buổi đánh/guest/thu tiền thủ công của Alpha.
- **Chưa hỗ trợ co-host**, mail verification, reset password, QR upload, lịch tự động hay booking lock trên PostgreSQL; các mục đó vẫn thuộc sprint kế tiếp.

## 5. Test

```powershell
$env:APP_ENV = "test"
python -m pytest -q
```

Test suite dùng file SQLite tạm (không dùng DB thật), kiểm tra luồng host/member, tenant isolation, CSRF, health và validate configuration; có test sinh SQL DDL kiểu PostgreSQL để xác minh DDL trong schema `clubhost`.

**Giới hạn xác minh:** Chưa có PostgreSQL server/SSH credentials trong môi trường chạy test, nên chưa chạy kiểm thử kết nối qua SSH hoặc `alembic upgrade head` trên một PostgreSQL thật. Việc test SQLite không thay thế integration test PostgreSQL.

## 6. Lưu ý kiến trúc

- SSH là **TCP tunneling**, không phải SQL protocol. `DATABASE_URL` luôn trỏ vào cổng local được SSH forward hoặc đến private DB host từ app host.
- `DB_SCHEMA=clubhost` khiến SQLAlchemy fully qualify bảng; không thay đổi global `search_path` của server hoặc database.
- Không chạy `create_all`, `drop_all`, `alembic downgrade` hay `alembic stamp head` lên database dùng chung.
- Dùng separate migration credentials và runtime credentials để giảm blast radius khi app bị tấn công.
- Về sau thay QR thanh toán bằng **ảnh upload do host cung cấp**, không tạo QR từ VietQR/API ngân hàng; tính năng này chưa triển khai trong Sprint 0/1.
