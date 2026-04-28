// BUG: No connection pooling
// Each request creates a new database connection

export async function saveMessage(threadId: string, content: string) {
  // BUG: No transaction wrapping
  // If this fails mid-way, data inconsistency occurs
  
  const db = await getConnection();
  await db.query('INSERT INTO messages...');
  
  // BUG: Connection not closed in catch block
  // Leads to connection leaks and eventual server crash
}