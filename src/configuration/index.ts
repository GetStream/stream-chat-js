export * from './shape';
export * from './types';
export * from './utils';
// Reached as `client.config`, never constructed by integrators: export the type only.
export type {
  ConfiguredInstance,
  InstanceConfigurationRegistry,
} from './InstanceConfigurationRegistry';
