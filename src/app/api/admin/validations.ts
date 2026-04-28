import { z } from 'zod';
import validation, { ValidationError } from '@/lib/validation';

// Re-export validated schemas with enhanced security
export const adminActionSchema = validation.adminActionSchema.extend({
  // Additional constraints for admin actions
  metadata: z.record(z.unknown()).optional(),
});

export function validateAdminAccess(user: unknown): boolean {
  // Safe null/undefined checks
  if (!user || typeof user !== 'object') {
    return false;
  }
  
  const userObj = user as Record<string, unknown>;
  const role = userObj.role;
  
  // Explicit role validation
  return role === 'admin' || role === 'superadmin';
}

export function validateAdminRequest(request: unknown) {
  return validation.validateRequest(adminActionSchema, request);
}

export default {
  adminActionSchema,
  validateAdminAccess,
  validateAdminRequest,
};