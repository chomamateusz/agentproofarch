import { type CoreFactory } from './core-contract';

export interface SpikeVariant {
  readonly name: string;
  readonly createCore: CoreFactory;
}

export const variants: readonly SpikeVariant[] = [];
