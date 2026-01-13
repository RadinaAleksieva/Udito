import Link from "next/link";

export default function PublicHeader({ title }: { title: string }) {
  return (
    <nav className="nav nav--public">
      <div className="nav-brand">
        <Link href="/">
          <img
            src="/brand/udito-logo.png"
            alt="UDITO"
            className="nav-brand__logo"
            width={38}
            height={38}
          />
        </Link>
        <span>{title}</span>
      </div>
      <div className="nav-links">
        <Link href="/login" className="nav-link">
          Вход
        </Link>
        <Link href="/register" className="nav-link nav-link--primary">
          Регистрация
        </Link>
      </div>
    </nav>
  );
}
