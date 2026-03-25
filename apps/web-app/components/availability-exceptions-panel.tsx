"use client";

import { startTransition, useState, type FormEvent } from "react";
import { formatCompactDateTime, formatDateRange, humanizeCode } from "@/lib/format";
import type { AvailabilityException } from "@/lib/types";

type CreateExceptionInput = {
  startsAt: string;
  endsAt: string;
  reason?: string;
};

type Props = {
  exceptions: AvailabilityException[];
  onCreate: (input: CreateExceptionInput) => Promise<void>;
  onToggle: (exception: AvailabilityException) => Promise<void>;
  onDelete: (exceptionId: string) => Promise<void>;
};

function toLocalDateTimeInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function defaultStart() {
  const value = new Date();
  value.setHours(value.getHours() + 1, 0, 0, 0);
  return value;
}

function defaultEnd(start: Date) {
  const value = new Date(start);
  value.setHours(value.getHours() + 2);
  return value;
}

export function AvailabilityExceptionsPanel({
  exceptions,
  onCreate,
  onToggle,
  onDelete,
}: Props) {
  const start = defaultStart();
  const [startsAt, setStartsAt] = useState(toLocalDateTimeInputValue(start));
  const [endsAt, setEndsAt] = useState(toLocalDateTimeInputValue(defaultEnd(start)));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    const nextStart = defaultStart();
    setStartsAt(toLocalDateTimeInputValue(nextStart));
    setEndsAt(toLocalDateTimeInputValue(defaultEnd(nextStart)));
    setReason("");
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await onCreate({
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        reason: reason.trim() || undefined,
      });
      resetForm();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось создать blackout-период");
    } finally {
      setPending(false);
    }
  }

  function handleToggle(exception: AvailabilityException) {
    setPending(true);
    setError(null);

    startTransition(() => {
      void onToggle(exception)
        .catch((nextError) => {
          setError(nextError instanceof Error ? nextError.message : "Не удалось обновить исключение");
        })
        .finally(() => {
          setPending(false);
        });
    });
  }

  function handleDelete(exceptionId: string) {
    setPending(true);
    setError(null);

    startTransition(() => {
      void onDelete(exceptionId)
        .catch((nextError) => {
          setError(nextError instanceof Error ? nextError.message : "Не удалось удалить исключение");
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
          <p className="caption">Доступность</p>
          <h3 className="card-title">Blackout-периоды</h3>
          <p className="section-text">
            Исключения блокируют автогенерацию слотов и запускают пересборку расписания.
          </p>
        </div>
      </div>

      <form className="stack" onSubmit={handleCreate}>
        <div className="form-grid two-columns">
          <label className="field">
            <span className="field-label">Недоступен с</span>
            <input
              className="field-input"
              disabled={pending}
              onChange={(event) => setStartsAt(event.target.value)}
              required
              type="datetime-local"
              value={startsAt}
            />
          </label>
          <label className="field">
            <span className="field-label">Недоступен до</span>
            <input
              className="field-input"
              disabled={pending}
              onChange={(event) => setEndsAt(event.target.value)}
              required
              type="datetime-local"
              value={endsAt}
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">Причина</span>
          <textarea
            className="field-textarea"
            disabled={pending}
            maxLength={255}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Например: отпуск, конференция, недоступность по личным причинам"
            rows={3}
            value={reason}
          />
        </label>

        {error ? <div className="notice notice-error">{error}</div> : null}

        <div className="inline-actions">
          <button className="button button-primary" disabled={pending} type="submit">
            Добавить blackout-период
          </button>
          <span className="section-text">Время отправляется в UTC на основе локальной таймзоны браузера.</span>
        </div>
      </form>

      {exceptions.length === 0 ? (
        <div className="surface surface-muted">
          <p className="section-text">
            Исключений пока нет. Используйте этот блок для отпуска, больничного или разовых периодов недоступности.
          </p>
        </div>
      ) : (
        <div className="stack compact-stack">
          {exceptions.map((exception) => (
            <div className="surface surface-muted" key={exception.id}>
              <div className="section-head">
                <div>
                  <strong>{formatDateRange(exception.startsAt, exception.endsAt)}</strong>
                  <p className="section-text">
                    {exception.reason || "Причина не указана"}
                  </p>
                </div>
                <span className={`status-badge status-${exception.isActive ? "blocked" : "cancelled"}`}>
                  {exception.isActive ? "активно" : "отключено"}
                </span>
              </div>

              <div className="meta-row">
                <span>создано: {formatCompactDateTime(exception.createdAt)}</span>
                <span>статус: {humanizeCode(exception.isActive ? "blocked" : "cancelled")}</span>
              </div>

              <div className="inline-actions">
                <button
                  className="button button-secondary button-small"
                  disabled={pending}
                  onClick={() => handleToggle(exception)}
                  type="button"
                >
                  {exception.isActive ? "Отключить" : "Активировать"}
                </button>
                <button
                  className="button button-ghost button-small"
                  disabled={pending}
                  onClick={() => handleDelete(exception.id)}
                  type="button"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
