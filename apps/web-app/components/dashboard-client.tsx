"use client";

import Link from "next/link";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { io } from "socket.io-client";
import { AvailabilityExceptionsPanel } from "@/components/availability-exceptions-panel";
import { AvailabilityRulesPanel } from "@/components/availability-rules-panel";
import { BookingComplaintPanel } from "@/components/booking-complaint-panel";
import { BookingReviewPanel } from "@/components/booking-review-panel";
import { NotificationPreferencesPanel } from "@/components/notification-preferences-panel";
import { AppointmentSlotsPanel } from "@/components/appointment-slots-panel";
import { PsychologistFilesPanel } from "@/components/psychologist-files-panel";
import { useAuth } from "@/components/auth-provider";
import { PaymentActions } from "@/components/payment-actions";
import { formatCompactDateTime, formatDateRange, formatMoney, humanizeCode } from "@/lib/format";
import type {
  AvailabilityException,
  AvailabilityRule,
  AvailabilitySlot,
  AuthUser,
  BookingListResponse,
  ComplaintListResponse,
  ComplaintRecord,
  DashboardBooking,
  FileDownloadSession,
  FileUploadSession,
  FilesListResponse,
  MyAvailabilitySlotsResponse,
  NotificationListResponse,
  NotificationPreferences,
  NotificationRecord,
  PaymentListResponse,
  PaymentRecord,
  PrivateFileRecord,
  RealtimeDomainEvent,
  TelegramLinkSession,
} from "@/lib/types";

type AvailabilitySlotFilters = {
  dateFrom: string;
  dateTo: string;
  timezone: string;
  status: string | null;
  limit: number;
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function createDefaultAvailabilitySlotFilters(): AvailabilitySlotFilters {
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 14);

  return {
    dateFrom: toDateInputValue(startDate),
    dateTo: toDateInputValue(endDate),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    status: null,
    limit: 20,
  };
}

function buildAvailabilitySlotsQuery(filters: AvailabilitySlotFilters) {
  const searchParams = new URLSearchParams();

  searchParams.set("dateFrom", filters.dateFrom);
  searchParams.set("dateTo", filters.dateTo);
  searchParams.set("timezone", filters.timezone);
  searchParams.set("limit", String(filters.limit));

  if (filters.status) {
    searchParams.set("status", filters.status);
  }

  return searchParams.toString();
}

