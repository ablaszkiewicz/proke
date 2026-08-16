# proke

PR + poke - GitHub notifications that actually reach you. Slack for now, other platforms later.

## Run the dev stack

```bash
mprocs
```

That starts Mongo in Docker, the backend in watch mode, the frontend dev server, and a tunnel.
`backend-tests` is in the list too, off by default - select it and press `s` to run the e2e suite.

To run the pieces by hand instead:

```bash
docker compose up mongo
cd backend && pnpm install && pnpm start:dev
cd frontend && pnpm install && pnpm dev
```

## Ports

| Service  | Port  |
| -------- | ----- |
| Backend  | 48211 |
| Mongo    | 47117 |
| Frontend | 49173 |

All are deliberately far from the defaults so they don't collide with anything else running
locally. The backend defaults to them with no `.env` present; copy `backend/.env.example` to
`backend/.env` to override. The frontend needs `frontend/.env` (copy `frontend/.env.example`).

## GitHub login

Create a GitHub App with the callback URL `http://localhost:49173/app/callbacks/oauth/github`,
then fill in:

- `frontend/.env` - `VITE_GH_APP_CLIENT_ID`
- `backend/.env` - `GH_APP_CLIENT_ID`, `GH_APP_CLIENT_SECRET`

Open http://localhost:49173 and click **Sign in with GitHub**.

## The tunnel

Webhooks and the Slack redirect need a public https URL, so `mprocs` runs one in its `tunnel`
pane and prints exactly which URL goes in which field, with links to both settings pages:

```
  GitHub App                              https://github.com/settings/apps/<slug>
    Webhook URL                           https://<tunnel>/webhooks/github

  Slack app                               https://api.slack.com/apps
    OAuth & Permissions → Redirect URLs   https://<tunnel>/slack/oauth/callback
    Event Subscriptions → Request URL     https://<tunnel>/webhooks/slack/events
```

One tunnel covers all three - they all point at the backend, and the frontend stays on
`localhost`, because `GET /slack/oauth/callback` hands the code straight back to it. The pane
also keeps `SLACK_REDIRECT_URI` in `backend/.env` in step with the live hostname.

By default it is a throwaway quick tunnel with a new hostname on every restart. For a permanent
one, using a domain in your Cloudflare account:

```bash
cloudflared login
cloudflared tunnel create proke
cloudflared tunnel route dns proke proke-api.yourdomain.com
cp .env.tunnel.example .env.tunnel     # fill in the name and hostname
```

Then the GitHub and Slack settings pages are a one-time job. Run it standalone with
`node scripts/tunnels.mjs`, or `--no-write` to print without touching `backend/.env`.

## Deploy

Both halves ship on push to `main`, each ignoring changes to the other. The backend goes through
GitHub Actions, because it has an e2e suite worth gating on; the frontend is built by Cloudflare
itself.

### Backend

[`.github/workflows/backend-deploy.yml`](.github/workflows/backend-deploy.yml) runs the e2e suite,
builds `backend/Dockerfile`, pushes it to Docker Hub as `ablaszkiewicz/proke-backend`, then SSHes
into the VPS to replace the running container. The three steps are composite actions in
`.github/templates/`. The image name and Docker Hub account are written into the workflow rather
than kept as secrets - neither is confidential, and having them visible means the pull command on
the VPS is greppable.

The app listens on 48211, published on `127.0.0.1` only - nothing reaches it from outside except
through Caddy.

### Caddy

[`caddy/Caddyfile`](caddy/Caddyfile) terminates TLS for `backend.proke.dev` and proxies to
`localhost:48211`. [`.github/workflows/caddy-deploy.yml`](.github/workflows/caddy-deploy.yml)
copies the file up and restarts the container on any change to `caddy/**`; it reuses the `SSH_*`
secrets and needs no new ones. Caddy runs with `--network host` so it holds :80 and :443
directly, and issued certs persist in the `proke-caddy-data` volume so redeploys don't re-request
them and hit Let's Encrypt's rate limits.

Two prerequisites it cannot do for itself:

- **`backend.proke.dev` must be DNS-only in Cloudflare** - grey cloud, not orange. Proxied, the
  ACME challenge lands on Cloudflare's edge, Caddy never sees it, and no certificate issues. The
  cost of grey-clouding is that the origin IP is public and Cloudflare's DDoS protection does not
  cover the API. `proke.dev` itself is unaffected: the frontend is a Worker.
