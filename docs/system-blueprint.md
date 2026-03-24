# Consultations with a Psychologist: System Blueprint

## 1. Краткая концепция проекта

`Consultations with a Psychologist` — full-stack web-платформа для записи на онлайн-консультации с психологами. Цель MVP: дать клиенту безопасный и понятный flow записи, психологу — рабочий кабинет с расписанием и консультациями, администратору — инструменты модерации и аудита без избыточного доступа к чувствительным данным.

Ключевой принцип проекта: это не обычный marketplace. Платформа работает с потенциально чувствительными психологическими данными, поэтому архитектура, UI, API, логирование, storage и доступы проектируются по принципам privacy-by-design и least privilege.

Технологический профиль:

- `web-app`: Next.js
- `api-core`: NestJS + PostgreSQL + Redis
- `realtime/ws gateway`: NestJS WebSocket gateway
- `booking/slot worker`: Go
- `notification worker`: Go
- `admin-panel`: Laravel
- `infra`: Nginx, Docker Compose, S3-compatible storage

Позиционирование как portfolio project:

- production-like монорепо
- чёткое разделение сервисов и ответственности
- security-aware design
- OpenAPI, CI, документация, ADR/диаграммы
- реалистичный scope для `junior+ / strong junior backend portfolio`

## 2. User flows

### Клиент

1. Заходит в каталог психологов.
2. Фильтрует по специализации, языку, цене, формату, ближайшим слотам.
3. Открывает карточку психолога.
4. Просматривает публичную информацию: фото, специализации, подход, опыт, языки, стоимость, форматы, ближайшие окна.
5. Выбирает слот.
6. Проходит регистрацию/логин.
7. Подтверждает бронирование.
8. Переходит к оплате.
9. После успешной оплаты получает подтверждение и уведомление.
10. До консультации получает ссылку на онлайн-сессию и напоминания.
11. После консультации может оставить отзыв или жалобу.

### Психолог

1. Подаёт заявку на подключение.
2. Заполняет анкету и загружает подтверждающие документы.
3. Ждёт модерацию и активацию.
4. После одобрения настраивает профиль: bio, специализации, форматы, стоимость, языки, опыт.
5. Создаёт правила доступности и/или отдельные слоты.
6. Получает бронирования и уведомления.
7. Просматривает список консультаций.
8. Переходит в онлайн-сессию по безопасной ссылке.
9. Видит только минимально необходимую информацию о клиенте.

### Администратор

1. Заходит в backoffice.
2. Проходит 2FA.
3. Просматривает очередь модерации психологов.
4. Проверяет профиль, документы, жалобы.
5. Управляет каталогом, специализациями, пользователями, блокировками.
6. Просматривает бронирования, оплаты, системные инциденты.
7. Работает с аудитом и логами без доступа к лишним приватным данным.

### Суперадмин

1. Управляет администраторами и ролями.
2. Имеет доступ к системным настройкам и конфигурации платформы.
3. Используется редко и отдельно выделяется в access model.

## 3. UI/UX и дизайн-концепция

### Общая продуктовая визуальная концепция

- Светлая, спокойная палитра: молочный, тёплый серо-бежевый, мягкий сине-серый, приглушённый зелёный/бирюзовый акцент.
- Визуальная метафора: trust, calm, privacy, care.
- Типографика: крупные заголовки, комфортные интервалы, высокая читаемость.
- Интерфейс без агрессивных CTA, scarcity-механик и навязчивого upsell.
- Мобильная адаптация обязательна: каталог и запись должны быть удобны с телефона.

### Каталог психологов

- Карточки с фото, именем, специализациями, подходом, языками, ценой, форматом и ближайшими слотами.
- Никаких лишних личных данных: адрес проживания, персональные контакты, документы, внутренние заметки недоступны.
- Фильтры слева/сверху: специализация, язык, диапазон цены, онлайн/офлайн, опыт, наличие ближайших слотов.
- Быстрый просмотр ближайших доступных окон прямо в карточке.

