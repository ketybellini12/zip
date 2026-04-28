import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import validation, { 
  ValidationError, 
  AuthenticationError, 
  RateLimitError 
} from '@/lib/validation';
import { db } from '@/lib/db';
import { messages, threads } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const ALLOWED_MODELS = ['gpt-4', 'gpt-3.5-turbo', 'claude-3', 'deepseek-chat'] as const;
const RATE_LIMIT = { maxRequests: 60, windowMs: 60 * 1000 }; // 60 requests per minute

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthenticationError();
    }

    // Rate limiting
    const rateLimitKey = `chat:${session.user.id}`;
    if (!validation.checkRateLimit(rateLimitKey, RATE_LIMIT.maxRequests, RATE_LIMIT.windowMs)) {
      throw new RateLimitError();
    }

    // Request size limit (Next.js middleware should also enforce this)
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 1024 * 1024) { // 1MB limit
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { message, threadId, model, metadata } = validation.validateRequest(
      validation.chatMessageSchema,
      body
    );

    // Model validation
    if (!ALLOWED_MODELS.includes(model as typeof ALLOWED_MODELS[number])) {
      return NextResponse.json({ error: 'Invalid model specified' }, { status: 400 });
    }

    // Sanitize message content
    const sanitizedMessage = validation.sanitizeInput(message);

    // Verify thread ownership
    const thread = await db.query.threads.findFirst({
      where: and(
        eq(threads.id, threadId),
        eq(threads.userId, session.user.id)
      ),
    });

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    // Save message to database with transaction
    await db.transaction(async (tx) => {
      await tx.insert(messages).values({
        threadId,
        content: sanitizedMessage,
        role: 'user',
        model,
        metadata: metadata || {},
        createdAt: new Date(),
      });
      
      // Update thread's last activity
      await tx.update(threads)
        .set({ updatedAt: new Date() })
        .where(eq(threads.id, threadId));
    });

    // Process with AI (placeholder - implement your AI logic here)
    const aiResponse = await processWithAI(sanitizedMessage, model, metadata);

    return NextResponse.json({ 
      success: true, 
      response: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat API error:', error);
    
    if (error instanceof ValidationError) {
      return NextResponse.json({ 
        error: 'Invalid request', 
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }
    
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ 
        error: 'Unauthorized', 
        code: 'AUTH_REQUIRED'
      }, { status: 401 });
    }
    
    if (error instanceof RateLimitError) {
      return NextResponse.json({ 
        error: 'Too many requests', 
        code: 'RATE_LIMITED',
        retryAfter: RATE_LIMIT.windowMs / 1000
      }, { status: 429 });
    }
    
    // Generic error for unexpected issues (no internal details exposed)
    return NextResponse.json({ 
      error: 'An error occurred processing your request',
      code: 'INTERNAL_ERROR'
    }, { status: 500 });
  }
}

async function processWithAI(message: string, model: string, metadata?: Record<string, unknown>) {
  // Implement your AI provider integration here
  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  try {
    // Placeholder: Replace with actual AI API call
    const response = await fetch('https://api.example.com/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, model }),
      signal: controller.signal,
    });
    
    if (!response.ok) {
      throw new Error('AI service unavailable');
    }
    
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export const runtime = 'edge'; // Optional: Use Edge runtime for better performance