"use client";

import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PaymentActions } from "@/components/payment-actions";
import { formatCompactDateTime, formatDateRange, formatMoney, humanizeCode } from "@/lib/format";
import type {
  AuthUser,
  BookingListResponse,
  DashboardBooking,
  PaymentListResponse,
  PaymentRecord,
} from "@/lib/types";

export function DashboardClient() {
  const { ready, user, request } = useAuth();
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [bookings, setBookings] = useState<DashboardBooking[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(nextError instanceof Error ? nextError.message : "Failed to load dashboard");
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

  if (!ready) {
    return <section className="page">Checking session...</section>;
  }

  if (!user) {
    return (
      <section className="page empty-state">
        <h1 className="section-title">Sign in to open your dashboard</h1>
        <p className="section-text">
          The dashboard connects to the current `api-core` and shows bookings, mock payments, and
          session access.
        </p>
        <Link className="button button-primary" href="/auth">
          open auth
        </Link>
      </section>
    );
  }

  return (
    <section className="page stack">
      <div className="section-head">
        <div>
          <p className="caption">Personal workspace</p>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-text">
            Role-sensitive overview for <strong>{user.email}</strong>.
          </p>
        </div>
        <button className="button button-secondary" onClick={() => void loadData()} type="button">
          refresh
        </button>
      </div>

      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="summary-grid">
        <div className="summary-card">
          <span className="caption">roles</span>
          <strong>{user.roles.join(", ")}</strong>
        </div>
        <div className="summary-card">
          <span className="caption">bookings</span>
          <strong>{bookings.length}</strong>
        </div>
        <div className="summary-card">
          <span className="caption">payments</span>
          <strong>{payments.length}</strong>
        </div>
        <div className="summary-card">
          <span className="caption">profile</span>
          <strong>
            {profile?.clientProfile?.displayName ??
              profile?.psychologistProfile?.publicSlug ??
              "available"}
          </strong>
        </div>
      </div>

      {loading ? (
        <div className="surface">Loading dashboard data...</div>
      ) : (
        <div className="dashboard-grid">
          <div className="stack">
            <div className="section-head">
              <div>
                <h2 className="section-title">Consultations</h2>
                <p className="section-text">
                  {user.roles.includes("client")
                    ? "Booking, payment and session flow for the client account."
                    : "Upcoming consultations visible to the psychologist account."}
                </p>
              </div>
            </div>

            {bookings.length === 0 ? (
              <div className="surface empty-state">
                <p className="section-text">No consultations yet.</p>
                <Link className="button button-primary" href="/">
                  browse psychologists
                </Link>
              </div>
            ) : (
              bookings.map((booking) => (
                <article className="surface booking-card" key={booking.id}>
                  <div className="booking-head">
                    <div>
                      <h3 className="card-title">
                        {booking.psychologist?.fullName ?? booking.client?.displayName ?? "Consultation"}
                      </h3>
                      <p className="section-text">{formatDateRange(booking.slot.startsAt, booking.slot.endsAt)}</p>
                    </div>
                    <span className={`status-badge status-${booking.status}`}>{humanizeCode(booking.status)}</span>
                  </div>

                  <div className="meta-row">
                    <span>slot status: {humanizeCode(booking.slot.status)}</span>
                    <span>created: {formatCompactDateTime(booking.createdAt)}</span>
                  </div>

                  {booking.clientMessage ? (
                    <div className="surface surface-muted">
                      <p className="caption">client message</p>
                      <p className="section-text">{booking.clientMessage}</p>
                    </div>
                  ) : null}

                  {user.roles.includes("client") ? (
                    <PaymentActions booking={booking} onUpdated={() => void loadData()} />
                  ) : null}

                  {booking.latestPayment ? (
                    <div className="meta-row">
                      <span>
                        latest payment: {humanizeCode(booking.latestPayment.status)} /{" "}
                        {formatMoney(booking.latestPayment.amount, booking.latestPayment.currency)}
                      </span>
                      {booking.latestPayment.status === "succeeded" ? (
                        <Link className="muted-link" href={`/session/${booking.id}`}>
                          open session page
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
              <p className="caption">Current account</p>
              <h3 className="card-title">{profile?.email ?? user.email}</h3>
              <ul className="list-block">
                <li>roles: {user.roles.join(", ")}</li>
                <li>timezone: {profile?.clientProfile?.timezone ?? "not set"}</li>
                <li>public slug: {profile?.psychologistProfile?.publicSlug ?? "not applicable"}</li>
              </ul>
            </div>

            {payments.length > 0 ? (
              <div className="surface">
                <p className="caption">Recent payments</p>
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
                          session page
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      )}
    </section>
  );
}
