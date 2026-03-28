"use client";

import { startTransition, useState } from "react";
import { formatCompactDateTime } from "@/lib/format";
import type { TwoFactorSetupSession, TwoFactorStatus } from "@/lib/types";

type Props = {
  status: TwoFactorStatus | null;
  setupSession: TwoFactorSetupSession | null;
  recoveryCodes: string[];
  onStartSetup: () => Promise<void>;
  onEnable: (input: { currentPassword: string; code: string }) => Promise<void>;
  onDisable: (input: { currentPassword: string; code?: string; recoveryCode?: string }) => Promise<void>;
};

export function TwoFactorSecurityPanel({
  status,
  setupSession,
  recoveryCodes,
  onStartSetup,
  onEnable,
  onDisable,
}: Props) {
  const [enablePassword, setEnablePassword] = useState("");
  const [enableCode, setEnableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableMethod, setDisableMethod] = useState<"totp" | "recovery_code">("totp");
  const [disableCode, setDisableCode] = useState("");
  const [disableRecoveryCode, setDisableRecoveryCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleStartSetup() {
    setError(null);
    setSuccess(null);
    setPending(true);

    startTransition(() => {
      void onStartSetup()
        .then(() => {
          setSuccess("Секрет для 2FA сгенерирован. Добавьте его в приложение-аутентификатор.");
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        })
        .finally(() => {
          setPending(false);
        });
    });
  }

  function handleEnable() {
    setError(null);
    setSuccess(null);
    setPending(true);

    startTransition(() => {
      void onEnable({
        currentPassword: enablePassword,
        code: enableCode,
      })
        .then(() => {
          setEnablePassword("");
          setEnableCode("");
          setSuccess("2FA включена. Сохраните recovery codes в безопасном месте.");
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        })
        .finally(() => {
          setPending(false);
        });
    });
  }

  function handleDisable() {
    setError(null);
    setSuccess(null);
    setPending(true);

    startTransition(() => {
      void onDisable({
        currentPassword: disablePassword,
        code: disableMethod === "totp" ? disableCode : undefined,
        recoveryCode: disableMethod === "recovery_code" ? disableRecoveryCode : undefined,
      })
        .then(() => {
          setDisablePassword("");
          setDisableCode("");
          setDisableRecoveryCode("");
          setSuccess("2FA отключена.");
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        })
        .finally(() => {
          setPending(false);
        });
    });
  }

  return (
    <div className="surface stack">
      <div className="section-head">
        <div>
          <p className="caption">Безопасность</p>
          <h3 className="card-title">Двухфакторная аутентификация</h3>
        </div>
        <span className={`status-badge status-${status?.enabled ? "scheduled" : "pending"}`}>
          {status?.enabled ? "включена" : "выключена"}
        </span>
      </div>

      <p className="section-text">
        Дополнительная защита входа с кодом из приложения-аутентификатора или recovery codes.
      </p>

      <div className="meta-grid">
        <div className="meta-card">
          <span className="caption">Статус</span>
          <strong>{status?.enabled ? "Активна" : "Не настроена"}</strong>
        </div>
        <div className="meta-card">
          <span className="caption">Включена</span>
          <strong>{formatCompactDateTime(status?.enabledAt)}</strong>
        </div>
        <div className="meta-card">
          <span className="caption">Recovery codes</span>
          <strong>{status?.recoveryCodesRemaining ?? 0}</strong>
        </div>
        <div className="meta-card">
          <span className="caption">Pending setup</span>
          <strong>{status?.pendingSetup ? "есть" : "нет"}</strong>
        </div>
      </div>

      {recoveryCodes.length > 0 ? (
        <div className="surface surface-muted">
          <p className="caption">Сохраните recovery codes</p>
          <p className="section-text">Они показываются только один раз после включения 2FA.</p>
          <ul className="list-block">
            {recoveryCodes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!status?.enabled ? (
        <>
          {!setupSession ? (
            <div className="inline-actions">
              <button className="button button-primary" disabled={pending} onClick={handleStartSetup} type="button">
                {pending ? "обработка..." : "сгенерировать секрет"}
              </button>
            </div>
          ) : (
            <div className="stack">
              <div className="surface surface-muted">
                <p className="caption">Шаг 1</p>
                <p className="section-text">
                  Добавьте аккаунт <strong>{setupSession.accountLabel}</strong> в приложение-аутентификатор.
                </p>
                <p className="caption">Manual entry key</p>
                <p className="token-preview">{setupSession.manualEntryKeyDisplay}</p>
                <p className="caption">Действует до</p>
                <p className="section-text">{formatCompactDateTime(setupSession.expiresAt)}</p>
                <a className="muted-link" href={setupSession.otpauthUri}>
                  открыть otpauth URI
                </a>
              </div>

              <label className="field">
                <span className="field-label">Текущий пароль</span>
                <input
                  className="field-input"
                  onChange={(event) => setEnablePassword(event.target.value)}
                  type="password"
                  value={enablePassword}
                />
              </label>

              <label className="field">
                <span className="field-label">Код из приложения</span>
                <input
                  className="field-input"
                  onChange={(event) => setEnableCode(event.target.value)}
                  placeholder="123456"
                  type="text"
                  value={enableCode}
                />
              </label>

              <div className="inline-actions">
                <button className="button button-primary" disabled={pending} onClick={handleEnable} type="button">
                  {pending ? "обработка..." : "включить 2FA"}
                </button>
                <button className="button button-secondary" disabled={pending} onClick={handleStartSetup} type="button">
                  сгенерировать заново
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="stack">
          <div className="auth-tabs" role="tablist" aria-label="Метод отключения 2FA">
            <button
              className={`auth-tab${disableMethod === "totp" ? " auth-tab-active" : ""}`}
              onClick={() => setDisableMethod("totp")}
              type="button"
            >
              код приложения
            </button>
            <button
              className={`auth-tab${disableMethod === "recovery_code" ? " auth-tab-active" : ""}`}
              onClick={() => setDisableMethod("recovery_code")}
              type="button"
            >
              recovery code
            </button>
          </div>

          <label className="field">
            <span className="field-label">Текущий пароль</span>
            <input
              className="field-input"
              onChange={(event) => setDisablePassword(event.target.value)}
              type="password"
              value={disablePassword}
            />
          </label>

          {disableMethod === "totp" ? (
            <label className="field">
              <span className="field-label">Код из приложения</span>
              <input
                className="field-input"
                onChange={(event) => setDisableCode(event.target.value)}
                placeholder="123456"
                type="text"
                value={disableCode}
              />
            </label>
          ) : (
            <label className="field">
              <span className="field-label">Recovery code</span>
              <input
                className="field-input"
                onChange={(event) => setDisableRecoveryCode(event.target.value)}
                placeholder="ABCD-EFGH"
                type="text"
                value={disableRecoveryCode}
              />
            </label>
          )}

          <div className="inline-actions">
            <button className="button button-secondary" disabled={pending} onClick={handleDisable} type="button">
              {pending ? "обработка..." : "отключить 2FA"}
            </button>
          </div>
        </div>
      )}

      {error ? <div className="notice notice-error">{error}</div> : null}
      {success ? <div className="notice notice-success">{success}</div> : null}
    </div>
  );
}
