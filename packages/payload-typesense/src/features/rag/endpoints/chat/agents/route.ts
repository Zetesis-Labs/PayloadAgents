import type { PayloadRequest } from 'payload';
import { RAGFeatureConfig } from '../../../../../shared/types/plugin-types.js';
import { jsonResponse } from '../validators/index.js';
import type { AgentConfig } from '@nexo-labs/payload-typesense'

export type AgentsEndpointConfig = {
  ragConfig: RAGFeatureConfig;
  checkPermissions: (req: PayloadRequest) => Promise<boolean>;
};

export function createAgentsGETHandler(config: AgentsEndpointConfig) {
  return async function GET(req: PayloadRequest) {
    try {
      let agents: AgentConfig[] = [];
      const configuredAgents = config.ragConfig?.agents;

      if (typeof configuredAgents === 'function') {
        agents = await configuredAgents(req.payload);
      } else if (Array.isArray(configuredAgents)) {
        agents = configuredAgents;
      }

      // Map to PublicAgentInfo
      const publicAgents = agents.map(agent => ({
        slug: agent.slug,
        name: agent.name || agent.slug,
        welcomeTitle: agent.welcomeTitle,
        welcomeSubtitle: agent.welcomeSubtitle,
        suggestedQuestions: agent.suggestedQuestions,
        avatar: agent.avatar
      }));

      return jsonResponse({ agents: publicAgents }, { status: 200 });
    } catch (error) {
      return jsonResponse({ error: 'Internal Server Error' }, { status: 500 });
    }
  };
}
