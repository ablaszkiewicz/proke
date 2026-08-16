# Backend audit — pre-launch

> **Status: 14 of 30 addressed.** Fixed: S1, S2, S3, S7, S8, C1, C4, C5, C6, C9, D1, D2, D3, I1,
> plus all six false comments. Deferred by decision: S4, S5, S6, C2, C3, C7, C8, D4, D5, D6, D7,
> I2, I3, I4, I5, I6. Suite is 151 green (was 123).
>
> One action is required before the next deploy: add a **`STATE_SIGNING_SECRET`** repository
> secret. The backend now refuses to start in production without it.

Full read of `backend/` (~100 files, 4,420 lines of `src`), plus the Dockerfile, CI workflows and
Caddy config that carry it to production. Findings are numbered so the plan at the bottom can
point at them.

**Overall:** this is a well-built codebase. Layering is consistent, the webhook and OAuth
signature verification is correct, secrets are properly gitignored, `escapeRegExp` and the Slack
mrkdwn escaping show someone thinking about hostile input, and there is a real 2,900-line e2e
suite. Nothing here is a rewrite. What follows is the gap between "good code" and "safe to hand
to strangers".

Two findings were verified by running them rather than reasoning about them: **C1** and **C4**.

---

## Security

### S1 — GitHub access tokens are stored in plaintext · ✅ FIXED · Medium-High
`src/user/core/entities/user.entity.ts:35`

Slack bot tokens go through `TokenCipherService` (AES-256-GCM). GitHub user tokens sit in the
clear in the same database, and the entity comment concedes it:

> Plaintext is acceptable at `read:org`; encrypt at rest before anything asks for `repo`.

Two problems. First it is an inconsistency — same database, same dump, same threat model, one
token encrypted and one not. Second, the condition the comment sets is unenforceable from where
it is written: the app's user permissions are widened on GitHub's settings page, not in this
file, so nobody editing scopes will ever see this line.

**Fix:** run it through the existing cipher. `CryptoModule` is already built; the only touch
points are `UserWriteService` on write and `UserSerializer.normalize` on read.

### S2 — Missing secrets fall back to published values · ✅ FIXED · High
`src/shared/configs/env-configs.ts:60,79`

```ts
jwtSecret: process.env.AUTH_JWT_SECRET ?? 'local-development-secret',
tokenEncryptionKey: process.env.SLACK_TOKEN_ENCRYPTION_KEY ?? 'local-development-encryption-key',
```

If a deploy ever drops one of these, the app boots happily and signs tokens anyone reading this
repo can forge, or encrypts workspace bot tokens under a key that is in the source. It fails
**open** and it fails **silently** — `TokenCipherService` logs one warning, the JWT path says
nothing at all.

This is the highest-consequence config issue in the repo, and it is cheap to close.

**Fix:** a `validateEnv()` at bootstrap that throws when `NODE_ENV=production` and any required
secret is absent or still the default. Keep the fallbacks for local dev; make them impossible
in production.

### S3 — One secret doing two jobs · ✅ FIXED · Low-Medium
`src/slack/app/slack-state.service.ts:51`

The OAuth `state` HMAC uses `getEnvConfig().auth.jwtSecret`. The doc comment above it explains
carefully why state must *not* be a JWT — and then signs it with the JWT key. Rotating the JWT
secret silently kills every in-flight Slack authorization, and a weakness in either context
becomes a weakness in both.

**Fix:** a separate `STATE_SIGNING_SECRET`, or derive one via HKDF from the JWT secret with a
distinct info label.

### S4 — CORS allows every origin · ⏸ DEFERRED · Low-Medium
`src/main.ts:12` — `app.enableCors({ origin: '*' })`

Tokens travel in `Authorization`, not cookies, so this is not CSRF-exploitable today. It becomes
one the moment anything cookie-based or browser-visible is added, and there is no reason to
carry the risk.

**Fix:** allowlist `getEnvConfig().app.url`.

### S5 — Swagger is public in production · ⏸ DEFERRED · Low
`src/main.ts:18`

`SwaggerModule.setup('docs', …)` registers on the Express instance, outside the `APP_GUARD`.
The full API surface with every schema is served to anyone who asks. Not a vulnerability — free
reconnaissance.

**Fix:** gate on environment, or put basic auth in front of it.

### S6 — No rate limiting anywhere · ⏸ DEFERRED · Medium
No `@nestjs/throttler`, no per-route limits. Three endpoints where that bites:

