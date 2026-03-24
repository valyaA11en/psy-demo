"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthStatus } from "@/components/auth-status";

const links = [
  { href: "/", label: "каталог" },
  { href: "/dashboard", label: "кабинет" },
  { href: "/auth", label: "вход" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <span className="brand-mark">CP</span>
        <span className="brand-copy">
          <span className="brand-eyebrow">консультации с психологом</span>
          <span className="brand-title">спокойный и понятный путь записи</span>
        </span>
      </Link>

      <nav className="header-nav" aria-label="Primary">
        {links.map((link) => {
          const active =
            pathname === link.href || (link.href !== "/" && pathname?.startsWith(link.href));

          return (
            <Link
              key={link.href}
              className={`nav-link${active ? " nav-link-active" : ""}`}
              href={link.href}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="header-meta">
        <AuthStatus />
      </div>
    </header>
  );
}
