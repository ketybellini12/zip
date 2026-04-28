import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv } from './env';
import { logger } from './logger';
import * as schema from '@/db/schema';

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqlClient: postgres.Sql | null = null;

export function getDb() {
  if (dbInstance) return dbInstance;

  const env = getEnv();
  
  try {
    sqlClient = postgres(env.DATABASE_URL, {
      max: parseInt(env.DATABASE_POOL_MAX || '10'),
      min: parseInt(env.DATABASE_POOL_MIN || '2'),
      idle_timeout: 30,
      connect_timeout: 10,
      max_lifetime: 60 * 30,
      onnotice: (notice) => {
        logger.debug('PostgreSQL notice', { notice: notice.message });
      },
      transform: {
        column: { from: postgres.toCamel, to: postgres.fromCamel },
        value: { from: postgres.toCamel, to: postgres.fromCamel },
      },
    });

    dbInstance = drizzle(sqlClient, { schema });
    
    logger.info('Database connection pool initialized', {
      min: env.DATABASE_POOL_MIN,
      max: env.DATABASE_POOL_MAX,
    });

    // Test connection
    sqlClient`SELECT 1`.then(() => {
      logger.info('Database connection verified');
    }).catch((err) => {
      logger.error('Database connection test failed', err);
    });

    return dbInstance;
  } catch (error) {
    logger.error('Failed to initialize database', error as Error);
    throw new Error('Database initialization failed');
  }
}

export async function closeDb() {
  if (sqlClient) {
    try {
      await sqlClient.end({ timeout: 5 });
      logger.info('Database connection pool closed');
    } catch (error) {
      logger.error('Error closing database pool', error as Error);
    }
    sqlClient = null;
    dbInstance = null;
  }
}

// Export transaction helper
export async function transaction<T>(
  fn: (tx: ReturnType<typeof drizzle>) => Promise<T>
): Promise<T> {
  const db = getDb();
  return db.transaction(fn);
}

export const db = getDb();
export default db;