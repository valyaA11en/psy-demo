import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page empty-state">
      <p className="caption">404</p>
      <h1 className="section-title">The requested page was not found.</h1>
      <p className="section-text">
        The public catalog, dashboard and session pages are available from the main navigation.
      </p>
      <div className="inline-actions">
        <Link className="button button-primary" href="/">
          back to catalog
        </Link>
        <Link className="button button-ghost" href="/dashboard">
          open dashboard
        </Link>
      </div>
    </section>
  );
}
