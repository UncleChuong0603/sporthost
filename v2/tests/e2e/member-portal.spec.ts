import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";
import sharp from "sharp";
import { disposablePool } from "./disposable-db";
import { localNow } from "../../src/domain/session-policy";
const origin = process.env.SPORTHOST_E2E_ORIGIN || "http://127.0.0.1:3100";
async function csrf(page: Page, path: string) { expect((await page.goto(path))?.status()).toBe(200); return page.locator('input[name="csrf"]').first().inputValue(); }
async function post(request: APIRequestContext, path: string, token: string, form: Record<string,string> = {}) {
  const response = await request.post(path,{form:{...form,csrf:token},headers:{Origin:origin},maxRedirects:0});
  expect(response.status(), `${path}: ${(await response.text()).slice(0,100)}`).toBe(303); return response;
}

test("member onboarding, owner linkage, RSVP, dues, private uploads and revocation", async ({ page: owner, browser }, info) => {
  test.setTimeout(150000);
  const pool = disposablePool(), memberContext = await browser.newContext({ baseURL:origin,viewport:info.project.use.viewport });
  const member = await memberContext.newPage(), unique = `${info.project.name}-${Date.now()}`, memberEmail = `v2-portal-${unique}@example.com`;
  const playerName = "Người chơi của tôi", otherName = "Hồ sơ riêng người khác";
  const pageErrors: string[] = []; member.on("pageerror",error=>pageErrors.push(error.message));
  try {
    await post(owner.request,"/signup",await csrf(owner,"/signup"),{email:`v2-portal-owner-${unique}@example.com`,password:"portal-owner-password"});
    const token = await csrf(owner,"/clubs"), created = await post(owner.request,"/clubs",token,{name:"CLB người chơi "+unique});
    const clubPath = new URL(created.headers().location).pathname, clubId = Number(clubPath.split("/").at(-1));
    await post(owner.request,clubPath+"/members",token,{name:playerName,phone:"0901122111",kind:"fixed",gender:"female"});
    await post(owner.request,clubPath+"/members",token,{name:otherName,phone:"0901122222",kind:"fixed",gender:"male"});
    const players = (await pool.query("SELECT id,name FROM clubhost.members WHERE club_id=$1",[clubId])).rows;
    const memberId = players.find(row=>row.name===playerName)!.id, otherId = players.find(row=>row.name===otherName)!.id;
    const game = await post(owner.request,clubPath+"/games",token,{title:"Hẹn sân của tôi",starts_at:localNow(new Date(Date.now()+7*86400000)),capacity:"4",fixed_fee:"70000",guest_fee:"90000",approval_mode:"AUTO_APPROVE"});
    const gamePath = new URL(game.headers().location).pathname, gameId = Number(gamePath.split("/").at(-1));
    await post(owner.request,gamePath+"/invite-fixed",token);
    const bookings = (await pool.query("SELECT id,member_id FROM clubhost.bookings WHERE session_id=$1",[gameId])).rows;
    const bookingId = bookings.find(row=>row.member_id===memberId)!.id, foreignBookingId = bookings.find(row=>row.member_id===otherId)!.id;
    await post(owner.request,clubPath+"/dues",token,{member_id:String(memberId),period:"2026-11",amount:"250000"});
    const dueId = (await pool.query("SELECT id FROM clubhost.monthly_dues WHERE member_id=$1",[memberId])).rows[0].id;
    const qrBuffer = await sharp({create:{width:16,height:16,channels:3,background:"teal"}}).png().toBuffer();
    const uploaded = await owner.request.post(clubPath+"/payment-settings",{multipart:{csrf:token,bank_name:"Member bank",account_holder:"CLB account",account_number:"123456789",qr:{name:"qr.png",mimeType:"image/png",buffer:qrBuffer}},headers:{Origin:origin},maxRedirects:0}); expect(uploaded.status()).toBe(303);
    // New dues retain their payment snapshot; this one is intentionally created after QR setup.
    await post(owner.request,clubPath+"/dues",token,{member_id:String(memberId),period:"2026-12",amount:"260000"});
    const qrDue = (await pool.query("SELECT id FROM clubhost.monthly_dues WHERE member_id=$1 AND period='2026-12'",[memberId])).rows[0].id;

    await member.goto("/me/signup"); await member.getByLabel("Email",{exact:true}).fill(memberEmail); await member.getByLabel("Mật khẩu",{exact:true}).fill("portal-member-password");
    await member.getByRole("button",{name:"Tạo tài khoản",exact:true}).click(); await expect(member).toHaveURL(/\/me$/);
    await expect(member.getByText("Xác minh email để kết nối CLB",{exact:true})).toBeVisible();
    const account = (await pool.query("SELECT id,is_platform_admin FROM clubhost.hosts WHERE email=$1",[memberEmail])).rows[0]; expect(account.is_platform_admin).toBe(false);
    // Fixture delivers only a synthetic new account's one-use email token; no real email.
    const raw = randomBytes(36).toString("base64url");
    await pool.query("INSERT INTO clubhost.email_tokens(host_id,purpose,digest,expires_at,used) VALUES($1,'verify',$2,$3,false)",[account.id,createHash("sha256").update(raw).digest("hex"),new Date(Date.now()+600000).toISOString()]);
    await member.goto(`/verify-email?token=${raw}&audience=member`); await member.getByRole("button",{name:"Xác minh email",exact:true}).click(); await expect(member).toHaveURL(/\/me\/profile$/);
    await expect(member.getByText("Email đã xác minh",{exact:true})).toBeVisible();

    await owner.goto(`/members?club_id=${clubId}`); const row = owner.getByRole("listitem").filter({has:owner.getByText(playerName,{exact:true})});
    await row.getByText(`Tài khoản người chơi ${playerName}`,{exact:true}).click(); await row.getByLabel("Email tài khoản thành viên",{exact:true}).fill(memberEmail); await row.getByRole("button",{name:"Liên kết tài khoản",exact:true}).click();
    await expect(row.getByText(memberEmail,{exact:true})).toBeVisible();
    await member.goto("/me"); await expect(member.getByRole("heading",{name:`Chào ${playerName}!`,exact:true})).toBeVisible();
    expect(await member.locator("body").innerText()).not.toContain(otherName);
    for (const path of [`/me/bookings/${foreignBookingId}`,`/me/bookings/${foreignBookingId}/qr`,`${clubPath}`,`/finance/export.csv?club_id=${clubId}`]) expect((await member.request.get(path)).status()).toBe(404);
    const flight = await member.request.get("/me/schedule?_rsc=portal",{headers:{RSC:"1"}}); expect(flight.status()).toBe(200); expect(await flight.text()).not.toContain(otherName);

    await member.goto(`/me/bookings/${bookingId}`); await member.getByRole("button",{name:"Tôi tham gia",exact:true}).click(); await expect(member.getByRole("status")).toContainText("Đã cập nhật");
    expect((await pool.query("SELECT status FROM clubhost.bookings WHERE id=$1",[bookingId])).rows[0].status).toBe("confirmed");
    await member.goto("/me/payments"); await expect(member.getByRole("heading",{name:"Thanh toán của tôi",exact:true})).toBeVisible(); await expect(member.getByText("Phí tháng 2026-11",{exact:true})).toBeVisible();
    await member.goto(`/me/dues/${qrDue}`); expect((await member.request.get(`/me/dues/${qrDue}/qr`)).status()).toBe(200);
    await member.getByLabel("Ảnh biên nhận",{exact:true}).setInputFiles({name:"proof.png",mimeType:"image/png",buffer:qrBuffer}); await member.getByRole("button",{name:"Gửi biên nhận",exact:true}).click(); await expect(member.getByRole("status")).toContainText("Đã lưu");
    expect((await pool.query("SELECT paid,payment_status FROM clubhost.monthly_dues WHERE id=$1",[qrDue])).rows[0]).toEqual({paid:false,payment_status:"reported"});
    const badCsrf = await member.request.post(`/me/dues/${dueId}/proof`,{multipart:{csrf:"bad",proof:{name:"proof.png",mimeType:"image/png",buffer:qrBuffer}},headers:{Origin:origin}}); expect(badCsrf.status()).toBe(403);
    const ownCsrf = await csrf(member,`/me/bookings/${bookingId}`);
    const foreignUpload = await member.request.post(`/me/bookings/${foreignBookingId}/proof`,{multipart:{csrf:ownCsrf,proof:{name:"proof.png",mimeType:"image/png",buffer:qrBuffer}},headers:{Origin:origin}}); expect(foreignUpload.status()).toBe(404);
    await member.getByText("Hủy tham gia",{exact:true}).click(); await member.getByRole("button",{name:"Xác nhận hủy cả nhóm",exact:true}).click();
    await expect(member.getByText("Đã hủy",{exact:true})).toBeVisible();
    await member.goto("/me/schedule?tab=history"); await expect(member.getByRole("heading",{name:"Hẹn sân của tôi",exact:true})).toBeVisible();

    for (const path of ["/me","/me/schedule","/me/payments","/me/profile"]) {
      await member.goto(path); expect(await member.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    await member.emulateMedia({reducedMotion:"reduce"});
    for (const width of [375,768,1024,1440]) {
      await member.setViewportSize({width,height:812});
      expect(await member.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    await member.setViewportSize({width:375,height:812});
    await member.evaluate(()=>{document.documentElement.style.fontSize="125%";});
    expect(await member.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await member.screenshot({path:`test-results/member-portal-${info.project.name}.png`,fullPage:true});
    await owner.reload(); const linkedRow = owner.getByRole("listitem").filter({has:owner.getByText(playerName,{exact:true})});
    await linkedRow.getByText(`Tài khoản người chơi ${playerName}`,{exact:true}).click(); await linkedRow.getByRole("button",{name:"Gỡ liên kết tài khoản",exact:true}).click(); await expect(linkedRow.getByLabel("Email tài khoản thành viên",{exact:true})).toBeVisible();
    expect((await member.request.get(`/me/bookings/${bookingId}`)).status()).toBe(404); expect((await member.request.get(`/me/dues/${qrDue}/qr`)).status()).toBe(404);
    await member.goto("/me/payments"); await expect(member.getByRole("heading",{name:"Chưa có khoản thanh toán",exact:true})).toBeVisible();
    expect(pageErrors).toEqual([]);
    const anonymous = await browser.newContext({baseURL:origin}); try { expect((await anonymous.request.get(`/me/bookings/${bookingId}`)).status()).toBe(401); } finally { await anonymous.close(); }
  } finally { await Promise.allSettled([memberContext.close(),pool.end()]); }
});
