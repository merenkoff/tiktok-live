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
// Two host slots and no page of its own:
//   - `checkout.Action` — «З кухні» above «Оплатити» on the cafe's till: ask
//     the kitchen, tell the guest, and hold «Оплатити» (`setCheckoutHold`)
//     until the guest agreed to a time the kitchen still stands by;
//   - `till.Banner` — «Запити з точок» over every screen of the kitchen's
//     till, the board above all, without the board knowing it exists.
// No `offline` hooks: the kitchen cooks only on the server's word, so every
// write needs the network and an offline receipt with a kitchen order is
// refused rather than queued.

// Type-only import — erased at build time, so this does NOT pull the bundled
// registry (and every manifest alongside it) into the remote chunk.
import type { RemoteModuleDescriptor } from '@host/modules/registry';
import { lazyWithRetry } from '@host/modules/lazyWithRetry';

const KitchenCheckoutAction = lazyWithRetry(() => import('./checkout/KitchenCheckoutAction'));
const RemoteKitchenBanner = lazyWithRetry(() => import('./kitchen/RequestsStrip'));

export const REMOTE_KITCHEN_ID = 'remote-kitchen';

export const remoteKitchenModule: RemoteModuleDescriptor = {
  id: REMOTE_KITCHEN_ID,
  title: 'Віддалена кухня',
  shells: ['web', 'cashier', 'tablet'],
  alwaysEnabled: true,
  checkout: { Action: KitchenCheckoutAction },
  till: { Banner: RemoteKitchenBanner },
  // No page: the store's `module_remotes` entry still names a `routePath` and
  // a nav entry, which only shape the desktop's placeholder until the bundle
  // is downloaded — as `vertical-grocery`'s do.
  routes: [],
  nav: [],
};
