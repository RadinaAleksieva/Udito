import { sql } from '@vercel/postgres';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function checkToken() {
  const result = await sql`
    SELECT site_id, access_token, expires_at, created_at, updated_at
    FROM wix_tokens
    WHERE site_id = ${SITE_ID}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  
  if (result.rows.length === 0) {
    console.log('❌ No access token found for site');
  } else {
    const token = result.rows[0];
    const expiresAt = new Date(token.expires_at);
    const now = new Date();
    const isExpired = expiresAt < now;
    
    console.log('Access token info:');
    console.log('  Site ID:', token.site_id);
    console.log('  Has token:', token.access_token ? 'YES' : 'NO');
    console.log('  Expires at:', expiresAt.toISOString());
    console.log('  Is expired:', isExpired ? '❌ YES' : '✅ NO');
    console.log('  Created at:', token.created_at);
    console.log('  Updated at:', token.updated_at);
    
    if (isExpired) {
      console.log('\n❌ ACCESS TOKEN IS EXPIRED!');
      console.log('This explains why webhook-s fail silently and initial sync returns 0 orders.');
      console.log('\nSolution: Re-install the app via OAuth to get a fresh token.');
    }
  }
  
  process.exit(0);
}

checkToken().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
