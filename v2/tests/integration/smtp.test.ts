import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Socket } from "node:net";
import { TLSSocket, createSecureContext } from "node:tls";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { sendAccountMail, mailReady } from "@/server/infrastructure/mail";
import { installTestEnv } from "./environment";

let certificate: Buffer, key: Buffer, port: number, deliveries: string[] = [], rejectRecipient = false, starts = 0;
const sockets = new Set<Socket>();
const sink = createServer(socket => serve(socket, false));
function serve(socket: Socket, encrypted: boolean) {
  sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
  let pending = "", inData = false, message: string[] = [];
  const consume = (chunk: Buffer) => {
    pending += chunk.toString("utf8");
    while (pending.includes("\r\n")) {
      const index = pending.indexOf("\r\n"); const line = pending.slice(0, index); pending = pending.slice(index + 2);
      if (inData) {
        if (line === ".") { deliveries.push(message.join("\r\n")); message = []; inData = false; socket.write("250 accepted locally\r\n"); }
        else message.push(line.startsWith("..") ? line.slice(1) : line);
        continue;
      }
      if (/^(EHLO|HELO) /i.test(line)) socket.write(encrypted ? "250-localhost\r\n250 SIZE 100000\r\n" : "250-localhost\r\n250 STARTTLS\r\n");
      else if (line === "STARTTLS" && !encrypted) {
        starts++; socket.write("220 Ready for TLS\r\n"); socket.removeListener("data", consume);
        const tls = new TLSSocket(socket, { isServer: true, secureContext: createSecureContext({ key, cert: certificate }) });
        serve(tls, true); return;
      } else if (/^MAIL FROM:/i.test(line)) socket.write(encrypted ? "250 sender accepted\r\n" : "530 TLS required\r\n");
      else if (/^RCPT TO:/i.test(line)) socket.write(rejectRecipient ? "550 synthetic recipient rejection\r\n" : "250 recipient accepted\r\n");
      else if (line === "DATA" && encrypted) { inData = true; socket.write("354 End with dot\r\n"); }
      else if (line === "QUIT") socket.end("221 bye\r\n");
      else socket.write("250 ok\r\n");
    }
  };
  socket.on("data", consume); if (!encrypted) socket.write("220 localhost synthetic SMTP sink\r\n");
}
beforeAll(async () => {
  execFileSync(process.execPath, ["scripts/create-smtp-fixture.mjs"], { windowsHide: true, stdio: "pipe" });
  certificate = readFileSync(".local/smtp-test/localhost-cert.pem"); key = readFileSync(".local/smtp-test/localhost-key.pem");
  await new Promise<void>(done => sink.listen(0, "127.0.0.1", done));
  port = (sink.address() as { port: number }).port;
});
beforeEach(() => {
  installTestEnv(); deliveries = []; rejectRecipient = false; starts = 0;
  vi.stubEnv("SMTP_HOST", "127.0.0.1"); vi.stubEnv("SMTP_PORT", String(port)); vi.stubEnv("SMTP_USER", ""); vi.stubEnv("SMTP_PASSWORD", ""); vi.stubEnv("EMAIL_FROM", "SportHost <no-reply@example.test>");
  vi.stubEnv("SMTP_TLS_CA_FILE", resolve(".local/smtp-test/localhost-cert.pem"));
});
afterAll(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(done => sink.close(() => done())); });
describe("SMTP delivery against an isolated local STARTTLS sink", () => {
  it("does not connect when delivery is disabled", async () => {
    expect(mailReady()).toBe(false);
    await expect(sendAccountMail("sink@example.test", "Disabled", "test")).rejects.toMatchObject({ status: 503, code: "mail_unavailable" });
    expect(starts).toBe(0); expect(deliveries).toHaveLength(0);
  });
  it("delivers the actual account link only after verified STARTTLS", async () => {
    vi.stubEnv("EMAIL_ENABLED", "true");
    await sendAccountMail("sink@example.test", "SportHost reset test", "Link expires in 30 minutes: https://example.test/reset-password?token=synthetic-only-token");
    expect(starts).toBe(1); expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toContain("To: sink@example.test"); expect(deliveries[0]).toContain("Subject: SportHost reset test");
    expect(deliveries[0]).toContain("synthetic-only-token");
  });
  it("refuses an untrusted certificate without sending a message", async () => {
    vi.stubEnv("EMAIL_ENABLED", "true"); vi.stubEnv("SMTP_TLS_CA_FILE", "");
    await expect(sendAccountMail("sink@example.test", "Untrusted", "Never delivered")).rejects.toMatchObject({ status: 503 });
    expect(starts).toBe(1); expect(deliveries).toHaveLength(0);
  });
  it("reports recipient rejection safely", async () => {
    vi.stubEnv("EMAIL_ENABLED", "true"); rejectRecipient = true;
    await expect(sendAccountMail("sink@example.test", "Rejected", "Never delivered")).rejects.toMatchObject({ status: 503, code: "mail_unavailable" });
    expect(deliveries).toHaveLength(0);
  });
});
