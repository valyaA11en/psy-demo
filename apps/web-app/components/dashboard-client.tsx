"use client";

import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "@/components/auth-provider";
import { PaymentActions } from "@/components/payment-actions";
import { formatCompactDateTime, formatDateRange, formatMoney, humanizeCode } from "@/lib/format";
import type {
  AuthUser,
  BookingListResponse,
  DashboardBooking,
  PaymentListResponse,
  PaymentRecord,
  RealtimeDomainEvent,
} from "@/lib/types";

export function DashboardClient() {
  const { ready, accessToken, user, request } = useAuth();
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [bookings, setBookings] = useState<DashboardBooking[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<"idle" | "connecting" | "connected" | "offline">("idle");
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeDomainEvent[]>([]);

  const loadData = useEffectEvent(async () => {
    if (!user) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const profileData = await request<AuthUser>("/users/me");
      setProfile(profileData);

      if (user.roles.includes("client")) {
        const [bookingData, paymentData] = await Promise.all([
          request<BookingListResponse>("/bookings/me"),
          request<PaymentListResponse>("/payments/me"),
        ]);

        setBookings(bookingData.items);
        setPayments(paymentData.items);
        return;
      }

      if (user.roles.includes("psychologist")) {
        const bookingData = await request<BookingListResponse>("/bookings/psychologist/me");
        setBookings(bookingData.items);
        setPayments([]);
        return;
      }

      setBookings([]);
      setPayments([]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось загрузить кабинет");
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (!ready || !user) {
      return;
    }

    startTransition(() => {
      void loadData();
    });
  }, [ready, user]);

  useEffect(() => {
    if (!ready || !user || !accessToken) {
      setRealtimeState(user ? "offline" : "idle");
      return;
    }

    const socket = io(process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4001", {
      path: "/ws/socket.io",
      transports: ["websocket"],
      auth: {
        token: accessToken,
      },
    });

    setRealtimeState("connecting");

    socket.on("connect", () => {
      setRealtimeState("connected");
    });

    socket.on("disconnect", () => {
      setRealtimeState("offline");
    });

    socket.on("domain_event", (event: RealtimeDomainEvent) => {
      setRealtimeEvents((current) => [event, ...current].slice(0, 5));
      void loadData();
    });

    socket.on("ws.expired", () => {
      setRealtimeState("offline");
    });

    socket.on("connect_error", () => {
      setRealtimeState("offline");
    });

    return () => {
      socket.disconnect();
    };
  }, [ready, user, accessToken]);

  if (!ready) {
    return <section className="page">Проверяем сессию...</section>;
  }

  if (!user) {
    return (
      <section className="page empty-state">
        <h1 className="section-title">Войдите, чтобы открыть кабинет</h1>
        <p className="section-text">
          Кабинет подключён к текущему `api-core` и показывает бронирования, тестовые оплаты и
          доступ к сессии.
        </p>
        <Link className="button button-primary" href="/auth">
          открыть вход
        </Link>
      </section>
    );
  }

  return (
    <section className="page stack">
      <div className="section-head">
        <div>
          <p className="caption">Личное пространство</p>
          <h1 className="section-title">Кабинет</h1>
          <p className="section-text">
            Данные с учётом роли для <strong>{user.email}</strong>.
          </p>
        </div>
        <button className="button button-secondary" onClick={() => void loadData()} type="button">
          обновить
        </button>
      </div>

      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="summary-grid">
        <div className="summary-card">
          <span className="caption">роли</span>
          <strong>{user.roles.map(humanizeCode).join(", ")}</strong>
        </div>
        <div className="summary-card">
          <span className="caption">бронирования</span>
          <strong>{bookings.length}</strong>
        </div>
        <div className="summary-card">
          <span className="caption">платежи</span>
          <strong>{payments.length}</strong>
        </div>
        <div className="summary-card">
          <span className="caption">профиль</span>
          <strong>
            {profile?.clientProfile?.displayName ??
              profile?.psychologistProfile?.publicSlug ??
              "доступен"}
          </strong>
        </div>
        <div className="summary-card">
          <span className="caption">realtime</span>
          <strong>{humanizeCode(realtimeState)}</strong>
        </div>
      </div>

      {loading ? (
        <div className="surface">Загружаем данные кабинета...</div>
      ) : (
        <div className="dashboard-grid">
          <div className="stack">
            <div className="section-head">
              <div>
                <h2 className="section-title">Консультации</h2>
                <p className="section-text">
                  {user.roles.includes("client")
                    ? "Запись, оплата и доступ к сессии для клиентского аккаунта."
                    : "Предстоящие консультации, доступные аккаунту психолога."}
                </p>
              </div>
            </div>

            {bookings.length === 0 ? (
              <div className="surface empty-state">
                <p className="section-text">Консультаций пока нет.</p>
                <Link className="button button-primary" href="/">
                  выбрать психолога
                </Link>
              </div>
            ) : (
              bookings.map((booking) => (
                <article className="surface booking-card" key={booking.id}>
                  <div className="booking-head">
                    <div>
                      <h3 className="card-title">
                        {booking.psychologist?.fullName ?? booking.client?.displayName ?? "Консультация"}
                      </h3>
                      <p className="section-text">{formatDateRange(booking.slot.startsAt, booking.slot.endsAt)}</p>
                    </div>
                    <span className={`status-badge status-${booking.status}`}>{humanizeCode(booking.status)}</span>
                  </div>

                  <div className="meta-row">
                    <span>статус слота: {humanizeCode(booking.slot.status)}</span>
                    <span>создано: {formatCompactDateTime(booking.createdAt)}</span>
                  </div>

                  {booking.clientMessage ? (
                    <div className="surface surface-muted">
                      <p className="caption">сообщение клиента</p>
                      <p className="section-text">{booking.clientMessage}</p>
                    </div>
                  ) : null}

                  {user.roles.includes("client") ? (
                    <PaymentActions booking={booking} onUpdated={() => void loadData()} />
                  ) : null}

                  {booking.latestPayment ? (
                    <div className="meta-row">
                      <span>
                        последний платёж: {humanizeCode(booking.latestPayment.status)} /{" "}
                        {formatMoney(booking.latestPayment.amount, booking.latestPayment.currency)}
                      </span>
                      {booking.latestPayment.status === "succeeded" ? (
                        <Link className="muted-link" href={`/session/${booking.id}`}>
                          открыть страницу сессии
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>

          <aside className="stack">
            <div className="surface">
              <p className="caption">Текущий аккаунт</p>
              <h3 className="card-title">{profile?.email ?? user.email}</h3>
              <ul className="list-block">
                <li>роли: {user.roles.map(humanizeCode).join(", ")}</li>
                <li>часовой пояс: {profile?.clientProfile?.timezone ?? "не указан"}</li>
                <li>публичный адрес профиля: {profile?.psychologistProfile?.publicSlug ?? "не применяется"}</li>
              </ul>
            </div>

            {payments.length > 0 ? (
              <div className="surface">
                <p className="caption">Последние платежи</p>
                <div className="stack compact-stack">
                  {payments.slice(0, 5).map((payment) => (
                    <div className="surface surface-muted" key={payment.id}>
                      <div className="meta-row">
                        <strong>{formatMoney(payment.amount, payment.currency)}</strong>
                        <span className={`status-badge status-${payment.status}`}>
                          {humanizeCode(payment.status)}
                        </span>
                      </div>
                      <div className="meta-row">
                        <span>{formatCompactDateTime(payment.createdAt)}</span>
                        <Link className="muted-link" href={`/session/${payment.consultationId}`}>
                          страница сессии
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="surface">
              <p className="caption">Realtime-активность</p>
              {realtimeEvents.length === 0 ? (
                <p className="section-text">Пока не получено ни одного события в реальном времени.</p>
              ) : (
                <div className="stack compact-stack">
                  {realtimeEvents.map((event) => (
                    <div className="surface surface-muted" key={event.id}>
                      <div className="meta-row">
                        <strong>{humanizeCode(event.name)}</strong>
                        <span>{formatCompactDateTime(event.occurredAt)}</span>
                      </div>
                      <div className="meta-row">
                        <span>сущность: {humanizeCode(event.entity.type)}</span>
                        <span>{event.payload.status ? humanizeCode(event.payload.status) : "требуется обновление"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
