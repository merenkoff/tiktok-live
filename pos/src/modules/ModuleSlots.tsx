// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Draws what `useModuleSlots` resolved, one module at a time (phase Г2).
 *
 * Each module gets a `SlotBoundary` of its own: two modules side by side in
 * one slot must not be able to take each other down, and neither may take the
 * host's screen down. A lazy component shows `placeholder` while its chunk
 * arrives — nothing by default, because a button that appears a beat late is
 * better than a box that jumps.
 */

import { Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { SlotBoundary } from './SlotBoundary';
import type { ModuleSlotName, ResolvedModuleSlot } from './featureSlots';
import { reportModuleEvent } from './telemetry';

type SlotComponent<P> = ComponentType<P> | LazyExoticComponent<ComponentType<P>>;

interface Props<P extends object> {
  slots: ResolvedModuleSlot<SlotComponent<P>>[];
  slot: ModuleSlotName;
  props: P;
  placeholder?: ReactNode;
  /** Report a module that threw; the default names the slot. */
  onError?: (moduleId: string, error: unknown) => void;
}

export function ModuleSlots<P extends object>({ slots, slot, props, placeholder = null, onError }: Props<P>) {
  return (
    <>
      {slots.map(({ value, moduleId }) => {
        // A lazy component renders exactly like a plain one; the union only
        // trips JSX's check of generic props.
        const Component = value as ComponentType<P>;
        return (
          <SlotBoundary
            key={moduleId}
            fallback={null}
            onError={(error) =>
              onError
                ? onError(moduleId, error)
                : reportModuleEvent({ type: 'module_slot_error', slot, moduleId, error })
            }
          >
            <Suspense fallback={placeholder}>
              <Component {...(props as P & JSX.IntrinsicAttributes)} />
            </Suspense>
          </SlotBoundary>
        );
      })}
    </>
  );
}
