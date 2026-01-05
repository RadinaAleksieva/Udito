import TokenCapture from "./token-capture";
import { getLatestWixToken, initDb, listRecentOrders } from "@/lib/db";

function formatMoney(amount: number | null | undefined, currency: string | null) {
  if (amount == null || !currency) return "—";
  return new Intl.NumberFormat("bg-BG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export default async function OverviewPage() {
  await initDb();
  const [token, orders] = await Promise.all([
    getLatestWixToken(),
    listRecentOrders(8),
  ]);
  const hasToken = Boolean(token?.access_token);

  return (
    <main>
      <TokenCapture />
      <nav className="nav">
        <span>UDITO Dashboard</span>
        <div className="badges">
          <div className="badge">Wix Orders</div>
          <div className="badge">Receipts</div>
          <div className="badge">Audit XML</div>
        </div>
      </nav>
      <div className="container">
        <section className="hero">
          <div>
            <h1>Order activity, receipts, and audit exports.</h1>
            <p>
              This dashboard will show synced orders, receipt previews, and the
              monthly audit XML status.
            </p>
            <div className="status-grid">
              <div className="status-card">
                <span>Wix connection</span>
                <strong>{hasToken ? "Connected" : "Not connected"}</strong>
                <a className="status-link" href="/api/oauth/start">
                  {hasToken ? "Reconnect" : "Connect Wix"}
                </a>
              </div>
              <div className="status-card">
                <span>Orders stored</span>
                <strong>{orders.length}</strong>
                <span className="status-meta">Last 8 orders</span>
              </div>
              <div className="status-card">
                <span>Audit export</span>
                <strong>Ready</strong>
                <a className="status-link" href="/api/audit/monthly">
                  Download XML
                </a>
              </div>
            </div>
          </div>
          <div className="hero-card">
            <h2>Next steps</h2>
            <p>
              Connect your Wix store, select a receipt template, and export your
              monthly audit file from here.
            </p>
            <div className="grid">
              <div className="card">
                <h3>Webhooks</h3>
                <p>Waiting for orders from Wix.</p>
              </div>
              <div className="card">
                <h3>Receipt layout</h3>
                <p>Template file ready to wire up.</p>
              </div>
              <div className="card">
                <h3>Audit export</h3>
                <p>XML generator stubbed and ready for data.</p>
              </div>
            </div>
          </div>
        </section>
        <section className="orders">
          <h2>Latest orders</h2>
          {orders.length === 0 ? (
            <p>No orders stored yet. Webhooks or backfill will populate this list.</p>
          ) : (
            <div className="orders-table">
              <div className="orders-head">
                <span>Order</span>
                <span>Status</span>
                <span>Total</span>
                <span>Source</span>
                <span>Created</span>
              </div>
              {orders.map((order) => (
                <div className="orders-row" key={order.id}>
                  <span>{order.number || order.id}</span>
                  <span>{order.payment_status || "—"}</span>
                  <span>{formatMoney(order.total, order.currency)}</span>
                  <span>{order.source || "—"}</span>
                  <span>
                    {order.created_at
                      ? new Date(order.created_at).toLocaleString("bg-BG")
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <footer className="footer">UDITO by Designs by Po.</footer>
    </main>
  );
}
