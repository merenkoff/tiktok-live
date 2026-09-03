// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModuleDescriptor } from '../types';

/**
 * QR payment method. No page — gates the QR button in checkout and the QR
 * subsection in Settings, on top of the existing `qr_payment_enabled` flag.
 * Backend `POST /qr/invoice` is gated; `POST /qr/webhook` is not (HMAC only).
 */
export const qrPaymentModule: ModuleDescriptor = {
  id: 'qr-payment',
  title: 'QR-оплата',
  defaultEnabled: true,
  shells: ['web', 'cashier'],
  routes: [],
  nav: [],
};
