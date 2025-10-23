import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Set the correct workspace root for pnpm
  outputFileTracingRoot: path.join(__dirname, '..'),

  env: {
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    NEXT_PUBLIC_ENABLE_TESTNET: process.env.NEXT_PUBLIC_ENABLE_TESTNET,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      fs: false,
      net: false,
      tls: false,
      'pino-pretty': false,
    };

    config.resolve.alias = {
      ...config.resolve.alias,
      'pino-pretty': false,
    };

    return config;
  },
};

export default nextConfig;
