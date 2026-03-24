# notification-worker

Go-воркер для доставки уведомлений из очереди Redis и PostgreSQL.

## Что делает

- читает задания из Redis queue
- забирает `queued` и `failed` уведомления из PostgreSQL
- обрабатывает их пулом goroutine-воркеров
- помечает успешно доставленные уведомления как `sent`
- переводит ошибки доставки в `failed` и назначает `next_attempt_at`
- восстанавливает зависшие `processing` уведомления через sweep

## Поддерживаемые каналы

- `in_app`: внутреннее уведомление платформы, помечается как доставленное без внешнего провайдера
- `email`: mock-режим или SMTP-провайдер
- `telegram`: mock-режим или Telegram Bot API

Постоянные ошибки не ретраятся. Временные сетевые ошибки, `429` и `5xx` от Telegram получают backoff и повторную попытку.

## Основные env

- `DATABASE_URL`
- `REDIS_URL`
- `NOTIFICATION_QUEUE_KEY`
- `NOTIFICATION_WORKER_CONCURRENCY`
- `NOTIFICATION_SWEEP_INTERVAL_SEC`
- `NOTIFICATION_SWEEP_BATCH_SIZE`
- `NOTIFICATION_POP_TIMEOUT_SEC`
- `NOTIFICATION_RETRY_BASE_SEC`
- `NOTIFICATION_RETRY_MAX_SEC`
- `NOTIFICATION_PROCESSING_TIMEOUT_SEC`
- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `TELEGRAM_PROVIDER`
- `TELEGRAM_BOT_TOKEN`

## Провайдеры

### Email

- `EMAIL_PROVIDER=mock`: логирует факт доставки без отправки письма
- `EMAIL_PROVIDER=smtp`: отправляет письмо через `net/smtp`

### Telegram

- `TELEGRAM_PROVIDER=mock`: логирует факт доставки при наличии `telegramChatId` в payload
- `TELEGRAM_PROVIDER=bot_api`: вызывает `sendMessage` Telegram Bot API

Для Telegram chat id ожидается в `payload_json` как `telegramChatId` или `chatId`.
