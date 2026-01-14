"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect } from "react";

type Store = {
  id: string;
  site_id: string | null;
  instance_id: string | null;
  store_name: string | null;
  store_domain: string | null;
};

const STORE_KEY = "udito_selected_store";

export default function StoreSelector({
  stores,
  currentSiteId,
  hidden = false,
}: {
  stores: Store[];
  currentSiteId: string | null;
  hidden?: boolean;
}) {
  // Don't render if hidden (e.g., in Wix iframe context)
  if (hidden) {
    return null;
  }
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Persist selection to localStorage when currentSiteId changes
  useEffect(() => {
    if (currentSiteId) {
      try {
        localStorage.setItem(STORE_KEY, currentSiteId);
      } catch {
        // Ignore storage errors
      }
    }
  }, [currentSiteId]);

  // Check if we need to restore from localStorage
  useEffect(() => {
    const storeParam = searchParams.get("store");
    if (!storeParam && stores.length > 1) {
      try {
        const savedStore = localStorage.getItem(STORE_KEY);
        if (savedStore && savedStore !== currentSiteId) {
          // Verify saved store exists in current stores list
          const storeExists = stores.some(
            (s) => s.site_id === savedStore || s.instance_id === savedStore
          );
          if (storeExists) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("store", savedStore);
            router.replace(`${pathname}?${params.toString()}`);
          }
        }
      } catch {
        // Ignore storage errors
      }
    }
  }, [stores, currentSiteId, searchParams, pathname, router]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSiteId = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (newSiteId) {
      params.set("store", newSiteId);
      // Persist selection
      try {
        localStorage.setItem(STORE_KEY, newSiteId);
      } catch {
        // Ignore storage errors
      }
    } else {
      params.delete("store");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  if (stores.length === 0) {
    return (
      <div className="store-selector store-selector--empty">
        <span>Няма свързани магазини</span>
        <a href="/settings" className="store-selector__add">
          + Добави магазин
        </a>
      </div>
    );
  }

  return (
    <div className="store-selector">
      <label htmlFor="store-select">Магазин:</label>
      <select
        id="store-select"
        value={currentSiteId || ""}
        onChange={handleChange}
        className="store-selector__dropdown"
      >
        {stores.map((store) => (
          <option key={store.id} value={store.site_id || store.instance_id || ""}>
            {store.store_name || store.store_domain || store.site_id || "Неименуван магазин"}
          </option>
        ))}
      </select>
      <a href="/settings" className="store-selector__add" title="Добави нов магазин">
        +
      </a>
    </div>
  );
}
