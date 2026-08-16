# proke backend

NestJS + MongoDB backend behind a single GitHub App: login, webhooks and installation state.

## Layout

```
src/
  auth/
    core/          auth guard (global), @Public and @CurrentUserId decorators
    custom-jwt/    JWT signing and verification
    github/        GitHub OAuth login endpoint
  user/
    core/          entity, serializer, controller
    read/          read service
    write/         write service
  notifications/
    core/          normalized notification shape
    delivery/      where a notification goes, and the Slack sender behind it
  webhooks/
    github/        signed webhook receiver, event routing, installation sync
    slack/         signed events receiver (app_uninstalled, tokens_revoked)
  installations/   mirror of which accounts have the GitHub App installed
  subscriptions/   per-user opt-in to an installation, plus notification preferences
  connections/     GET /connections plus the subscribe/preferences/uninstall endpoints
  slack/
    app/           Slack Web API client, OAuth, signed state, signature verification
    workspaces/    one row per workspace proke is installed in, with its bot token
    links/         one row per user per workspace: who they are in it
  shared/          env config, shared responses, token encryption
test/              e2e tests (in-memory Mongo, GitHub API mocked with nock)
```

Each domain is split into `core` (entity, controller, DTOs), `read`, and `write` modules. Services
return `*Normalized` objects; controllers return `*Serialized` ones.

## Setup

```bash
pnpm install
cp .env.example .env
```

Every value has a working default, so a `.env` is optional locally. `AUTH_JWT_SECRET` falls back to
a hardcoded value - set a real one before deploying anywhere.

## Run

```bash
docker compose up mongo   # from the repo root, Mongo on 47117
pnpm start:dev            # backend on 48211
```

Or run both at once with `mprocs` from the repo root.

Swagger docs are served at `http://localhost:48211/docs`.

## Test

```bash
pnpm test:e2e
```

The tests boot the real Nest app against an in-memory MongoDB and stub GitHub's API with nock, so no
external services are needed.

## Endpoints

| Method | Path                                        | Auth   | Description                              |
| ------ | ------------------------------------------- | ------ | ---------------------------------------- |
| POST   | `/auth/github/login`                        | public | Exchanges a GitHub code for a JWT        |
| GET    | `/users/me`                                 | bearer | Returns the current user                 |
| GET    | `/connections`                              | bearer | Installations the user can reach         |
| POST   | `/connections/:installationId/subscription` | bearer | Opt in to being poked about it           |
| DELETE | `/connections/:installationId/subscription` | bearer | Opt out                                  |
| PUT    | `/connections/:installationId/preferences`  | bearer | Replace what that account notifies you about |
| DELETE | `/connections/:installationId`              | bearer | Uninstall the app for everyone (owners)  |
| GET    | `/slack/connection`                         | bearer | Where this user's pokes go, plus the next authorize URL |
| POST   | `/slack/connection`                         | bearer | Spends a Slack OAuth code (both flows)   |
| DELETE | `/slack/connection`                         | bearer | Unlinks this user from Slack             |
| POST   | `/slack/connection/test`                    | bearer | Sends a test poke                        |
| POST   | `/webhooks/github`                          | signed | GitHub App event receiver                |
| POST   | `/webhooks/slack/events`                    | signed | Slack Events API receiver                |

`POST /auth/github/login` creates the user when the GitHub id is new. Users are identified by GitHub's immutable numeric `id`, never by email - the
email is stored for display and can change freely.

## Notifications

