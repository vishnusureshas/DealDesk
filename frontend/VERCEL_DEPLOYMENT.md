# Deploy the DealDesk Frontend on Vercel

This guide deploys the React frontend to Vercel and connects it to the backend
that is already running on Render (see `../backend/RENDER_DEPLOYMENT.md`).

The frontend is a static single-page app. Vercel only serves the built `dist/`
files; nothing runs on a server and no secret may be placed in the build.

## 1. Deployment Topology

| Component | Host | Root directory | Build command | Output directory | Installed by |
| --- | --- | --- | --- | --- | --- |
| DealDesk Web | Vercel (Static / Vite) | `frontend` | `npm run build` | `dist` | `npm ci` |
| DealDesk API | Render Web Service | `backend` | already deployed | n/a | n/a |
| BillPort | Render Web Service | `backend` | already deployed | n/a | n/a |

The browser talks to exactly two origins:

- `VITE_API_URL` — DealDesk REST API over HTTPS.
- `VITE_SOCKET_URL` — DealDesk Socket.IO server, usually the same origin as the
  API.

BillPort is server-to-server only. The browser never calls it; invoice progress
arrives through the DealDesk API as `status`, `pushState` and the integration
log.

## 2. Prerequisites

- The repository is pushed to GitHub, GitLab, or Bitbucket.
- `frontend/package-lock.json` is committed (it is), so `npm ci` is reproducible.
- You have a Vercel account.
- The Render deployment is finished and you have its URLs, for example:

```text
https://dealdesk-api-ys6i.onrender.com
https://dealdesk-billport-78wi.onrender.com
```

- The Atlas database behind DealDesk has been seeded and its indexes synced
  (`npm run seed` and `npm run sync:indexes` from `backend/`). A healthy
  `/health` response does **not** mean there are users to log in with.

Do not commit a `frontend/.env` file. Only `.env.example` belongs in the repo.

## 3. Confirm the Backend Is Usable First

Deploying a frontend against a backend that cannot log anyone in produces a
blank-looking app that is hard to debug from the Vercel side. Check the backend
before you start:

```bash
curl -s https://dealdesk-api-ys6i.onrender.com/health
curl -s -X POST https://dealdesk-api-ys6i.onrender.com/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"managerA@dealdesk.test","password":"Password123!"}'
```

Expected: the health call returns `{"status":"ok","service":"dealdesk"}` and the
login returns `200` with a `token` and a `user` object.

If login returns `401 Invalid email or password`, the Atlas database is empty or
the Render `MONGO_URI` points at a different database than the one you seeded.
Fix that first; the frontend cannot work around it.

The first request after a period of inactivity can take 20–30 seconds because
free Render web services sleep. That is a cold start, not a deployment failure.

## 4. Create the Vercel Project

1. Sign in to Vercel.
2. Select **Add New > Project**.
3. Import the repository that holds the backend and frontend.
4. On the configure screen, set:

| Setting | Value |
| --- | --- |
| Project Name | `deal-desk` (Vercel appends a suffix if the name is taken; copy the URL it actually assigns) |
| Framework Preset | `Vite` (this repo is Vite + React, not Next.js) |
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |
| Node.js Version | `22.x` |

The repository root has no `package.json`, so `frontend` is a self-contained
project and Vercel needs no monorepo/workspace configuration.

5. Do not deploy yet. Add the environment variables first, because they are
   compiled into the bundle.

## 5. Environment Variables

Add these under **Settings > Environment Variables** for the Production
environment (and Preview if you want preview builds to reach the same API):

| Variable | Value | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `https://dealdesk-api-ys6i.onrender.com` | DealDesk REST base URL |
| `VITE_SOCKET_URL` | `https://dealdesk-api-ys6i.onrender.com` | Socket.IO origin |

Notes:

- Both values must be the full `https://` origin, **with no trailing slash**. The
  code strips a trailing slash from `VITE_API_URL`, but keeping the value clean
  avoids surprises.
