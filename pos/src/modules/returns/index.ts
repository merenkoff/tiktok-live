// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Public surface of the `returns` module.
export { returnsModule } from './manifest';
export { useCancelRungSale } from './hooks/useCancelRungSale';
export type { CancelRungSale } from './hooks/useCancelRungSale';
// The «Акт про видачу коштів» for the sell screen's exchange success (clothing
// R1): the act is this module's, the screen that prints it after an exchange
// is the host's. Small enough to travel statically — unlike the dialog above,
// which is lazy because checkout must stay reachable with `returns` disabled.
export { usePrintableAct } from './hooks/usePrintableAct';
export { buildActPayload } from './lib/actPayload';
export type { ActData } from './lib/actPayload';
export { needsAct } from './lib/refundReasons';
