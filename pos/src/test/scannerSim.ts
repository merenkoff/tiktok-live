// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * What the shop's scanner sees.
 *
 * Test-only, and deliberately written the way a laser reader works rather than
 * the way our encoder does: it is handed a **raster** — black and white dots,
 * the thing that actually leaves the print head — and has to find the symbol
 * in it and read it back. Nothing here imports the encoder, so a tag that
 * decodes here decodes because the bars and the white around them are right,
 * not because both sides share a table.
 *
 * That matters, because every real failure of a printed barcode is a geometry
 * failure: no quiet zone, modules too narrow for the head, ink spreading over
 * the gaps. An encoder round-trip cannot see any of them.
 *
 * Lives under `test/` because nothing in the app may import it: it is the
 * independent reader, and the moment production code shares a line with it the
 * check stops being independent.
 */

/** Left/right light margins, in modules, that a reader insists on seeing. */
const MIN_QUIET_MODULES = 7;

/**
 * Each digit as four element widths, in modules, reading `[first, second,
 * third, fourth]`. Typed out from the EAN-13 tables rather than derived from
 * `ean13.ts`: this is the independent side of the check.
 *
 * Left-hand characters start with a space, right-hand ones with a bar; an
 * `R` character has the same widths as the `L` character for the same digit,
 * which is why only two tables are needed.
 */
const L_WIDTHS: number[][] = [
  [3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2],
  [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2],
];
const G_WIDTHS: number[][] = [
  [1, 1, 2, 3], [1, 2, 2, 2], [2, 2, 1, 2], [1, 1, 4, 1], [2, 3, 1, 1],
  [1, 3, 2, 1], [4, 1, 1, 1], [2, 1, 3, 1], [3, 1, 2, 1], [2, 1, 1, 3],
];

/**
 * How the first digit is recovered: it is never drawn, it only picks which of
 * the six left-hand characters use the even-parity table.
 */
const PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

/**
 * The measurement a laser reader actually takes: the distance between similar
 * edges, not the width of one bar.
 *
 * `e1` spans elements 1–2 and `e2` elements 2–3, both measured leading edge to
 * leading edge, which makes them immune to print gain — ink that spreads moves
 * both edges of a bar the same way. `w1` breaks the two ties those two
 * distances leave (1 against 7, 2 against 8), and tolerates gain up to half a
 * module, which is what "the bars came out a little fat" means in practice.
 */
type CharKey = `${number}:${number}:${number}`;

function keyOf(widths: number[]): CharKey {
  const [a, b, c] = widths as [number, number, number];
  return `${a + b}:${b + c}:${a}`;
}

function buildTable(table: number[][]): Map<CharKey, number> {
  const out = new Map<CharKey, number>();
  table.forEach((widths, digit) => out.set(keyOf(widths), digit));
  return out;
}

const LEFT_L = buildTable(L_WIDTHS);
const LEFT_G = buildTable(G_WIDTHS);
/** A right-hand character is the complement of `L`, so the widths match. */
const RIGHT = LEFT_L;

export class ScanFailure extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ScanFailure';
  }
}

/** One printed bar: where it starts and how wide it is, in modules. */
export type PrintedBar = { start: number; width: number };

/**
 * Lay the symbol down as dots, the way the print head does.
 *
 * `crispEdges` is what the renderer asks for, and it means every edge lands on
 * a whole dot — which is the interesting part, because a module that is not a
 * whole number of dots comes out as a visibly uneven row of bars.
 *
 * `barGrowth` is the one print defect worth modelling: ink or heat spreading
 * past the edge, so every bar comes out wider and every gap narrower by the
 * same amount. It is given in **modules**, because that is how print-quality
 * standards talk about it and because the tolerance that matters scales with
 * the module, not with the printer. A thermal head run hot is a few tenths.
 */
export function rasterize(
  bars: PrintedBar[],
  opts: { totalModules: number; moduleMm: number; dpi: number; barGrowth?: number }
): boolean[] {
  const { totalModules, moduleMm, dpi, barGrowth = 0 } = opts;
  const dotsPerMm = dpi / 25.4;
  const width = Math.round(totalModules * moduleMm * dotsPerMm);
  const spread = (barGrowth / 2) * moduleMm * dotsPerMm;
  const image = new Array<boolean>(width).fill(false);
  for (const bar of bars) {
    const from = Math.round(bar.start * moduleMm * dotsPerMm - spread);
    const to = Math.round((bar.start + bar.width) * moduleMm * dotsPerMm + spread);
    for (let i = Math.max(0, from); i < Math.min(width, to); i += 1) image[i] = true;
  }
  return image;
}

type Run = { dark: boolean; len: number };

function runLengths(image: boolean[]): Run[] {
  const runs: Run[] = [];
  for (const dark of image) {
    const last = runs[runs.length - 1];
    if (last && last.dark === dark) last.len += 1;
    else runs.push({ dark, len: 1 });
  }
  return runs;
}

/**
 * `moduleDots` and `growthDots` are the reader's calibration, measured once
 * over the whole symbol rather than per character: at the two to five dots a
 * module gets on a receipt printer, a single character's own width is snapped
 * too coarsely to normalise against.
 */
type Calibration = { moduleDots: number; growthDots: number };

