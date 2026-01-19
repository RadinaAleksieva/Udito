import { sql } from '../lib/sql.js';
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
    SELECT *
    FROM wix_tokens
    WHERE site_id = ${SITE_ID}
    LIMIT 1
  `;
  
  if (result.rows.length === 0) {
    console.log('❌ No access token found for site');
  } else {
    const token = result.rows[0];
    console.log('Token record:');
    console.log(JSON.stringify(token, null, 2));
    
    if (token.expires_at) {
      const expiresAt = new Date(token.expires_at);
      const now = new Date();
      const isExpired = expiresAt < now;
      
      console.log('\n⏰ Expiration check:');
      console.log('  Expires at:', expiresAt.toISOString());
      console.log('  Now:', now.toISOString());
      console.log('  Is expired:', isExpired ? '❌ YES' : '✅ NO');
      
      if (isExpired) {
        console.log('\n❌ ACCESS TOKEN IS EXPIRED!');
        console.log('This explains why webhooks fail and initial sync returns 0 orders.');
      }
    }
  }
  
  process.exit(0);
}

checkToken().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
