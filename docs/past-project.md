# The TCSS 460 project: why two repos, and what each one does

## Short answer

The backend repo is a server that owns the data and the secrets. The frontend repo is the website people see. They are separate programs that talk over HTTP.

The course split them for three reasons, stated in the backend repo's `client-conversation.md`:

1. **One API can serve many clients.** A website, a phone app and a TV app could all use the same backend.
2. **Teams can work independently.** The API documentation (`openapi.yaml`) is the contract. A frontend team can build against it without reading the backend code.
3. **Each side deploys on its own.** Fixing a button doesn't redeploy the database server.

The course was built around reason 2. In sprints 1 to 4 every group built a backend. In sprints 5 to 8 every group built a frontend **for another group's backend**, using only that group's API docs.

That leads to the part that is easy to miss: **your frontend never talks to your backend.** `group-project-frontend-public-group-4` calls Group 3's API. `group-project-backend-group-4` was built to be used by a different group's frontend.

## The pieces

```
                     ┌──────────────────────────┐
                     │ Auth² (course login site)│
                     │ tcss-460-iam.onrender.com│
                     └───────┬──────────┬───────┘
              1. sign in,    │          │  3. "is this token real?"
                 get a token │          │     (public keys)
                             ▼          ▼
┌─────────┐   pages   ┌────────────┐  2. requests   ┌──────────────┐     ┌──────────┐
│ Browser │ ◄───────► │  Frontend  │ ─────────────► │   Backend    │ ──► │ Postgres │
│         │           │  (Next.js) │  with token    │  (Express)   │     └──────────┘
└─────────┘           └────────────┘                │              │ ──► TMDB (movie data)
                                                    └──────────────┘
```

There are three servers, not two. Login is a third service run by the instructor.

## What the backend does (`group-project-backend-group-4`)

An Express 5 + TypeScript REST API, hosted on Render.

| Job                                     | How                                                                           | Where                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| Stores ratings, reviews and bug reports | Postgres through Prisma                                                       | `prisma/schema.prisma`, `src/controllers/`               |
| Gets movie and TV data                  | Calls TMDB with a secret key, reshapes the answer                             | `src/controllers/search.ts`, `popular.ts`, `featured.ts` |
| Checks who is calling                   | Verifies the login token on each request                                      | `src/middleware/requireAuth.ts`                          |
| Decides who may do what                 | Roles (`User` up to `Owner`); only the author or an admin can delete a review | `requireAuth.ts`, `src/controllers/reviews.ts`           |
| Validates input                         | zod schemas                                                                   | `src/middleware/validation.ts`                           |
| Limits which websites may call it       | CORS allowlist from `CORS_ALLOWED_ORIGINS`                                    | `src/app.ts`                                             |
| Documents itself                        | `openapi.yaml`, shown at `/api-docs`                                          | `src/app.ts`                                             |

Two things it deliberately does not do:

- **It never stores passwords.** A migration named `no_passwords_i_guess` removed the password column. Passwords live on Auth².
- **It never creates login tokens.** It only checks them. It downloads Auth²'s public keys and uses them to confirm a token's signature, issuer and audience (`group-4-api`).

The point of the backend is that it is the only place trusted with secrets: the TMDB key and the database password. A browser can't be trusted with either, because anyone can read what a browser downloads.

## What the frontend does (`group-project-frontend-public-group-4`)

A Next.js 16 app ("MediaRate"), hosted on Render. It has **no database** and no TMDB key.

| Job                             | How                                                                                 | Where                                      |
| ------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| Shows pages                     | App Router pages for `/`, `/movies`, `/tv`, `/profile`                              | `src/app/`                                 |
| Signs the user in               | Auth.js sends the user to Auth², gets a token back, keeps it in an encrypted cookie | `src/auth.ts`                              |
| Reads data                      | `fetch` to Group 3's API                                                            | `src/lib/api.ts`                           |
| Writes ratings and reviews      | Server actions that attach `Authorization: Bearer <token>`                          | `src/lib/ratings.ts`, `src/lib/reviews.ts` |
| Reshapes API answers for the UI | Normalizers                                                                         | `src/lib/normalize.ts`                     |

The writes were moved into server actions for a reason recorded in the commit message "reviews works the same way as ratings now to bypass cors". Group 3's API only accepts browser requests from websites on its allowlist. A server action runs on the Next server, not in the browser, so the allowlist doesn't apply.

That is worth noticing: **the Next.js frontend already has its own server.** Pages render there, server actions run there and the login cookie is decrypted there. A Next.js "frontend" is a small backend that happens to also produce HTML.

## What the split costs

- **CORS.** The browser blocks calls to another site unless that site allows it. This cost the group real time.
- **Passing tokens around.** The frontend has to get a token, store it, attach it to every call and deal with it expiring after 55 minutes.
- **Two deploys, two sets of environment variables, two places for a bug to be.**
- **Slow first request.** Render's free servers sleep when idle, and every request crosses two of them.
- **Every feature is built twice.** Once as an endpoint, once as the code that calls it, with documentation in between.

These costs are worth paying when the reasons above apply: several client apps, or separate teams.

## What this means for the job app

The job app already has what the backend repo provided, inside one Next.js project:

| Past project                   | Job app                                                |
| ------------------------------ | ------------------------------------------------------ |
| Express routes and controllers | Server actions in `src/app/actions.ts`                 |
| Prisma + Postgres on Render    | Supabase (Postgres) through `src/lib/db.ts`            |
| TMDB key kept on the server    | Anthropic key kept on the server (`src/lib/claude.ts`) |
| Auth² + token checks           | Nothing yet. This is the main gap.                     |
| Role checks in controllers     | Nothing yet. Needed once there is more than one user.  |

There is one website, one developer and no phone app, so none of the three reasons for splitting apply. [build-reccommendations.md](build-reccommendations.md) covers what to keep from the past project and what to drop.

## One thing to fix in the old repo

`.env.example` in the frontend repo has a value filled in for `NEXTAUTH_SECRET`, and that file is committed. Example files should list names only. If the deployed site uses that same value, anyone who reads the repo could forge a login cookie, so change it in Render's settings and blank it in the file.
