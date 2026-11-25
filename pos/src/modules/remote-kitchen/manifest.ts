// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Віддалена кухня» — a cafe's till asks another store's kitchen how long its
// pizza will take, and pays the kitchen's dishes with its own receipt
// (TechDocs/POS_REMOTE_KITCHEN.md).
//
// Its own module, not part of the café vertical: only a cafe that sells what a
// remote kitchen cooks needs it, so a store opts in through `module_remotes`
// and every other café never downloads or runs a line of it. Delivered like
// `pass` and `tables`: the shell ships none of this code, and the server's
// routes are a core group gated by the LINK between two stores, which only the
// super admin writes. The server refuses this entry in `module_remotes`
// without `vertical-cafe` (`MODULE_REQUIRES`): the kitchen's board is the café
// vertical's page.
//
// Two host slots and two pages:
//   - `checkout.Action` — «З кухні» above «Оплатити» on the cafe's till: ask
//     the kitchen, tell the guest, and hold «Оплатити» (`setCheckoutHold`)
//     until the guest agreed to a time the kitchen still stands by;
//   - `till.Banner` — «Запити з точок» over every screen of the kitchen's
//     till, the board above all, without the board knowing it exists; and
//     on the cafe's till «Замовлення з кухні» (РК5), where its paid orders
//     are, with «Привезли», «Видали гостю» and the kitchen's cancels;
//   - «Прийом запитів» on the kitchen's till (`/remote-kitchen`, РК4): the
//     pause and the queue for the cook, in a kitchen store only;
//   - «Віддалена кухня» in the owner's cabinet (`/admin/remote-kitchen`, РК4):
//     the cafe's «Кухня» — timers and which dishes the kitchen cooks, with the
//     kitchen's menu imported at the cafe's prices — and the kitchen's
//     «Точки» — its pause, its queue and the cafes that ask it. The link
//     itself is still the super-admin's.
// No `offline` hooks: the kitchen cooks only on the server's word, so every
// write needs the network and an offline receipt with a kitchen ORDER is
// refused rather than queued. Offline the kitchen's word comes by phone
// instead (РК5, §8): the block writes the time down into the host's cart
// (`remotePhone`), and that rides with the queued receipt to the server.

// Type-only import — erased at build time, so this does NOT pull the bundled
// registry (and every manifest alongside it) into the remote chunk.
import type { RemoteModuleDescriptor } from '@host/modules/registry';
import { lazyWithRetry } from '@host/modules/lazyWithRetry';
import { isKitchenStore } from './lib/hostPlatform';

const KitchenCheckoutAction = lazyWithRetry(() => import('./checkout/KitchenCheckoutAction'));
const RemoteKitchenBanner = lazyWithRetry(() => import('./till/TillBanner'));
const RemoteKitchenPage = lazyWithRetry(() => import('./admin/RemoteKitchenPage'));
const KitchenTillPage = lazyWithRetry(() => import('./kitchen/KitchenTillPage'));

export const REMOTE_KITCHEN_ID = 'remote-kitchen';

export const remoteKitchenModule: RemoteModuleDescriptor = {
  id: REMOTE_KITCHEN_ID,
  title: 'Віддалена кухня',
  shells: ['web', 'cashier', 'tablet'],
  alwaysEnabled: true,
  checkout: { Action: KitchenCheckoutAction },
  till: { Banner: RemoteKitchenBanner },
  // The owner's page, and the kitchen's «Прийом запитів» on the till — the
  // pause and the queue where the cook works, shown only in a kitchen store.
  // The store's `module_remotes` entry names `/remote-kitchen`, which is that
  // till page, as the desktop's placeholder until the bundle is downloaded.
  routes: [
    { path: 'remote-kitchen/*', mount: 'admin', element: RemoteKitchenPage },
    { path: '/remote-kitchen/*', element: KitchenTillPage },
  ],
  nav: [
    // `ChefHat` is in the host's `NAV_ICONS` allowlist (platform 24).
    { to: '/admin/remote-kitchen', label: 'Віддалена кухня', icon: 'ChefHat', location: 'admin-sidebar', order: 44 },
    {
      to: '/remote-kitchen',
      label: 'Прийом запитів',
      icon: 'ChefHat',
      location: 'cashier-primary',
      order: 62,
      match: '/remote-kitchen',
      visible: isKitchenStore,
    },
  ],
};
