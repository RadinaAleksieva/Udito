"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Business {
  id: string;
  name: string;
  subscription_status: string;
  plan_id: string;
  trial_ends_at: string;
  subscription_expires_at: string;
  onboarding_completed: boolean;
  onboarding_step: number;
  created_at: string;
  total_receipts: number;
  receipts_this_month: number;
  total_orders: number;
  user_emails: string;
  user_count: number;
  store_name: string;
  site_id: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

interface AccessCode {
  id: string;
  code: string;
  site_id: string;
  role: string;
  expires_at: string;
  created_at: string;
  used_at: string | null;
  used_by_email: string | null;
  store_name: string;
  business_name: string;
}

interface Stats {
  totalBusinesses: number;
  totalUsers: number;
  totalOrders: number;
  totalReceipts: number;
  activeSubscriptions: number;
  trialUsers: number;
}

interface DbSchema {
  name: string;
  tableCount: number;
}

interface DbTable {
  name: string;
  rowCount: number;
}

interface DbColumn {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
}

interface OrdersBySite {
  site_id: string;
  store_name: string;
  store_domain: string;
  business_name: string;
  order_count: number;
  receipt_count: number;
}

// Plan limits
const PLAN_LIMITS: Record<string, number> = {
  starter: 50,
  business: 300,
  corporate: -1, // unlimited
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "businesses" | "users" | "access" | "database">("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [ordersBySite, setOrdersBySite] = useState<OrdersBySite[]>([]);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  // Modal states
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState("");

  // Database tab states
  const [dbSchemas, setDbSchemas] = useState<DbSchema[]>([]);
  const [dbTables, setDbTables] = useState<DbTable[]>([]);
  const [dbData, setDbData] = useState<{
    columns: DbColumn[];
    primaryKeys: string[];
    rows: Record<string, unknown>[];
    total: number;
    page: number;
    totalPages: number;
  } | null>(null);
  const [dbView, setDbView] = useState<"schemas" | "tables" | "data">("schemas");
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [dbPage, setDbPage] = useState(1);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, unknown>>({});
  const [dbLoading, setDbLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      loadData();
    }
  }, [status, router]);

  async function loadData() {
    try {
      const [dashRes, bizRes, accessRes] = await Promise.all([
        fetch("/api/admin/dashboard"),
        fetch("/api/admin/businesses"),
        fetch("/api/admin/access"),
      ]);

      if (dashRes.status === 403) {
        setError("Нямате достъп до тази страница");
        setIsLoading(false);
        return;
      }

      const dashData = await dashRes.json();

      // Handle businesses - might fail independently
      let bizData = { businesses: [] };
      if (bizRes.ok) {
        bizData = await bizRes.json();
      } else {
        console.error("Businesses API error:", bizRes.status);
      }

      // Handle access codes - might fail independently
      let accessData = { accessCodes: [] };
      if (accessRes.ok) {
        accessData = await accessRes.json();
      } else {
        console.error("Access API error:", accessRes.status);
      }

      setStats(dashData.stats);
      setUsers(dashData.users || []);
      setBusinesses(bizData.businesses || []);
      setAccessCodes(accessData.accessCodes || []);
      setOrdersBySite(dashData.ordersBySite || []);

      // Show warning if some data failed to load
      if (!bizRes.ok || !accessRes.ok) {
        setActionMessage("Някои данни не се заредиха правилно");
      }
    } catch (err) {
      console.error("Error loading admin data:", err);
      setError("Грешка при зареждане на данните");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBusinessAction(businessId: string, action: string, data: Record<string, unknown> = {}) {
    setActionMessage("");
    try {
      const response = await fetch("/api/admin/businesses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, action, ...data }),
      });

      if (!response.ok) throw new Error("Action failed");

      setActionMessage("Успешно!");
      setShowModal(false);
      loadData();
    } catch {
      setActionMessage("Грешка при изпълнение на действието");
    }
  }

  async function handleDeleteBusiness(businessId: string) {
    if (!confirm("Сигурни ли сте? Това ще изтрие бизнеса и всички свързани данни!")) return;

    try {
      const response = await fetch(`/api/admin/businesses?id=${businessId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Delete failed");

      setActionMessage("Бизнесът е изтрит");
      loadData();
    } catch {
      setActionMessage("Грешка при изтриване");
    }
  }

  async function handleCreateAccessCode(siteId: string) {
    try {
      const response = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, role: "accountant", expiresInDays: 30 }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setActionMessage(`Код създаден: ${data.code}`);
      loadData();
    } catch {
      setActionMessage("Грешка при създаване на код");
    }
  }

  async function handleSyncOrders(siteId: string, days: number = 7) {
    setActionMessage("Синхронизиране...");
    try {
      const response = await fetch("/api/admin/sync-recent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, days }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sync failed");

      setActionMessage(`Синхронизирани ${data.syncedCount} поръчки (${data.archivedCount} архивирани)`);
      loadData();
    } catch (err) {
      setActionMessage(`Грешка при синхронизиране: ${(err as Error).message}`);
    }
  }

  // Database functions
  async function loadSchemas() {
    setDbLoading(true);
    try {
      const res = await fetch("/api/admin/database/schemas");
      if (!res.ok) throw new Error("Failed to load schemas");
      const data = await res.json();
      setDbSchemas(data.schemas || []);
    } catch (err) {
      setActionMessage(`Грешка: ${(err as Error).message}`);
    } finally {
      setDbLoading(false);
    }
  }

  async function loadTables(schema: string) {
    setDbLoading(true);
    try {
      const res = await fetch(`/api/admin/database/tables?schema=${schema}`);
      if (!res.ok) throw new Error("Failed to load tables");
      const data = await res.json();
      setDbTables(data.tables || []);
      setSelectedSchema(schema);
      setDbView("tables");
    } catch (err) {
      setActionMessage(`Грешка: ${(err as Error).message}`);
    } finally {
      setDbLoading(false);
    }
  }

  async function loadTableData(schema: string, table: string, page: number = 1) {
    setDbLoading(true);
    try {
      const res = await fetch(`/api/admin/database/data?schema=${schema}&table=${table}&page=${page}&limit=50`);
      if (!res.ok) throw new Error("Failed to load data");
      const data = await res.json();
      setDbData(data);
      setSelectedTable(table);
      setDbPage(page);
      setDbView("data");
    } catch (err) {
      setActionMessage(`Грешка: ${(err as Error).message}`);
    } finally {
      setDbLoading(false);
    }
  }

  async function handleUpdateRow() {
    if (!selectedSchema || !selectedTable || !editingRow) return;
    const pk = dbData?.primaryKeys[0] || "id";
    const id = editingRow[pk];

    try {
      const res = await fetch("/api/admin/database/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: selectedSchema,
          table: selectedTable,
          id,
          data: editFormData
        }),
      });
      if (!res.ok) throw new Error("Failed to update row");
      setActionMessage("Редът е обновен успешно");
      setEditingRow(null);
      loadTableData(selectedSchema, selectedTable, dbPage);
    } catch (err) {
      setActionMessage(`Грешка: ${(err as Error).message}`);
    }
  }

  async function handleDeleteRow(row: Record<string, unknown>) {
    if (!selectedSchema || !selectedTable) return;
    const pk = dbData?.primaryKeys[0] || "id";
    const id = row[pk];

    if (!confirm(`Сигурни ли сте, че искате да изтриете този ред (${pk}=${id})?`)) return;

    try {
      const res = await fetch("/api/admin/database/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: selectedSchema,
          table: selectedTable,
          id
        }),
      });
      if (!res.ok) throw new Error("Failed to delete row");
      setActionMessage("Редът е изтрит успешно");
      loadTableData(selectedSchema, selectedTable, dbPage);
    } catch (err) {
      setActionMessage(`Грешка: ${(err as Error).message}`);
    }
  }

  function startEditRow(row: Record<string, unknown>) {
    setEditingRow(row);
    setEditFormData({ ...row });
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("bg-BG");
  }

  function formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") {
      const str = JSON.stringify(value);
      return str.length > 50 ? str.substring(0, 47) + "..." : str;
    }
    const str = String(value);
    return str.length > 50 ? str.substring(0, 47) + "..." : str;
  }

  function getDaysRemaining(dateStr: string | null) {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function getPlanLimit(planId: string | null) {
    return PLAN_LIMITS[planId || "starter"] || 50;
  }

  if (status === "loading" || isLoading) {
    return (
      <main className="admin-page">
        <div className="admin-container">
          <div className="admin-loading">
            <div className="login-spinner"></div>
            <p>Зареждане...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="admin-page">
        <div className="admin-container">
          <div className="admin-error">
            <h1>Грешка</h1>
            <p>{error}</p>
            <Link href="/overview" className="admin-btn">Към Overview</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <div className="admin-container">
        <div className="admin-header">
          <h1>Admin Dashboard</h1>
          <Link href="/overview" className="admin-back">← Назад</Link>
        </div>

        {actionMessage && (
          <div className={`admin-message ${actionMessage.includes("Грешка") ? "error" : "success"}`}>
            {actionMessage}
            <button onClick={() => setActionMessage("")}>×</button>
          </div>
        )}

        {/* Tabs */}
        <div className="admin-tabs">
          <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>
            Преглед
          </button>
          <button className={activeTab === "businesses" ? "active" : ""} onClick={() => setActiveTab("businesses")}>
            Бизнеси ({businesses.length})
          </button>
          <button className={activeTab === "users" ? "active" : ""} onClick={() => setActiveTab("users")}>
            Потребители ({users.length})
          </button>
          <button className={activeTab === "access" ? "active" : ""} onClick={() => setActiveTab("access")}>
            Достъп ({accessCodes.length})
          </button>
          <button className={activeTab === "database" ? "active" : ""} onClick={() => { setActiveTab("database"); if (dbSchemas.length === 0) loadSchemas(); }}>
            База данни
          </button>
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && stats && (
          <div className="admin-overview">
            <div className="admin-stats">
              <div className="admin-stat">
                <span className="admin-stat__value">{stats.totalBusinesses}</span>
                <span className="admin-stat__label">Бизнеси</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__value">{stats.totalUsers}</span>
                <span className="admin-stat__label">Потребители</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__value">{stats.totalOrders}</span>
                <span className="admin-stat__label">Поръчки</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__value">{stats.totalReceipts}</span>
                <span className="admin-stat__label">Бележки</span>
              </div>
              <div className="admin-stat highlight">
                <span className="admin-stat__value">{stats.activeSubscriptions}</span>
                <span className="admin-stat__label">Активни абонаменти</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__value">{stats.trialUsers}</span>
                <span className="admin-stat__label">В пробен период</span>
              </div>
            </div>

            {/* Orders by Site */}
            <div className="admin-section">
              <h2>Поръчки по сайт</h2>
              <div className="admin-table-wrapper">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Магазин</th>
                      <th>Бизнес</th>
                      <th>Домейн</th>
                      <th>Поръчки</th>
                      <th>Бележки</th>
                      <th>Site ID</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordersBySite.map((site, idx) => (
                      <tr key={idx}>
                        <td>{site.store_name || "—"}</td>
                        <td>{site.business_name || "—"}</td>
                        <td>{site.store_domain || "—"}</td>
                        <td><strong>{site.order_count}</strong></td>
                        <td>{site.receipt_count}</td>
                        <td><code>{site.site_id?.slice(0, 12)}...</code></td>
                        <td>
                          <button
                            className="admin-btn small"
                            onClick={() => handleSyncOrders(site.site_id, 7)}
                            title="Синхронизирай последните 7 дни"
                          >
                            Sync 7d
                          </button>
                        </td>
                      </tr>
                    ))}
                    {ordersBySite.length === 0 && (
                      <tr><td colSpan={7} className="admin-empty">Няма поръчки</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Businesses Tab */}
        {activeTab === "businesses" && (
          <div className="admin-businesses">
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Бизнес</th>
                    <th>Статус</th>
                    <th>План</th>
                    <th>Бележки (месец)</th>
                    <th>Trial/Expires</th>
                    <th>Потребители</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((biz) => {
                    const limit = getPlanLimit(biz.plan_id);
                    const remaining = limit === -1 ? "∞" : Math.max(0, limit - (biz.receipts_this_month || 0));
                    const daysLeft = getDaysRemaining(biz.trial_ends_at || biz.subscription_expires_at);

                    return (
                      <tr key={biz.id}>
                        <td>
                          <div className="biz-name">{biz.name || biz.store_name || "—"}</div>
                          <div className="biz-store">{biz.store_name}</div>
                        </td>
                        <td>
                          <span className={`admin-badge admin-badge--${biz.subscription_status || "trial"}`}>
                            {biz.subscription_status || "trial"}
                          </span>
                          {!biz.onboarding_completed && <span className="admin-badge admin-badge--warning">onboarding</span>}
                        </td>
                        <td>{biz.plan_id || "starter"}</td>
                        <td>
                          <div className="usage-info">
                            <span className={biz.receipts_this_month >= limit && limit !== -1 ? "over-limit" : ""}>
                              {biz.receipts_this_month || 0} / {limit === -1 ? "∞" : limit}
                            </span>
                            <small>Остават: {remaining}</small>
                          </div>
                        </td>
                        <td>
                          {daysLeft !== null && (
                            <span className={daysLeft <= 3 ? "days-warning" : ""}>
                              {daysLeft > 0 ? `${daysLeft} дни` : "Изтекъл"}
                            </span>
                          )}
                          <small>{formatDate(biz.trial_ends_at || biz.subscription_expires_at)}</small>
                        </td>
                        <td>
                          <div className="user-info">
                            <span>{biz.user_count || 0}</span>
                            <small title={biz.user_emails}>{biz.user_emails?.split(",")[0] || "—"}</small>
                          </div>
                        </td>
                        <td>
                          <div className="admin-actions">
                            <button
                              className="admin-btn small"
                              onClick={() => {
                                setSelectedBusiness(biz);
                                setModalAction("extend");
                                setShowModal(true);
                              }}
                              title="Удължи trial"
                            >
                              +10 дни
                            </button>
                            <button
                              className="admin-btn small success"
                              onClick={() => handleBusinessAction(biz.id, "activate", { months: 1 })}
                              title="Активирай за 1 месец"
                            >
                              Активирай
                            </button>
                            <button
                              className="admin-btn small"
                              onClick={() => handleCreateAccessCode(biz.site_id)}
                              title="Създай код за достъп"
                            >
                              +Код
                            </button>
                            <button
                              className="admin-btn small danger"
                              onClick={() => handleDeleteBusiness(biz.id)}
                              title="Изтрий бизнеса"
                            >
                              ×
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="admin-users">
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Име</th>
                    <th>Регистриран</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.email}</td>
                      <td>{user.name || "—"}</td>
                      <td>{formatDate(user.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Access Tab */}
        {activeTab === "access" && (
          <div className="admin-access">
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Код</th>
                    <th>Бизнес</th>
                    <th>Роля</th>
                    <th>Изтича</th>
                    <th>Използван от</th>
                    <th>Създаден</th>
                  </tr>
                </thead>
                <tbody>
                  {accessCodes.map((ac) => (
                    <tr key={ac.id} className={ac.used_at ? "used" : ""}>
                      <td><code>{ac.code}</code></td>
                      <td>{ac.business_name || ac.store_name || ac.site_id}</td>
                      <td>{ac.role}</td>
                      <td>{formatDate(ac.expires_at)}</td>
                      <td>{ac.used_by_email || "—"}</td>
                      <td>{formatDate(ac.created_at)}</td>
                    </tr>
                  ))}
                  {accessCodes.length === 0 && (
                    <tr><td colSpan={6} className="admin-empty">Няма кодове за достъп</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Database Tab */}
        {activeTab === "database" && (
          <div className="admin-database">
            {dbLoading && <div className="db-loading">Зареждане...</div>}

            {/* Schemas View */}
            {dbView === "schemas" && !dbLoading && (
              <div className="admin-section">
                <h2>Схеми (магазини)</h2>
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Схема</th>
                        <th>Таблици</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbSchemas.map((schema) => (
                        <tr key={schema.name}>
                          <td><code>{schema.name}</code></td>
                          <td>{schema.tableCount} таблици</td>
                          <td>
                            <button className="admin-btn small" onClick={() => loadTables(schema.name)}>
                              Виж таблици
                            </button>
                          </td>
                        </tr>
                      ))}
                      {dbSchemas.length === 0 && (
                        <tr><td colSpan={3} className="admin-empty">Няма схеми</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tables View */}
            {dbView === "tables" && !dbLoading && selectedSchema && (
              <div className="admin-section">
                <div className="db-header">
                  <h2>{selectedSchema}</h2>
                  <button className="admin-btn small" onClick={() => setDbView("schemas")}>
                    ← Назад
                  </button>
                </div>
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Таблица</th>
                        <th>Редове</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbTables.map((table) => (
                        <tr key={table.name}>
                          <td><code>{table.name}</code></td>
                          <td>{table.rowCount}</td>
                          <td>
                            <button className="admin-btn small" onClick={() => loadTableData(selectedSchema, table.name)}>
                              Виж данни
                            </button>
                          </td>
                        </tr>
                      ))}
                      {dbTables.length === 0 && (
                        <tr><td colSpan={3} className="admin-empty">Няма таблици</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Data View */}
            {dbView === "data" && !dbLoading && dbData && selectedSchema && selectedTable && (
              <div className="admin-section">
                <div className="db-header">
                  <h2>{selectedSchema}.{selectedTable}</h2>
                  <button className="admin-btn small" onClick={() => { setDbView("tables"); setDbData(null); }}>
                    ← Назад
                  </button>
                </div>
                <div className="db-data-wrapper">
                  <table className="admin-table db-data-table">
                    <thead>
                      <tr>
                        {dbData.columns.slice(0, 6).map((col) => (
                          <th key={col.name} title={`${col.type}${col.nullable ? ' (nullable)' : ''}`}>
                            {col.name}
                          </th>
                        ))}
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbData.rows.map((row, idx) => (
                        <tr key={idx}>
                          {dbData.columns.slice(0, 6).map((col) => (
                            <td key={col.name} className="db-cell">
                              {formatCellValue(row[col.name])}
                            </td>
                          ))}
                          <td>
                            <button className="admin-btn small" onClick={() => startEditRow(row)} title="Редактирай">
                              ✏️
                            </button>
                          </td>
                        </tr>
                      ))}
                      {dbData.rows.length === 0 && (
                        <tr><td colSpan={7} className="admin-empty">Няма данни</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {dbData.totalPages > 1 && (
                  <div className="db-pagination">
                    <button
                      className="admin-btn small"
                      disabled={dbPage <= 1}
                      onClick={() => loadTableData(selectedSchema, selectedTable, dbPage - 1)}
                    >
                      &lt; Prev
                    </button>
                    <span>Страница {dbPage} от {dbData.totalPages}</span>
                    <button
                      className="admin-btn small"
                      disabled={dbPage >= dbData.totalPages}
                      onClick={() => loadTableData(selectedSchema, selectedTable, dbPage + 1)}
                    >
                      Next &gt;
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Edit Row Modal */}
        {editingRow && dbData && (
          <div className="admin-modal-overlay" onClick={() => setEditingRow(null)}>
            <div className="admin-modal edit-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Редактиране на ред</h3>
              <div className="edit-form">
                {dbData.columns.map((col) => (
                  <div key={col.name} className="edit-field">
                    <label>{col.name} <span className="field-type">({col.type})</span></label>
                    {dbData.primaryKeys.includes(col.name) ? (
                      <input
                        type="text"
                        value={String(editFormData[col.name] ?? '')}
                        disabled
                        className="edit-input disabled"
                      />
                    ) : col.type === 'jsonb' || col.type === 'json' ? (
                      <textarea
                        value={typeof editFormData[col.name] === 'object'
                          ? JSON.stringify(editFormData[col.name], null, 2)
                          : String(editFormData[col.name] ?? '')}
                        onChange={(e) => {
                          try {
                            setEditFormData({ ...editFormData, [col.name]: JSON.parse(e.target.value) });
                          } catch {
                            setEditFormData({ ...editFormData, [col.name]: e.target.value });
                          }
                        }}
                        className="edit-textarea"
                        rows={4}
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(editFormData[col.name] ?? '')}
                        onChange={(e) => setEditFormData({ ...editFormData, [col.name]: e.target.value })}
                        className="edit-input"
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="modal-buttons">
                <button className="admin-btn success" onClick={handleUpdateRow}>Запази</button>
                <button className="admin-btn danger" onClick={() => { handleDeleteRow(editingRow); setEditingRow(null); }}>Изтрий</button>
                <button className="admin-btn" onClick={() => setEditingRow(null)}>Отказ</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal */}
        {showModal && selectedBusiness && (
          <div className="admin-modal-overlay" onClick={() => setShowModal(false)}>
            <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Управление на {selectedBusiness.name || selectedBusiness.store_name}</h3>

              {modalAction === "extend" && (
                <div className="modal-content">
                  <p>Удължи пробния период с:</p>
                  <div className="modal-buttons">
                    <button onClick={() => handleBusinessAction(selectedBusiness.id, "extend_trial", { days: 7 })}>+7 дни</button>
                    <button onClick={() => handleBusinessAction(selectedBusiness.id, "extend_trial", { days: 10 })}>+10 дни</button>
                    <button onClick={() => handleBusinessAction(selectedBusiness.id, "extend_trial", { days: 30 })}>+30 дни</button>
                  </div>
                </div>
              )}

              <button className="modal-close" onClick={() => setShowModal(false)}>Затвори</button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .admin-page {
          min-height: 100vh;
          background: #0a0a0a;
          padding: 1.5rem;
        }
        .admin-container {
          max-width: 1400px;
          margin: 0 auto;
        }
        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        .admin-header h1 {
          color: #fff;
          font-size: 1.5rem;
        }
        .admin-back {
          color: #888;
          text-decoration: none;
        }
        .admin-back:hover {
          color: #fff;
        }
        .admin-loading, .admin-error {
          text-align: center;
          padding: 4rem;
          color: #888;
        }
        .admin-error h1 {
          color: #fff;
          margin-bottom: 1rem;
        }
        .admin-message {
          padding: 0.75rem 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .admin-message.success {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }
        .admin-message.error {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
        .admin-message button {
          background: none;
          border: none;
          color: inherit;
          font-size: 1.25rem;
          cursor: pointer;
        }
        .admin-tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding-bottom: 0.5rem;
        }
        .admin-tabs button {
          background: none;
          border: none;
          color: #888;
          padding: 0.5rem 1rem;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .admin-tabs button:hover {
          color: #fff;
          background: rgba(255,255,255,0.05);
        }
        .admin-tabs button.active {
          color: #fff;
          background: rgba(99, 102, 241, 0.2);
        }
        .admin-section {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 1.25rem;
          margin-top: 1.5rem;
        }
        .admin-section h2 {
          color: #fff;
          font-size: 1rem;
          margin-bottom: 1rem;
        }
        .admin-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .admin-stat {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 1.25rem;
          text-align: center;
        }
        .admin-stat.highlight {
          background: rgba(99, 102, 241, 0.1);
          border-color: rgba(99, 102, 241, 0.3);
        }
        .admin-stat__value {
          display: block;
          font-size: 1.75rem;
          font-weight: 600;
          color: #fff;
        }
        .admin-stat__label {
          display: block;
          font-size: 0.75rem;
          color: #888;
          margin-top: 0.25rem;
        }
        .admin-table-wrapper {
          overflow-x: auto;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .admin-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }
        .admin-table th,
        .admin-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .admin-table th {
          color: #888;
          font-weight: 500;
          font-size: 0.75rem;
          text-transform: uppercase;
        }
        .admin-table td {
          color: #fff;
        }
        .admin-table tr.used {
          opacity: 0.5;
        }
        .biz-name {
          font-weight: 500;
        }
        .biz-store {
          font-size: 0.75rem;
          color: #888;
        }
        .admin-badge {
          display: inline-block;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 500;
          margin-right: 0.25rem;
        }
        .admin-badge--trial {
          background: rgba(234, 179, 8, 0.2);
          color: #eab308;
        }
        .admin-badge--active {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }
        .admin-badge--expired, .admin-badge--cancelled {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
        .admin-badge--warning {
          background: rgba(249, 115, 22, 0.2);
          color: #f97316;
        }
        .usage-info, .user-info {
          display: flex;
          flex-direction: column;
        }
        .usage-info small, .user-info small {
          font-size: 0.7rem;
          color: #888;
        }
        .over-limit {
          color: #ef4444;
          font-weight: 600;
        }
        .days-warning {
          color: #f97316;
        }
        .admin-actions {
          display: flex;
          gap: 0.25rem;
          flex-wrap: wrap;
        }
        .admin-btn {
          background: rgba(99, 102, 241, 0.2);
          color: #818cf8;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.875rem;
          transition: all 0.2s;
        }
        .admin-btn:hover {
          background: rgba(99, 102, 241, 0.3);
        }
        .admin-btn.small {
          padding: 0.25rem 0.5rem;
          font-size: 0.7rem;
        }
        .admin-btn.success {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }
        .admin-btn.danger {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
        .admin-empty {
          text-align: center;
          color: #666;
          padding: 2rem;
        }
        code {
          background: rgba(255,255,255,0.1);
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          font-family: monospace;
        }
        .admin-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .admin-modal {
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 1.5rem;
          min-width: 300px;
          max-width: 90vw;
        }
        .admin-modal h3 {
          color: #fff;
          margin-bottom: 1rem;
        }
        .modal-content p {
          color: #888;
          margin-bottom: 1rem;
        }
        .modal-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .modal-buttons button {
          background: rgba(99, 102, 241, 0.2);
          color: #818cf8;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          cursor: pointer;
        }
        .modal-buttons button:hover {
          background: rgba(99, 102, 241, 0.3);
        }
        .modal-close {
          margin-top: 1rem;
          width: 100%;
          background: rgba(255,255,255,0.1);
          color: #888;
          border: none;
          padding: 0.5rem;
          border-radius: 6px;
          cursor: pointer;
        }
        /* Database tab styles */
        .db-loading {
          text-align: center;
          padding: 2rem;
          color: #888;
        }
        .db-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .db-header h2 {
          margin: 0;
        }
        .db-data-wrapper {
          overflow-x: auto;
        }
        .db-data-table {
          min-width: 100%;
          table-layout: auto;
        }
        .db-cell {
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: monospace;
          font-size: 0.8rem;
        }
        .db-pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          margin-top: 1rem;
          padding: 0.75rem;
          color: #888;
        }
        .db-pagination button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .edit-modal {
          max-width: 600px;
          max-height: 80vh;
          overflow-y: auto;
        }
        .edit-form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .edit-field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .edit-field label {
          color: #888;
          font-size: 0.75rem;
        }
        .field-type {
          color: #666;
        }
        .edit-input, .edit-textarea {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 0.5rem;
          color: #fff;
          font-family: monospace;
          font-size: 0.85rem;
        }
        .edit-input.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .edit-textarea {
          resize: vertical;
          min-height: 80px;
        }
      `}</style>
    </main>
  );
}
