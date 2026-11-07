import { test, expect, type Page } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";
import sharp from "sharp";
import { disposablePool } from "./disposable-db";
import { localNow } from "../../src/domain/session-policy";

const origin = process.env.SPORTHOST_E2E_ORIGIN || "http://127.0.0.1:3100";
async function signup(page: Page, email: string, member = false) {
  await page.goto(member ? "/me/signup" : "/signup");
  await page.getByLabel("Email", {exact:true}).fill(email);
  await page.getByLabel("Mật khẩu", {exact:true}).fill("launch-password-123");
  await page.getByRole("button", {name:"Tạo tài khoản",exact:true}).click();
  await expect(page).toHaveURL(member ? /\/me$/ : /\/dashboard$/);
}

test("zero to member registration, host approval, proof rejection/retry, payment and account recovery", async ({page:host,browser},info) => {
  test.setTimeout(150000);
  const pool = disposablePool(), unique = `${info.project.name}-${Date.now()}`;
  const memberContext = await browser.newContext({baseURL:origin,viewport:info.project.use.viewport});
  const member = await memberContext.newPage(), errors: string[] = [];
  for (const page of [host,member]) page.on("pageerror",error=>errors.push(error.message));
  const email = `v2-launch-player-${unique}@example.com`, name = "Thành viên từ đầu", title = "Ra sân từ lịch CLB";
  try {
    await host.goto("/");
    await expect(host.getByRole("link",{name:"Bắt đầu tổ chức CLB",exact:true})).toHaveAttribute("href","/signup");
    await expect(host.getByRole("link",{name:"Vào không gian người chơi",exact:true})).toHaveAttribute("href","/me/login");
    for (const width of [375,768,1440]) {
      await host.setViewportSize({width,height:900});
      expect(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    await host.setViewportSize(info.project.use.viewport || {width:1280,height:720});
    await host.screenshot({path:`test-results/launch-entry-${info.project.name}.png`,fullPage:true});
    await signup(host,`v2-launch-owner-${unique}@example.com`);
    await host.goto("/clubs/new"); await host.getByLabel("Tên câu lạc bộ").fill("Launch "+unique);
    await host.getByRole("button",{name:"Tạo câu lạc bộ",exact:true}).click();
    await expect(host).toHaveURL(/\/clubs\/\d+$/);
    const clubId = Number(new URL(host.url()).pathname.split("/").at(-1));
    await expect(host.getByRole("heading",{name:"Sẵn sàng cho buổi đầu tiên",exact:true})).toBeVisible();
    await host.getByLabel("Ngân hàng",{exact:true}).fill("Launch bank");
    await host.getByLabel("Chủ tài khoản",{exact:true}).fill("Club owner");
    await host.getByLabel("Số tài khoản",{exact:true}).fill("1234567890");
    await host.getByRole("button",{name:"Lưu tài khoản nhận tiền",exact:true}).click();
    await expect(host.getByRole("status")).toContainText("Đã lưu");
    const csrf = await host.locator('input[name="csrf"]').first().inputValue();
    const added = await host.request.post(`/clubs/${clubId}/members`,{form:{csrf,name,phone:"0901122999",kind:"guest",gender:"female"},headers:{Origin:origin},maxRedirects:0});
    expect(added.status()).toBe(303);

    await signup(member,email,true);
    const accountId = (await pool.query("SELECT id FROM clubhost.hosts WHERE email=$1",[email])).rows[0].id;
    const token = async (purpose: "verify"|"reset") => {
      const raw = randomBytes(36).toString("base64url");
      await pool.query("INSERT INTO clubhost.email_tokens(host_id,purpose,digest,expires_at,used) VALUES($1,$2,$3,$4,false)",[accountId,purpose,createHash("sha256").update(raw).digest("hex"),new Date(Date.now()+600000).toISOString()]);
      return raw;
    };
    await member.goto(`/verify-email?token=${await token("verify")}&audience=member`);
    await member.getByRole("button",{name:"Xác minh email",exact:true}).click(); await expect(member).toHaveURL(/\/me\/profile$/);
    await host.goto(`/members?club_id=${clubId}`);
    const row = host.getByRole("listitem").filter({has:host.getByText(name,{exact:true})});
    await row.getByText(`Tài khoản người chơi ${name}`,{exact:true}).click();
    await row.getByLabel("Email tài khoản thành viên",{exact:true}).fill(email);
    await row.getByRole("button",{name:"Liên kết tài khoản",exact:true}).click(); await expect(row.getByText(email,{exact:true})).toBeVisible();
    await host.goto(`/schedule/new?club_id=${clubId}`);
    await host.getByLabel("Tên buổi chơi",{exact:true}).fill(title);
    await host.getByLabel("Giờ bắt đầu",{exact:true}).fill(localNow(new Date(Date.now()+7*86400000)));
    await host.getByLabel("Sức chứa",{exact:true}).fill("4");
    await host.getByLabel("Phí vãng lai / người",{exact:true}).fill("70000");
    await host.getByLabel("Địa điểm",{exact:true}).fill("Sân số 2");
    await host.getByText("Lịch lặp, giới hạn và chính sách nâng cao",{exact:true}).click();
    await host.getByLabel("Hướng dẫn đến sân",{exact:true}).fill("Đi vào cổng sau, gửi xe bên trái.");
    await host.getByLabel("Liên kết Google Maps",{exact:true}).fill("https://maps.app.goo.gl/sporthost-launch");
    await host.getByLabel("Chính sách hủy",{exact:true}).fill("Hủy trước giờ bắt đầu; khoản đã đóng cần host đối soát.");
    await host.getByRole("button",{name:"Tạo buổi chơi",exact:true}).click(); await expect(host).toHaveURL(/\/games\/\d+$/);
    const gamePath = new URL(host.url()).pathname;
    await host.evaluate(() => { Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async () => { throw new Error("Permission denied"); }}}); });
    await host.getByRole("button",{name:"Sao chép link đăng ký",exact:true}).click();
    await expect(host.getByRole("status")).toContainText("Chọn link bên dưới");
    const publicLink = await host.getByLabel("Link đăng ký công khai",{exact:true}).inputValue();
    expect(publicLink).toMatch(new RegExp("^"+origin.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"/join/"));
    const hostCalendar = await host.request.get(gamePath+"/calendar.ics");
    expect(hostCalendar.status()).toBe(200); expect(hostCalendar.headers()["content-type"]).toContain("text/calendar");
    expect(await hostCalendar.text()).not.toContain("1234567890");
    await member.goto("/me/schedule");
    const gameCard = member.getByRole("article").filter({has:member.getByRole("heading",{name:title,exact:true})});
    await member.screenshot({path:`test-results/launch-open-sessions-${info.project.name}.png`,fullPage:true});
    await gameCard.getByRole("button",{name:"Đăng ký bằng hồ sơ của tôi",exact:true}).click(); await expect(member).toHaveURL(/\/me\/bookings\/\d+$/);
    const bookingPath = new URL(member.url()).pathname;
    await expect(member.getByText("Chờ duyệt",{exact:true})).toBeVisible();
    await expect(member.getByText("Đi vào cổng sau, gửi xe bên trái.",{exact:true})).toBeVisible();
    await expect(member.getByRole("link",{name:"Mở bản đồ đến sân",exact:true})).toHaveAttribute("href","https://maps.app.goo.gl/sporthost-launch");
    expect((await member.request.get(bookingPath+"/calendar.ics")).status()).toBe(409);
    await host.goto(gamePath); await host.getByLabel("Lý do từ chối",{exact:true}).fill("Cần xác nhận trình độ trước khi tham gia");
    await host.getByRole("button",{name:"Từ chối",exact:true}).click();
    await expect(host.getByText("Đã từ chối",{exact:true})).toBeVisible();
    await member.reload(); await expect(member.getByRole("complementary",{name:"Trạng thái đăng ký"})).toContainText("Cần xác nhận trình độ trước khi tham gia");
    await expect(member.getByRole("link",{name:"Lưu vào lịch cá nhân (.ics)",exact:true})).toHaveCount(0);
    await host.goto(gamePath); await host.getByRole("button",{name:"Duyệt cả nhóm",exact:true}).click(); await expect(host.getByText("1/4 chỗ",{exact:true})).toBeVisible();
    await member.reload();
    await expect(member.getByRole("link",{name:"Lưu vào lịch cá nhân (.ics)",exact:true})).toHaveAttribute("href",bookingPath+"/calendar.ics");
    const playerCalendar = await member.request.get(bookingPath+"/calendar.ics"); expect(playerCalendar.status()).toBe(200);
    const calendarText = await playerCalendar.text(); expect(calendarText).toContain("STATUS:CONFIRMED");
    for (const privateText of [email,"1234567890","0901122999","/attend/"]) expect(calendarText).not.toContain(privateText);
    const finance = member.getByRole("region",{name:"Thanh toán của bạn"});
    await expect(finance.getByText("70.000đ",{exact:true})).toBeVisible();
    await expect(finance.getByText("1234567890",{exact:true})).toBeVisible();
    for (const [color,reject] of [["teal",true],["blue",false]] as const) {
      await finance.getByText("Gửi biên nhận để host đối soát",{exact:true}).click();
      const buffer = await sharp({create:{width:16,height:16,channels:3,background:color}}).png().toBuffer();
      await finance.getByLabel("Ảnh biên nhận",{exact:true}).setInputFiles({name:"proof.png",mimeType:"image/png",buffer});
      await finance.getByRole("button",{name:"Gửi biên nhận",exact:true}).click();
      await expect(finance.getByText("Biên nhận đang chờ host đối soát.",{exact:true})).toBeVisible();
      await host.goto(`/payments/review?club_id=${clubId}`);
      if (reject) {
        await host.getByLabel("Lý do từ chối",{exact:true}).fill("Chưa thấy tiền vào");
        await host.getByRole("button",{name:"Từ chối biên nhận",exact:true}).click();
      } else { await host.getByRole("button",{name:"Host xác nhận tiền đã vào",exact:true}).click(); await host.getByRole("dialog").getByRole("button",{name:"Xác nhận",exact:true}).click(); }
      await expect(host.getByText("Không có biên nhận đang chờ đối soát.",{exact:true})).toBeVisible();
      await member.goto(bookingPath);
      await expect(finance.getByText(reject ? "Chưa thấy tiền vào" : "Host đã ghi nhận thanh toán trước.",{exact:true})).toBeVisible();
    }
    const bookingId = Number(bookingPath.split("/").at(-1));
    expect((await pool.query("SELECT paid,payment_status FROM clubhost.bookings WHERE id=$1",[bookingId])).rows[0]).toEqual({paid:true,payment_status:"confirmed"});
    await expect(finance.getByText("Gửi biên nhận để host đối soát",{exact:true})).toHaveCount(0);
    await member.screenshot({path:`test-results/launch-paid-${info.project.name}.png`,fullPage:true});
    for (const width of [360,390,430,768,1024,1440]) {
      await member.setViewportSize({width,height:900});
      for (const path of ["/me", "/me/schedule", "/me/payments", "/me/profile", bookingPath]) {
        await member.goto(path);
        expect(await member.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        await expect(member.getByRole("navigation",{name:"Điều hướng người chơi"}).locator('[aria-current="page"]')).toHaveCount(1);
      }
      await member.screenshot({path:info.outputPath(`member-booking-${width}.png`),fullPage:true});
    }

    const reset = await token("reset");
    await member.goto(`/reset-password?token=${reset}&audience=member`);
    await member.getByLabel("Mật khẩu mới",{exact:true}).fill("launch-recovered-password");
    await member.getByLabel("Xác nhận mật khẩu mới",{exact:true}).fill("launch-recovered-password");
    await member.getByRole("button",{name:"Lưu mật khẩu mới",exact:true}).click(); await expect(member).toHaveURL(/\/me\/login\?message=reset$/);
    await expect(member.getByRole("status")).toContainText("Đã đặt lại mật khẩu");
    await member.getByRole("link",{name:"Quên mật khẩu?",exact:true}).click();
    await expect(member.getByRole("link",{name:"← Về đăng nhập",exact:true})).toHaveAttribute("href","/me/login");
    expect((await member.goto(`/reset-password?token=${reset}&audience=member`))?.status()).toBe(400);
    await expect(member.getByRole("link",{name:"Yêu cầu liên kết mới",exact:true})).toHaveAttribute("href","/forgot-password?audience=member");
    expect((await member.goto(bookingPath))?.status()).toBe(401);
    expect((await member.request.get(bookingPath+"/calendar.ics")).status()).toBe(401);
    await expect(member.getByRole("link",{name:"Đăng nhập",exact:true})).toHaveAttribute("href","/me/login");
    await member.goto("/me/login"); await member.getByLabel("Email",{exact:true}).fill(email); await member.getByLabel("Mật khẩu",{exact:true}).fill("launch-recovered-password");
    await member.getByRole("button",{name:"Đăng nhập",exact:true}).click(); await expect(member).toHaveURL(/\/me$/);
    expect(await member.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await memberContext.close(); await pool.end(); }
});
