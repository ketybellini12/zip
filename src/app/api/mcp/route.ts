import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import validation, { 
  ValidationError, 
  AuthenticationError 
} from '@/lib/validation';
import { db } from '@/lib/db';
import { mcpServers } from '@/db/schema';
import { eq } from 'drizzle-orm';

const ALLOWED_MCP_DOMAINS = [
  'mcp.example.com',
  'tools.trusted-provider.com',
  // Add your allowlisted MCP server domains here
];

const MCP_TIMEOUT_MS = 15000; // 15 second timeout for MCP calls

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      throw new AuthenticationError();
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { serverUrl, toolName, parameters } = validation.validateRequest(
      validation.mcpRequestSchema,
      body
    );

    // URL validation against allowlist
    if (!validation.validateUrl(serverUrl, ALLOWED_MCP_DOMAINS)) {
      return NextResponse.json({ 
        error: 'MCP server URL not allowed',
        code: 'URL_NOT_ALLOWED'
      }, { status: 403 });
    }

    // Verify MCP server is registered to user or is public
    const mcpServer = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.url, serverUrl),
    });

    if (mcpServer && mcpServer.userId !== session.user.id && !mcpServer.isPublic) {
      return NextResponse.json({ 
        error: 'Access denied to MCP server',
        code: 'SERVER_ACCESS_DENIED'
      }, { status: 403 });
    }

    // Execute MCP tool call with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);

    try {
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.accessToken || ''}`,
          'X-MCP-Tool': toolName,
        },
        body: JSON.stringify({
          tool: toolName,
          parameters: parameters || {},
          userId: session.user.id,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`MCP call failed: ${response.status} - ${errorText}`);
        return NextResponse.json({ 
          error: 'MCP server error',
          code: 'MCP_REQUEST_FAILED'
        }, { status: response.status });
      }

      const result = await response.json();
      
      return NextResponse.json({ 
        success: true, 
        result,
        timestamp: new Date().toISOString()
      });

    } finally {
      clearTimeout(timeout);
    }

  } catch (error) {
    console.error('MCP API error:', error);
    
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
        error: 'MCP request timeout',
        code: 'TIMEOUT'
      }, { status: 504 });
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
      sizeLimit: '256kb',
    },
  },
};