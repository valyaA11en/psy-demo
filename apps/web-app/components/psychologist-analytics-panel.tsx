"use client";

import { formatMoney } from "@/lib/format";
import type { PsychologistAnalyticsResponse } from "@/lib/types";

type PsychologistAnalyticsPanelProps = {
  analytics: PsychologistAnalyticsResponse | null;
};

export function PsychologistAnalyticsPanel({ analytics }: PsychologistAnalyticsPanelProps) {
  if (!analytics) {
    return null;
  }

  return (
    <div className="surface stack">
      <div className="section-head">
        <div>
          <p className="caption">Аналитика</p>
          <h3 className="card-title">Дашборд психолога</h3>
          <p className="section-text">
            Сводка за последние {analytics.period.months} мес. без раскрытия лишних персональных данных клиентов.
          </p>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card">
          <span className="caption">завершено</span>
          <strong>{analytics.summary.completedSessions}</strong>
        </div>
        <div className="summary-card">
          <span className="caption">выручка</span>
          <strong>{formatMoney(analytics.summary.grossRevenue, analytics.summary.revenueCurrency)}</strong>
        </div>
        <div className="summary-card">
          <span className="caption">активные клиенты</span>
          <strong>{analytics.summary.uniqueClients}</strong>
        </div>
        <div className="summary-card">
          <span className="caption">рейтинг</span>
          <strong>
            {analytics.summary.averageRating.toFixed(1)} / 5
          </strong>
        </div>
      </div>

      <div className="surface surface-muted">
        <div className="meta-row">
          <strong>Вовлечённость</strong>
          <span>{analytics.psychologist.fullName}</span>
        </div>
        <ul className="list-block">
          <li>клиенты с записями настроения за 30 дней: {analytics.engagement.clientsWithMoodEntriesLast30Days}</li>
          <li>активные клиенты за 90 дней: {analytics.engagement.activeClientsLast90Days}</li>
          <li>непрочитанные сообщения: {analytics.engagement.unreadMessagesCount}</li>
          <li>активные домашние задания: {analytics.engagement.activeHomeworkTasks}</li>
          <li>просроченные задания: {analytics.engagement.overdueHomeworkTasks}</li>
        </ul>
      </div>

      <div className="surface surface-muted">
        <div className="meta-row">
          <strong>Домашние задания и отзывы</strong>
          <span>
            {analytics.summary.periodReviewCount} отзывов за период
          </span>
        </div>
        <ul className="list-block">
          <li>назначено заданий: {analytics.summary.homeworkAssigned}</li>
          <li>выполнено заданий: {analytics.summary.homeworkCompleted}</li>
          <li>доля выполнения: {analytics.summary.homeworkCompletionRate.toFixed(1)}%</li>
          <li>
            средняя оценка за период:{" "}
            {analytics.summary.periodAverageRating !== null ? `${analytics.summary.periodAverageRating.toFixed(1)} / 5` : "пока нет"}
          </li>
        </ul>
      </div>

      <div className="stack compact-stack">
        <div className="meta-row">
          <strong>Динамика по месяцам</strong>
          <span>{analytics.monthly.length} точек</span>
        </div>
        {analytics.monthly.map((item) => (
          <div className="surface surface-muted" key={item.monthKey}>
            <div className="meta-row">
              <strong>{item.label}</strong>
              <span>{formatMoney(item.grossRevenue, item.currency)}</span>
            </div>
            <div className="meta-grid">
              <div className="meta-card">
                <span className="caption">завершено</span>
                <strong>{item.completedSessions}</strong>
              </div>
              <div className="meta-card">
                <span className="caption">запланировано</span>
                <strong>{item.scheduledSessions}</strong>
              </div>
              <div className="meta-card">
                <span className="caption">отменено</span>
                <strong>{item.cancelledSessions}</strong>
              </div>
              <div className="meta-card">
                <span className="caption">платежей</span>
                <strong>{item.grossRevenue > 0 ? "есть" : "нет"}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>

      {analytics.psychologist.specializations.length > 0 ? (
        <div className="tag-row" style={{ flexWrap: "wrap" }}>
          {analytics.psychologist.specializations.map((item) => (
            <span className="tag" key={item.id}>
              {item.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
