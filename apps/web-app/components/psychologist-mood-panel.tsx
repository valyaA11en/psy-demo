"use client";

import { MoodChart } from "@/components/mood-chart";
import type { MoodEntriesResponse, MoodEntriesSummary, MoodEntryRecord } from "@/lib/types";

type MoodClientOption = {
  userId: string;
  displayName: string;
};

type PsychologistMoodPanelProps = {
  client: MoodEntriesResponse["client"];
  clients: MoodClientOption[];
  entries: MoodEntryRecord[];
  selectedClientUserId: string | null;
  summary: MoodEntriesSummary;
  onSelectClientUserId: (value: string) => void;
};

const noteDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "long",
});

function formatNoteDate(value: string) {
  return noteDateFormatter.format(new Date(`${value}T12:00:00.000Z`));
}

export function PsychologistMoodPanel({
  client,
  clients,
  entries,
  selectedClientUserId,
  summary,
  onSelectClientUserId,
}: PsychologistMoodPanelProps) {
  if (clients.length === 0) {
    return (
      <div className="surface">
        <p className="caption">Контекст клиента</p>
        <h3 className="card-title">Дневник самочувствия</h3>
        <p className="section-text">
          Как только у вас появятся клиенты с консультациями, здесь будет видна динамика их состояния между сессиями.
        </p>
      </div>
    );
  }

  return (
    <div className="surface stack">
      <div className="section-head">
        <div>
          <p className="caption">Контекст клиента</p>
          <h3 className="card-title">Дневник самочувствия</h3>
          <p className="section-text">
            Только для клиентов, с которыми у вас уже есть консультации.
          </p>
        </div>
      </div>

      <label className="field">
        <span className="field-label">Клиент</span>
        <select
          className="field-select"
          onChange={(event) => onSelectClientUserId(event.target.value)}
          value={selectedClientUserId ?? ""}
        >
          {clients.map((item) => (
            <option key={item.userId} value={item.userId}>
              {item.displayName}
            </option>
          ))}
        </select>
      </label>

      <MoodChart
        emptyText="У выбранного клиента пока нет записей настроения."
        entries={entries}
        summary={summary}
        title={client ? `Последние записи: ${client.displayName}` : "Последние записи клиента"}
      />

      <div className="surface surface-muted">
        <div className="meta-row">
          <strong>{client?.displayName ?? "Клиент"}</strong>
          <span>часовой пояс: {client?.timezone ?? "не указан"}</span>
        </div>

        {entries.length === 0 ? (
          <p className="section-text">Пока нечего обсуждать между сессиями: клиент еще не вел дневник.</p>
        ) : (
          <div className="stack compact-stack">
            {entries
              .filter((entry) => entry.note || entry.emotions.length > 0)
              .slice()
              .reverse()
              .map((entry) => (
                <div className="surface" key={entry.id}>
                  <div className="meta-row">
                    <strong>{formatNoteDate(entry.recordedForDate)}</strong>
                    <span>самочувствие: {entry.moodScore}/10</span>
                  </div>
                  {entry.emotions.length > 0 ? (
                    <div className="tag-row" style={{ flexWrap: "wrap", marginTop: 12 }}>
                      {entry.emotions.map((emotion) => (
                        <span className="tag" key={`${entry.id}:${emotion}`}>
                          {emotion}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {entry.note ? <p className="section-text" style={{ marginTop: 12 }}>{entry.note}</p> : null}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
