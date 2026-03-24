import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page empty-state">
      <p className="caption">404</p>
      <h1 className="section-title">Запрошенная страница не найдена.</h1>
      <p className="section-text">
        Публичный каталог, кабинет и страницы сессий доступны из основного меню.
      </p>
      <div className="inline-actions">
        <Link className="button button-primary" href="/">
          вернуться в каталог
        </Link>
        <Link className="button button-ghost" href="/dashboard">
          открыть кабинет
        </Link>
      </div>
    </section>
  );
}
