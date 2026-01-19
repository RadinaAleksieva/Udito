/**
 * PostgreSQL client
 *
 * This module provides a `sql` tagged template literal function
 * for database queries.
 */

import { Pool, QueryResult, QueryResultRow } from 'pg';

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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

// Type for the sql function result
interface SqlResult<T extends QueryResultRow = QueryResultRow> {
  rows: T[];
  rowCount: number | null;
  fields: QueryResult<T>['fields'];
  command: string;
  oid: number;
}

// Tagged template function for SQL queries
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

// Query method for parameterized queries
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

// Export types
export type { QueryResultRow };
