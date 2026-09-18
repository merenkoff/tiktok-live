// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The comment stripper behind `scripts/check-module-css-coverage.mjs`.
//
// It earns a test because both directions hurt and only one of them is loud.
// Leaving a comment in turns a sentence into a fake class and fails a release
// build — that is what happened to `module-vertical-flowers-v2.0.1`. Stripping
// too much silently drops a real class from the check, and the module ships
// unstyled. Every case below is one of those two.

import { describe, expect, it } from 'vitest';
// @ts-expect-error — a plain .mjs build script, deliberately not in tsconfig.
import { stripComments } from '../../scripts/strip-comments.mjs';

const strip = stripComments as (source: string) => string;

describe('stripComments', () => {
  it('drops the prose that broke the release', () => {
    const source = `
      // composition panel reads top-down as "what I did", not alphabetised
      const cls = 'bg-sq-blue';
    `;
    const out = strip(source);

    expect(out).not.toContain('top-down');
    expect(out).toContain('bg-sq-blue');
  });

  it('drops a block comment but keeps the code around it', () => {
    const out = strip(`const a = 'px-2'; /* mt-4 in prose */ const b = 'py-3';`);

    expect(out).toContain('px-2');
    expect(out).toContain('py-3');
    expect(out).not.toContain('mt-4');
  });

  it('keeps the line count, so anything line-based still lines up', () => {
    const out = strip('/* one\ntwo\nthree */\nconst a = 1;');

    expect(out.split('\n')).toHaveLength(4);
  });

  // ── What must never be stripped ───────────────────────────────────────────

  it('does not treat a URL inside a string as a comment', () => {
    // The reason this is a state machine and not a regex: a blind `//` strip
    // eats the rest of the line, taking any class on it with it.
    const out = strip(`const a = 'https://example.com/x'; const cls = 'gap-3';`);

    expect(out).toContain('gap-3');
    expect(out).toContain('https://example.com/x');
  });

  it('keeps a class built inside a template literal', () => {
    const out = strip('const cls = `min-h-11 ${on ? "bg-sq-blue" : "bg-sq-bg"}`;');

    expect(out).toContain('min-h-11');
    expect(out).toContain('bg-sq-blue');
    expect(out).toContain('bg-sq-bg');
  });

  it('is not fooled by comment markers inside a string', () => {
    const out = strip(`const a = '// not a comment px-4'; const b = '/* also not */ py-4';`);

    expect(out).toContain('px-4');
    expect(out).toContain('py-4');
  });

  it('survives an escaped quote without swallowing the rest of the file', () => {
    const out = strip(`const a = 'it\\'s fine'; const cls = 'rounded-sq';`);

    expect(out).toContain('rounded-sq');
  });

  it('leaves a file with no comments exactly as it was', () => {
    const source = `const cls = 'flex items-center gap-2';\n`;

    expect(strip(source)).toBe(source);
  });

  it('handles an unterminated block comment without hanging or throwing', () => {
    expect(strip('const a = 1; /* never closed')).toContain('const a = 1;');
  });
});
