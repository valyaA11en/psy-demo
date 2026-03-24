# api-core

NestJS core API for the platform.

## Current scope

- NestJS application bootstrap
- Prisma schema for auth/RBAC/profiles/consent/audit foundation
- auth module with register/login/refresh/logout/logout-all
- JWT access token + refresh token rotation
- user self-service endpoints
- public catalog endpoints
- psychologist self-profile and specialization management
- psychologist availability rules and appointment slots
- booking orchestration with transactional slot reservation
- mock payments flow for local end-to-end testing
- mock video-session provisioning and temporary join access
- Swagger setup
- Dockerfile and env template

## Implemented endpoints

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

## Local setup

1. Copy `.env.example` to `.env`
2. Set `DATABASE_URL`
3. Run:

```bash
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

Swagger will be available at `/docs`.

## Demo users

- `admin@example.com` / `Admin12345!`
- `psychologist@example.com` / `Psychologist123!`
- `client@example.com` / `Client12345!`

## Notes

- Initial migration SQL is generated in `prisma/migrations/20260323161000_init/migration.sql`.
- Catalog filters currently support `q`, `specialization`, `language`, `format`, `priceMin`, `priceMax`, `sort`, `page`, `limit`.
- Availability generation is based on weekly rules, timezone-aware local windows, and UTC slot storage.
- Booking creation requires `Idempotency-Key` and atomically flips the slot from `open` to `booked`.
- Booking history is stored in `consultations` and `consultation_status_history`.
- Payments are backed by `payments` and `payment_events`.
- Payment creation also requires `Idempotency-Key`; the current provider is a mock sandbox for local/demo use.
- Video session provisioning is lazy: once a consultation has a successful payment, `video-sessions` will expose a mock room and issue a short-lived join token.
- Admins are intentionally blocked from session links and access tokens to avoid excessive access to private consultations.
- Demo seed now includes one approved psychologist profile, active availability rules, future open slots, and one scheduled consultation.
- Notifications, files, and websocket updates are planned next.
