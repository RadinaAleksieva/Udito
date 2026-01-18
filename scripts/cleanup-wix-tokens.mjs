#!/usr/bin/env node
import pg from 'pg';

// Connect to the self-hosted server's PostgreSQL
const connectionString = 'postgresql://udito_user:udito_password@78.47.173.82:5432/udito';

const client = new pg.Client({ connectionString });

async function main() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Show duplicates
    const duplicates = await client.query(`
      SELECT site_id, COUNT(*), array_agg(id ORDER BY updated_at DESC NULLS LAST) as ids
      FROM wix_tokens
      WHERE site_id IS NOT NULL
      GROUP BY site_id
      HAVING COUNT(*) > 1
    `);
    console.log('Duplicate site_ids:', duplicates.rows);

    if (duplicates.rows.length === 0) {
      console.log('No duplicates found!');
    } else {
      // For each site_id with duplicates, keep only the record with the highest id
      for (const row of duplicates.rows) {
        const siteId = row.site_id;
        const ids = row.ids;
        const keepId = ids[0]; // First id is the most recent (sorted by updated_at DESC)

        console.log(`Processing site_id ${siteId}: keeping id ${keepId}, deleting ${ids.length - 1} others`);

        const deleteResult = await client.query(`
          DELETE FROM wix_tokens
          WHERE site_id = $1 AND id != $2
        `, [siteId, keepId]);

        console.log(`Deleted ${deleteResult.rowCount} records for site_id ${siteId}`);
      }
    }

    // Check if unique index exists
    const indexCheck = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'wix_tokens' AND indexname = 'wix_tokens_site_id_unique'
    `);

    if (indexCheck.rows.length === 0) {
      // Create unique index
      console.log('Creating unique index on site_id...');
      await client.query(`
        CREATE UNIQUE INDEX wix_tokens_site_id_unique ON wix_tokens (site_id) WHERE site_id IS NOT NULL
      `);
      console.log('Unique index created successfully!');
    } else {
      console.log('Unique index already exists');
    }

    // Show remaining records
    const remaining = await client.query(`
      SELECT id, site_id, updated_at FROM wix_tokens WHERE site_id IS NOT NULL ORDER BY site_id
    `);
    console.log('Remaining records:', remaining.rows);

    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
