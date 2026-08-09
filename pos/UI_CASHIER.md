# UI каси (Cloth POS)

Каса для невеликого магазину одягу: каталог з мітками, варіанти (колір/розмір), залишки, штрихкод, чек, оплата.

## Tokens

| Token | Hex |
|-------|-----|
| `--pos-primary` | `#006AFF` |
| `--pos-primary-press` | `#0058D6` |
| `--pos-bg` | `#F5F5F5` |
| `--pos-surface` | `#FFFFFF` |
| `--pos-text` | `#1A1A1A` |
| `--pos-secondary` | `#6E6E6E` |
| `--pos-muted` | `#9A9A9A` |
| `--pos-divider` | `#E0E0E0` |
| `--pos-empty` | `#EBEBEB` |
| `--pos-folder` | `#E8EEF4` |
| `--pos-folder-ink` | `#3D5266` |
| Font | Inter |
| Radius | 4px |

Контраст: каталог на сірому `bg`, картки білі, CTA суцільний primary з білим текстом. Папки міток — спокійний холодно-сірий (`folder`), не primary.

## Класи

- `.pos-btn-primary` / `.sq-btn-primary` — solid CTA
- `.pos-field` — інпут з рамкою
- `.pos-field-underline` — поле готівки (лише нижня межа)
- `.pos-folder-tile` — плитка мітки

## Layout

- Один каталог + breadcrumb міток (без вкладки «Обране»)
- Toolbar: пошук і камера; без дублів у сітці
- Сітка 3–5 cols; папки нейтральні; товар = фото + назва + ціна + залишок
- Справа: поточний чек + «Сплатити»
- Оплата: full-screen білий, hero-сума, список методів, решта по готівці
- Мобільний: bar чека → sheet зі списком і qty
