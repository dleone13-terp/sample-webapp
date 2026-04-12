# FreightTrack — Freight Bill Lifecycle Tracker

A full-stack freight bill tracking web application built with:

- **Backend**: [Hono](https://hono.dev/) + [Drizzle ORM](https://orm.drizzle.team/) on Cloudflare Workers
- **Frontend**: [Vite](https://vite.dev/) + React
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite-compatible), with schema and migrations managed by [Drizzle ORM](https://orm.drizzle.team/)
- **File storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/) for uploaded bill documents

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

3. Create the R2 bucket (one-time):

   ```bash
   npm exec --workspace=backend -- wrangler r2 bucket create freight-bill-documents --config wrangler.toml
   ```

   For CI environments with separate storage isolation, create both buckets once:

   ```bash
   npm exec --workspace=backend -- wrangler r2 bucket create freight-bill-documents-prod
   npm exec --workspace=backend -- wrangler r2 bucket create freight-bill-documents-staging
   ```

4. Apply migrations:

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

# Both in the same command
npm run dev
```

### Build & Deploy

```bash
npm run build     # Build frontend → frontend/dist, then backend dry-run
npm run deploy    # Build + deploy to Cloudflare Workers
```

## CI/CD with GitHub Actions

Deployments use the official Wrangler GitHub Action.

- `.github/workflows/deploy.yml`: single workflow that routes to environments automatically (`main` -> `production`, `pull_request` -> `staging`, non-main `push` deploys `staging` only with an open PR, and `workflow_dispatch` uses `production` when run from `main` otherwise `staging`)
- `.github/docs/deployment-config.md`: source map of where each deployment value comes from (Wrangler config vs GitHub secrets vs Worker secrets)
- `.github/docs/github-cloudflare-environment-setup.md`: exact GitHub + Cloudflare setup for environments and API token permissions

Cloudflare source-of-truth model used in this repo:

- `backend/wrangler.toml` is the deployment configuration source of truth.
- Workflows deploy with Wrangler environments (`--env staging` / `--env production`) instead of generating separate CI TOML files.
- Non-inheritable keys (D1/R2 bindings and vars) are defined explicitly under each environment in `backend/wrangler.toml`, per Cloudflare docs.

Deployment lifecycle (staging and production both use the same steps):

1. Resolve target environment from branch/event
2. Build frontend and backend from the commit
3. Use env-specific D1 binding from `backend/wrangler.toml`
4. Apply remote migrations to env-specific D1
5. Sync Access secrets (`TEAM_DOMAIN`, `POLICY_AUD`) onto the env-specific Worker
6. Deploy Worker with `wrangler deploy --env <staging|production>`
7. Write deployment summary (and post PR preview comment for staging when PR context exists)

R2 bucket isolation:

- Production deploy binds `DOCUMENTS_BUCKET` to `freight-bill-documents-prod`.
- Staging deploy binds `DOCUMENTS_BUCKET` to `freight-bill-documents-staging`.
- Buckets are expected to exist before deployment and are referenced through `backend/wrangler.toml` bindings.

Staging and production both run migrations before deploy.

### Required GitHub environment config

Configure deploy settings in both environments (`staging` and `production`):

- GitHub **Environment secret**:
  - `CLOUDFLARE_API_TOKEN`
- GitHub **Environment variables**:
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CF_ACCESS_TEAM_DOMAIN`
  - `CF_ACCESS_POLICY_AUD`

Recommended least-privilege model:

- Use separate `CLOUDFLARE_API_TOKEN` values for staging and production.
- Scope each token only to the target Cloudflare account and only required permission groups.

Example values:

```dotenv
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p
CF_ACCESS_TEAM_DOMAIN=https://your-team.cloudflareaccess.com
CF_ACCESS_POLICY_AUD=4714c1358e65fe4b408ad6d432a5f878f08194bdb4752441fd56faefa9b2b6f2
```

Notes:

- `CF_ACCESS_TEAM_DOMAIN` should include `https://` and should not have a trailing slash.
- `CF_ACCESS_POLICY_AUD` should be the exact Access Application Audience (AUD) tag from Zero Trust.
- Staging and production environments should use different Access AUD values.
- Staging and production environments should use different Cloudflare API tokens.
- Enter secret and variable values as plain strings in GitHub (no surrounding quotes).
- D1 IDs are sourced directly from `backend/wrangler.toml` for staging and production.
- Deploy workflow reads `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_POLICY_AUD` from GitHub environment variables, then syncs them to Worker secrets (`TEAM_DOMAIN`, `POLICY_AUD`) using Wrangler (`wrangler secret put ... --env <env>`) before deploying with `backend/wrangler.toml`.

CI troubleshooting:

- If deploy logs show Cloudflare API errors `10000` or `9106`, verify that `CLOUDFLARE_API_TOKEN` is valid, unexpired, and has account permissions required for deploy and migrations.
- Verify `CLOUDFLARE_ACCOUNT_ID` matches the account where the Worker and D1 databases live.
- If deploy fails during "Apply D1 migrations", inspect migration ordering/compatibility and re-run after fixing migration scripts.

## Cloudflare Access Auth

This app uses Cloudflare Access in front of the Worker for both SPA and API traffic.

Current mode in this repo: **web OIDC login only**.

### 1) Configure Worker auth variables

Set these using Worker secrets and env vars:

- `TEAM_DOMAIN` (Worker secret): your Cloudflare Zero Trust team domain, for example `https://your-team.cloudflareaccess.com`
- `POLICY_AUD` (Worker secret): Access application AUD tag for the protected app
- `JWT_VALIDATION_DISABLED` (Wrangler `vars`): set to `false` in deployed environments; optionally `true` for local-only development

In CI, the workflow reads `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_POLICY_AUD` from GitHub environment variables and syncs `TEAM_DOMAIN` and `POLICY_AUD` onto each Worker environment before deploy.

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
| POST | `/api/bills/:id/documents` | Upload a document file (multipart form-data, `file` field required) |
| GET | `/api/bills/:id/documents/:docId/download` | Download a stored document file |
| DELETE | `/api/bills/:id/documents/:docId` | Remove a document |
| GET | `/api/bills/:id/events` | Get activity log |
