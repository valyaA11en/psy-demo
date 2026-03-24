# Security Policy

## Scope

This platform handles potentially sensitive psychological consultation data. Security issues must be treated with high priority.

## Reporting

- Do not open public issues for vulnerabilities.
- Report privately to the project maintainer.
- Include reproduction steps, impact, and affected components.

## Sensitive areas

- authentication and session handling
- RBAC and ownership checks
- payments and webhooks
- file uploads and signed URLs
- complaint/review/private consultation data
- admin actions and audit logging

## Security baseline

- secrets are never committed
- refresh tokens are rotated
- admin actions are audited
- Redis/Postgres are not exposed publicly
- sensitive logs are masked/redacted
