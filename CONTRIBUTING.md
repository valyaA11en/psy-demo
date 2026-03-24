# Contribution Guide

## Ветвление

- `main`: защищённая ветка
- feature-ветки: `feat/<scope>`
- fix-ветки: `fix/<scope>`
- docs-ветки: `docs/<scope>`

## Стиль коммитов

Используем Conventional Commits:

- `feat: add booking creation endpoint`
- `fix: enforce ownership check for consultation details`
- `docs: update security model`

## Pull requests

- небольшие и сфокусированные PR
- ссылка на issue или задачу
- заметки о проверках и тестах
- отдельная пометка о security impact, если менялись auth, доступ или чувствительные данные

## Обязательно перед merge

- lint проходит
- тесты проходят
- миграции просмотрены
- API и документация обновлены, если поменялся контракт
- security-sensitive изменения отдельно проверены
