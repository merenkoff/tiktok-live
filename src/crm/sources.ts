// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/crm/sources.ts — a journey read the way a salesperson needs it: where the
// person came from, in words, and the few facts worth a call first
// (TechDocs/CRM_LEADS.md «Якорі»). Pure, computed on read, never stored — a
// better rule tomorrow re-labels every lead already in the table.

import type { Journey, JourneyTouch } from './journey.js';

/** Our own hosts: a referrer from here is a page of the same visit, not a source. */
const OWN_HOSTS = /(^|\.)the-live\.shop$/;

/** AI assistants first: `gemini.google.com` must not read as Google search. */
const AI_ASSISTANTS: Array<[RegExp, string]> = [
  [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
  [/(^|\.)gemini\.google\.com$/, 'Gemini'],
  [/(^|\.)claude\.ai$/, 'Claude'],
  [/(^|\.)copilot\.microsoft\.com$/, 'Copilot'],
];

const REFERRERS: Array<[RegExp, string]> = [
  [/(^|\.)google\.[a-z.]+$/, 'Google (пошук)'],
  [/(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org)$/, 'Пошук (інший)'],
  [/(^|\.)(facebook\.com|fb\.com|instagram\.com|threads\.net)$/, 'Facebook / Instagram'],
  [/(^|\.)(t\.me|telegram\.org|telegram\.me)$/, 'Telegram'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
];

function hostOf(ref: string | undefined): string | undefined {
  return ref?.split('/')[0];
}

/** The AI assistant a referrer host belongs to, if any. */
export function assistantOf(ref: string | undefined): string | undefined {
  const host = hostOf(ref);
  if (!host) return undefined;
  return AI_ASSISTANTS.find(([re]) => re.test(host))?.[1];
}

/**
 * Where one visit came from. Paid clicks first (a click id is the strongest
 * evidence), then a tagged campaign, then the referrer, else «Пряме».
 */
export function sourceOf(touch: JourneyTouch | undefined): string {
  if (!touch) return 'Невідомо';
  if (touch.click?.gclid) return 'Google Ads';
  if (touch.click?.ttclid) return 'TikTok (реклама)';
  if (touch.utm?.source) {
    return touch.utm.campaign ? `UTM: ${touch.utm.source} / ${touch.utm.campaign}` : `UTM: ${touch.utm.source}`;
  }
  // `fbclid` rides on organic Facebook/Instagram links too, so it is a channel, not «реклама».
  if (touch.click?.fbclid) return 'Facebook / Instagram';
  const host = hostOf(touch.ref);
  if (!host || OWN_HOSTS.test(host)) return 'Пряме';
  const assistant = assistantOf(touch.ref);
  if (assistant) return `AI-асистент: ${assistant}`;
  const known = REFERRERS.find(([re]) => re.test(host));
  return known ? known[1] : `Сайт: ${host}`;
}

/** Pages that compare us with someone else — a person reading them is choosing. */
const COMPARING = /^\/(yaku-kasu-obraty|dovidka\/[^/]*(kavapp|poster|torgsoft|posbox|choiceqr|expirenza|syrve|iiko|vchasno|chy-))/;

const OS_LABEL: Record<string, string> = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };

/**
 * The facts worth a call first, as short chips. Derived from what the visitor
 * did on the site; nothing here is a guess about who they are.
 */
export function signalsOf(journey: Journey): string[] {
  const out: string[] = [];
  const ctas = journey.ctas ?? [];
  const pages = journey.pages ?? [];
  if (ctas.some((c) => c.id.startsWith('pricing'))) out.push('Дивився ціни');
  if (pages.some((p) => COMPARING.test(p.p)) || ctas.some((c) => c.id.startsWith('compare'))) {
    out.push('Порівнював з конкурентами');
  }
  const downloads = [...new Set(ctas.filter((c) => c.id.startsWith('download-')).map((c) => c.id.slice('download-'.length)))];
  if (downloads.length) {
    out.push(`Завантажив касу (${downloads.map((os) => OS_LABEL[os] ?? os).join(', ')})`);
  }
  if (ctas.some((c) => c.id.startsWith('demo-menu'))) out.push('Відкривав демо-меню');
  if ((journey.visits ?? 1) >= 2) out.push(`${journey.visits}-й візит`);
  const assistant = assistantOf(journey.first?.ref) ?? assistantOf(journey.last?.ref);
  if (assistant) out.push(`Прийшов з ${assistant}`);
  return out;
}

/** Whole days from the first visit to the moment of the form, or null if unknown. */
export function daysToLead(journey: Journey, sentAt: Date): number | null {
  const first = journey.firstVisitAt ?? journey.first?.at;
  if (!first) return null;
  const ms = sentAt.getTime() - Date.parse(first);
  return Number.isFinite(ms) && ms >= 0 ? Math.floor(ms / (24 * 3600 * 1000)) : null;
}
