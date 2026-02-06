import type { FieldMapping, PayloadDocument } from './types'

/**
 * Extended field mapping with backend-specific properties
 * This interface is used internally for field mappings that may have additional properties
 */
interface ExtendedFieldMapping extends FieldMapping {
  type?: string
  optional?: boolean
}

/**
 * Extracts a value from a document using dot notation path
 */
const getValueByPath = (obj: unknown, path: string): unknown => {
  if (!obj || typeof obj !== 'object') return undefined

  return path.split('.').reduce((acc: unknown, part: string) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, obj)
}

/**
 * Returns the default value for a given field type
 */
const getDefaultValueForType = (type: string): unknown => {
  if (type === 'string') return ''
  if (type === 'string[]') return []
  if (type === 'bool') return false
  if (type.startsWith('int') || type === 'float') return 0
  return undefined
}

/**
 * Converts a value to match the expected field type
 */
const coerceValueToType = (value: unknown, type: string): unknown => {
  if (type === 'string' && typeof value !== 'string') {
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value)
    }
    return String(value)
  }
  if (type === 'string[]' && !Array.isArray(value)) {
    return [String(value)]
  }
  if (type === 'bool') {
    return Boolean(value)
  }
  return value
}

/**
 * Resolves the value for a typed field, applying defaults and coercion.
 * Returns `undefined` to signal the field should be skipped (optional with no value).
 */
const resolveTypedFieldValue = (value: unknown, extField: ExtendedFieldMapping): unknown | undefined => {
  if (!extField.type) return value

  let resolved = value

  // Handle missing values
  if (resolved === undefined || resolved === null) {
    if (extField.optional) return undefined
    resolved = getDefaultValueForType(extField.type)
  }

  // Type coercion
  return coerceValueToType(resolved, extField.type)
}

/**
 * Maps a Payload document to an index document based on field configuration
 *
 * This function handles both base FieldMapping and extended mappings with
 * backend-specific properties like 'type' and 'optional'.
 */
export const mapPayloadDocumentToIndex = async (
  doc: PayloadDocument,
  fields: FieldMapping[]
): Promise<Record<string, unknown>> => {
  const result: Record<string, unknown> = {}

  for (const field of fields) {
    const sourcePath = field.payloadField || field.name
    let value = getValueByPath(doc, sourcePath)

    // Cast to extended mapping to check for optional backend-specific properties
    const extField = field as ExtendedFieldMapping

    // Apply custom transform if provided
    if (field.transform) {
      value = await field.transform(value)
    } else if (extField.type) {
      const resolved = resolveTypedFieldValue(value, extField)
      if (resolved === undefined) continue
      value = resolved
    }

    // Only add the field if we have a value (or if it was explicitly transformed)
    if (value !== undefined) {
      result[field.name] = value
    }
  }

  return result
}
