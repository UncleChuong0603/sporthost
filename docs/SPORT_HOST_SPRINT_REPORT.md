# Báo cáo SportHost — action plan 01/11/2026

## Sprint 0

**Hoàn tất audit/source baseline và test isolation local.** Chưa có target PostgreSQL
non-production để kiểm chứng kết nối qua tunnel/migration thực tế.

Đã đối chiếu routes/models/migrations/UI/test với đầy đủ action plan, phân biệt feature
đang có với phần cần bổ sung; giữ FastAPI/Jinja/SQLAlchemy/PostgreSQL và schema `clubhost`.
Không sửa tài liệu/ảnh UX audit đã có và không thao tác deployment.

Files:

- `docs/SPORT_HOST_GAP_ANALYSIS.md`: ma trận có/thiếu/refactor, quyền, migration mapping,
  assumptions, dependency gates và rủi ro legacy money/token/QR.
- `docs/SPORT_HOST_CODEBASE_INVENTORY.md`: models, fields, 69 route declarations,
  templates, migrations và test modules.
- `docs/SPORT_HOST_E2E_SCENARIOS.md`: toàn bộ happy path 15 người và 30 nhóm nghiệm thu.
- `docs/SPORT_HOST_TESTING.md`: test PostgreSQL/browser riêng, tunnel, migration/rollback.
- `tests/conftest.py`: tiếp tục SQLite tạm; thêm ảnh tạm và tắt credential cloud/SMTP trong test.

Migration Sprint 0: không tạo/chạy migration riêng; kiểm tra cơ chế namespace Alembic
đã có và thiết kế thay đổi additive cho các sprint sau.

Baseline thực chạy: `.venv\Scripts\python.exe -m pytest -q` → **46 passed in 49.05s**.
Không dùng SQLite làm bằng chứng PostgreSQL locking/migration đã được kiểm chứng.

## Sprint 1

**Đã implement code và kiểm chứng local/browser; còn pending PostgreSQL online migration.**

Đã làm:

- Catalog cầu lông/pickleball/quần vợt/bóng đá/bóng chuyền/bóng rổ/bóng bàn, mở rộng từ
  một file; không dùng PostgreSQL enum hoặc hard-code cầu lông trong model tài chính.
- Tạo/sửa CLB: sport, trình độ linh hoạt, capacity 1–200, approval/fee defaults,
  chính sách hủy và hướng dẫn sân. Owner-only ở backend, CSRF, khóa hàng khi sửa,
  validate trước mutation; dữ liệu sai không lưu một phần hoặc tạo audit sai.
- Audit lưu đủ trước/sau cùng transaction, không bị helper cũ cắt ở 500 ký tự.
  Giao diện hiển thị nhãn/giá trị tiếng Việt, không đưa JSON kỹ thuật vào luồng host.
- Form cũ không gửi field mới vẫn giữ settings; server defaults hỗ trợ insert từ code cũ.
- Form tạo buổi lấy capacity CLB, đổi club cập nhật mặc định nếu host chưa tự sửa.
- Nhãn sport, tiền cầu chỉ cho cầu lông, chi phí dụng cụ cho môn khác; chuẩn hóa
  thuật ngữ người chơi/host và các lỗi nhập liệu. Không đổi DB enum/API identifiers.
- Giữ booking/phí/paid/dues/session cũ khi sửa settings, giữ guest không account,
  QR tĩnh và proof chờ host đối soát.

Files implementation:

- Mới: `app/sports.py`, `app/club_settings.py`, `app/templates/club_settings_fields.html`.
- Sửa: `app/main.py` (Club fields/constraints, create/update, globals và lỗi tiếng Việt).
- Templates: `auth.html`, `base.html`, `club.html`, `clubs.html`, `finance.html`,
  `forms.html`, `game.html`, `join.html`, `participant.html`, `schedule.html`,
  `session_fees.html`, `settings.html`.
- `public/static/workspace.js`: capacity theo CLB; `style.css`: field spacing,
  wrapping audit và input 16px mobile cho form CLB.
- Tests mới: `tests/test_club_settings.py`, `tests/test_club_settings_browser.py`,
  `tests/test_postgres_migrations.py`; `requirements-dev.txt` cho Playwright local.
- Tài liệu: `README.md`, `CHANGELOG.md`, các docs Sprint 0 và báo cáo này.

Migration:

