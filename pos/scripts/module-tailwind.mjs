// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Tailwind/PostCSS for a module-remote build (roadmap #4). Each
// `vite.<id>-remote.config.ts` uses `moduleCss('<id>')` so its
// `@tailwind utilities;` (via src/modules/remote-styles.css) is generated from
// ONLY that module's source — the utilities it actually uses, no `preflight`
// reset (the host page ships `@tailwind base` + tokens.css). Shares the host
// `tailwind.config.js` theme via `presets` so `sq-*` colours resolve.

import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import baseTw from '../tailwind.config.js';

/**
 * Vite `css` option for a module-remote build.
 *
 * `extraContent` covers a shared-but-not-a-module folder like `fiscal-core/`:
 * `fiscal-checkbox` renders `fiscal-core`'s components inline (`ShiftPanel`,
 * `SecretsForm`, …), and without their classes in this glob too, `style.css`
 * would build fine — signed, present, deterministic path — and every shared
 * widget would render unstyled at runtime. Optional and defaulted to `[]`, so
 * every existing single-module call site is unaffected.
 */
export function moduleCss(moduleId, extraContent = []) {
  return {
    postcss: {
      plugins: [
        tailwindcss({
          presets: [baseTw],
          content: [`./src/modules/${moduleId}/**/*.{ts,tsx}`, ...extraContent],
          corePlugins: { preflight: false },
        }),
        autoprefixer(),
      ],
    },
  };
}
