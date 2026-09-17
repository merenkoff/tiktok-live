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
