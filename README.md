# Консультации с психологом

Production-like pet project full-stack платформы для онлайн-консультаций с психологами.

## Стек

- Frontend: Next.js
- Core API: NestJS
- Realtime: NestJS WebSocket gateway
- Workers: Go
- Admin panel: Laravel
- Data: PostgreSQL, Redis, S3-compatible storage
- Edge: Nginx
- Infrastructure: Docker Compose

## Что уже реализовано

- `apps/api-core` с auth, catalog, availability, bookings, mock payments, notifications и video access flow
- `apps/web-app` с каталогом, auth, dashboard, booking flow и realtime updates
- `apps/ws-gateway` с JWT socket auth и Redis pub/sub
- `apps/admin-panel` для moderation, complaints, payments и audit logs
- `services/booking-slot-worker`
- `services/notification-worker`
- `services/telegram-link-webhook`

Основной документ: [system-blueprint.md](C:/Users/vakhm/OneDrive/Desktop/project/consultations%20with%20a%20psychologist/docs/system-blueprint.md)

## Локальный запуск

```bash
docker compose up --build
```

## Security defaults

Проект поднимается с более жёсткими дефолтами:

- `SWAGGER_ENABLED=false`
- `SEED_DEMO_DATA=false`
- `SHOW_DEMO_CREDENTIALS=false`
- `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=false`
- `ADMIN_ALLOWED_IPS=127.0.0.1,::1`

Дополнительно:

- внешний доступ к `/api/v1/internal/*` блокируется через `nginx`
- demo seed и demo credentials нужно включать явно
- Redis и Postgres остаются во внутренней Docker-сети
- MinIO по умолчанию не публикует порты наружу и доступен только внутри Docker-сети

## Demo режим

Для локального demo можно явно включить:

- `SEED_DEMO_DATA=true`
- `SHOW_DEMO_CREDENTIALS=true`
- `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=true`

После этого появятся demo-аккаунты:

- `admin@example.com / Admin12345!`
- `psychologist@example.com / Psychologist123!`
- `client@example.com / Client12345!`

Используйте этот режим только локально.
