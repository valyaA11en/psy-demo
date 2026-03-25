# Консультации с психологом

Production-like pet project full-stack платформы для онлайн-консультаций с психологами.

## Стек

- Frontend: Next.js
- Core API: NestJS + Prisma
- Realtime: NestJS WebSocket gateway
- Workers: Go
- Admin panel: Laravel
- Data: PostgreSQL, Redis, S3-compatible storage
- Edge: Nginx
- Infrastructure: Docker Compose

## Что уже реализовано

- `apps/api-core`: auth, email verification, catalog, availability, bookings, reviews, complaints, notifications, mock payments, mock video access
- `apps/web-app`: каталог, auth flow, verify email flow, dashboard клиента и психолога, booking flow, отзывы, жалобы, realtime updates
- `apps/ws-gateway`: JWT socket auth, Redis pub/sub, session revocation disconnect
- `apps/admin-panel`: moderation, users, complaints, payments, audit logs
- `services/booking-slot-worker`
- `services/notification-worker`
- `services/telegram-link-webhook`

## Быстрый локальный запуск

1. Проверить `.env.example` в корне репозитория.
2. Поднять базовые сервисы:

```bash
docker compose --env-file .env.example up -d postgres redis
```

3. Применить миграции:

```bash
docker compose --env-file .env.example run --rm api-core npx prisma migrate deploy
```

4. Заполнить базу данными.
Только роли:

```bash
docker compose --env-file .env.example run --rm api-core npm run prisma:seed
```

Локальный demo seed:

```bash
docker compose --env-file .env.example run --rm -e SEED_DEMO_DATA=true api-core npm run prisma:seed
```

5. Поднять весь стек:

```bash
docker compose --env-file .env.example up --build
```

## Security defaults

Проект поднимается с безопасными дефолтами:

- `SWAGGER_ENABLED=false`
- `SEED_DEMO_DATA=false`
- `SHOW_DEMO_CREDENTIALS=false`
- `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=false`
- `AUTH_DEBUG_EMAIL_VERIFICATION_LINKS=false`
- `ADMIN_ALLOWED_IPS=127.0.0.1,::1`

Дополнительно:

- внешний доступ к `/api/v1/internal/*` блокируется через `nginx`
- `Postgres` и `Redis` остаются во внутренней Docker-сети
- `MinIO` по умолчанию не публикует порты наружу
- refresh cookie использует `HttpOnly + SameSite=Strict`
- admin-панель использует IP allowlist и trusted proxies

## Demo режим

Для локального demo можно явно включить:

- `SEED_DEMO_DATA=true`
- `SHOW_DEMO_CREDENTIALS=true`
- `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=true`
- `AUTH_DEBUG_EMAIL_VERIFICATION_LINKS=true`

Demo-аккаунты:

- `admin@example.com / Admin12345!`
- `psychologist@example.com / Psychologist123!`
- `client@example.com / Client12345!`

Используйте этот режим только локально.

## Документация

- Основной blueprint: [docs/system-blueprint.md](./docs/system-blueprint.md)
- Runtime и security notes: [docs/runtime-security-notes.md](./docs/runtime-security-notes.md)
- API service: [apps/api-core/README.md](./apps/api-core/README.md)
- Web app: [apps/web-app/README.md](./apps/web-app/README.md)
- Admin panel: [apps/admin-panel/README.md](./apps/admin-panel/README.md)
