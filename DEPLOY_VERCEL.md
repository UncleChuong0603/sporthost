# Đưa SportHost Beta lên Vercel

Mục tiêu: URL `*.vercel.app` để host thử sản phẩm và lấy feedback, chưa cần domain chính thức.

## 1. Database

Dùng **PostgreSQL riêng cho beta**, ví dụ Neon/Supabase qua Vercel Marketplace, hoặc
PostgreSQL có endpoint TLS mà Vercel truy cập được. SQLite không lưu dữ liệu lâu dài trên Vercel.

`ssh sporthost` dùng để quản trị/forward từ máy phát triển. Vercel không duy trì SSH tunnel
trên laptop; không cần mở database hiện tại trên VPS ra Internet để chạy beta.

Với Neon: tạo database beta gần Singapore, lấy **pooled URL** cho app và **direct URL**
cho migration. Không đưa URL có password vào chat hoặc Git.

## 2. Migration từ máy của bạn

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.vercel.example .env
```

Sửa `.env` bằng editor: `DATABASE_URL` là pooled URL, `DATABASE_MIGRATION_URL` là direct URL
có quyền tạo schema/bảng (chỉ lưu ở máy quản trị). Có thể bỏ biến migration nếu cùng role/URL
được phép dùng cho database beta riêng. Tạo `SECRET_KEY` bằng lệnh dưới, lưu kết quả vào `.env`:

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
.\.venv\Scripts\python.exe -m scripts.check_db
.\.venv\Scripts\python.exe -m scripts.migrate --init-schema
.\.venv\Scripts\python.exe -m scripts.check_db
```

`--init-schema` chỉ tạo `DB_SCHEMA` nếu chưa có; Alembic tạo các bảng và bảng version bên trong.
Schema có bảng lạ hoặc thiếu lịch sử migration bị từ chối. Lần sau chạy `python -m scripts.migrate`.
Không chạy migration trong build/startup Vercel. Database dùng chung cần backup và cấp
schema/role riêng trước. Nếu tách role runtime, cấp quyền theo
[scripts/provision_schema.example.sql](scripts/provision_schema.example.sql).

## 3. Import repository vào Vercel

1. Đẩy source lên repository Git của bạn.
2. Vercel → Add New → Project → Import repository SportHost.
3. Framework **FastAPI**, Root Directory chứa `index.py` và `vercel.json`.
4. Giữ Build Command/Output Directory mặc định, không thêm lệnh Alembic vào build.
5. Thêm biến môi trường cho deployment bạn dùng:

| Biến | Giá trị |
| --- | --- |
| `APP_ENV` | `staging` |
| `DATABASE_URL` | Pooled PostgreSQL URL với TLS theo provider, thường `sslmode=require` |
| `DB_SCHEMA` | `clubhost` |
| `SECRET_KEY` | Bí mật 32+ ký tự, giữ ổn định giữa các deploy |
| `COOKIE_SECURE` | `true` |
| `PUBLIC_BASE_URL` | `https://sporthost.vercel.app` hoặc domain thực tế |
| `ADMIN_EMAILS` | `lovetobangbang@gmail.com` |
| `BLOB_READ_WRITE_TOKEN` | Token do private Vercel Blob store cấp |

Không thêm `DATABASE_MIGRATION_URL` hay SSH key vào Vercel. URL `postgres://` và
`postgresql://` được tự chọn driver psycopg 3. Vercel tự cung cấp biến `VERCEL`.

6. Deploy. Thay environment variables sau deploy thì redeploy để áp dụng.
7. Nếu Deployment Protection chặn host, điều chỉnh quyền truy cập của đúng project thử nghiệm.

Có thể dùng URL production `*.vercel.app` ổn định cho beta mà chưa gắn domain chính thức.
Nếu đã đăng nhập CLI, sau khi thêm environment variables qua dashboard:

```powershell
npx vercel login
npx vercel link
npx vercel --prod
```

Source dùng Python 3.12, function Singapore (`sin1`), timeout 30 giây. CSS trong `public/static`
được CDN phục vụ; local dùng FastAPI StaticFiles cùng đường dẫn. `index.py` xuất đối tượng ASGI.

## 4. Kiểm tra trước khi gửi host

- `/health`: app khởi động được; `/ready`: truy vấn được bảng host, lỗi DB/migration trả 503.
- `/signup`: tạo tài khoản, tạo CLB/member, sửa thông tin, đăng xuất/đăng nhập lại.
- Tài khoản host thứ hai không xem/sửa được CLB của host thứ nhất.
- Tạo buổi đánh, mở link khách, đăng ký/duyệt khách và kiểm tra thu chi.
- Sau redeploy, xác nhận dữ liệu CLB/member vẫn còn trong PostgreSQL.

Preview từ code không tin cậy không được dùng cùng DB/schema. Preview cần database/branch
riêng và migration riêng. Reset mật khẩu/xác minh email cần cấu hình SMTP; xem [OPERATIONS.md](OPERATIONS.md).
Thu feedback theo từng luồng và các bước tái hiện lỗi.

## 5. Khi dùng URL chính thức

Gắn domain/HTTPS trong Vercel và cập nhật link chia sẻ; giữ hoặc chuyển database theo kế hoạch
backup/restore. Đổi domain cần đăng nhập lại vì cookie không chuyển giữa các domain.
Lịch lặp, RSVP, QR/biên nhận và bảo mật tài khoản đã có; xem [FULL_ROADMAP.md](FULL_ROADMAP.md).

Tài liệu chính thức: [FastAPI trên Vercel](https://vercel.com/docs/frameworks/backend/fastapi),
[PostgreSQL qua Marketplace](https://vercel.com/docs/postgres).
