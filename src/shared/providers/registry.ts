import {
  AGENT_PROVIDER_IDS,
  getProvider,
  isValidProviderId,
  type AgentProviderId,
} from '@shared/agent-provider-registry';

export type ProviderId = AgentProviderId;

export { AGENT_PROVIDER_IDS, getProvider, isValidProviderId };
