"use client";

import { startTransition, useMemo, useState, type FormEvent } from "react";
import { CrisisSupportPanel } from "@/components/crisis-support-panel";
import { detectCrisisSignals } from "@/lib/crisis-support";
import { formatCompactDateTime } from "@/lib/format";
import type { ChatMessageRecord } from "@/lib/types";

type ChatCounterpart = {
  userId: string;
  displayName: string;
  subtitle?: string | null;
};

type ChatPanelProps = {
  counterparts: ChatCounterpart[];
  enableCrisisSupport: boolean;
  messages: ChatMessageRecord[];
  selectedCounterpartUserId: string | null;
  selectedCounterpartLabel: string | null;
  unreadCount: number;
  onSelectCounterpartUserId: (value: string) => void;
  onSend: (input: { counterpartUserId: string; body: string }) => Promise<void>;
};

export function ChatPanel({
  counterparts,
  enableCrisisSupport,
  messages,
  selectedCounterpartUserId,
  selectedCounterpartLabel,
  unreadCount,
  onSelectCounterpartUserId,
  onSend,
}: ChatPanelProps) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualSupportOpen, setManualSupportOpen] = useState(false);
  const [dismissedFingerprint, setDismissedFingerprint] = useState<string | null>(null);

  const selectedCounterpart = useMemo(
    () => counterparts.find((item) => item.userId === selectedCounterpartUserId) ?? null,
    [counterparts, selectedCounterpartUserId],
  );
  const crisisSignal = useMemo(() => detectCrisisSignals(body), [body]);
  const showCrisisSupport =
    enableCrisisSupport && (manualSupportOpen || (crisisSignal.suggested && crisisSignal.fingerprint !== dismissedFingerprint));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCounterpartUserId) {
      return;
    }

    setPending(true);
    setError(null);

    startTransition(() => {
      void onSend({
        counterpartUserId: selectedCounterpartUserId,
        body,
      })
        .then(() => {
          setBody("");
          setManualSupportOpen(false);
          setDismissedFingerprint(null);
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
          <p className="caption">Чат</p>
          <h2 className="section-title">Сообщения между сессиями</h2>
          <p className="section-text">Лёгкий асинхронный канал связи для коротких вопросов и уточнений.</p>
        </div>
      </div>

      {counterparts.length === 0 ? (
        <div className="surface surface-muted">
          <p className="section-text">
            Диалог станет доступен, когда у вас появится хотя бы одна консультация с другой стороной.
          </p>
        </div>
      ) : (
        <>
          <label className="field">
            <span className="field-label">Диалог</span>
            <select
              className="field-select"
              onChange={(event) => onSelectCounterpartUserId(event.target.value)}
              value={selectedCounterpartUserId ?? ""}
            >
              {counterparts.map((counterpart) => (
                <option key={counterpart.userId} value={counterpart.userId}>
                  {counterpart.displayName}
                </option>
              ))}
            </select>
          </label>

          <div className="surface surface-muted stack" style={{ minHeight: 320 }}>
            <div className="meta-row">
              <strong>{selectedCounterpartLabel ?? selectedCounterpart?.displayName ?? "Диалог"}</strong>
              {unreadCount > 0 ? <span>непрочитано: {unreadCount}</span> : <span>все сообщения прочитаны</span>}
            </div>

            {messages.length === 0 ? (
              <p className="section-text">История пока пустая. Отправьте первое сообщение, чтобы начать диалог.</p>
            ) : (
              <div className="stack compact-stack">
                {messages.map((message) => (
                  <div
                    className={`surface ${message.isMine ? "" : "surface-muted"}`}
                    key={message.id}
                    style={{
                      marginLeft: message.isMine ? "auto" : 0,
                      maxWidth: "88%",
                    }}
                  >
                    <div className="meta-row">
                      <strong>{message.isMine ? "Вы" : message.senderDisplayName}</strong>
                      <span>{formatCompactDateTime(message.createdAt)}</span>
                    </div>
                    <p className="section-text">{message.body}</p>
                    {message.isMine ? (
                      <p className="caption">
                        {message.readAt ? `прочитано ${formatCompactDateTime(message.readAt)}` : "доставлено"}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {showCrisisSupport ? (
            <CrisisSupportPanel
              matchedMarkers={crisisSignal.matchedMarkers}
              onDismiss={() => {
                setManualSupportOpen(false);
                if (crisisSignal.suggested) {
                  setDismissedFingerprint(crisisSignal.fingerprint);
                }
              }}
              sourceLabel="чате"
            />
          ) : null}

          <form className="stack" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field-label">Новое сообщение</span>
              <textarea
                className="field-textarea"
                disabled={pending || !selectedCounterpartUserId}
                maxLength={2000}
                onChange={(event) => {
                  setBody(event.target.value);
                  const nextFingerprint = detectCrisisSignals(event.target.value).fingerprint;
                  if (dismissedFingerprint && dismissedFingerprint !== nextFingerprint) {
                    setDismissedFingerprint(null);
                  }
                }}
                placeholder="Короткий вопрос, уточнение по заданию или наблюдение между сессиями."
                required
                rows={4}
                value={body}
              />
            </label>

            {error ? <div className="notice notice-error">{error}</div> : null}

            <div className="inline-actions">
              <button
                className="button button-primary"
                disabled={pending || !selectedCounterpartUserId || body.trim().length === 0}
                type="submit"
              >
                {pending ? "отправляем..." : "отправить сообщение"}
              </button>
              {enableCrisisSupport ? (
                <button
                  className="button button-secondary"
                  disabled={pending}
                  onClick={() => {
                    setManualSupportOpen(true);
                    setDismissedFingerprint(null);
                  }}
                  type="button"
                >
                  нужна срочная поддержка
                </button>
              ) : null}
              <span className="section-text">
                Чат не заменяет экстренную помощь и не предназначен для кризисных ситуаций.
              </span>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
