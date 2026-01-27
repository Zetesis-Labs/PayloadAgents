import type { Endpoint } from 'payload'
import { APIError } from 'payload'
import { isSuperAdmin } from '@/access/isSuperAdmin'
import { getUserTenantIDs } from '@/utilities/getUserTenantIDs'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import {
  convertMarkdownToLexical,
  editorConfigFactory
} from '@payloadcms/richtext-lexical'

interface DataEntry {
  id: string
  url: string
  title: string
  content_markdown: string
  categories?: string[]
  related_links?: {
    videos?: Array<{ url?: string; title?: string } | string>
    books?: Array<{ url?: string; title?: string } | string>
    other?: Array<{ url?: string; title?: string } | string>
  }
}

/**
 * Normalize related links - can be objects or strings
 */
function normalizeLinks(links?: Array<{ url?: string; title?: string } | string>): Array<{ url: string; title?: string }> {
  if (!links) return []
  return links
    .map((item) => {
      if (typeof item === 'string') {
        return { url: item }
      }
      return item.url ? { url: item.url, title: item.title } : null
    })
    .filter((item): item is { url: string; title?: string } => item !== null)
}

/**
 * Endpoint to import data from {slug}_data.json or {slug}_data.jsonl into Pages collection
 * POST /api/agents/:id/import-data
 */
export const importAgentData: Endpoint = {
  handler: async (req) => {
    // Check authentication
    if (!req.user) {
      throw new APIError('Unauthorized', 401, null, true)
    }

    // Check permissions - only superadmins can import
    if (!isSuperAdmin(req.user)) {
      throw new APIError('Forbidden - superadmin access required', 403, null, true)
    }

    // Get agent ID from route params
    const agentId = req.routeParams?.id as string | number | undefined
    if (!agentId) {
      throw new APIError('Agent ID is required', 400, null, true)
    }

    try {
      // Get agent from database
      const agent = await req.payload.findByID({
        collection: 'agents',
        id: agentId,
      })

      if (!agent) {
        throw new APIError('Agent not found', 404, null, true)
      }

      const slug = agent.slug as string
      const name = (agent.name as string || '').toLowerCase().replace(/\s+/g, '_')
      console.log(`[Agent Data Import] Starting import for agent: ${slug}`)

      // Look for data file in multiple possible locations and formats
      const possiblePaths = [
        // By slug
        path.join(process.cwd(), 'data', `${slug}_data.jsonl`),
        path.join(process.cwd(), 'data', `${slug}_data.json`),
        // By name (e.g., javier_recuenco_data.json)
        path.join(process.cwd(), 'data', `${name}_data.jsonl`),
        path.join(process.cwd(), 'data', `${name}_data.json`),
        // Root folder
        path.join(process.cwd(), `${slug}_data.jsonl`),
        path.join(process.cwd(), `${slug}_data.json`),
      ]

      let dataFilePath: string | null = null
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          dataFilePath = p
          break
        }
      }

      if (!dataFilePath) {
        throw new APIError(
          `Data file not found. Expected: ${slug}_data.json or ${slug}_data.jsonl in /data folder`,
          404,
          null,
          true,
        )
      }

      console.log(`[Agent Data Import] Found data file: ${dataFilePath}`)

      const results = {
        imported: [] as string[],
        skipped: [] as string[],
        errors: [] as string[],
      }

      // Determine file format and parse
      const isJsonl = dataFilePath.endsWith('.jsonl')
      let entries: DataEntry[] = []

      if (isJsonl) {
        // Parse JSONL (one JSON object per line)
        const fileStream = fs.createReadStream(dataFilePath)
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity,
        })

        for await (const line of rl) {
          if (!line.trim()) continue
          try {
            entries.push(JSON.parse(line))
          } catch {
            results.errors.push(`Failed to parse line: ${line.substring(0, 50)}...`)
          }
        }
      } else {
        // Parse JSON array
        const fileContent = fs.readFileSync(dataFilePath, 'utf-8')
        const parsed = JSON.parse(fileContent)
        entries = Array.isArray(parsed) ? parsed : [parsed]
      }

      console.log(`[Agent Data Import] Found ${entries.length} entries to process`)

      // Get the user's tenant for assigning to pages
      const tenantIDs = getUserTenantIDs(req.user)
      const tenant = tenantIDs[0] // Use first tenant
      if (!tenant) {
        throw new APIError('No tenant found for user', 400, null, true)
      }
      console.log(`[Agent Data Import] Using tenant: ${tenant}`)

      // Process each entry
      for (const entry of entries) {
        try {
          if (!entry.id) {
            results.errors.push('Entry missing id field')
            continue
          }

          // Check if page already exists by external_id
          const existing = await req.payload.find({
            collection: 'pages',
            where: {
              external_id: { equals: entry.id },
            },
            limit: 1,
          })

          if (existing.docs.length > 0) {
            results.skipped.push(entry.id)
            continue
          }
          const editor = await editorConfigFactory.default({
            config: req.payload.config,
          })
          // Create page with proper Lexical content format
          const contentText = entry.content_markdown || ''
          await req.payload.create({
            collection: 'pages',
            data: {
              tenant,
              title: entry.title || `Post ${entry.id}`,
              slug: `${slug}-${entry.id}`,
              external_id: entry.id,
              url: entry.url,
              content: convertMarkdownToLexical({markdown: contentText, editorConfig: editor}),
              related_links_videos: normalizeLinks(entry.related_links?.videos),
              related_links_books: normalizeLinks(entry.related_links?.books),
              related_links_other: normalizeLinks(entry.related_links?.other),
            },
          })

          results.imported.push(entry.id)
        } catch (entryError) {
          const errorMsg = entryError instanceof Error ? entryError.message : 'Unknown error'
          results.errors.push(`Entry ${entry.id}: ${errorMsg}`)
          console.error(`[Agent Data Import] Error processing entry ${entry.id}: ${errorMsg}`)
        }
      }

      console.log(
        `[Agent Data Import] Completed: ${results.imported.length} imported, ${results.skipped.length} skipped, ${results.errors.length} errors`,
      )

      return Response.json({
        success: true,
        message: 'Import completed',
        agentSlug: slug,
        dataFile: path.basename(dataFilePath),
        totalEntries: entries.length,
        results,
      })
    } catch (error) {
      if (error instanceof APIError) {
        throw error
      }
      console.error('[Agent Data Import] Fatal error:', error)
      throw new APIError(
        `Failed to import data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        null,
        true,
      )
    }
  },
  method: 'post',
  path: '/:id/import-data',
}