### Flow записи

`Каталог -> карточка психолога -> выбор слота -> подтверждение -> оплата -> success state -> доступ к сессии`

Требования к UX:

- ясные статусы
- минимум шагов
- прогнозируемый результат после каждого действия
- запрет скрытых условий
- понятные правила отмены и переноса

### Кабинет клиента

- ближайшие консультации
- история консультаций
- статусы оплат
- список уведомлений
- ссылки на сессии только тогда, когда это допустимо по времени и статусу
- управление профилем, согласиями и запросами на экспорт/удаление данных

### Кабинет психолога

- календарь и слоты
- список предстоящих консультаций
- входящие уведомления
- статус модерации профиля
- безопасное редактирование профиля
- никаких избыточных клиентских данных на overview-экранах

### Админ-панель

- рабочий интерфейс без визуального шума
- табличные представления, фильтры, быстрые действия
- конфиденциальные поля скрыты или частично маскированы
- отдельные экраны для moderation, complaints, users, payments, audit

## 4. Архитектура сервисов

### Сервисная структура

- `web-app` (Next.js): публичный сайт, каталог, клиентский/психологический кабинет.
- `api-core` (NestJS): основной REST API, auth, catalog, bookings, payments orchestration, files metadata, consent, audit triggers.
- `realtime/ws-gateway` (NestJS): WebSocket gateway для live-уведомлений, статусов, invalidation и обновлений кабинетов.
- `booking-slot-worker` (Go): расчёт доступности, фоновые пересчёты слотов, job scheduling, slot reconciliation.
- `notification-worker` (Go): email/telegram/push dispatch, retry, дедупликация, обработка webhook/payment events.
- `admin-panel` (Laravel): backoffice, RBAC, moderation, complaints, content/admin CRUD.
- `postgres`: основная реляционная БД.
- `redis`: кэш, очереди, rate limiting, session metadata, pub/sub.
- `s3`: документы психологов, аватары, вложения, экспорт данных.
- `nginx`: единая точка входа.

### Почему именно так

- `NestJS` подходит для основного доменного API, DTO, guards, validation, Swagger.
- `Go` выносит CPU-/concurrency-heavy и background workload: slot generation, retries, bulk notifications, queue workers.
- `Laravel` даёт быстрое и зрелое admin/backoffice-ядро: policies, RBAC, forms, tables, audit-friendly internal tools.
- `Next.js` подходит и для SEO-каталога, и для authenticated кабинетов.

### Потоки взаимодействия

1. Клиент работает через `web-app`.
2. `web-app` ходит в `api-core`.
3. `api-core` пишет в PostgreSQL и Redis.
4. При критичных событиях `api-core` публикует jobs/events в Redis streams/queues.
5. `booking-slot-worker` и `notification-worker` читают очереди и выполняют фоновые задачи.
6. `realtime/ws-gateway` получает события через Redis pub/sub и доставляет их активным пользователям.
7. `admin-panel` работает с PostgreSQL через отдельный internal API boundary или read/write-подключение к БД только для admin domain.

### Рекомендуемый способ связать admin-panel

Предпочтительный вариант для pet-project:

- `Laravel admin-panel` использует ту же PostgreSQL БД, но отдельные таблицы/сервисы доступа.
- Для чувствительных операций и сложной доменной логики Laravel должен ходить в `api-core internal endpoints`, а не обходить бизнес-правила.

Правило:

- чтение справочников и агрегатов допустимо напрямую из БД
- actions, меняющие доменный state, лучше проводить через внутренний API или shared domain rules

## 5. Структура репозитория