- `VITE_*` variables are public. They are inlined into the JavaScript bundle and
  are visible to anyone who opens the site. Never put `JWT_SECRET`,
  `BILLPORT_SHARED_SECRET`, or any other secret in a `VITE_*` variable.
- Vite reads these at **build time**. Changing a value in Vercel does not change
  an already-built site; you must redeploy (unlike Render, which restarts on an
  environment change).
- If a variable is missing, the code silently falls back to
  `http://localhost:4000`. A deployed site that tries to reach `localhost` means
  the variable was not set on the deployment that build used.

## 6. Enable SPA Deep Links

The app uses `BrowserRouter`, so every route is a real path
(`/deals`, `/deals/:id`, `/invoices/:id`, `/chat/:dealId`, `/admin`). Vercel must
serve `index.html` for those paths instead of returning 404 on a refresh or a
shared link.

Add `frontend/vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Vercel serves real files from `dist/` first (JS, CSS, images) and only falls back
to `index.html` for unknown paths, so the rewrite does not shadow the assets.
Commit this file; it is part of the deployment and not a dashboard setting.

## 7. Deploy

1. Click **Deploy**.
2. Wait for the build to finish. A clean build takes about a minute.
3. Copy the production URL that Vercel shows for **this** project, for example:

```text
https://deal-desk-blond-psi.vercel.app
```

Do not assume `<project-name>.vercel.app` belongs to this project. If another
Vercel project already owns that name, Vercel assigns a suffixed domain. The URL
`https://dealdesk-web.vercel.app` belongs to a different Next.js project and
will never serve this React/Vite app.

4. Every push to the production branch (normally `main`) redeploys
   automatically. Pull requests get their own preview URLs.

The CI/CD workflow verifies each deploy against the repository variables
`FRONTEND_URL`, `DEALDESK_API_URL` and `BILLPORT_API_URL` under **Settings >
Secrets and variables > Actions > Variables**. The defaults match the URLs
above, so override them only when the deployment URL changes.

## 8. Point the Backend at the Frontend

The DealDesk API and its Socket.IO server both authorize browser origins with
the single value `CORS_ORIGIN`.

1. Open the DealDesk web service on Render.
2. Set `CORS_ORIGIN` to the exact Vercel production origin:

```text
CORS_ORIGIN=https://deal-desk-blond-psi.vercel.app
```

3. Save. Render restarts the service automatically.
4. Wait for the dealdesk service to come back and load the site again.

Rules that cause most CORS failures here:

- No trailing slash: `https://deal-desk-blond-psi.vercel.app`, never
  `https://deal-desk-blond-psi.vercel.app/`.
- No comma-separated list. `CORS_ORIGIN` accepts one origin or `*`.
- `http` and `https` are different origins.
- A custom domain is a different origin; changing domains means changing
  `CORS_ORIGIN` again.
- Preview deployments get different URLs such as
  `https://<project>-git-<branch>-<team>.vercel.app`. Those are **different
  origins** and will be blocked by a single-origin `CORS_ORIGIN`. For preview
  testing, either use `CORS_ORIGIN=*` temporarily or test previews against a
  backend configured for that origin.

For a temporary all-origin demo, `CORS_ORIGIN=*` works and is what the Render
deployment currently has. Narrow it before treating the deployment as real.

## 9. Smoke Test the Deployment

Open the production URL in a browser and:

1. The login screen appears without console errors.
2. Log in as `managerA@dealdesk.test` / `Password123!` (all seeded users share
   that password).
3. Open DevTools > Network and confirm requests go to
   `https://dealdesk-api-ys6i.onrender.com`, not `localhost`.
4. Open `/chat` and confirm the panel reports a connected socket; in DevTools >
   Network, the `socket.io` request must return `101 Switching Protocols` with
   no repeated handshake errors.
