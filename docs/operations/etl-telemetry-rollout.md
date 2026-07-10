# ETL telemetry production rollout

This runbook applies only `db/migrations/0009_calm_hardball.sql`, which creates the server-internal `public.etl_runs` table used by the data/methodology freshness panel.

## Production status

Applied successfully to project `ksioqroabymddsmhemhr` on July 9, 2026 as the targeted Supabase migration `20260709213928_add_etl_run_telemetry`.

Post-apply verification confirmed:

- `public.etl_runs` exists with the expected nine columns, primary key, status check constraint, and `etl_runs_status_started_at_idx` index.
- RLS is enabled and there are no policies.
- `anon`, `authenticated`, and `service_role` have no `SELECT`, `INSERT`, `UPDATE`, or `DELETE` privileges on the table.
- The table is initially empty, as expected.
- The application route returned HTTP 200 through its configured direct PostgreSQL connection with `historyAvailable: true`, `historyUnavailableReason: null`, and coverage of 3,818 processed maps out of 3,818 total maps.
- Supabase advisors reported only the expected informational no-policy notice for this private table and an unused-index notice while the table is empty; no migration-specific security error was introduced.

The next scheduled daily ETL execution will create the first run-history record.

## Why this must be targeted

Production currently records five Drizzle migrations (`0000` through `0004`) in `drizzle.__drizzle_migrations`, while later schema objects are already present. Do **not** run `npm run db:migrate` against production until that historical drift is reconciled: it would attempt to replay unrelated migrations beginning at `0005`.

Apply this SQL as one named Supabase production migration instead:

- Migration name: `add_etl_run_telemetry`
- SQL source: `db/migrations/0009_calm_hardball.sql`
- Project: `ksioqroabymddsmhemhr`

The migration creates one table and one index, enables RLS, and revokes all table privileges from `PUBLIC`, `anon`, `authenticated`, and `service_role`. The ETL and Next.js server use the direct PostgreSQL connection owned by the application database role; no Data API role needs access.

## Verified preflight

Read-only production checks on July 9, 2026 established:

- `public.etl_runs` does not exist.
- PostgreSQL is `15.8`.
- `anon`, `authenticated`, and `service_role` exist.
- `public.maps` contains 3,818 rows and all 3,818 are marked processed.
- Supabase migration history contains no entries; Drizzle history contains only `0000`–`0004`.

## Post-apply verification

Run these read-only checks immediately after applying the migration:

```sql
select
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'etl_runs';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'etl_runs'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by grantee, privilege_type;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'etl_runs'
order by indexname;
```

Expected results:

- `rls_enabled = true`.
- No client/Data API role grants are returned.
- The primary-key index and `etl_runs_status_started_at_idx` exist.

Then request `/api/data-methodology`. It should report `historyAvailable: true` and no migration-required reason. The table will initially have no successful run; the next scheduled daily ETL execution writes the first complete history record, including the exact completion time of `scrape-new-maps`.

Finally, rerun Supabase security and performance advisors. An informational `rls_enabled_no_policy` notice for `etl_runs` is expected and intentional because all Data API grants are revoked and the table is direct-connection-only.
