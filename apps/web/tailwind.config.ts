import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="deep-space-dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Syne', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // CSS variable–based semantic tokens
        // These map to the active theme's actual values
        surface: {
          primary:   'rgb(var(--surface-primary) / <alpha-value>)',
          secondary: 'rgb(var(--surface-secondary) / <alpha-value>)',
          elevated:  'rgb(var(--surface-elevated) / <alpha-value>)',
          overlay:   'rgb(var(--surface-overlay) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          strong:  'rgb(var(--border-strong) / <alpha-value>)',
        },
        content: {
          primary:   'rgb(var(--content-primary) / <alpha-value>)',
          secondary: 'rgb(var(--content-secondary) / <alpha-value>)',
          muted:     'rgb(var(--content-muted) / <alpha-value>)',
          inverse:   'rgb(var(--content-inverse) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          hover:   'rgb(var(--accent-hover) / <alpha-value>)',
          subtle:  'rgb(var(--accent-subtle) / <alpha-value>)',
          text:    'rgb(var(--accent-text) / <alpha-value>)',
        },
        status: {
          success: 'rgb(var(--status-success) / <alpha-value>)',
          warning: 'rgb(var(--status-warning) / <alpha-value>)',
          danger:  'rgb(var(--status-danger) / <alpha-value>)',
          info:    'rgb(var(--status-info) / <alpha-value>)',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh':   'conic-gradient(from 180deg at 50% 50%, var(--mesh-color-1) 0deg, var(--mesh-color-2) 120deg, var(--mesh-color-3) 240deg, var(--mesh-color-1) 360deg)',
      },
      boxShadow: {
        glass:   '0 4px 24px -2px rgb(var(--shadow-color) / 0.3), inset 0 1px 0 rgb(255 255 255 / 0.05)',
        glow:    '0 0 20px rgb(var(--accent) / 0.4), 0 0 40px rgb(var(--accent) / 0.15)',
        'card':  '0 1px 3px rgb(var(--shadow-color) / 0.12), 0 4px 16px rgb(var(--shadow-color) / 0.08)',
        'card-lg':'0 4px 6px rgb(var(--shadow-color) / 0.07), 0 12px 40px rgb(var(--shadow-color) / 0.12)',
        'soft':  '0 2px 8px rgb(var(--shadow-color) / 0.08)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in':        'fadeIn 0.3s ease-out',
        'slide-up':       'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down':     'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in':       'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-slow':     'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float':          'float 6s ease-in-out infinite',
        'shimmer':        'shimmer 2s linear infinite',
        'spin-slow':      'spin 8s linear infinite',
        'orbit':          'orbit 10s linear infinite',
      },
      keyframes: {
        fadeIn:      { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:     { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideDown:   { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideInRight:{ from: { opacity: '0', transform: 'translateX(24px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        scaleIn:     { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
        float:       { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-12px)' } },
        shimmer:     { from: { backgroundPosition: '-200% center' }, to: { backgroundPosition: '200% center' } },
        orbit:       { from: { transform: 'rotate(0deg) translateX(60px) rotate(0deg)' }, to: { transform: 'rotate(360deg) translateX(60px) rotate(-360deg)' } },
      },
      backdropBlur: { xs: '2px' },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
    },
  },
  plugins: [],
};

export default config;
