"use client";

import { startTransition, useEffect, useMemo, useState, type FormEvent } from "react";
import { CrisisSupportPanel } from "@/components/crisis-support-panel";
import { MoodChart } from "@/components/mood-chart";
import { detectCrisisSignals } from "@/lib/crisis-support";
import type { MoodEntriesSummary, MoodEntryRecord } from "@/lib/types";

type MoodDiaryPanelProps = {
  entries: MoodEntryRecord[];
  summary: MoodEntriesSummary;
  onSave: (input: {
    recordedForDate: string;
    moodScore: number;
    emotions: string[];
    note?: string;
  }) => Promise<void>;
};

const emotionOptions = [
  "спокойствие",
  "тревога",
  "усталость",
  "надежда",
  "интерес",
  "грусть",
  "раздражение",
  "уверенность",
];

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function MoodDiaryPanel({ entries, summary, onSave }: MoodDiaryPanelProps) {
  const [recordedForDate, setRecordedForDate] = useState(() => toDateInputValue(new Date()));
  const [moodScore, setMoodScore] = useState("7");
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [manualSupportOpen, setManualSupportOpen] = useState(false);
  const [dismissedFingerprint, setDismissedFingerprint] = useState<string | null>(null);

  const crisisSignal = useMemo(() => detectCrisisSignals(note), [note]);
  const showCrisisSupport =
    manualSupportOpen || (crisisSignal.suggested && crisisSignal.fingerprint !== dismissedFingerprint);

  useEffect(() => {
    const existingEntry = entries.find((entry) => entry.recordedForDate === recordedForDate);

    if (!existingEntry) {
      setMoodScore("7");
      setSelectedEmotions([]);
      setNote("");
      setManualSupportOpen(false);
      setDismissedFingerprint(null);
      return;
    }

    setMoodScore(String(existingEntry.moodScore));
    setSelectedEmotions(existingEntry.emotions);
    setNote(existingEntry.note ?? "");
    setManualSupportOpen(false);
    setDismissedFingerprint(null);
  }, [entries, recordedForDate]);

  function toggleEmotion(emotion: string) {
    setSelectedEmotions((current) =>
      current.includes(emotion) ? current.filter((item) => item !== emotion) : [...current, emotion],
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    startTransition(() => {
      void onSave({
        recordedForDate,
        moodScore: Number(moodScore),
        emotions: selectedEmotions,
        note: note.trim() || undefined,
      })
        .then(() => {
          setSuccess("Запись сохранена. При необходимости вы можете обновить её за этот же день.");
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
      <div className="section-head">
        <div>
          <p className="caption">Дневник</p>
          <h2 className="section-title">Самочувствие между сессиями</h2>
          <p className="section-text">
            Одна запись на день. Психолог увидит динамику и заметки только если у вас уже есть консультации.
          </p>
        </div>
      </div>

      <MoodChart
        emptyText="Пока нет записей. Добавьте первую отметку, чтобы видеть динамику по дням."
        entries={entries}
        summary={summary}
        title="Последние записи"
      />

      {showCrisisSupport ? (
        <CrisisSupportPanel
          matchedMarkers={crisisSignal.matchedMarkers}
          onDismiss={() => {
            setManualSupportOpen(false);
            if (crisisSignal.suggested) {
              setDismissedFingerprint(crisisSignal.fingerprint);
            }
          }}
          sourceLabel="дневнике самочувствия"
        />
      ) : null}

      <form className="stack" onSubmit={handleSubmit}>
        <div className="form-grid two-columns">
          <label className="field">
            <span className="field-label">Дата</span>
            <input
              className="field-input"
              disabled={pending}
              max={toDateInputValue(new Date())}
              onChange={(event) => setRecordedForDate(event.target.value)}
              required
              type="date"
              value={recordedForDate}
            />
          </label>

          <label className="field">
            <span className="field-label">Самочувствие от 1 до 10</span>
            <input
              className="field-input"
              disabled={pending}
              max={10}
              min={1}
              onChange={(event) => setMoodScore(event.target.value)}
              required
              type="number"
              value={moodScore}
            />
          </label>
        </div>

        <div className="field">
          <span className="field-label">Эмоции и состояние</span>
          <div className="inline-actions" style={{ flexWrap: "wrap" }}>
            {emotionOptions.map((emotion) => (
              <button
                className={`button ${selectedEmotions.includes(emotion) ? "button-secondary" : "button-ghost"} button-small`}
                disabled={pending}
                key={emotion}
                onClick={() => toggleEmotion(emotion)}
                type="button"
              >
                {emotion}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">Заметка</span>
          <textarea
            className="field-textarea"
            disabled={pending}
            maxLength={1500}
            onChange={(event) => {
              setNote(event.target.value);
              const nextFingerprint = detectCrisisSignals(event.target.value).fingerprint;
              if (dismissedFingerprint && dismissedFingerprint !== nextFingerprint) {
                setDismissedFingerprint(null);
              }
            }}
            placeholder="Что повлияло на состояние сегодня, что помогло, что было сложным."
            rows={4}
            value={note}
          />
        </label>

        {error ? <div className="notice notice-error">{error}</div> : null}
        {success ? <div className="notice notice-success">{success}</div> : null}

        <div className="inline-actions">
          <button className="button button-primary" disabled={pending} type="submit">
            {pending ? "сохраняем..." : "сохранить запись"}
          </button>
          <button
            className="button button-secondary"
            disabled={pending}
            onClick={() => {
              setManualSupportOpen(true);
              setDismissedFingerprint(null);
            }}
            type="button"
          >
            нужна срочная поддержка
          </button>
          <span className="section-text">Запись за выбранную дату обновляется, а не дублируется.</span>
        </div>
      </form>
    </div>
  );
}
