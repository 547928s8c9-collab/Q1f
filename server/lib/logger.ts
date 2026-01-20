/**
 * Centralized logging utility with structured logging and log levels
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

// Parse log level from environment, default to INFO in production, DEBUG in development
function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel === "DEBUG") return LogLevel.DEBUG;
  if (envLevel === "INFO") return LogLevel.INFO;
  if (envLevel === "WARN") return LogLevel.WARN;
  if (envLevel === "ERROR") return LogLevel.ERROR;
  
  // Defaults
  if (isProduction) return LogLevel.INFO;
  if (isTest) return LogLevel.ERROR; // Suppress logs in tests
  return LogLevel.DEBUG;
}

const currentLogLevel = getLogLevel();

interface LogEntry {
  timestamp: string;
  level: string;
  source: string;
  message: string;
  meta?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
    status?: number;
  };
}

function formatLogEntry(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  let logLine = `${time} [${entry.level}] [${entry.source}] ${entry.message}`;
  
  if (entry.meta && Object.keys(entry.meta).length > 0) {
    logLine += ` ${JSON.stringify(entry.meta)}`;
  }
  
  if (entry.error) {
    logLine += ` | Error: ${entry.error.message}`;
    if (entry.error.code) {
      logLine += ` (code: ${entry.error.code})`;
    }
    if (entry.error.status) {
      logLine += ` (status: ${entry.error.status})`;
    }
    // Include stack trace in development or if explicitly requested
    if (!isProduction && entry.error.stack) {
      logLine += `\n${entry.error.stack}`;
    }
  }
  
  return logLine;
}

function shouldLog(level: LogLevel): boolean {
  return level >= currentLogLevel;
}

function createLogEntry(
  level: LogLevel,
  source: string,
  message: string,
  meta?: Record<string, unknown>,
  error?: Error | unknown
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: LOG_LEVEL_NAMES[level],
    source,
    message,
    meta,
  };

  if (error) {
    if (error instanceof Error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
        status: (error as any).status || (error as any).statusCode,
      };
    } else {
      entry.error = {
        message: String(error),
      };
    }
  }

  return entry;
}

export const logger = {
  debug(message: string, source = "app", meta?: Record<string, unknown>): void {
    if (!shouldLog(LogLevel.DEBUG)) return;
    const entry = createLogEntry(LogLevel.DEBUG, source, message, meta);
    console.debug(formatLogEntry(entry));
  },

  info(message: string, source = "app", meta?: Record<string, unknown>): void {
    if (!shouldLog(LogLevel.INFO)) return;
    const entry = createLogEntry(LogLevel.INFO, source, message, meta);
    console.log(formatLogEntry(entry));
  },

  warn(message: string, source = "app", meta?: Record<string, unknown>, error?: Error | unknown): void {
    if (!shouldLog(LogLevel.WARN)) return;
    const entry = createLogEntry(LogLevel.WARN, source, message, meta, error);
    console.warn(formatLogEntry(entry));
  },

  error(message: string, source = "app", meta?: Record<string, unknown>, error?: Error | unknown): void {
    if (!shouldLog(LogLevel.ERROR)) return;
    const entry = createLogEntry(LogLevel.ERROR, source, message, meta, error);
    console.error(formatLogEntry(entry));
  },
};

// Export for testing
export { getLogLevel, formatLogEntry };