```text
.
├─ apps/
│  ├─ web-app/                 # Next.js
│  ├─ api-core/                # NestJS
│  ├─ ws-gateway/              # NestJS realtime
│  └─ admin-panel/             # Laravel
├─ services/
│  ├─ booking-slot-worker/     # Go
│  └─ notification-worker/     # Go
├─ infra/
│  ├─ nginx/
│  ├─ postgres/
│  ├─ redis/
│  └─ s3/
├─ docker/
│  ├─ dev/
│  └─ prod/
├─ docs/
│  ├─ system-blueprint.md
│  ├─ architecture-diagrams/
│  ├─ api/
│  ├─ adr/
│  └─ security/
├─ .github/
│  ├─ workflows/
│  ├─ ISSUE_TEMPLATE/
│  └─ PULL_REQUEST_TEMPLATE.md
├─ docker-compose.yml
├─ .env.example
├─ README.md
├─ CONTRIBUTING.md
├─ SECURITY.md
└─ LICENSE
```

## 6. Docker-инфраструктура

### Что поднимается в `docker-compose.yml`

- `nginx`
- `web-app`
- `api-core`
- `ws-gateway`
- `admin-panel`
- `booking-slot-worker`
- `notification-worker`
- `postgres`
- `redis`
- `minio` или другой S3-compatible сервис

### Сети

- `edge`: только `nginx` и внешние сервисы, которым нужен ingress
- `app`: внутреннее взаимодействие приложений
- `data`: postgres/redis/minio, недоступные снаружи

### Наружу публикуются только

- `80/443` для `nginx`
- опционально `9001` для MinIO console только в dev

Не публиковать наружу:

- `postgres`
- `redis`
- internal service ports

### Volumes

- `postgres_data`
- `redis_data` при необходимости persistence
- `minio_data`
- `node_modules`/`vendor` как bind/cached volumes в dev по желанию

### Dev-подход

- bind mounts
- hot reload для Next/Nest
- Laravel artisan serve или php-fpm + nginx
- test SMTP/Mailpit для отладки

### Prod-подход

- multi-stage Dockerfiles
- immutable images
- secrets через env/secrets manager
- nginx с TLS termination
- отдельные compose/helm overrides

### Миграции и seed

- `api-core`: migration command в entrypoint job
- `admin-panel`: artisan migrate для внутренних таблиц, если они есть
- отдельная команда `make seed-dev`
- не запускать destructive seed в prod

### Локальный старт

Одна команда:

```bash
docker compose up --build
```

Дополнительно:

```bash
docker compose run --rm api-core npm run migration:run
docker compose run --rm api-core npm run seed:dev
docker compose run --rm admin-panel php artisan migrate
```

## 7. Структура БД

### Общие принципы

- UUID как primary key
- soft delete только там, где это оправдано
- `created_at/updated_at` везде
- чувствительные поля помечаются как restricted domain data
- аудитируем все admin/security-critical операции

### Таблицы

#### `users`
- Назначение: базовая учётная запись.
- Поля: `id`, `email`, `password_hash`, `status`, `last_login_at`, `email_verified_at`, `phone_hash?`, `is_2fa_enabled`.
- Связи: `user_roles`, `client_profiles`, `psychologist_profiles`, `refresh_tokens`, `consent_records`.
- Чувствительные: `password_hash`, email, phone hash, security flags.
- Индексы: `email unique`, `status`, `last_login_at`.

#### `roles`
- Назначение: справочник ролей.
- Поля: `id`, `code`, `name`.
- Связи: `user_roles`.
- Чувствительные: нет.
- Индексы: `code unique`.

#### `user_roles`
- Назначение: many-to-many user-role.
- Поля: `user_id`, `role_id`.
- Связи: `users`, `roles`.
- Чувствительные: косвенно security-critical.
- Индексы: composite unique.

#### `client_profiles`
- Назначение: данные клиента.
- Поля: `user_id`, `display_name`, `timezone`, `birth_year?`, `preferences_json`.
- Связи: `users`, `consultations`, `reviews`, `complaints`.
- Чувствительные: предпочтения, timezone, любые note-like поля.
- Индексы: `user_id unique`.

