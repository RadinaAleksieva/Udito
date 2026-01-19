import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import LogoutButton from "./logout-button";
import ThemeToggle from "./theme-toggle";
import NavLinks from "./nav-links";

export default async function TopNav({ title }: { title: string }) {
  const appUrl = process.env.APP_BASE_URL || "https://app.uditodevelopment.website";
  const requestHeaders = headers();
  const jar = cookies();
  const session = await auth();
  const hasAccess = Boolean(
    session?.user || jar.get("udito_instance_id")?.value || jar.get("udito_site_id")?.value
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
        <NavLinks />
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
        <ThemeToggle />
        {hasAccess ? <LogoutButton /> : null}
      </div>
    </nav>
  );
}