GitHub has no user-scoped webhooks ("You cannot create webhooks for individual user accounts, or
for events that are specific to user resources, like personal notifications or mentions"), so
PRoke uses a **GitHub App** and receives repository/org events at one endpoint.

### One GitHub App, not two

An earlier version paired the app with a separate OAuth App so it could call `GET /user/orgs`
and list orgs the app was *not* installed on. That was a dead end: organisations enable OAuth App
access restrictions by default, so unapproved OAuth Apps get

> "Although you appear to have the correct authorization credentials, the `<org>` organization has
> enabled OAuth App access restrictions, meaning that data access to third-parties is limited."

The org then vanishes from `/user/orgs` entirely - silently, with no hint that approval is the
blocker. It would have meant two approvals per org (approve the OAuth App to be *seen*, install
the GitHub App to be *useful*), where only the second does anything. GitHub Apps are not subject
to those restrictions.

So login is now user-to-server on the GitHub App itself. Two consequences:

- The `scope` parameter is **not supported** - what a user token can do comes from the app's
  configured permissions, not the authorize URL.
- Only accounts the app is installed on are visible. Orgs without an install are not
  enumerable by any means, so the UI links out to GitHub's own install picker instead of
  pretending to list them.

Set **Expire user authorization tokens** off unless you want to implement refresh tokens, and
grant **Account permissions -> Email addresses: Read** if you want `email` populated at login.

### Opting in

Installing is an org-level act, usually by a colleague. Being poked is the individual's choice, so
the two are separate:

- `GET /connections` lists installations the user can reach - GitHub scopes this by "repositories
  that they can access through an **organization membership**", which is how a second member of an
  org sees an install their colleague created
- each row is `available` (installed, not opted in), `subscribed`, or `suspended`
- `POST /connections/:installationId/subscription` opts in, `DELETE` opts out

`subscribe` re-checks against GitHub that the user can actually reach that installation. Without
that, posting an arbitrary installation id would sign you up for another organisation's pull
request activity.

The webhook router refuses to deliver without a matching subscription, and uninstalling an app
deletes every opt-in to it so a reinstall cannot resurrect consent.

### Webhook receiver

`POST /webhooks/github` (public, excluded from Swagger):

- verifies `X-Hub-Signature-256` over `req.rawBody` with `timingSafeEqual`; an unset secret
  **fails closed** rather than skipping verification
- answers `202` immediately and handles the event detached - GitHub abandons a delivery after
  10 seconds, and a redelivery is cheaper than being marked unhealthy
- `installation` / `installation_repositories` sync the local installation mirror
- everything else routes to recipients

### Routing

By GitHub user id out of the payload, or by handle for `@mentions` - never via the installation.
Webhooks carry no email at all, which is why users are keyed on `githubId`:

| Event | Recipient | Type |
| ----- | --------- | ---- |
| `pull_request` / `review_requested` | `requested_reviewer.id` | `review_requested` |
| `pull_request` / `closed` with `merged` | PR author | `pull_request_merged` |
| `pull_request_review` / `submitted` | PR author | `review_submitted` |
| `pull_request_review_comment` / `created` | PR author | `pull_request_comment` |
| `issue_comment` / `created` on a PR | PR author | `pull_request_comment` |
| any of the above, `@handle` in the body | the mentioned user | `pull_request_mention` |
| `issues` / `opened`, `issue_comment` on an issue | the mentioned user | `issue_mention` |

`issue_comment` covers both issues and pull requests; `issue.pull_request` is the only thing
separating them. A comment on an issue you opened is *not* a poke on its own - only a mention in
it is.

Mentions are read out of the comment body with code blocks and inline code stripped first (an
`@param` in a snippet is not a summons), and `@org/team` is skipped since it names a group we
cannot resolve to a person.

One event routinely produces several candidates for the same person - a comment on your own pull
request that also `@`s you is both. They are filtered against that person's preferences first and
collapsed to the highest-priority survivor afterwards; collapsing first would let a type they
muted swallow the poke they actually asked for.

A poke is dropped when the recipient is the sender (nobody wants to hear about their own action,
including mentioning themselves), when the recipient has no PRoke account (we receive events for
whole orgs), when they have not subscribed to that event's installation, or when their
preferences exclude it. Events with no `installation.id` are dropped outright rather than guessed
at - there would be no opt-in to check them against.

For issue mentions to arrive at all, the App must subscribe to the **Issues** event and hold
**Repository permissions -> Issues: Read**.

### What gets delivered

A subscription carries preferences, and the model is deliberately richer than the UI:

```jsonc
{
  "repositoryScope": "all",          // or "selected"
  "notificationTypes": ["review_requested", "..."],
  "repositories": [                  // exceptions to the above
    { "repositoryId": "314", "enabled": false },
    { "repositoryId": "271", "enabled": true, "notificationTypes": ["pull_request_merged"] }
  ]
}
```

- `all` means everything except repositories listed with `enabled: false`; `selected` means
  nothing except those listed with `enabled: true`
- a repository override without `notificationTypes` inherits the installation-wide list
- repositories are keyed on GitHub's numeric id, so a rename keeps its settings

Turning an account on opts into everything - opting in is already the explicit act. The frontend
writes and displays only that default today, read-only; `PUT .../preferences` is the endpoint a
repository picker will call.

Absent fields mean "everything", never "nothing": subscriptions written before preferences
existed have none of them, and lean reads do not apply schema defaults, so `normalizePreferences`
is the only thing standing between an old row and a user who quietly stops being poked. A stored
empty array is left intact - that one is a real choice.

## Slack

Pokes come out in a Slack DM. That needs two separate things to be true, and they are separate
collections because they are separate people's decisions:

| | Who decides | What it stores |
| --- | --- | --- |
| `slack-workspaces` | whoever installs the app, often an admin | the workspace's bot token |
| `slack-links` | the user | who they are *inside* that workspace |

The pair is not a convenience. A Slack user id means nothing on its own - `U04AB` in one
workspace and `U04AB` in another are unrelated people - and the token allowed to message either
of them is scoped to that same workspace. Delivery needs both halves; either alone is useless.

### Two authorize flows, in that order

1. **Sign in with Slack** (`user_scope=identity.basic`) installs nothing, so any member can
   complete it. It answers "who is this person, and where".
2. **Add the bot** (`scope=chat:write,im:write`) is only offered once we know that workspace has
   no proke in it. It usually needs permission to install apps, and Slack runs its own
   request-an-admin flow when the user lacks it.

Asking for both up front would send every member of an already-connected workspace through an
approval they do not need. Only the first person in each workspace ever sees step 2; everyone
after them is one click. Which flow happened is read off the OAuth response rather than tracked
through the round trip - only an install comes back with a bot token.

`state` is an HMAC of the user id, not a JWT: it travels in a URL and through Slack's logs, and
an auth token that leaks from there could be replayed.

### Setting the app up

At <https://api.slack.com/apps> → **Create New App**:

- **OAuth & Permissions** → Bot Token Scopes: `chat:write`, `im:write`. User Token Scopes:
  `identity.basic`.
- **Redirect URLs**: `https://<tunnel>/slack/oauth/callback` - this backend, not the frontend.
  Slack refuses plain http, `localhost` included, so the callback has to land somewhere public;
  `GET /slack/oauth/callback` immediately 302s it to `APP_URL` carrying the code. That keeps the
  browser on the origin that holds the session - landing it on a tunnel host instead would leave
  the user looking logged out, since the JWT is in localStorage for `localhost:49173`. It also
  means only one tunnel is needed, the one you already run for GitHub webhooks.
- **Event Subscriptions** → Request URL `https://<tunnel>/webhooks/slack/events`, subscribing to
  `app_uninstalled` and `tokens_revoked`. Slack verifies the URL with a signed challenge the
  moment you save it, so the backend has to be running with `SLACK_SIGNING_SECRET` already set.
- **Manage Distribution** → enable distribution, so workspaces other than your own can install it.

Then fill in `SLACK_*` in `.env`. There is deliberately no bot token there: tokens are per
workspace and arrive through OAuth.

### Delivery, and what it writes back

`conversations.open` then `chat.postMessage`. The DM channel id is cached on the link, so every
later poke is one call instead of two, with a single reopen if the cached one goes stale.

What Slack reports back is written to the database rather than only logged, or every event for
every member rediscovers it forever:

- `token_revoked`, `account_inactive`, `invalid_auth` → the workspace is marked revoked. The row
  survives so the dashboard can offer a reinstall instead of quietly forgetting it.
- `user_not_found`, `user_disabled`, `cannot_dm_bot` → that one link is dropped. The workspace is
  fine; the pairing is not.
- `429` → sat out once, honouring `Retry-After`.

Having no Slack connection is an ordinary state, not a failure - people sign in, opt into an
organisation, and connect Slack days later. Those pokes are logged and dropped: there is nowhere
to hold them, and a poke about a three-day-old review request is worse than no poke.

Bot tokens are encrypted at rest (AES-256-GCM, `SLACK_TOKEN_ENCRYPTION_KEY`). A value with no
version prefix is read back as plaintext, so turning encryption on for an existing collection is
a no-op rather than a migration.

## Local development

Webhooks and the Slack redirect need a public URL. `mprocs` runs one for you in its `tunnel`
pane, which prints exactly what to paste where:

```bash
brew install cloudflared
mprocs            # from the repo root
```

One tunnel covers everything - GitHub's webhook URL, Slack's redirect and Slack's events URL all
point at the backend, and the frontend stays on `localhost`. The pane also keeps
`SLACK_REDIRECT_URI` in `backend/.env` in step with the live hostname (`--no-write` to opt out).

By default that is a **quick tunnel**: a new `*.trycloudflare.com` on every restart, so the two
fields in the GitHub and Slack settings pages have to be re-pasted each session. To make it
permanent, using a domain in your Cloudflare account:

```bash
cloudflared login
cloudflared tunnel create proke
cloudflared tunnel route dns proke proke-api.yourdomain.com
cp .env.tunnel.example .env.tunnel     # then fill in the name and hostname
```

After that the hostname never changes and the settings pages are a one-time job.

Two things that do *not* work here:

- `gh webhook forward` creates a **repository** webhook. A GitHub App's deliveries are configured
  on the app, not per repo, and the repo webhook would be signed with a different secret - every
  delivery would fail signature verification.
- smee.io re-serializes the JSON payload before forwarding it. The signature is computed over the
  exact bytes GitHub sent, so any change in key order or escaping breaks it. A tunnel proxies the
  request unmodified and avoids the whole class of problem.

The app's **Advanced** tab lists recent deliveries with a **Redeliver** button - the fastest way to
re-run a handler without opening real pull requests.
