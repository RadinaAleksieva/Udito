"use client";

import { useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";

const links = [
  { href: "/overview", label: "Общ преглед" },
  { href: "/orders", label: "Поръчки" },
  { href: "/receipts", label: "Електронни бележки" },
  { href: "/audit", label: "Одиторски файл" },
  { href: "/reports", label: "Отчети" },
  { href: "/settings", label: "Настройки" },
  { href: "/help", label: "Помощ" },
];

export default function NavLinks() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const storeParam = searchParams.get("store");

  return (
    <>
      {links.map((link) => {
        const isActive = pathname === link.href;
        const href = storeParam ? `${link.href}?store=${storeParam}` : link.href;

        return (
          <Link
            key={link.href}
            href={href}
            className={`nav-link${isActive ? " nav-link--active" : ""}`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
