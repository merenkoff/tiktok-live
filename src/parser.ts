// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { z } from 'zod';
import { logger } from './logger.js';

/**
 * Longest comment still scanned for a product code embedded in free text.
 * Exact, anchored matches ("A12 92") are never subject to it.
 */
const MAX_LOOSE_COMMENT_LENGTH = 50;

export interface ParsedOrder {
  productCode: string;
  size: string;
  rawComment: string;
}

/**
 * Parse order from TikTok LIVE comment
 * Supports formats:
 * - "A12 92" (product code + size)
 * - "B07 104"
 * - "хочу A12" (Russian: "I want A12")
 * - "беру K19" (Russian: "taking K19")
 * - "A12" (just product code, size optional)
 */
export function parseOrder(comment: string): ParsedOrder | null {
  const trimmed = comment.trim().toLowerCase();

  // Pattern 1: "A12 92" or "B07 104" - product code + size
  const patternBasic = /^([a-z]\d{1,2})\s+(\d{2,3})$/i;
  const matchBasic = trimmed.match(patternBasic);
  if (matchBasic) {
    return {
      productCode: matchBasic[1].toUpperCase(),
      size: matchBasic[2],
      rawComment: comment,
    };
  }

  // Pattern 2: Russian "хочу A12" or "беру K19" - with intent verb
  // хочу = I want, беру = taking
  const patternRussian = /^(?:хочу|беру|нужен|нужна)\s+([a-z]\d{1,2})(?:\s+(\d{2,3}))?$/i;
  const matchRussian = trimmed.match(patternRussian);
  if (matchRussian) {
    return {
      productCode: matchRussian[1].toUpperCase(),
      size: matchRussian[2] || '0',
      rawComment: comment,
    };
  }

  // Pattern 3: Just product code "A12" in different languages/context
  // This is looser - single word that matches product pattern
  const patternProductOnly = /^([a-z]\d{1,2})(?:\s+(\d{2,3}))?$/i;
  const matchProductOnly = trimmed.match(patternProductOnly);
  if (matchProductOnly) {
    return {
      productCode: matchProductOnly[1].toUpperCase(),
      size: matchProductOnly[2] || '0',
      rawComment: comment,
    };
  }

  // Pattern 4: a code embedded in surrounding text — "👕 A12 92 👍", and
  // several codes at once ("A12 92 B07 104"), where the first one wins: a
  // reservation covers a single item, so the rest of the comment is ignored.
  //
  // Only scanned for short comments. In a long chatty message an "A12 92"-shaped
  // fragment is far more likely to be conversation than an order, and a false
  // positive here reserves stock against a customer who never asked for it.
  // (The patterns above are all anchored, so the cap cannot affect them.)
  if (comment.length > MAX_LOOSE_COMMENT_LENGTH) {
    return null;
  }
  const patternEmbedded = /([a-z]\d{1,2})\s+(\d{2,3})/gi;
  const embedded = [...comment.matchAll(patternEmbedded)];
  if (embedded.length > 0) {
    const [, productCode, size] = embedded[0];
    return {
      productCode: productCode.toUpperCase(),
      size,
      rawComment: comment,
    };
  }

  return null;
}

/**
 * Validate parsed order
 */
export function validateOrder(order: ParsedOrder): boolean {
  // Product code: letter + 1-2 digits (A1, B23, etc.)
  if (!/^[A-Z]\d{1,2}$/.test(order.productCode)) {
    return false;
  }

  // Size: 1-3 digits (0, 92, 104, etc.)
  // 0 = not specified
  if (!/^\d{1,3}$/.test(order.size)) {
    return false;
  }

  return true;
}

/**
 * Get user nickname from TikTok comment data
 */
export function extractNickname(uniqueId: string): string {
  return uniqueId.trim();
}

// Validation schema
const OrderSchema = z.object({
  productCode: z.string().regex(/^[A-Z]\d{1,2}$/),
  size: z.string().regex(/^\d{1,3}$/),
  rawComment: z.string(),
});

export function validateOrderSchema(order: unknown) {
  try {
    return OrderSchema.parse(order);
  } catch (error) {
    logger.debug('Order validation failed', { error, order });
    return null;
  }
}
