# Contributing

## Branching

- `main`: protected branch
- feature branches: `feat/<scope>`
- fix branches: `fix/<scope>`
- docs branches: `docs/<scope>`

## Commit style

Use Conventional Commits:

- `feat: add booking creation endpoint`
- `fix: enforce ownership check for consultation details`
- `docs: update security model`

## Pull requests

- small, focused PRs
- link issue or task
- include test notes
- include security impact if auth/data access changed

## Required before merge

- lint passes
- tests pass
- migrations reviewed
- API/docs updated if contract changed
- security-sensitive changes reviewed explicitly
