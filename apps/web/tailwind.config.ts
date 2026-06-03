import type { Config } from 'tailwindcss';

// 设计 token 借鉴 PriceAI 的 DESIGN.md 语义色体系（success/danger/warning），
// 但保留 barto 现有 globals.css 的 CSS 变量作为基底，二者并存。
const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 语义色：库存/新鲜度状态。背景浅、文字深，确保对比度（WCAG AA）。
        stock: {
          'in-bg': '#e8f3ec',
          'in-text': '#2f7a4b',
          'out-bg': '#fbe9e7',
          'out-text': '#9b3328',
          'unknown-bg': '#f2f4f4',
          'unknown-text': '#5a6061',
        },
        fresh: {
          aging: '#7a541b',
          'aging-bg': '#fff7e8',
          stale: '#7a541b',
          expired: '#9b3328',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
