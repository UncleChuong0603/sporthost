# Vận hành beta, staging và phục hồi

## Hiện trạng đã kiểm tra

SportHost dùng FastAPI/Jinja/SQLAlchemy/Alembic, PostgreSQL schema riêng `clubhost` và
private object storage. Runtime hiện lấy endpoint PostgreSQL trực tiếp từ Vercel. Đặc tả
nói SSH tunnel nhưng URL runtime không có loopback; phiên này giữ nguyên đích đang chạy,
không đổi DB/SSH/key, không tuyên bố đã kiểm chứng tunnel. Không đưa credentials vào Git/chat.

Người dùng đã cho phép push/deploy và test production trong phiên 01/11/2026. Mọi migration
được backup/restore vào schema thử trước, chỉ scope SportHost. Test production dùng tenant
QA riêng và chỉ xóa dữ liệu chính lượt QA đó; không ghi nhận tiền thật hoặc gửi mail.

## Staging qua tunnel do operator cấu hình

Dùng database/schema **test riêng** trên PostgreSQL hiện có. Nếu hạ tầng yêu cầu tunnel,
operator mở SSH với cấu hình đã có, ví dụ (thay host/port/target theo thông số vận hành):

```powershell
ssh -N -L 127.0.0.1:55432:DB_PRIVATE_HOST:5432 EXISTING_SSH_ALIAS
```

Không tự sửa SSH config/keys. Cấu hình ngoài Git: APP_ENV=staging, DATABASE_URL trỏ loopback
55432 qua tunnel, DB_SCHEMA schema test riêng, SECRET_KEY ổn định, COOKIE_SECURE=true,
PRIVATE Blob **test** riêng. SMTP nếu bật phải dùng mailbox sandbox, không gửi khách thật.

```powershell
python -m scripts.check_db
python -m scripts.migrate --init-schema  # chỉ schema test mới được cấp, không adopt bảng lạ
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Suite pytest mặc định ép SQLite/upload tạm, không được chỉ sang schema production. Browser
opt-in dùng Edge local. Kiểm chứng concurrency/backup dùng URL kết nối operator nhưng tạo
schema ngẫu nhiên tách dữ liệu thật, rồi dọn đúng schema đã tạo:

```powershell
$env:SPORTHOST_BROWSER_TESTS='1'
python -m pytest -q
python -m scripts.check_group_concurrency --env-file PRIVATE_ENV_FILE
python -m scripts.check_backup_restore --env-file PRIVATE_ENV_FILE
```

## Release và rollback

`verify_release` hiện đọc `.vercel/action-plan-production.env` riêng, phản chiếu **chỉ** schema
clubhost, backup snapshot nhất quán, restore vào `sporthost_release_check_<random>`, migrate,
đối chiếu cột cũ và lưu hash backup/migration/target. Không tự gọi script trên nếu chưa có
quyền release. Trước apply kiểm tra full suite, race PostgreSQL và report restore pass.

```powershell
python -m scripts.verify_release
python -m scripts.apply_verified_release --env-file PRIVATE_ENV_FILE --apply
npx vercel --prod --yes
# Chờ READY và alias đúng, rồi:
python -m scripts.smoke_group_release --env-file PRIVATE_ENV_FILE --run --closing
```

Migrations 0005–0010 additive; không xóa bảng/cột để downgrade, không drop/truncate schema
sản phẩm hoặc ứng dụng khác. 0006 đã scrub token plaintext nên không rollback code trước
cutover token. Sau 0008 cần code hiểu ledger để tránh thu trùng; sau 0009 cần hiểu quyền và
adjustments. Ưu tiên rollback code tương thích các cột mới hoặc sửa tiến. Không restore đè
live khi còn giao dịch phát sinh; đối chiếu delta và duyệt kế hoạch phục hồi trước.

Backup private đủ DB và ảnh (không gửi file qua chat):

```powershell
python -m scripts.backup export --file PRIVATE_BACKUP.zip
python -m scripts.backup restore --file PRIVATE_BACKUP.zip --schema sporthost_restore_check_UNIQUE
```

Restore chỉ schema trống khác source; script xác minh hash ảnh, tránh ghi đè object khác,
đẩy sequence ID, thu hồi phiên host/email token cũ. Dùng storage đích **riêng** nếu diễn tập;
`check_backup_restore` làm điều này với ảnh synthetic và 2 schema ngẫu nhiên. Backup kiểm tra
release dạng JSON không thay thế archive ảnh. Giữ mã hóa/retention theo hệ thống operator.

## Giới hạn beta và theo dõi

- Không tự gửi Facebook/SMS, host copy link/thông tin và thông báo thủ công. SMTP chưa có
  cấu hình thật thì reset/xác minh email chưa gửi được; đổi mật khẩu trong phiên vẫn dùng được.
- Liên kết nhóm là capability cho toàn nhóm, không phải xác minh danh tính pháp lý/SMS OTP.
  Người đã biết chính xác tên/số có thể gửi lượt đăng ký; MANUAL_APPROVE và xác minh host
  vẫn cần thiết. Khách không lấy link của lượt đã có chỉ bằng điện thoại.
- QR legacy không có metadata cùng phiên bản và đã đổi khác QR CLB sẽ bị ẩn, yêu cầu host
  xác minh. Không tự đoán lịch sử tài khoản. Khoản phát hành mới có snapshot đầy đủ.
- Phí tháng legacy vẫn xác nhận đủ/chưa đủ, không có partial ledger riêng. Tiền buổi đã
  phát hành có ledger nhiều lần; khoản legacy được nhập số dư đầu kỳ đúng một lần.
- Chưa kiểm thử tải lớn, failover/HA, sao lưu lịch định kỳ của provider hay mất mạng thật
  trên thiết bị tại sân. Test lỗi DB có fault injection và rollback/retry, không ngắt DB thật.
- Browser kiểm chứng Edge desktop/mobile viewport; chưa chứng nhận mọi Safari/Facebook
  in-app browser/thiết bị thật. Cần pilot vài host với dữ liệu thật trước mở rộng.
- Giám sát lỗi 5xx/timeout, chênh lệch ledger, upload private storage và backup định kỳ.
  Không log capability/phone/proof/URL database. `/health` là liveness, `/ready` kiểm tra DB.

Billing nội bộ mặc định PLATFORM_TRIAL_DAYS=30, PLATFORM_CLUB_MONTHLY_VND=99000 chỉ hiển thị
ở sổ admin; beta không tự thu phí phần mềm hoặc khóa tính năng.
