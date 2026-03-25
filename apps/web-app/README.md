# web-app

Next.js-приложение для публичного каталога, личного кабинета клиента и психолога, записи на консультации и доступа к сессии.

## Реализованные экраны

- `/` — каталог психологов с фильтрами
- `/auth` — вход, регистрация и повторная отправка verification email
- `/auth/verify-email` — подтверждение email и старт auth session
- `/dashboard` — кабинет с bookings, payments, notifications, reviews, complaints и realtime updates
- `/psychologists/[slug]` — карточка психолога, отзывы и выбор слота
- `/session/[consultationId]` — тестовый доступ к видеосессии

## Что умеет UI

Для клиента:

- история консультаций
- mock payments
- публикация отзыва после завершённой консультации
- отправка жалобы по конкретной консультации
- доступ к уведомлениям и видеосессии

Для психолога:

- weekly rules
- blackout periods
- appointment slots
- slot generation
- notification preferences
- Telegram deep-link linking

## Auth flow

- регистрация больше не логинит пользователя сразу
- после `register` UI показывает состояние ожидания подтверждения email
- `verify-email` страница завершает регистрацию и создаёт сессию
- повторная отправка письма доступна из `/auth`
- если включён `AUTH_DEBUG_EMAIL_VERIFICATION_LINKS=true` на backend, UI может показать debug verification link

## Локальный запуск

1. Скопировать `.env.example` в `.env.local`
2. Выполнить:

```bash
npm install
npm run dev
```

По умолчанию приложение ожидает:

- `api-core` на `http://localhost/api/v1` через `nginx`
- `ws-gateway` на `http://localhost`

## Важные env-переменные

- `NEXT_PUBLIC_API_BASE_URL`
- `API_INTERNAL_BASE_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=false`

Demo-аккаунты в UI показываются только если `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=true`.
