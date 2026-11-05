export const VIDEO = {id:'SportHostVertical', width:1080, height:1920, fps:30, seconds:43, frames:1290};
export const BRAND = {
  teal:'#087f6b', dark:'#142d35', ink:'#182d35', muted:'#536570',
  mint:'#b8e6d9', acid:'#d7ff8a', paper:'#f3f6f8', white:'#ffffff',
  url:'sporthost.online',
};
export const CUTS = [150,300,420,555,690,825,960,1140];
export const FEATURES = [
  {from:420, duration:135, index:'01', label:'THÀNH VIÊN', lines:['Cố định hay vãng lai,','đều dễ quản lý.'], subtitle:'Thông tin người chơi trong một danh sách.', screen:'members', badge:'Lọc theo loại thành viên', light:false},
  {from:555, duration:135, index:'02', label:'LỊCH CHƠI', lines:['Rõ lịch hẹn.','Sẵn sàng lên sân.'], subtitle:'Tạo buổi chơi, chọn giờ, sân và số chỗ.', screen:'schedule', badge:'Lịch chơi trong tầm tay', light:true},
  {from:690, duration:135, index:'03', label:'ĐIỂM DANH', lines:['Ai đã đến sân?','Theo dõi dễ dàng.'], subtitle:'Xác nhận có mặt ngay trên danh sách.', screen:'attendance', badge:'Có mặt · Vắng mặt · Về sớm', light:false},
  {from:825, duration:135, index:'04', label:'THU CHI', lines:['Từng khoản đóng.','Rõ ràng hơn.'], subtitle:'Theo dõi khoản đã thu và còn cần thu.', screen:'finance', badge:'QR nhận tiền · Gửi biên nhận¹', light:true},
] as const;