- **Ports 80 and 443 open on the VPS.** 80 is not optional even though everything redirects to
  443 - it is where the challenge arrives, on first issue and again at every renewal.

Repository secrets it needs:

| Secret                                                | What it is                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| `DOCKERHUB_TOKEN`                                     | Docker Hub PAT with write access                                 |
| `SSH_HOST`, `SSH_USERNAME`, `SSH_PORT`, `SSH_PRIVATE_KEY` | The VPS                                                      |
| `MONGO_URL`                                           | Production Mongo                                                 |
| `AUTH_JWT_SECRET`                                     | `openssl rand -base64 32`                                        |
| `APP_URL`                                             | Public frontend origin, e.g. `https://proke.dev`                 |
| `GH_APP_ID`, `GH_APP_SLUG`                            | From the GitHub App's General page                               |
| `GH_APP_CLIENT_ID`, `GH_APP_CLIENT_SECRET`            | User-to-server login                                             |
| `GH_APP_PRIVATE_KEY`                                  | The `.pem`, base64-encoded: `base64 -i proke.private-key.pem`    |
| `GH_APP_WEBHOOK_SECRET`                               | Webhook signature secret                                         |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`              | Slack app credentials                                            |
| `SLACK_SIGNING_SECRET`                                | Verifies Events API requests                                     |
| `SLACK_REDIRECT_URI`                                  | Production callback, and it must match the Slack app exactly     |
| `SLACK_TOKEN_ENCRYPTION_KEY`                          | `openssl rand -base64 32` - changing it orphans stored bot tokens |

They are named `GH_*` rather than `GITHUB_*` because GitHub reserves that prefix for Actions
secrets and refuses to save one using it. The app reads the same `GH_APP_*` names, so the secret,
the container env and `backend/.env` all match and nothing has to be translated in between.
Base64 is the safer of the two private-key encodings here - the config accepts either, but a
literal PEM has to survive both the Actions expression and the remote shell intact.

### Frontend

Cloudflare Workers Builds, connected straight to this repo - there is no workflow for it. On push
it runs the build itself and deploys `dist/` as static assets, per
[`frontend/wrangler.jsonc`](frontend/wrangler.jsonc). There is no `main` entry point, so no isolate
ever runs - Cloudflare serves the files from its edge and `not_found_handling` returns
`index.html` for unmatched paths, which is what TanStack Router needs to own the routing.

Workers rather than Pages: Cloudflare points new projects at Workers now, and Pages is in
maintenance. A static asset deploy is the same either way, but this one can grow an API route or
middleware later by adding a `main` to the config, without migrating anything.

Setup is one pass through **Workers & Pages -> Create -> Connect to Git**, and these are the
settings that matter for a repo with two apps in it:

| Setting            | Value                                          |
| ------------------ | ---------------------------------------------- |
| Root directory     | `frontend`                                     |
| Build command      | `pnpm build`                                   |
| Deploy command     | `npx wrangler deploy`                          |
| Build watch paths  | `frontend/*` - otherwise backend pushes rebuild it too |

Plus three build-time environment variables, `VITE_APP_URL`, `VITE_API_URL` and
`VITE_GH_APP_CLIENT_ID`. They belong in the build settings rather than as Worker secrets: Vite
inlines them into the bundle, so they are readable by anyone who opens devtools regardless, and a
runtime secret would never reach the build at all.

The catch, versus a workflow: that configuration lives in Cloudflare's dashboard, not in this
repo, so it is not reviewable or revertable here. In exchange there is no API token to rotate,
and every branch and PR gets its own preview URL.

The production deploy lands on `proke-frontend.<your-subdomain>.workers.dev`; point a custom
domain at it from the Workers dashboard, or add `routes` to `wrangler.jsonc`. To deploy by hand,
bypassing all of the above:

```bash
cd frontend && pnpm deploy
```

## Layout

- `backend/` - NestJS API. GitHub App login, webhook receiver, notification routing, Slack
  delivery.
- `frontend/` - Vite + React + TanStack Router + kea.
- `caddy/` - reverse proxy config for the VPS.
