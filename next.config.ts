import type { NextConfig } from "next";

// Listings render images from any HTTPS host and wallets inject scripts, so the policy
// only restricts what cannot break them: framing (clickjacking on seller actions),
// plugins, base-URL hijacking and form targets.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [{ source: "/storefront", destination: "/storefront/index.html", permanent: false }];
  },
};

export default nextConfig;
