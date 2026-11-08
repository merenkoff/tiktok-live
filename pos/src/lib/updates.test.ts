// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The install command gets the deployment's delivery token as `updateToken`
// (Tauri maps it to the Rust command's `update_token`) — TechDocs/POS_LICENSING.md 2D-B.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { installUpdate } from './updates';

const TOKEN = 'v1.q83vEjRWeJq83vEjRWeJqwNd5g7O.AbCdEfGhIjKlMnOpQrStUv';

afterEach(() => {
  vi.mocked(invoke).mockClear();
});

describe('installUpdate', () => {
  it('hands the token to the install command', async () => {
    await installUpdate(TOKEN);
    expect(invoke).toHaveBeenCalledWith('install_update', { updateToken: TOKEN });
  });

  it('still installs, with no token, when there is none', async () => {
    await installUpdate();
    expect(invoke).toHaveBeenCalledWith('install_update', { updateToken: null });
    await installUpdate(null);
    expect(invoke).toHaveBeenLastCalledWith('install_update', { updateToken: null });
  });
});
