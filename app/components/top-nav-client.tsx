"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import LogoutButton from "./logout-button";
import ThemeToggle from "./theme-toggle";
import NavLinks from "./nav-links";

export default function TopNavClient({ title }: { title: string }) {
  const { data: session } = useSession();
  const hasAccess = Boolean(session?.user);

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
        <Suspense fallback={<span>...</span>}>
          <NavLinks />
        </Suspense>
        <ThemeToggle />
        {hasAccess ? <LogoutButton /> : null}
      </div>
    </nav>
  );
}
