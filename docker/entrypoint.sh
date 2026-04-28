#!/bin/sh
set -e

echo "🚀 Starting AI Builder..."

# Wait for database to be ready (if DATABASE_URL is set)
if [ -n "$DATABASE_URL" ]; then
  echo "⏳ Waiting for database..."
  for i in {1..30}; do
    if node -e "
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
      pool.query('SELECT 1').then(() => { console.log('✅ DB ready'); process.exit(0); }).catch(() => process.exit(1));
      pool.end();
    " 2>/dev/null; then
      break
    fi
    echo "  Attempt $i/30..."
    sleep 2
  done
fi

# Run database migrations
if [ "$RUN_MIGRATIONS" != "false" ]; then
  echo "🔄 Running database migrations..."
  node -r esbuild-register drizzle.config.ts migrate 2>/dev/null || echo "⚠️ Migrations skipped (may require build tools)"
fi

# Start the application
echo "✅ Starting Next.js server..."
exec node server.js