import { getPayload } from '@/modules/get-payload'
import type { Book, Taxonomy, Tenant } from '@/payload-types'

// ============================================================================
// TRANSFORMS
// ============================================================================

/**
 * Transform categories relationship to taxonomy slugs array
 */
/**
 * Extrae la jerarquía de slugs de los breadcrumbs de la última categoría
 * Ejemplo: categories = [ { ..., breadcrumbs: [ { url: '/autor', label: 'Autor' }, { url: '/autor/hoppe', label: 'Hoppe' } ] } ]
 * Devuelve: ['autor', 'hoppe']
 */
export const transformCategories = async (categories?: (number | Taxonomy)[]): Promise<string[]> => {
  if (!categories || categories.length === 0) return []

  let docs: Taxonomy[] = []

  // Verificamos el tipo del primer elemento asumiendo homogeneidad
  if (typeof categories[0] === 'number') {
    const payload = await getPayload()
    const ids = categories as number[]

    // Traemos todas las categorías de una vez
    const { docs: foundDocs } = await payload.find({
      collection: 'taxonomy',
      where: { id: { in: ids } },
      limit: ids.length,
      depth: 1
    })

    docs = foundDocs
  } else {
    docs = categories as Taxonomy[]
  }
  // Buscar la última categoría que tenga breadcrumbs
  const lastWithBreadcrumbs = [...docs]
    .reverse()
    .find(cat => cat && typeof cat === 'object' && Array.isArray(cat.breadcrumbs))
  if (!lastWithBreadcrumbs) return []
  const breadcrumbs = lastWithBreadcrumbs.breadcrumbs
  if (!Array.isArray(breadcrumbs) || breadcrumbs.length === 0) return []
  // Tomar el último breadcrumb válido con url
  const last = [...breadcrumbs]
    .reverse()
    .find(b => b && typeof b === 'object' && 'url' in b && typeof b.url === 'string')
  if (!last || typeof last.url !== 'string') return []
  // Extraer los slugs de la url (ignorando vacíos)
  return last.url.split('/').filter(Boolean)
}

/**
 * Transforms a Tenant to its slug for Typesense indexing
 * Allows filtering pages by tenant using facets
 */
export const transformTenant = async (value: Tenant | number | null): Promise<string> => {
  if (!value) return ''
  if (typeof value !== 'number') {
    return value.slug
  }
  const payload = await getPayload()
  const tenant = await payload.findByID({ collection: 'tenants', id: value })
  return String(tenant?.slug) ?? ''
}

/**
 * Transform book chapters array to plain text content
 * Extracts the text content from each chapter for indexing
 */
export const transformChapters = async (chapters?: Book['chapters']): Promise<string> => {
  if (!chapters || chapters.length === 0) return ''

  // Combine all chapter content into a single text string
  const allContent = chapters
    .map(chapter => {
      const parts: string[] = []

      // Add chapter title if present
      if (chapter.title) {
        parts.push(`# ${chapter.title}\n\n`)
      }

      // Extract plain text from content
      // Assuming content is a plain text field, not lexical
      if (typeof chapter.content === 'string') {
        parts.push(chapter.content)
      } else if (chapter.content && typeof chapter.content === 'object') {
        // If it's an object, try to extract text (might be lexical despite what user said)
        // For now, just stringify it as fallback
        parts.push(JSON.stringify(chapter.content))
      }

      return parts.join('')
    })
    .join('\n\n---\n\n')

  return allContent
}
