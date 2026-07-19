import { type CoreFactory } from './core-contract';
import { createCore as createZustandCore } from './a-zustand/core';

export interface SpikeVariant {
  readonly name: string;
  readonly createCore: CoreFactory;
}

export const variants: readonly SpikeVariant[] = [
  { name: 'a-zustand', createCore: createZustandCore },
];
