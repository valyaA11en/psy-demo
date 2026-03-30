"use client";

import { startTransition, useEffect, useMemo, useState, type FormEvent } from "react";
import { formatCompactDateTime, formatDateRange, humanizeCode } from "@/lib/format";
import type { DashboardBooking, HomeworkTaskRecord } from "@/lib/types";

type PsychologistHomeworkPanelProps = {
  completedBookings: DashboardBooking[];
  tasks: HomeworkTaskRecord[];
  onCreate: (input: {
    consultationId: string;
    title: string;
    description?: string;
    dueAt?: string;
  }) => Promise<void>;
  onUpdate: (taskId: string, input: {
    title?: string;
    description?: string;
    dueAt?: string;
    status?: "assigned" | "cancelled";
  }) => Promise<void>;
};

function toLocalDateTimeInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function PsychologistHomeworkPanel({
  completedBookings,
  tasks,
  onCreate,
  onUpdate,
}: PsychologistHomeworkPanelProps) {
  const bookingOptions = useMemo(
    () =>
      completedBookings.filter((booking) => booking.client && booking.status === "completed"),
    [completedBookings],
  );
  const defaultDueAt = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + 7);
    next.setHours(20, 0, 0, 0);
    return toLocalDateTimeInputValue(next);
  }, []);

  const [consultationId, setConsultationId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueAt);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!consultationId && bookingOptions[0]) {
      setConsultationId(bookingOptions[0].id);
    }
  }, [bookingOptions, consultationId]);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    startTransition(() => {
      void onCreate({
        consultationId,
        title,
        description: description.trim() || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      })
        .then(() => {
          setTitle("");
          setDescription("");
          setDueAt(defaultDueAt);
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        })
        .finally(() => {
          setPending(false);
        });
    });
  }

  function toggleTask(task: HomeworkTaskRecord) {
    setPending(true);
    setError(null);

    startTransition(() => {
      void onUpdate(task.id, {
        status: task.status === "cancelled" ? "assigned" : "cancelled",
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
          <p className="caption">Домашние задания</p>
          <h3 className="card-title">Задания после сессии</h3>
          <p className="section-text">
            Назначайте упражнения только по завершенным консультациям, чтобы клиент видел следующий шаг между встречами.
          </p>
        </div>
      </div>

      <form className="stack" onSubmit={handleCreate}>
        <label className="field">
          <span className="field-label">Завершенная консультация</span>
          <select
            className="field-select"
            disabled={pending || bookingOptions.length === 0}
            onChange={(event) => setConsultationId(event.target.value)}
            required
            value={consultationId}
          >
            {bookingOptions.length === 0 ? <option value="">Нет завершенных консультаций</option> : null}
            {bookingOptions.map((booking) => (
              <option key={booking.id} value={booking.id}>
                {(booking.client?.displayName ?? "Клиент")} • {formatDateRange(booking.slot.startsAt, booking.slot.endsAt)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Название задания</span>
          <input
            className="field-input"
            disabled={pending || bookingOptions.length === 0}
            maxLength={255}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Например: наблюдать триггеры тревоги в течение недели"
            required
            value={title}
          />
        </label>

        <label className="field">
          <span className="field-label">Описание</span>
          <textarea
            className="field-textarea"
            disabled={pending || bookingOptions.length === 0}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Что именно нужно сделать, на что обратить внимание и как клиенту зафиксировать результат."
            rows={4}
            value={description}
          />
        </label>

        <label className="field">
          <span className="field-label">Дедлайн</span>
          <input
            className="field-input"
            disabled={pending || bookingOptions.length === 0}
            onChange={(event) => setDueAt(event.target.value)}
            type="datetime-local"
            value={dueAt}
          />
        </label>

        {error ? <div className="notice notice-error">{error}</div> : null}

        <div className="inline-actions">
          <button className="button button-primary" disabled={pending || bookingOptions.length === 0} type="submit">
            назначить задание
          </button>
          {bookingOptions.length === 0 ? (
            <span className="section-text">Сначала нужна хотя бы одна завершенная консультация.</span>
          ) : null}
        </div>
      </form>

      <div className="stack compact-stack">
        {tasks.length === 0 ? (
          <div className="surface surface-muted">
            <p className="section-text">Пока нет активных или завершенных заданий.</p>
          </div>
        ) : (
          tasks.map((task) => (
            <div className="surface surface-muted stack" key={task.id}>
              <div className="section-head">
                <div>
                  <strong>{task.title}</strong>
                  <p className="section-text">
                    {task.client?.displayName ?? "Клиент"} • {formatDateRange(task.consultation.slot.startsAt, task.consultation.slot.endsAt)}
                  </p>
                </div>
                <span className={`status-badge status-${task.status}`}>{humanizeCode(task.status)}</span>
              </div>

              {task.description ? <p className="section-text">{task.description}</p> : null}

              <div className="meta-row">
                <span>дедлайн: {task.dueAt ? formatCompactDateTime(task.dueAt) : "не указан"}</span>
                <span>создано: {formatCompactDateTime(task.createdAt)}</span>
              </div>

              {task.clientNote ? (
                <div className="surface">
                  <p className="caption">Заметка клиента</p>
                  <p className="section-text">{task.clientNote}</p>
                </div>
              ) : null}

              {task.completedAt ? (
                <p className="section-text">Клиент отметил выполнение: {formatCompactDateTime(task.completedAt)}</p>
              ) : null}

              <div className="inline-actions">
                <button
                  className="button button-ghost button-small"
                  disabled={pending || task.status === "completed"}
                  onClick={() => toggleTask(task)}
                  type="button"
                >
                  {task.status === "cancelled" ? "вернуть в работу" : "отменить задание"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
