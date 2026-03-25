"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { humanizeCode } from "@/lib/format";
import type { PsychologistWorkspaceProfile, Specialization } from "@/lib/types";

type SaveInput = {
  publicSlug: string;
  firstName: string;
  lastName: string;
  publicTitle: string;
  bio: string;
  experienceYears: number;
  priceFrom: number;
  priceTo: number;
  languages: string[];
  formats: string[];
  specializationIds: string[];
};

type Props = {
  profile: PsychologistWorkspaceProfile | null;
  specializations: Specialization[];
  onSave: (input: SaveInput) => Promise<void>;
};

type FormState = {
  publicSlug: string;
  firstName: string;
  lastName: string;
  publicTitle: string;
  bio: string;
  experienceYears: string;
  priceFrom: string;
  priceTo: string;
  languages: string;
  formats: string[];
  specializationIds: string[];
};

const availableFormats = ["online", "chat", "phone"] as const;

function toFormState(profile: PsychologistWorkspaceProfile | null): FormState {
  return {
    publicSlug: profile?.publicSlug ?? "",
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    publicTitle: profile?.publicTitle ?? "",
    bio: profile?.bio ?? "",
    experienceYears: String(profile?.experienceYears ?? 0),
    priceFrom: String(profile?.priceFrom ?? 0),
    priceTo: String(profile?.priceTo ?? 0),
    languages: (profile?.languages ?? []).join(", "),
    formats: profile?.formats ?? ["online"],
    specializationIds: profile?.specializations.map((item) => item.id) ?? [],
  };
}