#### `psychologist_profiles`
- Назначение: профиль специалиста.
- Поля: `user_id`, `public_slug`, `first_name`, `last_name`, `public_title`, `bio`, `experience_years`, `price_from`, `price_to`, `languages_json`, `formats_json`, `approval_status`, `rating_avg`, `reviews_count`.
- Связи: `users`, `psychologist_specializations`, `availability_rules`, `appointment_slots`, `consultations`, `files`.
- Чувствительные: приватные внутренние заметки модерации, документы квалификации.
- Индексы: `public_slug unique`, `approval_status`, `price_from`, `rating_avg`.

#### `specializations`
- Назначение: справочник специализаций.
- Поля: `id`, `slug`, `name`, `is_active`.
- Связи: `psychologist_specializations`.
- Чувствительные: нет.
- Индексы: `slug unique`, `is_active`.

#### `psychologist_specializations`
- Назначение: связи психологов и специализаций.
- Поля: `psychologist_profile_id`, `specialization_id`.
- Связи: `psychologist_profiles`, `specializations`.
- Чувствительные: нет.
- Индексы: composite unique, `specialization_id`.

#### `availability_rules`
- Назначение: регулярные правила доступности.
- Поля: `id`, `psychologist_profile_id`, `weekday`, `start_time`, `end_time`, `slot_duration_min`, `buffer_min`, `timezone`, `is_active`.
- Связи: `psychologist_profiles`.
- Чувствительные: рабочий график, ограниченно чувствительно.
- Индексы: `psychologist_profile_id`, `weekday`, `is_active`.

#### `appointment_slots`
- Назначение: конкретные слоты.
- Поля: `id`, `psychologist_profile_id`, `starts_at`, `ends_at`, `status`, `source`, `consultation_id?`, `locked_until?`.
- Связи: `psychologist_profiles`, `consultations`.
- Чувствительные: косвенно чувствительные.
- Индексы: `(psychologist_profile_id, starts_at)`, `status`, `locked_until`.

#### `consultations`
- Назначение: бронирования/сессии.
- Поля: `id`, `client_user_id`, `psychologist_user_id`, `slot_id`, `status`, `meeting_provider`, `meeting_room_id`, `meeting_join_token_ref`, `scheduled_at`, `cancelled_at`, `cancellation_reason_code`, `rescheduled_from_id?`.
- Связи: `users`, `appointment_slots`, `payments`, `reviews`, `complaints`, `consultation_status_history`.
- Чувствительные: meeting access data, cancellation reasons, internal notes.
- Индексы: `(client_user_id, scheduled_at)`, `(psychologist_user_id, scheduled_at)`, `status`.

#### `consultation_status_history`
- Назначение: история изменений статусов.
- Поля: `id`, `consultation_id`, `from_status`, `to_status`, `changed_by_user_id`, `reason_code`, `created_at`.
- Связи: `consultations`, `users`.
- Чувствительные: reason fields могут быть чувствительными.
- Индексы: `consultation_id`, `created_at`.

#### `payments`
- Назначение: платёжная сущность.
- Поля: `id`, `consultation_id`, `provider`, `provider_payment_id`, `amount`, `currency`, `status`, `idempotency_key`, `paid_at`, `refunded_at`.
- Связи: `consultations`, `payment_events`.
- Чувствительные: provider references, но не PAN/CVV.
- Индексы: `provider_payment_id unique`, `consultation_id`, `status`, `idempotency_key unique`.

#### `payment_events`
- Назначение: события от платёжного провайдера.
- Поля: `id`, `payment_id`, `provider_event_id`, `event_type`, `payload_json`, `signature_valid`, `processed_at`.
- Связи: `payments`.
- Чувствительные: payload provider-а может содержать PII.
- Индексы: `provider_event_id unique`, `payment_id`, `processed_at`.

#### `notifications`
- Назначение: очередь/история уведомлений.
- Поля: `id`, `user_id`, `channel`, `type`, `template_code`, `payload_json`, `status`, `sent_at`, `read_at`, `dedupe_key`.
- Связи: `users`.
- Чувствительные: payload может содержать минимальные user-specific данные.
- Индексы: `(user_id, read_at)`, `status`, `dedupe_key unique`.

