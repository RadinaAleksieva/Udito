import TopNav from "../components/top-nav";
import { cookies, headers } from "next/headers";
import { initDb } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

export default async function DebugPage() {
  await initDb();
  const token = await getActiveWixToken();
  const cookieStore = cookies();
  const requestHeaders = headers();

  const instanceCookie = cookieStore.get("udito_instance_id")?.value ?? null;
  const siteCookie = cookieStore.get("udito_site_id")?.value ?? null;
  const referer = requestHeaders.get("referer");
  const userAgent = requestHeaders.get("user-agent");

  return (
    <main>
      <TopNav title="Диагностика" />
      <div className="container">
        <section className="orders">
          <h2>Данни от Wix</h2>
          <div className="orders-table">
            <div className="orders-head">
              <span>Поле</span>
              <span>Стойност</span>
            </div>
            <div className="orders-row">
              <span>Cookie instance_id</span>
              <span>{instanceCookie || "—"}</span>
            </div>
            <div className="orders-row">
              <span>Cookie site_id</span>
              <span>{siteCookie || "—"}</span>
            </div>
            <div className="orders-row">
              <span>DB instance_id</span>
              <span>{token?.instance_id || "—"}</span>
            </div>
            <div className="orders-row">
              <span>DB site_id</span>
              <span>{token?.site_id || "—"}</span>
            </div>
            <div className="orders-row">
              <span>DB access_token</span>
              <span>{token?.access_token ? "има" : "липсва"}</span>
            </div>
            <div className="orders-row">
              <span>DB refresh_token</span>
              <span>{token?.refresh_token ? "има" : "липсва"}</span>
            </div>
            <div className="orders-row">
              <span>DB expires_at</span>
              <span>{token?.expires_at || "—"}</span>
            </div>
            <div className="orders-row">
              <span>Referer</span>
              <span>{referer || "—"}</span>
            </div>
            <div className="orders-row">
              <span>User-Agent</span>
              <span>{userAgent || "—"}</span>
            </div>
          </div>
        </section>
        <section className="orders">
          <h2>Последна поръчка (debug)</h2>
          <p>
            <a className="status-link" href="/api/debug/order" target="_blank">
              Отвори суровата поръчка
            </a>
          </p>
        </section>
      </div>
      <footer className="footer">UDITO от Designs by Po.</footer>
    </main>
  );
}
