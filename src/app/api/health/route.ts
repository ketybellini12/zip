import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getEnv } from '@/lib/env';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

interface HealthCheck {
  name: string;
  status: HealthStatus;
  message?: string;
  timestamp: string;
}

interface HealthResponse {
  status: HealthStatus;
  version: string;
  timestamp: string;
  checks: Record<string, HealthCheck>;
  uptime: number;
}

const startTime = Date.now();
const version = process.env.npm_package_version || '0.0.0-dev';

async function checkDatabase(): Promise<HealthCheck> {
  try {
    const start = Date.now();
    await db.execute('SELECT 1');
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      return {
        name: 'database',
        status: 'degraded',
        message: `Slow response: ${duration}ms`,
        timestamp: new Date().toISOString(),
      };
    }
    
    return {
      name: 'database',
      status: 'healthy',
      message: `Response time: ${duration}ms`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Database health check failed', error as Error);
    return {
      name: 'database',
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}

async function checkExternalServices(): Promise<HealthCheck> {
  // Check critical external dependencies
  const services = [
    { name: 'OpenAI', url: 'https://api.openai.com/v1/models', env: 'OPENAI_API_KEY' },
    { name: 'Anthropic', url: 'https://api.anthropic.com/v1/models', env: 'ANTHROPIC_API_KEY' },
  ];
  
  const env = getEnv();
  const results = await Promise.all(
    services.map(async (service) => {
      if (!env[service.env as keyof typeof env]) {
        return { name: service.name, status: 'healthy' as HealthStatus, skipped: true };
      }
      
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch(service.url, { 
          method: 'HEAD',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        return { name: service.name, status: 'healthy' as HealthStatus };
      } catch {
        return { name: service.name, status: 'degraded' as HealthStatus };
      }
    })
  );
  
  const unhealthy = results.filter(r => r.status === 'unhealthy').length;
  const degraded = results.filter(r => r.status === 'degraded' && !r.skipped).length;
  
  if (unhealthy > 0) {
    return {
      name: 'external_services',
      status: 'unhealthy',
      message: `${unhealthy} service(s) unreachable`,
      timestamp: new Date().toISOString(),
    };
  }
  
  if (degraded > 0) {
    return {
      name: 'external_services',
      status: 'degraded',
      message: `${degraded} service(s) slow or degraded`,
      timestamp: new Date().toISOString(),
    };
  }
  
  return {
    name: 'external_services',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const [dbCheck, externalCheck] = await Promise.all([
      checkDatabase(),
      checkExternalServices(),
    ]);
    
    const checks: Record<string, HealthCheck> = {
      database: dbCheck,
      external_services: externalCheck,
    };
    
    // Determine overall status
    const statuses = Object.values(checks).map(c => c.status);
    let overallStatus: HealthStatus = 'healthy';
    if (statuses.includes('unhealthy')) overallStatus = 'unhealthy';
    else if (statuses.includes('degraded')) overallStatus = 'degraded';
    
    const response: HealthResponse = {
      status: overallStatus,
      version,
      timestamp: new Date().toISOString(),
      checks,
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };
    
    const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
    
    return NextResponse.json(response, { 
      status: statusCode,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    });
    
  } catch (error) {
    logger.error('Health check endpoint failed', error as Error);
    
    return NextResponse.json({
      status: 'unhealthy',
      version,
      timestamp: new Date().toISOString(),
      checks: {
        error: {
          name: 'health_check',
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        }
      },
      uptime: Math.floor((Date.now() - startTime) / 1000),
    } as HealthResponse, { status: 500 });
  }
}

export const runtime = 'edge';
export const dynamic = 'force-dynamic';