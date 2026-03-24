"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

export function AuthStatus() {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, user, logout } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (!ready) {
    return <div className="auth-chip">авторизация...</div>;
  }

  if (!user) {
    return (
      <div className="auth-actions">
        <Link className="button button-ghost button-small" href="/auth">
          войти
        </Link>
      </div>
    );
  }

  function handleLogout() {
    setError(null);
    startTransition(() => {
      void logout()
        .then(() => {
          router.push(pathname === "/dashboard" ? "/" : pathname);
          router.refresh();
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        });
    });
  }

  return (
    <div className="auth-actions">
      <div className="auth-chip">
        <span>{user.email}</span>
        <strong>{user.roles.join(", ")}</strong>
      </div>
      <Link className="button button-secondary button-small" href="/dashboard">
        кабинет
      </Link>
      <button className="button button-ghost button-small" onClick={handleLogout} type="button">
        выйти
      </button>
      {error ? <p className="caption error-inline">{error}</p> : null}
    </div>
  );
}
