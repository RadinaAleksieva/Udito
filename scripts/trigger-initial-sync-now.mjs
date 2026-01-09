import fs from 'fs';

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function triggerSync() {
  console.log('Triggering initial sync for site:', SITE_ID);
  
  const response = await fetch('https://udito.vercel.app/api/sync/initial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId: SITE_ID }),
  });
  
  const result = await response.json();
  console.log('Sync result:', JSON.stringify(result, null, 2));
  
  process.exit(0);
}

triggerSync().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
