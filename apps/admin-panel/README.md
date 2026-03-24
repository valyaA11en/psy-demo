# admin-panel

Laravel backoffice для модерации и операционной поддержки платформы.

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

Откройте:

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

## Security notes

- доступ к `/admin` можно ограничить allowlist-ом через `ADMIN_ALLOWED_IPS`
- админские сессии изолированы от публичного web-приложения
- UI не показывает лишние чувствительные данные клиента
- demo credentials в UI отображаются только если `SHOW_DEMO_CREDENTIALS=true`

## Demo account

Если общая база была заполнена через `apps/api-core` с `SEED_DEMO_DATA=true`, локально можно использовать:

- `admin@example.com`
- `Admin12345!`

Не включайте demo credentials на публичных стендах.
