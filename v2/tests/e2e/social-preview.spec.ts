import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("Facebook can discover the public SportHost card and download its image without login", async ({ request }) => {
  const response = await request.get("/", { headers: { "User-Agent": "facebookexternalhit/1.1" } });
  expect(response.status()).toBe(200);
  const head = (await response.text()).split("</head>")[0];
  expect(head).toContain('property="og:title" content="SportHost | Quản lý CLB, lịch chơi và thu chi"');
  expect(head).toMatch(/property="og:url" content="https:\/\/sporthost\.online\/?"/);
  expect(head).toContain('property="og:image" content="https://sporthost.online/images/sporthost-share-v1.png"');
  expect(head).toContain('property="og:image:width" content="1200"');
  expect(head).toContain('property="og:image:height" content="630"');
  expect(head).toContain('name="twitter:card" content="summary_large_image"');
  expect(head).toMatch(/rel="canonical" href="https:\/\/sporthost\.online\/?"/);
  const image = await request.get("/images/sporthost-share-v1.png", { headers: { "User-Agent": "facebookexternalhit/1.1" } });
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
  const data = await image.body();
  expect(data.byteLength).toBeLessThan(1_000_000);
  expect(await sharp(data).metadata()).toMatchObject({ format: "png", width: 1200, height: 630 });
  // Other destinations must keep their own shared URL instead of becoming homepage links.
  const login = await request.get("/me/login", { headers: { "User-Agent": "facebookexternalhit/1.1" } });
  const loginHead = (await login.text()).split("</head>")[0];
  expect(loginHead).toContain('property="og:image"');
  expect(loginHead).not.toContain('property="og:url"');
  expect(loginHead).not.toContain('rel="canonical"');
});
