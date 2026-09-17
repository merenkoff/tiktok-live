// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// `Nav`/`AppRail`/`BottomNav`/`OfflineStatusBanner` are intentionally NOT
// here: `Nav` reads the full module registry to render nav links, so a
// module rendering them itself would pull every other module's lazy pages
// into its own remote artifact. The host applies them as a layout wrapper
// instead (`CashierLayout`, `renderRoutes.tsx`) — a module page is just its
// own content.
export { BarcodeScanner } from '../components/BarcodeScanner';
export { ProductPhotoField } from '../components/ProductPhotoField';
export { CustomerPicker } from '../components/cashier/CustomerPicker';
export { useDragScroll } from '../hooks/useDragScroll';
export { AttributeFields } from '../components/AttributeFields';
// The catalog surface a sales-vertical module builds its screen from. `Nav` and
// the shell chrome stay out (see above); these render only their own content.
export { ProductTile } from '../components/cashier/ProductTile';
export { TagFolderTile } from '../components/cashier/TagFolderTile';
export { VariantPicker } from '../components/cashier/VariantPicker';
export { CatalogTagBar } from '../components/cashier/CatalogTagBar';
export { ScanWedge } from '../components/cashier/ScanWedge';
// The price tag, rendered off-screen and made visible only to the print engine
// by the `@media print` rules in `styles/tokens.css`. Those rules ship with the
// HOST page, not with a module's `style.css` (which is Tailwind utilities
// only), so a runtime-loaded module gets them for free and needs no CSS of its
// own for this — see `scripts/module-tailwind.mjs`.
export { PriceTagsPrintable } from '../components/PriceTagsPrintable';
export type { TagPaperWidth } from '../components/PriceTagsPrintable';
