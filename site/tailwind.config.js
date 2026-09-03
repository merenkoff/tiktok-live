/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './live.html', './pos.html', './compare.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FFFFFF',
        mist: '#F5F5F5',
        ink: '#1A1A1A',
        muted: '#6E6E6E',
        line: '#E5E5E5',
        live: {
          DEFAULT: '#FF3D7A',
          press: '#D8215F',
        },
        pos: {
          DEFAULT: '#006AFF',
          press: '#0058D6',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        ambient: '0 30px 60px -20px rgba(26,26,26,0.25), 0 10px 24px -12px rgba(26,26,26,0.15)',
      },
    },
  },
  plugins: [],
};
