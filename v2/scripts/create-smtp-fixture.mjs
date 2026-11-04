// Short-lived localhost-only TLS material for the isolated SMTP test sink.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

const target = resolve(".local/smtp-test");
mkdirSync(target, { recursive: true });
const windowsOpenSsl = "C:/Program Files/Git/usr/bin/openssl.exe";
const executable = process.env.SPORTHOST_OPENSSL || (process.platform === "win32" && existsSync(windowsOpenSsl) ? windowsOpenSsl : "openssl");
try {
  execFileSync(executable, ["req", "-x509", "-newkey", "rsa:2048", "-noenc", "-days", "2", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-addext", "basicConstraints=critical,CA:TRUE",
    "-keyout", join(target, "localhost-key.pem"), "-out", join(target, "localhost-cert.pem")], { windowsHide: true, stdio: "pipe" });
} catch {
  throw new Error("SMTP tests require OpenSSL 3+. Install it or set SPORTHOST_OPENSSL to its executable path.");
}
console.log("Created short-lived localhost SMTP test certificate in ignored .local storage.");
