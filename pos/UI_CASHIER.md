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
- Темний **AppRail** зліва (іконки: Каса, Продажі/Товари для owner, Вихід)
- Центр: пошук завжди видимий → **Рядок категорій** → сітка
- Справа: чек (SaleSidebar)

### Phone
- Без rail; знизу bar чека + BottomNav

### Рядок категорій (`show_in_catalog_bar`)
- Перший пункт: **Усі товари**
- Далі мітки з галочкою «Показувати в рядку категорій» в адмінці
- Мітки з рядка **не** дублюються кольоровими плитками в сітці
- Breadcrumb немає. Якщо провалились глибше за корінь / мітку рядка — перший пункт рядка: **‹ {батько}**

### Сітка
- Кольорові плитки міток (без `show_in_catalog_bar`): іконка зверху-зліва, назва знизу-зліва
- Товар: квадрат з фото, назва+ціна **всередині** (overlay + градієнт)

### Чек
- Прев’ю + бейдж `N×`, справа **сума рядка**
- UI-заготовка знижки (`discount_label` / `compare_at_cents`)
- `−` / `+` лише після кліку по рядку (toggle)
- **Зберегти кошик** (stub) + **Сплатити**

### Оплата
- Full-screen білий, hero-сума, методи, решта по готівці
