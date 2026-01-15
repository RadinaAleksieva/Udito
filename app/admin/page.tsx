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

// Plan limits
const PLAN_LIMITS: Record<string, number> = {
  starter: 50,
  business: 300,
  corporate: -1, // unlimited
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "businesses" | "users" | "access">("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  // Modal states
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState("");

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

      const [dashData, bizData, accessData] = await Promise.all([
        dashRes.json(),
        bizRes.json(),
        accessRes.json(),
      ]);

      setStats(dashData.stats);
      setUsers(dashData.users || []);
      setBusinesses(bizData.businesses || []);
      setAccessCodes(accessData.accessCodes || []);
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

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("bg-BG");
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
      `}</style>
    </main>
  );
}
