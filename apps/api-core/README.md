# api-core

Основной NestJS API платформы онлайн-консультаций.

## Что реализовано

- регистрация и вход
- подтверждение email перед первой сессией
- refresh token rotation
- logout и logout-all
- JWT auth, RBAC и audit log
- публичный каталог психологов
- профили психологов и специализации
- weekly availability rules, blackout periods и appointment slots
- booking flow с idempotency key
- reviews после завершённой консультации
- complaints по конкретной консультации
- notifications, notification preferences и Telegram linking
- mock payments
- mock video session access
- Redis queue publishing для workers
- realtime event publishing для `ws-gateway`

## Auth lifecycle

1. `POST /api/v1/auth/register` создаёт пользователя со статусом `pending`
2. API создаёт одноразовый email verification token и ставит email в очередь уведомлений
3. `POST /api/v1/auth/verify-email` активирует пользователя и создаёт auth session
4. `POST /api/v1/auth/resend-verification` перевыпускает письмо без раскрытия, существует ли аккаунт
5. `POST /api/v1/auth/login` разрешён только после подтверждения email

## Основные endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verification`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `GET /api/v1/users/me/sessions`
- `DELETE /api/v1/users/me/sessions/:id`
- `GET /api/v1/catalog/psychologists`
- `GET /api/v1/catalog/psychologists/:slug`
- `GET /api/v1/catalog/specializations`
- `GET /api/v1/psychologists/me`
- `PATCH /api/v1/psychologists/me`
- `PUT /api/v1/psychologists/me/specializations`
- `GET /api/v1/availability/psychologists/:slug/slots`
- `GET /api/v1/availability/me/rules`
- `POST /api/v1/availability/me/rules`
- `PATCH /api/v1/availability/me/rules/:id`
- `DELETE /api/v1/availability/me/rules/:id`
- `GET /api/v1/availability/me/exceptions`
- `POST /api/v1/availability/me/exceptions`
- `PATCH /api/v1/availability/me/exceptions/:id`
- `DELETE /api/v1/availability/me/exceptions/:id`
- `GET /api/v1/availability/me/slots`
- `POST /api/v1/availability/me/slots`
- `DELETE /api/v1/availability/me/slots/:id`
- `POST /api/v1/availability/me/slots/generate`
- `POST /api/v1/bookings`
- `GET /api/v1/bookings/me`
- `GET /api/v1/bookings/psychologist/me`
- `GET /api/v1/bookings/:id`
- `POST /api/v1/bookings/:id/cancel`
- `POST /api/v1/bookings/:id/complete`
- `GET /api/v1/reviews/psychologists/:slug`
- `POST /api/v1/reviews`
- `GET /api/v1/complaints/me`
- `POST /api/v1/complaints`
- `POST /api/v1/payments`
- `GET /api/v1/payments/me`
- `GET /api/v1/payments/:id`
- `POST /api/v1/payments/:id/mock/confirm`
- `POST /api/v1/payments/:id/mock/fail`
- `POST /api/v1/payments/:id/mock/cancel`
- `GET /api/v1/video-sessions/:consultationId`
- `POST /api/v1/video-sessions/:consultationId/access`
- `GET /api/v1/notifications/me`
- `GET /api/v1/notifications/me/preferences`
- `PATCH /api/v1/notifications/me/preferences`
- `POST /api/v1/notifications/me/preferences/telegram-link`
- `POST /api/v1/notifications/me/read-all`
- `POST /api/v1/notifications/:id/read`

## Локальный запуск

### Рекомендуемый контейнерный путь

```bash
docker compose --env-file ../../.env.example up -d postgres redis
docker compose --env-file ../../.env.example run --rm api-core npx prisma migrate deploy
docker compose --env-file ../../.env.example run --rm api-core npm run prisma:seed
docker compose --env-file ../../.env.example up --build api-core
```

Для demo seed:

```bash
docker compose --env-file ../../.env.example run --rm -e SEED_DEMO_DATA=true api-core npm run prisma:seed
```

### Хостовый путь

1. Скопировать `.env.example` в `.env`
2. Указать рабочий `DATABASE_URL`
3. Выполнить:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

## Важные env-переменные

- `SWAGGER_ENABLED=false`
- `SEED_DEMO_DATA=false`
- `AUTH_THROTTLE_TTL=60`
- `AUTH_THROTTLE_LIMIT=5`
- `WEBHOOK_THROTTLE_TTL=60`
- `WEBHOOK_THROTTLE_LIMIT=15`
- `EMAIL_VERIFICATION_TTL_HOURS=24`
- `AUTH_DEBUG_EMAIL_VERIFICATION_LINKS=false`
- `WEBHOOK_SIGNING_SECRET=...`
- `SESSION_REVOCATION_CHANNEL=consultations.session-revoked.v1`
- `SESSION_REVOCATION_KEY_PREFIX=consultations:session-revoked:v1:`
- `BOOKING_SLOT_QUEUE_KEY=consultations.booking-slots.v1`
- `NOTIFICATION_QUEUE_KEY=consultations.notifications.v1`

## Security notes

- `/docs` доступен только если `SWAGGER_ENABLED=true` и `NODE_ENV !== production`
- refresh token хранится в `HttpOnly` cookie с `SameSite=Strict`
- для `auth` и internal webhook используются отдельные stricter throttle profiles
- logout/logout-all публикуют session revocation в Redis
- `ws-gateway` отклоняет revoked sessions и разрывает уже открытые socket connections
- внутренние маршруты `/api/v1/internal/*` должны ходить только через доверенные backend-service flows
- demo seed и debug verification links должны включаться только локально
