import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../..'),
  async redirects() {
    return [
      {
        source: '/fund',
        destination: 'https://fund.sippy.lat',
        permanent: true,
      },
    ];
  },
  env: {
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    NEXT_PUBLIC_ENABLE_TESTNET: process.env.NEXT_PUBLIC_ENABLE_TESTNET,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
  turbopack: {},
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
    config.optimization.minimize = false;
    return config;
  },
};

export default nextConfig;
