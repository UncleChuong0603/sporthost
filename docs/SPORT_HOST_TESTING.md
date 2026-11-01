# Test và migration của action plan

## Phiên tiếp tục được phép release production

Người dùng cho phép push/deploy/test production ngày 01/11/2026. Giữ nguyên PostgreSQL
Vercel đã cấu hình; không chuyển DB hoặc sửa SSH. Default pytest vẫn dùng SQLite tạm.
Các bước dưới chỉ chạy từ máy operator trong phạm vi release đã được cho phép:

```powershell
python -m scripts.verify_release
python -m scripts.check_group_concurrency --env-file PRIVATE_ENV_FILE
python -m scripts.check_backup_restore --env-file PRIVATE_ENV_FILE
python -m scripts.apply_verified_release --env-file PRIVATE_ENV_FILE --apply
# Sau khi deployment mới READY:
# Scrub chỉ dành cho cutover 0006; không chạy lại trên revision 0007.
python -m scripts.smoke_group_release --env-file PRIVATE_ENV_FILE --run --billing
```

`verify_release` đọc file môi trường riêng tại `.vercel/action-plan-production.env`,
backup chỉ schema `clubhost`, restore vào schema ngẫu nhiên rồi migrate/đối chiếu cột
cũ; script apply xác minh hash backup, hash migration và đúng target trước khi áp dụng.
Script concurrency dùng schema ngẫu nhiên tách dữ liệu thật. Các schema thử được dọn
chỉ khi chính lượt chạy đã tạo; không chạm schema ứng dụng khác. Production smoke dùng
hai tài khoản ngẫu nhiên + một CLB QA, không gửi email/ghi nhận tiền thực, dọn bằng owner/
marker chính xác sau khi chạy. Không dùng pytest CRUD suite trực tiếp lên schema production.

`test_real_session_browser.py` là F-01 mobile 15 người. `test_hardening.py` kiểm tra lookup
không tiết lộ profile, MIME/magic bytes/path/size, XSS, snapshot QR/text cho tháng và booking,
DB lỗi trước kết nối/sau money flush, rollback rồi retry. `check_backup_restore` tạo 2 schema
test, archive DB/ảnh synthetic rồi restore sang media directory khác; kiểm tra hash, session
invalidation và serial sequences. Backup production ảnh thật vẫn do operator giữ riêng.

Sprint 4 thêm ba race billing: concurrent issue, retry cùng receipt key và hai receipt khác
nhau cùng lúc. Smoke `--billing` bao gồm nhóm/attendance và các dòng tiền giả lập chỉ trong
CLB QA: AA có phần dư, issue retry, bank + cash, thừa/hoàn và cơ sở bị khóa. Chỉ xóa các dòng
QA được tạo trong lượt đó, không đụng ledger thật. Mọi upload trong tests local nằm ở thư mục tạm.

0006 là expand → deploy → scrub capability: không scrub plaintext khi app cũ còn chạy.
Sau scrub, old links xác thực bằng hash; rollback sang app cần plaintext phải có kế hoạch
phục hồi được duyệt. Backup private không commit; scripts không in URL/credential/PII.

Phần hướng dẫn dưới giữ lại quy trình staging độc lập; không có biến nào tự động lấy
production làm target cho suite PostgreSQL opt-in theo hậu tố `_test`/`_staging`.

## Local regression — không dùng DB thật

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

