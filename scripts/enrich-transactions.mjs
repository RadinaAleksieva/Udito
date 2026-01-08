#!/usr/bin/env node
import { initDb, listAllDetailedOrdersForSite } from "../lib/db.ts";

async function main() {
  try {
    await initDb();

    // Get all orders to find siteId
    const orders = await listAllDetailedOrdersForSite(null);

    if (orders.length === 0) {
      console.log("No orders found in database");
      process.exit(1);
    }

    const siteId = orders[0].site_id;
    console.log(`Found ${orders.length} orders`);
    console.log(`Using siteId: ${siteId}`);

    // Call the enrich endpoint
    const url = `https://udito.vercel.app/api/admin/enrich-transactions?siteId=${siteId}&limit=100`;
    console.log(`Calling: ${url}\n`);

    const response = await fetch(url, { method: "POST" });
    const result = await response.json();

    console.log(JSON.stringify(result, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
