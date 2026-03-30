"use client";

import Link from "next/link";
import { formatCompactDateTime, formatMoney, humanizeCode } from "@/lib/format";
import type { ClientSessionPackageRecord } from "@/lib/types";

type ClientSessionPackagesPanelProps = {
  items: ClientSessionPackageRecord[];
};

export function ClientSessionPackagesPanel({ items }: ClientSessionPackagesPanelProps) {
  return (
    <div className="surface stack">
      <div>
        <p className="caption">Пакеты сессий</p>
        <h2 className="section-title">Мои активные пакеты</h2>
      </div>

      {items.length === 0 ? (
        <p className="section-text">
          Активных пакетов пока нет. Их можно купить на странице выбранного психолога и использовать при бронировании.
        </p>
      ) : (
        <div className="stack compact-stack">
          {items.map((item) => (
            <article className="surface surface-muted" key={item.id}>
              <div className="meta-row">
                <strong>{item.title}</strong>
                <span className={`status-badge status-${item.status}`}>{humanizeCode(item.status)}</span>
              </div>
              <div className="meta-row">
                <span>
                  Осталось {item.remainingSessions} из {item.totalSessions}
                </span>
                <span>{formatMoney(item.priceAmount, item.currency)}</span>
              </div>
              <div className="meta-row">
                <span>Куплен: {formatCompactDateTime(item.purchasedAt)}</span>
                <span>Скидка: {item.discountPercent}%</span>
              </div>
              {item.psychologist.slug ? (
                <Link className="muted-link" href={`/psychologists/${item.psychologist.slug}`}>
                  перейти к профилю психолога
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
