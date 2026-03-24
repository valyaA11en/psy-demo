"use client";

import Link from "next/link";
import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { formatDateRange } from "@/lib/format";
import type { AvailabilitySlot } from "@/lib/types";

type BookingActionsProps = {
  psychologistName: string;
  slots: AvailabilitySlot[];
};

export function BookingActions({ psychologistName, slots }: BookingActionsProps) {
  const router = useRouter();
  const { ready, user, request } = useAuth();
  const [selectedSlotId, setSelectedSlotId] = useState(slots[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.id === selectedSlotId) ?? slots[0] ?? null,
    [selectedSlotId, slots],
  );

  if (slots.length === 0) {
    return (
      <div className="surface">
        <p className="section-text">Свободные слоты пока не опубликованы.</p>
      </div>
    );
  }

  if (!ready) {
    return <div className="surface">Проверяем сессию...</div>;
  }

  if (!user) {
    return (
      <div className="surface">
        <p className="section-text">
          Войдите как клиент, чтобы записаться к <strong>{psychologistName}</strong>.
        </p>
        <Link className="button button-primary" href="/auth">
          войти и записаться
        </Link>
      </div>
    );
  }

  if (!user.roles.includes("client")) {
    return (
      <div className="surface">
        <p className="section-text">Запись доступна только клиентским аккаунтам.</p>
      </div>
    );
  }

  function handleBook() {
    if (!selectedSlot) {
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);

    startTransition(() => {
      void request<{ id: string }>("/bookings", {
        method: "POST",
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          slotId: selectedSlot.id,
        }),
      })
        .then((result) => {
          setSuccess(`Бронирование ${result.id} создано`);
          router.push("/dashboard");
          router.refresh();
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
      <div>
        <p className="caption">Выберите слот и создайте бронирование.</p>
        <h3 className="card-title">Доступные слоты</h3>
      </div>

      <div className="slot-selector">
        {slots.slice(0, 8).map((slot) => {
          const active = slot.id === selectedSlotId;

          return (
            <button
              key={slot.id}
              className={`slot-choice${active ? " slot-choice-active" : ""}`}
              onClick={() => setSelectedSlotId(slot.id)}
              type="button"
            >
              <strong>{formatDateRange(slot.startsAt, slot.endsAt)}</strong>
              <span>{slot.timezone}</span>
            </button>
          );
        })}
      </div>

      {selectedSlot ? (
        <p className="section-text">
          Выбрано: <strong>{formatDateRange(selectedSlot.startsAt, selectedSlot.endsAt)}</strong>
        </p>
      ) : null}

      <div className="inline-actions">
        <button className="button button-primary" disabled={pending} onClick={handleBook} type="button">
          {pending ? "бронируем..." : "записаться"}
        </button>
        <Link className="button button-ghost" href="/dashboard">
          открыть кабинет
        </Link>
      </div>

      {error ? <div className="notice notice-error">{error}</div> : null}
      {success ? <div className="notice notice-success">{success}</div> : null}
    </div>
  );
}
