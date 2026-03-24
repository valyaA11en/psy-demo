"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatCompactDateTime } from "@/lib/format";
import type { NotificationPreferences, TelegramLinkSession } from "@/lib/types";

type UpdateNotificationPreferencesInput = {
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
  telegramEnabled?: boolean;
  bookingUpdatesEnabled?: boolean;
  paymentUpdatesEnabled?: boolean;
  sessionUpdatesEnabled?: boolean;
  systemUpdatesEnabled?: boolean;
  unlinkTelegram?: boolean;
};

type FormState = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  telegramEnabled: boolean;
  bookingUpdatesEnabled: boolean;
  paymentUpdatesEnabled: boolean;
  sessionUpdatesEnabled: boolean;
  systemUpdatesEnabled: boolean;
};

type Props = {
  preferences: NotificationPreferences | null;
  onCreateTelegramLink: () => Promise<TelegramLinkSession>;
  onUpdate: (input: UpdateNotificationPreferencesInput) => Promise<void>;
};

function toFormState(preferences: NotificationPreferences | null): FormState {
  return {
    inAppEnabled: preferences?.inAppEnabled ?? true,
    emailEnabled: preferences?.emailEnabled ?? true,
    telegramEnabled: preferences?.telegramEnabled ?? false,
    bookingUpdatesEnabled: preferences?.bookingUpdatesEnabled ?? true,
    paymentUpdatesEnabled: preferences?.paymentUpdatesEnabled ?? true,
    sessionUpdatesEnabled: preferences?.sessionUpdatesEnabled ?? true,
    systemUpdatesEnabled: preferences?.systemUpdatesEnabled ?? true,
  };
}

