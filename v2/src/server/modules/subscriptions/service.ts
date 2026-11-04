import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, desc, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { APIError, type PaymentLink } from "@payos/node";
import { z } from "zod";
import { getDb, transaction } from "@/server/db/client";
import { paymentOrders as orders } from "@/server/db/payment-schema";
import { clubsInClubhost as clubs, platformLedgerEntriesInClubhost as ledger } from "@/server/db/schema";
import { getConfig } from "@/server/config";
import { getPayOS, safeCheckoutUrl } from "@/server/infrastructure/payos";
import { requireClubAccess } from "@/server/access/permissions";
import { auditChange } from "@/server/modules/bookings/core";
import { AppError } from "@/server/errors";
import { PRO_PRICE, PRO_ORIGINAL_PRICE, PRO_PERIOD_DAYS, extendedProEnd, subscriptionState } from "@/domain/subscription";

type Order = typeof orders.$inferSelect;
const active = ["CREATING", "PENDING"];
const providerUnavailable = () => new AppError(503, "Chưa kết nối được payOS. Vui lòng kiểm tra trạng thái đơn trước khi thử lại.", "payment_unavailable");
export function subscriptionPath(clubId: number) { return `/clubs/${clubId}/subscription`; }

export async function subscriptionDetails(hostId: number, clubId: number) {
  const { club } = await requireClubAccess(getDb(), hostId, clubId, "owner");
  const history = await getDb().select().from(orders).where(eq(orders.clubId, clubId)).orderBy(desc(orders.createdAt)).limit(50);
  return { club, state: subscriptionState(club), orders: history };
}

async function ownedOrder(hostId: number, clubId: number, orderCode: number) {
  await requireClubAccess(getDb(), hostId, clubId, "owner");
  if (!Number.isSafeInteger(orderCode) || orderCode <= 0) throw new AppError(400, "Mã đơn chưa hợp lệ.");
  const [order] = await getDb().select().from(orders).where(and(eq(orders.orderCode, orderCode), eq(orders.clubId, clubId)));
  if (!order) throw new AppError(404, "Không tìm thấy đơn thanh toán.");
  return order;
}

// All entry points (webhook, return polling, manual refresh and cancel) converge
// here. Lock club before order; never hold a database lock during provider I/O.
async function applyProviderPayment(order: Order, payment: PaymentLink) {
  if (payment.orderCode !== order.orderCode || payment.amount !== order.amount || !payment.id || (order.paymentLinkId && payment.id !== order.paymentLinkId)) {
    throw new AppError(409, "Thông tin giao dịch không khớp đơn thanh toán.", "payment_mismatch");
  }
  if (payment.status === "PAID" && (!Number.isSafeInteger(payment.amountPaid) || payment.amountPaid < order.amount || payment.amountRemaining > 0)) {
    throw new AppError(409, "Giao dịch chưa thanh toán đủ số tiền.", "payment_mismatch");
  }
  return transaction(async client => {
    const db = drizzle(client);
    const [club] = order.clubId === null ? [] : await db.select().from(clubs).where(eq(clubs.id, order.clubId)).for("update");
    const [current] = await db.select().from(orders).where(eq(orders.orderCode, order.orderCode)).for("update");
    if (!current) throw new AppError(404, "Không tìm thấy đơn thanh toán.");
    if (current.paymentLinkId && payment.id !== current.paymentLinkId) throw new AppError(409, "Giao dịch không khớp.");
    if (current.status === "PAID") return current;
    const now = new Date();
    if (payment.status === "PAID") {
      const activatedUntil = club ? extendedProEnd(club, current.periodDays, now) : null;
      if (club) await db.update(clubs).set({ proEndsAt: activatedUntil }).where(eq(clubs.id, club.id));
      const [updated] = await db.update(orders).set({ status: "PAID", paymentLinkId: payment.id, paidAt: now.toISOString(), activatedUntil }).where(eq(orders.orderCode, current.orderCode)).returning();
      await db.insert(ledger).values({ entryDate: now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }), direction: "INCOME", category: "SportHost Pro", amount: current.amount,
        note: `payOS #${current.orderCode} · ${current.clubName} · ${current.periodDays} ngày${club ? "" : " · CLB đã xóa, cần hỗ trợ"}`, createdBy: current.hostId, createdAt: now.toISOString(), version: 0, requestKey: `payos:${current.orderCode}` });
      await auditChange(db, club?.id ?? null, current.hostId, club ? "Kích hoạt SportHost Pro" : "Thanh toán Pro cho CLB đã xóa", null,
        { order_code: current.orderCode, amount: current.amount, period_days: current.periodDays, pro_ends_at: activatedUntil });
      return updated;
    }
    // A delayed PENDING response must never undo cancellation/expiry or payment.
    if (!active.includes(current.status)) return current;
    const status = payment.status === "CANCELLED" ? "CANCELLED" : payment.status === "EXPIRED" || payment.status === "FAILED" ? "EXPIRED" : "PENDING";
    const [updated] = await db.update(orders).set({ status, paymentLinkId: payment.id, checkoutUrl: safeCheckoutUrl(`https://pay.payos.vn/web/${encodeURIComponent(payment.id)}`) }).where(eq(orders.orderCode, current.orderCode)).returning();
    return updated;
  });
}

async function fetchPayment(order: Order) {
  try { return await getPayOS().paymentRequests.get(order.orderCode); }
  catch { throw providerUnavailable(); }
}

export async function refreshPayment(hostId: number, clubId: number, orderCode: number) {
  const order = await ownedOrder(hostId, clubId, orderCode);
  if (order.status === "PAID") return order;
  return applyProviderPayment(order, await fetchPayment(order));
}

