export const sports = { badminton: "Cầu lông", pickleball: "Pickleball", tennis: "Quần vợt", football: "Bóng đá", volleyball: "Bóng chuyền", basketball: "Bóng rổ", table_tennis: "Bóng bàn" } as const;
export const genderLabels = { male: "Nam", female: "Nữ", unspecified: "Chưa cập nhật" } as const;
export type Gender = keyof typeof genderLabels;
export const moneyText = (amount: number) => new Intl.NumberFormat("vi-VN").format(amount) + "đ";
export function normalizePhone(raw: string) {
  let phone = raw.trim().replace(/[\s.\-()]/g, "");
  if (!/^\+?[0-9]{9,15}$/.test(phone)) throw new Error("Số điện thoại chưa hợp lệ.");
  if (/^(?:\+84|84)[35789][0-9]{8}$/.test(phone)) phone = "0" + phone.slice(-9);
  return phone;
}
export function phoneAliases(phone: string) { return /^0[35789][0-9]{8}$/.test(phone) ? [phone, "+84" + phone.slice(1), "84" + phone.slice(1)] : [phone]; }
