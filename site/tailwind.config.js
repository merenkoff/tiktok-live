/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './live.html',
    './pos.html',
    './compare.html',
    './dovidka.html',
    './vertical.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Neutrals are Things' (culturedcode.com, measured 2026-09-24); the
      // accents — pos, live and the vertical tints — stay ours.
      colors: {
        paper: '#FFFFFF',
        mist: '#F2F5F7', // page background
        side: '#F4F5F7', // a sidebar, a quiet panel
        selected: '#DFE2E7',
        ink: {
          DEFAULT: '#303336',
          strong: '#2C3138', // headings
        },
        body: '#44474B', // lead paragraphs
        muted: '#55606E',
        faint: '#8E9196',
        line: '#DFE3E8',
        live: {
          DEFAULT: '#FF3D7A',
          press: '#D8215F',
        },
        pos: {
          DEFAULT: '#006AFF',
          press: '#0058D6',
        },
        // Soft card backgrounds per vertical; buttons and links stay `pos`.
        tint: {
          clothing: '#EAF1FF',
          flowers: '#FBE7EF',
          cafe: '#F3E9DC',
          restaurant: '#E6EEF5',
        },
      },
      // Inter (self-hosted, @fontsource-variable/inter) by default; Apple
      // devices switch to SF through `html.apple` in index.css. The system
      // font cannot simply lead this stack: Chrome resolves BlinkMacSystemFont
      // as system-ui, which on Windows is Segoe UI.
      fontFamily: {
        sans: ['"Inter Variable"', '"Inter"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        card: '18px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(0,0,0,.1), 0 0 2px rgba(0,0,0,.1)',
        'card-hover': '0 6px 20px rgba(0,20,60,.12), 0 0 2px rgba(0,0,0,.12)',
        ambient: '0 30px 60px -12px rgba(0,20,60,.22), 0 0 0 1px rgba(0,28,70,.08)',
      },
    },
  },
  plugins: [],
};
