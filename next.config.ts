import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        aggregateTimeout: 200, // Delay rebuild after the first change (ms)
        poll: 100, // Check for changes every 100ms
      };
    }
    return config;
  },
  experimental: {
    turbo: {
      loaders: {},
    },
  },
};

export default nextConfig;
