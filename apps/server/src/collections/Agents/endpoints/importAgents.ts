import type { CollectionSlug, Endpoint } from 'payload'
import { APIError } from 'payload'
import { isSuperAdmin } from '@/access/isSuperAdmin'
import { importHardcodedAgents } from '@/payload/plugins/typesense/agents/importer'
import { agents as hardcodedAgents } from '@/payload/plugins/typesense/agents'

/**
 * Endpoint to import hardcoded agents into the database
 * POST /api/agents/import
 */
export const importAgents: Endpoint = {
  handler: async (req) => {
    // Check authentication
    if (!req.user) {
      throw new APIError('Unauthorized', 401, null, true)
    }

    // Check permissions - only superadmins can import agents
    if (!isSuperAdmin(req.user)) {
      throw new APIError('Forbidden - superadmin access required', 403, null, true)
    }

    try {
      console.log(`[Agents Import] Starting import of ${hardcodedAgents.length} agents...`)

      // Use shared importer service
      const results = await importHardcodedAgents(req.payload)


      console.log(
        `[Agents Import] Completed: ${results.imported.length} imported, ${results.skipped.length} skipped, ${results.errors.length} errors`,
      )

      return Response.json({
        success: true,
        message: 'Import completed',
        totalAgents: hardcodedAgents.length,
        results,
      })
    } catch (error) {
      if (error instanceof APIError) {
        throw error
      }
      console.error('[Agents Import] Fatal error:', error)
      throw new APIError(
        `Failed to import agents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        null,
        true,
      )
    }
  },
  method: 'post',
  path: '/import',
}
