# Database schema: what the first migration contains

This is the check from step 0, item 7, in [hosting-plan.md](hosting-plan.md). It describes the migration that `npx supabase db pull --remote` created from the tables made by hand in the Supabase dashboard:

`supabase/migrations/20261110223319_remote_schema.sql`

That file is a record of the database as it was on 10 November 2026. Don't edit it. Every change from now on goes in a new migration.

## Result of the check

| Expected                                      | Found | Where in the file |
| --------------------------------------------- | ----- | ----------------- |
| `create table` for `applications`             | Yes   | lines 3–20        |
| `create table` for `status_events`            | Yes   | lines 25–36       |
| Unique constraint on `applications.url`       | Yes   | line 19           |
| Unique constraint on `status_events.email_id` | Yes   | line 34           |
| Row Level Security on for `applications`      | Yes   | lines 22–23       |
| Row Level Security on for `status_events`     | Yes   | lines 38–39       |

The tables match the description in `CLAUDE.md`.

## Constraint names for step 2

Step 2 of the hosting plan drops the two table-wide unique constraints and replaces them with per-user ones. The real names are:

| Table           | Constraint                   | Columns    |
| --------------- | ---------------------------- | ---------- |
| `applications`  | `applications_url_key`       | `url`      |
| `status_events` | `status_events_email_id_key` | `email_id` |

These are the names the step 2 sketch already uses, so it needs no change here.

## The tables

### `applications`

| Column            | Type        | Rule                                    |
| ----------------- | ----------- | --------------------------------------- |
| `id`              | uuid        | Primary key, generated automatically    |
| `company`         | text        | Can be empty                            |
| `title`           | text        | Can be empty                            |
| `location`        | text        | Can be empty                            |
| `url`             | text        | Can be empty; unique when present       |
| `description`     | text        | Can be empty                            |
| `status`          | text        | Required, defaults to `saved`           |
| `tailored_resume` | text        | Can be empty                            |
| `applied_at`      | timestamptz | Can be empty                            |
| `last_update_at`  | timestamptz | Defaults to the time the row is created |
| `notes`           | text        | Can be empty                            |
| `created_at`      | timestamptz | Defaults to the time the row is created |

`applications_status_check` limits `status` to the seven statuses in `src/lib/statuses.ts`: `saved`, `tailored`, `applied`, `interviewing`, `offer`, `rejected`, `withdrawn`. Adding a new status means a migration as well as a code change.

### `status_events`

| Column           | Type        | Rule                                         |
| ---------------- | ----------- | -------------------------------------------- |
| `id`             | uuid        | Primary key, generated automatically         |
| `application_id` | uuid        | Can be empty; points to `applications.id`    |
| `status`         | text        | Required, no list of allowed values          |
| `source`         | text        | Required (`manual` or `email`, not enforced) |
| `email_id`       | text        | Can be empty; unique when present            |
| `email_subject`  | text        | Can be empty                                 |
| `summary`        | text        | Can be empty                                 |
| `created_at`     | timestamptz | Defaults to the time the row is created      |

- `application_id` can be empty because emails that match no job are saved with status `irrelevant` and no application, so they are never classified twice.
- `status` has no check, which is why it can also hold `irrelevant` and `needs_review`.
- Deleting an application deletes its events too (`on delete cascade`, line 74).

## Things in the file you didn't create

### The `ensure_rls` trigger (lines 41–79)

Supabase added a function, `rls_auto_enable`, and an event trigger, `ensure_rls`. Whenever a new table is created in the `public` schema, the trigger turns Row Level Security on for it.

So the tables added in later steps (`profiles`, `ai_usage`, `email_check_runs`) get RLS automatically. They still need policies: a table with RLS on and no policies refuses every request except those made with the secret key.

### Grants (lines 81–103)

These give the `anon` and `authenticated` roles full table permissions. They are Supabase's defaults and look alarming, but they don't open anything up. The roles are allowed to try, and RLS then decides which rows they can reach. Today there are no policies, so the answer is none.

That's why the app works today: it uses the secret key, which bypasses RLS. A request with the publishable key gets no rows.

## Notes for step 2

Three points found while reading this file. All three are now in the step 2 sketch in the hosting plan.

1. **An index on `user_id`.** The file has no indexes beyond the primary keys and the two unique constraints. Every policy filters on `user_id`, so it needs an index or each query reads the whole table. The new `(user_id, url)` and `(user_id, email_id)` unique constraints start with `user_id`, so they serve as that index. A separate `create index ... (user_id)` is only needed if one of those constraints is ever removed.

2. **Policies limited to signed-in users.** The policies use `to authenticated`. Without it a signed-out request is still blocked, because its user id is empty and never matches, but the explicit version states the intent and saves the database a check.

3. **Rows with no application still need an owner.** Some `status_events` rows have no `application_id`, such as the `irrelevant` emails. The step 2 `update status_events set user_id = ...` sets every row, so existing ones get an owner. Background code that inserts new ones with the secret key must set `user_id` itself.
