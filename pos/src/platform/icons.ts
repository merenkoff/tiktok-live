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
 *     of `lucide-react` icon components for nav — the host already has them.
 *
 * The map is deliberately a **hand-picked allowlist**, not `import * as icons
 * from 'lucide-react'`: this file is reached eagerly from `Nav`, and the full
 * lucide set is thousands of components. Adding a name here is the (cheap, ~0.3
 * KB) cost of making it available to every module, including ones shipped from
 * outside this repo. An unknown name resolves to {@link FALLBACK_NAV_ICON}
 * rather than rendering nothing.
 */

import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Barcode,
  Bell,
  Boxes,
  Calendar,
  Camera,
  ClipboardCheck,
  ClipboardList,
  CloudOff,
  Coins,
  CreditCard,
  FileText,
  Gift,
  Grid3X3,
  Heart,
  Home,
  Layers,
  ListOrdered,
  MapPin,
  Megaphone,
  MessageSquare,
  Package,
  PackageCheck,
  Percent,
  PieChart,
  Printer,
  Puzzle,
  QrCode,
  Receipt,
  RefreshCw,
  Repeat,
  ScanLine,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Tag,
  TrendingUp,
  Truck,
  User,
  Users,
  Video,
  Wallet,
  Warehouse,
  Wrench,
} from 'lucide-react';

/** Every icon a `NavItem.icon` string may name. Keys are the lucide export names. */
export const NAV_ICONS = {
  BarChart3,
  Barcode,
  Bell,
  Boxes,
  Calendar,
  Camera,
  ClipboardCheck,
  ClipboardList,
  CloudOff,
  Coins,
  CreditCard,
  FileText,
  Gift,
  Grid3X3,
  Heart,
  Home,
  Layers,
  ListOrdered,
  MapPin,
  Megaphone,
  MessageSquare,
  Package,
  PackageCheck,
  Percent,
  PieChart,
  Printer,
  Puzzle,
  QrCode,
  Receipt,
  RefreshCw,
  Repeat,
  ScanLine,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Tag,
  TrendingUp,
  Truck,
  User,
  Users,
  Video,
  Wallet,
  Warehouse,
  Wrench,
} as const satisfies Record<string, LucideIcon>;

/** The names {@link resolveNavIcon} knows. In-tree manifests get autocomplete. */
export type NavIconName = keyof typeof NAV_ICONS;

/** Shown when a module names an icon this build doesn't have. */
export const FALLBACK_NAV_ICON: LucideIcon = Puzzle;

export function isNavIconName(value: string): value is NavIconName {
  return Object.prototype.hasOwnProperty.call(NAV_ICONS, value);
}

/**
 * A `NavItem.icon` → the component to render. Passes a component through
 * untouched (legacy/in-tree direct references), maps a known name, and falls
 * back to {@link FALLBACK_NAV_ICON} for a name this build doesn't ship — a
 * module named by an older/newer host must never blank out its own nav entry.
 */
export function resolveNavIcon(icon: LucideIcon | string | undefined): LucideIcon | undefined {
  if (!icon) return undefined;
  if (typeof icon !== 'string') return icon;
  return isNavIconName(icon) ? NAV_ICONS[icon] : FALLBACK_NAV_ICON;
}
