# ws-gateway

NestJS WebSocket gateway для доменных событий в реальном времени.

## Зоны ответственности

- аутентифицировать websocket-клиентов тем же access JWT, что использует `api-core`
- подписываться на Redis pub/sub с доменными событиями
- доставлять минимальные booking, payment и session events авторизованным пользователям
- держать realtime payloads privacy-safe и заставлять клиента перечитывать защищённые данные через REST

## Локальный запуск

1. Скопировать `.env.example` в `.env`
2. Выполнить:

```bash
npm install
npm run start:dev
```

Gateway ожидает:

- `JWT_ACCESS_SECRET`, совпадающий с `api-core`
- `REDIS_URL`, указывающий на тот же Redis, что и `api-core`
- websocket path `/ws/socket.io`

## Socket events

- server -> client `ws.ready`
- server -> client `ws.expired`
- server -> client `domain_event`
- client -> server `realtime:ping`

`domain_event` намеренно несёт только минимальные метаданные и флаг `requiresRefetch`. Детали бронирований и оплат нужно забирать из `api-core`.
