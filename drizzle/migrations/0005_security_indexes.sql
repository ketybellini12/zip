-- Add critical indexes for security and performance
-- Migration: 0005_security_indexes.sql

-- User authentication indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned) WHERE is_banned = true;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- Session/token indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_verification_tokens_identifier ON verification_tokens(identifier);

-- Thread/message security indexes
CREATE INDEX IF NOT EXISTS idx_threads_user_id ON threads(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_created_at ON threads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- Audit logging indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id ON audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Billing indexes
CREATE INDEX IF NOT EXISTS idx_billing_user_id ON billing(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_status ON billing(status);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- MCP server indexes
CREATE INDEX IF NOT EXISTS idx_mcp_servers_user_id ON mcp_servers(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_url ON mcp_servers(url);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_is_public ON mcp_servers(is_public) WHERE is_public = true;

-- Rate limiting table (new)
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(key)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key);
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at);

-- Add foreign key constraints with ON DELETE behavior
ALTER TABLE messages 
  ADD CONSTRAINT fk_messages_thread 
  FOREIGN KEY (thread_id) 
  REFERENCES threads(id) 
  ON DELETE CASCADE;

ALTER TABLE threads 
  ADD CONSTRAINT fk_threads_user 
  FOREIGN KEY (user_id) 
  REFERENCES users(id) 
  ON DELETE CASCADE;

ALTER TABLE audit_logs 
  ADD CONSTRAINT fk_audit_logs_admin 
  FOREIGN KEY (admin_id) 
  REFERENCES users(id) 
  ON DELETE SET NULL,
  ADD CONSTRAINT fk_audit_logs_target 
  FOREIGN KEY (target_user_id) 
  REFERENCES users(id) 
  ON DELETE CASCADE;

-- Add check constraints for data integrity
ALTER TABLE users 
  ADD CONSTRAINT chk_users_role 
  CHECK (role IN ('user', 'admin', 'superadmin')),
  ADD CONSTRAINT chk_users_email_format 
  CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

ALTER TABLE threads 
  ADD CONSTRAINT chk_threads_title_length 
  CHECK (char_length(title) <= 200);

ALTER TABLE messages 
  ADD CONSTRAINT chk_messages_content_length 
  CHECK (char_length(content) <= 10000);

-- Add RLS (Row Level Security) policies if using PostgreSQL RLS
-- Uncomment if your setup uses RLS:
/*
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_threads_policy ON threads
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY user_messages_policy ON messages
  FOR ALL USING (
    thread_id IN (
      SELECT id FROM threads WHERE user_id = auth.uid()
    )
  );
*/