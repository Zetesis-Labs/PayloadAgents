/**
 * Minimal namespaced logger. Kept dependency-free so the package stays isolated
 * (mirrors payload-typesense's core/logging/logger but without extra deps).
 */
type LogArgs = unknown[]

const prefix = '[payload-pgvector]'

export const logger = {
  info: (message: string, ...args: LogArgs): void => {
    console.info(`${prefix} ${message}`, ...args)
  },
  warn: (message: string, ...args: LogArgs): void => {
    console.warn(`${prefix} ${message}`, ...args)
  },
  error: (message: string, ...args: LogArgs): void => {
    console.error(`${prefix} ${message}`, ...args)
  }
}
