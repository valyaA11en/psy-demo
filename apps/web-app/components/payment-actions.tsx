"use client";

import { startTransition, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { DashboardBooking, PaymentRecord } from "@/lib/types";

type PaymentActionsProps = {
  booking: DashboardBooking;
  onUpdated: () => void;
};

export function PaymentActions({ booking, onUpdated }: PaymentActionsProps) {
  const { request } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestPayment = booking.latestPayment;

  function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);

    startTransition(() => {
      void action()
        .then(() => {
          onUpdated();
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        })
        .finally(() => {
          setPending(false);
        });
    });
  }

  function createPayment() {
    run(async () => {
      await request<PaymentRecord>("/payments", {
        method: "POST",
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          consultationId: booking.id,
        }),
      });
    });
  }

  function confirmPayment() {
    if (!latestPayment) {
      return;
    }

    run(async () => {
      await request<PaymentRecord>(`/payments/${latestPayment.id}/mock/confirm`, {
        method: "POST",
      });
    });
  }

  function failPayment() {
    if (!latestPayment) {
      return;
    }

    run(async () => {
      await request<PaymentRecord>(`/payments/${latestPayment.id}/mock/fail`, {
        method: "POST",
        body: JSON.stringify({
          failureCode: "mock_declined",
          failureMessage: "Mock decline from the frontend demo flow",
        }),
      });
    });
  }

  function cancelPayment() {
    if (!latestPayment) {
      return;
    }

    run(async () => {
      await request<PaymentRecord>(`/payments/${latestPayment.id}/mock/cancel`, {
        method: "POST",
      });
    });
  }

  if (latestPayment?.status === "succeeded") {
    return <span className="status-badge status-badge-success">payment complete</span>;
  }

  if (!latestPayment || latestPayment.status === "failed" || latestPayment.status === "cancelled") {
    return (
      <div className="stack">
        <button className="button button-primary button-small" disabled={pending} onClick={createPayment} type="button">
          {pending ? "creating payment..." : "create mock payment"}
        </button>
        {error ? <div className="notice notice-error">{error}</div> : null}
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="caption">Pending mock payment. Choose the test outcome.</p>
      <div className="inline-actions">
        <button className="button button-primary button-small" disabled={pending} onClick={confirmPayment} type="button">
          confirm
        </button>
        <button className="button button-secondary button-small" disabled={pending} onClick={failPayment} type="button">
          fail
        </button>
        <button className="button button-ghost button-small" disabled={pending} onClick={cancelPayment} type="button">
          cancel
        </button>
      </div>
      {error ? <div className="notice notice-error">{error}</div> : null}
    </div>
  );
}
