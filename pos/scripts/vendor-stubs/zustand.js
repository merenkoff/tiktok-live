// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Self-hosted `zustand` vendor chunk. `react` external. Shared so a module
// that creates its own zustand store binds to the same React as the host —
// and so `@pos/platform`'s stores are one instance across the boundary.
export * from 'zustand';
export { default } from 'zustand';
