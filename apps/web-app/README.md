# web-app

Next.js-приложение для публичного каталога, кабинета клиента и психолога, бронирования, mock payments, уведомлений и доступа к сессии.

## Реализованные экраны

- `/` — каталог психологов с фильтрами
- `/auth` — вход и регистрация
- `/dashboard` — кабинет с bookings, payments, notifications и realtime updates
- `/psychologists/[slug]` — карточка психолога и выбор слота
- `/session/[consultationId]` — тестовый доступ к видеосессии

Для психолога в кабинете есть:

- weekly rules
- blackout periods
- appointment slots
- slot generation
- notification preferences
- Telegram deep-link linking

## Локальный запуск

1. Скопировать `.env.example` в `.env.local`
2. Выполнить:

```bash
npm install
npm run dev
```

По умолчанию приложение ожидает:

- `api-core` на `http://localhost:4000/api/v1`
- `ws-gateway` на `http://localhost:4001`

## Важные env-переменные

- `NEXT_PUBLIC_API_BASE_URL`
- `API_INTERNAL_BASE_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=false`

Demo-аккаунты в UI показываются только если `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=true`.
