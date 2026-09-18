// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * An error boundary for a module slot rendered *inside* a host screen.
 *
 * `renderRoutes` gives a module's own route a `RouteErrorBoundary` — a
 * full-screen error page with a retry and a reload. That is right for a screen
 * the module owns and wrong for a slot: a bouquet catalog that throws must cost
 * the shop a plainer catalog rather than the ability to sell, and a panel that
 * throws on the owner's dashboard must cost three figures rather than the
 * dashboard.
 *
 * So this renders `fallback` instead — whatever "the host's screen without the
 * module" looks like, down to `null` — and hands the error to the caller, which
 * knows what the event is called.
 */

import { Component, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  onError?: (error: unknown) => void;
  children: ReactNode;
}

export class SlotBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