| Endpoint | Auth | Cost of one call |
| --- | --- | --- |
| `POST /auth/github/login` | none | a GitHub code exchange |
| `POST /slack/connection/test` | user | a real Slack DM — self-spam, and it burns workspace quota |
| `GET /connections` | user | one GitHub API call against **the user's own** 5000/hr quota |

**Fix:** global throttler, with tighter limits on those three.

### S7 — A freed GitHub handle can misroute a poke · ✅ FIXED · Low, but real
`src/user/core/entities/user.entity.ts:17`, `src/user/read/user-read.service.ts:34`

`githubLogin` is indexed but **not unique**, and mention routing matches it case-insensitively.
GitHub releases a handle the moment its owner renames. So:

1. A (`@alice`) renames to `@bob`. proke still has `githubLogin: 'alice'` on A's row.
2. B claims `@alice` and signs in. Now two rows carry `alice`.
3. Someone `@alice`-mentions B in a private repo. `findOne` resolves with no ordering guarantee.
4. The poke — repo name, PR title, and up to 320 characters of the comment — can land in A's Slack.

The window closes when A next logs in. It is narrow; it is not zero, and the payload is other
people's private repository content.

**Fix:** prefer `githubId` wherever the payload carries one (it does for most events). For
mention-only routing, store a normalized `githubLoginLower` with a unique sparse index, refresh
it on login, and clear it from the stale row when another user claims the handle. Pairs with C6.

### S8 — No account deletion · ✅ FIXED · Medium (compliance)
`UserWriteService.delete` exists and nothing calls it. There is no endpoint.

For a product about to hold third-party GitHub and Slack tokens belonging to the public,
"delete my account and everything you have" is table stakes, and a GDPR erasure obligation for
any EU user.

**Fix:** `DELETE /users/me` that removes the user, their subscriptions and their Slack links.

---

## Correctness

### C1 — ValidationPipe drift silently inverts a boolean · ✅ FIXED · High · **verified**
`src/main.ts:21` vs `test/utils/bootstrap.ts:37`

Production builds the pipe with `transformOptions: { enableImplicitConversion: true }`. The test
harness builds it **without**. Run against the real `RepositoryPreferenceBody`:

```
input {"repositoryId":"1","enabled":"false"}
  PROD pipe  -> {"repositoryId":"1","enabled":true}      // a muted repo silently un-mutes
  TEST pipe  -> REJECTED: ["enabled must be a boolean value"]

input {"repositoryId":"1","enabled":0}
  PROD pipe  -> {"repositoryId":"1","enabled":false}     // accepted
  TEST pipe  -> REJECTED: ["enabled must be a boolean value"]
```

Implicit conversion runs `Boolean("false")`, which is `true`. Any client sending the string —
a hand-rolled request, a form-encoded proxy, a future mobile client — gets the **opposite** of
what it asked for. And no e2e test can ever catch it, because the suite validates under
different rules than production does. That is the actual defect: the harness is not testing the
application that ships.

**Fix:** one shared `buildValidationPipe()` imported by both. Then choose the config on its
merits — there are no numeric query or param DTOs here, so `enableImplicitConversion` buys
almost nothing and costs this. Recommend dropping it and adding `whitelist: true`.

### C2 — Webhooks are not idempotent · ⏸ DEFERRED · High
`src/webhooks/github/github-webhook.controller.ts`

`X-GitHub-Delivery` is never read. GitHub redelivers on any non-2xx, and "Redeliver" is a button
on the deliveries page. Every redelivery re-runs the router and sends the Slack DM again.

The comment at line 46 calls a redelivery "cheap". For a notification product, a duplicate poke
is precisely the failure the product exists to prevent.

**Fix:** a `processed_deliveries` collection keyed on the delivery id with a 24h TTL index,
checked before `handle()`. Same move covers the Slack events endpoint, which Slack retries after
three seconds.

### C3 — Fire-and-forget loses work and ignores shutdown · ⏸ DEFERRED · High
`github-webhook.controller.ts:47`, `slack-events.controller.ts:58` — both `void this.handle(…)`

Acknowledging before doing the work is right. Detaching into a floating promise is the shortcut,
and it costs three things:

- **Lost pokes.** A deploy or crash mid-flight drops the notification with no trace and no
  retry — GitHub already had its 202.
