# SportHost Beta

Quản lý CLB thể thao cho host — [mở bản thử nghiệm](https://sporthost.vercel.app).
FastAPI, Jinja2, SQLAlchemy, PostgreSQL/Alembic, Vercel và private Blob.

## Chức năng

- Chọn môn thể thao, hướng dẫn trình độ/sân, chính sách hủy và các mặc định của CLB.
- Workspace có sidebar, tổng quan, lịch, thành viên, thu chi, cài đặt từng CLB và hỗ trợ mobile.
- Lịch tuần, RSVP riêng, ưu tiên member, duyệt vãng lai, danh sách chờ và điểm danh.
- Nam/nữ, phí riêng theo giới tính/loại thành viên; giới hạn tổng và chỗ nam/nữ tùy chọn.
- Vãng lai nhập điện thoại trước, tự điền hồ sơ trong CLB, kiểm tra rồi xác nhận.
- Đăng ký hộ nhiều người, duyệt cả nhóm, tự động nhận hoặc host duyệt; danh sách chờ tính theo số người.
- Link quản lý khách có hash, hạn dùng và thu hồi/cấp lại; sửa/hủy theo chính sách đã nhận.
- Upload QR, biên nhận riêng tư và đối soát thủ công; phí tháng, chi phí, CSV.
- Đồng quản lý, quyền điều hành/thu chi, audit, tài khoản và quản trị Pro trial miễn phí.

[Chi tiết tính năng](FULL_ROADMAP.md) · [Triển khai](DEPLOY_VERCEL.md) · [Vận hành](OPERATIONS.md)

**Email thật cần cấu hình SMTP.** Hiện đổi mật khẩu trong phiên đăng nhập hoạt động;
quên mật khẩu/xác minh email chỉ gửi được khi dịch vụ email được cấu hình.
Upload biên nhận không tự xác nhận đã thu. Chưa thu phí phần mềm trong beta.

## Action plan 01/11/2026 — trạng thái nhánh này

Sprint 1 đã lên production (`7a8ae26`, migration `0005_club_settings`) sau khi backup,
phục hồi/migrate thử vào schema riêng và smoke test bằng CLB thử.
Sprint 2 bổ sung đăng ký nhóm, policy snapshot, hạn đăng ký/sửa/hủy, duyệt/waitlist
atomic theo số người và link riêng có bảo vệ; migration `0006_group_bookings` mở rộng
bảng cũ và map mỗi booking cũ đúng một participant. Trạng thái release/test mới nhất
được ghi tại báo cáo sprint bên dưới.

Sprint 3 thêm điểm danh từng người, walk-in, về sớm, thay người và kết thúc đánh;
[báo cáo Sprint 3](docs/SPORT_HOST_SPRINT_3_REPORT.md) ghi rõ kiểm chứng và release.
Sprint 4 thêm engine chia đều/giá cố định, miễn phí tháng đã đóng, bản nháp/phát hành,
thu thiếu/đủ/thừa nhiều lần, hoàn thủ công, tách payer và snapshot QR/tài khoản.
[Báo cáo Sprint 4](docs/SPORT_HOST_SPRINT_4_REPORT.md) ghi phạm vi, tương thích và kiểm chứng.
Sprint 5 thêm chốt sổ còn nợ, điều chỉnh có version/lý do, quyền co-host chi tiết và
sổ nền tảng riêng; [báo cáo Sprint 5](docs/SPORT_HOST_SPRINT_5_REPORT.md).
Sprint 6 bổ sung E2E mobile 15 người, privacy lookup, upload/DB-failure hardening,
snapshot QR/text cho phí tháng và backup ảnh; [báo cáo Sprint 6](docs/SPORT_HOST_SPRINT_6_REPORT.md).
Luồng 15 người kiểm chứng: 1.050.000đ phải thu, 500.000đ thực nhận, 550.000đ còn nợ sau chốt.
Không tự đổi nghĩa vụ tiền cũ; session chưa phát hành vẫn giữ luồng legacy giá cố định.

[Gap analysis](docs/SPORT_HOST_GAP_ANALYSIS.md) ·
[Kịch bản nghiệm thu](docs/SPORT_HOST_E2E_SCENARIOS.md) ·
[Báo cáo sprint](docs/SPORT_HOST_SPRINT_REPORT.md) ·
[Test/migration](docs/SPORT_HOST_TESTING.md)

[Hướng dẫn host/khách](docs/SPORT_HOST_USER_GUIDE.md) ·
[Vận hành beta, staging/tunnel và giới hạn](docs/SPORT_HOST_BETA_OPERATIONS.md)

Giữ nguyên PostgreSQL/schema `clubhost` đã cấu hình của ứng dụng. Trong phiên tiếp tục,
cấu hình thực tế từ Vercel là endpoint PostgreSQL trực tiếp; không tạo/chuyển dịch vụ DB
hoặc thay SSH. Người dùng đã cho phép push/deploy và test production ngày 01/11/2026.
Migration vẫn được backup/restore và kiểm chứng trong schema thử riêng trước khi áp dụng;
test production chỉ dùng tenant được tạo riêng rồi dọn chính dữ liệu thử đó.

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
