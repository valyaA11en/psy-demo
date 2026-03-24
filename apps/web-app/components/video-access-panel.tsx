"use client";

import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { formatCompactDateTime } from "@/lib/format";
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
    return <section className="page">Checking session...</section>;
  }

  if (!user) {
    return (
      <section className="page empty-state">
        <h1 className="section-title">Sign in first</h1>
        <p className="section-text">Only consultation participants can request a session access token.</p>
        <Link className="button button-primary" href="/auth">
          open auth
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
      setError(nextError instanceof Error ? nextError.message : "Unable to request access");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="page stack">
      <div className="section-head">
        <div>
          <p className="caption">Mock session access</p>
          <h1 className="section-title">Consultation session</h1>
          <p className="section-text">Consultation id: {consultationId}</p>
        </div>
        <Link className="button button-ghost" href="/dashboard">
          back to dashboard
        </Link>
      </div>

      {error ? <div className="notice notice-error">{error}</div> : null}

      {session ? (
        <div className="dashboard-grid">
          <div className="surface stack">
            <div className="meta-row">
              <span className={`status-badge status-${session.consultationStatus}`}>
                {session.consultationStatus.replaceAll("_", " ")}
              </span>
              <span className={`status-badge status-${session.paymentStatus}`}>
                {session.paymentStatus.replaceAll("_", " ")}
              </span>
            </div>

            <div className="list-block">
              <div>scheduled: {formatCompactDateTime(session.scheduledAt)}</div>
              <div>room provider: {session.provider ?? "not provisioned yet"}</div>
              <div>room id: {session.roomId ?? "not provisioned yet"}</div>
              <div>access opens: {formatCompactDateTime(session.accessWindow.opensAt)}</div>
              <div>access closes: {formatCompactDateTime(session.accessWindow.closesAt)}</div>
            </div>

            <div className="inline-actions">
              <button
                className="button button-primary"
                disabled={pending || !session.canRequestAccess}
                onClick={() => void requestAccess()}
                type="button"
              >
                {pending ? "issuing token..." : "request access token"}
              </button>
              {session.joinUrl ? (
                <a className="button button-secondary" href={session.joinUrl} rel="noreferrer" target="_blank">
                  open mock join page
                </a>
              ) : null}
            </div>
          </div>

          <div className="surface stack">
            <p className="caption">Session policy</p>
            <ul className="list-block">
              <li>participants only: {session.accessPolicy.participantsOnly ? "yes" : "no"}</li>
              <li>successful payment required: {session.accessPolicy.requiresSucceededPayment ? "yes" : "no"}</li>
              <li>opens {session.accessPolicy.opensBeforeStartMinutes} min before start</li>
              <li>closes {session.accessPolicy.closesAfterEndMinutes} min after end</li>
            </ul>

            {access ? (
              <div className="surface surface-muted stack">
                <p className="caption">Access token issued</p>
                <p className="token-preview">
                  {access.accessToken.slice(0, 18)}...{access.accessToken.slice(-10)}
                </p>
                <p className="section-text">
                  Expires at <strong>{formatCompactDateTime(access.expiresAt)}</strong>
                </p>
                <a className="muted-link" href={access.joinUrl} rel="noreferrer" target="_blank">
                  {access.joinUrl}
                </a>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="surface">Loading session metadata...</div>
      )}
    </section>
  );
}
