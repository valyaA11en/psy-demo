"use client";

import { startTransition, useState } from "react";
import { formatCompactDateTime, humanizeCode } from "@/lib/format";
import type { DashboardBooking } from "@/lib/types";

type BookingReviewPanelProps = {
  booking: DashboardBooking;
  onCreate: (input: { consultationId: string; rating: number; text?: string }) => Promise<void>;
};

export function BookingReviewPanel({ booking, onCreate }: BookingReviewPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [rating, setRating] = useState("5");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!booking.review && !booking.canLeaveReview) {
    return null;
  }

  function submitReview() {
    setSubmitting(true);
    setError(null);

    startTransition(() => {
      void onCreate({
        consultationId: booking.id,
        rating: Number(rating),
        text: text.trim() || undefined,
      })
        .then(() => {
          setExpanded(false);
          setRating("5");
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
        <strong>Отзыв</strong>
        {booking.review ? (
          <span>
            {booking.review.rating} / 5 • {formatCompactDateTime(booking.review.createdAt)}
          </span>
        ) : (
          <span>доступен после завершённой консультации</span>
        )}
      </div>

      {booking.review ? (
        <>
          <div className="meta-row">
            <span>Статус: {humanizeCode(booking.review.status)}</span>
          </div>
          {booking.review.text ? <p className="section-text">{booking.review.text}</p> : null}
        </>
      ) : null}

      {booking.canLeaveReview && !booking.review ? (
        expanded ? (
          <div className="stack">
            <div className="form-grid two-columns">
              <label className="field">
                <span>Оценка</span>
                <select
                  className="field-select"
                  onChange={(event) => setRating(event.target.value)}
                  value={rating}
                >
                  <option value="5">5 / 5</option>
                  <option value="4">4 / 5</option>
                  <option value="3">3 / 5</option>
                  <option value="2">2 / 5</option>
                  <option value="1">1 / 5</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span>Комментарий</span>
              <textarea
                className="field-textarea"
                onChange={(event) => setText(event.target.value)}
                placeholder="Что было полезно, спокойно ли прошла консультация, помог ли специалист."
                rows={4}
                value={text}
              />
            </label>

            {error ? <div className="notice notice-error">{error}</div> : null}

            <div className="inline-actions">
              <button
                className="button button-primary"
                disabled={submitting}
                onClick={submitReview}
                type="button"
              >
                {submitting ? "публикуем..." : "опубликовать отзыв"}
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
            оставить отзыв
          </button>
        )
      ) : null}
    </div>
  );
}
