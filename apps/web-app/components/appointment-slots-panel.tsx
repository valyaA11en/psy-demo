"use client";

import { startTransition, useEffect, useState, type FormEvent } from "react";
import { formatCompactDateTime, formatDateRange, humanizeCode } from "@/lib/format";
import type { AvailabilitySlot } from "@/lib/types";

type SlotFilters = {
  dateFrom: string;
  dateTo: string;
  timezone: string;
  status: string | null;
  limit: number;
};

type ManualSlotInput = {
  startsAt: string;
  endsAt: string;
};

type GenerateSlotsInput = {
  dateFrom: string;
  dateTo: string;
  clearOpenGeneratedSlots?: boolean;
};

type Props = {
  filters: SlotFilters;
  slots: AvailabilitySlot[];
  onCancel: (slotId: string) => Promise<void>;
  onCreate: (input: ManualSlotInput) => Promise<void>;
  onFiltersChange: (filters: SlotFilters) => void;
  onGenerate: (input: GenerateSlotsInput) => Promise<void>;
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toLocalDateTimeInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function defaultManualStart() {
  const value = new Date();
  value.setHours(value.getHours() + 2, 0, 0, 0);
  return value;
}

function defaultManualEnd(start: Date) {
  return new Date(start.getTime() + 50 * 60 * 1000);
}

function createFiltersForm(filters: SlotFilters) {
  return {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    timezone: filters.timezone,
    status: filters.status ?? "",
    limit: String(filters.limit),
  };
}

export function AppointmentSlotsPanel({
  filters,
  slots,
  onCancel,
  onCreate,
  onFiltersChange,
  onGenerate,
}: Props) {
  const initialManualStart = defaultManualStart();
  const [filterForm, setFilterForm] = useState(() => createFiltersForm(filters));
  const [manualStartsAt, setManualStartsAt] = useState(toLocalDateTimeInputValue(initialManualStart));
  const [manualEndsAt, setManualEndsAt] = useState(toLocalDateTimeInputValue(defaultManualEnd(initialManualStart)));
  const [generateDateFrom, setGenerateDateFrom] = useState(filters.dateFrom);
  const [generateDateTo, setGenerateDateTo] = useState(filters.dateTo);
  const [clearGenerated, setClearGenerated] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFilterForm(createFiltersForm(filters));
    setGenerateDateFrom(filters.dateFrom);
    setGenerateDateTo(filters.dateTo);
  }, [filters.dateFrom, filters.dateTo, filters.timezone, filters.status, filters.limit]);

  function resetManualForm() {
    const nextStart = defaultManualStart();
    setManualStartsAt(toLocalDateTimeInputValue(nextStart));
    setManualEndsAt(toLocalDateTimeInputValue(defaultManualEnd(nextStart)));
  }

  function handleFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    onFiltersChange({
      dateFrom: filterForm.dateFrom,
      dateTo: filterForm.dateTo,
      timezone: filterForm.timezone.trim() || "UTC",
      status: filterForm.status || null,
      limit: Math.min(100, Math.max(1, Number(filterForm.limit) || 20)),
    });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await onCreate({
        startsAt: new Date(manualStartsAt).toISOString(),
        endsAt: new Date(manualEndsAt).toISOString(),
      });
      resetManualForm();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось создать ручной слот");
    } finally {
      setPending(false);
    }
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await onGenerate({
        dateFrom: generateDateFrom,
        dateTo: generateDateTo,
        clearOpenGeneratedSlots: clearGenerated,
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось запустить генерацию слотов");
    } finally {
      setPending(false);
    }
  }

  function handleCancel(slotId: string) {
    setPending(true);
    setError(null);

    startTransition(() => {
      void onCancel(slotId)
        .catch((nextError) => {
          setError(nextError instanceof Error ? nextError.message : "Не удалось отменить слот");
        })
        .finally(() => {
          setPending(false);
        });
    });
  }

  return (
    <div className="surface stack">
      <div className="section-head">
        <div>
          <p className="caption">Слоты</p>
          <h3 className="card-title">Ручные и автосгенерированные слоты</h3>
          <p className="section-text">
            Здесь можно отфильтровать ближайшие слоты, создать ручное окно или пересобрать диапазон по weekly rules.
          </p>
        </div>
      </div>

      <form className="stack surface surface-muted" onSubmit={handleFiltersSubmit}>
        <div className="section-head">
          <div>
            <strong>Фильтр списка</strong>
            <p className="section-text">Показаны слоты в таймзоне {filters.timezone}.</p>
          </div>
        </div>

        <div className="form-grid two-columns">
          <label className="field">
            <span className="field-label">Дата от</span>
            <input
              className="field-input"
              onChange={(event) => setFilterForm((current) => ({ ...current, dateFrom: event.target.value }))}
              type="date"
              value={filterForm.dateFrom}
            />
          </label>

          <label className="field">
            <span className="field-label">Дата до</span>
            <input
              className="field-input"
              onChange={(event) => setFilterForm((current) => ({ ...current, dateTo: event.target.value }))}
              type="date"
              value={filterForm.dateTo}
            />
          </label>
        </div>

        <div className="form-grid two-columns">
          <label className="field">
            <span className="field-label">Таймзона вывода</span>
            <input
              className="field-input"
              onChange={(event) => setFilterForm((current) => ({ ...current, timezone: event.target.value }))}
              value={filterForm.timezone}
            />
          </label>

          <label className="field">
            <span className="field-label">Статус</span>
            <select
              className="field-select"
              onChange={(event) => setFilterForm((current) => ({ ...current, status: event.target.value }))}
              value={filterForm.status}
            >
              <option value="">все статусы</option>
              <option value="open">свободные</option>
              <option value="held">в резерве</option>
              <option value="booked">забронированные</option>
              <option value="blocked">заблокированные</option>
              <option value="cancelled">отменённые</option>
            </select>
          </label>
        </div>

        <div className="inline-actions">
          <label className="field field-inline">
            <span className="field-label">Лимит</span>
            <input
              className="field-input field-input-small"
              max={100}
              min={1}
              onChange={(event) => setFilterForm((current) => ({ ...current, limit: event.target.value }))}
              type="number"
              value={filterForm.limit}
            />
          </label>
          <button className="button button-secondary" type="submit">
            Применить фильтр
          </button>
        </div>
      </form>

      <div className="grid-halves">
        <form className="stack surface surface-muted" onSubmit={handleCreate}>
          <div>
            <strong>Создать ручной слот</strong>
            <p className="section-text">Подходит для разовых окон, которые не стоит описывать weekly rule.</p>
          </div>

          <label className="field">
            <span className="field-label">Начало слота</span>
            <input
              className="field-input"
              disabled={pending}
              onChange={(event) => setManualStartsAt(event.target.value)}
              required
              type="datetime-local"
              value={manualStartsAt}
            />
          </label>

          <label className="field">
            <span className="field-label">Окончание слота</span>
            <input
              className="field-input"
              disabled={pending}
              onChange={(event) => setManualEndsAt(event.target.value)}
              required
              type="datetime-local"
              value={manualEndsAt}
            />
          </label>

          <button className="button button-primary" disabled={pending} type="submit">
            Создать слот вручную
          </button>
        </form>

        <form className="stack surface surface-muted" onSubmit={handleGenerate}>
          <div>
            <strong>Пересобрать диапазон</strong>
            <p className="section-text">
              Генерация использует только активные weekly rules и уважает blackout-периоды.
            </p>
          </div>

          <label className="field">
            <span className="field-label">Дата от</span>
            <input
              className="field-input"
              disabled={pending}
              onChange={(event) => setGenerateDateFrom(event.target.value)}
              required
              type="date"
              value={generateDateFrom}
            />
          </label>

          <label className="field">
            <span className="field-label">Дата до</span>
            <input
              className="field-input"
              disabled={pending}
              onChange={(event) => setGenerateDateTo(event.target.value)}
              required
              type="date"
              value={generateDateTo}
            />
          </label>

          <label className="checkbox-row">
            <input
              checked={clearGenerated}
              disabled={pending}
              onChange={(event) => setClearGenerated(event.target.checked)}
              type="checkbox"
            />
            <span>Сначала отменить открытые автосгенерированные слоты в этом диапазоне</span>
          </label>

          <button className="button button-secondary" disabled={pending} type="submit">
            Запустить генерацию
          </button>
        </form>
      </div>

      {error ? <div className="notice notice-error">{error}</div> : null}

      {slots.length === 0 ? (
        <div className="surface surface-muted">
          <p className="section-text">В выбранном диапазоне слотов пока нет.</p>
        </div>
      ) : (
        <div className="stack compact-stack">
          {slots.map((slot) => {
            const canCancel = slot.status !== "booked" && slot.status !== "held" && slot.status !== "cancelled";

            return (
              <div className="surface surface-muted" key={slot.id}>
                <div className="section-head">
                  <div>
                    <strong>{formatDateRange(slot.startsAtLocal, slot.endsAtLocal)}</strong>
                    <p className="section-text">
                      Источник: {humanizeCode(slot.source)} • таймзона вывода {slot.timezone}
                    </p>
                  </div>
                  <span className={`status-badge status-${slot.status}`}>{humanizeCode(slot.status)}</span>
                </div>

                <div className="meta-row">
                  <span>создано: {formatCompactDateTime(slot.createdAt)}</span>
                  <span>{slot.lockedUntil ? `locked until: ${formatCompactDateTime(slot.lockedUntil)}` : "без удержания"}</span>
                </div>

                {canCancel ? (
                  <div className="inline-actions">
                    <button
                      className="button button-ghost button-small"
                      disabled={pending}
                      onClick={() => handleCancel(slot.id)}
                      type="button"
                    >
                      Отменить слот
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
