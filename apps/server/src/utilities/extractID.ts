/**
 * Extracts the ID from an object or returns the value if already a primitive.
 *
 * Works with union types like `number | Tenant` → returns `number`
 */

// Conditional type: if T has 'id', return the id type; otherwise return T itself
type ExtractIDReturn<T> = T extends { id: infer I } ? I : T

export const extractID = <T>(objectOrID: T): ExtractIDReturn<T> => {
  if (objectOrID && typeof objectOrID === 'object' && 'id' in objectOrID) {
    return objectOrID.id as ExtractIDReturn<T>
  }
  return objectOrID as ExtractIDReturn<T>
}
