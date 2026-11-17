# DealDesk

A demo backend for a B2B sales desk with configurable approvals, scoped permissions,
realtime deal chat and idempotent BillPort invoicing.

## Stack

- Node.js 20/22, npm
- Express 4
- MongoDB + Mongoose 8
- Socket.io 4
- JWT + bcrypt
- TypeScript + tsx
- zod for validation

## Project layout

```
backend/
  dealdesk/          # main DealDesk API
  billport/          # fake billing service with controlled misbehaviour
  seed/seed.ts       # re-runnable demo data
  tests/             # Vitest + supertest integration tests
  scripts/           # webhook demo scripts
  postman/           # Postman collection
  tsconfig.base.json
  package.json       # workspace scripts
```

## Prerequisites

- Node.js 20+ (22 tested)
- npm 9+
- A running MongoDB instance (local or Atlas). A local instance is easiest.

## Environment variables

Each app has its own `.env.example`. Copy them to `.env` before running.

### `backend/dealdesk/.env.example`

```env
NODE_ENV=development
PORT=4000
MONGO_URI=mongodb://localhost:27017/dealdesk
JWT_SECRET=change-me
JWT_EXPIRES_IN=8h
BILLPORT_URL=http://localhost:5000
BILLPORT_SHARED_SECRET=change-me
PUSH_TIMEOUT_MS=3000
PUSH_BASE_DELAY_MS=2000
PUSH_MAX_DELAY_MS=60000
PUSH_MAX_ATTEMPTS=10
WORKER_POLL_MS=2000
RECON_STALE_MINUTES=1
RECON_INTERVAL_SECONDS=15
CORS_ORIGIN=*
```

### `backend/billport/.env.example`

```env
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/billport
BILLPORT_SHARED_SECRET=change-me
DEALDESK_WEBHOOK_URL=http://localhost:4000/webhooks/billport
```

`BILLPORT_SHARED_SECRET` must match between DealDesk and BillPort.

## Setup

From `backend/`:

```bash
npm install
```

Copy the example env files:

```bash
Copy-Item dealdesk\.env.example dealdesk\.env
Copy-Item billport\.env.example billport\.env
```

Then edit the secrets. For local development the defaults are fine.

## Seed data

```bash
npm run seed
```

The seed is re-runnable: it drops the demo database and recreates the same
dataset. It creates:

- 2 branches: `Branch A`, `Branch B`
- 4 roles: `sales_exec`, `sales_manager`, `finance`, `admin`
- 6 users (5 required plus optional `managerB`)
- 3 customers
- 3 products
- 4 approval bands

All users share the password:

```
Password123!
```

| Email | Role | Branch |
|---|---|---|
| execA@dealdesk.test | sales_exec | Branch A |
| execB@dealdesk.test | sales_exec | Branch B |
| managerA@dealdesk.test | sales_manager | Branch A |
| managerB@dealdesk.test | sales_manager | Branch B |
| finance@dealdesk.test | finance | Branch A |
| admin@dealdesk.test | admin | Branch A |

## Run

From `backend/`:

```bash
npm run dev:billport
```

In another terminal:

```bash
npm run dev:dealdesk
```

The chat demo page is served at:

```
http://localhost:4000/chat.html
```

Open two tabs as different demo users to see live chat.

## Demo scripts

These sign webhook payloads directly and post them to DealDesk. They are
useful for the acceptance scenarios without waiting for BillPort's schedule.

```bash
npm run demo:webhook:duplicate
npm run demo:webhook:stale
npm run demo:webhook:tamper
```

They read `BILLPORT_SHARED_SECRET` from `dealdesk/.env`, and `DEALDESK_URL`
from the environment when supplied.

## Tests

```bash
npm test
npm audit --omit=dev
```

The suite covers the scope rules, approval boundaries and ordering, chain snapshots,
invalid approval configs, webhook dedupe/stale/tamper/orphan handling, ledger
exactly-once, convert idempotency, reconciliation and balance repair, REST chat,
and the Socket.io handshake/room delivery.

To run the Postman collection non-interactively against a seeded local stack:

```bash
npx newman run postman/DealDesk.postman_collection.json \
  --env-var dealdeskUrl=http://localhost:4000 \
  --env-var billportUrl=http://localhost:5000 \
  --env-var billportSharedSecret=change-me
```

## Postman

`postman/DealDesk.postman_collection.json` covers every endpoint in the API
contract. The collection uses the fixed demo ids set by the seed:

- customer: `64a1c0000000000000000001`
- product: `64a1c0000000000000000002`

Set `billportSharedSecret` in the collection variables (or pass it with
`--env-var` for Newman) to match the value in `.env`.

## Permissions and data scope

Roles are data in MongoDB. There are seven permission keys:

- `deal.view`
- `deal.edit`
- `discount.approve`
- `invoice.issue`
- `invoice.cancel`
- `chat.send`
- `admin.manage`

Each permission carries a scope:

- `own` (the user's own records)
- `branch` (the user's branch)
- `all` (every branch)

A single guard (`requirePermission`) is used on protected routes. It resolves
the scope from the permission, never from a role name.

Scope filters are applied inside the query:

- Deal and invoice reads use `ownerId` for `own`, `branchId` for `branch`, and
  no filter for `all`.
- Discount request visibility uses `requestedBy` for `own`, `branchId` for
  `branch`, and no filter for `all`.
- Detail routes use a single scoped `findOne`, so a cross-branch id returns
  `404`, not `200` with no data.

## Approval chain

The chain is data-driven. Bands are stored in `ApprovalConfig` and read from
the database on every request. No restart is needed after a config change.

The seeded bands are:

- `(0, 10]` -> auto-approved
- `(10, 25]` -> `sales_manager`
- `(25, 40]` -> `sales_manager`, `finance`
- `(40, 100]` -> `sales_manager`, `finance`, `admin`

Decisions are strictly sequential. A later approver gets `409` if the current
step has not been reached. A completed step gets `403`. Rejection resets the
deal to `open` and marks later steps as `skipped`.

When a request is created, its chain is snapshotted onto the request. Editing
the config later affects new requests, not in-flight ones.

## Invoice automation

Deal conversion is explicit:

```http
POST /deals/:id/convert
```

It requires `invoice.issue` and `deal.view`, and only works on `won` deals.
Conversion creates the local `Sale` and `Invoice` and queues the BillPort
push. BillPort is never called synchronously during conversion.

The push worker retries with exponential backoff and a ceiling. It stops after
`PUSH_MAX_ATTEMPTS` and marks the invoice `failed`. Manual retry is possible
through `POST /invoices/:id/retry`.

BillPort exposes a stable external id per invoice. DealDesk always sends the
same stable `idempotencyKey` per invoice, so a timeout followed by a retry
still produces exactly one BillPort record.

Webhooks are signed with HMAC-SHA256 against the raw body. DealDesk verifies
the signature before parsing. The endpoint responds `200` immediately and
processes asynchronously.

Duplicate events are ignored by unique `eventId`. Out-of-order events are
handled by a monotonic `sequence` gate. Orphan events are parked and replayed
once the matching `externalId` appears.

Balance changes go through a unique-keyed ledger:

- conversion adds a `receivable` entry
- payment adds a `payment` entry
- the customer balance is derived from the ledger and repaired if needed

## Honest trade-offs

- No Mongo transactions are used. The system uses atomic conditional updates
  and idempotent side effects instead. Standalone Mongo does not support
  multi-document transactions, so this was chosen deliberately.
- The push worker is a polling worker, not a real queue. It is simple and
  visible, but a real production system would likely use a durable queue.
- The event bus is in-process. A multi-node deployment would need a real
  broker and the Socket.io Redis adapter.
- Webhook processing is started after `200`. A crash in that window can lose
  one event; reconciliation repairs it later.
- Approval history is written after the decision gate. A crash between the
  gate and the history write can miss one history row.
- Self-approval is blocked: a requester cannot approve their own deal, even if
  they hold the right role.

## Decisions D1-D18

| # | Decision |
|---|---|
| D1 | Discount bands are `(min, max]`: 10% auto-approved, 25% manager, 25.01% manager then finance. |
| D2 | Conversion is explicit and only on `won` deals. |
| D3 | A discount requester needs `deal.edit` and must own the open deal. |
| D4 | Manager approval limit is expressed by chain configuration; scope comes from `discount.approve`. |
| D5 | "Their manager" is `User.managerId`. |
| D6 | Invoice cancel is local; BillPort has no cancel API. |
| D7 | Seed has 5 required users plus optional `managerB`. |
| D8 | Stale events are ordered by `sequence`, not `occurredAt`. |
| D9 | Convert creates Sale + Invoice locally and pushes in the background. |
| D10 | Balance changes are recorded in a unique-keyed ledger. |
| D11 | `admin.manage` is a separate permission held only by admin. |
| D12 | Invoice and invoice-log reads reuse the `deal.view` scope. |
| D13 | `finance` gets `chat.send`. |
| D14 | No self-approval. |
| D15 | Money is stored in integer minor units. |
| D16 | A rejected webhook is not resent by BillPort; reconciliation heals it. |
| D17 | Webhooks return `200` first, process afterwards. |
| D18 | Push retries use a 60s ceiling and 10 attempts, about a 5-minute window. |

## Docker Compose

From `backend/`:

```bash
docker compose up --build
```

This starts MongoDB, DealDesk and BillPort together.

To add demo data, run `npm run seed` from `backend/` on the host after the containers are up.

If you want to override the local secrets, set them before starting:

```powershell
$env:JWT_SECRET = "your-secret"
$env:BILLPORT_SHARED_SECRET = "your-shared-secret"
docker compose up --build
```

The services are exposed on:

- DealDesk: `http://localhost:4000`
- BillPort: `http://localhost:5000`

To stop the stack:

```bash
docker compose down
```

To also remove the Mongo volume:

```bash
docker compose down -v
```

## Known limitations / what to do with another day

- Add a real durable queue for BillPort pushes.
- Replace the in-process event bus with a broker for horizontal scaling.
- Add richer admin tooling around roles and approval config.
- Add multi-node socket tests (Redis adapter) and load testing.
- Improve observability: metrics, request ids and structured logs.