export async function checkoutPro(hostId: number, clubId: number) {
  const provider = getPayOS();
  const order = await transaction(async client => {
    const db = drizzle(client);
    await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId)).for("update");
    const { club } = await requireClubAccess(db, hostId, clubId, "owner");
    const [existing] = await db.select().from(orders).where(and(eq(orders.clubId, clubId), inArray(orders.status, active)));
    if (existing) return existing;
    // 15 digits, safely within the payOS/JavaScript integer range; no timestamp collisions.
    const [created] = await db.insert(orders).values({ orderCode: randomInt(100_000_000_000_000, 281_474_976_710_655), clubId, hostId, clubName: club.name,
      amount: PRO_PRICE, originalAmount: PRO_ORIGINAL_PRICE, periodDays: PRO_PERIOD_DAYS, status: "CREATING", expiresAt: new Date(Date.now() + 15 * 60000).toISOString() }).returning();
    return created;
  });
  const path = subscriptionPath(clubId);
  if (order.status === "PENDING") {
    const updated = await applyProviderPayment(order, await fetchPayment(order));
    return updated.status === "PENDING" && updated.checkoutUrl ? safeCheckoutUrl(updated.checkoutUrl) : path;
  }
  const origin = getConfig().origin;
  try {
    const result = await provider.paymentRequests.create({ orderCode: order.orderCode, amount: order.amount, description: "SPORTHOST PRO",
      items: [{ name: `SportHost Pro ${order.periodDays} ngày`, quantity: 1, price: order.amount }],
      returnUrl: `${origin}${path}?payment=return&orderCode=${order.orderCode}`,
      cancelUrl: `${origin}${path}?payment=cancel&orderCode=${order.orderCode}`, expiredAt: Math.floor(Date.parse(order.expiresAt) / 1000) });
    if (result.orderCode !== order.orderCode || result.amount !== order.amount || result.currency !== "VND" || !result.paymentLinkId) throw new AppError(409, "Thông tin giao dịch không khớp.");
    const checkoutUrl = safeCheckoutUrl(result.checkoutUrl);
    const updated = await transaction(async client => {
      const db = drizzle(client);
      const [current] = await db.select().from(orders).where(eq(orders.orderCode, order.orderCode)).for("update");
      if (current.status !== "CREATING") return current;
      const [saved] = await db.update(orders).set({ status: "PENDING", paymentLinkId: result.paymentLinkId, checkoutUrl }).where(eq(orders.orderCode, order.orderCode)).returning();
      return saved;
    });
    return updated.status === "PENDING" ? safeCheckoutUrl(updated.checkoutUrl!) : path;
  } catch (error) {
    // Timeout or concurrent create may have succeeded remotely. Recover the same
    // order code; never generate a second payable order on an ambiguous failure.
    try {
      const updated = await applyProviderPayment(order, await provider.paymentRequests.get(order.orderCode));
      return updated.status === "PENDING" && updated.checkoutUrl ? safeCheckoutUrl(updated.checkoutUrl) : path;
    } catch (lookupError) {
      // An expired CREATING order that was never created may safely be retired
      // only when payOS explicitly confirms it does not exist.
      if (lookupError instanceof APIError && lookupError.code === "101" && Date.parse(order.expiresAt) < Date.now()) {
        await transaction(async client => { await drizzle(client).update(orders).set({ status: "EXPIRED" }).where(and(eq(orders.orderCode, order.orderCode), eq(orders.status, "CREATING"))); });
      }
      if (error instanceof AppError) throw error;
      throw providerUnavailable();
    }
  }
}

export async function cancelPayment(hostId: number, clubId: number, orderCode: number) {
  const order = await ownedOrder(hostId, clubId, orderCode);
  if (order.status === "PAID" || !active.includes(order.status)) return order;
  try { return await applyProviderPayment(order, await getPayOS().paymentRequests.cancel(orderCode, "Chủ CLB hủy đơn")); }
  catch { return applyProviderPayment(order, await fetchPayment(order)); }
}

const webhookSchema = z.object({ code: z.string(), success: z.boolean(), desc: z.string(), signature: z.string().regex(/^[a-fA-F0-9]{64}$/),
  data: z.object({ orderCode: z.number().int().positive().safe(), amount: z.number().int().nonnegative(), paymentLinkId: z.string().min(1), currency: z.literal("VND"), code: z.string(),
    description: z.string(), accountNumber: z.string(), reference: z.string(), transactionDateTime: z.string(), desc: z.string(),
    counterAccountBankId: z.string().nullable().optional(), counterAccountBankName: z.string().nullable().optional(), counterAccountName: z.string().nullable().optional(),
    counterAccountNumber: z.string().nullable().optional(), virtualAccountName: z.string().nullable().optional(), virtualAccountNumber: z.string().nullable().optional(),
  }).passthrough() });

export async function receivePaymentWebhook(raw: unknown) {
  const parsed = webhookSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(400, "Webhook chưa hợp lệ.");
  let data;
  try { data = await getPayOS().webhooks.verify(parsed.data); }
  catch { throw new AppError(400, "Chữ ký webhook chưa hợp lệ."); }
  if (data.code !== "00") return;
  const [order] = await getDb().select().from(orders).where(eq(orders.orderCode, data.orderCode));
  // Includes payOS's signed registration probe; unknown codes cannot grant Pro.
  if (!order) return;
  if (order.paymentLinkId && order.paymentLinkId !== data.paymentLinkId) throw new AppError(409, "Webhook không khớp đơn.");
  if (order.status === "PAID") return;
  await applyProviderPayment(order, await fetchPayment(order));
}
