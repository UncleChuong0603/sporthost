// Current province-level names, checked 2026-11-04 against the Government Portal:
// https://vanban.chinhphu.vn/thong-tin-tinh-thanh
// Store names without administrative prefixes so a change from province to city
// does not change the club's saved location.
export const vietnamProvinces = [
  "An Giang", "Bắc Ninh", "Cà Mau", "Cao Bằng", "Cần Thơ", "Đà Nẵng",
  "Đắk Lắk", "Điện Biên", "Đồng Nai", "Đồng Tháp", "Gia Lai", "Hà Nội",
  "Hà Tĩnh", "Hải Phòng", "Hồ Chí Minh", "Huế", "Hưng Yên", "Khánh Hòa",
  "Lai Châu", "Lâm Đồng", "Lạng Sơn", "Lào Cai", "Nghệ An", "Ninh Bình",
  "Phú Thọ", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị", "Sơn La", "Tây Ninh",
  "Thái Nguyên", "Thanh Hóa", "Tuyên Quang", "Vĩnh Long",
] as const;

export function isVietnamProvince(value: string) {
  return vietnamProvinces.some(province => province === value);
}

export function searchProvinces(query: string) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim().replace(/\s+/g, " ");
  const search = normalize(query);
  return vietnamProvinces.filter(province => normalize(province).includes(search));
}
