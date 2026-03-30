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

  let catalog: Awaited<ReturnType<typeof getCatalogPsychologists>> = {
    items: [],
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    },
    filters: {
      q: q || null,
      specialization: specialization || null,
      language: language || null,
      format: null,
      priceMin: null,
      priceMax: null,
      sort,
    },
  };
  let specializations: Awaited<ReturnType<typeof getSpecializations>> = [];
  let catalogUnavailableMessage: string | null = null;

  try {
    [catalog, specializations] = await Promise.all([
      getCatalogPsychologists(suffix),
      getSpecializations(),
    ]);
  } catch {
    catalogUnavailableMessage =
      "Сервис подбора сейчас временно недоступен. Проверьте подключение API и попробуйте обновить страницу через минуту.";
  }

  return (
    <section className="page stack">
      <div className="surface redesign-banner">
        <p className="caption">Обновление интерфейса</p>
        <h2 className="card-title">Новый визуальный стиль 2026 уже активен</h2>
        <p className="section-text">
          Мы усилили контраст, обновили карточки и сделали более заметные акценты, чтобы интерфейс ощущался
          современнее и теплее.
        </p>
      </div>

      <div className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Деликатная и бережная онлайн-терапия</p>
          <h1 className="hero-title">Пространство, где легче сделать первый шаг к внутренней опоре.</h1>
          <p className="hero-text">
            Подберите психолога под ваш запрос, выберите удобное время и получите поддержку в спокойном,
            конфиденциальном формате. Интерфейс спроектирован так, чтобы снижать тревожность на каждом этапе.
          </p>
          <div className="inline-actions">
            <Link className="button button-primary" href="/auth">
              начать бережно
            </Link>
            <Link className="button button-secondary" href="/dashboard">
              личный кабинет
            </Link>
          </div>

          <div className="kpi-strip">
            <div className="kpi-item">
              <span className="caption">Формат</span>
              <strong>онлайн, из дома</strong>
            </div>
            <div className="kpi-item">
              <span className="caption">Доступность</span>
              <strong>слоты 7 дней в неделю</strong>
            </div>
            <div className="kpi-item">
              <span className="caption">Конфиденциальность</span>
              <strong>безопасные сессии</strong>
            </div>
            <div className="kpi-item">
              <span className="caption">Подбор</span>
              <strong>по специализации</strong>
            </div>
          </div>
        </div>

        <div className="hero-panel surface hero-spotlight">
          <p className="caption">Как устроена забота</p>
          <ul className="list-block">
            <li>Публичный каталог без раскрытия чувствительных данных</li>
            <li>Прозрачная запись только на подтверждённые слоты</li>
            <li>Понятные статусы бронирования и оплаты</li>
            <li>Защищённый доступ к видеосессии по краткоживущим токенам</li>
          </ul>
        </div>
      </div>

      <div className="innovation-grid">
        <article className="innovation-card surface">
          <p className="caption">шаг 1</p>
          <h3 className="card-title">Мягкий старт без давления</h3>
          <p className="section-text">
            Короткая анкета и фильтры помогают начать бережно: без лишних форм и сложных решений в первый визит.
          </p>
        </article>
        <article className="innovation-card surface">
          <p className="caption">шаг 2</p>
          <h3 className="card-title">Осознанный подбор специалиста</h3>
          <p className="section-text">
            Прозрачные карточки, опыт, язык, формат и ближайшие слоты — чтобы выбирать спокойно и по своему запросу.
          </p>
        </article>
        <article className="innovation-card surface">
          <p className="caption">шаг 3</p>
          <h3 className="card-title">Поддержка между сессиями</h3>
          <p className="section-text">
            В личном кабинете — статусы, уведомления и доступ к встречам, чтобы не теряться в организационных деталях.
          </p>
        </article>
      </div>

      <div className="trust-grid">
        <article className="trust-card">
          <h3>Безопасная среда</h3>
          <p>Каждый этап — от выбора психолога до подключения к сессии — спроектирован с акцентом на приватность и спокойствие.</p>
        </article>
        <article className="trust-card">
          <h3>Осознанный выбор</h3>
          <p>Фильтры по специализациям, языкам и формату помогают подобрать специалиста под ваш текущий запрос.</p>
        </article>
        <article className="trust-card">
          <h3>Мягкий путь клиента</h3>
          <p>Интерфейс с понятными шагами и деликатным тоном снижает барьер первой записи и помогает сфокусироваться на себе.</p>
        </article>
      </div>

      <div className="experience-strip surface">
        <div>
          <p className="caption">Новые решения в продукте</p>
          <h3 className="card-title">Сервис, который помогает не только записаться, но и удерживать внутреннюю опору</h3>
        </div>
        <div className="tag-row">
          <span className="tag">onboarding-first UX</span>
          <span className="tag">бережная микрокопирайт-система</span>
          <span className="tag">прозрачный клиентский путь</span>
        </div>
      </div>

      <FilterBar
        initialLanguage={language}
        initialQ={q}
        initialSort={sort}
        initialSpecialization={specialization}
        specializations={specializations}
      />

      {catalogUnavailableMessage ? <div className="notice notice-error">{catalogUnavailableMessage}</div> : null}

      <div className="section-head" id="catalog">
        <div>
          <p className="caption">Каталог</p>
          <h2 className="section-title">Психологи</h2>
          <p className="section-text">
            Найдено специалистов: {catalog.pagination.total}. Публичные карточки показывают только необходимую информацию
            для бережного и осознанного выбора.
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

      <div className="scenario-grid">
        <article className="surface scenario-card">
          <p className="caption">Сценарий</p>
          <h3 className="card-title">Хочу начать, но тревожно</h3>
          <p className="section-text">Начните с фильтров и профилей, а запись сделайте, когда почувствуете готовность.</p>
          <Link className="button button-secondary" href="/auth">
            сделать первый шаг
          </Link>
        </article>

        <article className="surface scenario-card">
          <p className="caption">Сценарий</p>
          <h3 className="card-title">Нужен специалист под конкретный запрос</h3>
          <p className="section-text">Отфильтруйте каталог по специализации, языку и удобному времени ближайших слотов.</p>
          <Link className="button button-secondary" href="/#catalog">
            перейти к каталогу
          </Link>
        </article>

        <article className="surface scenario-card">
          <p className="caption">Сценарий</p>
          <h3 className="card-title">Хочу управлять всем в одном месте</h3>
          <p className="section-text">В кабинете доступны консультации, уведомления, оплаты и защищённый вход в сессию.</p>
          <Link className="button button-secondary" href="/dashboard">
            открыть кабинет
          </Link>
        </article>
      </div>
    </section>
  );
}
