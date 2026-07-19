import { type CoreFactory } from './core-contract';
import { createCore as createZustandCore } from './a-zustand/core';
import { createCore as createXstateMachineCore } from './a-xstate-machine/core';
import { createCore as createXstateStoreCore } from './a-xstate-store/core';

export interface SpikeVariant {
  readonly name: string;
  readonly createCore: CoreFactory;
}

export const variants: readonly SpikeVariant[] = [
  { name: 'a-zustand', createCore: createZustandCore },
  { name: 'a-xstate-machine', createCore: createXstateMachineCore },
  { name: 'a-xstate-store', createCore: createXstateStoreCore },
];