5. Load `/deals`, open a deal, then hard-refresh on `https://<your-site>/deals`.
   The page must reload instead of returning `404: NOT_FOUND`, which confirms the
   rewrite from section 6.
6. Issue an invoice on a deal and watch `status` / `pushState` change over
   5–30 seconds (BillPort pushes each webhook after a random delay). Nothing
   arrives while the Render services are asleep.

Optional API check from the terminal, to separate browser problems from backend
problems:

```bash
curl -s -i -X OPTIONS https://dealdesk-api-ys6i.onrender.com/auth/login \
  -H 'Origin: https://deal-desk-blond-psi.vercel.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  | grep -i '^access-control-allow-origin'
```

The value must be your Vercel origin (or `*`). If it is a different origin, the
`CORS_ORIGIN` value on Render does not match the site you opened.

## 10. Custom Domain (Optional)

1. Vercel project > **Settings > Domains > Add**.
2. Follow the DNS instructions, then wait for the certificate to issue.
3. Update the Render environment:
   - `CORS_ORIGIN=https://your-domain.example`

No frontend variable needs to change when the domain changes, because the
frontend only knows the API URL, never its own origin.

## 11. Operational Notes

- Vercel hosts only static files. There is no server process, no `PORT`, and no
  `start` command.
- Free Render web services sleep. When the DealDesk service is asleep the site
  still loads (Vercel is fast) but login, REST calls and the Socket.IO handshake
  stall until the service wakes. Expect a slow first load after idle.
- Socket.IO reconnects on its own after a dropped connection, and the app
  refetches the notification list on reconnect because missed events are not
  replayed.
- The auth token is kept in `localStorage` under `dealdesk.token`. It is scoped
  to the site origin, so a domain change logs everyone out.
- Keep the Vercel project on one production branch so the deployed bundle and
  the Render API stay in sync.
- Deleting and recreating the Vercel project changes the production URL and
  therefore requires updating `CORS_ORIGIN` again.

## 12. Troubleshooting

| Symptom | Check |
| --- | --- |
| Build fails on `npm ci` | `frontend/package-lock.json` must be committed and match `package.json`. |
| Build succeeds but the site is blank | Browser console; a missing `VITE_*` variable or a JS error both show here. |
| Requests go to `localhost:4000` | `VITE_API_URL` was not set on the deployment that produced this build. Redeploy after adding it. |
| `Access-Control-Allow-Origin` header missing | `CORS_ORIGIN` on Render does not match the site origin, or has a trailing slash or a comma list. |
| Login returns 401 for a demo account | Atlas was not seeded, or Render `MONGO_URI` names a different database. Fix on the backend. |
| Login works, notifications and chat do not | `VITE_SOCKET_URL` is wrong, or `CORS_ORIGIN` blocks the Socket.IO handshake. |
| Deep link or refresh returns `404: NOT_FOUND` | `frontend/vercel.json` rewrite is missing or not committed. |
| Env change has no effect | Vercel bakes variables at build time; trigger a new deployment. |
| Slow first load after idle | Render free-tier cold start (20–30 s). |
| Invoice stays `queued` | Backend issue: BillPort URL, shared secret, or a sleeping Render service. |
| Socket connects then drops repeatedly | The service is sleeping or restarting; wait for the cold start to finish. |

## 13. Security Checklist

- [ ] No secret is stored in a `VITE_*` variable; the bundle is public.
- [ ] `CORS_ORIGIN` is the real frontend origin, not `*`, outside temporary demos.
- [ ] Only the production origin is allowed, and preview URLs are not treated as
      trusted.
- [ ] The site is served over HTTPS only (Vercel default).
- [ ] Seeded demo accounts are removed or rotated before real use.
- [ ] The Atlas indexes were synchronized (`npm run sync:indexes`), so duplicate
      detection and idempotency actually hold.
- [ ] BillPort `/debug/*` routes are not publicly exposed for a production
      deployment.
