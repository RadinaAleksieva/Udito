import { NextResponse } from 'next/server';
import { sql } from '@/lib/sql';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Test database connection
    const result = await sql`SELECT 1 as test`;

    // Get basic stats from shared tables
    const businessCount = await sql`SELECT COUNT(*) as count FROM businesses`;
    const storeCount = await sql`SELECT COUNT(*) as count FROM store_connections`;

    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      stats: {
        businesses: businessCount.rows[0]?.count ?? 0,
        stores: storeCount.rows[0]?.count ?? 0,
      },
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
