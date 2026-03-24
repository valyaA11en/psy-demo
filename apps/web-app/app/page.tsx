import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { formatDateTime, formatMoney, humanizeCode } from "@/lib/format";
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
          <p className="eyebrow">Онлайн-консультации с акцентом на доверие</p>
          <h1 className="hero-title">Найдите психолога, выберите удобный слот и подключайтесь безопасно.</h1>
          <p className="hero-text">
            Это клиентское приложение подключено к текущему NestJS API и показывает базовый MVP-сценарий:
            каталог, выбор слота, бронирование, тестовую оплату и временный доступ к видеосессии.
          </p>
          <div className="inline-actions">
            <Link className="button button-primary" href="/auth">
              войти или зарегистрироваться
            </Link>
            <Link className="button button-secondary" href="/dashboard">
              открыть кабинет
            </Link>
          </div>
        </div>

        <div className="hero-panel surface">
          <p className="caption">Что показывает демо</p>
          <ul className="list-block">
            <li>Публичный каталог с безопасной проекцией профиля</li>
            <li>Запись только по опубликованным слотам</li>
            <li>Сценарий тестовой оплаты с явными статусами</li>
            <li>Защищённый доступ к сессии по короткоживущим токенам</li>
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
          <p className="caption">Каталог</p>
          <h2 className="section-title">Психологи</h2>
          <p className="section-text">
            Найдено специалистов: {catalog.pagination.total}. В публичных карточках намеренно нет чувствительных данных.
          </p>
        </div>
      </div>

      {catalog.items.length === 0 ? (
        <div className="surface empty-state">
          <h3 className="card-title">По текущим фильтрам психологи не найдены.</h3>
          <p className="section-text">Попробуйте сбросить фильтры или расширить поисковый запрос.</p>
        </div>
      ) : (
        <div className="catalog-grid">
          {catalog.items.map((psychologist) => (
            <article className="psych-card surface" key={psychologist.id}>
              <div className="psych-card-top">
                <div>
                  <p className="caption">Проверенный специалист</p>
                  <h3 className="card-title">{psychologist.fullName}</h3>
                  <p className="section-text">{psychologist.publicTitle ?? "Практикующий психолог"}</p>
                </div>
                <div className="rating-chip">{psychologist.ratingAvg.toFixed(1)}</div>
              </div>

              <p className="section-text psych-card-bio">
                {psychologist.bio ?? "Описание специалиста появится после заполнения профиля."}
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
                  <span>опыт</span>
                  <strong>{psychologist.experienceYears} лет</strong>
                </div>
                <div className="meta-card">
                  <span>стоимость</span>
                  <strong>
                    {psychologist.priceFrom ? formatMoney(psychologist.priceFrom) : "по запросу"}
                  </strong>
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
                      : "не опубликован"}
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
                  открыть профиль
                </Link>
                <Link className="button button-ghost" href="/auth">
                  войти
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
