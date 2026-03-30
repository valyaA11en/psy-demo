import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingActions } from "@/components/booking-actions";
import { formatDateTime, formatMoney, humanizeCode } from "@/lib/format";
import {
  getPsychologist,
  getPsychologistReviews,
  getPsychologistSessionPackageOffers,
  getPsychologistSlots,
} from "@/lib/server-api";

type PsychologistPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function PsychologistPage({ params }: PsychologistPageProps) {
  const { slug } = await params;

  try {
    const [psychologist, slotsResponse, reviewsResponse, sessionPackageOffers] = await Promise.all([
      getPsychologist(slug),
      getPsychologistSlots(slug, "?limit=8"),
      getPsychologistReviews(slug, "?limit=6"),
      getPsychologistSessionPackageOffers(slug),
    ]);

    return (
      <section className="page stack page-detail">
        <div className="profile-hero surface">
          <div className="profile-copy stack">
            <p className="caption">Проверенный публичный профиль</p>
            <h1 className="display-title">{psychologist.fullName}</h1>
            <p className="section-text section-text-large">
              {psychologist.publicTitle ?? "Практикующий психолог"}
            </p>
            <p className="section-text">{psychologist.bio ?? "Описание профиля будет добавлено психологом."}</p>
          </div>

          <div className="profile-side stack">
            <div className="price-pill">
              {psychologist.priceFrom
                ? formatMoney(psychologist.priceFrom)
                : "Цена по запросу"}
            </div>
            <div className="meta-card">
              <span>опыт</span>
              <strong>{psychologist.experienceYears} лет</strong>
            </div>
            <div className="meta-card">
              <span>языки</span>
              <strong>{psychologist.languages.map(humanizeCode).join(", ") || "не указано"}</strong>
            </div>
            <div className="meta-card">
              <span>ближайший слот</span>
              <strong>
                {psychologist.nextAvailableAt
                  ? formatDateTime(psychologist.nextAvailableAt)
                  : "слоты не опубликованы"}
              </strong>
            </div>
          </div>
        </div>

        <div className="detail-grid">
          <div className="stack">
            <div className="surface stack">
              <div>
                <p className="caption">Подход</p>
                <h2 className="section-title">Только публичная информация</h2>
              </div>

              <div className="tag-row">
                {psychologist.specializations.map((item) => (
                  <span className="tag" key={item.id}>
                    {item.name}
                  </span>
                ))}
                {psychologist.formats.map((format) => (
                  <span className="tag tag-soft" key={format}>
                    {humanizeCode(format)}
                  </span>
                ))}
              </div>

              <ul className="list-block">
                <li>Средний рейтинг: {psychologist.ratingAvg.toFixed(1)}</li>
                <li>Отзывы: {psychologist.reviewsCount}</li>
                <li>Форматы: {psychologist.formats.map(humanizeCode).join(", ") || "не указано"}</li>
                <li>На этой странице показываются только неперсональные публичные поля профиля.</li>
              </ul>
            </div>

            <div className="surface stack">
              <div>
                <p className="caption">Запись</p>
                <h2 className="section-title">Выберите опубликованный слот</h2>
              </div>
              <p className="section-text">
                После выбора слота создаётся консультация, а оплату можно провести в кабинете через тестовый сценарий оплаты.
              </p>
              <BookingActions
                packageOffers={sessionPackageOffers.items}
                psychologistName={psychologist.fullName}
                psychologistSlug={psychologist.slug}
                slots={slotsResponse.items}
              />
            </div>

            {sessionPackageOffers.items.length > 0 ? (
              <div className="surface stack">
                <div>
                  <p className="caption">Пакеты</p>
                  <h2 className="section-title">Пакеты сессий со скидкой</h2>
                </div>
                <div className="stack compact-stack">
                  {sessionPackageOffers.items.map((offer) => (
                    <article className="surface surface-muted" key={offer.id}>
                      <div className="meta-row">
                        <strong>{offer.title}</strong>
                        <span>{formatMoney(offer.totalPrice, offer.currency)}</span>
                      </div>
                      <div className="meta-row">
                        <span>{offer.sessionCount} сессий</span>
                        <span>скидка {offer.discountPercent}%</span>
                      </div>
                      {offer.description ? <p className="section-text">{offer.description}</p> : null}
                    </article>
                  ))}
                </div>
                <p className="section-text">
                  Пакет активируется в аккаунте клиента и может быть выбран прямо при бронировании слота.
                </p>
              </div>
            ) : null}

            <div className="surface stack">
              <div>
                <p className="caption">Отзывы клиентов</p>
                <h2 className="section-title">Опубликованные отзывы</h2>
              </div>

              {reviewsResponse.items.length === 0 ? (
                <p className="section-text">Пока нет опубликованных отзывов.</p>
              ) : (
                <div className="stack compact-stack">
                  {reviewsResponse.items.map((review) => (
                    <article className="surface surface-muted" key={review.id}>
                      <div className="meta-row">
                        <strong>{review.authorName}</strong>
                        <span>{formatDateTime(review.createdAt)}</span>
                      </div>
                      <div className="meta-row">
                        <span>Оценка: {review.rating} / 5</span>
                        <span>{humanizeCode(review.status)}</span>
                      </div>
                      {review.text ? <p className="section-text">{review.text}</p> : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="stack">
            <div className="surface stack">
              <p className="caption">Замечание о приватности</p>
              <p className="section-text">
                Клиент передаёт только минимально необходимые данные для записи и коммуникации.
              </p>
            </div>

            <div className="surface stack">
              <p className="caption">Навигация</p>
              <div className="inline-actions">
                <Link className="button button-primary" href="/dashboard">
                  кабинет
                </Link>
                <Link className="button button-ghost" href="/">
                  вернуться в каталог
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
