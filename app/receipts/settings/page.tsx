import TopNav from "../../components/top-nav";
import ReceiptSettingsForm from "./receipt-settings-form";
import { initDb } from "@/lib/db";
import { getActiveStore } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ReceiptSettingsPage() {
  await initDb();

  const store = await getActiveStore();
  const storeName = store?.storeName || null;
  const storeId = store?.instanceId || store?.siteId || null;

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
              Активен магазин: <strong>{storeName || storeId || "Неизбран"}</strong>
            </p>
            {!storeId && (
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
      <footer className="footer">UDITO от ДИЗАЙНС БАЙ ПО ЕООД</footer>
    </main>
  );
}
