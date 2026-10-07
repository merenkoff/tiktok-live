// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// scripts/demo-suncity/techcards.mjs — the recipes the demo carries for eight
// of Sun City's dishes (phase S3, TechDocs/POS_DEMO_SUNCITY.md), so the owner
// sees a tech card, a food cost and a write-off on his own pizza and rolls.
//
// The site gives only the ingredient list, never grams or purchase prices, so
// these are OURS: plausible grams for the stated weight and Ukrainian wholesale
// prices of autumn 2026, in kopiyky per base unit. They are a demo, not his
// numbers — the doc says so, and the owner is expected to retype them. A
// 50 см pizza is about twice the toppings of a 30 см one, not 2.8× (its area):
// the site's own 50 см prices are ~1.7× the 30 см ones.
//
// Every other dish stays a plain product with its own shelf.

/** Never on the menu; counted in the base unit; `cost` per that unit, kopiyky. */
export const ingredients = [
  // pizza
  { name: 'Тісто для піци', unit: 'г', cost: 3, qty: 30000 },
  { name: 'Соус томатний', unit: 'г', cost: 8, qty: 5000 },
  { name: 'Соус вершковий', unit: 'г', cost: 12, qty: 5000 },
  { name: 'Моцарела', unit: 'г', cost: 28, qty: 10000 },
  { name: 'Сир Чеддер', unit: 'г', cost: 40, qty: 4000 },
  { name: 'Ковбаса пепероні', unit: 'г', cost: 35, qty: 3000 },
  { name: 'Томати', unit: 'г', cost: 9, qty: 6000 },
  { name: 'Базилік', unit: 'г', cost: 60, qty: 300 },
  { name: 'Хамон прошутто крудо', unit: 'г', cost: 120, qty: 2000 },
  { name: 'Філе куряче', unit: 'г', cost: 25, qty: 8000 },
  { name: 'Айсберг', unit: 'г', cost: 15, qty: 3000 },
  { name: 'Цибуля маринована', unit: 'г', cost: 6, qty: 2000 },
  { name: 'Коробка для піци 30 см', unit: 'шт', cost: 900, qty: 200 },
  { name: 'Коробка для піци 50 см', unit: 'шт', cost: 1500, qty: 100 },
  // sushi
  { name: 'Рис круглозерний', unit: 'г', cost: 7, qty: 10000 },
  { name: 'Оцет рисовий', unit: 'мл', cost: 12, qty: 2000 },
  { name: 'Норі', unit: 'шт', cost: 250, qty: 300 },
  { name: 'Сир Філадельфія', unit: 'г', cost: 45, qty: 4000 },
  { name: 'Лосось слабосолений', unit: 'г', cost: 90, qty: 3000 },
  { name: 'Огірок', unit: 'г', cost: 8, qty: 3000 },
  { name: 'Авокадо', unit: 'г', cost: 30, qty: 2000 },
  { name: 'Ікра тобіко', unit: 'г', cost: 150, qty: 500 },
  // street food
  { name: 'Лаваш', unit: 'шт', cost: 1000, qty: 200 },
  { name: 'Капуста', unit: 'г', cost: 4, qty: 5000 },
  { name: 'Морква по-корейськи', unit: 'г', cost: 12, qty: 3000 },
  { name: 'Огірок солений', unit: 'г', cost: 10, qty: 3000 },
  { name: 'Майонез', unit: 'г', cost: 9, qty: 3000 },
  { name: 'Гірчиця', unit: 'г', cost: 10, qty: 1000 },
  { name: 'Кетчуп', unit: 'г', cost: 8, qty: 3000 },
  { name: 'Булка з кунжутом', unit: 'шт', cost: 900, qty: 200 },
  { name: 'Котлета яловича', unit: 'шт', cost: 3000, qty: 100 },
  { name: 'Сир тостовий', unit: 'шт', cost: 350, qty: 300 },
  { name: 'Реліш', unit: 'г', cost: 15, qty: 1000 },
  { name: 'Картопля фрі заморожена', unit: 'г', cost: 6, qty: 20000 },
  { name: 'Олія для фритюру', unit: 'мл', cost: 7, qty: 10000 },
  { name: 'Сіль', unit: 'г', cost: 1, qty: 5000 },
  { name: 'Упаковка (бокс)', unit: 'шт', cost: 400, qty: 1000 },
];

