# Консультации с психологом: system blueprint

## 1. Краткая концепция проекта

`Consultations with a Psychologist` — полнофункциональная веб-платформа для онлайн-консультаций с психологами. MVP должен позволять клиенту быстро и безопасно находить специалиста, бронировать время, оплачивать консультацию, получать уведомления и подключаться к онлайн-сессии. Психолог получает рабочий кабинет с профилем, расписанием, слотами и списком консультаций. Администратор получает отдельную админ-панель для модерации, жалоб, управления пользователями и аудита.

Это не обычный маркетплейс. Контекст психологической помощи делает сами данные и даже факт взаимодействия чувствительными. Поэтому архитектура, UI, API, БД, логи и инфраструктура проектируются по принципам `приватность по проектированию`, `минимально необходимые привилегии` и `безопасность по умолчанию`.

Технологический стек:

- `web-app`: Next.js
- `api-core`: NestJS + PostgreSQL + Redis
- `ws-gateway`: NestJS WebSocket gateway
- `booking-slot-worker`: Go
- `notification-worker`: Go
- `admin-panel`: Laravel
- `infra`: Nginx, Docker Compose, S3-compatible storage

Позиционирование как portfolio project:

- production-like монорепозиторий
- реалистичное разделение сервисов
- серьёзный security/privacy слой
- OpenAPI, CI, README, шаблоны GitHub, admin-panel
- реалистичный масштаб для backend-портфолио уровня junior+ / strong junior

## 2. User flows

### Клиент

1. Заходит в каталог психологов.
2. Фильтрует специалистов по специализации, языку, цене и формату.
3. Открывает публичную карточку психолога.
4. Выбирает свободный слот.
5. Регистрируется или входит в систему.
6. Подтверждает бронирование.
7. Оплачивает консультацию.
8. Получает уведомление и доступ к сессии в нужное время.
9. После консультации может оставить отзыв или жалобу.

### Психолог

1. Подаёт заявку на подключение.
2. Заполняет анкету и загружает документы.
3. Проходит модерацию.
4. Заполняет профиль: описание, специализации, опыт, языки, форматы, стоимость.
5. Настраивает правила доступности и управляет слотами.
6. Просматривает список консультаций и получает уведомления.
7. Работает только с минимально необходимыми клиентскими данными.

### Администратор

1. Заходит в админ-панель.
2. Проходит усиленную аутентификацию.
3. Модерирует психологов и их документы.
4. Работает с жалобами, блокировками, справочниками, оплатами и аудитом.
5. Не получает доступа к лишним приватным данным клиента и видеосессиям.

### Суперадмин

1. Управляет администраторами и служебными настройками.
2. Используется редко и отделён от повседневной работы.

## 3. UI/UX и дизайн-концепция

### Визуальный язык

- спокойный, доверительный интерфейс
- светлая палитра, мягкие нейтральные оттенки
- крупная типографика и хорошие отступы
- минимум визуального шума
- адаптивность для mobile / tablet / desktop

### Каталог психологов

- карточки с фото, именем, специализациями, описанием подхода, языками, ценой и ближайшими слотами
- никаких персональных контактов, документов и внутренних заметок
- быстрый путь к записи

### Flow записи

`Каталог -> карточка психолога -> выбор слота -> подтверждение -> оплата -> доступ к сессии`

Требования к UX:

- понятные статусы
- минимум шагов
- прозрачные правила отмены и переноса
- отсутствие агрессивных маркетинговых паттернов

### Кабинет клиента

- ближайшие консультации
- история консультаций
- статусы оплат
- уведомления
- доступ к сессии только в разрешённое время
- управление профилем и согласиями

### Кабинет психолога

- календарь и слоты
- список консультаций
- уведомления
- статус модерации
- редактирование публичного профиля

### Админ-панель

- рабочий интерфейс без лишней графики
- таблицы, фильтры, быстрые действия
- скрытие или маскирование чувствительных полей
- отдельные экраны для пользователей, модерации, жалоб, оплат и аудита

## 4. Архитектура сервисов

### Сервисная структура

- `web-app`: публичный сайт, каталог, кабинеты клиента и психолога
- `api-core`: основной REST API, auth, каталог, availability, bookings, payments, files metadata, consent, audit triggers
- `ws-gateway`: WebSocket gateway для обновлений в реальном времени
- `booking-slot-worker`: расчёт доступности и фоновая генерация слотов
- `notification-worker`: email/telegram/in-app уведомления, retry, webhook handling
- `admin-panel`: Laravel-админка
- `postgres`: основная БД
- `redis`: кэш, очереди, rate limiting, pub/sub
- `s3`: документы и вложения
- `nginx`: единая точка входа

