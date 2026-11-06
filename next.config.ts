import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/storefront", destination: "/storefront/index.html", permanent: false }];
  },
};

export default nextConfig;
