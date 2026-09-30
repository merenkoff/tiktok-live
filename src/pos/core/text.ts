// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/text.ts — the one place owner-typed free text is made one line.

/**
 * Control characters — a NUL would be a database error, a tab or a line break
 * just noise on a printed page — read as spaces. Whitespace is NOT collapsed
 * here; callers that want a single line follow with `.replace(/\s+/g, ' ')`.
 */
export function withoutControls(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0)!;
    out += code < 0x20 || code === 0x7f ? ' ' : char;
  }
  return out;
}

/** `text` as one trimmed line: controls and runs of whitespace become single spaces. */
export function oneLine(text: string): string {
  return withoutControls(text).replace(/\s+/g, ' ').trim();
}
