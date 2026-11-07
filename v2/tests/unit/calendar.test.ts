import { describe, expect, it } from "vitest";
import { sessionCalendar, type CalendarSession } from "@/domain/calendar";

const game: CalendarSession = { publicId: "public-game-123", title: "Cầu lông cuối tuần", clubName: "CLB SportHost", startsAt: "2026-11-08T06:30", venue: "Sân số 2", isCancelled: false };
const now = new Date("2026-11-07T12:34:56.789Z");
const calendar = (overrides: Partial<CalendarSession> = {}) => sessionCalendar({ ...game, ...overrides }, "https://sporthost.online", now);
const unfold = (value: string) => value.replace(/\r\n /g, "");

describe("portable session calendar", () => {
  it("converts Vietnam wall time to UTC across the date boundary and omits an unknown end time", () => {
    const value = calendar();
    expect(value).toContain("DTSTART:20261107T233000Z\r\n");
    expect(value).toContain("DTSTAMP:20261107T123456Z\r\n");
    expect(value).toContain("STATUS:CONFIRMED\r\n");
    expect(value).toContain("URL:https://sporthost.online/join/public-game-123\r\n");
    expect(value).not.toMatch(/DTEND|DURATION|ATTENDEE|ORGANIZER|METHOD:/);
    expect(value.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(value.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
  it("folds every physical line to 75 UTF-8 octets without corrupting Vietnamese or emoji", () => {
    const title = "Buổi chơi 🏸 cùng những người bạn Việt Nam ".repeat(8);
    const value = calendar({ title });
    for (const line of value.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    expect(unfold(value)).toContain(`SUMMARY:${title}\r\n`);
    expect(Buffer.from(value, "utf8").toString("utf8")).toBe(value);
  });
  it("escapes CRLF injection, delimiters and control characters in user-provided text", () => {
    const value = unfold(calendar({ title: "Test\r\nATTENDEE:evil@example.com", venue: "Sân, A; B\\C\u0000" }));
    expect(value).toContain("SUMMARY:Test\\nATTENDEE:evil@example.com\r\n");
    expect(value).toContain("LOCATION:Sân\\, A\\; B\\\\C\r\n");
    expect(value.split("\r\n").some(line => line.startsWith("ATTENDEE:"))).toBe(false);
    expect(value).not.toContain("\u0000");
  });
  it("uses a stable session UID across edits and cancellation", () => {
    const uid = (value: string) => value.split("\r\n").find(line => line.startsWith("UID:"));
    const cancelled = calendar({ title: "Đổi tên buổi chơi", startsAt: "2026-11-10T19:00", isCancelled: true });
    expect(uid(cancelled)).toBe(uid(calendar()));
    expect(cancelled).toContain("STATUS:CANCELLED\r\n");
  });
  it("encodes untrusted public IDs as one path segment and one UID line", () => {
    const value = unfold(calendar({ publicId: "id/\r\nATTENDEE:evil" }));
    expect(value).toContain("URL:https://sporthost.online/join/id%2F%0D%0AATTENDEE%3Aevil\r\n");
    expect(value.split("\r\n").some(line => line.startsWith("ATTENDEE:"))).toBe(false);
  });
  it("refuses impossible local dates and invalid origins", () => {
    for (const startsAt of ["2026-02-30T18:00", "2026-11-08T24:00", "2026-11-08T06:30Z", "garbage"]) expect(() => calendar({ startsAt })).toThrow();
    for (const origin of ["javascript:alert(1)", "https://user:pass@sporthost.online"]) expect(() => sessionCalendar(game, origin, now)).toThrow();
  });
});
