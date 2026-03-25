# admin-panel

Laravel backoffice для moderation и operational support платформы.

## Scope

- вход администратора и суперадмина
- dashboard
- users и управление статусами
- moderation queue психологов
- complaints
- payments
- audit logs

Панель использует общую PostgreSQL-схему, созданную `apps/api-core`.

## Локальный запуск

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan serve --host=0.0.0.0 --port=9000
```

Открыть:

- `http://localhost:9000/admin/login` при прямом запуске
- `http://localhost/admin/login` при запуске через корневой `nginx`

## Важные env-переменные

- `APP_KEY`
- `APP_URL`
- `DB_CONNECTION=pgsql`
- `DB_HOST`
- `DB_PORT`
- `DB_DATABASE`
- `DB_USERNAME`
- `DB_PASSWORD`
- `SHOW_DEMO_CREDENTIALS=false`
- `ADMIN_ALLOWED_IPS=127.0.0.1,::1`
- `TRUSTED_PROXIES=127.0.0.1,::1,172.16.0.0/12`

## Security notes

- доступ к `/admin` ограничивается allowlist-ом через `ADMIN_ALLOWED_IPS`
- IP определяется через `$request->ip()` после настройки trusted proxies, а не по сырому `X-Forwarded-For`
- `POST /admin/login` защищён throttling `5/min`
- `request_id` в audit logs генерируется на сервере, а не берётся из клиентского заголовка
- demo credentials в UI показываются только если `SHOW_DEMO_CREDENTIALS=true`
- админский интерфейс намеренно не показывает лишние чувствительные данные клиента

## Demo account

Если общая база была заполнена через `apps/api-core` с `SEED_DEMO_DATA=true`, локально можно использовать:

- `admin@example.com`
- `Admin12345!`

Не включайте demo credentials на публичных стендах.