#### `reviews`
- Назначение: отзывы после завершённых консультаций.
- Поля: `id`, `consultation_id`, `client_user_id`, `psychologist_user_id`, `rating`, `text`, `status`.
- Связи: `consultations`, `users`.
- Чувствительные: текст может содержать personal mental-health info.
- Индексы: `consultation_id unique`, `psychologist_user_id`, `status`.

#### `complaints`
- Назначение: жалобы.
- Поля: `id`, `author_user_id`, `target_user_id?`, `consultation_id?`, `type`, `text`, `status`, `assigned_admin_id?`, `resolution_note`.
- Связи: `users`, `consultations`.
- Чувствительные: complaint text.
- Индексы: `status`, `assigned_admin_id`, `consultation_id`.

#### `files`
- Назначение: метаданные файлов в S3.
- Поля: `id`, `owner_user_id`, `bucket`, `object_key`, `purpose`, `mime_type`, `size_bytes`, `visibility`, `checksum`, `uploaded_at`.
- Связи: `users`, возможно `psychologist_profiles`.
- Чувствительные: документы квалификации, экспорт данных.
- Индексы: `owner_user_id`, `purpose`, `object_key unique`.

#### `audit_logs`
- Назначение: аудит важных действий.
- Поля: `id`, `actor_user_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `ip_hash`, `user_agent_hash`, `request_id`, `metadata_json`, `created_at`.
- Связи: `users`.
- Чувствительные: metadata ограничивать и маскировать.
- Индексы: `(entity_type, entity_id)`, `actor_user_id`, `created_at`, `action`.

#### `sessions` / `refresh_tokens`
- Назначение: session management и rotation refresh tokens.
- Поля: `id`, `user_id`, `device_info_hash`, `refresh_token_hash`, `expires_at`, `rotated_from_id`, `revoked_at`, `ip_hash`.
- Связи: `users`.
- Чувствительные: refresh token hash, device fingerprints.
- Индексы: `user_id`, `expires_at`, `revoked_at`.

#### `consent_records`
- Назначение: фиксация согласий.
- Поля: `id`, `user_id`, `consent_type`, `version`, `granted`, `granted_at`, `revoked_at`, `source`.
- Связи: `users`.
- Чувствительные: legal/security-critical.
- Индексы: `(user_id, consent_type, version)`, `granted_at`.

## 8. Backend API modules

### Общие правила API

- REST для CRUD и query-потоков
- WebSocket для live-уведомлений и realtime state updates
- DTO + validation pipes
- единый error envelope
- пагинация: `page`, `limit`, `cursor` там, где нужно
- sorting/filtering whitelists
- idempotency для критичных mutation endpoints

### Response pattern

Успех:

```json
{
  "data": {},
  "meta": {
    "requestId": "uuid"
  }
}
```

Ошибка:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": []
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

### Модули и endpoints

#### `auth`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/2fa/setup`
- `POST /auth/2fa/verify`
- DTO: email/password, refresh token, reset token.
- Access: public/authenticated.

#### `users`
- `GET /users/me`
- `PATCH /users/me`
- `GET /users/me/sessions`
- `DELETE /users/me/sessions/:id`
- `GET /users/me/consents`
- `POST /users/me/export`
- `DELETE /users/me`
- Access: ownership only.

#### `psychologists`
- `POST /psychologists/apply`
- `GET /psychologists/me`
- `PATCH /psychologists/me`
- `POST /psychologists/me/files`
- `GET /psychologists/me/consultations`
- `PATCH /psychologists/me/consultations/:id/status`
- `POST /psychologists/me/availability-rules`
- `POST /psychologists/me/slots`
- Access: psychologist only, admin for moderation views.

