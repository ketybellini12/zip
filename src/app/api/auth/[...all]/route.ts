// BUG: No rate limiting on auth endpoints
// Could allow brute force attacks

export async function POST(request: NextRequest) {
  // BUG: No CAPTCHA or additional verification
  // Missing: rate limiting, IP blocking
  
  // VULN: Password reset without email verification
  // Missing: token expiration check
}