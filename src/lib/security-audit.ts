import { db } from './db';
import { auditLogs } from '@/db/schema';
import { logger } from './logger';
import { headers } from 'next/headers';

export interface AuditEntry {
  adminId: string;
  targetUserId: string;
  action: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export class SecurityAuditor {
  async log(entry: AuditEntry): Promise<void> {
    try {
      // Get request context from async local storage or headers
      let ipAddress = 'unknown';
      let userAgent = 'unknown';
      
      try {
        const headersList = await headers();
        ipAddress = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        userAgent = headersList.get('user-agent') || 'unknown';
      } catch {
        // Headers API may not be available in all contexts
      }
      
      await db.insert(auditLogs).values({
        adminId: entry.adminId,
        targetUserId: entry.targetUserId,
        action: entry.action,
        reason: entry.reason || null,
        metadata: {
          ...(entry.metadata || {}),
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV,
        },
        ipAddress,
        userAgent,
        sessionId: entry.metadata?.sessionId as string | null,
        createdAt: new Date(),
      });
      
      logger.info('Audit log entry created', {
        action: entry.action,
        adminId: entry.adminId,
        targetUserId: entry.targetUserId,
      });
    } catch (error) {
      // Audit logging should never break the main operation
      logger.error('Failed to create audit log entry', error as Error, {
        action: entry.action,
        adminId: entry.adminId,
      });
    }
  }
  
  async query(filters: {
    adminId?: string;
    targetUserId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    try {
      let query = db.select().from(auditLogs);
      
      const conditions = [];
      
      if (filters.adminId) {
        conditions.push({ field: 'adminId', value: filters.adminId });
      }
      if (filters.targetUserId) {
        conditions.push({ field: 'targetUserId', value: filters.targetUserId });
      }
      if (filters.action) {
        conditions.push({ field: 'action', value: filters.action });
      }
      if (filters.startDate) {
        conditions.push({ field: 'createdAt', operator: '>=', value: filters.startDate });
      }
      if (filters.endDate) {
        conditions.push({ field: 'createdAt', operator: '<=', value: filters.endDate });
      }
      
      // Execute with filters (simplified - implement proper query building)
      const results = await query
        .limit(filters.limit || 50)
        .offset(filters.offset || 0)
        .orderBy(auditLogs.createdAt, 'desc');
      
      return {
        results,
        total: results.length, // In production, use count query
      };
    } catch (error) {
      logger.error('Failed to query audit logs', error as Error);
      throw error;
    }
  }
  
  async export(format: 'csv' | 'json', filters: Record<string, unknown>): Promise<string> {
    const { results } = await this.query(filters as any);
    
    if (format === 'json') {
      return JSON.stringify(results, null, 2);
    }
    
    // CSV export
    const headers = ['Timestamp', 'Admin', 'Target', 'Action', 'Reason', 'IP', 'User Agent'];
    const rows = results.map((entry: any) => [
      entry.createdAt?.toISOString(),
      entry.adminId,
      entry.targetUserId,
      entry.action,
      entry.reason || '',
      entry.ipAddress,
      entry.userAgent,
    ]);
    
    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
  }
}

export const securityAuditor = new SecurityAuditor();
export default securityAuditor;