import { z } from 'zod';

export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError('Invalid request', result.error);
  }
  return result.data;
}

export function sanitizeInput(input: string): string {
  // Remove dangerous characters
  return input.replace(/[<>"'&]/g, '');
}

export function checkRateLimit(ip: string, endpoint: string): boolean {
  // Implement rate limiting logic
  return true; // Placeholder
}