// VULN: MCP endpoints might allow SSRF attacks
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { serverUrl, toolName } = body;
  
  // VULN: No URL validation
  // Could allow connecting to internal services
  // Should validate against allowlist of URLs
  
  // VULN: No authentication for MCP operations
  // Missing: check for valid session/API key
  
  // BUG: No timeout for external connections
  // Could hang indefinitely on malicious URLs
}