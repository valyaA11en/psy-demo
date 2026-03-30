"use client";

import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from "@livekit/components-react";
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
    return <section className="page">Проверяем доступ к видеосессии...</section>;
  }

  if (!user) {
    return (
      <section className="page empty-state">
        <h1 className="section-title">Сначала войдите в систему</h1>
        <p className="section-text">Только участники консультации могут запросить доступ к видеосессии.</p>
        <Link className="button button-primary" href="/auth">
          Открыть вход
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

  const shouldRenderLiveKit =
    access?.provider === "livekit" &&
    Boolean(access.providerServerUrl) &&
    Boolean(access.accessToken);

  return (
    <section className="page stack">
      <div className="section-head">
        <div>
          <p className="caption">Доступ к видеосессии</p>
          <h1 className="section-title">Пространство видеосессии</h1>
          <p className="section-text">ID консультации: {consultationId}</p>
        </div>
        <Link className="button button-ghost" href="/dashboard">
          Вернуться в кабинет
        </Link>
      </div>

      <div className="video-hero surface">
        <div>
          <p className="caption">бережный формат встречи</p>
          <h2 className="card-title">Спокойный экран подключения без перегрузки</h2>
          <p className="section-text">
            Перед входом в сессию пользователь видит только ключевые статусы: время, условия доступа и готовность
            комнаты. Это делает интерфейс современнее и понятнее.
          </p>
        </div>
        <div className="video-hero-card">
          <span className="caption">доступ</span>
          <strong>{access ? "токен выпущен" : "ожидает запроса"}</strong>
        </div>
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
              <div>провайдер: {session.provider ? humanizeCode(session.provider) : "еще не подготовлен"}</div>
              <div>комната: {session.roomId ?? "еще не создана"}</div>
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
                {pending ? "Выпускаем токен..." : "Запросить доступ"}
              </button>
            </div>

            {shouldRenderLiveKit ? (
              <div className="surface surface-muted stack">
                <p className="caption">LiveKit room</p>
                <div className="livekit-shell">
                  <LiveKitRoom
                    audio={true}
                    connect={true}
                    data-lk-theme="default"
                    serverUrl={access.providerServerUrl!}
                    token={access.accessToken}
                    video={true}
                  >
                    <VideoConference />
                    <RoomAudioRenderer />
                  </LiveKitRoom>
                </div>
              </div>
            ) : null}
          </div>

          <div className="surface stack">
            <p className="caption">Политика доступа</p>
            <ul className="list-block">
              <li>доступ только участникам: {session.accessPolicy.participantsOnly ? "да" : "нет"}</li>
              <li>нужна успешная оплата: {session.accessPolicy.requiresSucceededPayment ? "да" : "нет"}</li>
              <li>открывается за {session.accessPolicy.opensBeforeStartMinutes} минут до начала</li>
              <li>закрывается через {session.accessPolicy.closesAfterEndMinutes} минут после окончания</li>
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

                {access.provider === "livekit" ? (
                  <div className="stack compact-stack">
                    <span className="section-text">Сервер LiveKit: {access.providerServerUrl ?? "не указан"}</span>
                    <span className="section-text">Комната: {access.roomId}</span>
                  </div>
                ) : (
                  <a className="muted-link" href={access.joinUrl} rel="noreferrer" target="_blank">
                    {access.joinUrl}
                  </a>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="surface">Подготавливаем данные сессии...</div>
      )}
    </section>
  );
}
