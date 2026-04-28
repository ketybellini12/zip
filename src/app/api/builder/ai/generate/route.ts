import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import validation, { 
  ValidationError, 
  AuthenticationError 
} from '@/lib/validation';
import { z } from 'zod';

const GENERATE_TIMEOUT_MS = 60000; // 60 second timeout
const MAX_CODE_LENGTH = 100000; // 100KB limit for generated code

const generateRequestSchema = z.object({
  prompt: z.string().min(1).max(5000),
  language: z.enum(['typescript', 'javascript', 'python', 'html', 'css']),
  framework: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthenticationError();
    }

    // Rate limiting (reuse chat rate limit or define separate)
    const rateLimitKey = `generate:${session.user.id}`;
    if (!validation.checkRateLimit(rateLimitKey, 10, 60 * 1000)) { // 10 per minute
      return NextResponse.json({ 
        error: 'Rate limit exceeded', 
        code: 'RATE_LIMITED'
      }, { status: 429 });
    }

    // Request size validation
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 512 * 1024) { // 512KB limit
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    // Parse and validate
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { prompt, language, framework, context } = validation.validateRequest(
      generateRequestSchema,
      body
    );

    // Sanitize prompt
    const sanitizedPrompt = validation.sanitizeInput(prompt);

    // Execute code generation with timeout and sandboxing
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);

    try {
      // Call AI code generation service (sandboxed environment)
      const response = await fetch('https://ai-code-generator.internal/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`,
          'X-User-ID': session.user.id,
        },
        body: JSON.stringify({
          prompt: sanitizedPrompt,
          language,
          framework,
          context: context || {},
          options: {
            maxTokens: 4000,
            temperature: 0.2, // Lower temperature for more deterministic code
            sandbox: true, // Ensure generated code runs in sandbox
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`Code generation failed: ${response.status} - ${errorText}`);
        return NextResponse.json({ 
          error: 'Code generation failed',
          code: 'GENERATION_ERROR'
        }, { status: response.status });
      }

      const result = await response.json();
      
      // Validate output before returning
      if (result.code && typeof result.code === 'string') {
        if (result.code.length > MAX_CODE_LENGTH) {
          return NextResponse.json({ 
            error: 'Generated code exceeds size limit',
            code: 'CODE_TOO_LARGE'
          }, { status: 400 });
        }
        // Basic safety check: reject code with dangerous patterns
        if (/eval\s*\(|exec\s*\(|__import__|os\.system|subprocess/i.test(result.code)) {
          console.warn('Potentially dangerous code pattern detected');
          // In production: reject or sanitize further
        }
      }

      return NextResponse.json({ 
        success: true, 
        code: result.code,
        explanation: result.explanation,
        warnings: result.warnings || [],
        timestamp: new Date().toISOString()
      });

    } finally {
      clearTimeout(timeout);
    }

  } catch (error) {
    console.error('Code generation API error:', error);
    
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
    
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ 
        error: 'Code generation timeout',
        code: 'TIMEOUT'
      }, { status: 504 });
    }
    
    return NextResponse.json({ 
      error: 'An error occurred generating code',
      code: 'INTERNAL_ERROR'
    }, { status: 500 });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '512kb',
    },
  },
};