function decodeChar(
  elements: number[],
  table: Map<CharKey, number>,
  cal: Calibration,
  startsOnBar: boolean
): number {
  const inModules = (dots: number) => Math.round(dots / cal.moduleDots);
  // The first element is the only measurement print gain touches — it is a
  // plain width, not a distance between similar edges — so it gets the gain
  // taken back out. A bar came out that much too wide, a space that much too
  // narrow.
  const first = elements[0]! + (startsOnBar ? -cal.growthDots : cal.growthDots);
  const key: CharKey = `${inModules(elements[0]! + elements[1]!)}:${inModules(
    elements[1]! + elements[2]!
  )}:${Math.round(first / cal.moduleDots)}`;
  const digit = table.get(key);
  if (digit === undefined) throw new ScanFailure(`unreadable character (${key})`);
  return digit;
}

function ean13CheckDigit(twelve: string): number {
  let sum = 0;
  for (let i = 0; i < twelve.length; i += 1) {
    sum += (twelve.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Sweep one scan line across the raster and read the code back, or throw
 * saying what stopped the reader — which is the useful half: a scanner in the
 * shop only ever says nothing at all.
 */
export function scanEan13(image: boolean[]): string {
  const runs = runLengths(image);

  if (runs.length === 0 || runs[0]!.dark) {
    throw new ScanFailure('no left quiet zone: the symbol starts at the edge of the paper');
  }
  const lastDark = runs.reduce((best, r, n) => (r.dark ? n : best), -1);
  if (lastDark < 1) throw new ScanFailure('nothing printed');

  // Calibrate on the whole symbol: from the first bar's leading edge to the
  // last bar's trailing edge is 95 modules by definition, whatever the data
  // is, and unlike a single guard it is not thrown off by one snapped edge.
  const symbolDots = runs.slice(1, lastDark + 1).reduce((sum, r) => sum + r.len, 0);
  const moduleDots = symbolDots / 95;
  if (moduleDots < 2) {
    throw new ScanFailure(`module is ${moduleDots.toFixed(2)} dots wide — below the two it needs`);
  }

  const leadingQuiet = runs[0]!.len;
  const trailingQuiet = runs[lastDark + 1]?.len ?? 0;
  for (const [side, quiet] of [
    ['left', leadingQuiet],
    ['right', trailingQuiet],
  ] as const) {
    if (quiet < MIN_QUIET_MODULES * moduleDots) {
      throw new ScanFailure(
        `${side} quiet zone is ${(quiet / moduleDots).toFixed(1)} modules, needs ${MIN_QUIET_MODULES}`
      );
    }
  }

  let i = 1;
  // The start guard is bar-space-bar, one module each. Measuring it against
  // the module width just calibrated is how much wider than nominal the bars
  // came out — the gain the decode has to take back out.
  const guard = runs.slice(i, i + 3);
  if (guard.length < 3 || !guard[0]!.dark || guard[1]!.dark || !guard[2]!.dark) {
    throw new ScanFailure('no start guard');
  }
  const cal: Calibration = {
    moduleDots,
    growthDots: (guard[0]!.len + guard[2]!.len) / 2 - moduleDots,
  };
  i += 3;

  const parity: string[] = [];
  const left: number[] = [];
  for (let c = 0; c < 6; c += 1) {
    const elements = runs.slice(i, i + 4);
    if (elements.length < 4) throw new ScanFailure('symbol ends inside the left half');
    if (elements[0]!.dark) throw new ScanFailure('left-hand character starts on a bar');
    const widths = elements.map((r) => r.len);
    let digit: number;
    try {
      digit = decodeChar(widths, LEFT_L, cal, false);
      parity.push('L');
    } catch {
      digit = decodeChar(widths, LEFT_G, cal, false);
      parity.push('G');
    }
    left.push(digit);
    i += 4;
  }

  // Centre guard: space-bar-space-bar-space.
  const centre = runs.slice(i, i + 5);
  if (centre.length < 5 || centre.some((r, n) => r.dark !== (n % 2 === 1))) {
    throw new ScanFailure('no centre guard');
  }
  i += 5;

  const right: number[] = [];
  for (let c = 0; c < 6; c += 1) {
    const elements = runs.slice(i, i + 4);
    if (elements.length < 4) throw new ScanFailure('symbol ends inside the right half');
    if (!elements[0]!.dark) throw new ScanFailure('right-hand character starts on a space');
    right.push(decodeChar(elements.map((r) => r.len), RIGHT, cal, true));
    i += 4;
  }

  const end = runs.slice(i, i + 3);
  if (end.length < 3 || !end[0]!.dark || end[1]!.dark || !end[2]!.dark) {
    throw new ScanFailure('no end guard');
  }

  const first = PARITY.indexOf(parity.join(''));
  if (first < 0) throw new ScanFailure('left-hand parity matches no first digit');

  const code = [first, ...left, ...right].join('');
  // The last thing every reader does, and the reason a code with a typo in its
  // thirteenth digit is silently ignored at the counter.
  if (ean13CheckDigit(code.slice(0, 12)) !== code.charCodeAt(12) - 48) {
    throw new ScanFailure('check digit does not add up');
  }
  return code;
}
