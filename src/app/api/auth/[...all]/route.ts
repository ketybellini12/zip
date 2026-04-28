import { NextRequest, NextResponse } from 'next/server';
import { AuthHandler } from 'next-auth';
import { authOptions } from '@/lib/auth';
import validation, { RateLimitError } from '@/lib/validation';

// Rate limiting for auth endpoints
const AUTH_RATE_LIMIT = {
  login: { maxRequests: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 minutes
  signup: { maxRequests: 3, windowMs: 60 * 60 * 1000 }, // 3 signups per hour
  passwordReset: { maxRequests: 3, windowMs: 60 * 60 * 1000 },
};

function getRateLimitKey(request: NextRequest, action: string): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const email = request.headers.get('x-auth-email') || '';
  return `auth:${action}:${ip}:${email.substring(0, 50)}`;
}

export async function GET(request: NextRequest, { params }: { params: { all: string[] } }) {
  const action = params.all?.[0] || 'signin';
  
  // Apply rate limiting for sensitive actions
  if (['signin', 'signup', 'reset'].includes(action)) {
    const limit = AUTH_RATE_LIMIT[action as keyof typeof AUTH_RATE_LIMIT] || AUTH_RATE_LIMIT.login;
    const key = getRateLimitKey(request, action);
    
    if (!validation.checkRateLimit(key, limit.maxRequests, limit.windowMs)) {
      return NextResponse.json({ 
        error: 'Too many attempts. Please try again later.',
        code: 'RATE_LIMITED'
      }, { status: 429 });
    }
  }
  
  return AuthHandler(request, authOptions);
}

export async function POST(request: NextRequest, { params }: { params: { all: string[] } }) {
  const action = params.all?.[0] || 'signin';
  
  // Apply rate limiting for sensitive actions
  if (['signin', 'signup', 'reset', 'callback'].includes(action)) {
    const limit = AUTH_RATE_LIMIT[action as keyof typeof AUTH_RATE_LIMIT] || AUTH_RATE_LIMIT.login;
    const key = getRateLimitKey(request, action);
    
    if (!validation.checkRateLimit(key, limit.maxRequests, limit.windowMs)) {
      return NextResponse.json({ 
        error: 'Too many attempts. Please try again later.',
        code: 'RATE_LIMITED'
      }, { status: 429 });
    }
  }
  
  // Additional validation for signup
  if (action === 'signup') {
    try {
      const body = await request.json().catch(() => ({}));
      const email = body?.email;
      
      if (email && typeof email === 'string') {
        // Basic email format validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return NextResponse.json({ 
            error: 'Invalid email format',
            code: 'INVALID_EMAIL'
          }, { status: 400 });
        }
      }
    } catch {
      // Continue to AuthHandler which will handle parsing errors
    }
  }
  
  return AuthHandler(request, authOptions);
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '256kb',
    },
  },
};