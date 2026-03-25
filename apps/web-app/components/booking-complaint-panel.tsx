"use client";

import { startTransition, useMemo, useState } from "react";
import { formatCompactDateTime, humanizeCode } from "@/lib/format";
import type { ComplaintRecord, DashboardBooking } from "@/lib/types";

type BookingComplaintPanelProps = {
  booking: DashboardBooking;
  complaint: ComplaintRecord | null;
  onCreate: (input: { consultationId: string; type: string; text: string }) => Promise<void>;
};

const complaintOptions = [
  { value: "service_quality", label: "Качество услуги" },
  { value: "no_show", label: "Неявка" },
  { value: "refund_request", label: "Запрос возврата" },
  { value: "privacy", label: "Приватность" },
  { value: "abuse", label: "Некорректное поведение" },
  { value: "billing", label: "Оплата" },
  { value: "other", label: "Другое" },
];

export function BookingComplaintPanel({ booking, complaint, onCreate }: BookingComplaintPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [type, setType] = useState("service_quality");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = useMemo(() => {
    if (complaint) {
      return false;
    }

    return booking.status !== "scheduled" || new Date(booking.scheduledAt).getTime() <= Date.now();
  }, [booking.scheduledAt, booking.status, complaint]);

  if (!complaint && !canCreate) {
    return null;
  }

  function submitComplaint() {
    setSubmitting(true);
    setError(null);

    startTransition(() => {
      void onCreate({
        consultationId: booking.id,
        type,
        text,
      })
        .then(() => {
          setExpanded(false);
          setType("service_quality");
          setText("");
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        })
        .finally(() => {
          setSubmitting(false);
        });
    });
  }

  return (
    <div className="surface surface-muted stack">
      <div className="meta-row">
        <strong>Жалоба</strong>
        {complaint ? (
          <span>
            {humanizeCode(complaint.status)} • {formatCompactDateTime(complaint.createdAt)}
          </span>
        ) : (
          <span>можно подать по этой консультации</span>
        )}
      </div>

      {complaint ? (
        <>
          <div className="meta-row">
            <span>Тип: {humanizeCode(complaint.type)}</span>
            {complaint.target?.displayName ? <span>Цель: {complaint.target.displayName}</span> : null}
          </div>
          <p className="section-text">{complaint.text}</p>
          {complaint.resolutionNote ? (
            <div className="surface">
              <p className="caption">Комментарий администратора</p>
              <p className="section-text">{complaint.resolutionNote}</p>
            </div>
          ) : null}
        </>
      ) : null}

      {canCreate ? (
        expanded ? (
          <div className="stack">
            <label className="field">
              <span>Тип жалобы</span>
              <select className="field-select" onChange={(event) => setType(event.target.value)} value={type}>
                {complaintOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Описание</span>
              <textarea
                className="field-textarea"
                onChange={(event) => setText(event.target.value)}
                placeholder="Опишите, что произошло, без лишних персональных данных. Минимум 20 символов."
                rows={4}
                value={text}
              />
            </label>

            {error ? <div className="notice notice-error">{error}</div> : null}

            <div className="inline-actions">
              <button
                className="button button-primary"
                disabled={submitting || text.trim().length < 20}
                onClick={submitComplaint}
                type="button"
              >
                {submitting ? "отправляем..." : "отправить жалобу"}
              </button>
              <button
                className="button button-ghost"
                disabled={submitting}
                onClick={() => setExpanded(false)}
                type="button"
              >
                отмена
              </button>
            </div>
          </div>
        ) : (
          <button className="button button-ghost button-small" onClick={() => setExpanded(true)} type="button">
            подать жалобу
          </button>
        )
      ) : null}
    </div>
  );
}
