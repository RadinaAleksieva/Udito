"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Store = {
  id: string;
  site_id: string | null;
  instance_id: string | null;
  store_name: string | null;
  store_domain: string | null;
};

export default function StoreSelector({
  stores,
  currentSiteId,
}: {
  stores: Store[];
  currentSiteId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSiteId = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (newSiteId) {
      params.set("store", newSiteId);
    } else {
      params.delete("store");
    }
    router.push(`?${params.toString()}`);
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
