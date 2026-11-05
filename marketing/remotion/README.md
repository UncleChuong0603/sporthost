# SportHost · Video quảng bá dọc

Video **43 giây · 1080 × 1920 · 30 fps · MP4 H.264 / AAC stereo**.

**Thành phẩm:** [`out/sporthost-promo-vertical.mp4`](out/sporthost-promo-vertical.mp4)  
**Storyboard trích từ MP4:** [`out/storyboard-final.png`](out/storyboard-final.png)  
**Kết quả kiểm tra:** [`out/validation.json`](out/validation.json)

Đây là workspace độc lập. Không thay đổi dependencies, UI hoặc nghiệp vụ trong `v2/`. Không triển khai website hay đăng video.

## Xem và render

Yêu cầu Node.js 22.12+. Chạy từ thư mục này:

```powershell
npm ci
npm run studio
npm run typecheck
npm run render
npm run verify
```

Composition: **SportHostVertical**. File video được xuất đúng đường dẫn trên. Font, ảnh và nhạc đều lưu tại `public/`; render không cần gọi API, truy cập sản phẩm trực tuyến hay đăng nhập.

Script render tự dùng Edge ở `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` nếu có, nếu không Remotion dùng cơ chế tải Chromium chuẩn. Có thể chỉ định trình duyệt đã cài bằng `$env:REMOTION_BROWSER_EXECUTABLE`. Render mặc định một luồng để phù hợp máy ít RAM; tăng bằng `$env:REMOTION_CONCURRENCY` khi cần.

Với bản Remotion này, capture JPEG có thể xuất H.264 full-range `yuvj420p` dù yêu cầu `yuv420p`. Script tự chuẩn hóa thành BT.709 limited-range `yuv420p` và thêm faststart, giữ bản master ban đầu ở `out/sporthost-promo-vertical.master.mp4`. Bản để đăng là file **không có** hậu tố `.master`. Các binary chuẩn hóa dùng FFmpeg/FFprobe đi kèm Remotion trên Windows, hoặc hai biến `FFMPEG_PATH` / `FFPROBE_PATH` khi chạy hệ điều hành khác. Nếu dùng CLI trực tiếp, chạy thêm `node scripts/normalize.mjs` trước `npm run verify`.

Lệnh CLI tương đương:

```powershell
npx remotion render src/index.ts SportHostVertical out/sporthost-promo-vertical.mp4 --codec h264 --pixel-format yuv420p --crf 17 --concurrency 1
```

`npm run stills` xuất 10 khung kiểm tra từ tất cả các cảnh và khung cuối. `node scripts/render.mjs --all` xuất cả khung mẫu lẫn video. `npm run verify` kiểm tra codec, độ phân giải, fps, số khung, thời lượng, âm thanh, giải mã toàn bộ MP4, rồi trích storyboard từ chính MP4. Script verify hiện dùng FFmpeg/FFprobe đi kèm Remotion trên Windows; máy khác đặt `FFMPEG_PATH` và `FFPROBE_PATH` trỏ tới binary phù hợp.

## Timeline

| Thời gian | Nội dung |
| --- | --- |
| 0–5s | Hook: quản lý CLB cầu lông đang quá mất thời gian? |
| 5–10s | Tin nhắn, danh sách thành viên, tiền sân |
| 10–14s | Logo SportHost và màn hình tổng quan thật |
| 14–18.5s | Thành viên cố định / vãng lai |
| 18.5–23s | Lịch chơi, giờ, sân và số chỗ |
| 23–27.5s | Điểm danh có mặt / vắng mặt / về sớm |
| 27.5–32s | Thu chi: đã ghi nhận, còn cần thu; nhắc QR / biên nhận |
| 32–38s | Ít thủ công, dễ theo dõi, quản lý tập trung |
| 38–43s | CTA và `sporthost.online`, kết thúc giữ thương hiệu |

Nội dung chính nằm trong vùng x=90–936, y≈280–1700; header và chỉ báo tiến độ là thông tin phụ. Các màn hình đều có nhãn dữ liệu demo. Không đưa ra số liệu tiết kiệm, doanh thu, khách hàng hoặc hiệu suất.

## Chỉnh sửa

- `src/config.ts`: bảng màu, URL, tên composition, cấu hình video, nội dung và mốc thời gian bốn tính năng.
- `src/scenes.tsx`: hook, vấn đề, giới thiệu, lợi ích, CTA; vị trí và cỡ chữ.
- `src/components.tsx`: logo từ giao diện sản phẩm, headline, khung UI, icon, đồ họa sân cầu và quả cầu.
- `src/root.tsx`: lịch Sequence, chuyển cảnh 14 khung, nhạc và fade âm thanh. Mọi chuyển động phụ thuộc số khung; không dùng thời gian thực hay Math.random.
- `public/screens/`: ảnh UI. Có thể thay ảnh bằng ảnh demo mới cùng kích thước nguồn.
- `scripts/assets.mjs`: dựng lại bản nhạc tổng hợp gốc và sao chép font từ dependency đã khóa; chạy `npm run assets`.

