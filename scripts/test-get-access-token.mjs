import { getAccessToken } from '../lib/wix.ts';

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function test() {
  try {
    console.log('Getting access token for site:', SITE_ID);
    const token = await getAccessToken({ siteId: SITE_ID });
    
    console.log('✅ Got token!');
    console.log('Token length:', token.length);
    console.log('Token prefix:', token.substring(0, 30));
    
    // Test with API
    console.log('\nTesting with Wix API...');
    const response = await fetch(
      `https://www.wixapis.com/ecom/v1/orders?limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'wix-site-id': SITE_ID,
        },
      }
    );
    
    console.log('API Response status:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('✅ SUCCESS! Orders:', data.orders?.length || 0);
      if (data.orders && data.orders.length > 0) {
        console.log('First order number:', data.orders[0].number);
      }
    } else {
      const text = await response.text();
      console.log('❌ Error:', text.substring(0, 200));
    }
    
  } catch (error) {
    console.error('❌ Error getting token:', error.message);
    console.error(error);
  }
  
  process.exit(0);
}

test();
