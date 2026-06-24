/**
 * Plugin factory — `agentPlugin()`.
 *
 * Registers the Agents collection and all endpoints in a single call.
 */

import type { Config, Plugin } from 'payload'
import { createAgentsCollection } from './collections/agents'
import { enqueueExistingLiteLlmVirtualKeySyncs, LITELLM_SYNC_QUEUE } from './collections/hooks/sync-litellm-virtual-key'
import { createSyncLiteLlmVirtualKeyTask } from './collections/jobs/sync-litellm-virtual-key-task'
import { createAgentsInternalListHandler } from './endpoints/agents-internal-list'
import { createAgentsListHandler } from './endpoints/agents-list'
import { createChatHandler } from './endpoints/chat'
import { createModelsListHandler } from './endpoints/models'
import { createSessionDeleteHandler, createSessionGetHandler, createSessionPatchHandler } from './endpoints/session'
import { createSessionsListHandler } from './endpoints/sessions'
import { createUsageHandler } from './endpoints/usage'
import { defaultBuildSessionId, defaultValidateSessionOwnership } from './lib/session-id'
import type { AgentPluginConfig, ResolvedPluginConfig } from './types'

type Endpoints = NonNullable<Config['endpoints']>
type JobsConfig = NonNullable<Config['jobs']>
type AutoRunConfig = NonNullable<JobsConfig['autoRun']>
type AutorunCronConfig = Extract<AutoRunConfig, unknown[]>[number]

function mergeAutoRun(incoming: JobsConfig['autoRun'], additions: AutorunCronConfig[]): AutoRunConfig {
  if (!incoming) return additions
  if (Array.isArray(incoming)) return [...incoming, ...additions]
  // Host configured autoRun as a function — compose so both still run.
  return async payload => [...(await incoming(payload)), ...additions]
}

/**
 * Merge the LiteLLM virtual-key sync task + its autoRun into the host's jobs
 * config. The task runs on a dedicated `litellm-sync` queue scanned every
 * minute (up to 20 jobs), so it never competes with the host's own jobs.
 */
function buildLiteLlmJobs(incoming: JobsConfig | undefined, config: ResolvedPluginConfig): JobsConfig {
  const tasks = [...(incoming?.tasks ?? []), createSyncLiteLlmVirtualKeyTask(config)]
  const autoRun: AutorunCronConfig[] = [{ queue: LITELLM_SYNC_QUEUE, cron: '* * * * *', limit: 20 }]
  // Required by the sync task's `concurrency` key — adds the `concurrencyKey`
  // column to payload_jobs (see migration) so per-agent jobs run exclusively.
  return { ...incoming, tasks, autoRun: mergeAutoRun(incoming?.autoRun, autoRun), enableConcurrencyControl: true }
}

function resolveConfig(userConfig: AgentPluginConfig): ResolvedPluginConfig {
  const runtimeSecret = userConfig.runtimeSecret ?? ''
  if (!runtimeSecret) {
    console.warn('[agent-plugin] runtimeSecret is empty — all runtime requests will be unauthenticated')
  }
  const gatewayUrl = userConfig.modelCatalog.gatewayUrl.replace(/\/$/, '')
  const masterKey = userConfig.modelCatalog.masterKey ?? ''
  // LiteLLM is a hard dependency: an empty admin key would make every /key
  // management call go out as `Bearer ` → 401 → every sync silently fails closed.
  // Fail fast at boot with a clear error instead of degrading invisibly.
  if (!gatewayUrl || !masterKey) {
    throw new Error(
      '[agent-plugin] modelCatalog.gatewayUrl and masterKey are required — LiteLLM is a hard dependency; the admin key mints per-agent virtual keys (set LITELLM_GATEWAY_URL / LITELLM_MASTER_KEY)'
    )
  }
  return {
    runtimeUrl: userConfig.runtimeUrl,
    runtimeSecret,
    getDailyLimit: userConfig.getDailyLimit,
    buildSessionId: userConfig.buildSessionId ?? defaultBuildSessionId,
    validateSessionOwnership: userConfig.validateSessionOwnership ?? defaultValidateSessionOwnership,
    extractTenantId: userConfig.extractTenantId,
    getRuntimeHeaders: userConfig.getRuntimeHeaders,
    collectionSlug: userConfig.collectionSlug ?? 'agents',
    basePath: userConfig.basePath ?? '/agents',
    encryptionKey: userConfig.encryptionKey,
    mediaCollectionSlug: userConfig.mediaCollectionSlug,
    collectionOverrides: userConfig.collectionOverrides,
    onRunCompleted: userConfig.onRunCompleted,
    modelCatalog: {
      gatewayUrl,
      masterKey,
      cacheTtlMs: userConfig.modelCatalog.cacheTtlMs ?? 60_000
    }
  }
}

function assertCollectionExists(config: Config, slug: string, configField: string): void {
  const exists = (config.collections ?? []).some(c => c.slug === slug)
  if (!exists) {
    throw new Error(
      `[agent-plugin] collection "${slug}" referenced by ${configField} is not registered in payload config`
    )
  }
}

function endpointList(endpoints: false | Endpoints | undefined): Endpoints {
  return Array.isArray(endpoints) ? endpoints : []
}

export function agentPlugin(userConfig: AgentPluginConfig): Plugin {
  return (incomingConfig: Config): Config => {
    const config = resolveConfig(userConfig)
    const basePath = config.basePath
    const incomingOnInit = incomingConfig.onInit

    assertCollectionExists(incomingConfig, config.mediaCollectionSlug, 'mediaCollectionSlug')

    // Create the agents collection + register the internal-list endpoint on
    // it (X-Internal-Secret + overrideAccess; replaces the old runtime-secret
    // bypass that lived in the host's collection access functions).
    const agentsCollection = createAgentsCollection(config)
    agentsCollection.endpoints = [
      ...endpointList(agentsCollection.endpoints),
      {
        path: '/internal/list',
        method: 'get' as const,
        handler: createAgentsInternalListHandler(config)
      }
    ]

    // Register endpoints on the collection
    const endpoints = [
      {
        path: basePath,
        method: 'post' as const,
        handler: createChatHandler(config)
      },
      {
        path: `${basePath}/session`,
        method: 'get' as const,
        handler: createSessionGetHandler(config)
      },
      {
        path: `${basePath}/session`,
        method: 'patch' as const,
        handler: createSessionPatchHandler(config)
      },
      {
        path: `${basePath}/session`,
        method: 'delete' as const,
        handler: createSessionDeleteHandler(config)
      },
      {
        path: `${basePath}/sessions`,
        method: 'get' as const,
        handler: createSessionsListHandler(config)
      },
      {
        path: `${basePath}/agents`,
        method: 'get' as const,
        handler: createAgentsListHandler(config)
      },
      {
        path: `${basePath}/usage`,
        method: 'get' as const,
        handler: createUsageHandler(config)
      }
    ]

    endpoints.push({
      path: `${basePath}/models`,
      method: 'get' as const,
      handler: createModelsListHandler(config)
    })

    return {
      ...incomingConfig,
      collections: [...(incomingConfig.collections ?? []), agentsCollection],
      endpoints: [...endpointList(incomingConfig.endpoints), ...endpoints],
      jobs: buildLiteLlmJobs(incomingConfig.jobs, config),
      onInit: async payload => {
        await incomingOnInit?.(payload)
        await enqueueExistingLiteLlmVirtualKeySyncs(payload, config)
      }
    }
  }
}
