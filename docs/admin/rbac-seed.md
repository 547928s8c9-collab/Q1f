# Admin RBAC Seeding

After running migrations, seed admin roles and permissions:

- `npm run db:seed`

Notes:
- Seeding is idempotent and safe to re-run.
- To auto-assign the `super_admin` role, set `ADMIN_SUPER_EMAIL` to an existing user email before running `db:seed`.
