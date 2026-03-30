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
    token ? "Подтверждаем email и готовим ваш личный кабинет..." : "Ссылка подтверждения не содержит токен.",
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    startTransition(() => {
      void verifyEmail(token)
        .then(() => {
          setState("success");
          setMessage("Email подтверждён. Перенаправляем в ваш кабинет...");
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
        <h1 className="section-title">Завершаем регистрацию</h1>
        <p className="section-text">{message}</p>
        <div className="auth-benefits-grid">
          <div className="auth-benefit-card">
            <p className="caption">Статус</p>
            <strong>
              {state === "pending" ? "проверяем ссылку" : state === "success" ? "почта подтверждена" : "нужна новая ссылка"}
            </strong>
            <p className="section-text">Мы показываем только необходимый статус без лишних технических деталей.</p>
          </div>
        </div>
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
