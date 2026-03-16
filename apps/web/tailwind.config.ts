import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
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
          dark: '#0D0D1A',
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
        sans: ['var(--font-chakra-petch)', 'system-ui', 'sans-serif'],
        display: ['var(--font-electrolize)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-space-mono)', 'monospace'],
      },
      animation: {
        'shimmer-slide':
          'shimmer-slide var(--speed) ease-in-out infinite alternate',
        'spin-around': 'spin-around calc(var(--speed) * 2) infinite linear',
        'border-beam': 'border-beam calc(var(--duration)*1s) infinite linear',
      },
      keyframes: {
        'shimmer-slide': {
          to: {
            transform: 'translate(calc(100cqw - 100%), 0)',
          },
        },
        'spin-around': {
          '0%': {
            transform: 'translateZ(0) rotate(0)',
          },
          '15%, 35%': {
            transform: 'translateZ(0) rotate(90deg)',
          },
          '65%, 85%': {
            transform: 'translateZ(0) rotate(270deg)',
          },
          '100%': {
            transform: 'translateZ(0) rotate(360deg)',
          },
        },
        'border-beam': {
          '100%': {
            'offset-distance': '100%',
          },
        },
      },
    },
  },
  plugins: [],
};
export default config;
