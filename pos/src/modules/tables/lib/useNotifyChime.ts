// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A short chime and a buzz when something NEW arrives from a guest's phone
// (phases Q8/Q9, TechDocs/POS_QR_MENU.md): a call, an order that went to the
// kitchen by itself, a request. A waiter carries the tablet in a pocket or
// leaves it on the bar; a badge nobody is looking at is no notice at all —
// and with auto-send on, a dish is already cooking for that table.
//
// New, not present: the keys of the last poll are remembered and only a key
// that was not there before rings, so the same call read again ten seconds
// later is silent. The first read after the screen opens only remembers —
// opening the map is not news.
//
// No sound file: a counter bell synthesised in Web Audio, so the bundle
// carries nothing and nothing is fetched. Two strikes, full scale, with the
// bright partials up around 3–4 kHz — that is what carries across a bar or a
// full dining room, where a quiet beep sits under the conversation. Browsers
// start an AudioContext suspended until the page has been touched; the first
// tap anywhere resumes it, and before that the vibration still works where
// the device has one.
//
// The switch is the waiter's, per device (`localStorage`, behind try/catch:
// private mode or a blocked storage simply means «on»).

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'tables:chime';

type AudioCtor = typeof AudioContext;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (context) return context;
  const w = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
}

/** Wake the audio on the first touch of the page — browsers refuse sound before it. */
function unlockOnFirstTouch(): () => void {
  const unlock = (): void => {
    const ctx = audioContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  };
  document.addEventListener('pointerdown', unlock, { once: true, capture: true });
  return () => document.removeEventListener('pointerdown', unlock, { capture: true });
}

// One strike of a small brass counter bell. Hz, peak level, ring in seconds.
// Levels of one strike sum to 1, so the attack is full scale. The minor-third
// partial is what makes a bar of metal sound like a bell rather than a beep;
// the partials near 3–4 kHz die first and are the ones that cut through talk.
const BELL_PARTIALS: ReadonlyArray<readonly [number, number, number]> = [
  [523, 0.16, 1.15],
  [1047, 0.3, 1.4],
  [1245, 0.12, 0.95],
  [2093, 0.18, 0.65],
  [3136, 0.14, 0.38],
  [4186, 0.1, 0.22],
];

/** Second slap, far enough apart that a noisy room hears two dings. */
const SECOND_STRIKE_AT = 0.34;

function strikeBell(ctx: AudioContext, at: number): void {
  for (const [frequency, level, decay] of BELL_PARTIALS) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + decay + 0.02);
  }
  clapper(ctx, at);
}

/** The tick of the clapper. Optional: a context without buffers still rings. */
function clapper(ctx: AudioContext, at: number): void {
  if (typeof ctx.createBuffer !== 'function' || !ctx.sampleRate) return;
  const seconds = 0.012;
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buffer;
  gain.gain.setValueAtTime(0.55, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  src.connect(gain).connect(ctx.destination);
  src.start(at);
  src.stop(at + seconds);
}

/** Two full-volume strikes of a counter bell — meant to be heard across the room. */
export function playChime(): void {
  const ctx = audioContext();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      const start = ctx.currentTime;
      strikeBell(ctx, start);
      strikeBell(ctx, start + SECOND_STRIKE_AT);
    } catch {
      // A device with no audio output: the buzz below is all there is.
    }
  }
  try {
    navigator.vibrate?.([160, 120, 200]);
  } catch {
    // Not every webview lets a page vibrate.
  }
}

export function readChimeSetting(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** The waiter's switch, remembered on this device. */
export function useChimeSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readChimeSetting);
  const set = useCallback((next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      // Remembered for this screen only.
    }
  }, []);
  return [on, set];
}

/**
 * Ring when `keys` gains one it did not have. `ready` says the keys are a real
 * answer and not the empty list before the first poll — otherwise the first
 * answer would ring for everything already on the screen.
 */
export function useNotifyChime(keys: ReadonlySet<string>, ready: boolean, enabled: boolean): void {
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => unlockOnFirstTouch(), []);

  useEffect(() => {
    if (!ready) return;
    const previous = seen.current;
    seen.current = new Set(keys);
    if (previous == null || !enabled) return;
    for (const key of keys) {
      if (!previous.has(key)) {
        playChime();
        return;
      }
    }
  }, [keys, ready, enabled]);
}
