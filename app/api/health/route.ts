import { NextResponse } from 'next/server';
import { sql } from '@/lib/supabase-sql';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Test database connection
    const result = await sql`SELECT 1 as test`;

    // Get some basic stats
    const stats = await sql`
      SELECT
        (SELECT COUNT(*) FROM orders) as orders,
        (SELECT COUNT(*) FROM receipts) as receipts,
        (SELECT COUNT(*) FROM businesses) as businesses
    `;

    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      stats: stats.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({
      status: 'unhealthy',
      database: 'error',
      error: err.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
