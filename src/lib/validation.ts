import { z } from 'zod';

export class ValidationError extends Error {
  constructor(message: string, public details?: z.ZodError) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends Error {
  constructor(message = 'Too many requests') {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid request', result.error);
  }
  return result.data;
}

export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  // Remove potentially dangerous characters for XSS prevention
  return input
    .replace(/[<>"'&]/g, (char) => ({
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '&': '&amp;',
    })[char] || char)
    .trim();
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  
  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (record.count >= maxRequests) {
    return false;
  }
  
  record.count++;
  return true;
}

export function validateAdminRole(user: any): user is { id: string; role: 'admin' | 'superadmin' } {
  return (
    user !== null &&
    typeof user === 'object' &&
    typeof user.id === 'string' &&
    typeof user.role === 'string' &&
    (user.role === 'admin' || user.role === 'superadmin')
  );
}

export function validateUserId(userId: string): boolean {
  return typeof userId === 'string' && /^[a-zA-Z0-9\-_]{1,64}$/.test(userId);
}

export function validateUrl(url: string, allowedDomains: string[] = []): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (allowedDomains.length > 0) {
      return allowedDomains.some(domain => 
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
      );
    }
    return true;
  } catch {
    return false;
  }
}

export const adminActionSchema = z.object({
  userId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9\-_]+$/),
  action: z.enum(['ban', 'unban', 'delete', 'promote', 'demote']),
  reason: z.string().min(1).max(500).optional(),
});

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(10000),
  threadId: z.string().min(1).max(64),
  model: z.string().min(1).max(100),
  metadata: z.record(z.unknown()).optional(),
});

export const mcpRequestSchema = z.object({
  serverUrl: z.string().url(),
  toolName: z.string().min(1).max(100),
  parameters: z.record(z.unknown()).optional(),
});

export default {
  validateRequest,
  sanitizeInput,
  checkRateLimit,
  validateAdminRole,
  validateUserId,
  validateUrl,
  adminActionSchema,
  chatMessageSchema,
  mcpRequestSchema,
};