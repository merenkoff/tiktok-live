// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Its own module so it can be tested without running the checker, whose body
// reads argv and calls process.exit on import.

/**
 * Drop comments before looking for class names.
 *
 * A class can only come from code; a hyphenated English word in a comment
 * cannot. Without this, prose like «the panel reads top-down as "what I did"»
 * scans as the class `top-down` (the `top-` prefix below is there for `top-0`),
 * Tailwind never emits it because it is not a utility, and a release build
 * fails on a sentence. That happened, on
 * `module-vertical-flowers-v2.0.1`.
 *
 * String- and template-aware on purpose. Stripping `//` blindly would eat the
 * rest of any line holding a URL — and with it any class sharing that line,
 * which is the far worse failure: a missed class ships a module that renders
 * unstyled, while a false positive only fails the build loudly.
 */
export function stripComments(source) {
  let out = '';
  let i = 0;
  // One of: null (code), '"', "'", '`', '//', '/*'
  let mode = null;

  while (i < source.length) {
    const two = source.slice(i, i + 2);
    const ch = source[i];

    if (mode === null) {
      if (two === '//') {
        mode = '//';
        i += 2;
        continue;
      }
      if (two === '/*') {
        mode = '/*';
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') mode = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (mode === '//') {
      if (ch === '\n') {
        mode = null;
        out += ch;
      }
      i += 1;
      continue;
    }

    if (mode === '/*') {
      if (two === '*/') {
        mode = null;
        i += 2;
      } else {
        // Keep newlines so line-based reading of the result still lines up.
        if (ch === '\n') out += ch;
        i += 1;
      }
      continue;
    }

    // Inside a string or template literal: copy through, honouring escapes so
    // a trailing backslash cannot swallow the closing quote.
    if (ch === '\\') {
      out += source.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === mode) mode = null;
    out += ch;
    i += 1;
  }

  return out;
}
