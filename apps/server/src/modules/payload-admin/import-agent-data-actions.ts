'use server'

import { getPayload } from '@/modules/get-payload'
import { Post } from '@/payload-types'
import { seedPost } from '@/seed/post.seed'
import fs from 'fs'
import path from 'path'

interface ImportResult {
  success: boolean
  message: string
  agentSlug?: string
  dataFile?: string
  totalEntries?: number
  results?: {
    imported: number
    skipped: number
    errors: string[]
  }
}

export async function importAgentData({ agentId }: { agentId: string | number }): Promise<ImportResult> {
  const payload = await getPayload()

  try {
    const agent = await payload.findByID({
      collection: 'agents',
      id: agentId,
    })

    if (!agent) {
      return { success: false, message: 'Agent not found' }
    }

    const slug = agent.slug as string
    const name = (agent.name as string || '').toLowerCase().replace(/\s+/g, '_')
    payload.logger.info(`[Agent Data Import] Starting import for agent: ${slug}`)

    // Look for data file
    const possiblePaths = [
      path.join(process.cwd(), 'data', `${slug}_data.json`),
      path.join(process.cwd(), 'data', `${name}_data.json`),
    ]

    let dataFilePath: string | null = null
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        dataFilePath = p
        break
      }
    }

    if (!dataFilePath) {
      return {
        success: false,
        message: `Data file not found. Expected: ${slug}_data.json in /data folder`,
      }
    }

    payload.logger.info(`[Agent Data Import] Found data file: ${dataFilePath}`)

    // Parse JSON
    const fileContent = fs.readFileSync(dataFilePath, 'utf-8')
    const parsed = JSON.parse(fileContent)
    const entries: Post[] = Array.isArray(parsed) ? parsed : [parsed]

    payload.logger.info(`[Agent Data Import] Found ${entries.length} entries to process`)

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    }

    // Use seedPost for each entry
    const seeder = seedPost(payload, 'upsert')

    for (const entry of entries) {
      try {
        await seeder(entry)
        results.imported++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        results.errors.push(`Entry ${entry.id}: ${errorMsg}`)
        payload.logger.error(`[Agent Data Import] Error processing entry ${entry.id}: ${errorMsg}`)
      }
    }

    payload.logger.info(
      `[Agent Data Import] Completed: ${results.imported} imported, ${results.errors.length} errors`,
    )

    return {
      success: true,
      message: 'Import completed',
      agentSlug: slug,
      dataFile: path.basename(dataFilePath),
      totalEntries: entries.length,
      results,
    }
  } catch (error) {
    payload.logger.error(`[Agent Data Import] Fatal error: ${error}`)
    return {
      success: false,
      message: `Failed to import data: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