Khi đổi thời lượng, cập nhật `VIDEO.frames`, `VIDEO.seconds`, các Sequence và `CUTS`, fade âm thanh và độ dài score trong `scripts/assets.mjs`. Các giá trị kiểm tra cố định trong `scripts/verify.mjs` cũng cần đổi theo brief mới.

## Tính năng đã xác minh

Đã đọc mã nguồn, tài liệu và các bài kiểm tra hiện có trước khi viết kịch bản. Đã chạy ứng dụng cục bộ và tạo dữ liệu demo qua service của ứng dụng để chụp màn hình. Việc kiểm tra video không thay thế chạy lại toàn bộ bộ kiểm thử của sản phẩm.

| Tính năng / thương hiệu | Bằng chứng trong repository |
| --- | --- |
| Logo Activity + chữ SportHost, teal `#087f6b`, nền `#142d35` | `v2/src/app/page.tsx`, `v2/src/features/auth/auth-page.tsx`, `v2/src/app/(workspace)/layout.tsx`, `v2/src/app/globals.css` |
| Tạo và quản lý CLB | `v2/src/server/modules/clubs/service.ts`, `v2/src/app/(workspace)/clubs/` |
| Thành viên cố định / vãng lai, lọc và sửa hồ sơ | `v2/src/app/(workspace)/members/page.tsx`, `v2/src/server/modules/members/service.ts` |
| Tạo lịch với giờ, sân, sức chứa | `v2/src/features/scheduling/session-form.tsx`, `v2/src/server/modules/scheduling/service.ts` |
| Điểm danh từng người | `v2/src/app/(workspace)/games/[gameId]/page.tsx`, `v2/src/server/modules/attendance/service.ts` |
| Theo dõi đã thu, cần thu, chi phí | `v2/src/app/(workspace)/finance/page.tsx`, `v2/src/server/modules/finance/ledger.ts` |
| Host tải ảnh QR nhận tiền | `v2/src/features/finance/club-finance.tsx`, `v2/src/server/modules/finance/proofs.ts` |
| Người chơi gửi ảnh biên nhận; host kiểm tra và xác nhận | `v2/src/server/modules/finance/proofs.ts`, `v2/src/app/(workspace)/payments/review/page.tsx` |
| Landing / đăng ký host | URL `https://sporthost.online` được xác nhận trong README gốc; `/signup` có route thực và liên kết từ landing |

Các test có sẵn liên quan: `v2/tests/e2e/accounts-clubs.spec.ts`, `management-parity.spec.ts`, `booking-billing.spec.ts`, cùng các test `clubs-members`, `bookings-attendance`, `billing`, `proofs-dues` trong `v2/tests/integration/`.

Không quảng cáo thanh toán tự động cho người chơi. Ảnh biên nhận không được mô tả là giao dịch đã thu trước khi host xác nhận. Không quảng cáo giá gói Pro, lịch lặp miễn phí, thống kê hiệu quả hoặc tính năng chưa xác minh.

## Nguồn tài nguyên và dữ liệu demo

- Logo được dựng bằng đúng icon Activity và wordmark Arial bold đang có trong UI. Repository không có file logo raster độc lập.
- Sáu ảnh chụp UI thật tại localhost: thành viên, lịch, điểm danh, tổng quan, thu chi và trang thanh toán. Video dùng năm ảnh đầu. Mọi người chơi / CLB / số tiền là dữ liệu demo. Không chụp hay truy cập tài khoản production.
- Manrope được đóng gói cục bộ với đủ subset Latin và tiếng Việt. Giấy phép SIL Open Font License: `public/fonts/OFL.txt`.
- Icons Lucide: giấy phép ISC trong dependency `lucide-react/LICENSE`.
- Đồ họa sân cầu, quả cầu và bản nhạc `public/audio/sporthost-original.wav` được tạo riêng bằng mã trong workspace. Nhạc 120 BPM, stereo 48 kHz; không dùng sample hay nhạc tải bên ngoài.
- Không có bản thu giọng đọc tiếng Việt đáng tin cậy trong repo nên bản hoàn thiện dùng nhạc và chữ; không gọi dịch vụ voice trả phí.

Để chụp lại, cần dependencies hiện có của `v2/` và cấu hình database cục bộ. Chạy `node scripts/local-app.mjs`, sau đó ở terminal khác chạy `npm run capture`. Launcher chỉ cho phép database loopback có tên kết thúc `_test`, tắt email và payOS, dùng port 3217. Capture tạo tài khoản và CLB demo mới; không xóa hoặc reset dữ liệu khác. Việc tạo fixture dùng endpoint nội bộ tương thích của ứng dụng để tránh rewrite timeout trong dev; nội dung hình là UI server-rendered thực. Không lưu cookie, mật khẩu, token hoặc URL mời riêng trong các artifact. Sau khi chụp, dừng riêng tiến trình demo.

Tài liệu Remotion đối chiếu cho bản đã khóa **4.0.540**: [renderMedia](https://www.remotion.dev/docs/renderer/render-media), [spring](https://www.remotion.dev/docs/spring), [font cục bộ](https://www.remotion.dev/docs/fonts), [browser executable](https://www.remotion.dev/docs/options/browser-executable).
