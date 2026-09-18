// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Renders the store's own catalog and, if it throws, the bundled one instead.
 *
 * `/register` is the one `eager` route — `renderRoutes` gives it no
 * `RouteErrorBoundary` on purpose, so the sell screen never flashes a loading
 * state — which means the frame has to own this itself. A vertical module that
 * throws must cost the shop a plainer catalog, not the ability to sell.
 *
 * The mechanism is `SlotBoundary`; what is this file's own is the name of the
 * event, which is the same one `resolveSalesCatalog` reports when the module
 * never loaded at all.
 */

import type { ReactNode } from 'react';
import { SlotBoundary } from '../../modules/SlotBoundary';
import { reportModuleEvent } from '../../modules/telemetry';

export function CatalogBoundary({
  moduleId,
  vertical,
  fallback,
  children,
}: {
  moduleId: string;
  vertical: string;
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    <SlotBoundary
      fallback={fallback}
      onError={(error) =>
        reportModuleEvent({
          type: 'vertical_catalog_fallback',
          moduleId,
          vertical,
          reason: 'render_error',
          error,
        })
      }
    >
      {children}
    </SlotBoundary>
  );
}