export function NotificationPreferencesPanel({
  preferences,
  onCreateTelegramLink,
  onUpdate,
}: Props) {
  const [form, setForm] = useState<FormState>(() => toFormState(preferences));
  const [linkSession, setLinkSession] = useState<TelegramLinkSession | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setForm(toFormState(preferences));
  }, [preferences]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      await onUpdate({
        inAppEnabled: form.inAppEnabled,
        emailEnabled: form.emailEnabled,
        telegramEnabled: form.telegramEnabled,
        bookingUpdatesEnabled: form.bookingUpdatesEnabled,
        paymentUpdatesEnabled: form.paymentUpdatesEnabled,
        sessionUpdatesEnabled: form.sessionUpdatesEnabled,
        systemUpdatesEnabled: form.systemUpdatesEnabled,
      });
      setSuccess("Настройки уведомлений сохранены");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось сохранить настройки уведомлений");
    } finally {
      setPending(false);
    }
  }

  async function handleCreateTelegramLink() {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const nextLinkSession = await onCreateTelegramLink();
      setLinkSession(nextLinkSession);
      setSuccess("Ссылка для Telegram сгенерирована");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось создать ссылку для Telegram");
    } finally {
      setPending(false);
    }
  }

  async function handleUnlinkTelegram() {
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      await onUpdate({
        unlinkTelegram: true,
      });
      setForm((current) => ({
        ...current,
        telegramEnabled: false,
      }));
      setLinkSession(null);
      setSuccess("Привязка Telegram удалена");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось отвязать Telegram");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="surface stack">
      <div className="section-head">
        <div>
          <p className="caption">Уведомления</p>
          <h3 className="card-title">Notification preferences</h3>
          <p className="section-text">
            Настройки влияют на создание новых уведомлений в `api-core`. Уже созданные записи в ленте не меняются.
          </p>
        </div>
      </div>

      <form className="stack" onSubmit={handleSubmit}>
        <div className="grid-halves">
          <div className="surface surface-muted stack compact-stack">
            <strong>Каналы доставки</strong>

            <label className="checkbox-row">
              <input
                checked={form.inAppEnabled}
                disabled={pending}
                onChange={(event) => updateField("inAppEnabled", event.target.checked)}
                type="checkbox"
              />
              <span>В приложении</span>
            </label>

            <label className="checkbox-row">
              <input
                checked={form.emailEnabled}
                disabled={pending}
                onChange={(event) => updateField("emailEnabled", event.target.checked)}
                type="checkbox"
              />
              <span>Email для транзакционных уведомлений</span>
            </label>

            <label className="checkbox-row">
              <input
                checked={form.telegramEnabled}
                disabled={pending || !preferences?.telegramLinked}
                onChange={(event) => updateField("telegramEnabled", event.target.checked)}
                type="checkbox"
              />
              <span>Telegram</span>
            </label>

            <div className="surface stack compact-stack">
              <div className="meta-row">
                <span>
                  {preferences?.telegramLinked
                    ? `Привязан: ${preferences.telegramChatIdMasked ?? "скрыт"}`
                    : "Telegram ещё не привязан"}
                </span>
                <span>
                  {preferences?.telegramLinkedAt
                    ? `с ${formatCompactDateTime(preferences.telegramLinkedAt)}`
                    : "без даты привязки"}
                </span>
              </div>

              {preferences?.telegramLinkingAvailable ? (
                <div className="inline-actions">
                  <button
                    className="button button-secondary button-small"
                    disabled={pending}
                    onClick={handleCreateTelegramLink}
                    type="button"
                  >
                    {preferences.telegramLinked ? "Перепривязать через бота" : "Подключить через бота"}
                  </button>
                  {preferences.telegramLinked ? (
                    <button
                      className="button button-ghost button-small"
                      disabled={pending}
                      onClick={handleUnlinkTelegram}
                      type="button"
                    >
                      Отвязать Telegram
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="section-text">
                  Telegram linking пока не настроен в окружении. Нужен `TELEGRAM_BOT_USERNAME` на backend.
                </p>
              )}

              {linkSession ? (
                <div className="surface surface-muted stack compact-stack">
                  <strong>Deep link для привязки</strong>
                  <p className="section-text">
                    Откройте ссылку, отправьте боту команду `/start`, затем обновите кабинет.
                  </p>
                  <a
                    className="button button-primary"
                    href={linkSession.deepLink}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Открыть @{linkSession.botUsername}
                  </a>
                  <div className="meta-row">
                    <span>действует до {formatCompactDateTime(linkSession.tokenExpiresAt)}</span>
                    <span>{linkSession.expiresInSec} сек.</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="surface surface-muted stack compact-stack">
            <strong>Категории событий</strong>

            <label className="checkbox-row">
              <input
                checked={form.bookingUpdatesEnabled}
                disabled={pending}
                onChange={(event) => updateField("bookingUpdatesEnabled", event.target.checked)}
                type="checkbox"
              />
              <span>Бронирования и изменения консультаций</span>
            </label>

            <label className="checkbox-row">
              <input
                checked={form.paymentUpdatesEnabled}
                disabled={pending}
                onChange={(event) => updateField("paymentUpdatesEnabled", event.target.checked)}
                type="checkbox"
              />
              <span>Оплаты и статусы платежей</span>
            </label>

            <label className="checkbox-row">
              <input
                checked={form.sessionUpdatesEnabled}
                disabled={pending}
                onChange={(event) => updateField("sessionUpdatesEnabled", event.target.checked)}
                type="checkbox"
              />
              <span>Доступ к видеосессии и session-ready события</span>
            </label>

            <label className="checkbox-row">
              <input
                checked={form.systemUpdatesEnabled}
                disabled={pending}
                onChange={(event) => updateField("systemUpdatesEnabled", event.target.checked)}
                type="checkbox"
              />
              <span>Системные события платформы</span>
            </label>
          </div>
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}
        {success ? <div className="notice notice-success">{success}</div> : null}

        <div className="inline-actions">
          <button className="button button-primary" disabled={pending} type="submit">
            Сохранить настройки
          </button>
          <span className="section-text">
            Telegram включается только после успешной привязки через бота и команды `/start`.
          </span>
        </div>
      </form>
    </div>
  );
}
