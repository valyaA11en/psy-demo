"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { formatDateRange, formatMoney } from "@/lib/format";
import type {
  AvailabilitySlot,
  ClientSessionPackageRecord,
  ClientSessionPackagesResponse,
  PublicSessionPackageOffer,
} from "@/lib/types";

type BookingActionsProps = {
  psychologistName: string;
  psychologistSlug: string;
  slots: AvailabilitySlot[];
  packageOffers: PublicSessionPackageOffer[];
};

export function BookingActions({
  psychologistName,
  psychologistSlug,
  slots,
  packageOffers,
}: BookingActionsProps) {
  const router = useRouter();
  const { ready, user, request } = useAuth();
  const [selectedSlotId, setSelectedSlotId] = useState(slots[0]?.id ?? "");
  const [selectedOfferId, setSelectedOfferId] = useState(packageOffers[0]?.id ?? "");
  const [clientPackages, setClientPackages] = useState<ClientSessionPackageRecord[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [bookingPending, setBookingPending] = useState(false);
  const [purchasePending, setPurchasePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.id === selectedSlotId) ?? slots[0] ?? null,
    [selectedSlotId, slots],
  );

  const selectedOffer = useMemo(
    () => packageOffers.find((offer) => offer.id === selectedOfferId) ?? packageOffers[0] ?? null,
    [packageOffers, selectedOfferId],
  );

  const activePackage = useMemo(
    () => clientPackages.find((item) => item.id === selectedPackageId) ?? null,
    [clientPackages, selectedPackageId],
  );

  useEffect(() => {
    setSelectedOfferId((current) =>
      current && packageOffers.some((offer) => offer.id === current) ? current : (packageOffers[0]?.id ?? ""),
    );
  }, [packageOffers]);

  useEffect(() => {
    if (!ready || !user || !user.roles.includes("client")) {
      setClientPackages([]);
      setSelectedPackageId("");
      return;
    }

    let disposed = false;
    setPackagesLoading(true);

    startTransition(() => {
      void request<ClientSessionPackagesResponse>(
        `/session-packages/me?psychologistSlug=${encodeURIComponent(psychologistSlug)}&status=active`,
      )
        .then((response) => {
          if (disposed) {
            return;
          }

          const nextPackages = response.items.filter(
            (item) => item.status === "active" && item.remainingSessions > 0,
          );
          setClientPackages(nextPackages);
          setSelectedPackageId((current) =>
            current && nextPackages.some((item) => item.id === current) ? current : (nextPackages[0]?.id ?? ""),
          );
        })
        .catch((nextError: Error) => {
          if (!disposed) {
            setError(nextError.message);
          }
        })
        .finally(() => {
          if (!disposed) {
            setPackagesLoading(false);
          }
        });
    });

    return () => {
      disposed = true;
    };
  }, [psychologistSlug, ready, user]);

  if (slots.length === 0) {
    return (
      <div className="surface">
        <p className="section-text">Свободные слоты скоро появятся. Попробуйте зайти немного позже.</p>
      </div>
    );
  }

  if (!ready) {
    return <div className="surface">Проверяем сессию...</div>;
  }

  if (!user) {
    return (
      <div className="surface stack">
        <p className="section-text">
          Войдите как клиент, чтобы бережно записаться к <strong>{psychologistName}</strong>.
        </p>
        {packageOffers.length > 0 ? (
          <p className="section-text">
            Для этого психолога доступны пакеты сессий со скидкой. После входа вы сможете выбрать пакет или оплатить
            консультацию разово.
          </p>
        ) : null}
        <Link className="button button-primary" href="/auth">
          войти и продолжить
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

    setBookingPending(true);
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
          ...(selectedPackageId ? { sessionPackageId: selectedPackageId } : {}),
        }),
      })
        .then((result) => {
          setSuccess(
            selectedPackageId
              ? `Бронирование ${result.id} создано и покрыто выбранным пакетом`
              : `Бронирование ${result.id} создано`,
          );
          router.push("/dashboard");
          router.refresh();
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        })
        .finally(() => {
          setBookingPending(false);
        });
    });
  }

  function handlePurchasePackage() {
    if (!selectedOffer) {
      return;
    }

    setPurchasePending(true);
    setError(null);
    setSuccess(null);

    startTransition(() => {
      void request<ClientSessionPackageRecord>("/session-packages/purchases", {
        method: "POST",
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          offerId: selectedOffer.id,
        }),
      })
        .then((createdPackage) => {
          setClientPackages((current) => {
            const withoutCurrent = current.filter((item) => item.id !== createdPackage.id);
            return [createdPackage, ...withoutCurrent];
          });
          setSelectedPackageId(createdPackage.id);
          setSuccess(`Пакет «${createdPackage.title}» активирован и готов к использованию`);
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        })
        .finally(() => {
          setPurchasePending(false);
        });
    });
  }

  return (
    <div className="surface stack">
      <div className="booking-hero">
        <div>
          <p className="caption">Выберите удобное время</p>
          <h3 className="card-title">Доступные слоты консультаций</h3>
          <p className="section-text">
            Экран записи стал спокойнее и понятнее: сначала выбор времени, затем пакет или разовая запись.
          </p>
        </div>
        <div className="booking-hero-card">
          <span className="caption">специалист</span>
          <strong>{psychologistName}</strong>
        </div>
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
          Вы выбрали: <strong>{formatDateRange(selectedSlot.startsAt, selectedSlot.endsAt)}</strong>
        </p>
      ) : null}

      {packageOffers.length > 0 ? (
        <div className="surface surface-muted stack">
          <div>
            <p className="caption">Пакеты сессий</p>
            <h4 className="card-title">Можно записаться по пакету со скидкой</h4>
          </div>

          <div className="slot-selector">
            {packageOffers.map((offer) => {
              const active = offer.id === selectedOfferId;

              return (
                <button
                  key={offer.id}
                  className={`slot-choice${active ? " slot-choice-active" : ""}`}
                  onClick={() => setSelectedOfferId(offer.id)}
                  type="button"
                >
                  <strong>{offer.title}</strong>
                  <span>
                    {offer.sessionCount} сессий, скидка {offer.discountPercent}%
                  </span>
                  <span>{formatMoney(offer.totalPrice, offer.currency)}</span>
                </button>
              );
            })}
          </div>

          {selectedOffer?.description ? <p className="section-text">{selectedOffer.description}</p> : null}

          {packagesLoading ? (
            <p className="section-text">Загружаем ваши активные пакеты...</p>
          ) : clientPackages.length > 0 ? (
            <div className="stack compact-stack">
              <p className="caption">Ваши активные пакеты у этого психолога</p>
              <div className="slot-selector">
                {clientPackages.map((item) => {
                  const active = item.id === selectedPackageId;

                  return (
                    <button
                      key={item.id}
                      className={`slot-choice${active ? " slot-choice-active" : ""}`}
                      onClick={() => setSelectedPackageId(item.id)}
                      type="button"
                    >
                      <strong>{item.title}</strong>
                      <span>
                        Осталось {item.remainingSessions} из {item.totalSessions}
                      </span>
                      <span>{formatMoney(item.priceAmount, item.currency)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="inline-actions">
                <button
                  className="button button-ghost button-small"
                  onClick={() => setSelectedPackageId("")}
                  type="button"
                >
                  оплатить консультацию отдельно
                </button>
              </div>
            </div>
          ) : (
            <p className="section-text">Активных пакетов у этого психолога пока нет.</p>
          )}

          <div className="inline-actions">
            <button
              className="button button-secondary button-small"
              disabled={purchasePending || !selectedOffer}
              onClick={handlePurchasePackage}
              type="button"
            >
              {purchasePending
                ? "активируем пакет..."
                : selectedOffer
                  ? `купить пакет за ${formatMoney(selectedOffer.totalPrice, selectedOffer.currency)}`
                  : "выберите пакет"}
            </button>
          </div>

          {activePackage ? (
            <div className="notice notice-success">
              Запись будет покрыта пакетом «{activePackage.title}». После бронирования отдельный тестовый платёж не
              потребуется.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="inline-actions">
        <button className="button button-primary" disabled={bookingPending} onClick={handleBook} type="button">
          {bookingPending ? "создаём запись..." : "подтвердить запись"}
        </button>
        <Link className="button button-ghost" href="/dashboard">
          открыть кабинет
        </Link>
      </div>

      <div className="booking-info-grid">
        <div className="booking-info-card">
          <p className="caption">гибкость</p>
          <strong>Можно выбрать пакет или отдельную сессию</strong>
        </div>
        <div className="booking-info-card">
          <p className="caption">ясность</p>
          <strong>Следующий шаг всегда один и визуально понятный</strong>
        </div>
      </div>

      {error ? <div className="notice notice-error">{error}</div> : null}
      {success ? <div className="notice notice-success">{success}</div> : null}
    </div>
  );
}
