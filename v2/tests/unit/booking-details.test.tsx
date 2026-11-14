import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BookingDecision, SessionDetails } from "@/features/bookings/session-details";

const details = { skillGuidance: "", venueInstructions: "", mapsUrl: "", registrationDeadline: null, cancellationDeadline: null, participationConditions: "", cancellationPolicy: "" };
describe("player decision and session information", () => {
  it("shows the host's rejection explanation as text, including hostile HTML", () => {
    const html = renderToStaticMarkup(<BookingDecision status="rejected" reason={'Sai trình độ <script>alert(1)</script>'} cancelled={false} />);
    expect(html).toContain("Ghi chú từ host"); expect(html).toContain("Sai trình độ &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("explains that a waitlisted/pending registration has no confirmed seat", () => {
    for (const status of ["pending", "waitlist"]) expect(renderToStaticMarkup(<BookingDecision status={status} reason="" cancelled={false} />)).toContain("chưa có chỗ được xác nhận");
    expect(renderToStaticMarkup(<BookingDecision status="confirmed" reason="Old rejection" cancelled={false} />)).toBe("");
    expect(renderToStaticMarkup(<BookingDecision status="confirmed" reason="" cancelled={true} />)).toContain("Buổi chơi đã hủy");
  });
  it("shows venue instructions, policy and deadlines with the timezone", () => {
    const html = renderToStaticMarkup(<SessionDetails game={{ ...details, venueInstructions: "Cổng sau", cancellationPolicy: "Hủy trước 12 giờ", cancellationDeadline: "2026-11-08T17:00", rsvpDeadline: "2026-11-07T19:00", mapsUrl: "https://maps.app.goo.gl/example" }} />);
    for (const text of ["Cổng sau", "Hủy trước 12 giờ", "17:00 08/11/2026", "Hạn trả lời lời mời", "UTC+7", "Mở bản đồ đến sân"]) expect(html).toContain(text);
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it("omits empty details and unsafe map URLs from legacy data", () => {
    expect(renderToStaticMarkup(<SessionDetails game={details} />)).toBe("");
    for (const mapsUrl of ["javascript:alert(1)", "https://evil.example/maps", "https://user:password@maps.google.com/"]) expect(renderToStaticMarkup(<SessionDetails game={{ ...details, mapsUrl }} />)).toBe("");
  });
  it("displays the accepted cancellation snapshot after the host changes session defaults", () => {
    const html = renderToStaticMarkup(<SessionDetails game={{ ...details, startsAt: "2026-11-08T19:00", cancellationPolicy: "New policy", cancellationDeadline: "2026-11-08T15:00", policy: { cancellation_policy: "Accepted policy", cancellation_deadline: "2026-11-08T17:00" } }} />);
    expect(html).toContain("Accepted policy"); expect(html).toContain("17:00 08/11/2026");
    expect(html).not.toContain("New policy"); expect(html).not.toContain("15:00");
    expect(renderToStaticMarkup(<SessionDetails game={{ ...details, startsAt: "2026-11-08T19:00" }} />)).toContain("19:00 08/11/2026");
  });
});
