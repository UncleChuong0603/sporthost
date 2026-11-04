# SportHost v2 — Sprint 0

> Historical migration evidence. The Python application and one-time audit tools were retired after the Next.js release on 2026-11-04. This inventory describes the audited source snapshot; it is not the current file tree. See [current progress](../PROGRESS.md), [cleanup notes](../CLEANUP.md) and [release runbook](../RELEASE_RUNBOOK.md) for active instructions. Retain the 89-route inventory as an independent compatibility contract.

Ngày audit: **03/11/2026, Asia/Bangkok**. Phạm vi: working tree thực tế, gồm cả thay đổi Dokploy chưa commit trên HEAD `429f1624b56404befff824ff20a4147b04a8e36b`.

**Sprint 0 hoàn tất về audit source và thiết kế. Chưa rewrite tính năng, chưa deploy v2.** Các giới hạn kiểm chứng live được ghi riêng; đây không phải chứng nhận feature parity hay production readiness.

| Tài liệu | Nội dung |
| --- | --- |
| [AUDIT.md](AUDIT.md) | Hiện trạng, toàn bộ miền nghiệp vụ, rủi ro và vận hành |
| [INVENTORY.md](INVENTORY.md) | Toàn bộ route, model/field, file Python, migration, test, template/asset |
| [inventory.json](inventory.json) | Manifest máy đọc được, chữ ký file, tham số/call graph theo từng handler |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module TypeScript, Next.js routing, transaction, DTO và runtime đích |
| [COMPATIBILITY.md](COMPATIBILITY.md) | PostgreSQL/Drizzle, mật khẩu, cookie/token, URL, storage và rollback |
| [ACCEPTANCE.md](ACCEPTANCE.md) | Test bắt buộc và tiêu chí parity/regression/release |
| [ROUTE_PARITY.csv](ROUTE_PARITY.csv) | Checklist từng route, đích tương thích và acceptance ID |
| [MIGRATION_PLAN.md](MIGRATION_PLAN.md) | Sprint, điều kiện vào/ra, cutover và approval gates |
| [VALIDATION.md](VALIDATION.md) | Lệnh đã chạy, kết quả và những gì chưa được chứng minh |

Quyết định của chủ dự án trong phiên này:

- Cho phép tạo **một Application preview tạm trên Dokploy**. Production hiện tại vẫn phải được giữ nguyên tới khi parity/regression đạt.
- V2 dùng **volume bền vững trên VPS + SMTP sẵn có**; không bắt buộc Blob/Resend hoặc SaaS trả phí.
- Dùng lại PostgreSQL và schema `clubhost`; không thay tên schema theo tên sản phẩm.
- Chưa có duyệt thay đổi DNS production, migration phá dữ liệu, thay production bằng v2, hoặc xoá deployment fallback.

Kết quả nổi bật: 89 route nghiệp vụ, 21 model, 11 migration lịch sử; **137 test mặc định đạt**, **10 ca Playwright đạt**. Một ca PostgreSQL migration vẫn cần database test cách ly để chạy lại; không sử dụng production cho test ghi.

Tài khoản hiện có có thể giữ mật khẩu. Probe offline Python → Node kiểm chứng PBKDF2, chữ ký cookie và capability guest bằng dữ liệu giả; phải tiếp tục chuyển thành test bảo mật của implementation trước release.

Tiếp theo là S1 theo [kế hoạch](MIGRATION_PLAN.md). V2 chỉ được công bố chạy tại `sporthost.online` khi mọi gate release và DNS/TLS đã đạt.
