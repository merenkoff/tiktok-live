// `sq-*` colours read the RGB channel variables of `src/styles/tokens.css`, so
// an opacity modifier works (`bg-sq-blue/10`) and a module-remote — which
// compiles its own utilities from this file (scripts/module-tailwind.mjs) —
// follows the host's palette instead of baking hex into its signed style.css.
// The fallback channels are for a remote built from this config landing on an
// older host that does not define the variables yet: it then draws the same
// colours, just without the host being able to change them.
const sq = (name, fallback) => `rgb(var(--sq-${name}-rgb, ${fallback}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Neutrals are Things' (design/README.md at the repo root); blue stays ours.
      colors: {
        sq: {
          blue: sq('blue', '0 106 255'),
          'blue-press': sq('blue-press', '0 88 214'),
          bg: sq('bg', '242 245 247'),
          surface: sq('surface', '255 255 255'),
          sidebar: sq('sidebar', '244 245 247'),
          selected: sq('selected', '223 226 231'),
          text: sq('text', '48 51 54'),
          heading: sq('heading', '44 49 56'),
          secondary: sq('secondary', '85 96 110'),
          muted: sq('muted', '142 145 150'),
          divider: sq('divider', '223 227 232'),
          empty: sq('empty', '236 238 240'),
          success: sq('success', '67 174 89'),
          'success-ink': sq('success-ink', '47 125 64'),
          danger: sq('danger', '244 56 106'),
          warning: sq('warning', '244 137 31'),
        },
      },
      // Inter by default, SF under `html.apple` — the switch lives in the
      // variable (tokens.css), so `font-sans` follows it too.
      fontFamily: {
        sans: ['var(--pos-font, "Inter Variable", "Inter", sans-serif)'],
      },
      borderRadius: {
        sq: '10px', // controls: buttons, fields, tiles
        card: '18px', // cards and sheets
      },
      boxShadow: {
        card: '0 2px 8px rgba(0,0,0,.1), 0 0 2px rgba(0,0,0,.1)',
        'card-hover': '0 6px 20px rgba(0,20,60,.12), 0 0 2px rgba(0,0,0,.12)',
      },
    },
  },
  plugins: [],
};
