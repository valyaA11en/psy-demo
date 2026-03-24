"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

type Mode = "login" | "register";
type AccountType = "client" | "psychologist";

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
          setSuccess(mode === "login" ? "Session started" : "Account created");
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
          <p className="caption">You are already signed in as</p>
          <h1 className="section-title">{user.email}</h1>
          <p className="section-text">
            Current roles: <strong>{user.roles.join(", ")}</strong>
          </p>
          <div className="inline-actions">
            <Link className="button button-primary" href="/dashboard">
              open dashboard
            </Link>
            <Link className="button button-ghost" href="/">
              back to catalog
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-layout">
      <div className="auth-card">
        <div className="auth-tabs" role="tablist" aria-label="Auth mode">
          <button
            className={`auth-tab${mode === "login" ? " auth-tab-active" : ""}`}
            onClick={() => setMode("login")}
            type="button"
          >
            sign in
          </button>
          <button
            className={`auth-tab${mode === "register" ? " auth-tab-active" : ""}`}
            onClick={() => setMode("register")}
            type="button"
          >
            create account
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
            <span className="field-label">password</span>
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
                <span className="field-label">account type</span>
                <select
                  className="field-select"
                  onChange={(event) => setAccountType(event.target.value as AccountType)}
                  value={accountType}
                >
                  <option value="client">client</option>
                  <option value="psychologist">psychologist</option>
                </select>
              </label>

              {accountType === "client" ? (
                <label className="field">
                  <span className="field-label">display name</span>
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
                    <span className="field-label">first name</span>
                    <input
                      className="field-input"
                      onChange={(event) => setFirstName(event.target.value)}
                      placeholder="Anna"
                      value={firstName}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">last name</span>
                    <input
                      className="field-input"
                      onChange={(event) => setLastName(event.target.value)}
                      placeholder="Kovaleva"
                      value={lastName}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">public title</span>
                    <input
                      className="field-input"
                      onChange={(event) => setPublicTitle(event.target.value)}
                      placeholder="Psychologist, CBT"
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
            {pending ? "processing..." : mode === "login" ? "sign in" : "create account"}
          </button>
          <Link className="button button-ghost" href="/">
            back to catalog
          </Link>
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}
        {success ? <div className="notice notice-success">{success}</div> : null}

        <div className="surface surface-muted">
          <p className="caption">Demo accounts</p>
          <ul className="list-block">
            <li>`client@example.com / Client12345!`</li>
            <li>`psychologist@example.com / Psychologist123!`</li>
            <li>`admin@example.com / Admin12345!`</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
