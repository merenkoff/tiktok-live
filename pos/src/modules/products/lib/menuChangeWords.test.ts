// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { actionWord, authorOf, describeChange, formatValue } from './menuChangeWords';

describe('menu change words', () => {
  it('says a price change in hryvnias with the variant', () => {
    expect(describeChange({ field: 'variant.price_cents', variant: 'M', from: 5500, to: 6000 })).toBe(
      'Ціна (M): 55,00 ₴ → 60,00 ₴'
    );
  });

  it('names allergens, labels, booleans, the strength and lists the way the card does', () => {
    expect(describeChange({ field: 'allergens', from: [], to: ['milk', 'gluten'] })).toBe('Алергени: — → Молоко, Глютен');
    expect(describeChange({ field: 'menu_labels', from: ['hit'], to: [] })).toBe('Позначки в QR-меню: Хіт → —');
    expect(describeChange({ field: 'menu_hidden', from: false, to: true })).toBe('Не показувати в QR-меню: ні → так');
    expect(describeChange({ field: 'strength_tenths', from: null, to: 45 })).toBe('Міцність: — → 4,5 %');
    expect(describeChange({ field: 'tags', from: ['Кава'], to: ['Кава', 'Сезон'] })).toBe('Мітки: Кава → Кава, Сезон');
  });

  it('says what a long text reads now, and that a photo was replaced', () => {
    expect(describeChange({ field: 'description', from: 'Старий', to: 'Новий опис' })).toBe('Опис: Новий опис');
    expect(describeChange({ field: 'image_url', from: '/a.jpg', to: '/b.jpg' })).toBe('Фото замінено');
    expect(describeChange({ field: 'image_url', from: '/a.jpg', to: null })).toBe('Фото прибрано');
  });

  it('words added and removed variants and answers', () => {
    expect(describeChange({ field: 'variant_added', variant: 'L', to: 7000 })).toBe('Новий варіант «L»: 70,00 ₴');
    expect(describeChange({ field: 'modifier_added', variant: 'Ваніль', to: 1000 })).toBe(
      'Нова відповідь «Ваніль»: доплата 10,00 ₴'
    );
    expect(describeChange({ field: 'modifier_removed', variant: 'Соєве' })).toBe('Прибрано відповідь «Соєве»');
  });

  it('keeps an unknown field readable rather than dropping it', () => {
    expect(describeChange({ field: 'future_field', from: 1, to: 2 })).toBe('future_field: 1 → 2');
    expect(formatValue('money', null)).toBe('—');
  });

  it('names the author with the role and the action in words', () => {
    expect(authorOf({ staff_name: 'Оля', staff_role: 'marketer' })).toBe('Оля (маркетолог)');
    expect(authorOf({ staff_name: 'Сергій', staff_role: 'owner' })).toBe('Сергій (власник)');
    expect(actionWord('archive')).toBe('в архіві');
  });
});
