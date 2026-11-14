# Rà soát UX và đề xuất Free / Pro — 12/11/2026

Phạm vi: đọc implementation hiện tại trong `v2/src`, tài liệu luồng host/member/guest và ảnh mobile có sẵn trong `v2/test-results`. Không đăng nhập kiểm thử trực tiếp production trong lần review này. Các nhận định về điểm rơi người dùng và khả năng trả phí là giả thuyết sản phẩm cần đo, chưa phải kết quả từ analytics hay phỏng vấn.

## Kết luận

Nên bổ sung tính năng, nhưng ưu tiên giảm thao tác và nối liền các luồng hiện có. Free đã có đủ nghiệp vụ tổ chức buổi chơi; Pro hiện có hai lợi ích chính là tạo/gia hạn lịch lặp và cấp quyền đồng quản lý. Cơ hội tốt nhất cho Pro là tự động nhắc RSVP, nhắc khoản đóng và hỗ trợ vận hành lịch hàng tuần.

Định hướng đề xuất: **Free tổ chức trọn một buổi chơi; Pro giảm công việc lặp lại khi vận hành CLB thường xuyên.** Tiếp tục tính Pro theo CLB; trải nghiệm tham gia và thanh toán của người chơi không cần mua gói riêng.

## Những gì đã có

| Khả năng | Hiện trạng trong source |
| --- | --- |
| CLB, thành viên, buổi lẻ, link đăng ký không cần tài khoản | Có trong Free |
| Duyệt đăng ký, nhóm đi cùng, danh sách chờ, điểm danh | Có trong Free |
| Phí cố định/chia chi phí, phí tháng, QR, gửi ảnh biên nhận, ghi nhận tiền, điều chỉnh/hoàn tiền | Đã có; không cần build lại thành tính năng mới |
| Cổng người chơi, lịch cá nhân, khoản còn cần đóng | Đã có; tài khoản phải xác minh email và được chủ CLB liên kết |
| Sổ thu chi và xuất CSV cơ bản | Đã có; không nên giới thiệu CSV như một tính năng Pro mới |
| Tạo và gia hạn lịch lặp | Pro/trial |
| Cấp hoặc cập nhật quyền đồng quản lý | Pro/trial |
| Gói hiện tại | Source cấu hình trial 7 ngày, Pro 49.000đ / 30 ngày / CLB |

Nguồn: [trang gói](../../v2/src/app/(workspace)/clubs/[clubId]/subscription/page.tsx), [domain subscription](../../v2/src/domain/subscription.ts), [lịch chơi](../../v2/src/server/modules/scheduling/service.ts), [phân quyền](../../v2/src/server/modules/clubs/access.ts), [member portal](MEMBER_PORTAL.md), [thu chi](../../v2/src/app/(workspace)/finance/page.tsx).

## Các điểm UX cần ưu tiên

### 1. Kết nối tài khoản người chơi còn cần phối hợp ngoài ứng dụng

Hiện người chơi phải tạo tài khoản → xác minh email → gửi email tài khoản cho chủ CLB → chủ CLB tìm đúng hồ sơ và nhập email để liên kết. Màn hình trống hướng dẫn người chơi liên hệ host nhưng chưa có hành động gửi yêu cầu ngay trong ứng dụng.

**Đề xuất Free:** link/mã mời vào CLB, người chơi gửi yêu cầu kết nối, chủ CLB duyệt đúng hồ sơ. Có trạng thái chờ duyệt, từ chối và hướng dẫn tiếp theo; giữ yêu cầu xác minh email. Không tự ghép hồ sơ theo tên hoặc số điện thoại. Luồng guest tiếp tục đăng ký không cần tài khoản; chỉ mời tạo tài khoản sau khi hoàn thành đăng ký.

Tiêu chí hoàn thành: người chơi khởi tạo được yêu cầu trong app, host duyệt trong app, sau duyệt thấy đúng lịch/khoản đóng; yêu cầu lặp không tạo liên kết trùng, không nhận nhầm hồ sơ.

