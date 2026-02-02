/**
 * Shared Agent Importer Service
 * Centralizes logic for importing hardcoded agents into PayloadCMS
 */

import type { Payload } from 'payload'
import { agents as hardcodedAgents } from './index'

export interface ImportResults {
    imported: string[]
    skipped: string[]
    errors: string[]
}

/**
 * Import hardcoded agents into PayloadCMS if they don't exist
 * Returns results of the operation
 */
export async function importHardcodedAgents(payload: Payload): Promise<ImportResults> {
    const results: ImportResults = {
        imported: [],
        skipped: [],
        errors: [],
    }

    console.log(`[typesense] Auto-importing ${hardcodedAgents.length} hardcoded agents...`)

    for (const agent of hardcodedAgents) {
        try {
            // Check if agent already exists
            const existing = await payload.find({
                collection: 'agents',
                where: { slug: { equals: agent.slug } },
                limit: 1,
            })

            if (existing.docs.length > 0) {
                console.log(`[typesense] Agent ${agent.slug} already exists, skipping`)
                results.skipped.push(agent.slug)
                continue
            }

            // Create the agent
            await payload.create({
                collection: 'agents',
                data: {
                    name: agent.name,
                    slug: agent.slug,
                    isActive: true,
                    llmModel: agent.llmModel,
                    systemPrompt: agent.systemPrompt,
                    tenant: 2,
                    searchCollections: agent.searchCollections,
                    kResults: agent.kResults,
                    maxContextBytes: agent.maxContextBytes,
                    ttl: agent.ttl,
                    welcomeTitle: agent.welcomeTitle,
                    welcomeSubtitle: agent.welcomeSubtitle,
                    suggestedQuestions: agent.suggestedQuestions,
                    apiKey: agent.apiKey,
                },
            })

            console.log(`[typesense] Imported agent: ${agent.name}`)
            results.imported.push(agent.slug)
        } catch (error) {
            const errorMsg = `${agent.slug}: ${error instanceof Error ? error.message : 'Unknown error'}`
            console.error(`[typesense] Error importing agent ${agent.slug}:`, error)
            results.errors.push(errorMsg)
        }
    }

    return results
}
