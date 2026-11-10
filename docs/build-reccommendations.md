# Build recommendations: what to do differently from the TCSS 460 project

Background on the past project is in [past-project.md](past-project.md). The steps to build all of this are in [hosting-plan.md](hosting-plan.md).

## The main recommendation

**Keep one Next.js app. Do not add a separate backend.**

The past project split into two repos because the course needed several teams and several clients. This app has one developer and one website. Server actions already do what the Express API did, and the Anthropic key and database key already stay on the server. A second service would bring back CORS, token passing, a second deploy and a sleeping free server, and give nothing in return.

Revisit this only if a second client appears (a phone app, a browser extension). Even then, add route handlers under `src/app/api/` to the same app before reaching for a second repo.

## Do differently

| Topic                    | Past project                                                                                 | Recommended here                                                                                                                                          | Why                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure                | Next.js frontend + Express backend, two repos                                                | One Next.js app                                                                                                                                           | See above.                                                                                                                                                        |
| Login                    | Auth.js in the frontend, tokens from the course's Auth² service, token checks in the backend | Supabase Auth                                                                                                                                             | There is no Auth² outside the course. Supabase Auth is already in the Supabase project, is free at this size, and its user ids plug straight into database rules. |
| Who can see which rows   | Checks written by hand in each controller                                                    | Row Level Security (RLS) policies in Postgres, plus a `user_id` column on every table                                                                     | With hand-written checks, one forgotten `where user_id = ...` leaks someone's data. With RLS the database refuses the row even if the code forgets.               |
| Database key             | One connection with full access                                                              | Two clients: a per-user client that RLS applies to, used for all pages and actions; the secret-key client (`src/lib/db.ts`) used only for background jobs | Today every query uses the secret key, which skips RLS. That is fine for one user and unsafe for two.                                                             |
| Database layer           | Prisma                                                                                       | Keep `supabase-js`                                                                                                                                        | Prisma connects as the database owner and skips RLS, which removes the safety net above.                                                                          |
| Passwords                | None stored (Auth² had them)                                                                 | None stored by this app either: "Sign in with Google" through Supabase Auth                                                                               | Keeps the project rule that no passwords are stored.                                                                                                              |
| Hosting                  | Render for both, free servers sleep                                                          | Vercel for the app, Supabase for the database                                                                                                             | Vercel is made for Next.js and has no sleeping server. Render's free tier would also work but wakes slowly.                                                       |
| Secrets in example files | A real `NEXTAUTH_SECRET` value in `.env.example`                                             | Names only, as this repo's `.env.example` already does                                                                                                    | Example files are committed.                                                                                                                                      |

## Keep from the past project

These were good habits in the backend repo and this app doesn't have them yet.

| Habit                                | Past project                              | What to do here                                                                                                                                                                                                                                                                    |
| ------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema changes in git                | Prisma migrations folder                  | Use the Supabase CLI: SQL files in `supabase/migrations/`, applied with `npx supabase db push`, which records what has already run. Right now the tables exist only in the Supabase dashboard and as a description in `CLAUDE.md`, so the database can't be rebuilt from the repo. |
| Input validation                     | zod in `validation.ts`                    | `zod` is already installed here but unused. Validate form input at the top of each server action (ids, status values, URL shape, text length).                                                                                                                                     |
| Tests                                | Jest + supertest, 16 files                | Start small: unit tests for `sameRole` and `norm` in `scripts/check-email.ts`, and one test that user A cannot read user B's rows.                                                                                                                                                 |
| CI                                   | GitHub Actions: format, lint, build, test | Copy the workflow. Run `npm run lint`, `npx tsc --noEmit`, `npm run build`.                                                                                                                                                                                                        |
| Failing early on missing config      | `requireEnvVar`, startup checks           | One small `src/lib/env.ts` that throws a clear message when a variable is missing, instead of `process.env.X!`.                                                                                                                                                                    |
| Keeping third-party keys server-side | TMDB key never reaches the browser        | Already true for the Anthropic key. Keep it that way: never prefix it with `NEXT_PUBLIC_`.                                                                                                                                                                                         |

## Fix in the current code before going multi-user

Small things that are harmless on localhost and matter once the app is hosted.

1. **Writes ignore errors.** `updateStatus`, `saveResume`, `tailorResume` and `markApplied` don't check the `error` Supabase returns. With RLS on, a blocked write fails silently and the page looks like it saved. Check `error` and show a message.
2. **Any id can be opened.** `src/app/jobs/[id]/page.tsx` loads whatever id is in the address bar. RLS fixes this, but only after pages stop using the secret-key client.
3. **`addJob` fetches any URL.** On a hosted server that lets a user make your server request internal addresses. Allow only `https:`, refuse private and local addresses, set a timeout and a size cap.
4. **Uniqueness is table-wide.** `applications.url` and `status_events.email_id` are unique across everyone. Two friends could not add the same posting. Make them unique per user.
5. **Prompts say "he" and "Joshua".** The email prompt in `scripts/check-email.ts` describes one person. Reword it for "the user".
6. **`playwright` and `marked` are dev dependencies** but imported by app code. The hosted build doesn't need Playwright at all (see below); move `marked` to `dependencies` if the resume page uses it.
7. **`layout.tsx` still says "Create Next App".** Set a real title.

## Things that cannot move to a hosted server as they are

| Today                                        | Why it breaks                                                                                                                  | Replacement                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Playwright apply helper (`src/lib/apply.ts`) | It opens a browser window on the machine running the server. Hosted, that machine is in a data centre, not on the user's desk. | Hosted: an Apply button that opens the saved posting link, plus a resume PDF download. Keep the Playwright helper as a tool that only runs on your PC. |
| `data/master-resume.md`, `data/profile.json` | Hosted servers have no lasting disk, and the files are yours alone.                                                            | Columns in a `profiles` table, edited on the profile page.                                                                                             |
| PDFs written to `data/resumes/`              | Same disk problem, and Chromium is too heavy to bundle.                                                                        | A print-styled resume page; the browser's "Save as PDF" makes the file.                                                                                |
| Windows Task Scheduler                       | Runs only on your PC.                                                                                                          | A daily cloud job (Vercel Cron).                                                                                                                       |
| iCloud login in `.env.local`                 | One inbox for the whole app.                                                                                                   | Per-user email intake; options compared in the hosting plan.                                                                                           |

## Order of work

Do the multi-user changes locally first and deploy last. Login, `user_id` and RLS can all be built and tested on localhost with two test accounts. Deploying an app that has no login, even briefly, puts your applications and your Anthropic key's budget on the open internet.
