// Simple script to call the enrich-transactions endpoint
// Usage: WIX_SITE_ID=xxx node scripts/run-enrich.js

const siteId = process.env.WIX_SITE_ID || "d2c5d7db-0e6a-476a-b9e4-d2cd3a65dcef";

async function main() {
  const url = `https://udito.vercel.app/api/admin/enrich-transactions?siteId=${siteId}&limit=100`;

  console.log(`Calling: ${url}\n`);

  try {
    const response = await fetch(url, { method: "POST" });
    const result = await response.json();

    console.log(JSON.stringify(result, null, 2));

    if (result.ok) {
      console.log(`\n✅ Success! Enriched ${result.enriched}/${result.total} orders`);
    } else {
      console.log(`\n❌ Failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
