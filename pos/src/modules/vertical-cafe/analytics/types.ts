// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What `GET /api/pos/analytics/cafe` answers (`src/pos/cafe-analytics.service.ts`,
// phase К6). Mirrored here rather than exported from `@pos/platform`: nobody
// else reads this shape, and putting it in the barrel would move
// `PLATFORM_VERSION` for a type — the same call `products/data/techCardsApi.ts`
// made in К5d.

export type MenuQuadrant = 'star' | 'plowhorse' | 'puzzle' | 'dog';
export type MenuExclusion = 'no_cost' | 'no_price';

export interface MenuMatrixRow {
  variant_id: number;
  product_name: string;
  label: string;
  sold: number;
  share_bps: number;
  revenue_cents: number;
  cost_cents: number;
  margin_cents: number;
  unit_margin_cents: number;
  quadrant: MenuQuadrant;
}

export interface MenuExcludedRow {
  variant_id: number;
  product_name: string;
  label: string;
  sold: number;
  reason: MenuExclusion;
}

export interface CafeTableStats {
  bills: number;
  guests: number;
  revenue_cents: number;
  avg_bill_cents: number;
  avg_per_guest_cents: number | null;
  turns_per_table_per_day: number;
  avg_minutes: number | null;
}

export interface CafeAnalytics {
  from: string;
  to: string;
  food_cost: {
    revenue_cents: number;
    cost_cents: number;
    bps: number | null;
    /** How many sold lines the share above cannot see. */
    unpriced_lines: number;
  };
  sales_count: number;
  average_check_cents: number | null;
  peak_hours: Array<{ hour: number; orders: number; revenue_cents: number }>;
  top_modifiers: Array<{ group_name: string; name: string; times: number }>;
  menu: {
    rows: MenuMatrixRow[];
    excluded: MenuExcludedRow[];
    thresholds: { popularity_share_bps: number; unit_margin_cents: number };
    enough_data: boolean;
  };
  writeoffs: {
    rows: Array<{ reason: string; quantity: number; cost_cents: number }>;
    total_cost_cents: number;
  };
  /** null for a counter-service café — absent, which is not zero. */
  tables: CafeTableStats | null;
}
