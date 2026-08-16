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

Push to `main` with anything under `backend/` changed and
[`.github/workflows/backend-deploy.yml`](.github/workflows/backend-deploy.yml) runs the e2e suite,
builds `backend/Dockerfile`, pushes it to Docker Hub as `ablaszkiewicz/proke-backend`, then SSHes
into the VPS to replace the running container. The image name and Docker Hub account are written
into the workflow rather than kept as secrets - neither is confidential, and having them visible
means the pull command on the VPS is greppable. The three steps are composite actions in `.github/templates/`. There is a
`workflow_dispatch` trigger too, for redeploying without a code change.

The container listens on 48211 and is published on the same port, so whatever sits in front of it
(Caddy, nginx, Cloudflare) proxies the public hostname there. The frontend is not in this pipeline
- Vercel builds it from the same push, and `frontend/vercel.json` rewrites every path to
`index.html` so TanStack Router handles the routing.

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

## Layout

- `backend/` - NestJS API with `user` and `auth` (GitHub OAuth) modules. See
  [backend/README.md](backend/README.md).
- `frontend/` - Vite + React + TanStack Router + kea app. See
  [frontend/README.md](frontend/README.md).
