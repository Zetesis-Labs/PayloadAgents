import { nestedDocsPlugin as _nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'

export const nestedDocsPlugin = _nestedDocsPlugin({
  collections: ['taxonomy'],
  generateLabel: docs => {
    const lastDoc = docs[docs.length - 1]
    const name = lastDoc?.name
    if (typeof name === 'string') return name
    if (name && typeof name === 'object') {
      return (name as Record<string, string>).es ?? Object.values(name)[0] ?? ''
    }
    return name
  },
  generateURL: docs =>
    '/' +
    docs
      .map(d => d.slug)
      .filter(Boolean)
      .join('/')
})