#### `catalog`
- `GET /catalog/psychologists`
- `GET /catalog/psychologists/:slug`
- `GET /catalog/specializations`
- REST because это query-heavy публичный каталог.
- Параметры: filters, sorting, pagination.

#### `availability`
- `GET /availability/psychologists/:id/slots`
- `POST /availability/slots/hold`
- `DELETE /availability/slots/hold/:holdId`
- `POST /availability/rules/rebuild`
- Access: public for reading available slots, authenticated for hold/book flows.
- Idempotency: slot hold / booking initiation.

#### `bookings`
- `POST /bookings`
- `GET /bookings/me`
- `GET /bookings/:id`
- `POST /bookings/:id/cancel`
- `POST /bookings/:id/reschedule`
- `GET /bookings/:id/join`
- Access: client/psychologist ownership checks, admin restricted visibility.

#### `payments`
- `POST /payments/checkout`
- `GET /payments/:id`
- `POST /payments/webhook`
- `POST /payments/:id/refund` admin/internal only
- Webhook только signed.
- Idempotency key обязателен для checkout/refund.

#### `notifications`
- `GET /notifications`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`
- `WS /ws` events: `notification.created`, `booking.updated`, `payment.updated`.

#### `reviews`
- `POST /reviews`
- `GET /psychologists/:id/reviews`
- `PATCH /reviews/:id` ограниченно
- review only after completed consultation.

#### `complaints`
- `POST /complaints`
- `GET /complaints/me`
- `GET /admin/complaints`
- `PATCH /admin/complaints/:id/status`

#### `admin`
- `GET /admin/users`
- `PATCH /admin/users/:id/block`
- `GET /admin/psychologists/moderation`
- `PATCH /admin/psychologists/:id/approve`
- `PATCH /admin/psychologists/:id/reject`
- `GET /admin/payments`
- `GET /admin/settings`

#### `files`
- `POST /files/upload-url`
- `GET /files/:id/download-url`
- `DELETE /files/:id`
- Файл всегда идёт в S3, API хранит только метаданные и выдаёт signed URLs.

#### `video sessions`
- `POST /video-sessions/:consultationId/access`
- `GET /video-sessions/:consultationId`
- Только для авторизованных участников консультации.
- Выдаётся временный access token.

#### `audit`
- `GET /admin/audit-logs`
- `GET /admin/audit-logs/:id`
- Доступ: только admin/superadmin с ограничениями на поля.

### DTO / Validation

- `class-validator` / `zod` schemas на gateway boundary
- enum validation
- length and range limits
- allowlist сортировок и фильтров
- sanitization rich text / bio / review / complaint text
- file DTO: mime, purpose, size

## 9. Безопасность и конфиденциальность

### Основная позиция

Платформа связана с психологическими консультациями. Следовательно:

- данные клиента нельзя считать обычными пользовательскими заметками
- контекст консультаций может быть sensitive by default
- admin не должен иметь полный “god-mode” доступ к приватным данным
- данные разделяются по публичности на уровне БД, API, DTO, UI и логов

### Privacy-by-design принципы

- минимизация данных
- необходимость доступа по роли и контексту операции
- segregation of public/private fields
- secure defaults
- explicit consent management
- retention policy

### Разделение данных

Публично доступны:

- имя/псевдоним психолога
- фото профиля
- специализации
- описание подхода
- опыт
- языки
- стоимость
- доступные слоты

Приватны:

- клиентские заметки
- complaint/review raw text для узкого набора ролей
- документы квалификации
- meeting tokens
- internal moderation notes
- export/delete requests
- session/security metadata

### Аутентификация

- access token short-lived: 10-15 минут
- refresh token long-lived: 7-30 дней
- refresh token rotation при каждом refresh
- хранение refresh token только в `HttpOnly + Secure + SameSite` cookie
- access token в памяти клиента, не в localStorage
- server-side revocation list/session store

### Session management

- каждая сессия хранится отдельно
- устройство можно завершить отдельно
- logout-all инвалидирует все refresh sessions
- device metadata и IP хэшируются/минимизируются

### RBAC + ownership checks

- роли: client, psychologist, admin, superadmin
- policies/guards на каждый endpoint
- admin не получает полный payload по умолчанию
- superadmin используется только для meta-admin operations
- обязательны ownership checks: клиент видит только свои записи, психолог — только консультации, где он участник

### 2FA

- обязательно для admin и superadmin
- желательно для psychologist
- TOTP + recovery codes

### CSRF / CORS / cookies

- если refresh/logout идут через cookies, обязательна CSRF защита
- CORS только по allowlist доменов
- cookies: `Secure`, `HttpOnly`, `SameSite=Lax/Strict` по контексту

### Brute force / rate limiting

- login rate limit по IP + email pair
- password reset rate limit
- signup rate limit
- upload rate limit
- webhook rate limit / signature validation
- Redis-backed throttling

### Валидация и sanitization

- DTO validation на входе
- allowlist fields only
- sanitization текстовых полей
- нормализация email
- защита от mass assignment

### Файлы

- только через pre-signed upload URL или backend proxy
- проверка `mime type`, extension, size, checksum
- документы психологов только в private bucket
- скачивание только через short-lived signed URL
- antivirus scan или асинхронный file screening для production-like roadmap

### Шифрование

- in transit: HTTPS/TLS
- at rest: шифрование volume/storage где возможно
- чувствительные secrets только через env/secrets manager
- пароли только через `argon2id` или `bcrypt` с достаточным cost

### Логи и аудит

- request logs без тел чувствительных запросов
- не логировать пароли, refresh/access tokens, payment payload full raw, review/complaint full text там, где не нужно
- audit log для admin actions, moderation, blocks, refunds, consent changes, data export/delete
- masking/partial hashing для IP и user agent

### Payments / webhooks

- webhook signature verification
- replay protection
- дедупликация через `provider_event_id`
- idempotent processing
- no storage of raw card data

### Video sessions

- не включать запись по умолчанию
- join access только участникам консультации
- временный session access token
- lifecycle token short TTL
- нельзя показывать meeting URL заранее без политики допуска

### Admin access minimization

- админка показывает только data-to-operate
- скрывать/маскировать email, complaint text preview, payment refs, личные заметки
- чувствительные экраны доступны только определённым permission scopes
- отдельно роль `superadmin`, не использовать для повседневной работы

### Data export / deletion / retention

- пользователь может запросить экспорт данных
- пользователь может инициировать удаление аккаунта
- retention policy для audit/security/payment/legal data
- приватные заметки и complaint payload удаляются или анонимизируются по policy
- consent history хранится отдельно и версионируется

### Docker / network hardening

- Postgres и Redis только во внутренней сети
- Nginx единственная публичная точка входа
- internal services недоступны напрямую из интернета
- отдельные env files для сервисов
- `.env` никогда не коммитится в Git

## 10. Top security risks and mitigation

### 1. Утечка чувствительных психологических данных
- Риск: review/complaint/internal notes попадают в логи, админку или публичный API.
- Защита: field-level DTO separation, masked logs, strict admin scopes, privacy review для response schemas.

### 2. Избыточный доступ администратора
- Риск: админ видит больше, чем нужно.
- Защита: granular permissions, redacted admin UI, privileged actions only through audited flows, superadmin split.

### 3. Захват сессии
- Риск: кража refresh token или reuse старого refresh token.
- Защита: rotation, revocation, device-bound sessions, secure cookies, anomaly detection.

### 4. Double booking / race condition
- Риск: два клиента бронируют один слот.
- Защита: transactional booking, slot hold lock, unique constraints, idempotency keys, worker reconciliation.

### 5. Поддельные payment webhooks
- Риск: фиктивное подтверждение оплаты.
- Защита: signature validation, IP allowlist where possible, provider event dedupe, raw payload verification.

### 6. Утечка приватных файлов
- Риск: прямой доступ к документам психологов.
- Защита: private bucket, signed URLs with short TTL, scoped object keys, no public ACL.

### 7. Brute force и credential stuffing
- Риск: подбор паролей.
- Защита: rate limiting, captcha after threshold, device/IP throttling, optional 2FA.

### 8. SSRF / insecure file processing
- Риск: злоумышленник подсовывает опасные URL/файлы.
- Защита: no arbitrary fetch of user URLs, controlled upload pipeline, mime/size validation.

### 9. Неправильная публикация Redis/Postgres
- Риск: прямой сетевой доступ к внутренним сервисам.
- Защита: internal-only Docker networks, no host port mapping, auth enabled.

### 10. Утечка meeting links
- Риск: посторонний входит в видеосессию.
- Защита: time-bound access token, participant authorization, rotating join credentials.

## 11. План реализации по этапам

### Этап 0. Foundation
- monorepo structure
- Docker Compose
- PostgreSQL, Redis, MinIO, Nginx
- CI skeleton
- env strategy

### Этап 1. Auth + profiles
- NestJS auth
- roles/RBAC
- refresh token rotation
- user profile
- psychologist application/profile

### Этап 2. Catalog + search
- public psychologists catalog
- filters/sorting/pagination
- psychologist public page
- specializations dictionary

### Этап 3. Availability + booking
- availability rules
- slot generation worker on Go
- slot hold
- booking transaction
- cancellation/reschedule rules

### Этап 4. Payments + notifications
- payment integration
- payment webhooks
- notification worker
- email/telegram/in-app notifications
- WebSocket updates

### Этап 5. Admin/backoffice
- Laravel auth + RBAC
- moderation queue
- users/complaints/payments views
- audit screens

### Этап 6. Video + privacy operations
- session access token
- join flow
- consent management
- export/delete requests

### Этап 7. Hardening
- 2FA
- security headers
- penetration checklist
- log redaction review
- backup/restore

## 12. Что включить в MVP

- регистрация/логин/refresh/logout
- роли client/psychologist/admin
- профиль клиента
- профиль психолога + заявка на модерацию
- каталог психологов
- фильтры и карточка психолога
- availability rules + generated slots
- бронирование консультации
- отмена по простым правилам
- payment stub или one real provider
- уведомления email + in-app
- basic WebSocket notifications
- Laravel admin moderation
- complaints
- audit logs
- secure file upload for psychologist documents
- Docker Compose local environment
- OpenAPI / Swagger

## 13. Что можно оставить на V2

- сложные пакеты тарифов и subscriptions
- ML/recommendation matching
- многоязычность интерфейса
- advanced analytics
- mobile push notifications
- insurance / invoice modules
- advanced availability optimization
- in-platform chat
- calendar sync with Google/Outlook
- full data lifecycle automation and legal workflows

## 14. Как оформить проект на GitHub для сильного портфолио

- понятный README с архитектурой и запуском
- диаграмма компонентов и sequence diagrams
- OpenAPI specs
- docs по security decisions
- CI: lint/test/build
- issue templates, PR template, CONTRIBUTING
- `.env.example` для каждого сервиса
- seed demo data
- demo accounts
- screenshots/short GIFs кабинетов и админки

Показывать в репозитории:

- зрелую структуру
- осмысленные commit messages
- ADR по ключевым решениям
- security-first thinking

## 15. Рекомендуемые README-разделы

- Project overview
- Why this architecture
- Tech stack
- Services map
- Local development
- Environment variables
- Database migrations and seed
- API docs
- Security model
- Demo users
- Testing and CI
- Roadmap

## 16. Список deliverables

- `docs/system-blueprint.md`
- architecture diagrams
- repo skeleton and standards files
- docker-compose blueprint
- nginx config blueprint
- CI workflow skeleton
- README / CONTRIBUTING / SECURITY
- DB schema design and migration plan
- API module map and endpoint list
- MVP roadmap with security priorities
