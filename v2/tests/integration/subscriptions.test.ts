import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { APIError, PayOS, type PaymentLink, type WebhookData } from "@payos/node";
import { installTestEnv } from "./environment";
import { signup } from "@/server/auth/service";
import { createClub } from "@/server/modules/clubs/service";
import { grantAccess } from "@/server/modules/clubs/access";
import { deleteClub } from "@/server/modules/clubs/deletion";
import { getPool, closePool } from "@/server/db/client";
import * as payos from "@/server/infrastructure/payos";
import { checkoutPro, refreshPayment, cancelPayment, receivePaymentWebhook, subscriptionDetails } from "@/server/modules/subscriptions/service";
import { POST } from "@/app/api/webhooks/payos/route";

const prefix = "payment-test-" + randomBytes(6).toString("hex");
const clubs: number[] = []; const hosts: number[] = [];
const remote = new Map<number, PaymentLink>();
const sdk = new PayOS({ clientId: "synthetic-client", apiKey: "synthetic-api", checksumKey: "synthetic-checksum", logLevel: "off" });
let owner: number, other: number, cohost: number;
const create = vi.spyOn(sdk.paymentRequests, "create").mockImplementation(async input => {
  if (!remote.has(input.orderCode)) remote.set(input.orderCode, { id: "link-" + input.orderCode, orderCode: input.orderCode, amount: input.amount, amountPaid: 0, amountRemaining: input.amount, status: "PENDING", createdAt: new Date().toISOString(), canceledAt: null, cancellationReason: null, transactions: [] });
  const payment = remote.get(input.orderCode)!;
  return { amount: input.amount, orderCode: input.orderCode, paymentLinkId: payment.id, currency: "VND", status: "PENDING", checkoutUrl: `https://pay.payos.vn/web/${payment.id}`, bin: "970422", accountName: "SYNTHETIC", accountNumber: "123", description: input.description, qrCode: "synthetic" };
});
const get = vi.spyOn(sdk.paymentRequests, "get").mockImplementation(async code => {
  const payment = remote.get(Number(code)); if (!payment) throw Error("Synthetic missing payment"); return { ...payment };
});
vi.spyOn(sdk.paymentRequests, "cancel").mockImplementation(async code => {
  const payment = remote.get(Number(code))!; if (payment.status !== "PAID") payment.status = "CANCELLED"; return { ...payment };
});
async function club() { const value = await createClub(owner, { name: prefix }); clubs.push(value.id); return value.id; }
async function latest(clubId: number) { return (await subscriptionDetails(owner, clubId)).orders[0]; }
function paid(code: number) { const payment = remote.get(code)!; payment.status = "PAID"; payment.amountPaid = payment.amount; payment.amountRemaining = 0; }
async function event(code: number) {
  const payment = remote.get(code);
  const data: WebhookData = { orderCode: code, amount: payment?.amount || 49000, paymentLinkId: payment?.id || "probe", currency: "VND", code: "00", description: "SPORTHOST PRO", accountNumber: "synthetic", reference: "reference-" + code, transactionDateTime: "2026-11-04 12:00:00", desc: "success" };
  return { code: "00", success: true, desc: "success", data, signature: (await sdk.crypto.createSignatureFromObj(data, sdk.checksumKey))! };
}
beforeAll(async () => {
  installTestEnv();
  vi.stubEnv("PAYOS_CLIENT_ID", "synthetic-client"); vi.stubEnv("PAYOS_API_KEY", "synthetic-api"); vi.stubEnv("PAYOS_CHECKSUM_KEY", "synthetic-checksum");
  vi.spyOn(payos, "getPayOS").mockReturnValue(sdk);
  for (const role of ["owner", "other", "cohost"]) hosts.push((await signup(prefix + role + "@example.com", "synthetic-password-123")).id);
  [owner, other, cohost] = hosts;
});
afterAll(async () => {
  if (hosts.length) {
    await getPool().query("DELETE FROM clubhost.platform_ledger_entries WHERE created_by=ANY($1::int[])", [hosts]);
    await getPool().query("DELETE FROM clubhost.audit_logs WHERE host_id=ANY($1::int[])", [hosts]);
    await getPool().query("DELETE FROM clubhost.payment_orders WHERE host_id=ANY($1::int[])", [hosts]);
    await getPool().query("DELETE FROM clubhost.club_access WHERE club_id=ANY($1::int[])", [clubs]);
    await getPool().query("DELETE FROM clubhost.clubs WHERE id=ANY($1::int[])", [clubs]);
    await getPool().query("DELETE FROM clubhost.hosts WHERE id=ANY($1::int[])", [hosts]);
  }
  vi.restoreAllMocks(); vi.unstubAllEnvs(); await closePool();
});
describe("payOS orders, activation and safety", () => {
  it("grants exactly seven days to new clubs and restricts billing to owners", async () => {
    const id = await club(); const details = await subscriptionDetails(owner, id);
    expect(details.state).toMatchObject({ kind: "TRIAL", daysLeft: 7 });
    await grantAccess(owner, id, prefix + "cohost@example.com", "manager", []);
    await expect(checkoutPro(other, id)).rejects.toMatchObject({ status: 404 });
    await expect(checkoutPro(cohost, id)).rejects.toMatchObject({ status: 403 });
    await expect(subscriptionDetails(other, id)).rejects.toMatchObject({ status: 404 });
    await getPool().query("UPDATE clubhost.clubs SET trial_ends_at=NULL WHERE id=$1", [id]);
    await expect(grantAccess(owner, id, prefix + "cohost@example.com", "finance", [])).rejects.toMatchObject({ code: "pro_required" });
  });
  it("reuses a single order for simultaneous checkout clicks, with a server-owned price", async () => {
    const id = await club();
    const links = await Promise.all([checkoutPro(owner, id), checkoutPro(owner, id)]);
    expect(links[0]).toBe(links[1]);
    const details = await subscriptionDetails(owner, id);
    expect(details.orders).toHaveLength(1);
    expect(details.orders[0]).toMatchObject({ amount: 49000, originalAmount: 99000, periodDays: 30, status: "PENDING" });
    await expect(refreshPayment(other, id, details.orders[0].orderCode)).rejects.toMatchObject({ status: 404 });
  });
  it("never activates from partial, mismatched or fabricated payment data", async () => {
    const id = await club(); await checkoutPro(owner, id); const order = await latest(id);
    const payment = remote.get(order.orderCode)!;
    payment.status = "UNDERPAID"; payment.amountPaid = 1000;
    expect((await refreshPayment(owner, id, order.orderCode)).status).toBe("PENDING");
    payment.status = "PAID";
    await expect(refreshPayment(owner, id, order.orderCode)).rejects.toMatchObject({ code: "payment_mismatch" });
    paid(order.orderCode); payment.amount = 1;
    await expect(refreshPayment(owner, id, order.orderCode)).rejects.toMatchObject({ code: "payment_mismatch" });
    payment.amount = order.amount; payment.id = "wrong-link";
    await expect(refreshPayment(owner, id, order.orderCode)).rejects.toMatchObject({ code: "payment_mismatch" });
    const payload = await event(order.orderCode); payload.signature = "0".repeat(64);
    await expect(receivePaymentWebhook(payload)).rejects.toMatchObject({ status: 400 });
    expect((await subscriptionDetails(owner, id)).club.proEndsAt).toBeNull();
  });
  it("activates and journals exactly once across duplicate webhooks, refreshes and cancellation", async () => {
    const id = await club(); const trialEnd = (await subscriptionDetails(owner, id)).club.trialEndsAt!;
    await checkoutPro(owner, id); const order = await latest(id); paid(order.orderCode);
    const payload = await event(order.orderCode);
    await Promise.all([receivePaymentWebhook(payload), receivePaymentWebhook(payload), refreshPayment(owner, id, order.orderCode), cancelPayment(owner, id, order.orderCode)]);
    const details = await subscriptionDetails(owner, id);
    expect(details.orders[0].status).toBe("PAID");
    expect(Date.parse(details.club.proEndsAt!) - Date.parse(trialEnd)).toBe(30 * 86400000);
    expect((await getPool().query("SELECT amount FROM clubhost.platform_ledger_entries WHERE request_key=$1", ["payos:" + order.orderCode])).rows).toEqual([{ amount: 49000 }]);
    expect((await getPool().query("SELECT id FROM clubhost.audit_logs WHERE club_id=$1 AND action='Kích hoạt SportHost Pro'", [id])).rowCount).toBe(1);
    await checkoutPro(owner, id); const renewal = await latest(id); paid(renewal.orderCode);
    await refreshPayment(owner, id, renewal.orderCode);
    expect(Date.parse((await subscriptionDetails(owner, id)).club.proEndsAt!) - Date.parse(trialEnd)).toBe(60 * 86400000);
  });
  it("recovers a provider success followed by timeout using the original order code", async () => {
    const id = await club(); const original = create.getMockImplementation()!;
    create.mockImplementationOnce(async (...args) => { await original(...args); throw Error("Synthetic lost response"); });
    expect(await checkoutPro(owner, id)).toMatch(/^https:\/\/pay\.payos\.vn\//);
    expect((await subscriptionDetails(owner, id)).orders).toHaveLength(1);
  });
  it("retires an expired reservation only after payOS explicitly confirms the code is missing", async () => {
    const id = await club();
    create.mockRejectedValueOnce(new Error("Synthetic unavailable"));
    await expect(checkoutPro(owner, id)).rejects.toMatchObject({ code: "payment_unavailable" });
    const order = await latest(id);
    await getPool().query("UPDATE clubhost.payment_orders SET expires_at=now()-interval '1 minute' WHERE order_code=$1", [order.orderCode]);
    create.mockRejectedValueOnce(new Error("Synthetic expired creation"));
    get.mockRejectedValueOnce(new APIError(200, { code: "101", desc: "Synthetic payment not found" }, undefined, new Headers()));
    await expect(checkoutPro(owner, id)).rejects.toMatchObject({ code: "payment_unavailable" });
    expect((await latest(id)).status).toBe("EXPIRED");
    await checkoutPro(owner, id);
    expect((await latest(id)).orderCode).not.toBe(order.orderCode);
  });
  it("allows a new order after confirmed cancellation or expiry and retains paid orders after club deletion", async () => {
    const id = await club(); await checkoutPro(owner, id); const first = await latest(id);
    expect((await cancelPayment(owner, id, first.orderCode)).status).toBe("CANCELLED");
    await checkoutPro(owner, id); const second = await latest(id); expect(second.orderCode).not.toBe(first.orderCode);
    remote.get(second.orderCode)!.status = "EXPIRED";
    expect((await refreshPayment(owner, id, second.orderCode)).status).toBe("EXPIRED");
    await checkoutPro(owner, id); const third = await latest(id); paid(third.orderCode); await refreshPayment(owner, id, third.orderCode);
    await deleteClub(owner, id, prefix);
    expect((await getPool().query("SELECT club_id,status FROM clubhost.payment_orders WHERE order_code=$1", [third.orderCode])).rows[0]).toEqual({ club_id: null, status: "PAID" });
  });
  it("acknowledges only signed registration probes and rejects malformed or oversized webhook bodies", async () => {
    await expect(receivePaymentWebhook(await event(123))).resolves.toBeUndefined();
    const malformed = await POST(new Request("http://localhost/api/webhooks/payos", { method: "POST", body: "{" })); expect(malformed.status).toBe(400);
    const oversized = await POST(new Request("http://localhost/api/webhooks/payos", { method: "POST", body: "x".repeat(32769) })); expect(oversized.status).toBe(413);
    const response = await POST(new Request("http://localhost/api/webhooks/payos", { method: "POST", body: JSON.stringify(await event(123)) })); expect(response.status).toBe(200);
  });
  it("refuses all writes in read-only mode before calling payOS", async () => {
    const id = await club(); const count = create.mock.calls.length; const getCount = get.mock.calls.length;
    vi.stubEnv("APP_READ_ONLY", "true");
    try { await expect(checkoutPro(owner, id)).rejects.toMatchObject({ code: "read_only" }); }
    finally { vi.stubEnv("APP_READ_ONLY", "false"); }
    expect(create.mock.calls).toHaveLength(count); expect(get.mock.calls).toHaveLength(getCount);
  });
});
