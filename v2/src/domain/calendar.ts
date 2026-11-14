import { validLocalTime } from "./session-policy";

export type CalendarSession = {
  publicId: string;
  title: string;
  clubName: string;
  startsAt: string;
  venue: string;
  isCancelled: boolean;
};

function calendarText(value: string) {
  return value.replace(/\r\n|\r/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

// RFC 5545 limits physical lines to 75 octets, including continuation spaces.
// Fold between code points so Vietnamese text survives imports unchanged.
function foldLine(value: string) {
  const lines: string[] = [];
  let line = "", bytes = 0;
  for (const char of value) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > 75) { lines.push(line); line = " "; bytes = 1; }
    line += char; bytes += size;
  }
  lines.push(line);
  return lines.join("\r\n");
}

export function sessionCalendar(game: CalendarSession, origin: string, now = new Date()) {
  if (!validLocalTime(game.startsAt) || !game.publicId || !Number.isFinite(now.valueOf())) throw new Error("Invalid calendar session");
  const base = new URL(origin);
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) throw new Error("Invalid calendar origin");
  const link = new URL(`/join/${encodeURIComponent(game.publicId)}`, base).href;
  const timestamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  // Sessions store Vietnam wall time. Export UTC so imports work in any timezone.
  // No end time is stored: do not invent a duration or claim a court reservation.
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SportHost//Session Calendar//VI", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${encodeURIComponent(game.publicId)}@${base.hostname}`,
    `DTSTAMP:${timestamp(now)}`, `DTSTART:${timestamp(new Date(game.startsAt + ":00+07:00"))}`,
    `SUMMARY:${calendarText(game.title)}`, `LOCATION:${calendarText(game.venue)}`,
    `DESCRIPTION:${calendarText(`${game.clubName}\nGiờ buổi chơi theo Việt Nam (UTC+7).\nKiểm tra SportHost để xem lịch và trạng thái mới nhất.\n${link}`)}`,
    `URL:${link}`, `STATUS:${game.isCancelled ? "CANCELLED" : "CONFIRMED"}`, "TRANSP:OPAQUE",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