`tests/conftest.py` đặt APP_ENV=test, DATABASE_URL=SQLite tạm trước import app, dùng upload
directory tạm và không sử dụng credential Blob/SMTP của operator. Không fallback sang
database đang cấu hình của ứng dụng. PostgreSQL/browser tests opt-in sẽ skip mặc định.

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:SPORTHOST_BROWSER_TESTS = '1'
.\.venv\Scripts\python.exe -m pytest -q tests/test_club_settings_browser.py
Remove-Item Env:SPORTHOST_BROWSER_TESTS
```

Browser dùng Edge cài sẵn, local uvicorn bind loopback cổng tạm, cùng DB test. Có thể đặt
`SPORTHOST_BROWSER_EXECUTABLE` thành đường dẫn Chromium/Edge riêng. Viewport 375×812,
812×375 và 1440×1000, reduced motion; kiểm tra tạo/sửa, labels, mobile overflow,
capacity theo CLB và giữ capacity host đã tự nhập. Ảnh local ở `.vercel/test-artifacts/`.
Không gọi site public hay đăng ký dữ liệu trên deployment.

## PostgreSQL thật — chỉ target test được cấp riêng

Giữ PostgreSQL hiện có và tunnel do operator cấu hình; không sửa SSH key/config.
Operator cấp target **non-production** có tên database kết thúc `_test` hoặc `_staging`,
role chỉ có quyền trong vùng test. Lưu URL riêng ngoài Git/chat với biến
`SPORTHOST_TEST_POSTGRES_URL=postgresql+psycopg://...@127.0.0.1:PORT/APP_test`.
Không sao chép URL production vào biến này. Suite từ chối host ngoài loopback và tên
database không có hậu tố test/staging; tuyệt đối không dùng DATABASE_URL thay thế.

```powershell
# SPORTHOST_TEST_POSTGRES_URL đã được cấp qua môi trường riêng.
$env:SPORTHOST_ALLOW_POSTGRES_TESTS = '1'
.\.venv\Scripts\python.exe -m pytest -q tests/test_postgres_migrations.py
Remove-Item Env:SPORTHOST_ALLOW_POSTGRES_TESTS
```

Test tạo 2 schema ngẫu nhiên `sporthost_test_<random>` và `_other`, migrate tới 0004,
seed CLB/booking/dues/expense legacy, upgrade 0005 hai lần, so sánh mọi record lịch sử
và sentinel schema bên cạnh. Cuối test chỉ xóa các schema mà chính test vừa tạo.
Không liệt kê/xóa schema khác. Chưa có URL thì test skip trước khi tạo engine/kết nối.
Đây là kiểm chứng migration, chưa thay thế test PostgreSQL tranh chỗ/ledger ở S2/S4.

## Triển khai migration 0005 khi đã đủ điều kiện

Không có lệnh nào dưới đây được chạy lên production trong đợt này.

1. Test PostgreSQL ở trên pass; review SQL 0005 chỉ có ALTER TABLE schema riêng `clubs`.
   Operator xác nhận các CLB legacy thực tế là cầu lông trước backfill. README cũ là
   cơ sở thiết kế, không thay thế kiểm tra dữ liệu triển khai. Nếu có môn khác hoặc
   chưa xác minh được, dừng migration và chuẩn bị mapping sport theo ID CLB đã duyệt.
2. Trước đổi code, backup bằng code 0004 hoặc pg_dump chỉ schema được cấp, xác minh restore
   và ảnh. Backup theo ORM 0005 trước khi migrate sẽ cần các cột chưa tồn tại nên không dùng.
3. Với target staging đã được cấp, operator đặt APP_ENV=staging, DATABASE_URL qua tunnel,
   DB_SCHEMA=clubhost, SECRET_KEY ổn định, COOKIE_SECURE=true. `DATABASE_MIGRATION_URL`
   chỉ được dùng nếu operator chủ động chọn trong `scripts.migrate`; test không dùng biến này.
4. Chạy read-only `python -m scripts.check_db`, rồi `python -m alembic current` để đối chiếu
   revision 0004. Không tạo lại schema đang có, không stamp/adopt bảng không rõ nguồn.
5. Chạy `python -m alembic upgrade head` trên staging được duyệt; xác minh revision 0005,
   CLB cũ sport=badminton, tiền/booking không đổi, CLB mới chọn môn được.
6. Production phải có phê duyệt rõ ràng riêng sau staging/backup. Không migrate khi app start.

Migration không có destructive downgrade: rollback app code 0004 và giữ cột mới nếu cần;
hoặc khôi phục dedicated schema từ backup đã kiểm tra theo quy trình operator. Không drop
cột, không drop/truncate bảng, không thay search_path/schema khác. Schema thêm cột tương
thích code cũ; local SQLite có dữ liệu cũ không tự được Alembic nâng cấp vì chỉ dành demo/test.
