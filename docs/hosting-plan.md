# Hosting plan: from a localhost app to a hosted app with logins

This is the step-by-step guide for the goals in `CLAUDEFUTR.md`. Related reading: [past-project.md](past-project.md) and [build-reccommendations.md](build-reccommendations.md).

Limits and prices below were checked in November 2026. Free tiers change, so recheck the linked pages before relying on a number. The code and SQL in this guide are sketches to show the shape of each step. They have not been run.

## Where this ends up

```
┌─────────┐        ┌───────────────────────────────┐        ┌─────────────────────────┐
│ Browser │ ◄────► │ Next.js app on Vercel         │ ◄────► │ Supabase                │
└─────────┘        │  pages, server actions        │        │  Auth (logins)          │
                   │  /api/cron/check-email (daily)│        │  Postgres + RLS (data)  │
                   └──────────┬─────────┬──────────┘        └─────────────────────────┘
                              │         │
                              ▼         ▼
                       Anthropic API   App mailbox (friends forward job emails to it)
```

One app, one database. No separate backend.

## What it costs

| Piece           | Free tier                                                                                                        | What makes you pay                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel (Hobby)  | Free. Functions run up to 300 seconds. Cron jobs run at most once a day, at an approximate time within the hour. | Hobby is for personal, non-commercial use. Charging money or running ads means the paid Pro plan.                                            |
| Supabase (Free) | 500 MB database, 50,000 monthly users, 1 GB file storage, 2 projects.                                            | A free project **pauses after a week with no activity**. The daily cron job in step 6 keeps it awake. No automatic backups on the free plan. |
| Anthropic API   | None. Pay per use.                                                                                               | Every tailoring and every email check. This is the only real running cost. See step 5.                                                       |
| Domain name     | Not needed. Vercel gives a `your-app.vercel.app` address.                                                        | Optional, roughly $10 to $15 a year. Only needed for the instant email option in step 6.                                                     |

So $0 a month is realistic for hosting. AI usage is the exception, and step 5 is about capping it.

## Order of work

Build steps 1 to 7 on localhost and deploy in step 8. A deployed app with no login would put your applications, and your Anthropic bill, on the open internet.

| Step | What                                          | Result                                               |
| ---- | --------------------------------------------- | ---------------------------------------------------- |
| 0    | Supabase CLI and migrations in git            | Database can be rebuilt from the repo                |
| 1    | Login                                         | Signed-out visitors see only the sign-in page        |
| 2    | `user_id` and Row Level Security              | Each user sees only their own rows                   |
| 3    | Profile page and first-login setup            | Master resume and profile live in the database       |
| 4    | Dashboard and details page                    | Cards, search, filters, editable fields, salary      |
| 5    | AI usage tracking and limits                  | A friend can't run up your bill                      |
| 6    | Email per user and email logs                 | Each user's job emails update their own applications |
| 7    | Apply button and resume PDF                   | Works without Playwright                             |
| 8    | Deploy to Vercel                              | Live at a public address                             |
| 9    | Invite friends; checklist before going public |                                                      |

---

## Step 0: Supabase CLI and migrations in git

