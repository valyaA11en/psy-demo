# api-core

Основной NestJS API платформы.

## Текущий состав

- инициализация NestJS-приложения
- Prisma schema для основы auth/RBAC/profiles/consent/audit
- auth-модуль с register/login/refresh/logout/logout-all
- JWT access token и refresh token rotation
- пользовательские endpoints самообслуживания
- публичный каталог
- профиль психолога и специализации для самообслуживания
- правила доступности, исключения и слоты записи
- оркестрация бронирования с транзакционным резервированием слота
- тестовые платежи для локального end-to-end тестирования
- тестовое создание видеосессии и временный доступ на подключение
- in-app уведомления и queue publisher для `notification-worker`
- публикация realtime events через Redis для bookings, payments и готовности сессии
- Swagger
- Dockerfile и шаблон env

## Реализованные endpoints

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
2. Указать `DATABASE_URL`
3. Выполнить:

```bash
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

Swagger будет доступен по `/docs`.

## Демо-пользователи

- `admin@example.com` / `Admin12345!`
- `psychologist@example.com` / `Psychologist123!`
- `client@example.com` / `Client12345!`

## Примечания

- Стартовая SQL-миграция сгенерирована в `prisma/migrations/20260323161000_init/migration.sql`
- Миграция уведомлений лежит в `prisma/migrations/20260324103000_add_notifications/migration.sql`
- Фильтры каталога сейчас поддерживают `q`, `specialization`, `language`, `format`, `priceMin`, `priceMax`, `sort`, `page`, `limit`
- Генерация доступности строится на недельных правилах, исключениях доступности, локальных окнах с учётом часового пояса и хранении слотов в UTC
- `availability_exceptions` блокируют автогенерацию слотов; активное исключение нельзя наложить на ручной, удерживаемый или забронированный слот
- `api-core` публикует rebuild jobs для `booking-slot-worker` после изменений правил и исключений доступности
- Создание бронирования требует `Idempotency-Key` и атомарно переводит слот из `open` в `booked`
- История статусов хранится в `consultations` и `consultation_status_history`
- Платежи опираются на `payments` и `payment_events`
- Уведомления опираются на `notifications`; delivery выполняет отдельный Go worker через Redis queue
- Создание платежа тоже требует `Idempotency-Key`; текущий провайдер — тестовая платёжная песочница для локального и демонстрационного использования
- Видеосессия создаётся лениво: после успешной оплаты `video-sessions` выдаёт тестовую комнату и короткоживущий токен на подключение
- Админам намеренно запрещён доступ к ссылкам на сессию и токенам доступа, чтобы исключить избыточный доступ к приватным консультациям
- `api-core` публикует минимальные доменные события в Redis; `ws-gateway` их потребляет, а клиентское приложение перечитывает защищённые данные по REST
- `api-core` также ставит created-notifications в Redis queue, а `notification-worker` завершает их доставку и retry
- Демо-seed включает одобренный профиль психолога, активные правила доступности, будущие свободные слоты, одну запланированную консультацию и стартовые уведомления
- Хранение файлов и более богатые административные сценарии пока остаются следующими шагами
