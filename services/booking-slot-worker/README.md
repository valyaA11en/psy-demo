# booking-slot-worker

Go-воркер для фоновой генерации и сверки слотов записи психологов.

## Что делает

- периодически ищет психологов, у которых горизонт доступных слотов короче целевого окна
- ставит задачи генерации в Redis queue
- принимает событийные jobs из `api-core` после изменений `availability_rules` и `availability_exceptions`
- обрабатывает их пулом goroutine-воркеров
- безопасно материализует будущие слоты по `availability_rules`
- учитывает `availability_exceptions` как blackout-периоды
- не пересоздаёт уже существующие, забронированные, заблокированные и отменённые интервалы
- отменяет просроченные `open/generated` слоты, которые уже закончились

## Типы jobs

- plain payload: просто `profileId`, используется sweep-планировщиком
- JSON payload: `profileId + rebuildOpenGeneratedSlots + reason + requestedByUserId`, используется `api-core`

Если `rebuildOpenGeneratedSlots=true`, worker сначала удаляет будущие `open/generated` слоты в своём горизонте, а потом пересобирает их заново по активным правилам и исключениям.

## Текущая стратегия генерации

- worker смотрит только на профили со статусами `users.active` и `psychologist_profiles.approved`
- горизонт генерации задаётся через `BOOKING_SLOT_LOOKAHEAD_DAYS`
- если у профиля уже есть активные слоты достаточно далеко вперёд, задача не ставится
- при обычной генерации любые уже существующие интервалы в окне считаются занятыми, включая `cancelled`
- rebuild используется для событийных jobs после изменения правил или исключений доступности

Это сознательно консервативная стратегия: она не ломает ручные отмены слотов и не пытается автоматически переписывать ручные или уже забронированные интервалы.

## Основные env

- `DATABASE_URL`
- `REDIS_URL`
- `BOOKING_SLOT_QUEUE_KEY`
- `BOOKING_SLOT_WORKER_CONCURRENCY`
- `BOOKING_SLOT_SWEEP_INTERVAL_SEC`
- `BOOKING_SLOT_SWEEP_BATCH_SIZE`
- `BOOKING_SLOT_POP_TIMEOUT_SEC`
- `BOOKING_SLOT_LOOKAHEAD_DAYS`
- `BOOKING_SLOT_CLEANUP_BATCH_SIZE`

## Что логируется

- постановка задач генерации в очередь
- количество отменённых просроченных generated-слотов
- успешная генерация или rebuild слотов по профилю
- ошибки обработки профиля

Worker также пишет `audit_logs` с `actor_role=system` и action `appointment_slots.generate_worker` или `appointment_slots.rebuild_worker`, если реально изменил состав слотов.