### Почему разделение именно такое

- `NestJS` хорошо подходит для доменного API, DTO, validation, guards и Swagger
- `Go` подходит для concurrency-heavy фоновых задач
- `Laravel` ускоряет создание админ-панели и CRUD-интерфейсов
- `Next.js` закрывает и SEO-каталог, и приватные кабинеты

### Потоки взаимодействия

1. Пользователь работает через `web-app`.
2. `web-app` вызывает `api-core`.
3. `api-core` читает и пишет в PostgreSQL и Redis.
4. При важных событиях `api-core` публикует доменные события в Redis.
5. `ws-gateway` получает события и отправляет их активным пользователям.
6. Go-воркеры выполняют фоновые задачи через очереди.
7. `admin-panel` работает с общей БД по ограниченному operational boundary, а сложные доменные действия должны идти через внутренний API.

## 5. Структура репозитория

```text
.
├─ apps/
│  ├─ web-app/
│  ├─ api-core/
│  ├─ ws-gateway/
│  └─ admin-panel/
├─ services/
│  ├─ booking-slot-worker/
│  └─ notification-worker/
├─ infra/
│  └─ nginx/
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
├─ docker-compose.yml
├─ .env.example
├─ README.md
├─ CONTRIBUTING.md
├─ SECURITY.md
└─ LICENSE
```

## 6. Docker-инфраструктура

### Что поднимается

- `nginx`
- `web-app`
- `api-core`
- `ws-gateway`
- `admin-panel`
- `booking-slot-worker`
- `notification-worker`
- `postgres`
- `redis`
- `minio`

### Сети

- `edge`: ingress
- `app`: внутреннее взаимодействие приложений
- `data`: Postgres, Redis и MinIO, недоступные снаружи

### Volume-ы

- `postgres_data`
- `redis_data`
- `minio_data`

### Правила сети и портов

- наружу публикуется только `nginx`
- `postgres` и `redis` не публикуются наружу
- MinIO console допустим только для dev

### Локальный запуск

```bash
docker compose up --build
```

### Миграции и seed

```bash
docker compose run --rm api-core npx prisma migrate deploy
docker compose run --rm api-core npx prisma db seed
docker compose run --rm admin-panel php artisan route:list
```

## 7. Структура БД

### Общие правила

- UUID как primary key
- `created_at/updated_at` почти везде
- чувствительные поля отмечаются как restricted data
- security/admin действия аудитируются

### Таблицы

- `users`: базовая учётная запись; чувствительные поля `email`, `password_hash`, security flags; индексы `email unique`, `status`
- `roles`: роли; индекс `code unique`
- `user_roles`: связь many-to-many пользователь-роль; composite unique
- `client_profiles`: клиентский профиль; чувствительные поля `preferences_json`; индекс `user_id unique`
- `psychologist_profiles`: публичный профиль психолога и moderation state; чувствительные поля `moderation_note`; индексы `public_slug unique`, `approval_status`, `price_from`, `price_to`
- `specializations`: справочник специализаций; индексы `slug unique`, `is_active`
- `psychologist_specializations`: связка психологов и специализаций; composite unique
- `availability_rules`: недельные правила доступности; индексы `psychologist_profile_id`, `weekday`, `is_active`
- `availability_exceptions`: blackout/exceptions для недоступных периодов; индексы `psychologist_profile_id`, `is_active`, `starts_at`
- `appointment_slots`: конкретные окна записи; индексы `(psychologist_profile_id, starts_at)`, `status`, `locked_until`
- `consultations`: запись на консультацию; чувствительные поля `client_message`, meeting access data; индексы `(client_user_id, scheduled_at)`, `(psychologist_user_id, scheduled_at)`, `status`
- `consultation_status_history`: история статусов; индексы `consultation_id`, `created_at`
- `payments`: платежи; чувствительные `provider_payment_id`, `metadata_json`; индексы `consultation_id`, `status`, `provider_payment_id`
- `payment_events`: события провайдера; чувствительные `payload_json`; индекс `provider_event_id unique`
- `notifications`: уведомления; чувствительные payload fields; индексы `user_id`, `status`, `created_at`
- `reviews`: отзывы; чувствительный текст; индексы `psychologist_user_id`, `status`
- `complaints`: жалобы; чувствительные `text`, `resolution_note`; индексы `status`, `type`, `assigned_admin_id`
- `files`: метаданные файлов; чувствительные документы психологов; индексы `owner_user_id`, `purpose`
- `audit_logs`: аудит критичных действий; индексы `actor_user_id`, `action`, `entity_type`, `created_at`
- `refresh_tokens` / `sessions`: управление сессиями; чувствительные `token_hash`, hashes; индексы `user_id`, `expires_at`, `revoked_at`
- `consent_records`: история согласий; индекс `(user_id, consent_type, version)`

