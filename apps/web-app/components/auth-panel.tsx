"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { formatCompactDateTime, humanizeCode } from "@/lib/format";
import type { LoginTwoFactorChallenge } from "@/lib/types";

type Mode = "login" | "register";
type AccountType = "client" | "psychologist";

const showDemoCredentials = process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === "true";

export function AuthPanel() {
  const router = useRouter();
  const { login, verifyTwoFactorLogin, register, resendVerification, ready, user } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [accountType, setAccountType] = useState<AccountType>("client");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginChallenge, setLoginChallenge] = useState<LoginTwoFactorChallenge | null>(null);
  const [twoFactorMethod, setTwoFactorMethod] = useState<"totp" | "recovery_code">("totp");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [publicTitle, setPublicTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [verificationLink, setVerificationLink] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function resetLoginChallenge() {
    setLoginChallenge(null);
    setTwoFactorMethod("totp");
    setTwoFactorCode("");
    setRecoveryCode("");
  }

  function handleSubmit() {
    setError(null);
    setSuccess(null);
    setVerificationLink(null);
    resetLoginChallenge();
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
        .then((result) => {
          if (mode === "login") {
            if ("requiresTwoFactor" in result && result.requiresTwoFactor) {
              setLoginChallenge(result);
              setSuccess("Введите код из приложения или recovery code, чтобы завершить вход.");
              return;
            }

            setSuccess("Сессия начата.");
            router.push("/dashboard");
            router.refresh();
            return;
          }

          setSuccess("Аккаунт создан. Подтвердите email по ссылке из письма, чтобы войти.");
          if ("debugVerificationLink" in result && result.debugVerificationLink) {
            setVerificationLink(result.debugVerificationLink);
          }
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        })
        .finally(() => {
          setPending(false);
        });
    });
  }

  function handleVerifyTwoFactor() {
    if (!loginChallenge) {
      return;
    }

    setError(null);
    setSuccess(null);
    setPending(true);

    void verifyTwoFactorLogin(loginChallenge.challengeToken, {
      code: twoFactorMethod === "totp" ? twoFactorCode : undefined,
      recoveryCode: twoFactorMethod === "recovery_code" ? recoveryCode : undefined,
    })
      .then(() => {
        setSuccess("Вход подтверждён.");
        resetLoginChallenge();
        router.push("/dashboard");
        router.refresh();
      })
      .catch((nextError: Error) => {
        setError(nextError.message);
      })
      .finally(() => {
        setPending(false);
      });
  }

  function handleResendVerification() {
    if (!email) {
      setError("Укажите email, на который нужно отправить письмо.");
      return;
    }

    setError(null);
    setSuccess(null);
    setPending(true);

    void resendVerification(email)
      .then((result) => {
        setSuccess(result.message);
        setVerificationLink(result.debugVerificationLink ?? null);
      })
      .catch((nextError: Error) => {
        setError(nextError.message);
      })
      .finally(() => {
        setPending(false);
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
            onClick={() => {
              setMode("login");
              resetLoginChallenge();
            }}
            type="button"
          >
            вход
          </button>
          <button
            className={`auth-tab${mode === "register" ? " auth-tab-active" : ""}`}
            onClick={() => {
              setMode("register");
              resetLoginChallenge();
            }}
            type="button"
          >
            регистрация
          </button>
        </div>

        {mode === "login" && loginChallenge ? (
          <div className="stack">
            <div className="surface surface-muted">
              <p className="caption">Второй фактор</p>
              <p className="section-text">
                Для <strong>{email || "текущего аккаунта"}</strong> требуется дополнительное подтверждение.
              </p>
              <p className="section-text">
                Challenge действует до <strong>{formatCompactDateTime(loginChallenge.challengeExpiresAt)}</strong>.
              </p>
            </div>

            <div className="auth-tabs" role="tablist" aria-label="Метод второго фактора">
              <button
                className={`auth-tab${twoFactorMethod === "totp" ? " auth-tab-active" : ""}`}
                onClick={() => setTwoFactorMethod("totp")}
                type="button"
              >
                код приложения
              </button>
              <button
                className={`auth-tab${twoFactorMethod === "recovery_code" ? " auth-tab-active" : ""}`}
                onClick={() => setTwoFactorMethod("recovery_code")}
                type="button"
              >
                recovery code
              </button>
            </div>

            {twoFactorMethod === "totp" ? (
              <label className="field">
                <span className="field-label">TOTP-код</span>
                <input
                  className="field-input"
                  onChange={(event) => setTwoFactorCode(event.target.value)}
                  placeholder="123456"
                  type="text"
                  value={twoFactorCode}
                />
              </label>
            ) : (
              <label className="field">
                <span className="field-label">Recovery code</span>
                <input
                  className="field-input"
                  onChange={(event) => setRecoveryCode(event.target.value)}
                  placeholder="ABCD-EFGH"
                  type="text"
                  value={recoveryCode}
                />
              </label>
            )}
          </div>
        ) : (
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
        )}

        <div className="inline-actions">
          {mode === "login" && loginChallenge ? (
            <>
              <button className="button button-primary" disabled={pending} onClick={handleVerifyTwoFactor} type="button">
                {pending ? "обработка..." : "подтвердить вход"}
              </button>
              <button className="button button-secondary" disabled={pending} onClick={resetLoginChallenge} type="button">
                назад к паролю
              </button>
            </>
          ) : (
            <button className="button button-primary" disabled={pending} onClick={handleSubmit} type="button">
              {pending ? "обработка..." : mode === "login" ? "войти" : "создать аккаунт"}
            </button>
          )}
          <Link className="button button-ghost" href="/">
            вернуться в каталог
          </Link>
        </div>

        {mode === "register" && !loginChallenge ? (
          <div className="inline-actions">
            <button
              className="button button-secondary"
              disabled={pending}
              onClick={handleResendVerification}
              type="button"
            >
              отправить письмо повторно
            </button>
          </div>
        ) : null}

        {error ? <div className="notice notice-error">{error}</div> : null}
        {success ? <div className="notice notice-success">{success}</div> : null}
        {verificationLink ? (
          <div className="surface surface-muted">
            <p className="caption">Debug verification link</p>
            <Link href={verificationLink}>{verificationLink}</Link>
          </div>
        ) : null}

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
