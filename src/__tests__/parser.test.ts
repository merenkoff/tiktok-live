// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, it, expect } from 'vitest';
import { parseOrder, validateOrder } from '../parser.js';

describe('Order Parser', () => {
  describe('parseOrder', () => {
    it('should parse basic format: "A12 92"', () => {
      const result = parseOrder('A12 92');
      expect(result).toEqual({
        productCode: 'A12',
        size: '92',
        rawComment: 'A12 92',
      });
    });

    it('should parse basic format: "B07 104"', () => {
      const result = parseOrder('B07 104');
      expect(result).toEqual({
        productCode: 'B07',
        size: '104',
        rawComment: 'B07 104',
      });
    });

    it('should parse Russian "хочу A12"', () => {
      const result = parseOrder('хочу A12');
      expect(result?.productCode).toBe('A12');
      expect(result?.size).toBe('0');
    });

    it('should parse Russian "беру K19"', () => {
      const result = parseOrder('беру K19');
      expect(result?.productCode).toBe('K19');
    });

    it('should parse Russian "нужен A12"', () => {
      const result = parseOrder('нужен A12');
      expect(result?.productCode).toBe('A12');
    });

    it('should parse product code only: "A12"', () => {
      const result = parseOrder('A12');
      expect(result?.productCode).toBe('A12');
    });

    it('should handle case-insensitive input', () => {
      const result = parseOrder('a12 92');
      expect(result?.productCode).toBe('A12');
    });

    it('should return null for invalid format', () => {
      expect(parseOrder('just some text')).toBeNull();
      expect(parseOrder('invalid')).toBeNull();
      expect(parseOrder('123 456')).toBeNull();
    });

    it('should return null for very long comments', () => {
      const longComment = 'A12 92 ' + 'x'.repeat(100);
      expect(parseOrder(longComment)).toBeNull();
    });
  });

  describe('validateOrder', () => {
    it('should validate correct order', () => {
      const order = {
        productCode: 'A12',
        size: '92',
        rawComment: 'A12 92',
      };
      expect(validateOrder(order)).toBe(true);
    });

    it('should reject invalid product code', () => {
      const order = {
        productCode: '123',
        size: '92',
        rawComment: '123 92',
      };
      expect(validateOrder(order)).toBe(false);
    });

    it('should reject invalid size', () => {
      const order = {
        productCode: 'A12',
        size: 'abc',
        rawComment: 'A12 abc',
      };
      expect(validateOrder(order)).toBe(false);
    });

    it('should accept size 0 (unspecified)', () => {
      const order = {
        productCode: 'A12',
        size: '0',
        rawComment: 'A12',
      };
      expect(validateOrder(order)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle whitespace variations', () => {
      expect(parseOrder('  A12   92  ')?.productCode).toBe('A12');
      expect(parseOrder('A12\t92')?.productCode).toBe('A12');
    });

    it('should handle mixed case Ukrainian', () => {
      const result = parseOrder('Хочу A12');
      expect(result?.productCode).toBe('A12');
    });

    it('should parse multiple products but only return first', () => {
      const result = parseOrder('A12 92 B07 104');
      expect(result?.productCode).toBe('A12');
      expect(result?.size).toBe('92');
    });

    it('should handle special characters in surrounding text', () => {
      const result = parseOrder('👕 A12 92 👍');
      expect(result?.productCode).toBe('A12');
    });
  });
});
