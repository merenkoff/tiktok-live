// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The handful of class strings the product screens share. Plain constants,
// never composed at runtime: `check-module-css-coverage.mjs` reads the module's
// source as text, so a class built from pieces would pass the gate unstyled.

/** A caption above a field — Things' 13/600, never inside the label's own text (the field would inherit it). */
export const captionClass = 'text-[13px] font-semibold text-sq-secondary';
/** Native checkbox in the accent blue. */
export const checkboxClass = 'w-4 h-4 shrink-0 accent-[rgb(var(--sq-blue-rgb))]';
/** On the grey tag panel a grey well would vanish, so the fields there are white. */
export const panelFieldClass = 'sq-input !bg-sq-surface';
/** Things' quiet chip: 22 px, a small radius, a hue only where it means something. */
export const chipClass = 'h-[22px] px-2 rounded-md text-xs font-medium inline-flex items-center whitespace-nowrap';
