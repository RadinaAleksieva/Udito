const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';
const API_URL = 'https://udito.vercel.app/api/sync/initial';

async function triggerSync() {
  console.log('Triggering initial sync for site', SITE_ID);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId: SITE_ID }),
  });

  const data = await response.json();

  if (response.ok) {
    console.log('✅ Sync completed!');
    console.log(`   Synced: ${data.synced} orders`);
    console.log(`   Errors: ${data.errors}`);
    console.log(`   Total: ${data.total}`);
  } else {
    console.log('❌ Sync failed:', data.error);
  }
}

triggerSync();
