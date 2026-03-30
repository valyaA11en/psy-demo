import { getCrisisSupportResources, type CrisisSupportResource } from "@/lib/crisis-support";

type CrisisSupportPanelProps = {
  matchedMarkers: string[];
  sourceLabel: string;
  onDismiss: () => void;
};

function CrisisSupportResourceCard({ resource }: { resource: CrisisSupportResource }) {
  return (
    <div className="crisis-support-card">
      <div className="stack compact-stack">
        <div className="meta-row">
          <strong>{resource.title}</strong>
          {resource.availability ? <span>{resource.availability}</span> : null}
        </div>
        <p className="section-text">{resource.description}</p>
        {resource.href ? (
          <a
            className="button button-secondary button-small"
            href={resource.href}
            rel={resource.href.startsWith("http") ? "noreferrer noopener" : undefined}
            target={resource.href.startsWith("http") ? "_blank" : undefined}
          >
            {resource.actionLabel ?? "Открыть"}
          </a>
        ) : resource.actionLabel ? (
          <span className="caption">{resource.actionLabel}</span>
        ) : null}
      </div>
    </div>
  );
}

export function CrisisSupportPanel({ matchedMarkers, sourceLabel, onDismiss }: CrisisSupportPanelProps) {
  const resources = getCrisisSupportResources();

  return (
    <div className="surface crisis-support-panel stack">
      <div className="section-head">
        <div>
          <p className="caption">Кризисная поддержка</p>
          <h3 className="card-title">Если вам сейчас небезопасно или очень тяжело</h3>
          <p className="section-text">
            Этот блок показан прямо в {sourceLabel}. Он не заменяет экстренную помощь и не создаёт отдельную
            серверную отметку о кризисе.
          </p>
        </div>
        <button className="button button-ghost button-small" onClick={onDismiss} type="button">
          скрыть
        </button>
      </div>

      {matchedMarkers.length > 0 ? (
        <div className="notice notice-error">
          <strong>Похоже, в тексте есть маркеры риска.</strong>{" "}
          <span>Панель показана локально на вашем устройстве, без отдельной записи этого сигнала в базу данных.</span>
        </div>
      ) : null}

      <div className="inline-actions" style={{ flexWrap: "wrap" }}>
        {matchedMarkers.map((marker) => (
          <span className="tag tag-soft" key={marker}>
            {marker}
          </span>
        ))}
      </div>

      <div className="crisis-support-grid">
        {resources.map((resource) => (
          <CrisisSupportResourceCard key={resource.id} resource={resource} />
        ))}
      </div>

      <div className="surface surface-muted">
        <p className="section-text">
          Если есть риск причинить вред себе или кому-то ещё, не ждите ответа в чате и не откладывайте обращение за
          срочной помощью.
        </p>
      </div>
    </div>
  );
}