Nguồn: [trang chủ người chơi](../../v2/src/app/(member)/me/page.tsx), [link/unlink service](../../v2/src/server/modules/member-portal/service.ts), [hướng dẫn hiện tại](MEMBER_PORTAL.md).

### 2. Điều hướng host trên mobile khó nhận biết hơn phía người chơi

Workspace host có sáu mục chỉ hiện icon ở mobile; chưa có đánh dấu mục hiện tại. Phía người chơi đã có bốn mục kèm nhãn và `aria-current`, là mẫu có thể tái sử dụng về nguyên tắc.

**Đề xuất Free:** bốn mục chính có nhãn (Tổng quan, Lịch, Thành viên, Thu chi), đưa CLB/tài khoản vào menu phù hợp; đánh dấu trang đang mở và giữ ngữ cảnh CLB khi chuyển trang. Xác định vị trí bộ chọn CLB cho host có nhiều CLB.

Tiêu chí hoàn thành: thao tác được ở 375px, có nhãn nhìn thấy, trạng thái active và focus rõ; quay lại danh sách giữ bộ lọc CLB.

Nguồn: [workspace layout](../../v2/src/app/(workspace)/layout.tsx), [member navigation](../../v2/src/features/member-portal/navigation.tsx).

### 3. Buổi chơi có nhiều thao tác nhưng thiếu hướng dẫn theo công việc kế tiếp

Trang buổi chơi đã có đủ mở/đóng đăng ký, bắt đầu, kết thúc, điểm danh, thu trước và phát hành khoản đóng. Người mới phải tự hiểu trình tự và quan hệ giữa trang danh sách người chơi với trang thu chi. Link đăng ký hiện có nút mở trang, chưa thấy tiện ích sao chép/chia sẻ trong phần source đã rà.

**Đề xuất Free:** hiển thị tiến trình “Mời người → Ra sân/điểm danh → Tính phí → Thu tiền”; chỉ rõ việc tiếp theo và lý do chưa làm được. Thêm sao chép link, chia sẻ từ thiết bị và mẫu nội dung mời để host tự gửi qua Zalo/Messenger; đây không phải tích hợp tự gửi tin nhắn. Thêm lưu một buổi vào lịch bằng ICS hoặc liên kết lịch phù hợp.

Form tạo buổi nên tách “Lặp lịch · Pro”, “Giá và cách tính phí”, “Giới hạn và chính sách”; hiện chúng cùng nằm trong một khối nâng cao. Với chia chi phí, làm rõ mức phí đang chờ tính. Chỉ mở phần giải thích cần thiết theo lựa chọn, phù hợp nguyên tắc [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).

Nguồn: [trang buổi chơi](../../v2/src/app/(workspace)/games/[gameId]/page.tsx), [form tạo buổi](../../v2/src/features/scheduling/session-form.tsx), [thu trước](../../v2/src/features/finance/legacy-money.tsx).

### 4. Dashboard chưa gom đủ việc host cần xử lý

Dashboard đã có lượt đăng ký chờ duyệt, buổi sắp tới và tổng thu chi tháng. Biên nhận chờ đối soát có trang riêng; chưa có khối công việc thống nhất cho biên nhận, buổi chưa hoàn tất điểm danh/phát hành và nợ cần theo dõi.

**Đề xuất Free:** khối “Cần xử lý” với số lượng và liên kết đã lọc: đăng ký chờ duyệt, ảnh biên nhận chờ kiểm tra, buổi cần chốt và khoản còn phải thu. Chỉ hiển thị theo quyền của host. Không dùng số ảnh biên nhận làm số giao dịch đã thu.

Nguồn: [dashboard](../../v2/src/features/clubs/dashboard-overview.tsx), [đối soát](../../v2/src/app/(workspace)/payments/review/page.tsx).

