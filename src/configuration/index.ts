export * from './applyInstanceConfiguration';
export * from './serverAuthority';
export * from './shape';
export * from './types';
// The service is reached as `client.config`, never constructed by integrators — export the type only.
export type {
  ConfiguredInstance,
  InstanceConfigurationService,
} from './InstanceConfigurationService';
