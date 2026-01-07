"use client";

import { useState } from "react";

type WixSite = {
  id: string;
  displayName?: string | null;
  siteDisplayName?: string | null;
  url?: string | null;
};

function normalizeSites(data: any): WixSite[] {
  const singleSite = data?.site ?? data;
  if (singleSite && typeof singleSite === "object" && !Array.isArray(singleSite)) {
    const id = singleSite?.id ?? singleSite?.siteId ?? singleSite?._id ?? "";
    if (id) {
      return [
        {
          id,
          displayName: singleSite?.displayName ?? singleSite?.siteDisplayName ?? null,
          url: singleSite?.url ?? singleSite?.siteUrl ?? singleSite?.viewUrl ?? null,
        },
      ];
    }
  }
  const sites = data?.sites ?? data?.siteDetails ?? [];
  if (!Array.isArray(sites)) return [];
  return sites
    .map((site: any) => ({
      id: site?.id ?? site?.siteId ?? site?._id ?? "",
      displayName: site?.displayName ?? site?.siteDisplayName ?? null,
      url: site?.url ?? site?.siteUrl ?? site?.viewUrl ?? null,
    }))
    .filter((site: WixSite) => Boolean(site.id));
}

export default function SitePicker() {
  const [sites, setSites] = useState<WixSite[]>([]);
  const [status, setStatus] = useState("");
  const [siteId, setSiteId] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadSites() {
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/sites");
      const data = await response.json();
      if (!data?.ok) {
        throw new Error(data?.error || "Failed to load sites.");
      }
      const list = normalizeSites(data?.data);
      setSites(list);
      if (list.length === 0) {
        setStatus("Няма върнати сайтове от Wix.");
      }
    } catch (error) {
      setStatus("Грешка при зареждане на сайтовете.");
    } finally {
      setLoading(false);
    }
  }

  async function selectSite(selectedId: string) {
    setStatus("");
    const value = selectedId || siteId;
    if (!value) {
      setStatus("Въведете siteId.");
      return;
    }
    try {
      const response = await fetch("/api/site/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: value }),
      });
      const data = await response.json();
      if (!data?.ok) {
        throw new Error(data?.error || "Failed to save siteId.");
      }
      setStatus("Записан siteId. Обновете таблото.");
    } catch (error) {
      setStatus("Грешка при запис на siteId.");
    }
  }

  return (
    <section className="orders">
      <h2>Избор на сайт (Wix instance)</h2>
      <div className="form-card">
        <div className="form-header">
          <div>
            <h3>Сайт от Wix</h3>
            <p>Отворете приложението от Wix, за да се получи instance токен.</p>
          </div>
          <button className="btn-primary" type="button" onClick={loadSites} disabled={loading}>
            {loading ? "Зареждане..." : "Зареди"}
          </button>
        </div>
        {status ? <p className="form-status">{status}</p> : null}
        {sites.length > 0 ? (
          <div className="orders-table">
            <div className="orders-head">
              <span>Site ID</span>
              <span>Име</span>
              <span>URL</span>
              <span></span>
            </div>
            {sites.map((site) => (
              <div className="orders-row" key={site.id}>
                <span>{site.id}</span>
                <span>{site.displayName || "—"}</span>
                <span>{site.url || "—"}</span>
                <span>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => selectSite(site.id)}
                  >
                    Избери
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="form-grid">
          <label>
            Ръчен siteId
            <input
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
              placeholder="siteId"
            />
          </label>
          <div className="form-actions">
            <button className="btn-primary" type="button" onClick={() => selectSite("")}>
              Запази
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
