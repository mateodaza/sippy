import type { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    arbitrum: {
      url: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
      chainId: 42161,
      accounts: process.env.REFUEL_ADMIN_PRIVATE_KEY
        ? [process.env.REFUEL_ADMIN_PRIVATE_KEY]
        : [],
    },
  },
  etherscan: {
    apiKey: process.env.ARBISCAN_API_KEY || '',
    customChains: [
      {
        network: 'arbitrum',
        chainId: 42161,
        urls: {
          apiURL: 'https://api.arbiscan.io/api',
          browserURL: 'https://arbiscan.io',
        },
      },
    ],
  },
};

export default config;
