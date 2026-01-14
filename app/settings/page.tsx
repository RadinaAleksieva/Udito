import TopNav from "../components/top-nav";
import CompanyForm from "./company-form";
import StoreConnectForm from "./store-connect-form";
import StoresList from "./stores-list";
import UserAccess from "./user-access";
import { initDb, sql } from "@/lib/db";
import { getActiveWixContext } from "@/lib/wix-context";
import { auth, getUserStores, linkStoreToUser, getActiveStore } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await initDb();
  const session = await auth();
  let userStores = session?.user?.id ? await getUserStores(session.user.id) : [];

  // Auto-link Wix store if user logged in but no stores connected
  if (session?.user?.id && userStores.length === 0) {
    const wixContext = await getActiveWixContext();
    if (wixContext.siteId || wixContext.instanceId) {
      try {
        await linkStoreToUser(session.user.id, wixContext.siteId || "", wixContext.instanceId || undefined);
        userStores = await getUserStores(session.user.id);
      } catch {
        // Ignore link errors
      }
    }
  }

  // Use centralized store getter
  const store = await getActiveStore();

  // Get company info for connected stores (store_name priority: store_connections > companies)
  const storesWithInfo = await Promise.all(
    userStores.map(async (s: any) => {
      const companyResult = await sql`
        SELECT store_name, store_domain FROM companies
        WHERE site_id = ${s.site_id}
        LIMIT 1
      `;
      return {
        ...s,
        // Prefer store_name from store_connections, fall back to companies
        store_name: s.store_name || companyResult.rows[0]?.store_name || null,
        store_domain: companyResult.rows[0]?.store_domain || null,
      };
    })
  );

  // Get user's role for current store
  const currentStore = storesWithInfo.find((s: any) => s.site_id === store?.siteId);
  const userRole = currentStore?.role || "member";

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

        {/* User Access Management */}
        {session?.user && store?.siteId && (
          <UserAccess
            siteId={store.siteId}
            currentUserId={session.user.id}
            userRole={userRole}
          />
        )}

        {/* Company Form - Store Data */}
        <CompanyForm />

        {/* Store Connect Form - only for authenticated users */}
        {session?.user && <StoreConnectForm />}
      </div>
      <footer className="footer">UDITO от ДИЗАЙНС БАЙ ПО ЕООД</footer>
    </main>
  );
}
