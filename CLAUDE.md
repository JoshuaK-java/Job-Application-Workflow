# Job Application Autopilot

@AGENTS.md

A personal web app for Joshua's job search. It runs locally on his Windows PC (localhost only, no login).

1. He pastes a job link into the dashboard. The app scrapes the posting and Claude extracts company, title, location and description.
2. Claude tailors his master resume (`data/master-resume.md`) to the posting. He reviews and edits it.
3. A daily script reads his iCloud Mail, classifies job emails with Claude and updates each application's status.
4. The dashboard shows every application and its status history.

Full build guide (source of truth for the plan): https://claude.ai/artifact/1bY8Db3AS4kDY6aqocaRTH

## Environment

- Windows, VS Code terminal is **PowerShell**. Give PowerShell commands (e.g. `mkdir data, scripts`, not `mkdir data scripts`). PowerShell can drop `--` in `npm run x -- arg`; use `npx tsx --env-file=.env.local scripts/<file>.ts <arg>` instead.
- Node 24. Next.js 16.4 (App Router, Turbopack, Tailwind 4), React 19.3, TypeScript.
- The Next app is the git repo root (`Job-Application-Workflow`). Source lives in `src/`; `scripts/` and `data/` sit at the root.
- Email is **iCloud Mail over IMAP** (`imapflow` + `mailparser`), not Gmail.

## Stack

| Piece | Tool |
| --- | --- |
| Database | Supabase (Postgres), accessed only server-side with the secret key |
| AI | Anthropic SDK; `TAILOR_MODEL` for resumes, `CLASSIFY_MODEL` for extraction and email sorting |
| Email | iCloud IMAP, inbox opened read-only |
| Form filling (planned) | Playwright |

