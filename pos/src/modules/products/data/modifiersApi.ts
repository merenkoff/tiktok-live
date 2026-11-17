// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The modifier calls the redrawn editor makes — through `api.posRequest`, the
// `markdownsApi.ts` shape, so nothing here is a new export of `@pos/platform`
// and the platform stays where it is.

import { api } from '@pos/platform';
import type { ModifierGroup, ModifierInput } from '@pos/platform';

/** One answer of a question saved whole: `id` is an answer the question already has. */
export type WholeAnswerInput = ModifierInput & { id?: number };

/** A question saved whole — its fields and every answer, in the till's order. */
export interface WholeGroupInput {
  name: string;
  min_select: number;
  max_select: number;
  is_active?: boolean;
  modifiers: WholeAnswerInput[];
}

/**
 * Create a question with its answers (`id` null) or replace one: a single
 * request and a single transaction, so the editor has one «Зберегти» and a
 * refused answer leaves nothing half-written.
 */
export function saveGroupWhole(id: number | null, input: WholeGroupInput): Promise<ModifierGroup> {
  // Called as a METHOD of `api`, never detached: it reaches its axios client through `this`.
  return id == null
    ? api.posRequest<ModifierGroup>('post', '/modifier-groups', input)
    : api.posRequest<ModifierGroup>('put', `/modifier-groups/${id}`, input);
}

/** Switch a question on or off without touching its answers. */
export function setGroupActive(id: number, isActive: boolean): Promise<ModifierGroup> {
  return api.posRequest<ModifierGroup>('put', `/modifier-groups/${id}`, { is_active: isActive });
}

export interface GroupProductsResult {
  group: ModifierGroup;
  added: number;
  removed: number;
}

/**
 * Which products ask the question, set from the question's side: every
 * active product that should ask it. A product that starts asking it asks it
 * last, after the questions it already has.
 */
export function setGroupProducts(id: number, productIds: number[]): Promise<GroupProductsResult> {
  return api.posRequest<GroupProductsResult>('put', `/modifier-groups/${id}/products`, {
    product_ids: productIds,
  });
}