- **No concurrency bound.** A busy org can put hundreds of handlers in flight, each able to
  sleep up to 30 seconds inside the Slack 429 retry (`slack-api.service.ts:98`).
- **Shutdown is not actually graceful.** `enableShutdownHooks()` knows nothing about these
  promises, so every deploy severs whatever was in flight.

**Fix, staged.** Near-term: a bounded in-process queue drained on `beforeApplicationShutdown`.
Before real traffic: persist the delivery and process it from a worker (BullMQ/Redis, or
Mongo-backed), which buys retries and dedup in the same change as C2.

### C4 — A GitHub 401 logs the user out of proke · ✅ FIXED · Medium · **verified end to end**
`src/connections/github-user-installations-data.service.ts:26` → `frontend/src/main.tsx:36`

GitHub answering 401 becomes a Nest `UnauthorizedException`, i.e. HTTP 401 on `GET /connections`.
The frontend treats any 401 as a dead session and calls `logout()`. So a user who revokes the
app's authorization on GitHub's side gets thrown out of proke, where their session was fine.

`UserWriteService.clearGithubAccessToken` — written for exactly this — is never called.

**Fix:** stop reusing 401 for a third-party credential failure. Clear the stored token and
return the connections payload with a `githubReauthRequired: true` flag the dashboard can act on.

### C5 — Installations are read one page deep · ✅ FIXED · Medium
`src/connections/github-user-installations-data.service.ts:18`

`per_page=100`, and the `Link` header is never followed. Past 100 installations the connections
list silently truncates — and because `assertUserCanAccessInstallation`
(`connections.service.ts:192`) uses the same call, a legitimate subscribe to installation #101
is refused with "You do not have access to that installation."

**Fix:** paginate. Or read from the local mirror instead — see D1.

### C6 — Mention lookup cannot use its index · ✅ FIXED · Medium at scale
`src/user/read/user-read.service.ts:34`

```ts
findOne({ githubLogin: new RegExp(`^${escapeRegExp(githubLogin)}$`, 'i') })
```

MongoDB cannot serve a case-insensitive regex from a btree index. Every `@mention` in every
webhook is a full collection scan of `users`. The `escapeRegExp` guard below it is correct and
necessary — it is the approach being guarded that is the problem.

**Fix:** store `githubLoginLower` and query it with `$eq`, or attach a case-insensitive collation
to the index. Pairs with S7.

### C7 — Uncaught exceptions leave the process running · ⏸ DEFERRED · Medium
`src/main.ts:31`

```ts
process.on('uncaughtException', (error) => { console.error(error); });
```

After an uncaught exception the process state is undefined by definition — that is what the
handler documents, not what it fixes. It is also the only `console` use in the codebase; every
other line goes through the Nest `Logger`.

**Fix:** log through `Logger`, then exit non-zero and let `--restart=always` do its job. Keeping
`unhandledRejection` as log-only is defensible; `uncaughtException` should terminate.

### C8 — Raw errors and unguarded ObjectId casts become 500s · ⏸ DEFERRED · Low-Medium
`src/user/write/user-write.service.ts:62` throws a bare `Error` for a missing user. Lines 56, 72,
78 and 82 call `new Types.ObjectId(dto.id)`, which throws `BSONError` on a malformed id. There is
no global exception filter, so both surface as opaque 500s.

**Fix:** `NotFoundException`, plus a global filter mapping Mongoose `CastError`/`BSONError` to 400.

### C9 — `SlackApiService` return types are not true · ✅ FIXED · Low
`src/slack/app/slack-api.service.ts:46,59`

`readIdentity` declares `slackUserId: string` and returns `data.user?.id`. `openDirectMessage`
declares `Promise<string>` and returns `data.channel?.id`. Both can be `undefined` under
`strictNullChecks`, and the second flows straight into `postMessage(botToken, undefined, message)`.

**Fix:** validate the response shape and throw `SlackApiError` when the field is missing.

---

## Dead code and inconsistency

### D1 — The `installations` collection is write-only
Webhooks upsert it, `ConnectionsService.uninstall` deletes from it, and **nothing reads it**.
`InstallationReadService`, `InstallationReadModule` and `readByAccountLogins` are the only
readers, and that module is imported by nobody. `InstallationSerializer.normalize` is unused too
— only `fromGithubPayload` is live, and `connections.service.ts:50` reads `suspendedAt` off the
**live API response**, not the mirror.

