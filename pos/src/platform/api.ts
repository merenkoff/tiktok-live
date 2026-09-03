// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Platform SDK — the frozen surface a feature module is allowed to import.
// Modules import from '@pos/platform', never from '../../services' etc.

export { api, isNetworkError, isUnauthorized } from '../services/api';
