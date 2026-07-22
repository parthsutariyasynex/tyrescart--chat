import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Storefront product images: real photos come from /media/** and the
    // fallback placeholder from /static/**, so allow the whole host.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.tyrescart.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
