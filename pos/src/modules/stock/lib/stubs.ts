// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What posting a receipt will CREATE, counted the way the server creates it
// (clothing S1): the stubs that share a name are one card, and a stub on an
// existing card is a variant of it — so «5 нових товарів» for five sizes of
// one body suit would be a lie the confirm box used to tell.

export interface StubSummary {
  /** New cards — one per distinct name among the stubs with no card. */
  products: number;
  /** New variants on cards the shop already has. */
  variantsOnCards: number;
}

export function summarizeStubs(
  stubs: ReadonlyArray<{ name: string; product_id?: number | null }>
): StubSummary {
  const names = new Set<string>();
  let variantsOnCards = 0;
  for (const stub of stubs) {
    if (stub.product_id != null) variantsOnCards += 1;
    else names.add(stub.name.trim().toLowerCase());
  }
  return { products: names.size, variantsOnCards };
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** «Буде створено 2 нових товари і 3 нові розміри на наявних картках. Продовжити?», or null when nothing is created. */
export function confirmStubsMessage(summary: StubSummary): string | null {
  const parts: string[] = [];
  if (summary.products > 0) {
    parts.push(`${summary.products} ${plural(summary.products, 'новий товар', 'нових товари', 'нових товарів')}`);
  }
  if (summary.variantsOnCards > 0) {
    parts.push(
      `${summary.variantsOnCards} ${plural(summary.variantsOnCards, 'новий розмір', 'нові розміри', 'нових розмірів')} на наявних картках`
    );
  }
  if (parts.length === 0) return null;
  return `Буде створено ${parts.join(' і ')} у каталозі. Продовжити?`;
}

/** The footer's tail: « · нових товарів: 2 · нових розмірів: 3», or ''. */
export function stubsFooter(summary: StubSummary): string {
  let out = '';
  if (summary.products > 0) out += ` · нових товарів: ${summary.products}`;
  if (summary.variantsOnCards > 0) out += ` · нових розмірів: ${summary.variantsOnCards}`;
  return out;
}
