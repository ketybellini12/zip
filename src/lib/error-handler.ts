import { NextResponse } from 'next/server';
import { logger } from './logger';
import { ValidationError, AuthenticationError, RateLimitError } from './validation';

export interface ApiError {
  message: string;
  code: string;
  status?: number;
  details?: Record<string, unknown>;
}

export class AppError extends Error implements ApiError {
  constructor(
    public message: string,
    public code: string,
    public status: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function handleApiError(error: unknown, context?: Record<string, unknown>): NextResponse {
  logger.error('API error occurred', error instanceof Error ? error : new Error(String(error)), context);
  
  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.details?.flatten() },
      { status: 400 }
    );
  }
  
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { error: error.message, code: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  }
  
  if (error instanceof RateLimitError) {
    return NextResponse.json(
      { error: error.message, code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }
  
  if (isAppError(error)) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.status }
    );
  }
  
  // Generic error - never expose internal details in production
  const isProd = process.env.NODE_ENV === 'production';
  return NextResponse.json(
    { 
      error: isProd ? 'An unexpected error occurred' : (error as Error)?.message || 'Unknown error',
      code: 'INTERNAL_ERROR',
      ...(isProd ? {} : { stack: (error as Error)?.stack })
    },
    { status: 500 }
  );
}

// Higher-order function to wrap API route handlers
export function withErrorHandler<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T,
  context?: Record<string, unknown>
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error, context);
    }
  }) as T;
}

// Global error boundary for React components
export function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  logger.error('React error boundary caught', error);
  
  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      <h3 className="font-semibold text-red-800">Something went wrong</h3>
      <p className="text-sm text-red-600 mt-1">
        {process.env.NODE_ENV === 'production' 
          ? 'Please try again or contact support.' 
          : error.message}
      </p>
      <button 
        onClick={reset}
        className="mt-3 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition"
      >
        Try again
      </button>
    </div>
  );
}

export default { handleApiError, withErrorHandler, AppError };