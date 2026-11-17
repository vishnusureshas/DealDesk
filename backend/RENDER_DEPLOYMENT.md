# Deploy the DealDesk Backend on Render

This guide deploys the complete backend:

- `dealdesk` API and Socket.IO server
- `billport` mock billing service and webhook ticker
- MongoDB Atlas for both databases

Render does not provide a managed MongoDB database. Both Render services connect to MongoDB Atlas.

## 1. Deployment Topology

| Component | Render type | Root directory | Build command | Start command | Health check |
| --- | --- | --- | --- | --- | --- |
| BillPort | Web Service | `backend` | `npm ci && npm run build --workspace billport` | `node billport/dist/server.js` | `/health` |
| DealDesk | Web Service | `backend` | `npm ci && npm run build --workspace dealdesk` | `node dealdesk/dist/server.js` | `/health` |
| MongoDB | Atlas M0 or higher | n/a | n/a | n/a | n/a |

Deploy BillPort first, then DealDesk, then connect their public URLs.

## 2. Prerequisites

- The repository is pushed to GitHub, GitLab, or Bitbucket.
- `backend/package-lock.json` is committed.
- You have a Render account.
- You have a MongoDB Atlas account.
- You have Node.js 22 available locally for the one-time seed and index setup.
- Do not commit any `.env` file.

## 3. Create MongoDB Atlas

### 3.1 Create the cluster

1. Sign in to MongoDB Atlas.
2. Create a free `M0` cluster.
3. Choose the region closest to your Render region.

### 3.2 Create the database user

1. Open **Database Access**.
2. Create a user with **Read and write to any database**.
3. Save the username and password.

If the password contains special characters such as `@`, `:`, `/`, or `#`, URL-encode it in the connection string.

### 3.3 Allow Render to connect

1. Open **Network Access**.
2. For a demo deployment, add `0.0.0.0/0`.
3. For tighter security, use Render static outbound IPs and allow only those IPs.

### 3.4 Get both connection strings

Use two databases in the same Atlas cluster:

```text
mongodb+srv://<user>:<password>@<cluster-host>/dealdesk?retryWrites=true&w=majority
mongodb+srv://<user>:<password>@<cluster-host>/billport?retryWrites=true&w=majority
```

Keep these values for the Render environment variables.

## 4. Generate Secrets

Generate a JWT secret and a shared webhook secret. They must be long and random.

PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the first value for `JWT_SECRET` and the second for `BILLPORT_SHARED_SECRET`.

The same `BILLPORT_SHARED_SECRET` must be configured on both Render services.

## 5. Create the BillPort Web Service

In Render:

1. Select **New > Web Service**.
2. Connect the repository.
3. Enter a name such as `dealdesk-billport`.
4. Select the main branch.
5. Set **Root Directory** to `backend`.
6. Set **Runtime** to `Node`.
7. Set **Build Command** to:

```bash
npm ci && npm run build --workspace billport
```

8. Set **Start Command** to:

```bash
node billport/dist/server.js
```

9. Set **Health Check Path** to:

```text
/health
```

10. Add these environment variables:

```text
NODE_ENV=production
MONGO_URI=mongodb+srv://<user>:<password>@<cluster-host>/billport?retryWrites=true&w=majority
DEALDESK_WEBHOOK_URL=https://<dealdesk-service>.onrender.com/webhooks/billport
BILLPORT_SHARED_SECRET=<shared-secret>
FAIL_RATE=0
SLOW_RATE=0
DUP_RATE=0
BAD_SIG_RATE=0
EVENT_MIN_DELAY_SECONDS=5
EVENT_MAX_DELAY_SECONDS=30
```

Notes:

- Do not set `PORT`. Render injects it automatically.
- `FAIL_RATE=0`, `SLOW_RATE=0`, `DUP_RATE=0`, and `BAD_SIG_RATE=0` make the deployment deterministic. Raise them if you want to demonstrate BillPort's controlled failures and retries.
- `DEALDESK_WEBHOOK_URL` can be corrected after the DealDesk service is created.

