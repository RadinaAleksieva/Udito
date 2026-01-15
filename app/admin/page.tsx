"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Admin emails that have access
const ADMIN_EMAILS = ["office@designedbypo.com", "radina@designedbypo.com"];

interface Business {
  id: string;
  name: string;
  subscription_status: string;
  plan_id: string;
  trial_ends_at: string;
  onboarding_completed: boolean;
  created_at: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

interface Stats {
  totalBusinesses: number;
  totalUsers: number;
  totalOrders: number;
  totalReceipts: number;
  activeSubscriptions: number;
  trialUsers: number;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
        setError("Нямате достъп до тази страница");
        setIsLoading(false);
        return;
      }
      loadData();
    }
  }, [status, session, router]);

  async function loadData() {
    try {
      const response = await fetch("/api/admin/dashboard");
      if (!response.ok) {
        throw new Error("Failed to load data");
      }
      const data = await response.json();
      setStats(data.stats);
      setBusinesses(data.businesses || []);
      setUsers(data.users || []);
    } catch (err) {
      console.error("Error loading admin data:", err);
      setError("Грешка при зареждане на данните");
    } finally {
      setIsLoading(false);
    }
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
            <Link href="/overview" className="login-btn login-btn--primary">
              Към Overview
            </Link>
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
          <Link href="/overview" className="admin-back">
            ← Назад към Overview
          </Link>
        </div>

        {/* Stats Grid */}
        {stats && (
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
            <div className="admin-stat">
              <span className="admin-stat__value">{stats.activeSubscriptions}</span>
              <span className="admin-stat__label">Активни абонаменти</span>
            </div>
            <div className="admin-stat">
              <span className="admin-stat__value">{stats.trialUsers}</span>
              <span className="admin-stat__label">В пробен период</span>
            </div>
          </div>
        )}

        {/* Businesses Table */}
        <div className="admin-section">
          <h2>Бизнеси ({businesses.length})</h2>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Име</th>
                  <th>Статус</th>
                  <th>План</th>
                  <th>Trial до</th>
                  <th>Onboarding</th>
                  <th>Създаден</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((business) => (
                  <tr key={business.id}>
                    <td>{business.name || "—"}</td>
                    <td>
                      <span className={`admin-badge admin-badge--${business.subscription_status || "trial"}`}>
                        {business.subscription_status || "trial"}
                      </span>
                    </td>
                    <td>{business.plan_id || "—"}</td>
                    <td>
                      {business.trial_ends_at
                        ? new Date(business.trial_ends_at).toLocaleDateString("bg-BG")
                        : "—"}
                    </td>
                    <td>{business.onboarding_completed ? "✓" : "✗"}</td>
                    <td>
                      {business.created_at
                        ? new Date(business.created_at).toLocaleDateString("bg-BG")
                        : "—"}
                    </td>
                  </tr>
                ))}
                {businesses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="admin-empty">Няма бизнеси</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Users Table */}
        <div className="admin-section">
          <h2>Потребители ({users.length})</h2>
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
                    <td>
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString("bg-BG")
                        : "—"}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={3} className="admin-empty">Няма потребители</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style jsx>{`
        .admin-page {
          min-height: 100vh;
          background: #0a0a0a;
          padding: 2rem;
        }
        .admin-container {
          max-width: 1200px;
          margin: 0 auto;
        }
        .admin-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }
        .admin-header h1 {
          color: #fff;
          font-size: 1.75rem;
        }
        .admin-back {
          color: #888;
          text-decoration: none;
          transition: color 0.2s;
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
        .admin-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          margin-bottom: 2rem;
        }
        .admin-stat {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1.5rem;
          text-align: center;
        }
        .admin-stat__value {
          display: block;
          font-size: 2rem;
          font-weight: 600;
          color: #fff;
        }
        .admin-stat__label {
          display: block;
          font-size: 0.875rem;
          color: #888;
          margin-top: 0.25rem;
        }
        .admin-section {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .admin-section h2 {
          color: #fff;
          font-size: 1.125rem;
          margin-bottom: 1rem;
        }
        .admin-table-wrapper {
          overflow-x: auto;
        }
        .admin-table {
          width: 100%;
          border-collapse: collapse;
        }
        .admin-table th,
        .admin-table td {
          padding: 0.75rem 1rem;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .admin-table th {
          color: #888;
          font-weight: 500;
          font-size: 0.875rem;
        }
        .admin-table td {
          color: #fff;
          font-size: 0.875rem;
        }
        .admin-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }
        .admin-badge--trial {
          background: rgba(234, 179, 8, 0.2);
          color: #eab308;
        }
        .admin-badge--active {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }
        .admin-badge--expired {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
        .admin-empty {
          text-align: center;
          color: #666;
        }
      `}</style>
    </main>
  );
}
