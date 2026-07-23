/**
 * Tool: get_taxonomy_tree
 * Returns the full taxonomy hierarchy from the configured taxonomy source.
 * Builds a tree structure with parent-child relationships from the resolver.
 */

import { z } from 'zod'
import type { ResolvedTaxonomy, ToolContext } from '../context'
import type { McpAuthContext } from '../types'

export const getTaxonomyTreeSchema = z.object({
  type: z.string().optional().describe('Filter by taxonomy type (e.g. "author", "topic"). If omitted, returns all.'),
  parent_slug: z.string().optional().describe('Filter to children of a specific parent slug.'),
  shape: z
    .enum(['tree', 'flat', 'both'])
    .optional()
    .describe(
      'Output shape. "flat" (default, RECOMMENDED) returns a flat list with parent_slug references — TOON tabularizes it as one CSV-style row per node, ~3x more compact than tree. "tree" returns the nested hierarchy. "both" returns both at ~2x token cost.'
    ),
  retrieval_profile: z
    .string()
    .optional()
    .describe(
      "Profile slug whose scope bounds the tree — you only see the taxonomies that profile can filter by. Defaults to your default profile's scope."
    )
})

export type GetTaxonomyTreeInput = z.infer<typeof getTaxonomyTreeSchema>

interface TaxonomyNode {
  id: number | string
  name: string
  slug: string
  /** Single primary type (author | topic | …) or null. */
  type: string | null
  path: string
  children: TaxonomyNode[]
}

function buildTree(docs: ResolvedTaxonomy[]): TaxonomyNode[] {
  const nodeMap = new Map<string, TaxonomyNode>()

  // Create all nodes
  for (const doc of docs) {
    nodeMap.set(doc.slug, {
      id: doc.id,
      name: doc.name,
      slug: doc.slug,
      type: doc.types[0] ?? null,
      path: doc.breadcrumb,
      children: []
    })
  }

  // Build parent-child relationships
  const roots: TaxonomyNode[] = []

  for (const doc of docs) {
    const node = nodeMap.get(doc.slug)
    if (!node) continue

    const parent = doc.parentSlug ? nodeMap.get(doc.parentSlug) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

function sortTreeBySlug(nodes: TaxonomyNode[]): void {
  nodes.sort((a, b) => a.slug.localeCompare(b.slug))
  for (const node of nodes) {
    sortTreeBySlug(node.children)
  }
}

/**
 * Restrict the taxonomy universe to the caller's retrieval-profile scope. A
 * profile scoped to `taxonomy_slugs: [bastos]` can only ever filter by those
 * slugs (search intersects against the same allow-list), so listing every
 * author in the tree would advertise content it cannot read — the exact "it
 * returns taxonomies it shouldn't" leak. A profile with no taxonomy scope
 * (folder-only or open token) sees the full tree, matching what it can filter.
 */
function scopeDocs(docs: ResolvedTaxonomy[], auth: McpAuthContext | null): ResolvedTaxonomy[] {
  const allowed = auth?.taxonomySlugs
  if (!allowed?.length) return docs
  const allow = new Set(allowed)
  return docs.filter(doc => allow.has(doc.slug))
}

export async function getTaxonomyTree(input: GetTaxonomyTreeInput, ctx: ToolContext, auth: McpAuthContext | null) {
  const docs = scopeDocs(await ctx.taxonomy.getAll(), auth)
  let tree = buildTree(docs)

  // Filter by type
  if (input.type) {
    const wantedType = input.type
    const filterByType = (nodes: TaxonomyNode[]): TaxonomyNode[] =>
      nodes
        .map(node => ({
          ...node,
          children: filterByType(node.children)
        }))
        .filter(node => node.type === wantedType || node.children.length > 0)

    tree = filterByType(tree)
  }

  // Filter to children of a specific parent
  if (input.parent_slug) {
    const findParent = (nodes: TaxonomyNode[]): TaxonomyNode | null => {
      for (const node of nodes) {
        if (node.slug === input.parent_slug) return node
        const found = findParent(node.children)
        if (found) return found
      }
      return null
    }

    const parent = findParent(tree)
    if (parent) {
      tree = [parent]
    } else {
      return { error: `Parent slug "${input.parent_slug}" not found`, total: 0 }
    }
  }

  // Sort siblings recursively by slug so that flat output is deterministic and
  // children of the same parent appear contiguously in DFS traversal.
  sortTreeBySlug(tree)

  const shape = input.shape ?? 'flat'

  // Count + optionally build flat list. All fields are scalar so TOON can
  // encode the list as a single tabular block.
  const flatList: Array<{
    id: number | string
    name: string
    slug: string
    type: string | null
    path: string
  }> = []
  const flatten = (nodes: TaxonomyNode[]) => {
    for (const node of nodes) {
      flatList.push({
        id: node.id,
        name: node.name,
        slug: node.slug,
        type: node.type,
        path: node.path
      })
      flatten(node.children)
    }
  }
  flatten(tree)
  const total = flatList.length

  if (shape === 'tree') {
    return { total, tree }
  }
  if (shape === 'both') {
    return { total, tree, flat: flatList }
  }
  // Default: flat (TOON-tabularizable, ~3x more compact than tree)
  return { total, flat: flatList }
}
