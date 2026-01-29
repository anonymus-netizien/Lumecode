/**
 * Simple Logger Utility
 * A standalone logger for the model management modules to avoid circular dependencies
 */

import pino from 'pino';

// Create a simple logger instance with defaults
export const modelLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'test' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  } : undefined,
});
