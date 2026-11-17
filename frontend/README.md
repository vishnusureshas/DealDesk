# DealDesk Frontend

React (JSX) + Vite + Zustand + Tailwind CSS, built from
`../DealDesk_Frontend_Implementation_Plan.md`.

## Status

Milestones **F0–F9** are implemented: login/session, permission-aware shell,
live notifications, deals and discount approvals, invoices and the integration
log, realtime chat with REST fallback, and the admin approval-config/roles
editor. `npm run build` and `npm test` are clean.

## Run

```bash
cd frontend
cp .env.example .env      # optional; defaults target localhost:4000
npm install
npm run dev               # http://localhost:5173
npm run build             # production build
npm run preview           # serve the production build
npm test                  # helper unit tests (Vitest)
```

The API must be running (`backend`: `npm run dev:dealdesk`, or the Docker
container on port 4000) with a seeded database (`npm run seed`). BillPort
(`npm run dev:billport`, port 5000) must also run for invoice pushes and
webhooks.

Ports: frontend `5173`, DealDesk API `4000`, BillPort `5000`.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000` | DealDesk REST origin |
| `VITE_SOCKET_URL` | `http://localhost:4000` | Socket.IO origin |

BillPort is server-to-server only and is never called by the browser. The
browser only sees it through invoice `status`, `pushState` and the integration
log.

## Demo logins

All seeded users use `Password123!`:

`execA@dealdesk.test`, `execB@dealdesk.test`, `managerA@dealdesk.test`,
`managerB@dealdesk.test`, `finance@dealdesk.test`, `admin@dealdesk.test`

The login screen also lists these accounts; clicking one fills the form.

## Demo notes

- **BillPort is random by default.** For deterministic demos set
  `FAIL_RATE=0 DUP_RATE=0 BAD_SIG_RATE=0` on BillPort.
- **Webhooks take 5–30s per event** (`EVENT_MIN/MAX_DELAY_SECONDS`), so invoice
  status is not instantaneous. Watch push state and “last synced”.
- **Role changes need a reload** because permissions come from `/auth/me` on
  bootstrap.
- **Totals** are integer minor units; the UI formats them and never does float
  arithmetic.
- Deal-only data has no timestamps; creation times come from the `_id`.