## 8. Backend API modules

### Общие правила

- основной стиль: REST
- realtime-обновления: WebSocket
- пагинация, фильтры и сортировка у списков
- `Idempotency-Key` для критичных операций
- единый response pattern: `data/meta` или `error/meta`

### Модули

- `auth`: `register`, `login`, `refresh`, `logout`, `logout-all`
- `users`: `me`, update profile, sessions management
- `psychologists`: self profile, specializations
- `catalog`: список психологов, карточка психолога, специализации
- `availability`: rules, slots, public slot view
- `bookings`: create, list, detail, cancel, complete
- `payments`: create, list, detail, тестовые confirm/fail/cancel
- `notifications`: in-app список и read actions
- `reviews`: create and list
- `complaints`: create and admin handling
- `admin`: users, moderation, payments, settings
- `files`: upload/download URLs и удаление
- `video sessions`: session detail и access token
- `audit`: список и детали аудита

### DTO / Validation

- `class-validator` на boundary
- enum validation
- length/range limits
- allowlist сортировок и фильтров
- sanitization для `bio`, `review`, `complaint`, `client_message`
- file DTO: `mime`, `purpose`, `size`

## 9. Безопасность и конфиденциальность

### Базовая позиция

Платформа работает с психологическими консультациями. Это означает:

- данные клиента нельзя трактовать как обычные данные маркетплейса
- контекст консультации считается sensitive by default
- администратор не должен получать god-mode доступ к приватным данным
- приватные поля должны быть явно выделены на уровне БД, API, DTO, UI и логов

### Privacy-by-design принципы

- минимизация данных
- разделение публичных и приватных полей
- доступ по роли и контексту операции
- безопасные значения по умолчанию
- явное управление consent и retention

### Аутентификация и сессии

- короткоживущий access token
- refresh token в `HttpOnly + Secure + SameSite` cookie
- refresh token rotation
- server-side revocation
- завершение отдельных сессий и logout-all
- access token не хранится в `localStorage`

### RBAC и ownership checks

- роли: `client`, `psychologist`, `admin`, `superadmin`
- checks на каждый endpoint
- клиент видит только свои записи
- психолог видит только консультации, где он участник
- admin получает только operational payload
- superadmin используется только для meta-admin операций

### CSRF, CORS, cookies

- CSRF для cookie-based auth flows
- CORS только по allowlist
- cookies с `Secure`, `HttpOnly`, `SameSite`

### Rate limiting и brute force защита

- login rate limit по IP + email
- password reset rate limit
- signup rate limit
- upload rate limit
- webhook rate limit и signature validation

### Валидация и sanitization

- DTO validation
- allowlist полей
- sanitization пользовательского текста
- защита от mass assignment

### Файлы

- загрузка через pre-signed URL или backend proxy
- проверка `mime type`, extension, size и checksum
- private buckets для чувствительных файлов
- short-lived signed URLs на скачивание

### Шифрование и секреты

- HTTPS/TLS in transit
- шифрование storage/volume at rest, где возможно
- секреты только через env или secrets manager
- никаких секретов в Git

### Логи и аудит

- не логировать пароли, токены, payment payload, client message, raw complaint text без крайней необходимости
- хэшировать или маскировать IP и user-agent
- аудитировать admin actions, moderation, blocks, refunds, consent changes, export/delete

### Payments и webhooks

- webhook signature verification
- replay protection
- дедупликация по `provider_event_id`
- idempotent processing
- отсутствие хранения card data

### Video sessions

- запись не включается по умолчанию
- доступ только авторизованным участникам
- временный access token
- time window для join access
- админы не получают ссылки на сессии и токены доступа

### Data export / deletion / retention

- экспорт пользовательских данных
- удаление аккаунта по запросу
- отдельная retention policy для audit/security/payment/legal data
- анонимизация или удаление приватных note-like payload по policy

### Hardening Docker и сети

- Postgres и Redis только во внутренней сети
- Nginx — единственная публичная точка входа
- internal services недоступны напрямую из интернета
- `.env` никогда не коммитится

## 10. Top security risks and mitigation

