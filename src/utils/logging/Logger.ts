/**
 * Logger.ts
 * A utility for consistent logging throughout the plugin.
 * Logs are only displayed when debugging is enabled in the plugin settings.
 */

import type { ctxParamsType } from '../../entrypoints/Config/ConfigScreen';

/**
 * Type for data that can be logged
 */
type LoggableData = unknown;

/**
 * Available log levels with corresponding colors for clear visual distinction.
 */
const LOG_LEVELS = {
  INFO: { label: 'INFO', color: '#4a90e2' },
  PROMPT: { label: 'PROMPT', color: '#50e3c2' },
  RESPONSE: { label: 'RESPONSE', color: '#b8e986' },
  WARNING: { label: 'WARNING', color: '#f5a623' },
  ERROR: { label: 'ERROR', color: '#d0021b' },
};

/**
 * Logger class for consistent debugging and logging.
 */
export class Logger {
  private enabled: boolean;
  private source: string;

  /**
   * Creates a new logger instance.
   * 
   * @param pluginParams - Plugin parameters containing enableDebugging flag
   * @param source - Source module name for this logger instance
   */
  constructor(pluginParams: ctxParamsType, source: string) {
    this.enabled = pluginParams.enableDebugging ?? false;
    this.source = source;
  }

  /**
   * Format and print a log message with a consistent style.
   * 
   * @param level - The log level (INFO, PROMPT, etc.)
   * @param message - The message to log
   * @param data - Optional data to include in the log
   * @private
   */
  private log(level: keyof typeof LOG_LEVELS, message: string, data?: LoggableData): void {
    if (!this.enabled) return;

    const logConfig = LOG_LEVELS[level];
    const timestamp = new Date().toISOString();
    
    console.group(
      `%c ${timestamp} %c ${logConfig.label} %c ${this.source} %c ${message}`,
      'background: #333; color: white; padding: 2px 4px;',
      `background: ${logConfig.color}; color: white; padding: 2px 4px;`,
      'background: #666; color: white; padding: 2px 4px;',
      'color: black; padding: 2px 0;'
    );
    
    if (data !== undefined) {
      console.log(data);
    }
    
    console.groupEnd();
  }

  /**
   * Log general information.
   */
  info(message: string, data?: LoggableData): void {
    this.log('INFO', message, data);
  }

  /**
   * Log a prompt being sent to OpenAI.
   */
  logPrompt(message: string, prompt: string): void {
    this.log('PROMPT', message, prompt);
  }

  /**
   * Log a response received from OpenAI.
   */
  logResponse(message: string, response: LoggableData): void {
    this.log('RESPONSE', message, response);
  }

  /**
   * Log a warning.
   */
  warning(message: string, data?: LoggableData): void {
    this.log('WARNING', message, data);
  }

  /**
   * Log an error (always visible regardless of debug setting).
   */
  error(message: string, error?: LoggableData): void {
    // Errors are always logged, even if debugging is disabled
    console.error(`${this.source}: ${message}`, error);
    // Also log in our format if debugging is enabled
    if (this.enabled) {
      this.log('ERROR', message, error);
    }
  }
}

/**
 * Create a logger instance for a specific module.
 * 
 * @param pluginParams - Plugin parameters with enableDebugging setting
 * @param source - Source module identifier
 */
export function createLogger(pluginParams: ctxParamsType, source: string): Logger {
  return new Logger(pluginParams, source);
}
