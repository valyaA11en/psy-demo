# web-app

Next.js application for the public catalog, client dashboard, booking flow, mock payments, and mock session access.

## Implemented screens

- `/` public catalog with filters and psychologist cards
- `/auth` login and registration
- `/dashboard` role-aware booking and payment workspace
- `/psychologists/[slug]` psychologist profile and slot selection
- `/session/[consultationId]` mock video access flow

## Local setup

1. Copy `.env.example` to `.env.local`
2. Run:

```bash
npm install
npm run dev
```

By default the app expects `api-core` at `http://localhost:4000/api/v1`.
