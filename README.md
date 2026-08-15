# proke

PRoke (PR + Poke) - GitHub notifications that actually reach you. Slack for now, other platforms
later.

## Run the dev stack

```bash
mprocs
```

That starts Mongo in Docker, the backend in watch mode, and the frontend dev server.
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

Create a GitHub OAuth app with the callback URL
`http://localhost:49173/app/callbacks/oauth/github`, then fill in:

- `frontend/.env` - `VITE_GITHUB_CLIENT_ID`
- `backend/.env` - `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`

Open http://localhost:49173 and click **Sign in with GitHub**.

## Layout

- `backend/` - NestJS API with `user` and `auth` (GitHub OAuth) modules. See
  [backend/README.md](backend/README.md).
- `frontend/` - Vite + React + TanStack Router + kea app. See
  [frontend/README.md](frontend/README.md).