/**
 * Semi-finished, `derived`: folded into every dish that names it — a recipe
 * inside a recipe (the café vertical allows three levels). Portioned, because
 * a recipe's quantity is a whole number: one portion is 50 г of seasoned rice.
 */
export const semis = [
  {
    name: 'Рис для суші, порція 50 г',
    unit: 'шт',
    parts: [
      ['Рис круглозерний', 35],
      ['Оцет рисовий', 3],
    ],
  },
];

/** Dish name (exactly as in menu.json) → variant label → [part name, quantity per one dish]. */
export const recipes = {
  Маргарита: {
    '30 см': [
      ['Тісто для піци', 280],
      ['Соус томатний', 70],
      ['Моцарела', 150],
      ['Томати', 80],
      ['Базилік', 3],
      ['Коробка для піци 30 см', 1],
    ],
    '50 см': [
      ['Тісто для піци', 560],
      ['Соус томатний', 140],
      ['Моцарела', 280],
      ['Томати', 160],
      ['Базилік', 6],
      ['Коробка для піци 50 см', 1],
    ],
  },
  Пепероні: {
    '30 см': [
      ['Тісто для піци', 280],
      ['Соус томатний', 70],
      ['Моцарела', 120],
      ['Сир Чеддер', 40],
      ['Ковбаса пепероні', 70],
      ['Томати', 50],
      ['Коробка для піци 30 см', 1],
    ],
    '50 см': [
      ['Тісто для піци', 560],
      ['Соус томатний', 130],
      ['Моцарела', 220],
      ['Сир Чеддер', 70],
      ['Ковбаса пепероні', 130],
      ['Томати', 90],
      ['Коробка для піци 50 см', 1],
    ],
  },
  'Sun City': {
    '30 см': [
      ['Тісто для піци', 280],
      ['Соус вершковий', 70],
      ['Моцарела', 120],
      ['Хамон прошутто крудо', 35],
      ['Філе куряче', 70],
      ['Айсберг', 25],
      ['Цибуля маринована', 20],
      ['Коробка для піци 30 см', 1],
    ],
    '50 см': [
      ['Тісто для піци', 560],
      ['Соус вершковий', 140],
      ['Моцарела', 240],
      ['Хамон прошутто крудо', 70],
      ['Філе куряче', 140],
      ['Айсберг', 50],
      ['Цибуля маринована', 40],
      ['Коробка для піци 50 см', 1],
    ],
  },
  'ФІЛАДЕЛЬФІЯ КЛАСІК': {
    '': [
      ['Норі', 1],
      ['Рис для суші, порція 50 г', 3],
      ['Сир Філадельфія', 40],
      ['Лосось слабосолений', 80],
      ['Огірок', 20],
      ['Упаковка (бокс)', 1],
    ],
  },
  'КАЛІФОРНІЯ ЛОСОСЬ': {
    '': [
      ['Норі', 1],
      ['Рис для суші, порція 50 г', 2],
      ['Сир Філадельфія', 30],
      ['Лосось слабосолений', 50],
      ['Огірок', 20],
      ['Авокадо', 25],
      ['Ікра тобіко', 10],
      ['Упаковка (бокс)', 1],
    ],
  },
  Шаурма: {
    '': [
      ['Лаваш', 1],
      ['Філе куряче', 100],
      ['Капуста', 50],
      ['Морква по-корейськи', 30],
      ['Огірок солений', 25],
      ['Майонез', 25],
      ['Гірчиця', 5],
      ['Кетчуп', 15],
    ],
  },
  'Бургер Sun City з яловичою котлетою': {
    '': [
      ['Булка з кунжутом', 1],
      ['Реліш', 15],
      ['Котлета яловича', 1],
      ['Айсберг', 15],
      ['Томати', 25],
      ['Сир тостовий', 1],
      ['Цибуля маринована', 10],
      ['Майонез', 15],
      ['Кетчуп', 10],
      ['Упаковка (бокс)', 1],
    ],
  },
  'Картопля Фрі': {
    '': [
      ['Картопля фрі заморожена', 150],
      ['Олія для фритюру', 20],
      ['Сіль', 2],
      ['Упаковка (бокс)', 1],
    ],
  },
};