11. Click **Create Web Service** and wait for the deploy to finish.

## 6. Create the DealDesk Web Service

In Render:

1. Select **New > Web Service**.
2. Connect the same repository.
3. Enter a name such as `dealdesk-api`.
4. Select the main branch.
5. Set **Root Directory** to `backend`.
6. Set **Runtime** to `Node`.
7. Set **Build Command** to:

```bash
npm ci && npm run build --workspace dealdesk
```

8. Set **Start Command** to:

```bash
node dealdesk/dist/server.js
```

9. Set **Health Check Path** to:

```text
/health
```

10. Add these environment variables:

```text
NODE_ENV=production
MONGO_URI=mongodb+srv://<user>:<password>@<cluster-host>/dealdesk?retryWrites=true&w=majority
JWT_SECRET=<jwt-secret>
JWT_EXPIRES_IN=8h
BILLPORT_URL=https://<billport-service>.onrender.com
BILLPORT_SHARED_SECRET=<shared-secret>
PUSH_TIMEOUT_MS=3000
PUSH_BASE_DELAY_MS=2000
PUSH_MAX_DELAY_MS=60000
PUSH_MAX_ATTEMPTS=10
WORKER_POLL_MS=2000
RECON_STALE_MINUTES=1
RECON_INTERVAL_SECONDS=15
CORS_ORIGIN=<frontend-origin>
```

Notes:

- Do not set `PORT`.
- `BILLPORT_URL` must be the full HTTPS BillPort URL, with no trailing slash.
- `CORS_ORIGIN` is used by both REST and Socket.IO.
- `CORS_ORIGIN` accepts one origin or `*`. It does not accept a comma-separated list.
- For a temporary all-origin demo, use `CORS_ORIGIN=*`.
- For a deployed frontend, use its exact origin, for example `https://dealdesk-web.onrender.com`.
- If you run the frontend locally against this backend, use `CORS_ORIGIN=http://localhost:5173`.

11. Click **Create Web Service** and wait for the deploy to finish.

## 7. Connect the Two Services

After both services have public URLs:

1. Copy the BillPort URL, for example:

```text
https://dealdesk-billport.onrender.com
```

2. Set DealDesk's `BILLPORT_URL` to that value.
3. Copy the DealDesk URL, for example:

```text
https://dealdesk-api.onrender.com
```

4. Set BillPort's `DEALDESK_WEBHOOK_URL` to:

```text
https://dealdesk-api.onrender.com/webhooks/billport
```

5. Save the environment changes. Render restarts each service after an environment change.
6. Confirm both services show a successful deploy.

## 8. Seed Atlas and Create Indexes

The seed is destructive. It drops the DealDesk database and recreates it. Never put the seed in a Render build or start command.

Run these commands from `backend/` on your local machine.

PowerShell:

```powershell
$env:MONGO_URI="mongodb+srv://<user>:<password>@<cluster-host>/dealdesk?retryWrites=true&w=majority"
$env:JWT_SECRET="<same-jwt-secret-as-render>"
$env:BILLPORT_SHARED_SECRET="<same-shared-secret-as-render>"
npm run seed
```

Then create all indexes:

```powershell
$env:DEALDESK_MONGO_URI=$env:MONGO_URI
$env:BILLPORT_MONGO_URI="mongodb+srv://<user>:<password>@<cluster-host>/billport?retryWrites=true&w=majority"
npm run sync:indexes
```

Why the index step is required:

- Production sets `autoIndex` to `false`.
- Unique indexes protect invoice idempotency, ledger exactly-once behavior, webhook deduplication, and pending-approval concurrency.
- `npm run sync:indexes` syncs every DealDesk and BillPort model index.

The seed creates demo users and one demo dataset. Treat those accounts as test-only. Remove or rotate them before exposing the deployment to real traffic.

Do not run `npm run seed` again after users start creating real data.

## 9. Smoke Test the Deployment

PowerShell:

