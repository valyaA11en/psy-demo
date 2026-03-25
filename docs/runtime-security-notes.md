# Runtime And Security Notes

Актуальное состояние реализации на март 2026.

## Auth lifecycle

- `register` создаёт пользователя со статусом `pending`
- вход до подтверждения email запрещён
- подтверждение происходит через одноразовый token hash в таблице `email_verification_tokens`
- `verify-email` активирует пользователя и создаёт auth session
- `resend-verification` не раскрывает, существует ли аккаунт

## Session security

- access token короткоживущий
- refresh token хранится в `HttpOnly` cookie
- cookie использует `SameSite=Strict`
- refresh token rotation включён
- logout/logout-all публикуют session revocation в Redis
- `ws-gateway` проверяет revoked session на connect и умеет разрывать живые socket-сессии

## Admin security

- `admin-panel` не доверяет сырому `X-Forwarded-For`
- trusted proxies задаются через `TRUSTED_PROXIES`
- admin login ограничен throttling
- `request_id` для audit logs генерируется сервером
- доступ к `/admin` можно ограничить IP allowlist-ом через `ADMIN_ALLOWED_IPS`

## Internal routes

- `/api/v1/internal/*` должен вызываться только backend-сервисами
- внешний доступ к этим маршрутам режется через `nginx`
- Telegram linking завершает отдельный webhook service, а не публичный клиент

## Local database and seed flow

Рекомендуемый путь для локальной работы без публикации Postgres наружу:

```bash
docker compose --env-file .env.example up -d postgres redis
docker compose --env-file .env.example run --rm api-core npx prisma migrate deploy
docker compose --env-file .env.example run --rm api-core npm run prisma:seed
```

Для локального demo:

```bash
docker compose --env-file .env.example run --rm -e SEED_DEMO_DATA=true api-core npm run prisma:seed
```

## Safe defaults

- `SWAGGER_ENABLED=false`
- `SEED_DEMO_DATA=false`
- `SHOW_DEMO_CREDENTIALS=false`
- `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=false`
- `AUTH_DEBUG_EMAIL_VERIFICATION_LINKS=false`

Если нужен локальный debug flow для verify-email, `AUTH_DEBUG_EMAIL_VERIFICATION_LINKS=true` включается только локально.
