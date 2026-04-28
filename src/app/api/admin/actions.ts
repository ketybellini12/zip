import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import validation, { 
  ValidationError, 
  AuthenticationError 
} from '@/lib/validation';
import { db } from '@/lib/db';
import { users, auditLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';

// CSRF token verification (simplified - implement proper CSRF in production)
function verifyCsrfToken(request: NextRequest): boolean {
  const csrfToken = request.headers.get('x-csrf-token');
  // In production, validate against session-stored token
  return csrfToken !== null && csrfToken.length > 0;
}

// Audit logging function
async function logAdminAction(
  adminId: string,
  targetUserId: string,
  action: string,
  reason?: string,
  metadata?: Record<string, unknown>
) {
  try {
    await db.insert(auditLogs).values({
      adminId,
      targetUserId,
      action,
      reason: reason || null,
      metadata: metadata || {},
      ipAddress: headers().get('x-forwarded-for') || 'unknown',
      userAgent: headers().get('user-agent') || 'unknown',
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
    // Don't fail the main operation if logging fails
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthenticationError();
    }

    // Admin role validation
    if (!validation.validateAdminRole(session.user)) {
      throw new AuthenticationError('Admin access required');
    }

    // CSRF protection
    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'CSRF token missing or invalid' }, { status: 403 });
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { userId, action, reason } = validation.validateRequest(
      validation.adminActionSchema,
      body
    );

    // Validate target user exists and is not self
    if (userId === session.user.id) {
      return NextResponse.json({ error: 'Cannot perform action on yourself' }, { status: 400 });
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Execute admin action with transaction
    const result = await db.transaction(async (tx) => {
      switch (action) {
        case 'ban':
          await tx.update(users)
            .set({ 
              isBanned: true, 
              bannedAt: new Date(),
              bannedReason: reason || null,
              updatedAt: new Date()
            })
            .where(eq(users.id, userId));
          break;
          
        case 'unban':
          await tx.update(users)
            .set({ 
              isBanned: false, 
              bannedAt: null,
              bannedReason: null,
              updatedAt: new Date()
            })
            .where(eq(users.id, userId));
          break;
          
        case 'promote':
          await tx.update(users)
            .set({ 
              role: 'admin',
              updatedAt: new Date()
            })
            .where(eq(users.id, userId));
          break;
          
        case 'demote':
          await tx.update(users)
            .set({ 
              role: 'user',
              updatedAt: new Date()
            })
            .where(eq(users.id, userId));
          break;
          
        case 'delete':
          // Soft delete preferred - implement hard delete only if necessary
          await tx.update(users)
            .set({ 
              deletedAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(users.id, userId));
          break;
          
        default:
          throw new ValidationError(`Unknown action: ${action}`);
      }
      
      return { success: true };
    });

    // Log the action for audit trail
    await logAdminAction(session.user.id, userId, action, reason, { 
      previousRole: targetUser.role,
      previousBannedStatus: targetUser.isBanned 
    });

    return NextResponse.json({ 
      success: true, 
      message: `User ${action}ed successfully`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Admin action error:', error);
    
    if (error instanceof ValidationError) {
      return NextResponse.json({ 
        error: 'Invalid request', 
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }
    
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ 
        error: error.message, 
        code: 'AUTH_REQUIRED'
      }, { status: 401 });
    }
    
    return NextResponse.json({ 
      error: 'An error occurred processing your request',
      code: 'INTERNAL_ERROR'
    }, { status: 500 });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '512kb', // Limit request body size
    },
  },
};