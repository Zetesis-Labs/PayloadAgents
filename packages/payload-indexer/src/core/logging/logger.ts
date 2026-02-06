/**
 * Professional logging system for payload-indexer
 * Provides structured logging with levels and context
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

export interface LogContext {
  [key: string]: unknown
}

export interface LoggerConfig {
  /** Minimum log level to output (default: 'info') */
  level?: LogLevel
  /** Prefix for all log messages (default: '[payload-indexer]') */
  prefix?: string
  /** Enable/disable logging (default: true) */
  enabled?: boolean
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4
}

export class Logger {
  private level: LogLevel
  private prefix: string
  private enabled: boolean

  constructor(config: LoggerConfig = {}) {
    this.level = config.level || 'info'
    this.prefix = config.prefix || '[payload-indexer]'
    this.enabled = config.enabled !== false
  }

  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    if (config.level !== undefined) this.level = config.level
    if (config.prefix !== undefined) this.prefix = config.prefix
    if (config.enabled !== undefined) this.enabled = config.enabled
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level]
  }

  /**
   * Format log message with context
   */
  private formatMessage(message: string, context?: LogContext): string {
    if (!context || Object.keys(context).length === 0) {
      return `${this.prefix} ${message}`
    }
    return `${this.prefix} ${message} ${JSON.stringify(context)}`
  }

  /**
   * Debug level logging - detailed information for debugging
   */
  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage(message, context))
    }
  }

  /**
   * Info level logging - general informational messages
   */
  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage(message, context))
    }
  }

  /**
   * Warning level logging - warning messages
   */
  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage(message, context))
    }
  }

  /**
   * Error level logging - error messages
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (this.shouldLog('error')) {
      const errorContext = {
        ...context,
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name
              }
            : String(error)
      }
      console.error(this.formatMessage(message, errorContext))
    }
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level
  }

  /**
   * Check if logger is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }
}

// Default logger instance
let defaultLogger = new Logger()

/**
 * Configure the default logger
 */
export const configureLogger = (config: LoggerConfig): void => {
  defaultLogger.configure(config)
}

/**
 * Create a new logger instance with custom configuration
 */
export const createLogger = (config?: LoggerConfig): Logger => {
  return new Logger(config)
}

/**
 * Get the default logger instance
 */
export const getLogger = (): Logger => {
  return defaultLogger
}

/**
 * Set a new default logger instance
 */
export const setLogger = (logger: Logger): void => {
  defaultLogger = logger
}

// Export singleton methods for convenience
export const logger = {
  debug: (message: string, context?: LogContext) => defaultLogger.debug(message, context),
  info: (message: string, context?: LogContext) => defaultLogger.info(message, context),
  warn: (message: string, context?: LogContext) => defaultLogger.warn(message, context),
  error: (message: string, error?: Error | unknown, context?: LogContext) =>
    defaultLogger.error(message, error, context),
  configure: configureLogger,
  getLevel: () => defaultLogger.getLevel(),
  isEnabled: () => defaultLogger.isEnabled()
}
