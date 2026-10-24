// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/dps/units.ts
//
// The unit of a line as the ДПС format wants it. `UNITCD` and `UNITNM` are
// optional but recommended, and go only as a pair (Cashalot's developers,
// TechDocs/prro/cashalot/sources/support-answers.md, answer 10). The codes are
// ДК 011-96: шт 2009 (ДПС example «Знижки»), г 0303, кг 0301, мл 0144 (the
// answer), л 0138 (Cashalot's own example). Sent as numbers, as the C#
// structure declares them; the CA3 probe checks that a leading-zero form is
// not what the server wants.

const UNITS: Readonly<Record<string, number>> = {
  шт: 2009,
  г: 303,
  кг: 301,
  мл: 144,
  л: 138,
};

/** The pair for a unit we know, or nothing at all — never one field without the other. */
export function unitFields(unit: string | null | undefined): { UNITCD?: number; UNITNM?: string } {
  const name = unit?.trim();
  if (!name) return {};
  const code = UNITS[name];
  return code === undefined ? {} : { UNITCD: code, UNITNM: name };
}
