"use client";

import { startTransition, useMemo, useState } from "react";
import { formatCompactDateTime, formatDateRange, humanizeCode } from "@/lib/format";
import type { HomeworkTaskRecord } from "@/lib/types";

type ClientHomeworkPanelProps = {
  tasks: HomeworkTaskRecord[];
  onUpdate: (taskId: string, input: { status?: "assigned" | "completed"; clientNote?: string }) => Promise<void>;
};

type HomeworkTaskCardProps = {
  task: HomeworkTaskRecord;
  onUpdate: ClientHomeworkPanelProps["onUpdate"];
};

function HomeworkTaskCard({ task, onUpdate }: HomeworkTaskCardProps) {
  const [clientNote, setClientNote] = useState(task.clientNote ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(status?: "assigned" | "completed") {
    setPending(true);
    setError(null);

    startTransition(() => {
      void onUpdate(task.id, {
        status,
        clientNote: clientNote.trim() || undefined,
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
    <div className="surface surface-muted stack">
      <div className="section-head">
        <div>
          <strong>{task.title}</strong>
          <p className="section-text">
            {task.psychologist?.fullName ?? "Психолог"} {task.psychologist?.publicTitle ? `• ${task.psychologist.publicTitle}` : ""}
          </p>
        </div>
        <span className={`status-badge status-${task.status}`}>{humanizeCode(task.status)}</span>
      </div>

      <div className="meta-row">
        <span>{formatDateRange(task.consultation.slot.startsAt, task.consultation.slot.endsAt)}</span>
        <span>дедлайн: {task.dueAt ? formatCompactDateTime(task.dueAt) : "не указан"}</span>
      </div>

      {task.description ? <p className="section-text">{task.description}</p> : null}

      <label className="field">
        <span className="field-label">Заметка по выполнению</span>
        <textarea
          className="field-textarea"
          disabled={pending || task.status === "cancelled"}
          maxLength={2000}
          onChange={(event) => setClientNote(event.target.value)}
          placeholder="Что получилось, что было сложным, что хочется обсудить на следующей встрече."
          rows={4}
          value={clientNote}
        />
      </label>

      {task.completedAt ? (
        <p className="section-text">Отмечено выполненным: {formatCompactDateTime(task.completedAt)}</p>
      ) : null}

      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="inline-actions">
        <button
          className="button button-primary button-small"
          disabled={pending || task.status === "cancelled"}
          onClick={() => submit("completed")}
          type="button"
        >
          {task.status === "completed" ? "обновить заметку" : "отметить выполненным"}
        </button>
        {task.status === "completed" ? (
          <button
            className="button button-ghost button-small"
            disabled={pending}
            onClick={() => submit("assigned")}
            type="button"
          >
            вернуть в работу
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ClientHomeworkPanel({ tasks, onUpdate }: ClientHomeworkPanelProps) {
  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((left, right) => {
        const leftWeight = left.status === "assigned" ? 0 : left.status === "completed" ? 1 : 2;
        const rightWeight = right.status === "assigned" ? 0 : right.status === "completed" ? 1 : 2;

        if (leftWeight !== rightWeight) {
          return leftWeight - rightWeight;
        }

        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }),
    [tasks],
  );

  return (
    <div className="surface stack">
      <div className="section-head">
        <div>
          <p className="caption">Домашние задания</p>
          <h2 className="section-title">Практика между сессиями</h2>
          <p className="section-text">
            Здесь собраны упражнения и наблюдения, которые психолог назначил после завершенных консультаций.
          </p>
        </div>
      </div>

      {sortedTasks.length === 0 ? (
        <div className="surface surface-muted">
          <p className="section-text">Пока нет назначенных заданий. После консультации психолог сможет добавить упражнения сюда.</p>
        </div>
      ) : (
        <div className="stack compact-stack">
          {sortedTasks.map((task) => (
            <HomeworkTaskCard key={task.id} onUpdate={onUpdate} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
