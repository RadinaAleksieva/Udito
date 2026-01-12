import { cookies, headers } from "next/headers";

const links = [
  { href: "/overview", label: "Общ преглед" },
  { href: "/orders", label: "Поръчки" },
  { href: "/receipts", label: "Електронни бележки" },
  { href: "/audit", label: "Одиторски файл" },
  { href: "/reports", label: "Отчети" },
  { href: "/settings", label: "Настройки" },
  { href: "/help", label: "Помощ" },
];

export default async function TopNav({ title }: { title: string }) {
  const appUrl = process.env.APP_BASE_URL || "https://udito.vercel.app";
  const requestHeaders = headers();
  const jar = cookies();
  const hasAccess = Boolean(
    jar.get("udito_instance_id")?.value || jar.get("udito_site_id")?.value
  );
  const fetchDest = requestHeaders.get("sec-fetch-dest");
  const referer = requestHeaders.get("referer") || "";
  const isEmbedded =
    fetchDest === "iframe" ||
    referer.includes("manage.wix.com") ||
    referer.includes("wix.com");
  return (
    <nav className="nav">
      <div className="nav-brand">
        <img
          src="/brand/udito-logo.png"
          alt="UDITO"
          className="nav-brand__logo"
          width={38}
          height={38}
        />
        <span>{title}</span>
      </div>
      <div className="nav-links">
        {links.map((link) => (
          <a key={link.href} href={link.href} className="nav-link">
            {link.label}
          </a>
        ))}
        {isEmbedded ? (
          <a
            href={appUrl}
            target="_blank"
            rel="noreferrer"
            className="nav-link nav-link--external"
          >
            Отвори в нов таб
          </a>
        ) : null}
        {hasAccess ? (
          <a href="/api/logout" className="nav-link">
            Изход
          </a>
        ) : null}
      </div>
    </nav>
  );
}
