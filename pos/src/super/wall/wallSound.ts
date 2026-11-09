// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The television's sounds (TechDocs/POS_MENU_WALL.md, Д10): soft bells made
// with Web Audio and no files — a sine with an overtone, a quick attack, a
// long decay and a little echo. A browser allows sound only after a touch,
// so `unlockWallSound()` is called from the «Почати» button.
//
// Carried over from the «Малин» stop-sticker widget.

export type WallSound = 'hello' | 'open' | 'milestone' | 'record';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audioContextCtor(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: new () => AudioContext };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Creates (or wakes) the AudioContext — from a touch handler only. False: no sound on this device. */
export function unlockWallSound(): boolean {
  const Ctor = audioContextCtor();
  if (!Ctor) return false;
  try {
    if (!ctx) {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.32;
      // The echo: a delay with quiet feedback through a low-pass filter — the «air» around the bells.
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.19;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.28;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 3200;
      master.connect(ctx.destination);
      master.connect(delay);
      delay.connect(tone);
      tone.connect(feedback);
      feedback.connect(delay);
      tone.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  } catch {
    return false;
  }
}

/** The browser may have suspended the sound while the tab was hidden. */
export function resumeWallSound(): void {
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
}

function bell(freq: number, start: number, length = 1.4, level = 1) {
  if (!ctx || !master) return;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(0.5 * level, start + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, start + length);
  out.connect(master);
  // The fundamental plus a quiet octave and a «glassy» 2.76 partial — a small bell.
  for (const [mult, gain, type] of [
    [1, 1, 'sine'],
    [2, 0.28, 'sine'],
    [2.76, 0.08, 'triangle'],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * mult, start);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g);
    g.connect(out);
    osc.start(start);
    osc.stop(start + length + 0.05);
  }
}

// Notes of the G-major pentatonic: any combination sounds pleasant.
const N = { G5: 783.99, B5: 987.77, D6: 1174.66, E6: 1318.51, G6: 1567.98, B6: 1975.53, D7: 2349.32 };

const MELODIES: Record<WallSound, Array<[number, number, number?]>> = {
  hello: [
    [N.D6, 0],
    [N.G6, 0.16],
  ],
  open: [
    [N.G5, 0],
    [N.B5, 0.11],
    [N.D6, 0.22],
    [N.G6, 0.36, 1.8],
  ],
  milestone: [
    [N.G5, 0],
    [N.B5, 0.1],
    [N.D6, 0.2],
    [N.G6, 0.3],
    [N.B6, 0.42],
    [N.D6, 0.62, 2.2],
    [N.G6, 0.62, 2.2],
    [N.B6, 0.62, 2.2],
  ],
  record: [
    [N.D6, 0],
    [N.E6, 0.1],
    [N.G6, 0.2],
    [N.B6, 0.32],
    [N.D7, 0.46],
    [N.G6, 0.7],
    [N.B6, 0.8],
    [N.D7, 0.92, 2.4],
    [N.G6, 0.92, 2.4],
  ],
};

export function playWallSound(kind: WallSound): void {
  if (!ctx || !master) return;
  resumeWallSound();
  const t0 = ctx.currentTime + 0.03;
  const notes = MELODIES[kind];
  const level = 1 / Math.max(1, Math.sqrt(notes.filter((n) => n[1] === notes[notes.length - 1][1]).length));
  for (const [freq, at, len] of notes) bell(freq, t0 + at, len ?? 1.3, level);
}
