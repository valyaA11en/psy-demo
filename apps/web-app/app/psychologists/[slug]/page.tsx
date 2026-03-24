import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingActions } from "@/components/booking-actions";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getPsychologist, getPsychologistSlots } from "@/lib/server-api";

type PsychologistPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function PsychologistPage({ params }: PsychologistPageProps) {
  const { slug } = await params;

  try {
    const [psychologist, slotsResponse] = await Promise.all([
      getPsychologist(slug),
      getPsychologistSlots(slug, "?limit=8"),
    ]);

    return (
      <section className="page stack page-detail">
        <div className="profile-hero surface">
          <div className="profile-copy stack">
            <p className="caption">Verified public profile</p>
            <h1 className="display-title">{psychologist.fullName}</h1>
            <p className="section-text section-text-large">
              {psychologist.publicTitle ?? "Licensed psychologist"}
            </p>
            <p className="section-text">{psychologist.bio ?? "Profile description will be added by the psychologist."}</p>
          </div>

          <div className="profile-side stack">
            <div className="price-pill">
              {psychologist.priceFrom
                ? formatMoney(psychologist.priceFrom)
                : "Price on request"}
            </div>
            <div className="meta-card">
              <span>experience</span>
              <strong>{psychologist.experienceYears} years</strong>
            </div>
            <div className="meta-card">
              <span>languages</span>
              <strong>{psychologist.languages.join(", ") || "not specified"}</strong>
            </div>
            <div className="meta-card">
              <span>next slot</span>
              <strong>
                {psychologist.nextAvailableAt
                  ? formatDateTime(psychologist.nextAvailableAt)
                  : "no slot published"}
              </strong>
            </div>
          </div>
        </div>

        <div className="detail-grid">
          <div className="stack">
            <div className="surface stack">
              <div>
                <p className="caption">Approach</p>
                <h2 className="section-title">Public information only</h2>
              </div>

              <div className="tag-row">
                {psychologist.specializations.map((item) => (
                  <span className="tag" key={item.id}>
                    {item.name}
                  </span>
                ))}
                {psychologist.formats.map((format) => (
                  <span className="tag tag-soft" key={format}>
                    {format}
                  </span>
                ))}
              </div>

              <ul className="list-block">
                <li>Average rating: {psychologist.ratingAvg.toFixed(1)}</li>
                <li>Reviews: {psychologist.reviewsCount}</li>
                <li>Formats: {psychologist.formats.join(", ") || "not specified"}</li>
                <li>Only non-sensitive public profile fields are shown on this page.</li>
              </ul>
            </div>

            <div className="surface stack">
              <div>
                <p className="caption">Booking flow</p>
                <h2 className="section-title">Choose a published slot</h2>
              </div>
              <p className="section-text">
                Booking creates a consultation, then payment is completed in the dashboard using the mock checkout flow.
              </p>
              <BookingActions psychologistName={psychologist.fullName} slots={slotsResponse.items} />
            </div>
          </div>

          <aside className="stack">
            <div className="surface stack">
              <p className="caption">Privacy note</p>
              <p className="section-text">
                The client will share only the minimum required data for scheduling and communication.
              </p>
            </div>

            <div className="surface stack">
              <p className="caption">Navigation</p>
              <div className="inline-actions">
                <Link className="button button-primary" href="/dashboard">
                  dashboard
                </Link>
                <Link className="button button-ghost" href="/">
                  back to catalog
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </section>
    );
  } catch {
    notFound();
  }
}
