# FreightTrack — Freight Bill Lifecycle Tracker

A full-stack freight bill tracking web application built with:

- **Backend**: [Hono](https://hono.dev/) on Cloudflare Workers
- **Frontend**: [Vite](https://vite.dev/) + React
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite-compatible), with schema and migrations managed by [Drizzle ORM](https://orm.drizzle.team/)

## Features

- **Bill lifecycle tracking**: draft → submitted → picked up → in transit → out for delivery → delivered → invoiced → paid (with disputed/cancelled transitions)
- **Customer management**: name, company, email, phone, address
- **Document attachment**: attach BOLs, invoices, proof of delivery, customs docs, etc.
- **Activity log**: full audit trail of every status change and document upload
- **Dashboard**: live stats — total bills, active bills, customers, revenue
- **Filter & search** bills by status, customer, carrier, or tracking number

## Project Structure

```text
├── backend/               # Hono Cloudflare Worker
│   ├── drizzle.config.ts  # Drizzle Kit configuration
│   ├── migrations/        # Auto-generated SQL migrations
│   ├── src/
│   │   ├── index.ts       # App entry point + CORS
│   │   ├── db/
│   │   │   ├── index.ts   # Drizzle D1 client factory
│   │   │   └── schema.ts  # Drizzle schema source of truth
│   │   ├── types.ts       # Shared TypeScript types
│   │   └── routes/
│   │       ├── customers.ts
│   │       └── bills.ts   # Bills CRUD, status transitions, documents
│   └── wrangler.toml
├── frontend/              # Vite + React SPA
│   └── src/
│       ├── pages/         # Dashboard, Bills, BillDetail, Customers
│       ├── components/    # StatusBadge, LifecycleTimeline
│       └── api/           # Typed API client
```

## Getting Started

### Prerequisites

- Node.js 18+
- A Cloudflare account

Wrangler is installed as a project dependency in the backend workspace. Run it through npm scripts (recommended) or `npm exec --workspace=backend -- wrangler ...` for one-off commands.

### Install dependencies

```bash
npm install
```

### Set up the D1 database

1. Create the D1 database:

   ```bash
   npm run db:create --workspace=backend
   ```

   One-off equivalent:

   ```bash
   npm exec --workspace=backend -- wrangler d1 create freight-bills-db --config wrangler.toml
   ```

2. Copy the `database_id` from the output into `backend/wrangler.toml`

3. Apply migrations:

   ```bash
   npm run db:migrate --workspace=backend          # remote
   npm run db:migrate:local --workspace=backend    # local dev
   ```

### Updating schema with Drizzle

1. Edit `backend/src/db/schema.ts`
2. Generate a new migration:

   ```bash
   npm run db:generate --workspace=backend
   ```

3. Apply the migration:

   ```bash
   npm run db:migrate:local --workspace=backend
   npm run db:migrate --workspace=backend
   ```

If migrations drift from your database state, regenerate from the latest schema and re-apply using the same commands above.

### Development

Run both backend and frontend in parallel:

```bash
# Terminal 1 — Hono worker (port 8787)
npm run dev --workspace=backend

# Terminal 2 — Vite frontend (port 5173, proxies /api → 8787)
npm run dev --workspace=frontend
```

### Build & Deploy

```bash
npm run build     # Build frontend → frontend/dist, then backend dry-run
npm run deploy    # Build + deploy to Cloudflare Workers
```

## CI/CD with GitHub Actions

Deployments use the official Wrangler GitHub Action.

- `.github/workflows/deploy-production.yml`: deploys on pushes to `main`
- `.github/workflows/deploy-preview.yml`: deploys preview Workers on non-main branch pushes when an open PR exists, and on PR open/reopen/synchronize
- `.github/workflows/deploy-preview-cleanup.yml`: deletes PR preview D1 database on PR close
- `.github/actions/setup-cloudflare-node/action.yml`: shared setup action used by workflows for Node setup, dependency install, and Cloudflare credential validation

Preview lifecycle:

1. Create/reuse `freight-bills-pr-<PR_NUMBER>` D1 database
2. Apply migrations to that PR database
3. Deploy `freight-bill-tracker-pr-<PR_NUMBER>` Worker
4. On PR close, delete `freight-bills-pr-<PR_NUMBER>`

Both production and preview run migrations before deploy.

### Required GitHub secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID_PROD`
- `CF_ACCESS_TEAM_DOMAIN_PROD`
- `CF_ACCESS_POLICY_AUD_PROD`
- `CF_ACCESS_TEAM_DOMAIN_PREVIEW`
- `CF_ACCESS_POLICY_AUD_PREVIEW`

Example values:

```dotenv
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p
CLOUDFLARE_D1_DATABASE_ID_PROD=123e4567-e89b-12d3-a456-426614174000
CF_ACCESS_TEAM_DOMAIN_PROD=https://your-team.cloudflareaccess.com
CF_ACCESS_POLICY_AUD_PROD=4714c1358e65fe4b408ad6d432a5f878f08194bdb4752441fd56faefa9b2b6f2
CF_ACCESS_TEAM_DOMAIN_PREVIEW=https://your-team.cloudflareaccess.com
CF_ACCESS_POLICY_AUD_PREVIEW=7b56db1f2d16411e9c8e53f67f8f9f6d50d7c0ae5b7e4a4ab7b1b9aa4c2d11ef
```

Notes:

- `CF_ACCESS_TEAM_DOMAIN_*` should include `https://` and should not have a trailing slash.
- `CF_ACCESS_POLICY_AUD_*` should be the exact Access Application Audience (AUD) tag from Zero Trust.
- Production and preview must use different Access AUD values.
- Enter secret values as plain strings in GitHub (no surrounding quotes).
- Deploy workflows write `TEAM_DOMAIN` and `POLICY_AUD` into generated CI Wrangler configs as Worker `[vars]`, so those keys should appear in Worker Variables after a successful deploy.

CI troubleshooting:

- If preview/prod workflow logs show Cloudflare API errors `10000` or `9106`, verify that `CLOUDFLARE_API_TOKEN` is valid, unexpired, and has account permissions for Workers and D1.
- Verify `CLOUDFLARE_ACCOUNT_ID` matches the account where the Worker and D1 databases live.
- A `SyntaxError` during JSON parsing after `wrangler d1 list --json` usually means Wrangler printed auth warnings/errors instead of JSON due to invalid credentials.
- If preview deploy fails at "Validate preview Access secrets", verify `CF_ACCESS_TEAM_DOMAIN_PREVIEW` and `CF_ACCESS_POLICY_AUD_PREVIEW` exist, are plain strings (no quotes), and the team domain starts with `https://` without a trailing slash.

## Cloudflare Access Auth

This app uses Cloudflare Access in front of the Worker for both SPA and API traffic.

Current mode in this repo: **web OIDC login only**.

### 1) Configure Worker auth variables

Set these in `backend/wrangler.toml` or override with environment-specific values in Cloudflare:

- `TEAM_DOMAIN`: your Cloudflare Zero Trust team domain, for example `https://your-team.cloudflareaccess.com`
- `POLICY_AUD`: Access application AUD tag for the protected app
- `JWT_VALIDATION_DISABLED`: set to `false` in deployed environments; optionally `true` for local-only development

For local development without Access edge enforcement, create `backend/.dev.vars`:

```dotenv
TEAM_DOMAIN="https://your-team.cloudflareaccess.com"
POLICY_AUD="replace-with-access-app-aud"
JWT_VALIDATION_DISABLED="true"
```

### 2) Access policy (@dayserver.net)

In Cloudflare Zero Trust:

1. Go to **Access controls → Applications** and create/configure a self-hosted app for your app hostname.
2. Add an **Allow** policy with:
    - Include: **Emails ending in** `@dayserver.net`
3. Save policy.

This policy gates both page access and API calls before requests hit the Worker.

The Worker middleware verifies Access JWTs; browser cross-origin behavior is controlled by CORS middleware.

### 3) Disable service-token-only API policies for now

If you previously configured API Service Auth policies, disable/remove those for now so API access is driven by webpage OIDC login only.

Use a single Allow policy for users in the browser (`@dayserver.net`) until you are ready to add machine-to-machine access again.

### 4) Retrieve AUD value

In Zero Trust, open your Access application and copy **Application Audience (AUD) Tag** into `POLICY_AUD`.

### 5) Verification checklist

- User with `@dayserver.net` can load frontend.
- User without `@dayserver.net` is denied by Access.
- Authenticated user can call `/api/*` from the frontend.
- Unauthenticated request to `/api/*` is denied.

### Operational concerns

- Frontend assets and API are served by the same Worker/domain. If you later add Service Auth for machine clients, ensure browser-user Allow policy still applies to `/api/*` or split API to a separate hostname.
- Access policies are configured in Cloudflare Zero Trust, not fully in repository code; this operational dependency is unavoidable unless you add Terraform/API automation.
- Local development does not replicate Access edge behavior exactly. Validate final behavior in deployed staging/production.

## Bill Lifecycle

```text
draft → submitted → picked_up → in_transit → out_for_delivery → delivered → invoiced → paid
                                    ↓              ↓                ↓           ↓         ↓
                                disputed ←─────────────────────────────────────────────────
                                cancelled ← (available from most statuses)
```

## API Reference

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/customers` | List all customers |
| POST | `/api/customers` | Create customer |
| PUT | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete customer |
| GET | `/api/bills` | List bills (filter: `?status=`, `?search=`) |
| POST | `/api/bills` | Create bill |
| GET | `/api/bills/:id` | Get bill with documents and events |
| PUT | `/api/bills/:id` | Update bill details |
| PUT | `/api/bills/:id/status` | Advance lifecycle status |
| POST | `/api/bills/:id/documents` | Attach a document |
| DELETE | `/api/bills/:id/documents/:docId` | Remove a document |
| GET | `/api/bills/:id/events` | Get activity log |