function resolveUploadMimeType(file: File) {
  if (file.type.trim()) {
    return file.type.trim().toLowerCase();
  }

  const normalizedName = file.name.toLowerCase();
  if (normalizedName.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (normalizedName.endsWith(".png")) {
    return "image/png";
  }

  if (normalizedName.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

export function DashboardClient() {
  const { ready, accessToken, user, request } = useAuth();
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [bookings, setBookings] = useState<DashboardBooking[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [availabilitySlotFilters, setAvailabilitySlotFilters] = useState<AvailabilitySlotFilters>(() =>
    createDefaultAvailabilitySlotFilters(),
  );
  const [availabilityExceptions, setAvailabilityExceptions] = useState<AvailabilityException[]>([]);
  const [files, setFiles] = useState<PrivateFileRecord[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<"idle" | "connecting" | "connected" | "offline">("idle");
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeDomainEvent[]>([]);
  const availabilitySlotFiltersKey = JSON.stringify(availabilitySlotFilters);

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
        const [bookingData, paymentData, notificationData, preferenceData, complaintData] = await Promise.all([
          request<BookingListResponse>("/bookings/me"),
          request<PaymentListResponse>("/payments/me"),
          request<NotificationListResponse>("/notifications/me?limit=6"),
          request<NotificationPreferences>("/notifications/me/preferences"),
          request<ComplaintListResponse>("/complaints/me?limit=6"),
        ]);

        setBookings(bookingData.items);
        setPayments(paymentData.items);
        setAvailabilityRules([]);
        setAvailabilitySlots([]);
        setAvailabilityExceptions([]);
        setFiles([]);
        setNotificationPreferences(preferenceData);
        setNotifications(notificationData.items);
        setUnreadNotifications(notificationData.unreadCount);
        setComplaints(complaintData.items);
        return;
      }

      if (user.roles.includes("psychologist")) {
        const slotQuery = buildAvailabilitySlotsQuery(availabilitySlotFilters);
        const [bookingData, notificationData, exceptionData, ruleData, slotData, preferenceData, complaintData, fileData] =
          await Promise.all([
          request<BookingListResponse>("/bookings/psychologist/me"),
          request<NotificationListResponse>("/notifications/me?limit=6"),
          request<AvailabilityException[]>("/availability/me/exceptions"),
          request<AvailabilityRule[]>("/availability/me/rules"),
          request<MyAvailabilitySlotsResponse>(`/availability/me/slots?${slotQuery}`),
          request<NotificationPreferences>("/notifications/me/preferences"),
          request<ComplaintListResponse>("/complaints/me?limit=6"),
          request<FilesListResponse>("/files/me?limit=12"),
        ]);
        setBookings(bookingData.items);
        setPayments([]);
        setAvailabilityRules(ruleData);
        setAvailabilitySlots(slotData.items);
        setAvailabilityExceptions(exceptionData);
        setFiles(fileData.items);
        setNotificationPreferences(preferenceData);
        setNotifications(notificationData.items);
        setUnreadNotifications(notificationData.unreadCount);
        setComplaints(complaintData.items);
        return;
      }

      setBookings([]);
      setPayments([]);
      setAvailabilityRules([]);
      setAvailabilitySlots([]);
      setAvailabilityExceptions([]);
      setFiles([]);
      setComplaints([]);
      const [notificationData, preferenceData] = await Promise.all([
        request<NotificationListResponse>("/notifications/me?limit=6"),
        request<NotificationPreferences>("/notifications/me/preferences"),
      ]);
      setNotificationPreferences(preferenceData);
      setNotifications(notificationData.items);
      setUnreadNotifications(notificationData.unreadCount);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось загрузить кабинет");
    } finally {
      setLoading(false);
    }
  });

  function markNotificationRead(notificationId: string) {
    startTransition(() => {
      void request<NotificationRecord>(`/notifications/${notificationId}/read`, {
        method: "POST",
      })
        .then(() => loadData())
        .catch((nextError: Error) => {
          setError(nextError.message);
        });
    });
  }

  function markAllNotificationsRead() {
    startTransition(() => {
      void request<{ updatedCount: number }>("/notifications/me/read-all", {
        method: "POST",
      })
        .then(() => loadData())
        .catch((nextError: Error) => {
          setError(nextError.message);
        });
    });
  }

  async function createAvailabilityException(input: {
    startsAt: string;
    endsAt: string;
    reason?: string;
  }) {
    await request<AvailabilityException>("/availability/me/exceptions", {
      method: "POST",
      body: JSON.stringify(input),
    });
    await loadData();
  }

  async function toggleAvailabilityException(exception: AvailabilityException) {
    await request<AvailabilityException>(`/availability/me/exceptions/${exception.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        isActive: !exception.isActive,
      }),
    });
    await loadData();
  }

  async function deleteAvailabilityException(exceptionId: string) {
    await request<{ id: string; deleted: boolean }>(`/availability/me/exceptions/${exceptionId}`, {
      method: "DELETE",
    });
    await loadData();
  }

  async function updateNotificationPreferences(input: {
    inAppEnabled?: boolean;
    emailEnabled?: boolean;
    telegramEnabled?: boolean;
    bookingUpdatesEnabled?: boolean;
    paymentUpdatesEnabled?: boolean;
    sessionUpdatesEnabled?: boolean;
    systemUpdatesEnabled?: boolean;
    unlinkTelegram?: boolean;
  }) {
    await request<NotificationPreferences>("/notifications/me/preferences", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    await loadData();
  }

  async function createTelegramLink() {
    return request<TelegramLinkSession>("/notifications/me/preferences/telegram-link", {
      method: "POST",
    });
  }

  async function createReview(input: { consultationId: string; rating: number; text?: string }) {
    await request(`/reviews`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    await loadData();
  }

  async function createComplaint(input: { consultationId: string; type: string; text: string }) {
    await request(`/complaints`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    await loadData();
  }

  async function createAvailabilityRule(input: {
    weekday: string;
    startTime: string;
    endTime: string;
    slotDurationMin: number;
    bufferMin: number;
    timezone: string;
    isActive?: boolean;
  }) {
    await request<AvailabilityRule>("/availability/me/rules", {
      method: "POST",
      body: JSON.stringify(input),
    });
    await loadData();
  }

  async function updateAvailabilityRule(
    ruleId: string,
    input: {
      weekday?: string;
      startTime?: string;
      endTime?: string;
      slotDurationMin?: number;
      bufferMin?: number;
      timezone?: string;
      isActive?: boolean;
    },
  ) {
    await request<AvailabilityRule>(`/availability/me/rules/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    await loadData();
  }

  async function deleteAvailabilityRule(ruleId: string) {
    await request<{ id: string; deleted: boolean }>(`/availability/me/rules/${ruleId}`, {
      method: "DELETE",
    });
    await loadData();
  }

  async function createManualSlot(input: { startsAt: string; endsAt: string }) {
    await request<AvailabilitySlot>("/availability/me/slots", {
      method: "POST",
      body: JSON.stringify(input),
    });
    await loadData();
  }

  async function cancelAvailabilitySlot(slotId: string) {
    await request<{ id: string; status: string }>(`/availability/me/slots/${slotId}`, {
      method: "DELETE",
    });
    await loadData();
  }

  async function generateAvailabilitySlots(input: {
    dateFrom: string;
    dateTo: string;
    clearOpenGeneratedSlots?: boolean;
  }) {
    await request<{ createdCount: number }>("/availability/me/slots/generate", {
      method: "POST",
      body: JSON.stringify(input),
    });
    await loadData();
  }

  async function uploadPsychologistFile(purpose: string, file: File) {
    const uploadSession = await request<FileUploadSession>("/files/upload-url", {
      method: "POST",
      body: JSON.stringify({
        purpose,
        originalFilename: file.name,
        mimeType: resolveUploadMimeType(file),
        sizeBytes: file.size,
      }),
    });

    const uploadResponse = await fetch(uploadSession.upload.url, {
      method: uploadSession.upload.method,
      headers: uploadSession.upload.headers,
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error("S3 upload не завершился успешно");
    }

    await request<PrivateFileRecord>(`/files/${uploadSession.file.id}/complete`, {
      method: "POST",
    });

    await loadData();
  }

  async function downloadPsychologistFile(fileId: string) {
    const downloadSession = await request<FileDownloadSession>(`/files/${fileId}/download-url`);
    window.open(downloadSession.url, "_blank", "noopener,noreferrer");
  }

  async function deletePsychologistFile(fileId: string) {
    await request<{ id: string; deleted: boolean }>(`/files/${fileId}`, {
      method: "DELETE",
    });
    await loadData();
  }

  useEffect(() => {
    if (!ready || !user) {
      return;
    }

    startTransition(() => {
      void loadData();
    });
  }, [ready, user, availabilitySlotFiltersKey]);

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
        <div className="summary-card">
          <span className="caption">непрочитанные</span>
          <strong>{unreadNotifications}</strong>
        </div>
      </div>

      {loading ? (
        <div className="surface">Загружаем данные кабинета...</div>
      ) : (
        <div className="dashboard-grid">
          <div className="stack">
            {user.roles.includes("psychologist") ? (
              <>
                <AvailabilityRulesPanel
                  onCreate={createAvailabilityRule}
                  onDelete={deleteAvailabilityRule}
                  onUpdate={updateAvailabilityRule}
                  rules={availabilityRules}
                />
                <AppointmentSlotsPanel
                  filters={availabilitySlotFilters}
                  onCancel={cancelAvailabilitySlot}
                  onCreate={createManualSlot}
                  onFiltersChange={setAvailabilitySlotFilters}
                  onGenerate={generateAvailabilitySlots}
                  slots={availabilitySlots}
                />
                <PsychologistFilesPanel
                  files={files}
                  onDelete={deletePsychologistFile}
                  onDownload={downloadPsychologistFile}
                  onUpload={uploadPsychologistFile}
                />
              </>
            ) : null}

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

                  {user.roles.includes("client") || booking.review ? (
                    <BookingReviewPanel booking={booking} onCreate={createReview} />
                  ) : null}

                  <BookingComplaintPanel
                    booking={booking}
                    complaint={complaints.find((item) => item.consultationId === booking.id) ?? null}
                    onCreate={createComplaint}
                  />
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

            {user.roles.includes("psychologist") ? (
              <AvailabilityExceptionsPanel
                exceptions={availabilityExceptions}
                onCreate={createAvailabilityException}
                onDelete={deleteAvailabilityException}
                onToggle={toggleAvailabilityException}
              />
            ) : null}

            <NotificationPreferencesPanel
              onCreateTelegramLink={createTelegramLink}
              onUpdate={updateNotificationPreferences}
              preferences={notificationPreferences}
            />

            <div className="surface">
              <p className="caption">Жалобы</p>
              <h3 className="card-title">Мои обращения</h3>
              {complaints.length === 0 ? (
                <p className="section-text">Жалоб пока нет.</p>
              ) : (
                <div className="stack compact-stack">
                  {complaints.map((complaint) => (
                    <div className="surface surface-muted" key={complaint.id}>
                      <div className="meta-row">
                        <strong>{humanizeCode(complaint.type)}</strong>
                        <span className={`status-badge status-${complaint.status}`}>
                          {humanizeCode(complaint.status)}
                        </span>
                      </div>
                      <div className="meta-row">
                        <span>
                          {complaint.consultation
                            ? formatCompactDateTime(complaint.consultation.scheduledAt)
                            : "без привязки"}
                        </span>
                        {complaint.target?.displayName ? <span>{complaint.target.displayName}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="surface">
              <div className="section-head">
                <div>
                  <p className="caption">Уведомления</p>
                  <h3 className="card-title">Лента уведомлений</h3>
                </div>
                {unreadNotifications > 0 ? (
                  <button className="button button-ghost button-small" onClick={markAllNotificationsRead} type="button">
                    прочитать все
                  </button>
                ) : null}
              </div>

              {notifications.length === 0 ? (
                <p className="section-text">Уведомлений пока нет.</p>
              ) : (
                <div className="stack compact-stack">
                  {notifications.map((notification) => (
                    <div className="surface surface-muted" key={notification.id}>
                      <div className="meta-row">
                        <strong>{notification.title}</strong>
                        <span>{formatCompactDateTime(notification.createdAt)}</span>
                      </div>
                      <p className="section-text">{notification.body}</p>
                      <div className="meta-row">
                        <span>{humanizeCode(notification.type)}</span>
                        <span>{humanizeCode(notification.channel)} / {notification.readAt ? "прочитано" : "непрочитано"}</span>
                      </div>
                      {!notification.readAt ? (
                        <button
                          className="button button-ghost button-small"
                          onClick={() => markNotificationRead(notification.id)}
                          type="button"
                        >
                          отметить как прочитанное
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

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
