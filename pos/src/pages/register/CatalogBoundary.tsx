// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Component, type ReactNode } from 'react';
import { reportModuleEvent } from '../../modules/telemetry';
import type { SalesCatalogProps } from '../../modules/types';

/**
 * Renders the store's own catalog and, if it throws, the bundled one instead.
 *
 * `/register` is the one `eager` route — `renderRoutes` gives it no
 * `RouteErrorBoundary` on purpose, so the sell screen never flashes a loading
 * state — which means the frame has to own this itself. A vertical module that
 * throws must cost the shop a plainer catalog, not the ability to sell.
 */
export class CatalogBoundary extends Component<
  {
    moduleId: string;
    vertical: string;
    fallback: ReactNode;
    children: ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportModuleEvent({
      type: 'vertical_catalog_fallback',
      moduleId: this.props.moduleId,
      vertical: this.props.vertical,
      reason: 'render_error',
      error,
    });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export type { SalesCatalogProps };
