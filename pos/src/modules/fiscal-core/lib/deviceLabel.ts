// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * A till a person can recognise: the name it registered, or a short id.
 *
 * Shared by the cashier's `HolderPanel` and the owner's register card, because
 * the sentences both build are quoted word for word in the public help article
 * `/dovidka/zmina-prro-zamina-kasy` — «Каса зайнята пристроєм A з 09:12»,
 * «Пристрій B просить передати касу». The article is written for people who
 * search for what their screen says, so the screen has to keep saying it; the
 * word «пристрій» belongs to those sentences and never to the label.
 */
export function deviceLabel(name: string | null, deviceId: string): string {
  return name?.trim() || deviceId.slice(0, 8);
}
