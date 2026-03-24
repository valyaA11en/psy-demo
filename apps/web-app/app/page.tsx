import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getCatalogPsychologists, getSpecializations } from "@/lib/server-api";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function pickValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const q = pickValue(resolvedParams.q);
  const specialization = pickValue(resolvedParams.specialization);
  const language = pickValue(resolvedParams.language);
  const sort = pickValue(resolvedParams.sort) || "rating_desc";

  const query = new URLSearchParams();

  if (q) {
    query.set("q", q);
  }

  if (specialization) {
    query.set("specialization", specialization);
  }

  if (language) {
    query.set("language", language);
  }

  if (sort) {
    query.set("sort", sort);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";

  const [catalog, specializations] = await Promise.all([
    getCatalogPsychologists(suffix),
    getSpecializations(),
  ]);

  return (
    <section className="page stack">
      <div className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Trust-first online consultations</p>
          <h1 className="hero-title">Find a psychologist, pick a calm time slot, join securely.</h1>
          <p className="hero-text">
            This frontend connects to the current NestJS API and demonstrates the core MVP flow:
            catalog, slot selection, booking, mock payment, and temporary video-session access.
          </p>
          <div className="inline-actions">
            <Link className="button button-primary" href="/auth">
              start with auth
            </Link>
            <Link className="button button-secondary" href="/dashboard">
              open dashboard
            </Link>
          </div>
        </div>

        <div className="hero-panel surface">
          <p className="caption">What this demo shows</p>
          <ul className="list-block">
            <li>Public catalog with safe profile projection</li>
            <li>Booking by published slots only</li>
            <li>Mock payment flow with explicit statuses</li>
            <li>Protected session access with short-lived tokens</li>
          </ul>
        </div>
      </div>

      <FilterBar
        initialLanguage={language}
        initialQ={q}
        initialSort={sort}
        initialSpecialization={specialization}
        specializations={specializations}
      />

      <div className="section-head">
        <div>
          <p className="caption">Catalog</p>
          <h2 className="section-title">Psychologists</h2>
          <p className="section-text">
            {catalog.pagination.total} specialists found. Public cards intentionally exclude sensitive data.
          </p>
        </div>
      </div>

      {catalog.items.length === 0 ? (
        <div className="surface empty-state">
          <h3 className="card-title">No psychologists matched the current filters.</h3>
          <p className="section-text">Try resetting the filter set or broadening the search query.</p>
        </div>
      ) : (
        <div className="catalog-grid">
          {catalog.items.map((psychologist) => (
            <article className="psych-card surface" key={psychologist.id}>
              <div className="psych-card-top">
                <div>
                  <p className="caption">Verified specialist</p>
                  <h3 className="card-title">{psychologist.fullName}</h3>
                  <p className="section-text">{psychologist.publicTitle ?? "Licensed psychologist"}</p>
                </div>
                <div className="rating-chip">{psychologist.ratingAvg.toFixed(1)}</div>
              </div>

              <p className="section-text psych-card-bio">
                {psychologist.bio ?? "Specialist description will appear here after profile completion."}
              </p>

              <div className="tag-row">
                {psychologist.specializations.map((item) => (
                  <span className="tag" key={item.id}>
                    {item.name}
                  </span>
                ))}
              </div>

              <div className="meta-grid">
                <div className="meta-card">
                  <span>experience</span>
                  <strong>{psychologist.experienceYears} years</strong>
                </div>
                <div className="meta-card">
                  <span>price</span>
                  <strong>
                    {psychologist.priceFrom ? formatMoney(psychologist.priceFrom) : "on request"}
                  </strong>
                </div>
                <div className="meta-card">
                  <span>languages</span>
                  <strong>{psychologist.languages.join(", ") || "n/a"}</strong>
                </div>
                <div className="meta-card">
                  <span>next slot</span>
                  <strong>
                    {psychologist.nextAvailableAt
                      ? formatDateTime(psychologist.nextAvailableAt)
                      : "not published"}
                  </strong>
                </div>
              </div>

              {psychologist.upcomingSlots.length > 0 ? (
                <div className="slot-row">
                  {psychologist.upcomingSlots.slice(0, 3).map((slot) => (
                    <span className="slot-pill" key={`${slot.startsAt}-${slot.endsAt}`}>
                      {formatDateTime(slot.startsAt)}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="inline-actions">
                <Link className="button button-primary" href={`/psychologists/${psychologist.slug}`}>
                  view profile
                </Link>
                <Link className="button button-ghost" href="/auth">
                  sign in
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
