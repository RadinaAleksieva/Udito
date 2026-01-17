/**
 * PostgreSQL client for Supabase
 *
 * This module provides a `sql` tagged template literal function
 * that mimics @vercel/postgres API but works with Supabase.
 */

import { Pool, QueryResult, QueryResultRow } from 'pg';

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Type for the sql function result (compatible with @vercel/postgres)
interface SqlResult<T extends QueryResultRow = QueryResultRow> {
  rows: T[];
  rowCount: number | null;
  fields: QueryResult<T>['fields'];
  command: string;
  oid: number;
}

// Tagged template function that works like @vercel/postgres sql
export function sql<T extends QueryResultRow = QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<SqlResult<T>> {
  // Build the query string with $1, $2, ... placeholders
  let query = strings[0];
  for (let i = 0; i < values.length; i++) {
    query += `$${i + 1}${strings[i + 1]}`;
  }

  return pool.query<T>(query, values) as Promise<SqlResult<T>>;
}

// For backwards compatibility with @vercel/postgres API
sql.query = async <T extends QueryResultRow = QueryResultRow>(
  query: string,
  values?: unknown[]
): Promise<SqlResult<T>> => {
  return pool.query<T>(query, values) as Promise<SqlResult<T>>;
};

// Export pool for direct access if needed
export { pool };

// Cleanup function for graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  await pool.end();
}

// Export types that match @vercel/postgres
export type { QueryResultRow };
