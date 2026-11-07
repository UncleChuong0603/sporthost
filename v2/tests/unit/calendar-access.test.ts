import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";

const mocks = vi.hoisted(() => ({ db: {}, gameActor: vi.fn(), guestContext: vi.fn() }));
vi.mock("@/server/db/client", () => ({ getDb: () => mocks.db }));
vi.mock("@/server/config", () => ({ getConfig: () => ({ origin: "https://sporthost.online" }) }));
vi.mock("@/server/modules/scheduling/service", () => ({ gameActor: mocks.gameActor }));
vi.mock("@/server/modules/bookings/guest", () => ({ guestContext: mocks.guestContext }));
import { hostCalendar, playerBookingCalendar } from "@/server/modules/scheduling/calendar";

const context = () => ({
  game: { id: 42, publicId: "public-game", title: "Cầu lông", startsAt: "2026-11-08T19:00", venue: "Sân A", isCancelled: false, fixedFee: 91037 },
  club: { name: "CLB", bankName: "private-bank-marker", accountNumber: "private-account-marker" },
  booking: { id: 99, status: "confirmed", accessKey: "private-capability-marker" },
  member: { name: "private-player-marker", phone: "private-phone-marker" },
});
beforeEach(() => { vi.clearAllMocks(); mocks.gameActor.mockResolvedValue(context()); mocks.guestContext.mockResolvedValue(context()); });

describe("authorized private calendar downloads", () => {
  it("requires normal host view access without granting finance access", async () => {
    const response = await hostCalendar(7, 42);
    expect(mocks.gameActor).toHaveBeenCalledWith(mocks.db, 7, 42, "view");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="sporthost-game-42.ics"');
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("never serializes contact, bank, fee or private attendance-link data", async () => {
    const body = await (await playerBookingCalendar({ accountId: 7, bookingId: 99 })).text();
    for (const marker of ["private-bank-marker", "private-account-marker", "private-capability-marker", "private-player-marker", "private-phone-marker", "91037", "/attend/"]) expect(body).not.toContain(marker);
    expect(body).toContain("/join/public-game");
    expect(mocks.guestContext).toHaveBeenCalledWith(mocks.db, { accountId: 7, bookingId: 99 });
  });
  it("enforces the existing token/expiry/revocation check for guests", async () => {
    await playerBookingCalendar("guest-capability");
    expect(mocks.guestContext).toHaveBeenCalledWith(mocks.db, "guest-capability");
    mocks.guestContext.mockRejectedValueOnce(new AppError(404, "Revoked"));
    await expect(playerBookingCalendar("revoked-capability")).rejects.toMatchObject({ status: 404 });
  });
  it("propagates revoked host access and foreign/unlinked/unverified account denials", async () => {
    mocks.gameActor.mockRejectedValueOnce(new AppError(404, "Not allowed"));
    await expect(hostCalendar(8, 42)).rejects.toMatchObject({ status: 404 });
    mocks.guestContext.mockRejectedValueOnce(new AppError(404, "Not linked"));
    await expect(playerBookingCalendar({ accountId: 8, bookingId: 99 })).rejects.toMatchObject({ status: 404 });
  });
  it.each(["invited", "pending", "waitlist", "rejected", "cancelled"])("rejects a %s registration instead of claiming a confirmed seat", async status => {
    const row = context(); row.booking.status = status; mocks.guestContext.mockResolvedValueOnce(row);
    await expect(playerBookingCalendar({ accountId: 7, bookingId: 99 })).rejects.toMatchObject({ status: 409 });
  });
  it("rejects a cancelled session for players and exports its cancelled status for hosts", async () => {
    const row = context(); row.game.isCancelled = true;
    mocks.guestContext.mockResolvedValueOnce(row); mocks.gameActor.mockResolvedValueOnce(row);
    await expect(playerBookingCalendar({ accountId: 7, bookingId: 99 })).rejects.toMatchObject({ status: 409 });
    expect(await (await hostCalendar(7, 42)).text()).toContain("STATUS:CANCELLED");
  });
});
