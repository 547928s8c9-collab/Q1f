# Database Migrations (Drizzle)

## Why migrations (not just `db:push`)

`drizzle-kit push` is convenient for local development, but it does not create or record a migration history. That means schema changes are not reproducible or reviewable, and production rollouts are fragile.

For reproducible history and CI-friendly changes, generate migrations and apply them with `db:migrate`.

## Replit workflow

1. Create a migration from the current schema:
   - `npm run db:generate`

2. Apply migrations to the database:
   - `npm run db:migrate`

3. Local development only (no history):
   - `npm run db:push`

## Notes

- Always commit generated migration files.
- Use `db:push` only for fast local iteration, not for production or shared environments.
