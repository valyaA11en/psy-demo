"use client";

import type { MoodEntriesSummary, MoodEntryRecord } from "@/lib/types";

type MoodChartProps = {
  entries: MoodEntryRecord[];
  summary: MoodEntriesSummary;
  title: string;
  emptyText: string;
};

const chartDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
});

function formatChartDate(value: string) {
  return chartDateFormatter.format(new Date(`${value}T12:00:00.000Z`));
}

export function MoodChart({ entries, summary, title, emptyText }: MoodChartProps) {
  if (entries.length === 0) {
    return (
      <div className="surface surface-muted">
        <p className="caption">{title}</p>
        <p className="section-text">{emptyText}</p>
      </div>
    );
  }

  const width = Math.max(entries.length * 56, 320);
  const height = 180;
  const maxScore = 10;

  return (
    <div className="surface surface-muted stack">
      <div className="section-head">
        <div>
          <p className="caption">{title}</p>
          <h3 className="card-title">Динамика самочувствия</h3>
        </div>
        <div className="meta-row">
          <span>дней: {summary.daysTracked}</span>
          <span>среднее: {summary.averageScore ?? "—"}</span>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg
          aria-label={title}
          height={height}
          role="img"
          style={{ display: "block", minWidth: width }}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
        >
          {entries.map((entry, index) => {
            const x = 32 + index * 56;
            const barHeight = (entry.moodScore / maxScore) * 108;
            const y = 134 - barHeight;

            return (
              <g key={entry.id}>
                <line
                  stroke="rgba(60, 86, 136, 0.16)"
                  x1={x + 14}
                  x2={x + 14}
                  y1={26}
                  y2={138}
                />
                <rect
                  fill="url(#moodGradient)"
                  height={barHeight}
                  rx="12"
                  ry="12"
                  width="28"
                  x={x}
                  y={y}
                />
                <text
                  fill="var(--accent-strong)"
                  fontSize="12"
                  fontWeight="700"
                  textAnchor="middle"
                  x={x + 14}
                  y={y - 8}
                >
                  {entry.moodScore}
                </text>
                <text
                  fill="var(--text-soft)"
                  fontSize="11"
                  textAnchor="middle"
                  x={x + 14}
                  y={156}
                >
                  {formatChartDate(entry.recordedForDate)}
                </text>
              </g>
            );
          })}
          <defs>
            <linearGradient id="moodGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#4f7cff" />
              <stop offset="100%" stopColor="#6ea794" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
