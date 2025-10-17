import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
