import { z } from 'zod';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).default('3000'),
  
  // Database
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  DATABASE_POOL_MAX: z.string().regex(/^\d+$/).default('10'),
  DATABASE_POOL_MIN: z.string().regex(/^\d+$/).default('2'),
  
  // Authentication
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  GITHUB_ID: z.string().optional(),
  GITHUB_SECRET: z.string().optional(),
  VERCEL_ID: z.string().optional(),
  VERCEL_SECRET: z.string().optional(),
  
  // AI Providers
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  
  // Storage
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  
  // Redis (for rate limiting, caching)
  REDIS_URL: z.string().url().optional(),
  
  // Monitoring
  SENTRY_DSN: z.string().url().optional(),
  
  // Billing
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  
  // Security
  ALLOWED_ORIGINS: z.string().optional(),
  INTERNAL_API_KEY: z.string().min(16),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

export function getEnv(): Env {
  if (validatedEnv) return validatedEnv;
  
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    const errors = Object.entries(result.error.flatten().fieldErrors)
      .map(([key, values]) => `${key}: ${values?.join(', ')}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${errors}`);
  }
  
  validatedEnv = result.data;
  return validatedEnv;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}

// Export individual env vars with type safety
const env = getEnv();
export const {
  NODE_ENV,
  PORT,
  DATABASE_URL,
  NEXTAUTH_URL,
  NEXTAUTH_SECRET,
  INTERNAL_API_KEY,
  // ... export others as needed
} = env;

export default env;