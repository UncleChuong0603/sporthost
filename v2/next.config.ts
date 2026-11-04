import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: { cpus: 2 },
  poweredByHeader: false,
  serverExternalPackages: ["pg", "sharp", "nodemailer"],
  outputFileTracingExcludes: { "/*": ["./.env*", "./tests/**/*", "./test-results/**/*", "./playwright-report/**/*", "./drizzle/**/*"] },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ] }];
  },
};

export default nextConfig;
