/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sq: {
          blue: '#006AFF',
          'blue-press': '#0058D6',
          bg: '#F5F5F5',
          surface: '#FFFFFF',
          sidebar: '#F0F0F0',
          text: '#1A1A1A',
          secondary: '#6E6E6E',
          muted: '#9A9A9A',
          divider: '#E0E0E0',
          empty: '#EBEBEB',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        sq: '4px',
      },
    },
  },
  plugins: [],
};
