# Security Policy

## 🔐 Reporting a Vulnerability

If you discover a security vulnerability in AI Builder, please report it **privately** by emailing security@your-domain.com. Do not create a public GitHub issue.

We will acknowledge your report within 48 hours and provide a timeline for resolution.

## 🛡️ Security Features Implemented

### Authentication & Authorization
- ✅ JWT-based session management with httpOnly cookies
- ✅ Role-based access control (user/admin/superadmin)
- ✅ Admin actions require explicit role verification
- ✅ Session timeout and refresh token rotation

### Input Validation & Sanitization
- ✅ Zod schema validation for all API inputs
- ✅ XSS prevention via HTML entity encoding
- ✅ SQL injection prevention via parameterized queries (Drizzle ORM)
- ✅ Path traversal prevention in file operations

### Rate Limiting & Abuse Prevention
- ✅ Per-IP and per-user rate limiting on auth endpoints
- ✅ Request size limits on all API routes
- ✅ Timeout enforcement on external API calls
- ✅ Suspicious user agent blocking

### Data Protection
- ✅ Environment variable validation at startup
- ✅ Sensitive fields redacted in logs
- ✅ Audit logging for all admin actions
- ✅ Soft deletes for user data (recoverable)

### Infrastructure Security
- ✅ Security headers via middleware (CSP, HSTS, X-Frame-Options)
- ✅ Docker production image with non-root user
- ✅ Health checks for container orchestration
- ✅ Database connection pooling with credentials isolation

## 🔄 Dependency Management

We use automated tools to monitor dependencies: