// Public API of @clawforger/core
export * from './types';
export * from './chains';
export { Agent } from './agent';
export { MockInference, ZGComputeInference } from './inference';
export type { ZGComputeOpts } from './inference';
export {
  PERSONAS,
  detectPersona,
  buildPersonaCodegenHint,
} from './personas';
export type { PersonaConfig, PersonaApi } from './personas';

// Re-export ABIs as JSON modules — consumers `import abi from '@clawforger/core/abis/ClawforgerINFT.json'`
// (path-based, see package.json `exports`)
