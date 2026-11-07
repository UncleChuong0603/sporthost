// Session fields store Vietnam wall time, not the viewer's browser timezone.
const vietnamDateTime = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function dateTimeText(value: string) {
  if (!value) return "Chưa có thời gian";
  const normalized = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? value.replace(" ", "T") + "+07:00" : value;
  const date = new Date(normalized);
  return Number.isNaN(date.valueOf()) ? "Thời gian chưa hợp lệ" : vietnamDateTime.format(date);
}
export function periodText(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? `${value.slice(5)}/${value.slice(0, 4)}` : value;
}
export function dateText(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("/") : periodText(value);
}
