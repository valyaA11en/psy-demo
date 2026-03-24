# api-core

Основной NestJS API платформы онлайн-консультаций.

## Что реализовано

- регистрация, вход, refresh token rotation, logout и logout-all
- JWT auth, RBAC и audit log
- публичный каталог психологов
- профили психологов и специализации
- weekly availability rules, blackout periods и appointment slots
- booking flow с idempotency key
- mock payments
- video session access flow
- notifications, notification preferences и Telegram linking
- Redis queue publishing для `notification-worker` и `booking-slot-worker`
- realtime event publishing для `ws-gateway`

## Основные endpoints

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
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

1. Скопировать `.env.example` в `.env`
2. Заполнить `DATABASE_URL` и JWT secrets
3. Выполнить:

```bash
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

## Важные env-переменные

- `SWAGGER_ENABLED=false`
- `SEED_DEMO_DATA=false`
- `THROTTLE_TTL=60`
- `THROTTLE_LIMIT=20`
- `AUTH_THROTTLE_TTL=60`
- `AUTH_THROTTLE_LIMIT=5`
- `WEBHOOK_THROTTLE_TTL=60`
- `WEBHOOK_THROTTLE_LIMIT=15`
- `WEBHOOK_SIGNING_SECRET=...`
- `BOOKING_SLOT_QUEUE_KEY=consultations.booking-slots.v1`
- `NOTIFICATION_QUEUE_KEY=consultations.notifications.v1`

`/docs` доступен только если `SWAGGER_ENABLED=true`.

## Demo seed

Demo-данные выключены по умолчанию. Чтобы создать локальные demo-аккаунты и тестовые сущности, запускайте seed с `SEED_DEMO_DATA=true`.

Локальный набор demo-аккаунтов:

- `admin@example.com / Admin12345!`
- `psychologist@example.com / Psychologist123!`
- `client@example.com / Client12345!`

Не включайте этот режим на общем стенде или production-like окружении.

## Security notes

- внутренний Telegram consume endpoint должен вызываться только через `telegram-link-webhook`
- внешний доступ к `/api/v1/internal/*` режется на уровне `nginx`
- админам намеренно не выдаются session links и video access tokens
- refresh token хранится в `HttpOnly` cookie
- throttling включён глобально через `@nestjs/throttler`
- для `auth` и internal webhook используются отдельные более жёсткие throttle-профили
