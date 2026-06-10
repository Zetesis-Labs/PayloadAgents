/**
 * Plugin factory — `agentPlugin()`.
 *
 * Registers the Agents collection and all endpoints in a single call.
 */

import type { Config, Plugin } from 'payload'
import { createAgentsCollection } from './collections/agents'
import { createAgentsInternalListHandler } from './endpoints/agents-internal-list'
import { createAgentsListHandler } from './endpoints/agents-list'
import { createChatHandler } from './endpoints/chat'
import { createModelsListHandler } from './endpoints/models'
import { createSessionDeleteHandler, createSessionGetHandler, createSessionPatchHandler } from './endpoints/session'
import { createSessionsListHandler } from './endpoints/sessions'
import { createUsageHandler } from './endpoints/usage'
import { defaultBuildSessionId, defaultValidateSessionOwnership } from './lib/session-id'
import type { AgentPluginConfig, ResolvedPluginConfig } from './types'

function resolveConfig(userConfig: AgentPluginConfig): ResolvedPluginConfig {
  const runtimeSecret = userConfig.runtimeSecret ?? ''
  if (!runtimeSecret) {
    console.warn('[agent-plugin] runtimeSecret is empty — all runtime requests will be unauthenticated')
  }
  return {
    runtimeUrl: userConfig.runtimeUrl,
    runtimeSecret,
    getDailyLimit: userConfig.getDailyLimit,
    buildSessionId: userConfig.buildSessionId ?? defaultBuildSessionId,
    validateSessionOwnership: userConfig.validateSessionOwnership ?? defaultValidateSessionOwnership,
    getRuntimeHeaders: userConfig.getRuntimeHeaders,
    collectionSlug: userConfig.collectionSlug ?? 'agents',
    basePath: userConfig.basePath ?? '/agents',
    encryptionKey: userConfig.encryptionKey,
    mediaCollectionSlug: userConfig.mediaCollectionSlug,
    collectionOverrides: userConfig.collectionOverrides,
    onRunCompleted: userConfig.onRunCompleted,
    modelCatalog: userConfig.modelCatalog
      ? {
          gatewayUrl: userConfig.modelCatalog.gatewayUrl.replace(/\/$/, ''),
          masterKey: userConfig.modelCatalog.masterKey ?? '',
          cacheTtlMs: userConfig.modelCatalog.cacheTtlMs ?? 60_000
        }
      : undefined
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

export function agentPlugin(userConfig: AgentPluginConfig): Plugin {
  return (incomingConfig: Config): Config => {
    const config = resolveConfig(userConfig)
    const basePath = config.basePath

    assertCollectionExists(incomingConfig, config.mediaCollectionSlug, 'mediaCollectionSlug')

    // Create the agents collection + register the internal-list endpoint on
    // it (X-Internal-Secret + overrideAccess; replaces the old runtime-secret
    // bypass that lived in the host's collection access functions).
    const agentsCollection = createAgentsCollection(config)
    agentsCollection.endpoints = [
      ...(agentsCollection.endpoints ?? []),
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

    if (config.modelCatalog) {
      endpoints.push({
        path: `${basePath}/models`,
        method: 'get' as const,
        handler: createModelsListHandler(config)
      })
    }

    return {
      ...incomingConfig,
      collections: [...(incomingConfig.collections ?? []), agentsCollection],
      endpoints: [...(incomingConfig.endpoints ?? []), ...endpoints]
    }
  }
}