function parseListInput(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

export function PsychologistProfilePanel({ profile, specializations, onSave }: Props) {
  const [form, setForm] = useState<FormState>(() => toFormState(profile));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setForm(toFormState(profile));
  }, [profile]);

  const specializationSet = useMemo(() => new Set(form.specializationIds), [form.specializationIds]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleFormat(format: (typeof availableFormats)[number]) {
    setForm((current) => {
      const nextFormats = current.formats.includes(format)
        ? current.formats.filter((item) => item !== format)
        : [...current.formats, format];

      return {
        ...current,
        formats: nextFormats,
      };
    });
  }

  function toggleSpecialization(specializationId: string) {
    setForm((current) => {
      const nextSpecializationIds = current.specializationIds.includes(specializationId)
        ? current.specializationIds.filter((item) => item !== specializationId)
        : [...current.specializationIds, specializationId];

      return {
        ...current,
        specializationIds: nextSpecializationIds,
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    try {
      const specializationIds = [...new Set(form.specializationIds)];
      if (specializationIds.length === 0) {
        throw new Error("Выберите хотя бы одну специализацию");
      }

      const formats = [...new Set(form.formats)];
      if (formats.length === 0) {
        throw new Error("Укажите хотя бы один формат консультации");
      }

      await onSave({
        publicSlug: form.publicSlug.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        publicTitle: form.publicTitle.trim(),
        bio: form.bio.trim(),
        experienceYears: Number(form.experienceYears || "0"),
        priceFrom: Number(form.priceFrom || "0"),
        priceTo: Number(form.priceTo || "0"),
        languages: parseListInput(form.languages),
        formats,
        specializationIds,
      });

      setSuccess("Профиль обновлен. Изменения, влияющие на публичную карточку, могут отправить профиль на повторную модерацию.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось обновить профиль");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="surface stack">
      <div className="section-head">
        <div>
          <p className="caption">Профиль психолога</p>
          <h3 className="card-title">Публичная карточка и настройки каталога</h3>
          <p className="section-text">
            Здесь редактируются данные, которые клиент увидит в каталоге и карточке специалиста. Личные документы остаются в отдельном блоке файлов.
          </p>
        </div>
        {profile ? (
          <span className={`status-badge status-${profile.approvalStatus}`}>{humanizeCode(profile.approvalStatus)}</span>
        ) : null}
      </div>

      {!profile ? (
        <div className="surface surface-muted">
          <p className="section-text">Профиль психолога пока не загружен.</p>
        </div>
      ) : (
        <form className="stack" onSubmit={handleSubmit}>
          <div className="form-grid two-columns">
            <label className="field">
              <span className="field-label">Публичный slug</span>
              <input
                className="field-input"
                disabled={pending}
                onChange={(event) => updateField("publicSlug", event.target.value)}
                pattern="[a-z0-9-]{4,64}"
                required
                value={form.publicSlug}
              />
            </label>

            <label className="field">
              <span className="field-label">Публичный титул</span>
              <input
                className="field-input"
                disabled={pending}
                onChange={(event) => updateField("publicTitle", event.target.value)}
                placeholder="Психолог, КПТ"
                required
                value={form.publicTitle}
              />
            </label>
          </div>

          <div className="form-grid two-columns">
            <label className="field">
              <span className="field-label">Имя</span>
              <input
                className="field-input"
                disabled={pending}
                onChange={(event) => updateField("firstName", event.target.value)}
                required
                value={form.firstName}
              />
            </label>

            <label className="field">
              <span className="field-label">Фамилия</span>
              <input
                className="field-input"
                disabled={pending}
                onChange={(event) => updateField("lastName", event.target.value)}
                required
                value={form.lastName}
              />
            </label>
          </div>

          <div className="form-grid two-columns">
            <label className="field">
              <span className="field-label">Опыт, лет</span>
              <input
                className="field-input"
                disabled={pending}
                min={0}
                onChange={(event) => updateField("experienceYears", event.target.value)}
                required
                type="number"
                value={form.experienceYears}
              />
            </label>

            <label className="field">
              <span className="field-label">Языки через запятую</span>
              <input
                className="field-input"
                disabled={pending}
                onChange={(event) => updateField("languages", event.target.value)}
                placeholder="ru, en"
                value={form.languages}
              />
            </label>
          </div>

          <div className="form-grid two-columns">
            <label className="field">
              <span className="field-label">Цена от, RUB</span>
              <input
                className="field-input"
                disabled={pending}
                min={0}
                onChange={(event) => updateField("priceFrom", event.target.value)}
                required
                type="number"
                value={form.priceFrom}
              />
            </label>

            <label className="field">
              <span className="field-label">Цена до, RUB</span>
              <input
                className="field-input"
                disabled={pending}
                min={0}
                onChange={(event) => updateField("priceTo", event.target.value)}
                required
                type="number"
                value={form.priceTo}
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Описание подхода</span>
            <textarea
              className="field-textarea"
              disabled={pending}
              onChange={(event) => updateField("bio", event.target.value)}
              placeholder="Кратко опишите, с какими запросами работаете и как обычно строится консультация."
              required
              value={form.bio}
            />
          </label>

          <div className="grid-halves">
            <div className="surface surface-muted stack compact-stack">
              <strong>Форматы консультаций</strong>
              {availableFormats.map((format) => (
                <label className="checkbox-row" key={format}>
                  <input
                    checked={form.formats.includes(format)}
                    disabled={pending}
                    onChange={() => toggleFormat(format)}
                    type="checkbox"
                  />
                  <span>{humanizeCode(format)}</span>
                </label>
              ))}
            </div>

            <div className="surface surface-muted stack compact-stack">
              <strong>Специализации</strong>
              {specializations.length === 0 ? (
                <p className="section-text">Справочник специализаций пока не загружен.</p>
              ) : (
                specializations.map((specialization) => (
                  <label className="checkbox-row" key={specialization.id}>
                    <input
                      checked={specializationSet.has(specialization.id)}
                      disabled={pending}
                      onChange={() => toggleSpecialization(specialization.id)}
                      type="checkbox"
                    />
                    <span>{specialization.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {error ? <div className="notice notice-error">{error}</div> : null}
          {success ? <div className="notice notice-success">{success}</div> : null}

          <div className="inline-actions">
            <button className="button button-primary" disabled={pending} type="submit">
              Сохранить профиль
            </button>
            <span className="section-text">
              Рейтинг и число отзывов обновляются автоматически и не редактируются вручную.
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
