import type { PayloadRequest } from 'payload'

/**
 * Extracts collection name from request URL or params
 */
export const extractCollectionName = (
  request: PayloadRequest
): { collectionName: string; collectionNameStr: string } => {
  let collectionName: string
  let collectionNameStr: string

  if (request.url && typeof request.url === 'string') {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const searchIndex = pathParts.indexOf('search')
    if (searchIndex !== -1 && pathParts[searchIndex + 1]) {
      collectionName = pathParts[searchIndex + 1] || ''
      collectionNameStr = String(collectionName)
    } else {
      collectionName = ''
      collectionNameStr = ''
    }
  } else {
    // Fallback to params extraction
    const params = request.routeParams
    const paramCollectionName = params?.collectionName
    collectionName = String(paramCollectionName || '')
    collectionNameStr = collectionName
  }

  return { collectionName, collectionNameStr }
}