### 5. Thiếu thông báo nghiệp vụ và nhắc việc tự động

Trong source đã rà, email hiện phục vụ xác minh và khôi phục tài khoản; chưa thấy luồng gửi thông báo nghiệp vụ hoặc lịch nhắc RSVP/nhắc khoản đóng. Người dùng cần tự mở trang để theo dõi thay đổi.

**Free:** hộp thông báo trong app cho kết quả duyệt, được lên từ danh sách chờ, đổi giờ/hủy buổi, kết quả kiểm tra biên nhận. Thông báo quan trọng như đổi/hủy buổi không nên bị chặn bởi gói.

**Pro:** host đặt lịch nhắc RSVP, trước giờ chơi và khoản đã phát hành còn chưa đóng; gửi email cho người có tài khoản liên kết đã xác minh và đồng ý nhận nhắc. Khách không có email dùng link và mẫu tin nhắn để host gửi thủ công. Có xem trước đối tượng, tắt nhắc, giới hạn tần suất và lịch sử gửi.

MVP nên dùng thông báo trong app và email trước, chưa cần push hoặc tự động gửi Zalo. Nếu thêm push sau này, chỉ xin quyền khi người dùng chủ động bật và đã hiểu lợi ích, theo [hướng dẫn quyền trình duyệt của Google](https://web.dev/articles/permissions-best-practices).

Tiêu chí hoàn thành cho nhắc tự động: job bền vững và chống gửi trùng; kiểm tra lại trạng thái tại thời điểm gửi; dừng nhắc phí khi đã ghi nhận đủ tiền; buổi đã hủy không nhận nhắc ra sân; có retry và tắt nhắc. Không ghi nhận đã thu từ việc gửi thông báo hoặc nhận ảnh biên nhận.

## Phân chia tính năng đề xuất

| Nhóm | Free | Pro | Ưu tiên |
| --- | --- | --- | --- |
| Kết nối CLB | Link/mã mời, gửi yêu cầu, chủ CLB duyệt | Không cần tách gói | Cao |
| Vận hành buổi | Điều hướng dễ hiểu, tiến trình, chia sẻ link, lưu lịch một buổi | Kế thừa | Cao |
| Theo dõi việc cần làm | Dashboard công việc và thông báo trạng thái | Nhắc việc tự động theo lịch | Cao |
| Lịch lặp | Tạo từng buổi; có thể cân nhắc sao chép một buổi thủ công | Lịch lặp hiện có; bổ sung nhiều khung trong tuần, bỏ ngày nghỉ, sửa các buổi tương lai có xem trước | Sau MVP nhắc việc |
| Thu khoản đóng | QR, gửi biên nhận, đối soát thủ công, nợ còn lại, CSV hiện có | Nhắc khoản còn thiếu theo chính sách; tổng hợp danh sách cần theo dõi | Cao |
| Báo cáo | Tổng thu chi hiện có | Xu hướng lấp đầy, đi chơi/vắng, nợ theo tuổi, so sánh kỳ | Sau khi có nhu cầu thực tế |
| Cộng tác | Chủ CLB vận hành | Đồng quản lý/phân quyền hiện có; bổ sung mời nhận quyền bằng link nếu cần | Giữ, cải thiện sau |
| Đưa dữ liệu ban đầu vào app | Cân nhắc nhập CSV thành viên có xem trước và báo trùng để giảm công nhập khi bắt đầu | Chưa cần tạo rào cản nâng cấp ở bước này | Sau các điểm nghẽn chính |

Không thêm nhiều gói hoặc giới hạn số thành viên ở đợt này khi chưa có dữ liệu sử dụng. Chưa có cơ sở từ review để kết luận cần đổi giá.

## Giá trị gia hạn và trải nghiệm trial

- Trang Pro hiện có hai tính năng sản phẩm khác biệt; kích hoạt tự động và gia hạn cộng dồn là sự thuận tiện khi mua, chưa phải lợi ích vận hành hàng tuần. Nên đưa ví dụ kết quả sử dụng lên đầu: tự nhắc người chưa trả lời, tự nhắc khoản chưa đóng, giảm theo dõi thủ công.
- Trial bắt đầu ngay khi tạo CLB (`clubs/service.ts`), trước khi host có buổi chơi thật. Nên đo thời gian tới buổi đầu và cân nhắc bắt đầu trial khi host chủ động thử tính năng Pro lần đầu. Đây là thay đổi chính sách cần chốt, không áp dụng hồi tố trong review.
- Sau khi hết Pro, các buổi đã tạo vẫn giữ. `requireClubAccess` hiện không kiểm tra subscription nên đồng quản lý đã có quyền vẫn tiếp tục làm việc; `grantAccess` yêu cầu Pro khi cấp/cập nhật quyền. Đây là hành vi hiện tại, không kết luận là lỗi. FAQ nên nói rõ điều này. Bổ sung nhắc việc tự động đang chạy là hướng tạo lý do gia hạn phù hợp hơn; không âm thầm thu hồi quyền đã cấp.
- Lịch lặp hiện tạo trước nhiều tuần và người dùng gia hạn bằng thao tác; chưa phải lịch tự duy trì vô hạn. Nếu quảng bá tự động vận hành liên tục, cần build cơ chế tạo tiếp và trạng thái chạy/dừng rõ ràng.
- Bổ sung nhắc sắp hết trial/Pro, mô tả cụ thể phần nào dừng và phần nào tiếp tục. Nâng cấp thành công cần quay lại đúng tác vụ đã bị chặn, giữ cấu hình người dùng đã nhập.

Nguồn: [tạo CLB](../../v2/src/server/modules/clubs/service.ts), [authorization](../../v2/src/server/access/permissions.ts), [cấp quyền](../../v2/src/server/modules/clubs/access.ts), [tạo lịch lặp](../../v2/src/server/modules/scheduling/service.ts), [UI lịch lặp](../../v2/src/features/scheduling/rule-list.tsx).

## Thứ tự triển khai

1. **Đợt 1 — giảm vướng ở Free:** điều hướng host mobile; chia sẻ link; dashboard công việc; hướng dẫn tiến trình buổi chơi và form rõ hơn. Thêm đo các bước quan trọng cùng đợt này.
2. **Đợt 2 — kết nối và quay lại:** link mời/yêu cầu kết nối hồ sơ; hộp thông báo nghiệp vụ cho hai phía; lưu lịch một buổi.
3. **Đợt 3 — MVP Pro:** nhắc RSVP, nhắc buổi và nhắc phí tự động; cấu hình, lịch sử gửi và xử lý hết hạn rõ ràng. Hoàn thiện trang lợi ích và luồng nâng cấp quay lại tác vụ.
4. **Đợt 4 — theo nhu cầu đã đo:** sửa hàng loạt lịch tương lai, báo cáo vận hành, nhập thành viên. Ưu tiên lại sau khi quan sát nhóm host dùng hàng tuần.

Nếu chỉ chọn một feature mới cho mỗi gói: **Free = kết nối CLB trong app có chủ CLB duyệt; Pro = nhắc RSVP/nhắc khoản đóng tự động.** Các sửa UX ở đợt 1 vẫn nên thực hiện trước hoặc song song.

## Đo để kiểm chứng

| Giả thuyết | Chỉ số cần thu |
| --- | --- |
| Host bắt đầu dùng dễ hơn | Tỷ lệ tạo CLB → tạo buổi đầu → có đăng ký đầu; thời gian giữa các bước |
| Kết nối hồ sơ ít bị bỏ dở | Tỷ lệ xác minh → gửi yêu cầu → được duyệt; thời gian chờ duyệt |
| Host bớt theo dõi thủ công | Thời gian xử lý đăng ký/biên nhận; số thao tác nhắc thủ công mỗi buổi |
| Pro tạo giá trị thường xuyên | CLB dùng nhắc tự động mỗi tuần, tỷ lệ RSVP trước hạn, khoản đến hạn còn thiếu; so sánh theo nhóm tương đồng |
| Có lý do nâng cấp và gia hạn | Bắt đầu dùng thử tính năng Pro → mua; tỷ lệ gia hạn sau kỳ trả phí đầu; lý do không gia hạn |

Thu sự kiện bằng ID nội bộ và loại hành động; không đưa số điện thoại, email, link riêng hoặc nội dung biên nhận vào analytics. Chưa đặt mục tiêu phần trăm khi chưa có baseline.

## Chưa ưu tiên

Chat riêng, bảng tin mạng xã hội, AI chia đội, giải đấu, native app và đối soát ngân hàng tự động là các hướng mở rộng chưa có bằng chứng nhu cầu từ review này. Trước mắt cần nối liền việc tổ chức, tham gia và thu khoản đóng đã có.

Phần review phía trên ghi nhận trạng thái trước triển khai. Ảnh có sẵn chỉ dùng tham khảo bố cục, không được coi là bằng chứng UI live hiện tại.

## Tiến độ triển khai sau review

Đợt UX đầu đã được triển khai trong workspace:

- Điều hướng host: sidebar desktop có trạng thái active; mobile có năm mục kèm nhãn, tài khoản/đăng xuất ở header và khoảng trống cho safe area. Khi URL có ngữ cảnh CLB, liên kết lịch/thành viên/thu chi giữ bộ lọc đó.
- Trang buổi chơi: sao chép link công khai, chia sẻ lời mời hoặc sao chép nội dung khi thiết bị không hỗ trợ chia sẻ; có cách sao chép thủ công khi clipboard bị chặn. Không chia sẻ link riêng của người chơi.
- Tiến trình buổi chơi: hướng dẫn bước kế tiếp theo trạng thái, điểm danh còn thiếu và quyền thu chi. Chốt sổ không được diễn giải là đã thu hết tiền.
- Dashboard: nhóm đăng ký cần duyệt, biên nhận chờ kiểm tra, buổi kết thúc còn cần điểm danh/phát hành và nợ đã phát hành/phí tháng chưa thu qua mọi kỳ. Quyền được kiểm tra riêng theo từng CLB; biên nhận chưa duyệt không được tính là tiền đã thu.
- Form tạo buổi: tách giá/cách tính phí, lịch lặp Pro và chính sách tham gia; giải thích số tiền đang chờ tính khi chọn chia chi phí. Giữ hợp đồng các trường POST hiện tại.

Không thay đổi schema, giá gói hay chính sách quyền khi hết Pro. Chưa triển khai đợt kết nối hồ sơ bằng lời mời, thông báo nghiệp vụ hoặc nhắc việc tự động.

Kiểm chứng: TypeScript và production build đã qua; 214/214 test trong 19 suite đã qua với PostgreSQL cục bộ thật, gồm bốn test mới về dashboard/phân quyền/công nợ. Lượt trình duyệt tổng đầu có 27/30 ca qua; hai ca UX mới lỗi cách tìm control trong test, một ca POST cũ bị ECONNRESET. Sau khi sửa cách tìm control, cả 4 ca UX/POST chạy riêng đã qua trên desktop/mobile (không retry). Phạm vi UX gồm clipboard thành công/bị chặn, chia sẻ bị hủy/thất bại, trạng thái tiến trình, liên kết tác vụ, các chiều rộng 375/812/1440px, reduced motion và cỡ chữ gốc 20px. Ảnh bố cục đã được xem trực tiếp. Các thay đổi admin đang có song song trong workspace không thuộc đợt UX này; kết quả build nêu trên áp dụng cho mã UX được kiểm chứng. Chưa deploy production.