### 1. Утечка чувствительных данных консультации
- риск: complaint/review/internal notes попадают в логи, админку или публичный API
- защита: field-level DTO separation, masked logs, strict admin scopes, privacy review схем ответов

### 2. Избыточный доступ администратора
- риск: админ видит больше, чем нужно для операции
- защита: granular permissions, redacted UI, audit каждого привилегированного действия, отдельная роль `superadmin`

### 3. Захват сессии
- риск: reuse украденного refresh token
- защита: rotation, revocation, secure cookies, session store, anomaly detection

### 4. Double booking / race condition
- риск: два клиента бронируют один слот
- защита: транзакции, slot hold, unique constraints, idempotency, reconciliation worker

### 5. Поддельный payment webhook
- риск: фиктивное подтверждение оплаты
- защита: signature validation, replay protection, provider event dedupe, raw payload verification

### 6. Утечка приватных файлов
- риск: прямой доступ к документам психолога
- защита: private bucket, short-lived signed URLs, отсутствие public ACL

### 7. Brute force и credential stuffing
- риск: подбор паролей
- защита: rate limiting, captcha после порога, optional 2FA

### 8. SSRF и небезопасная обработка файлов
- риск: произвольные URL или опасные файлы
- защита: контролируемая upload pipeline, mime/size validation, отказ от arbitrary fetch

### 9. Ошибочная публикация Redis/Postgres наружу
- риск: прямой сетевой доступ к внутренним сервисам
- защита: internal-only networks, отсутствие host port mapping

### 10. Утечка meeting links
- риск: посторонний доступ к видеосессии
- защита: time-bound join token, participant authorization, rotating access

## 11. План реализации по этапам

### Этап 0. Foundation
- монорепозиторий
- Docker Compose
- PostgreSQL, Redis, MinIO, Nginx
- CI skeleton

### Этап 1. Auth и профили
- NestJS auth
- RBAC
- refresh token rotation
- профили клиента и психолога

### Этап 2. Каталог
- публичный каталог психологов
- фильтры, сортировка, пагинация
- публичная карточка психолога

### Этап 3. Доступность и бронирование
- правила доступности
- генерация слотов
- booking transaction
- отмена и перенос

### Этап 4. Оплаты и уведомления
- payment integration
- webhook handling
- notification worker
- WebSocket updates

### Этап 5. Backoffice
- Laravel auth
- moderation queue
- users / complaints / payments views
- audit screens

### Этап 6. Видео и privacy operations
- session access token
- join flow
- consent management
- export/delete requests

### Этап 7. Hardening
- 2FA
- security headers
- review логирования
- backup/restore

## 12. Что включить в MVP

- регистрация, логин, refresh, logout
- роли `client`, `psychologist`, `admin`
- профили клиента и психолога
- каталог психологов
- фильтры и карточка психолога
- правила доступности и сгенерированные слоты
- бронирование консультации
- отмена по простым правилам
- тестовая оплата или один реальный провайдер
- email + in-app уведомления
- basic WebSocket notifications
- Laravel admin moderation
- complaints
- audit logs
- безопасная загрузка документов психолога
- Docker Compose local environment
- OpenAPI / Swagger

## 13. Что можно оставить на V2

- тарифные пакеты и subscriptions
- recommendation matching
- многоязычность интерфейса
- advanced analytics
- mobile push notifications
- in-platform chat
- calendar sync
- расширенная legal automation

## 14. Как оформить проект на GitHub для сильного портфолио

- понятный README с архитектурой и запуском
- диаграмма компонентов и sequence diagrams
- OpenAPI specs
- docs по security decisions
- CI: lint/test/build
- issue templates, PR template, CONTRIBUTING
- `.env.example` для каждого сервиса
- seed-данные для демо и демонстрационные аккаунты
- скриншоты или GIF пользовательских flow

Важно показать не только код, но и зрелое инженерное мышление: архитектуру, security-first подход, понятную структуру и аккуратную документацию.

## 15. Рекомендуемые README-разделы

- Обзор проекта
- Почему выбрана такая архитектура
- Стек технологий
- Карта сервисов
- Локальная разработка
- Переменные окружения
- Миграции и seed
- Документация API
- Модель безопасности
- Демо-пользователи
- Тестирование и CI
- Roadmap

## 16. Список deliverables

- `docs/system-blueprint.md`
- архитектурные диаграммы
- repo scaffold и стандарты
- `docker-compose.yml`
- `nginx` config
- GitHub Actions
- `README.md`, `CONTRIBUTING.md`, `SECURITY.md`
- дизайн БД и migration plan
- карта API-модулей и endpoint list
- roadmap MVP/V2
