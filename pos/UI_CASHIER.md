# UI каси (Cloth POS)

Каса для невеликого магазину одягу: каталог з мітками, варіанти (колір/розмір), залишки, штрихкод, чек, оплата.
Візуал орієнтований на Square Register.

## Tokens

| Token | Hex |
|-------|-----|
| `--pos-primary` | `#006AFF` |
| `--pos-primary-press` | `#0058D6` |
| `--pos-bg` | `#F5F5F5` |
| `--pos-surface` | `#FFFFFF` |
| `--pos-rail` | `#1A1A1A` |
| `--pos-text` | `#1A1A1A` |
| `--pos-secondary` | `#6E6E6E` |
| `--pos-muted` | `#9A9A9A` |
| `--pos-divider` | `#E0E0E0` |
| `--pos-empty` | `#EBEBEB` |
| Font | Inter |
| Radius | 4px |

Кольори плиток міток (ключ у `pos_tags.color`): `green`, `rose`, `blue`, `orange`, `teal`, `purple`, `slate`, `amber` — див. `pos/src/lib/tagColors.ts`.

## Класи

- `.pos-btn-primary` / `.sq-btn-primary` — solid CTA
- `.pos-field` — інпут з рамкою
- `.pos-field-underline` — поле готівки (лише нижня межа)

## Layout

### Desktop / tablet (`lg+`)
- Темний **AppRail** зліва (Каса, Клієнти, Продажі/Товари для owner **лише на сайті**, Вихід). У десктоп-касі admin-посилань немає — [[POS_DESKTOP]].
- Центр: пошук → **Рядок категорій** → сітка
- Справа: чек (SaleSidebar)

### Phone
- Без rail; знизу bar чека + BottomNav (Каса, Клієнти, …)

### Рядок категорій (`show_in_catalog_bar`)
- Перший пункт: **Усі товари**
- Далі мітки з галочкою в адмінці
- Мітки з рядка **не** дублюються кольоровими плитками
- Глибше за корінь / мітку рядка — перший пункт: **‹ {батько}**

### Сітка
- Кольорові плитки міток (без `show_in_catalog_bar`)
- Товар: квадрат з фото, назва+ціна **всередині** (overlay)

### Чек
- Шапка: клієнт (клік → picker); касир дрібніше
- Прев’ю + `N×` лише якщо qty > 1; справа **сума рядка**
- Товарна знижка: лейбл + закреслена сума (`compare_at`)
- Знижка на чек (% або ₴) лише на позиції **без** товарної знижки
- `−` / `+` після кліку по рядку (toggle)
- **Зберегти кошик** (stub) + **Сплатити**

### Клієнти
- `/customers` (каса) і `/admin/customers` — ім’я, телефон*, email, діти (ім’я+ДН, макс. 5)

### Оплата
- Full-screen білий, hero-сума, методи, решта по готівці

Спека знижок/клієнтів: [`TechDocs/POS_DISCOUNTS_AND_CUSTOMERS.md`](../TechDocs/POS_DISCOUNTS_AND_CUSTOMERS.md).

Десктопна каса (окремий entry + Tauri 2; адмінка лишається сайтом): [`TechDocs/POS_DESKTOP.md`](../TechDocs/POS_DESKTOP.md).
