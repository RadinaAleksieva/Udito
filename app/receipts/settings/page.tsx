import TopNav from "../../components/top-nav";
import ReceiptSettingsForm from "./receipt-settings-form";
import { initDb } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

export default async function ReceiptSettingsPage() {
  await initDb();
  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;

  return (
    <main>
      <TopNav title="Настройки на бележки" />
      <div className="container">
        <section className="hero">
          <div>
            <h1>Настройки на електронните бележки</h1>
            <p>
              Задайте начален номер на бележките и други настройки за издаване.
            </p>
          </div>
          <div className="hero-card">
            <h2>Статус</h2>
            <p>
              Активен магазин: <strong>{siteId || "Неизбран"}</strong>
            </p>
            {!siteId && (
              <p>
                Отворете приложението от Wix, за да свържете магазина.
              </p>
            )}
            <a href="/receipts" className="status-link">
              Назад към електронни бележки
            </a>
          </div>
        </section>
        <ReceiptSettingsForm />
      </div>
      <footer className="footer">UDITO от Designs by Po.</footer>
    </main>
  );
}