**Done on 10 November 2026** (pull requests #2 and #3). The first migration is `supabase/migrations/20261110223319_remote_schema.sql`, and [database-schema.md](database-schema.md) describes what's in it. The steps are kept here as a record and for setting up on another computer.

Use the Supabase CLI so every schema change is a file in git, and the database records which files have already run. It's the same idea as `prisma migrate deploy` in the 460 backend.

**`--remote` on every database command.** This version of the CLI aims database commands at a local copy of Supabase by default (`127.0.0.1:54322`). This project uses only the hosted database, so add `--remote` to `db pull`, `db push`, `db dump`, `migration list` and `migration repair`. Without it you get `connect ECONNREFUSED 127.0.0.1:54322`. Don't run `supabase start`; that builds the local copy, which this guide doesn't use. `migration new` only creates a file, so it needs no flag.

1. Start **Docker Desktop** and wait until its engine is running. You don't create any containers yourself; `db pull` starts a temporary one and removes it afterwards.
2. Work on a branch, for example `jk/migrations`.
3. Install the CLI as a dev dependency, so its version is pinned in `package.json`:

   ```powershell
   npm install supabase --save-dev
   ```

4. Set up the folder and connect it to your project:

   ```powershell
   npx supabase init
   npx supabase login
   npx supabase link --project-ref <your project ref>
   ```

   - `init` creates `supabase/` at the repo root, next to `src/` and `scripts/`, with `config.toml` and `.gitignore`. Answer **N** if it asks about Deno settings.
   - `login` opens the browser and saves an access token in your Windows user profile, not in the repo. That token can reach every project on your Supabase account; run `npx supabase logout` on any computer that isn't yours.
   - The project ref is the id in your Supabase dashboard address (`supabase.com/dashboard/project/<ref>`).
   - `link` doesn't ask for the database password; the login token covers it. It writes its details to `supabase/.temp/`, which is gitignored and holds no password.

5. Capture the tables you already made by hand:

   ```powershell
   npx supabase db pull --remote
   ```

   The first run downloads Docker images, which takes a few minutes. It writes the current schema to a timestamped file in `supabase/migrations/`. When it asks **"Update remote migration history table?"**, answer **Y**.

   **Why that answer matters.** The CLI keeps a list of applied migrations in the database (`supabase_migrations.schema_migrations`). `db push` runs every file that isn't on the list. The tables were made in the dashboard, so the list started empty. Without the **Y**, the next `db push` would run this file's `create table` and fail with `relation "applications" already exists`. Answering **Y** puts the file on the list without running it. Neither choice changes your tables or rows.

6. Confirm the CLI knows the tables already exist:

   ```powershell
   npx supabase migration list --remote
   npx supabase db push --remote --dry-run
   ```

   The first shows the migration's timestamp under both **Local** and **Remote**. The second says the remote database is up to date.

   If the timestamp is under **Local** only, the history wasn't updated. Add it by hand, then check again:

   ```powershell
   npx supabase migration repair --status applied <timestamp> --remote
   ```

7. Read the migration file and check it has both tables, the unique constraints on `url` and `email_id`, and Row Level Security on. Don't edit it; it's a record of the database at that moment.
8. Commit `package.json`, `package-lock.json` and `supabase/`. Nothing from `supabase/.temp/` should appear in `git status`.

**From now on, every schema change works the same way:**

```powershell
npx supabase migration new <short_name>
# write the SQL in the new file under supabase/migrations/
npx supabase db push --remote --dry-run
npx supabase db push --remote
```

Commit the migration together with the code that needs it. Don't change tables in the dashboard any more. A change made there isn't in any file, so the repo and the database drift apart.

**Back up before a migration that changes existing tables.** The free plan has no automatic backups. This saves your rows outside the repo, because the file contains your personal data:

```powershell
npx supabase db dump --remote --data-only -f "$HOME\Documents\job-app-backup.sql"
```

**Check:** `npx supabase migration list --remote` shows the initial migration under both Local and Remote, and `supabase/migrations/` is committed.

## Step 1: login

Use Supabase Auth. It is already part of your Supabase project.

**Sign-in method.** Start with "Sign in with Google". Nobody types a password into your app, which keeps the project rule that no passwords are stored. Asking Google only for name and email does not need the security review that reading Gmail does (step 6). Email-and-password can be added later; Supabase stores those passwords hashed on its side, never in your tables.

1. Install the packages:

   ```powershell
   npm install @supabase/ssr
   ```

2. Add two variables to `.env.local` and their names to `.env.example`. Both are safe to expose to the browser; the secret key is not.

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
   ```

3. In the Supabase dashboard: **Authentication → Providers → Google**, and follow its instructions to create a Google OAuth client. Add `http://localhost:3000/auth/callback` to the allowed redirect URLs.

4. Add the files below. Supabase's guide has the full code: <https://supabase.com/docs/guides/auth/server-side/nextjs>.

   | File                             | Purpose                                                                                                                                                    |
   | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `src/lib/supabase/server.ts`     | `createClient()` for server components and actions. Reads the login cookie. Queries made with it are subject to RLS.                                       |
   | `src/lib/supabase/client.ts`     | Browser client, used only by the sign-in button.                                                                                                           |
   | `src/proxy.ts`                   | Runs before each request, refreshes the login cookie, sends signed-out visitors to `/sign-in`. In Next.js 16 this file is `proxy.ts`, not `middleware.ts`. |
   | `src/app/sign-in/page.tsx`       | The sign-in page.                                                                                                                                          |
   | `src/app/auth/callback/route.ts` | Where Google sends the user back; finishes the login.                                                                                                      |
   | `src/lib/auth.ts`                | `requireUser()`: returns the signed-in user's id or redirects to `/sign-in`.                                                                               |

5. On the server, identify the user with `supabase.auth.getClaims()`. Do not trust `getSession()` in server code; it reads the cookie without verifying it.

6. This project has `cacheComponents` on, so reading the login cookie counts as request-time data. It must happen inside a `<Suspense>` boundary, the same way the database reads already do. The Next.js guide for this is in `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`.

7. Keep `src/lib/db.ts` (secret key) but stop importing it from pages and actions. After step 2 it is only for background jobs.

**Check:** open the app in a private window. You land on `/sign-in`. After signing in you reach the dashboard, and a new row appears under **Authentication → Users**.

## Step 2: `user_id` and Row Level Security

This is the step that makes the app safe for more than one person.

This is the first migration that changes tables holding your data, so back up first (step 0).

1. Find your user id: after step 1, sign in once, then copy your row's id from **Authentication → Users** in the dashboard.

2. Create the migration:

   ```powershell
   npx supabase db dump --remote --data-only -f "$HOME\Documents\job-app-backup.sql"
   npx supabase migration new add_user_id
   ```

   Write this in the new file, sketched:

   ```sql
   -- Who owns each row. New rows get the signed-in user's id automatically.
   alter table applications
     add column user_id uuid references auth.users (id) on delete cascade
     default auth.uid();
   alter table status_events
     add column user_id uuid references auth.users (id) on delete cascade
     default auth.uid();

   -- Give every existing row to you, then require the column.
   -- This covers status_events rows with no application_id too
   -- (the "irrelevant" emails), because it sets every row.
   update applications set user_id = '<your user id>';
   update status_events set user_id = '<your user id>';
   alter table applications alter column user_id set not null;
   alter table status_events alter column user_id set not null;

   -- Two users may save the same posting or receive the same email.
   -- Names confirmed in 20261110223319_remote_schema.sql.
   -- The new unique pairs start with user_id, so they also act as
   -- the index the policies below need. No separate index required.
   alter table applications drop constraint applications_url_key;
   alter table applications add unique (user_id, url);
   alter table status_events drop constraint status_events_email_id_key;
   alter table status_events add unique (user_id, email_id);

   -- Each signed-in user can read and change only their own rows.
   -- Signed-out requests match no policy, so they get nothing.
   create policy "own rows" on applications for all to authenticated
     using ((select auth.uid()) = user_id)
     with check ((select auth.uid()) = user_id);
   create policy "own rows" on status_events for all to authenticated
     using ((select auth.uid()) = user_id)
     with check ((select auth.uid()) = user_id);
   ```

   If either unique pair is ever removed, add `create index ... on <table> (user_id)` in its place.

3. Check it, then apply it:

   ```powershell
   npx supabase db push --remote --dry-run
   npx supabase db push --remote
   ```

   The dry run should list only `add_user_id`.

   Steps 3 to 6 add more tables the same way: `migration new`, write the SQL, dry run, `db push --remote`. Supabase's `ensure_rls` trigger turns Row Level Security on for each new table automatically (see [database-schema.md](database-schema.md)), but each one still needs its own policies; until then it refuses every request except those made with the secret key.

4. In `src/app/actions.ts`, `src/app/page.tsx` and `src/app/jobs/[id]/page.tsx`, replace `db` with the per-user client from `src/lib/supabase/server.ts`. The queries themselves barely change, because RLS does the filtering.

5. Check the `error` from every write and show it. With RLS on, a blocked write returns an error or changes zero rows, and today's code ignores both.

6. Background code (`scripts/check-email.ts`, later the cron route) keeps the secret key, which skips RLS. That code must set and filter `user_id` itself on every query, including the `irrelevant` and `needs_review` events that have no application. The `default auth.uid()` doesn't help here: with the secret key there is no signed-in user, so it would be empty and the insert would fail.

**Check:** make a second Google account and sign in with it. The dashboard is empty. Paste the address of one of your own job pages; it shows "not found". Add the same job link under both accounts; both succeed.

## Step 3: profile page and first-login setup

1. New table, sketched:

   ```sql
   create table profiles (
     user_id uuid primary key references auth.users (id) on delete cascade,
     master_resume text,
     profile jsonb,          -- same shape as data/profile.json (the Profile type)
     approved boolean not null default false,   -- used in step 5
     created_at timestamptz not null default now()
   );
   -- Row Level Security is turned on by the ensure_rls trigger;
   -- this line is kept so the file is clear on its own.
   alter table profiles enable row level security;
   create policy "own profile" on profiles for all to authenticated
     using ((select auth.uid()) = user_id)
     with check ((select auth.uid()) = user_id);
   ```

   Users must not be able to set `approved` themselves. Either leave it out of the update the form sends and restrict the column with a grant, or keep it in a separate table only the secret key can write. Decide this when writing the migration.

2. `src/app/profile/page.tsx` with four sections:

   | Section           | Editable               | Source                                                               |
   | ----------------- | ---------------------- | -------------------------------------------------------------------- |
   | Master resume     | Yes (textarea)         | `profiles.master_resume`                                             |
   | Personal info     | Yes (form fields)      | `profiles.profile`, using the `Profile` type in `src/types/apply.ts` |
   | Generated resumes | View, link to each job | `applications` where `tailored_resume` is not null                   |
   | Email check log   | **View only**          | `email_check_runs` (step 6)                                          |

3. First login: in the dashboard, if the user has no master resume yet, redirect to `/profile?setup=1` and show a short "add your resume and details to get started" message.

4. Change `tailorResume` in `src/app/actions.ts` to read the master resume from `profiles` instead of `readFile("data/master-resume.md")`.

5. Copy your own `data/master-resume.md` and `data/profile.json` into your profile through the new page.

The tailoring rule does not change: Claude may only cut, reorder and reword what is in that user's master resume.

**Check:** a new account is sent to the profile page first. Tailoring works with `data/master-resume.md` renamed.

## Step 4: dashboard and details page

Dashboard (`src/app/page.tsx`), top to bottom:

1. **Add a job** (`AddJobForm`, unchanged).
2. **Status totals** (already there).
3. **Search and filters.** A search box for company and role, a status dropdown, and date ranges for applied date and last update. Keep the values in the address bar (`/?q=acme&status=applied`) so a filtered view can be bookmarked and the filtering happens in the database query.
4. **Job cards** replacing the table. New `src/components/JobCard.tsx` showing company, role, location, date applied, last update and status. The whole card links to `/jobs/[id]`.

Details page (`src/app/jobs/[id]/page.tsx`):

1. Migration: `alter table applications add column salary text;` and add `salary` to `JOB_SCHEMA` in `actions.ts` as an optional field, so it is filled in when the posting states it and left empty otherwise.
2. New server action `updateJob` and an edit form for company, role, salary, location, description, status, date applied and notes. Validate with zod.
3. Editing status through this form must still add a `status_events` row, as `updateStatus` does.
4. The Apply button is covered in step 7.

**Check:** search "eng" finds matching roles; combining a status filter narrows it; editing a salary persists after reload.

## Step 5: AI usage and who pays

Your key pays for everyone. Three layers keep that under control, cheapest first.

**Layer 1: a hard cap at Anthropic.** In the Anthropic Console, buy prepaid credits with auto-reload off, and set a monthly spend limit on the workspace the app's key belongs to. Spend limits are set per workspace, and the default workspace may not allow one, so create a workspace for this app. Whatever goes wrong in your code, the bill stops there.

**Layer 2: only approved people.** Signing in with Google lets anyone create an account. The `approved` column from step 3 gates the AI features: new accounts see "waiting for approval" until you tick the box in the Supabase table editor. Your friends message you; you approve them.

**Layer 3: per-user limits.**

1. New table:

   ```sql
   create table ai_usage (
     id bigint generated always as identity primary key,
     user_id uuid not null references auth.users (id) on delete cascade,
     kind text not null,            -- 'add_job', 'tailor', 'email'
     model text not null,
     input_tokens int not null,
     output_tokens int not null,
     created_at timestamptz not null default now()
   );
   ```

   RLS: users can read their own rows; only the secret key inserts.

2. In `src/lib/claude.ts`, have `askText` and `askStructured` return `res.usage` alongside the answer, and record a row after each call.
3. Before each call, count the user's rows this month and refuse past a limit, for example 30 tailorings and 60 added jobs. Show the remaining count on the profile page.
4. Keep the cheaper `CLASSIFY_MODEL` for extraction and email, as now. The email pre-filter (`JOB_WORDS`) and the "never pay for the same email twice" rule already keep email costs low.

To estimate cost: after a week of your own use, sum the tokens in `ai_usage` and multiply by the prices at <https://www.anthropic.com/pricing>.

**For the public later:** let users paste their own Anthropic key (stored encrypted, used only for their calls), or charge a subscription. Either one moves the app off Vercel's Hobby plan if money changes hands.

**Check:** set your own limit to 1, tailor twice, and the second attempt is refused with a clear message.

## Step 6: email per user

### The options

| Option                            | How it works                                                                                                                                                                                     | Cost                                            | Risk                                                                                                                                                                                                                                                                           | Verdict                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| A. Forward to an app mailbox      | The app owns one mailbox. Each user gets a personal address such as `yourapp+k3x9@icloud.com` and sets a rule in their own mail to forward job emails there. A daily job reads that one mailbox. | $0                                              | Low. The app holds one password: its own mailbox's. Users choose what to forward.                                                                                                                                                                                              | **Recommended for friends**                      |
| B. Forward to your own domain     | Same idea with addresses like `k3x9@in.yourapp.com`. Cloudflare Email Routing hands each email to a small Worker, which posts it to the app. Arrives instantly, no polling.                      | A domain name. Routing and the Worker are free. | Low                                                                                                                                                                                                                                                                            | Upgrade from A when you buy a domain             |
| C. Gmail sign-in, read-only       | User clicks "Connect Gmail". The app reads their inbox with Google's permission.                                                                                                                 | $0 to start                                     | Medium. You hold tokens that can read whole inboxes. Google treats this permission as "restricted": in testing mode you get up to 100 named users and they must reconnect every 7 days; going public needs Google's verification and a yearly third-party security assessment. | Not worth it until the app is public and popular |
| D. Outlook sign-in, read-only     | Same as C through Microsoft.                                                                                                                                                                     | $0                                              | Medium. Same token-holding responsibility. Microsoft's review rules were not checked for this guide.                                                                                                                                                                           | Later, if friends use Outlook                    |
| E. Store each user's app password | What the app does today for you, repeated per user.                                                                                                                                              | $0                                              | **High.** An app password can read and send all of a person's mail. One leak of your database exposes every friend's inbox. iCloud offers nothing narrower.                                                                                                                    | Don't                                            |

### Why forwarding fits

- It reuses `src/lib/mail.ts` almost unchanged. `recentEmails` reads one mailbox; only the "which user is this for" step is new.
- No user ever gives you a mail password.
- A user can stop at any time by deleting their forwarding rule.

Two things to know. Some mail providers send a confirmation message to the forwarding address before a rule turns on, so the app needs to show unrecognised emails for a user's address somewhere (or you read the mailbox and pass the code along for the first few friends). And a manually forwarded email wraps the original, so the sender shown is your friend, not the company. The classifier reads the body, so it still works, but test with real forwarded emails before trusting it.

### Build it in stages

**Stage 1, just you (no new code beyond `user_id`).** Keep running `scripts/check-email.ts` on your PC against the same database. Add a `CHECK_EMAIL_USER_ID` variable to `.env.local` and have the script set and filter `user_id` with it.

**Stage 2, friends.**

1. Create a mailbox for the app and an app-specific password for it. These replace `ICLOUD_EMAIL` and `ICLOUD_APP_PASSWORD`.
2. Add `profiles.inbound_token` (random, unique). Show the user's personal forwarding address on the profile page with setup instructions.
3. Move the body of `scripts/check-email.ts` into `src/lib/check-email.ts` as a function that takes a user id and that user's emails. The script and the cron route both call it.
4. In `recentEmails`, also return the address each email was sent to. Group emails by the token in that address; ignore emails with no known token.
5. Add `src/app/api/cron/check-email/route.ts`. It checks the `Authorization: Bearer <CRON_SECRET>` header that Vercel sends, then runs the check for each user. Schedule it in `vercel.json`:

   ```json
   { "crons": [{ "path": "/api/cron/check-email", "schedule": "0 15 * * *" }] }
   ```

   The schedule is in UTC, so `0 15` is 8:00 in Seattle in summer and 7:00 in winter. On the Hobby plan this can run once a day, at some point within that hour. That matches today's plan of a daily 8:00 check, and replaces Windows Task Scheduler.

6. Reword the classifier prompt from "he/his" to "the user".

The rule that email only moves a status forward stays as it is.

### Email logs on the profile page

Today the only log is the terminal output. Add a table and write one row per user per run:

```sql
create table email_check_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  checked int not null default 0,
  added int not null default 0,
  updated int not null default 0,
  needs_review int not null default 0,
  skipped int not null default 0,
  lines jsonb not null default '[]'   -- the messages the script prints today
);
```

RLS: a `select` policy for the owner and **no** insert, update or delete policy. Users can then read their log and cannot change it; only the secret key writes. The profile page lists the runs, newest first.

**Check:** forward a real application email to your personal address, call the cron route by hand, and see the application update and a new log row appear. Forward one to a made-up token and confirm nothing is saved.

## Step 7: Apply button and resume PDF

The Playwright helper opens a browser on the machine running the server. On Vercel that machine is not the user's computer, so the helper cannot be hosted.

1. **Apply button.** On the details page, when the job has a link and the status is `saved` or `tailored`, show "Apply". It opens the saved posting link in a new tab (`target="_blank" rel="noopener noreferrer"`). Next to it, "I submitted it: mark applied", using the existing forward-only logic from `markApplied`.
2. **Resume PDF.** Add `src/app/jobs/[id]/resume/page.tsx`: the tailored resume rendered from Markdown with print styles (reuse `PDF_CSS` from `src/lib/apply.ts`) and a Print button. The browser's "Save as PDF" produces the file. No Chromium on the server and nothing written to disk.
3. **Copy helpers.** Optional: show the user's profile fields with copy buttons beside the Apply button.
4. Hide `ApplyPanel` unless an environment variable such as `LOCAL_APPLY=1` is set, so the Playwright filler keeps working on your PC and never appears on the hosted site.

The app still never submits an application. The user does.

**Check:** with `LOCAL_APPLY` unset, the job page shows the Apply button and no Playwright panel; the printed resume fits one page.

## Step 8: deploy

1. Push the repo to GitHub (it already is) and merge the finished branches into `main`.
2. At <https://vercel.com>, sign in with GitHub, choose **Add New → Project**, and import the repo. Vercel detects Next.js; no settings to change.
3. Under **Settings → Environment Variables**, add every name from `.env.example` with its value, plus `CRON_SECRET` (a long random string). Never add `LOCAL_APPLY`.
4. Deploy. Note the address, for example `https://job-autopilot.vercel.app`.
5. In Supabase, **Authentication → URL Configuration**: set the Site URL to that address and add `https://<address>/auth/callback` to the redirect list. Add the same callback in the Google OAuth client.
6. In the Vercel project, confirm the cron job is listed under **Settings → Cron Jobs**.

From here, every merge to `main` deploys automatically, and every pull request gets its own preview address.

**Check:** sign in on your phone using mobile data. Add a job, tailor a resume, open the profile page.

One known difference: some company career sites refuse requests from data-centre addresses that they accepted from your home connection. `addJob` already handles that by asking for the description to be pasted.

## Step 9: friends, then the public

**Before inviting friends**

- [ ] Signed in as a second account, you cannot see or open any of your own rows.
- [ ] Every table has RLS on with a policy. A table with RLS off is readable by anyone with the publishable key.
- [ ] The secret key and the Anthropic key have no `NEXT_PUBLIC_` prefix and are imported only by server files.
- [ ] `addJob` only fetches `https:` links, refuses local and private addresses, and has a timeout.
- [ ] The Anthropic workspace has a spend limit, and per-user limits are on.
- [ ] Unapproved accounts cannot trigger any Claude call.
- [ ] Tell your friends plainly what the app stores: their resume, their profile details, and the text of the emails they forward, which is also sent to Anthropic for sorting.

**Before opening it to anyone**

- [ ] A privacy policy and a "delete my account and data" button. The `on delete cascade` in the tables above makes deletion one call.
- [ ] Database backups (a paid Supabase plan, or a scheduled export).
- [ ] Request limits per user on the server actions that call Claude, on top of the monthly limits.
- [ ] Job postings and emails are text written by strangers. The prompts already use forced tool output through `askStructured`, which limits what injected instructions can do; keep it that way, and never let model output decide whose data is read or written.
- [ ] A way to pay for AI: users' own keys or a subscription.
- [ ] Vercel Pro if the app earns money, and a decision on email options B or C.

## Answers to the open problems in `CLAUDEFUTR.md`

| Problem                                      | Answer                                                                                                                                                                                                 | Step    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| How do users get AI for tailoring and email? | The same server code as today, running on Vercel with your key. Users never see the key. Each call is tied to the signed-in user and counted.                                                          | 5       |
| Security                                     | Supabase Auth for login, RLS so the database enforces ownership, secret keys only on the server, limits on what `addJob` will fetch. Checklists in step 9.                                             | 1, 2, 9 |
| Email access per user                        | Users forward job emails to a personal address at a mailbox the app owns. No user mail passwords are stored. Gmail and Outlook sign-in compared as later options.                                      | 6       |
| Who pays for the AI                          | You, capped three ways: a spend limit at Anthropic, approval before an account can use AI, and monthly per-user limits. Own-key or subscription when public.                                           | 5       |
| Parts that only work on your PC              | Resume and profile move to the database; PDFs come from a print page; Task Scheduler becomes a daily Vercel cron job; the Playwright filler stays local and the hosted site gets a plain Apply button. | 3, 6, 7 |

## Sources checked

- Vercel function limits: <https://vercel.com/docs/functions/limitations>
- Vercel cron limits by plan: <https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing>
- Vercel Hobby plan terms: <https://vercel.com/docs/plans/hobby>
- Supabase pricing and limits: <https://supabase.com/pricing>
- Supabase login for Next.js: <https://supabase.com/docs/guides/auth/server-side/nextjs>
- Google's review for Gmail access: <https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification>
- Cloudflare Email Routing limits: <https://developers.cloudflare.com/email-routing/limits>
- Anthropic workspaces and spend limits: <https://support.claude.com/en/articles/9796807-creating-and-managing-workspaces>

The Supabase, Gmail and Anthropic details came from search summaries of those pages and of third-party guides, not from reading each official page in full. The Vercel function limits were read directly.
