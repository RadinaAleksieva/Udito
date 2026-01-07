import TopNav from "../components/top-nav";
import CompanyForm from "./company-form";
import { initDb } from "@/lib/db";
import LoginForm from "../login/login-form";
import { getActiveWixContext, getActiveWixToken } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await initDb();
  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;
  const context = getActiveWixContext();
  const instanceId = context.instanceId ?? null;

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
            <p>
              Активен магазин: <strong>{siteId || "Неизбран"}</strong>
            </p>
            {siteId ? (
              <p>
                Код за достъп: <strong>{instanceId || "Няма"}</strong>
              </p>
            ) : null}
            <p>
              Ако няма активен магазин, отворете приложението от Wix или
              използвайте вход с код за достъп.
            </p>
          </div>
        </section>
        <CompanyForm />
        <LoginForm />
      </div>
      <footer className="footer">UDITO от Designs by Po.</footer>
    </main>
  );
}