The comment at `github-webhook-installations.service.ts:7` describes an optimization that was
never wired up:

> Everything here is driven by webhooks, so the connections page never has to fan out one API
> call per org.

It does. Every page load. The code pays to maintain a mirror and then queries GitHub anyway.

**Decide:** use it or delete it. Using it is the better product answer — it fixes C5 and most of
S6's GitHub-quota exposure in one move, and the mirror already holds everything `readForUser`
renders except which installations *this particular user* may see.

### D2 — Methods nothing calls
`UserReadService.readByEmail`, `UserWriteService.clearGithubAccessToken` (see C4),
`UserWriteService.updateLastActivityDate`, `UserWriteService.delete` (see S8).

### D3 — `lastActivityDate` is written once and never updated
`user-write.service.ts:22` sets it at creation. Nothing ever moves it, so it is permanently equal
to `createdAt` and carries no information. Update it in the guard, or drop the field.

### D4 — Fields stored and never read
`SlackWorkspaceEntity.botUserId`, `SlackWorkspaceEntity.installedByUserId`,
`InstallationEntity.accountId`.

### D5 — `PUT /connections/:id/preferences` is unreachable from the product
The endpoint, its DTO, its validation and `ConnectionsService.updatePreferences` all exist, and
`frontend/src/lib/api/connections.api.ts:87` has a client for it. **No component calls it.**

The comments state the intent honestly ("the shape is already the full one"), so this is a scope
decision rather than a mistake — but it is public, authenticated, mutating surface shipping with
no real caller, and C1 lives inside it.

### D6 — No linter
`prettier` is a dependency and `pnpm format` exists, but there is no ESLint config anywhere in
the backend, and CI runs neither lint nor format check. `tsconfig.json` also softens two flags
that the rest of the config's strictness would suggest keeping: `noImplicitAny: false` and
`strictBindCallApply: false`.

### D7 — `--forceExit` in `test:e2e`
That flag exists to paper over handles the suite does not close. With
`closeInMemoryMongoServer` reduced to an empty function "so specs read the same as before",
there is a small pile of deferred cleanup here.

---

## Comments

Density is **15%** across `src`, and the house style is "explain the why, not the what" — which
is the right style, and most of these comments earn their place. Volume is not the problem.

**Six comments are now false**, which is worse than no comment, because each one will be trusted:

| Location | Claim | Reality |
| --- | --- | --- |
| `github-webhook-installations.service.ts:7` | the mirror saves the connections page an API call per org | it is never read — D1 |
| `user-write.service.ts:68` | "a revoked token gets retried every poll, forever" | there is no polling; the app is webhook-driven, and the method is uncalled |
| `user.entity.ts:31` | "The OAuth App token" | it is a GitHub App user-to-server token — `env-configs.ts:20` says there is no OAuth App any more |
| `test/utils/mongo-in-memory-server.ts:5` | "even when Jest runs them in parallel" | the suite runs `--runInBand` |
| `slack-workspace.entity.ts:23` | `botUserId` "kept so delivery can recognise proke's own messages" | delivery never reads it |
| `github-webhook.controller.ts:46` | "A redelivery is cheap" | it is a duplicate DM — C2 |

**Genuinely over-long**, if trimming: the entity file headers — `subscription.entity.ts` (34%
comment), `slack-workspace.entity.ts` (33%), `slack-link.entity.ts` (32%) — each open with a
multi-paragraph essay where two lines would do. The class and field names already carry most of it.

---

## Infrastructure and delivery

### I1 — CI actions pinned to a moving branch · ✅ FIXED · Medium (supply chain)
`appleboy/ssh-action@master` and `appleboy/scp-action@master`, in both workflows. Those actions
receive the SSH private key to the production VPS. A compromised or simply changed `master` runs
with that key on the next deploy.

**Fix:** pin to a commit SHA.

### I2 — Secrets on the `docker run` command line · ⏸ DEFERRED · Medium
`.github/templates/deploy-backend-container/action.yml:83` passes all sixteen secrets as `-e
NAME="value"`. On the VPS they are visible in `ps` output to any local user and land in the
shell's history.

**Fix:** write an env file with `600` permissions and use `--env-file`.

### I3 — Container runs as root
`backend/Dockerfile` never drops privileges. Add `USER node` to the production stage.

