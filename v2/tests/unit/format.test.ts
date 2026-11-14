import { describe, expect, it } from "vitest";
import { dateTimeText, dateText, periodText } from "@/domain/format";

describe("Vietnamese display time", () => {
  it("keeps Vietnam session wall time without depending on the machine timezone", () => {
    expect(dateTimeText("2026-11-07T19:30")).toContain("19:30");
    expect(dateTimeText("2026-11-07T19:30")).toContain("07/11/2026");
    expect(dateTimeText("2026-11-07T12:30:00Z")).toBe(dateTimeText("2026-11-07T19:30"));
    expect(dateTimeText("2026-11-07 19:30:00")).toBe(dateTimeText("2026-11-07T19:30"));
  });
  it("handles an empty or invalid timestamp without exposing Invalid Date", () => {
    expect(dateTimeText("")).toBe("Chưa có thời gian");
    expect(dateTimeText("invalid")).toBe("Thời gian chưa hợp lệ");
  });
  it("formats periods without reinterpreting invalid legacy values", () => {
    expect(periodText("2026-11")).toBe("11/2026");
    expect(periodText("2026-13")).toBe("2026-13");
    expect(dateText("2026-11-07")).toBe("07/11/2026");
    expect(dateText("2026-11")).toBe("11/2026");
  });
});
