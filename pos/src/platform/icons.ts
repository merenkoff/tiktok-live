// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Nav icons by name (roadmap #13 Part D).
 *
 * A module names its nav icon with a string — `icon: 'PackageCheck'` — and the
 * host resolves it here. Two reasons:
 *
 *  1. An **online-only module** declared in `pos_stores.module_remotes` is data,
 *     not code: its placeholder nav entry exists before a single byte of the
 *     module has been downloaded, so its icon has to travel as a string too
 *     (`ModuleRemoteEntry.icon` / `nav[].icon`).
 *  2. A module built as a standalone remote chunk no longer bundles its own copy
 *     of the nav icon components — the host already has them.
 *
 * The map is deliberately a **hand-picked allowlist** of the glyph set: this
 * file is reached eagerly from `Nav`. Adding a name here — after drawing it in
 * design/icons — makes it available to every module, including ones shipped
 * from outside this repo. An unknown name resolves to {@link FALLBACK_NAV_ICON}
 * rather than rendering nothing.
 */

import {
  BarChart3,
  Barcode,
  Bell,
  Boxes,
  Calendar,
  CalendarClock,
  CameraColor,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  CloudOff,
  Coffee,
  Coins,
  CreditCard,
  FileText,
  Flower2,
  Gift,
  Grid3X3,
  Heart,
  Home,
  Layers,
  ListOrdered,
  MapPinColor,
  Megaphone,
  MessageSquare,
  Package,
  PackageCheck,
  Percent,
  PieChart,
  PrinterColor,
  Puzzle,
  QrCode,
  Receipt,
  RefreshCwColor,
  Repeat,
  ScanLine,
  SearchColor,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Table,
  Tag,
  TrendingUp,
  Truck,
  User,
  Users,
  UtensilsCrossed,
  Video,
  Wallet,
  Warehouse,
  Wrench,
  type Glyph,
} from './glyphs';

/**
 * Every icon a `NavItem.icon` string may name → its colour glyph (design/icons,
 * drawn in the style of Things: one hue per icon). The keys are lucide's export
 * names on purpose and must never be renamed: stores keep them as strings in
 * `nav_overrides` and `module_remotes`, and a name this build does not know
 * shows the fallback. Where a UI glyph owns the plain name (`Search`,
 * `Camera`…), the colour one behind the key carries a suffix.
 */
export const NAV_ICONS = {
  BarChart3,
  Barcode,
  Bell,
  Boxes,
  Calendar,
  CalendarClock,
  Camera: CameraColor,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  CloudOff,
  Coffee,
  Coins,
  CreditCard,
  FileText,
  Flower2,
  Gift,
  Grid3X3,
  Heart,
  Home,
  Layers,
  ListOrdered,
  MapPin: MapPinColor,
  Megaphone,
  MessageSquare,
  Package,
  PackageCheck,
  Percent,
  PieChart,
  Printer: PrinterColor,
  Puzzle,
  QrCode,
  Receipt,
  RefreshCw: RefreshCwColor,
  Repeat,
  ScanLine,
  Search: SearchColor,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Table,
  Tag,
  TrendingUp,
  Truck,
  User,
  Users,
  UtensilsCrossed,
  Video,
  Wallet,
  Warehouse,
  Wrench,
} as const satisfies Record<string, Glyph>;

/** The names {@link resolveNavIcon} knows. In-tree manifests get autocomplete. */
export type NavIconName = keyof typeof NAV_ICONS;

/** Shown when a module names an icon this build doesn't have. */
export const FALLBACK_NAV_ICON: Glyph = Puzzle;

export function isNavIconName(value: string): value is NavIconName {
  return Object.prototype.hasOwnProperty.call(NAV_ICONS, value);
}

/**
 * A `NavItem.icon` → the component to render. Passes a component through
 * untouched (legacy/in-tree direct references), maps a known name, and falls
 * back to {@link FALLBACK_NAV_ICON} for a name this build doesn't ship — a
 * module named by an older/newer host must never blank out its own nav entry.
 */
export function resolveNavIcon(icon: Glyph | string | undefined): Glyph | undefined {
  if (!icon) return undefined;
  if (typeof icon !== 'string') return icon;
  return isNavIconName(icon) ? NAV_ICONS[icon] : FALLBACK_NAV_ICON;
}
