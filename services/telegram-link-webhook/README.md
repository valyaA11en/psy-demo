# telegram-link-webhook

Go-сервис для webhook-интеграции с Telegram Bot API.

Что делает:

- принимает Telegram updates по `/telegram/webhook`
- обрабатывает `/start <token>` в private chat
- вызывает internal endpoint `api-core` для consume одноразового link token
- отправляет пользователю короткий ответ в Telegram

Основные env:

- `PORT`
- `API_CORE_INTERNAL_BASE_URL`
- `WEBHOOK_SIGNING_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
