"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { humanizeCode } from "@/lib/format";

type Mode = "login" | "register";
type AccountType = "client" | "psychologist";

const showDemoCredentials = process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === "true";

export function AuthPanel() {
  const router = useRouter();
  const { login, register, ready, user } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [accountType, setAccountType] = useState<AccountType>("client");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [publicTitle, setPublicTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleSubmit() {
    setError(null);
    setSuccess(null);
    setPending(true);

    startTransition(() => {
      const action =
        mode === "login"
          ? login(email, password)
          : register({
              email,
              password,
              accountType,
              displayName: accountType === "client" ? displayName : undefined,
              firstName: accountType === "psychologist" ? firstName : undefined,
              lastName: accountType === "psychologist" ? lastName : undefined,
              publicTitle: accountType === "psychologist" ? publicTitle : undefined,
            });

      void action
        .then(() => {
          setSuccess(mode === "login" ? "Сессия начата" : "Аккаунт создан");
          router.push("/dashboard");
          router.refresh();
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        })
        .finally(() => {
          setPending(false);
        });
    });
  }

  if (ready && user) {
    return (
      <section className="auth-layout">
        <div className="auth-card">
          <p className="caption">Вы уже вошли как</p>
          <h1 className="section-title">{user.email}</h1>
          <p className="section-text">
            Текущие роли: <strong>{user.roles.map(humanizeCode).join(", ")}</strong>
          </p>
          <div className="inline-actions">
            <Link className="button button-primary" href="/dashboard">
              открыть кабинет
            </Link>
            <Link className="button button-ghost" href="/">
              вернуться в каталог
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-layout">
      <div className="auth-card">
        <div className="auth-tabs" role="tablist" aria-label="Режим авторизации">
          <button
            className={`auth-tab${mode === "login" ? " auth-tab-active" : ""}`}
            onClick={() => setMode("login")}
            type="button"
          >
            вход
          </button>
          <button
            className={`auth-tab${mode === "register" ? " auth-tab-active" : ""}`}
            onClick={() => setMode("register")}
            type="button"
          >
            регистрация
          </button>
        </div>

        <div className="stack">
          <label className="field">
            <span className="field-label">email</span>
            <input
              className="field-input"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="client@example.com"
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span className="field-label">пароль</span>
            <input
              className="field-input"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Client12345!"
              type="password"
              value={password}
            />
          </label>

          {mode === "register" ? (
            <>
              <label className="field">
                <span className="field-label">тип аккаунта</span>
                <select
                  className="field-select"
                  onChange={(event) => setAccountType(event.target.value as AccountType)}
                  value={accountType}
                >
                  <option value="client">клиент</option>
                  <option value="psychologist">психолог</option>
                </select>
              </label>

              {accountType === "client" ? (
                <label className="field">
                  <span className="field-label">отображаемое имя</span>
                  <input
                    className="field-input"
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Irina"
                    value={displayName}
                  />
                </label>
              ) : (
                <div className="form-grid two-columns">
                  <label className="field">
                    <span className="field-label">имя</span>
                    <input
                      className="field-input"
                      onChange={(event) => setFirstName(event.target.value)}
                      placeholder="Anna"
                      value={firstName}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">фамилия</span>
                    <input
                      className="field-input"
                      onChange={(event) => setLastName(event.target.value)}
                      placeholder="Kovaleva"
                      value={lastName}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">публичное описание</span>
                    <input
                      className="field-input"
                      onChange={(event) => setPublicTitle(event.target.value)}
                      placeholder="Психолог, КПТ"
                      value={publicTitle}
                    />
                  </label>
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="inline-actions">
          <button className="button button-primary" disabled={pending} onClick={handleSubmit} type="button">
            {pending ? "обработка..." : mode === "login" ? "войти" : "создать аккаунт"}
          </button>
          <Link className="button button-ghost" href="/">
            вернуться в каталог
          </Link>
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}
        {success ? <div className="notice notice-success">{success}</div> : null}

        {showDemoCredentials ? (
          <div className="surface surface-muted">
            <p className="caption">Локальные demo-аккаунты</p>
            <ul className="list-block">
              <li>`client@example.com / Client12345!`</li>
              <li>`psychologist@example.com / Psychologist123!`</li>
              <li>`admin@example.com / Admin12345!`</li>
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
