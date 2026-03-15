import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#00AFD7',
          'primary-hover': '#0098BD',
          'primary-light': '#E6F7FB',
          'primary-muted': 'rgba(0, 175, 215, 0.15)',
          crypto: '#00D796',
          'crypto-hover': '#00B87F',
          'crypto-light': '#E6FBF3',
          dark: '#1A1A2E',
        },
        semantic: {
          success: '#16A34A',
          'success-light': '#DCFCE7',
          danger: '#DC2626',
          'danger-light': '#FEE2E2',
          warning: '#D97706',
          'warning-light': '#FEF3C7',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-space-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
