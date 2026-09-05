// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { Component, Fragment, type ReactNode } from 'react';
import { reportModuleEvent } from '../modules/telemetry';

interface Props {
  moduleId: string;
  /** Human title of the section, for the fallback copy. */
  title: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  /** How many times this boundary has caught — drives soft-retry vs reload. */
  failCount: number;
  /** Bumped on retry to remount the subtree. */
  resetKey: number;
}

/**
 * Wraps one lazily-loaded module route. A page chunk that fails to load
 * (remote down, chunk 404, a network blip that outlived `lazyWithRetry`'s own
 * retries) or throws while rendering lands here instead of blanking the app.
 * First catch offers a soft retry (remount — recovers a transient render
 * error); a second offers a full reload, since `React.lazy` caches a rejected
 * import for the session.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, failCount: 0, resetKey: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    reportModuleEvent({ type: 'route_render_error', moduleId: this.props.moduleId, error });
  }

  private softRetry = (): void => {
    this.setState((s) => ({ hasError: false, failCount: s.failCount + 1, resetKey: s.resetKey + 1 }));
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      // Fragment key (no DOM wrapper) so a retry remounts the subtree without
      // disturbing the layout flex chain from AdminLayout/CashierLayout.
      return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
    }

    const canSoftRetry = this.state.failCount < 1;

    return (
      <div className="min-h-screen grid place-items-center bg-sq-bg font-sans p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <p className="sq-section-label">Помилка завантаження</p>
          <h1 className="text-lg font-semibold text-sq-text">
            Не вдалося завантажити розділ «{this.props.title}»
          </h1>
          <p className="text-sm text-sq-secondary">Перевірте зʼєднання та спробуйте ще раз.</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="sq-btn-primary px-4 py-2.5 text-sm"
              onClick={canSoftRetry ? this.softRetry : () => window.location.reload()}
            >
              {canSoftRetry ? 'Повторити' : 'Перезавантажити застосунок'}
            </button>
            <a href="/" className="text-sm text-sq-blue hover:underline">
              На головну
            </a>
          </div>
        </div>
      </div>
    );
  }
}
