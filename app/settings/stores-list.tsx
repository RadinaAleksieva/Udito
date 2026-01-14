"use client";

import { useState } from "react";

interface Store {
  id: number;
  site_id: string | null;
  instance_id: string | null;
  store_name: string | null;
  store_domain: string | null;
}

interface StoresListProps {
  stores: Store[];
}

export default function StoresList({ stores: initialStores }: StoresListProps) {
  const [stores, setStores] = useState(initialStores);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleEdit = (store: Store) => {
    setEditingId(store.id);
    setEditName(store.store_name || store.store_domain || "");
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setError(null);
  };

  const handleSave = async (store: Store) => {
    if (!editName.trim()) {
      setError("Името не може да е празно");
      return;
    }

    setLoading(store.id);
    setError(null);

    try {
      const response = await fetch("/api/stores/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: store.id,
          siteId: store.site_id,
          storeName: editName.trim(),
        }),
      });

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "Грешка при запазване");
      }

      // Update local state
      setStores(stores.map(s =>
        s.id === store.id ? { ...s, store_name: editName.trim() } : s
      ));
      setEditingId(null);
      setEditName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Грешка при запазване");
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async (store: Store) => {
    const displayName = store.store_name || store.store_domain || store.site_id;
    if (!confirm(`Сигурни ли сте, че искате да премахнете "${displayName}"?\n\nТова няма да изтрие поръчките и бележките.`)) {
      return;
    }

    setLoading(store.id);
    setError(null);

    try {
      const response = await fetch("/api/stores/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id }),
      });

      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "Грешка при изтриване");
      }

      // Remove from local state
      setStores(stores.filter(s => s.id !== store.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Грешка при изтриване");
    } finally {
      setLoading(null);
    }
  };

  if (stores.length === 0) {
    return <p className="empty-state">Няма свързани магазини.</p>;
  }

  return (
    <div className="stores-list">
      {error && <div className="stores-error">{error}</div>}

      {stores.map((store) => (
        <div key={store.id} className="store-card">
          {editingId === store.id ? (
            // Edit mode
            <div className="store-card__edit">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Име на магазина"
                className="store-card__input"
                disabled={loading === store.id}
                autoFocus
              />
              <div className="store-card__edit-actions">
                <button
                  onClick={() => handleSave(store)}
                  disabled={loading === store.id}
                  className="btn-primary btn-sm"
                >
                  {loading === store.id ? "..." : "Запази"}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={loading === store.id}
                  className="btn-secondary btn-sm"
                >
                  Отказ
                </button>
              </div>
            </div>
          ) : (
            // View mode
            <>
              <div className="store-card__main">
                <div className="store-card__name">
                  {store.store_name || store.store_domain || "Неименуван магазин"}
                </div>
                {store.store_domain && store.store_name && (
                  <div className="store-card__domain">{store.store_domain}</div>
                )}
              </div>
              <div className="store-card__meta">
                <code className="store-card__id">{store.site_id || store.instance_id}</code>
              </div>
              <div className="store-card__actions">
                <button
                  onClick={() => handleEdit(store)}
                  disabled={loading !== null}
                  className="btn-icon"
                  title="Преименувай"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(store)}
                  disabled={loading !== null}
                  className="btn-icon btn-icon--danger"
                  title="Премахни"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
