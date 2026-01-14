import TopNav from "../components/top-nav";
import CompanyForm from "./company-form";
import StoreConnectForm from "./store-connect-form";
import StoresList from "./stores-list";
import { initDb, sql } from "@/lib/db";
import { getActiveWixContext, getActiveWixToken } from "@/lib/wix-context";
import { auth, getUserStores, linkStoreToUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await initDb();
  const session = await auth();
  let userStores = session?.user?.id ? await getUserStores(session.user.id) : [];

  let siteId: string | null = null;
  let instanceId: string | null = null;

  // Check for Wix cookies (from iframe access)
  const wixContext = await getActiveWixContext();
  const cookieSiteId = wixContext.siteId;
  const cookieInstanceId = wixContext.instanceId;

  if (session?.user?.id && userStores.length > 0) {
    // User logged in with connected stores
    siteId = userStores[0].site_id || null;
    instanceId = userStores[0].instance_id || null;
  } else if (session?.user?.id && (cookieSiteId || cookieInstanceId)) {
    // User logged in with Wix cookies but no store connections - AUTO LINK
    try {
      await linkStoreToUser(session.user.id, cookieSiteId || "", cookieInstanceId || undefined);
      userStores = await getUserStores(session.user.id);
      if (userStores.length > 0) {
        siteId = userStores[0].site_id || null;
        instanceId = userStores[0].instance_id || null;
      } else {
        siteId = cookieSiteId;
        instanceId = cookieInstanceId;
      }
    } catch {
      siteId = cookieSiteId;
      instanceId = cookieInstanceId;
    }
  } else {
    // Legacy flow - use cookies
    const token = await getActiveWixToken();
    siteId = token?.site_id ?? null;
    instanceId = cookieInstanceId ?? null;
  }

  // Get company info for connected stores (store_name priority: store_connections > companies)
  const storesWithInfo = await Promise.all(
    userStores.map(async (store: any) => {
      const companyResult = await sql`
        SELECT store_name, store_domain FROM companies
        WHERE site_id = ${store.site_id}
        LIMIT 1
      `;
      return {
        ...store,
        // Prefer store_name from store_connections, fall back to companies
        store_name: store.store_name || companyResult.rows[0]?.store_name || null,
        store_domain: companyResult.rows[0]?.store_domain || null,
      };
    })
  );

  return (
    <main>
      <TopNav title="Настройки" />
      <div className="container">
        <section className="hero">
          <div>
            <h1>Настройки на магазина</h1>
            <p>
              Настройте фирмените данни и управлявайте свързаните магазини.
            </p>
          </div>
          <div className="hero-card">
            <h2>Статус</h2>
            {session?.user && (
              <p>
                Потребител: <strong>{session.user.email}</strong>
              </p>
            )}
            <p>
              Свързани магазини: <strong>{userStores.length}</strong>
            </p>
          </div>
        </section>

        {/* Connected Stores Section */}
        {session?.user && (
          <section className="settings-section">
            <h2>Свързани магазини</h2>
            <StoresList stores={storesWithInfo} />
          </section>
        )}

        {/* Store Connect Form - only for authenticated users */}
        {session?.user && <StoreConnectForm />}

        {/* Company Form */}
        <CompanyForm />
      </div>
      <footer className="footer">UDITO от Designs by Po.</footer>
    </main>
  );
}