```powershell
$dealdesk = "https://<dealdesk-service>.onrender.com"
$billport = "https://<billport-service>.onrender.com"

Invoke-RestMethod "$dealdesk/health"
Invoke-RestMethod "$billport/health"
```

Expected responses:

```json
{"status":"ok","service":"dealdesk"}
{"status":"ok","service":"billport"}
```

Test login and an authenticated endpoint:

```powershell
$body = @{
  email = "<seeded-demo-email>"
  password = "<seeded-demo-password>"
} | ConvertTo-Json

$login = Invoke-RestMethod `
  -Method Post `
  -Uri "$dealdesk/auth/login" `
  -ContentType "application/json" `
  -Body $body

$headers = @{ Authorization = "Bearer $($login.token)" }

Invoke-RestMethod "$dealdesk/auth/me" -Headers $headers
Invoke-RestMethod "$dealdesk/deals?limit=1" -Headers $headers
Invoke-RestMethod "$dealdesk/threads?limit=1" -Headers $headers
```

The threads response must contain `items` and `nextCursor`. A non-null `nextCursor` means pagination is working.

## 10. Connect the Frontend

Set these variables in the frontend hosting provider:

```text
VITE_API_URL=https://<dealdesk-service>.onrender.com
VITE_SOCKET_URL=https://<dealdesk-service>.onrender.com
```

Then set DealDesk's `CORS_ORIGIN` to the deployed frontend origin.

Render environment changes restart the service automatically.

## 11. Render Operational Notes

- Free Render web services sleep after inactivity. While a service is asleep, the push worker, webhook ticker, and reconciler do not run.
- For reliable background processing and webhook delivery, use an always-on paid instance.
- Keep each service at one instance. The event bus, Socket.IO adapter, and workers are in-process and are not designed for multiple instances without a broker and Redis adapter.
- All persistent application data belongs in Atlas. The Render filesystem is not used for application data.
- Do not add `npm run seed` to any Render command.
- Do not commit `.env` files or production secrets.
- The BillPort debug routes (`/debug/*`) are unauthenticated. Do not expose a production billing service with those routes publicly. For a public demo, restrict access at the network layer or use a private service.

## 12. Troubleshooting

| Symptom | Check |
| --- | --- |
| Service exits immediately | Render logs. `JWT_SECRET` and `BILLPORT_SHARED_SECRET` are required. |
| Mongo connection timeout | Atlas network access, database username/password, URL encoding, and database name in `MONGO_URI`. |
| Health check fails | Ensure the health path is `/health` and the service is listening on Render's injected `PORT`. |
| Browser gets CORS errors | `CORS_ORIGIN` must exactly match the frontend origin, without a trailing slash. |
| Socket.IO connects then fails | `VITE_SOCKET_URL` must point at the DealDesk service and `CORS_ORIGIN` must allow the frontend. |
| Webhooks return `401 BAD_SIGNATURE` | `BILLPORT_SHARED_SECRET` differs between the two services. |
| Invoices stay `queued` | Check `BILLPORT_URL`, BillPort health, and whether the Render services are sleeping. |
| Duplicate invoices or ledger rows | Run `npm run sync:indexes` against both Atlas databases. |
| Build cannot find `package-lock.json` | Commit `backend/package-lock.json` and set Root Directory to `backend`. |
| `nextCursor` missing from threads | Deploy the current backend revision and restart DealDesk. |

## 13. Security Checklist

- [ ] `JWT_SECRET` and `BILLPORT_SHARED_SECRET` are random and different from local defaults.
- [ ] Secrets are stored only in Render environment variables.
- [ ] Atlas network access is as narrow as practical.
- [ ] `CORS_ORIGIN` is the real frontend origin, not `*`, outside temporary demos.
- [ ] Atlas indexes were synchronized with `npm run sync:indexes`.
- [ ] Seeded demo accounts are removed or rotated before real use.
- [ ] BillPort debug endpoints are not publicly exposed for a production deployment.
- [ ] A paid always-on instance is used if background invoice processing must be reliable.
