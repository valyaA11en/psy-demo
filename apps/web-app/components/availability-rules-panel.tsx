"use client";

import { startTransition, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { formatCompactDateTime, humanizeCode } from "@/lib/format";
import type { AvailabilityRule } from "@/lib/types";

type RulePayload = {
  weekday: string;
  startTime: string;
  endTime: string;
  slotDurationMin: number;
  bufferMin: number;
  timezone: string;
  isActive?: boolean;
};

type RuleFormState = {
  weekday: string;
  startTime: string;
  endTime: string;
  slotDurationMin: string;
  bufferMin: string;
  timezone: string;
  isActive: boolean;
};

type Props = {
  rules: AvailabilityRule[];
  onCreate: (input: RulePayload) => Promise<void>;
  onDelete: (ruleId: string) => Promise<void>;
  onUpdate: (ruleId: string, input: Partial<RulePayload>) => Promise<void>;
};

const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function resolveBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function createInitialFormState(): RuleFormState {
  return {
    weekday: "monday",
    startTime: "09:00",
    endTime: "13:00",
    slotDurationMin: "50",
    bufferMin: "10",
    timezone: resolveBrowserTimezone(),
    isActive: true,
  };
}

function toFormState(rule: AvailabilityRule): RuleFormState {
  return {
    weekday: rule.weekday,
    startTime: rule.startTime,
    endTime: rule.endTime,
    slotDurationMin: String(rule.slotDurationMin),
    bufferMin: String(rule.bufferMin),
    timezone: rule.timezone,
    isActive: rule.isActive,
  };
}

function toPayload(form: RuleFormState): RulePayload {
  return {
    weekday: form.weekday,
    startTime: form.startTime,
    endTime: form.endTime,
    slotDurationMin: Number(form.slotDurationMin),
    bufferMin: Number(form.bufferMin),
    timezone: form.timezone.trim() || "UTC",
    isActive: form.isActive,
  };
}

export function AvailabilityRulesPanel({ rules, onCreate, onDelete, onUpdate }: Props) {
  const [createForm, setCreateForm] = useState<RuleFormState>(() => createInitialFormState());
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RuleFormState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sortedRules = useMemo(() => rules, [rules]);

  function updateCreateForm<K extends keyof RuleFormState>(field: K, value: RuleFormState[K]) {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateEditForm<K extends keyof RuleFormState>(field: K, value: RuleFormState[K]) {
    setEditForm((current) =>
      current
        ? {
            ...current,
            [field]: value,
          }
        : current,
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await onCreate(toPayload(createForm));
      setCreateForm(createInitialFormState());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось создать правило доступности");
    } finally {
      setPending(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRuleId || !editForm) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      await onUpdate(editingRuleId, toPayload(editForm));
      setEditingRuleId(null);
      setEditForm(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось обновить правило доступности");
    } finally {
      setPending(false);
    }
  }

  function startEditing(rule: AvailabilityRule) {
    setEditingRuleId(rule.id);
    setEditForm(toFormState(rule));
    setError(null);
  }

  function cancelEditing() {
    setEditingRuleId(null);
    setEditForm(null);
    setError(null);
  }

  function handleToggle(rule: AvailabilityRule) {
    setPending(true);
    setError(null);

    startTransition(() => {
      void onUpdate(rule.id, { isActive: !rule.isActive })
        .catch((nextError) => {
          setError(nextError instanceof Error ? nextError.message : "Не удалось изменить статус правила");
        })
        .finally(() => {
          setPending(false);
        });
    });
  }

  function handleDelete(ruleId: string) {
    setPending(true);
    setError(null);

    startTransition(() => {
      void onDelete(ruleId)
        .catch((nextError) => {
          setError(nextError instanceof Error ? nextError.message : "Не удалось удалить правило доступности");
        })
        .finally(() => {
          setPending(false);
        });
    });
  }

  function handleCheckboxChange(
    setter: <K extends keyof RuleFormState>(field: K, value: RuleFormState[K]) => void,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    setter("isActive", event.target.checked);
  }

  return (
    <div className="surface stack">
      <div className="section-head">
        <div>
          <p className="caption">Расписание</p>
          <h3 className="card-title">Недельные правила</h3>
          <p className="section-text">
            Правила определяют стандартные рабочие окна психолога. Изменение активного правила запускает пересборку
            автосгенерированных слотов.
          </p>
        </div>
      </div>

      <form className="stack" onSubmit={handleCreate}>
        <div className="form-grid two-columns">
          <label className="field">
            <span className="field-label">День недели</span>
            <select
              className="field-select"
              disabled={pending}
              onChange={(event) => updateCreateForm("weekday", event.target.value)}
              value={createForm.weekday}
            >
              {weekdays.map((weekday) => (
                <option key={weekday} value={weekday}>
                  {humanizeCode(weekday)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Таймзона правила</span>
            <input
              className="field-input"
              disabled={pending}
              onChange={(event) => updateCreateForm("timezone", event.target.value)}
              placeholder="Asia/Yekaterinburg"
              required
              value={createForm.timezone}
            />
          </label>
        </div>

        <div className="form-grid two-columns">
          <label className="field">
            <span className="field-label">Начало окна</span>
            <input
              className="field-input"
              disabled={pending}
              onChange={(event) => updateCreateForm("startTime", event.target.value)}
              required
              type="time"
              value={createForm.startTime}
            />
          </label>

          <label className="field">
            <span className="field-label">Окончание окна</span>
            <input
              className="field-input"
              disabled={pending}
              onChange={(event) => updateCreateForm("endTime", event.target.value)}
              required
              type="time"
              value={createForm.endTime}
            />
          </label>
        </div>

        <div className="form-grid two-columns">
          <label className="field">
            <span className="field-label">Длительность слота, мин</span>
            <input
              className="field-input"
              disabled={pending}
              max={180}
              min={20}
              onChange={(event) => updateCreateForm("slotDurationMin", event.target.value)}
              required
              type="number"
              value={createForm.slotDurationMin}
            />
          </label>

          <label className="field">
            <span className="field-label">Буфер, мин</span>
            <input
              className="field-input"
              disabled={pending}
              max={120}
              min={0}
              onChange={(event) => updateCreateForm("bufferMin", event.target.value)}
              required
              type="number"
              value={createForm.bufferMin}
            />
          </label>
        </div>

        <label className="checkbox-row">
          <input
            checked={createForm.isActive}
            disabled={pending}
            onChange={(event) => handleCheckboxChange(updateCreateForm, event)}
            type="checkbox"
          />
          <span>Сразу включить правило и использовать его для генерации слотов</span>
        </label>

        {error ? <div className="notice notice-error">{error}</div> : null}

        <div className="inline-actions">
          <button className="button button-primary" disabled={pending} type="submit">
            Добавить правило
          </button>
          <span className="section-text">Для MVP достаточно 1-2 правил на рабочие дни и отдельного окна на выходные.</span>
        </div>
      </form>

      {sortedRules.length === 0 ? (
        <div className="surface surface-muted">
          <p className="section-text">
            Правила пока не настроены. Без активных правил воркер не сможет автоматически строить будущие слоты.
          </p>
        </div>
      ) : (
        <div className="stack compact-stack">
          {sortedRules.map((rule) => (
            <div className="surface surface-muted stack compact-stack" key={rule.id}>
              <div className="section-head">
                <div>
                  <strong>
                    {humanizeCode(rule.weekday)} • {rule.startTime} - {rule.endTime}
                  </strong>
                  <p className="section-text">
                    Слот {rule.slotDurationMin} мин, буфер {rule.bufferMin} мин, таймзона {rule.timezone}
                  </p>
                </div>
                <span className={`status-badge status-${rule.isActive ? "open" : "cancelled"}`}>
                  {rule.isActive ? "активно" : "отключено"}
                </span>
              </div>

              <div className="meta-row">
                <span>создано: {formatCompactDateTime(rule.createdAt)}</span>
                <span>обновлено: {formatCompactDateTime(rule.updatedAt)}</span>
              </div>

              <div className="inline-actions">
                <button
                  className="button button-secondary button-small"
                  disabled={pending}
                  onClick={() => startEditing(rule)}
                  type="button"
                >
                  Редактировать
                </button>
                <button
                  className="button button-ghost button-small"
                  disabled={pending}
                  onClick={() => handleToggle(rule)}
                  type="button"
                >
                  {rule.isActive ? "Отключить" : "Активировать"}
                </button>
                <button
                  className="button button-ghost button-small"
                  disabled={pending}
                  onClick={() => handleDelete(rule.id)}
                  type="button"
                >
                  Удалить
                </button>
              </div>

              {editingRuleId === rule.id && editForm ? (
                <form className="stack surface" onSubmit={handleUpdate}>
                  <div className="form-grid two-columns">
                    <label className="field">
                      <span className="field-label">День недели</span>
                      <select
                        className="field-select"
                        disabled={pending}
                        onChange={(event) => updateEditForm("weekday", event.target.value)}
                        value={editForm.weekday}
                      >
                        {weekdays.map((weekday) => (
                          <option key={weekday} value={weekday}>
                            {humanizeCode(weekday)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      <span className="field-label">Таймзона</span>
                      <input
                        className="field-input"
                        disabled={pending}
                        onChange={(event) => updateEditForm("timezone", event.target.value)}
                        required
                        value={editForm.timezone}
                      />
                    </label>
                  </div>

                  <div className="form-grid two-columns">
                    <label className="field">
                      <span className="field-label">Начало</span>
                      <input
                        className="field-input"
                        disabled={pending}
                        onChange={(event) => updateEditForm("startTime", event.target.value)}
                        required
                        type="time"
                        value={editForm.startTime}
                      />
                    </label>

                    <label className="field">
                      <span className="field-label">Окончание</span>
                      <input
                        className="field-input"
                        disabled={pending}
                        onChange={(event) => updateEditForm("endTime", event.target.value)}
                        required
                        type="time"
                        value={editForm.endTime}
                      />
                    </label>
                  </div>

                  <div className="form-grid two-columns">
                    <label className="field">
                      <span className="field-label">Длительность слота, мин</span>
                      <input
                        className="field-input"
                        disabled={pending}
                        max={180}
                        min={20}
                        onChange={(event) => updateEditForm("slotDurationMin", event.target.value)}
                        required
                        type="number"
                        value={editForm.slotDurationMin}
                      />
                    </label>

                    <label className="field">
                      <span className="field-label">Буфер, мин</span>
                      <input
                        className="field-input"
                        disabled={pending}
                        max={120}
                        min={0}
                        onChange={(event) => updateEditForm("bufferMin", event.target.value)}
                        required
                        type="number"
                        value={editForm.bufferMin}
                      />
                    </label>
                  </div>

                  <label className="checkbox-row">
                    <input
                      checked={editForm.isActive}
                      disabled={pending}
                      onChange={(event) => handleCheckboxChange(updateEditForm, event)}
                      type="checkbox"
                    />
                    <span>Правило активно</span>
                  </label>

                  <div className="inline-actions">
                    <button className="button button-primary button-small" disabled={pending} type="submit">
                      Сохранить изменения
                    </button>
                    <button className="button button-ghost button-small" disabled={pending} onClick={cancelEditing} type="button">
                      Отмена
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
