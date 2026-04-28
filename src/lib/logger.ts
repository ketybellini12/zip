import pino from 'pino';
import { getEnv, isProduction } from './env';

const env = getEnv();

// Create logger with structured logging
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Pretty print in development
  transport: !isProduction() ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
  // Redact sensitive fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.token',
      'body.secret',
      'body.apiKey',
      'body.accessToken',
      'body.refreshToken',
    ],
    censor: '[REDACTED]',
  },
});

// Contextual logger wrapper
export class ContextualLogger {
  constructor(private baseLogger: pino.Logger, private context: Record<string, unknown> = {}) {}
  
  child(context: Record<string, unknown>): ContextualLogger {
    return new ContextualLogger(
      this.baseLogger.child(context),
      { ...this.context, ...context }
    );
  }
  
  debug(msg: string, meta?: Record<string, unknown>) {
    this.baseLogger.debug({ ...this.context, ...meta }, msg);
  }
  
  info(msg: string, meta?: Record<string, unknown>) {
    this.baseLogger.info({ ...this.context, ...meta }, msg);
  }
  
  warn(msg: string, meta?: Record<string, unknown>) {
    this.baseLogger.warn({ ...this.context, ...meta }, msg);
  }
  
  error(msg: string, error?: Error, meta?: Record<string, unknown>) {
    this.baseLogger.error(
      { 
        ...this.context, 
        ...meta,
        err: error ? { message: error.message, stack: error.stack, name: error.name } : undefined
      }, 
      msg
    );
  }
  
  fatal(msg: string, error?: Error, meta?: Record<string, unknown>) {
    this.baseLogger.fatal(
      { 
        ...this.context, 
        ...meta,
        err: error ? { message: error.message, stack: error.stack, name: error.name } : undefined
      }, 
      msg
    );
  }
}

export function createLogger(context: Record<string, unknown> = {}): ContextualLogger {
  return new ContextualLogger(logger.child(context), context);
}

// Middleware for request logging
export function requestLogger(req: Request, res: Response, next: () => void) {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  const requestLogger = createLogger({ requestId, method: req.method, path: new URL(req.url).pathname });
  
  requestLogger.info('Request started');
  
  // Add request ID to response headers
  if (res.headers instanceof Headers) {
    res.headers.set('X-Request-ID', requestId);
  }
  
  next();
  
  const duration = Date.now() - start;
  requestLogger.info('Request completed', { duration });
}

export default logger;