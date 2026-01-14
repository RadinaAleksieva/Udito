import TopNav from "../../components/top-nav";
import ReceiptSettingsForm from "./receipt-settings-form";
import { initDb } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";
import { auth, getUserStores } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ReceiptSettingsPage() {
  await initDb();

  // Get store from NextAuth session first, fallback to Wix cookies
  let storeName: string | null = null;
  let storeId: string | null = null;

  const session = await auth();
  if (session?.user?.id) {
    const userStores = await getUserStores(session.user.id);
    if (userStores.length > 0) {
      storeName = userStores[0].store_name || null;
      storeId = userStores[0].instance_id || userStores[0].site_id || null;
    }
  } else {
    const token = await getActiveWixToken();
    storeId = token?.site_id ?? token?.instance_id ?? null;
  }

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
