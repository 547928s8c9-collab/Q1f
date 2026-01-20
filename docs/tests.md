# Tests

## Running all tests (auto-skip DB tests without DATABASE_URL)

```bash
npm run test
```

When `DATABASE_URL` is not set, DB-backed tests are skipped automatically so the suite stays green.

## Running DB tests

Set `DATABASE_URL` to a reachable Postgres instance (and make sure the schema is present/seeded):

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/dbname npm run test
```

DB-backed tests currently include:
- `server/__tests__/investApi.test.ts`
- `server/__tests__/e2e/money-flows.test.ts`
- `server/marketData/loadCandles.test.ts`

## Running unit-only tests

Explicitly unset `DATABASE_URL` to run only unit tests (DB suites will be skipped):

```bash
env -u DATABASE_URL npm run test
```

On shells that do not support `env -u`, you can also do:

```bash
DATABASE_URL= npm run test
```