`.env.local` holds `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase secret key, `sb_secret_...`), `ANTHROPIC_API_KEY`, `TAILOR_MODEL`, `CLASSIFY_MODEL`, `ICLOUD_EMAIL`, `ICLOUD_APP_PASSWORD`. **Never read, print or commit `.env.local`.**

## Files

- `src/lib/statuses.ts`: the status list. Safe for client components.
- `src/lib/db.ts`: Supabase client with the secret key. **Server-only; never import it from a `"use client"` file** (import statuses from `@/lib/statuses` instead).
- `src/lib/claude.ts`: `askText` (free text, used for resume tailoring) and `askStructured<T>(model, system, user, schema, maxTokens)`, which uses **tool use with a forced `tool_choice`** so Claude returns an object matching a JSON Schema. Use `askStructured` for any structured output; never ask for JSON in a prompt and parse text.
- `src/lib/mail.ts`: `recentEmails(days)` over IMAP.
- `src/app/actions.ts`: server actions `updateStatus`, `addJob`, `tailorResume`, `saveResume`.
- `src/app/page.tsx`: dashboard. `src/app/jobs/[id]/page.tsx`: job page with tailoring and history.
- `src/components/`: client components (`AddJobForm`, `StatusSelect`, `ApplyPanel`).
- `src/types/`: shared object types (`apply.ts`: `Profile`, `ApplyJob`, `ApplyResult`; `email.ts`: `Email`).
- `scripts/check-email.ts`: run with `npm run check-email` (default 3 days back; pass a number for more).
- `data/master-resume.md`: the master resume. Has no graduation dates yet; Joshua was asked to add them.

## Conventions

Matches the TCSS 460 group project (`group-project-frontend-public-group-4`).

Layout:
- `src/app/` routes and server actions, `src/components/` React components, `src/lib/` server code and helpers, `src/types/` shared types. `@/*` maps to `./src/*`.
- Config files (`next.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `.env.example`) at the repo root. Terminal scripts in `scripts/`, run with `tsx` (it understands the `@/` alias).

Code style:
- Components: one per file in `src/components/`, PascalCase file name, `export default function Name`. Props as `interface NameProps` above the component.
- Shared object shapes go in `src/types/*.ts` as `interface`. Types used in one file stay in that file. Use `type` only for unions and derived types (e.g. `Status`).
- Imports: always `@/...`, never `../`. Package imports first, a blank line, then `@/` imports. A blank line after `"use client"` / `"use server"`.
- Formatting: Prettier defaults (80 columns, double quotes, semicolons, trailing commas). No config file; format with `npx prettier --write <files>`.
- Lint: `npm run lint` (`next/core-web-vitals` + `next/typescript`).

Git:
- `main` is the stable branch. Work on `jk/<topic>` branches and merge into `main` with a pull request.
- Commit messages: short, lowercase, plain description of the change (e.g. `apply panel added`, `fix status dropdown not saving`). No prefixes like `feat:`.
- `.env*` is ignored except `.env.example`, which lists variable names with no values.

## Next.js 16 rules for this project

`next.config.ts` enables `cacheComponents`. So:

- Do **not** use `export const dynamic`, `revalidate` or other old route segment config.
- Put database reads in an async component wrapped in `<Suspense>`, and call `await connection()` (from `next/server`) before the query.
- Await `params` inside the Suspense boundary.
- After mutations, call `revalidatePath`.
- Check `node_modules/next/dist/docs/` before using an API you're unsure about.

## Database

- `applications`: `id`, `company`, `title`, `location`, `url` (unique, nullable: jobs found in email have no link), `description`, `status`, `tailored_resume`, `applied_at`, `last_update_at`, `notes`, `created_at`. `status` is one of `saved`, `tailored`, `applied`, `interviewing`, `offer`, `rejected`, `withdrawn`.
- `status_events`: `id`, `application_id`, `status`, `source` (`manual` or `email`), `email_id` (unique), `email_subject`, `summary`, `created_at`. Emails that don't match an application are stored with status `irrelevant` so they are never paid for twice.
- Row Level Security is on for all tables; the app uses the secret key, which bypasses it.

## Rules that must not change

- **Resume tailoring never invents anything.** It may only cut, reorder and reword what's in the master resume.
- **Never auto-submit applications.** The apply helper fills fields; Joshua reviews and clicks Submit himself.
- Email status only moves forward (a late "received" email can't undo "interviewing").
- No passwords stored anywhere except the iCloud app-specific password in `.env.local`.

## Progress

Done:
- Steps 0–5 written: project setup, Supabase tables, dashboard, add job by link, resume tailoring, iCloud email checker. Code type-checks.

Email script behaviour:
- Processes emails oldest first. If an application email matches no tracked job, it adds the job itself (company, title, location from the email, no URL or description, note "Added automatically from email"). He often applies to several roles at one company, so matching uses company AND role (`sameRole` in the script). An email that doesn't name the role, from a company with several tracked roles, is saved as a `needs_review` event and listed in a "Needs review" box on the dashboard.
- Jobs added from email have no description, so the job page hides the Tailor button for them.
- Email classification uses `askStructured` with `VERDICT_SCHEMA`; job extraction in `addJob` uses `JOB_SCHEMA`. `askStructured` retries once with double the tokens if the answer is cut off. If an email still fails, the script logs `Skipped "<subject>"` and continues without saving it as checked, so the next run retries it. Never let one bad email crash the whole run.
- `addJob` logs the real Claude error to the terminal and shows it on the page instead of a generic message.
- To redo the email backfill from scratch: `delete from status_events where source = 'email'; delete from applications where notes = 'Added automatically from email';` then `npx tsx --env-file=.env.local scripts/check-email.ts 60`.

Adding jobs from Indeed/LinkedIn/Glassdoor/ZipRecruiter:
- These sites block automated reading (Indeed answers a 401 bot-check page). `addJob` doesn't try to fetch them; it asks Joshua to paste the description and the form opens the paste box. Do **not** add bot-detection workarounds (stealth flags, scraping with his signed-in session, etc.).
- Indeed search-result links (`vjk=`) are normalized to `/viewjob?jk=` so the stored link is the job itself.

Apply helper (Step 7, done):
- Joshua uses it from the **Apply panel on the job page** (`src/components/ApplyPanel.tsx` → server actions in `src/app/apply-actions.ts`), not the terminal. Shown only for jobs with a URL and a tailored resume. Buttons: Open application → Fill form (can repeat on multi-page forms) → "I submitted it: mark applied" or Close browser.
- Logic lives in `src/lib/apply.ts` (server-only). The Next server process launches a visible Chromium window on his PC; the single open browser is kept on `globalThis` (persistent profile `data/browser-profile` can only be opened once). Playwright is in Next's default `serverExternalPackages`, so no config needed.
- Renders the tailored resume to a PDF in `data/resumes/` (gitignored, as is the browser profile), fills empty fields from `data/profile.json` across all frames (Greenhouse-style iframes), attaches the PDF to the resume file input (not the cover letter one). Never overwrites a filled field and never clicks Submit.
- Marks applied only if status is `saved` or `tailored` (status only moves forward).
- `scripts/apply.ts` is a terminal fallback using the same lib (`npx tsx --env-file=.env.local scripts/apply.ts <job id>`).

Not done yet:
- Step 6: schedule `npm run check-email` daily with Windows Task Scheduler (8:00, "run as soon as possible after a missed start").
- Hosted multi-user version with login: goals in `CLAUDEFUTR.md`, step-by-step plan in `docs/hosting-plan.md` (also `docs/past-project.md`, `docs/build-reccommendations.md`). Nothing built yet. Plan: one Next.js app on Vercel, Supabase Auth, `user_id` + RLS, no separate backend.
- Ideas for later: cover letter generator, "no reply in 3 weeks" follow-up flag, DOCX resume download.
