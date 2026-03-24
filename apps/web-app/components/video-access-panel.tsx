"use client";

import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { formatCompactDateTime, humanizeCode } from "@/lib/format";
import type { SessionInfo, VideoAccessPayload } from "@/lib/types";

type VideoAccessPanelProps = {
  consultationId: string;
};

export function VideoAccessPanel({ consultationId }: VideoAccessPanelProps) {
  const { ready, user, request } = useAuth();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [access, setAccess] = useState<VideoAccessPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const loadSession = useEffectEvent(async () => {
    if (!user) {
      return;
    }

    setError(null);
    const nextSession = await request<SessionInfo>(`/video-sessions/${consultationId}`);
    setSession(nextSession);
  });

  useEffect(() => {
    if (!ready || !user) {
      return;
    }

    startTransition(() => {
      void loadSession().catch((nextError: Error) => {
        setError(nextError.message);
      });
    });
  }, [consultationId, ready, user]);

  if (!ready) {
    return <section className="page">Проверяем сессию...</section>;
  }

  if (!user) {
    return (
      <section className="page empty-state">
        <h1 className="section-title">Сначала войдите в систему</h1>
        <p className="section-text">Только участники консультации могут запросить токен доступа к сессии.</p>
        <Link className="button button-primary" href="/auth">
          открыть вход
        </Link>
      </section>
    );
  }

  async function requestAccess() {
    setPending(true);
    setError(null);

    try {
      const payload = await request<VideoAccessPayload>(`/video-sessions/${consultationId}/access`, {
        method: "POST",
      });
      setAccess(payload);
      await loadSession();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось запросить доступ");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="page stack">
      <div className="section-head">
        <div>
          <p className="caption">Тестовый доступ к сессии</p>
          <h1 className="section-title">Сессия консультации</h1>
          <p className="section-text">ID консультации: {consultationId}</p>
        </div>
        <Link className="button button-ghost" href="/dashboard">
          вернуться в кабинет
        </Link>
      </div>

      {error ? <div className="notice notice-error">{error}</div> : null}

      {session ? (
        <div className="dashboard-grid">
          <div className="surface stack">
            <div className="meta-row">
              <span className={`status-badge status-${session.consultationStatus}`}>
                {humanizeCode(session.consultationStatus)}
              </span>
              <span className={`status-badge status-${session.paymentStatus}`}>
                {humanizeCode(session.paymentStatus)}
              </span>
            </div>

            <div className="list-block">
              <div>запланировано: {formatCompactDateTime(session.scheduledAt)}</div>
              <div>провайдер комнаты: {session.provider ? humanizeCode(session.provider) : "ещё не создан"}</div>
              <div>ID комнаты: {session.roomId ?? "ещё не создан"}</div>
              <div>доступ откроется: {formatCompactDateTime(session.accessWindow.opensAt)}</div>
              <div>доступ закроется: {formatCompactDateTime(session.accessWindow.closesAt)}</div>
            </div>

            <div className="inline-actions">
              <button
                className="button button-primary"
                disabled={pending || !session.canRequestAccess}
                onClick={() => void requestAccess()}
                type="button"
              >
                {pending ? "выпускаем токен..." : "запросить токен доступа"}
              </button>
              {session.joinUrl ? (
                <a className="button button-secondary" href={session.joinUrl} rel="noreferrer" target="_blank">
                  открыть тестовую страницу подключения
                </a>
              ) : null}
            </div>
          </div>

          <div className="surface stack">
            <p className="caption">Политика доступа</p>
            <ul className="list-block">
              <li>только участники: {session.accessPolicy.participantsOnly ? "да" : "нет"}</li>
              <li>нужна успешная оплата: {session.accessPolicy.requiresSucceededPayment ? "да" : "нет"}</li>
              <li>открывается за {session.accessPolicy.opensBeforeStartMinutes} мин до начала</li>
              <li>закрывается через {session.accessPolicy.closesAfterEndMinutes} мин после окончания</li>
            </ul>

            {access ? (
              <div className="surface surface-muted stack">
                <p className="caption">Токен доступа выпущен</p>
                <p className="token-preview">
                  {access.accessToken.slice(0, 18)}...{access.accessToken.slice(-10)}
                </p>
                <p className="section-text">
                  Истекает в <strong>{formatCompactDateTime(access.expiresAt)}</strong>
                </p>
                <a className="muted-link" href={access.joinUrl} rel="noreferrer" target="_blank">
                  {access.joinUrl}
                </a>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="surface">Загружаем метаданные сессии...</div>
      )}
    </section>
  );
}
