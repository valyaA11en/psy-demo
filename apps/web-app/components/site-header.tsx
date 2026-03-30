"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthStatus } from "@/components/auth-status";

const links = [
  { href: "/", label: "специалисты" },
  { href: "/dashboard", label: "мой путь" },
  { href: "/auth", label: "войти" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <span className="brand-mark">CP</span>
        <span className="brand-copy">
          <span className="brand-eyebrow">платформа психологической поддержки</span>
          <span className="brand-title">бережное пространство онлайн-консультаций</span>
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
        <div className="header-pill">
          <span className="header-pill-dot" aria-hidden="true" />
          приватность by design
        </div>
        <AuthStatus />
      </div>
    </header>
  );
}
