# Consultations with a Psychologist

Production-like pet project for an online psychology consultation platform.

## Stack

- Frontend: Next.js
- Core API: NestJS
- Realtime: NestJS WebSocket gateway
- Background workers: Go
- Admin panel: Laravel
- Data: PostgreSQL, Redis, S3-compatible storage
- Edge: Nginx
- Packaging: Docker Compose

## What is already prepared

- system architecture blueprint
- product and security requirements
- repository and GitHub standards
- Docker/network design
- database and API module map
- MVP/V2 scope split
- working `apps/api-core` foundation with auth, refresh sessions, public catalog, psychologist self-profile APIs, availability/slot management, transactional bookings, mock payments, and mock video-session access
- working `apps/web-app` demo with catalog, auth, dashboard, booking, mock payment, and session access screens

Main document: [docs/system-blueprint.md](docs/system-blueprint.md)

## Repository intent

This repository is being prepared as a serious engineering portfolio project. The blueprint is written so the codebase can be implemented incrementally without reworking the security model later.

## Core principles

- privacy by design
- least privilege
- production-like service boundaries
- auditable admin operations
- minimal exposure of sensitive mental-health-related data

## Current demo flow

1. Open the public catalog in `apps/web-app`
2. Sign in or register as a client
3. Create a booking from a psychologist profile
4. Complete mock payment from the dashboard
5. Request a short-lived session access token

## Suggested next steps

1. Add `apps/ws-gateway` and notification triggers for bookings, payments, and session readiness.
2. Implement Laravel `admin-panel` for moderation, complaints, and audit views.
3. Add Go workers for slot calculation and notification delivery.
4. Expand CI to run backend and frontend tests as the codebase grows.

## Repo standards

- `CONTRIBUTING.md`
- `SECURITY.md`
- `.env.example`
- `.github/workflows/ci.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`

## Local development target

```bash
docker compose up --build
```

At the current stage the repository contains the architecture package, the first implemented backend service in `apps/api-core`, and a working `Next.js` frontend demo in `apps/web-app`.
