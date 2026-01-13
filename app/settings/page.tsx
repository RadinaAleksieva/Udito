import TopNav from "../components/top-nav";
import CompanyForm from "./company-form";
import { initDb } from "@/lib/db";
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

  return (
    <main>
      <TopNav title="Настройки" />
      <div className="container">
        <section className="hero">
          <div>
            <h1>Настройки на магазина</h1>
            <p>
              Настройте фирмените данни, избрания шаблон и връзката с Wix.
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
              Активен магазин: <strong>{siteId || "Неизбран"}</strong>
            </p>
            {siteId && instanceId ? (
              <p>
                Код за достъп: <strong>{instanceId}</strong>
              </p>
            ) : null}
            {!siteId && (
              <p className="form-warning">
                Няма свързан магазин. Отворете приложението от Wix, за да свържете магазина.
              </p>
            )}
          </div>
        </section>
        <CompanyForm />
      </div>
      <footer className="footer">UDITO от Designs by Po.</footer>
    </main>
  );
}
