FROM composer:2 AS vendor

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install \
    --no-dev \
    --no-interaction \
    --prefer-dist \
    --no-progress \
    --optimize-autoloader \
    --no-scripts

COPY . .
RUN composer dump-autoload --optimize --no-dev

FROM php:8.3-cli-alpine

RUN apk add --no-cache libpq \
    && docker-php-ext-install pdo_pgsql pgsql

WORKDIR /app

COPY --from=vendor /app /app

EXPOSE 9000

CMD ["sh", "-c", "php artisan config:clear && php artisan route:clear && php artisan serve --host=0.0.0.0 --port=9000"]