- Mới `alembic/versions/0005_club_settings.py`, kế tiếp `0004_full_roadmap`.
- 7 cột trong `DB_SCHEMA.clubs`: sport_type, skill_guidance, default_capacity,
  default_approval_mode, cancellation_policy, default_fee_mode, venue_instructions.
- 3 constraints capacity/approval/fee; defaults badminton/20/MANUAL_APPROVE/FIXED_PRICE
  và policy trống. Cơ sở backfill badminton là scope README/BUILD_PLAN cũ.
  Operator cần xác minh môn của CLB legacy thật trước migration, nếu khác phải lập mapping riêng.
- Không thêm bản ghi tài chính, không đổi booking/session, không đụng schema khác.
- Downgrade destructive bị chặn; rollback code giữ cột mới hoặc restore dedicated schema
  từ backup đã kiểm tra. **Không chạy online, không migrate production.**

Kết quả test thực chạy sau sửa:

| Lệnh | Kết quả |
| --- | --- |
| `.venv\Scripts\python.exe -m pytest -q` | **70 passed, 4 skipped in 31.10s** |
| `$env:SPORTHOST_BROWSER_TESTS='1'; .venv\Scripts\python.exe -m pytest -q tests/test_club_settings_browser.py` | **3 passed in 14.09s** |
| `$env:SPORTHOST_BROWSER_TESTS='1'; .venv\Scripts\python.exe -m pytest -q` — lượt cuối sau chỉnh hiển thị audit | **73 passed, 1 skipped in 41.36s** |

4 skip mặc định là 3 viewport browser opt-in và 1 PostgreSQL migration integration.
Lượt cuối bật browser nên chỉ còn 1 skip: PostgreSQL migration integration chưa có URL test.
Browser đã chạy riêng trên Edge thật, local server/test DB: 375×812, 812×375, 1440×1000,
reduced motion; tạo/sửa settings, accessible sport selector, thông báo lưu,
không tràn ngang trang, capacity defaults và giữ input host, không có JS page errors.
Ảnh ở `.vercel/test-artifacts/club-settings-375.png`, `-812.png`, `-1440.png` (gitignored).
Các test mới cũng kiểm chứng catalog, invalid values/lengths, legacy forms/server defaults,
owner/co-host/cross-tenant/CSRF, audit đầy đủ, nhãn và tiền cũ không thay đổi, PostgreSQL DDL offline.
Đã chạy `python -m alembic upgrade head --sql` với PostgreSQL URL giả, sinh toàn chuỗi
0001→0005 chỉ để review offline; không kết nối DB. Kiểm tra artifact SQL không có DDL
vào `public`, DROP TABLE hoặc TRUNCATE. `git diff --check` và compileall cũng pass.

Chưa được kiểm chứng / chưa triển khai:

- PostgreSQL online 0004→0005 giữ dữ liệu/sentinel schema khác: suite đã viết nhưng
  chưa có `SPORTHOST_TEST_POSTGRES_URL` non-production. Không suy ra pass từ SQL offline.
- Mặc định AUTO_APPROVE/COST_SHARING và hủy mới dừng ở lưu cấu hình; thuật toán duyệt,
  deadline/policy snapshot và fee engine thuộc Sprint 2/4. Không tự đổi buổi đang có.
- Các case nhóm, PostgreSQL cạnh tranh chỗ, per-person attendance, partial/overpay/refund,
  close-but-unpaid, granular co-host, platform ledger và E2E 15 người vẫn pending.
- UI chưa phải chứng nhận mọi màn hình đạt WCAG hoặc mọi tác vụ tại sân đã tối ưu.
  Audit cũ về QR/text snapshot, recovery link, finance read scope và mobile roster vẫn cần xử lý.

## Bước tiếp theo

Theo Definition of Done, Sprint 1 chưa được coi hoàn tất toàn bộ khi thiếu migration test
PostgreSQL. Operator cấu hình riêng target test qua tunnel theo SPORT_HOST_TESTING, chạy
suite PostgreSQL và xác minh backup/restore; không yêu cầu dán credentials trong chat.
Sau khi qua cổng đó, tiếp tục **Sprint 2**: policy snapshot/override theo buổi,
booking participants và payer, duyệt auto/manual + capacity atomic theo số người,
waitlist nguyên nhóm, digest/expiry/revocation guest token và sửa/hủy có policy.

Không có phê duyệt production trong phiên này; không có lệnh production/deploy nào được chạy.
