import { z } from 'zod';
import { logger } from './logger.js';

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
    // Only match if it's a standalone message (not part of longer text)
    // Reject if comment is very long (likely not an order)
    if (comment.length > 50) {
      return null;
    }
    return {
      productCode: matchProductOnly[1].toUpperCase(),
      size: matchProductOnly[2] || '0',
      rawComment: comment,
    };
  }

  // Pattern 4: Multiple product codes in one comment "A12 B07 K19"
  const patternMultiple = /([a-z]\d{1,2})\s+(\d{2,3})/gi;
  const matches = [...comment.matchAll(patternMultiple)];
  if (matches.length === 1) {
    const match = matches[0];
    return {
      productCode: match[1].toUpperCase(),
      size: match[2],
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
