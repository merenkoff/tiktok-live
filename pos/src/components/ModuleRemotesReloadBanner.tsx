// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * "Reload to pick up new module code" — the one place both shells send the
 * user when `applyModuleRemotes()` (which only runs at boot) is behind:
 *
 *  - the store's `module_remotes` changed since boot (roadmap #9, both shells);
 *  - the desktop cashier's background sync downloaded a newer module version,
 *    or finished downloading one that was still a placeholder at boot
 *    (roadmap #12 track 1).
 *
 * Dismissable on purpose: on the till this can pop mid-sale, and a reload
 * would drop the cart.
 */
interface Props {
  message: string;
  onDismiss: () => void;
}

export function ModuleRemotesReloadBanner({ message, onDismiss }: Props) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 border-t border-sq-divider bg-sq-surface px-4 py-3 text-sm text-sq-text shadow-lg"
    >
      <span className="text-sq-secondary">{message}</span>
      <button className="sq-btn-primary px-3 py-1.5" onClick={() => window.location.reload()}>
        Перезавантажити
      </button>
      <button className="px-2 py-1.5 text-sq-secondary hover:text-sq-text" onClick={onDismiss}>
        Пізніше
      </button>
    </div>
  );
}