### I4 — Nothing verifies the deploy came up
No `HEALTHCHECK` in the image, no health endpoint in the app, no post-deploy probe in the
workflow, and Caddy proxies blind. A container that crash-loops on a missing env var still
reports a green deploy — which is exactly how S2 would reach production unnoticed.

**Fix:** `GET /health` (`@nestjs/terminus`, with a Mongo check), a container `HEALTHCHECK`, and a
step that polls it after `docker run` before declaring success.

### I5 — CI gates on tests only
No typecheck, no build, no lint. A type error outside e2e coverage is first discovered during the
Docker build, mid-deploy.

**Fix:** add `pnpm build` and `pnpm lint` to the `test` job.

### I6 — No observability
No structured logging, no error tracking, no metrics. Every diagnosis is `docker logs` on the
VPS. For a launch, at minimum a Sentry DSN and JSON logs.

---

## The plan

### Phase 0 — before this goes to strangers
Everything here either fails open, corrupts data, or drops user-visible work.

| # | Task | Refs |
| --- | --- | --- |
| ✅ 0.1 | `validateEnv()` at bootstrap: throw in production on any missing or default secret | S2 |
| ✅ 0.2 | Share one `buildValidationPipe()` between `main.ts` and `bootstrap.ts`; drop implicit conversion, add `whitelist` | C1 |
| ⏸ 0.3 | Webhook idempotency on `X-GitHub-Delivery` with a TTL collection | C2 |
| ⏸ 0.4 | Bounded queue + drain on `beforeApplicationShutdown` for detached handlers | C3 |
| ⏸ 0.5 | `uncaughtException` logs through `Logger` and exits non-zero | C7 |
| ⏸ 0.6 | `GET /health` + container `HEALTHCHECK` + post-deploy probe | I4 |
| ✅ 0.7 | Pin `appleboy/*` actions to SHAs | I1 |

### Phase 1 — security hardening
| # | Task | Refs |
| --- | --- | --- |
| ✅ 1.1 | Encrypt `githubAccessToken` at rest through the existing cipher | S1 |
| ⏸ 1.2 | Global throttler; tight limits on login, test-poke, connections | S6 |
| ⏸ 1.3 | CORS to `APP_URL`; Swagger behind an env gate | S4, S5 |
| ✅ 1.4 | Separate the state-signing secret from the JWT secret | S3 |
| ✅ 1.5 | `DELETE /users/me` with full cascade | S8 |
| ⏸ 1.6 | Secrets via `--env-file`; `USER node` in the image | I2, I3 |

### Phase 2 — correctness
| # | Task | Refs |
| --- | --- | --- |
| ✅ 2.1 | Stop returning 401 for a GitHub token failure; clear the token, flag re-auth | C4 |
| ✅ 2.2 | `githubLoginLower` + unique sparse index; prefer `githubId` in routing | S7, C6 |
| ✅ 2.3 | Paginate `/user/installations`, **or** land D1 and read the mirror | C5, D1 |
| ⏸ 2.4 | Global exception filter; `NotFoundException`; guard ObjectId casts | C8 |
| ✅ 2.5 | Validate Slack API response shapes instead of asserting them | C9 |

### Phase 3 — cleanup
| # | Task | Refs |
| --- | --- | --- |
| ✅ 3.1 | Decide D1: wire the mirror in, or delete the read side and the collection | D1 |
| ✅ 3.2 | Delete uncalled methods; fix or drop `lastActivityDate`; drop unread fields | D2, D3, D4 |
| ✅ 3.3 | Correct the six false comments; trim the three entity headers | Comments |
| ⏸ 3.4 | ESLint + `pnpm build` + `pnpm lint` in CI; consider `noImplicitAny: true` | D6, I5 |
| ⏸ 3.5 | Remove `--forceExit` and close what is actually open | D7 |
| ⏸ 3.6 | Decide D5: build the preferences UI, or take the endpoint out until it is real | D5 |

### Phase 4 — operability
Structured JSON logging, Sentry, request-id correlation, and a durable job queue replacing the
Phase 0.4 in-process one. **I6, C3.**

---

### Suggested order

**0.1, 0.2, 0.5** are an afternoon and remove the worst of it. **0.3 + 0.4** are the real work in
Phase 0 and are best done together, since both want the delivery persisted. Everything in Phase 1
is independent and parallelizable. **3.1** should be settled before Phase 2 starts — it changes
whether 2.3 is "add pagination" or "delete a collection".
