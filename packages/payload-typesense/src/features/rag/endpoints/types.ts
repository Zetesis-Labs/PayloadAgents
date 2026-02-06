/**
 * Framework-agnostic types for API handlers
 * These types provide compatibility with Next.js without requiring it as a direct dependency
 */

/**
 * Context for dynamic route parameters (Next.js App Router style)
 */
export type ApiContext<T = Record<string, string>> = {
  params: Promise<T>
}

export type AuthenticateMethod = (options?: {
  depth?: number
}) => Promise<{ id: string | number; email?: string } | { error: string; status: number }>
