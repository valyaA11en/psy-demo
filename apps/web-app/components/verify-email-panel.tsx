"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

type VerificationState = "pending" | "success" | "error";

export function VerifyEmailPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { verifyEmail } = useAuth();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<VerificationState>(token ? "pending" : "error");
  const [message, setMessage] = useState(
    token ? "Подтверждаем email и создаём сессию..." : "Ссылка подтверждения не содержит токен.",
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    startTransition(() => {
      void verifyEmail(token)
        .then(() => {
          setState("success");
          setMessage("Email подтверждён. Перенаправляем в личный кабинет...");
          window.setTimeout(() => {
            router.push("/dashboard");
            router.refresh();
          }, 1200);
        })
        .catch((error: Error) => {
          setState("error");
          setMessage(error.message);
        });
    });
  }, [router, token, verifyEmail]);

  return (
    <section className="auth-layout">
      <div className="auth-card">
        <p className="caption">Подтверждение email</p>
        <h1 className="section-title">Завершение регистрации</h1>
        <p className="section-text">{message}</p>
        {state === "error" ? (
          <div className="inline-actions">
            <Link className="button button-primary" href="/auth">
              вернуться ко входу
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
