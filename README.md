# FreightTrack — Freight Bill Lifecycle Tracker

A full-stack freight bill tracking web application built with:

- **Backend**: [Hono](https://hono.dev/) + [Drizzle ORM](https://orm.drizzle.team/) on Cloudflare Workers
- **Frontend**: [Vite](https://vite.dev/) + React
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite-compatible)

## Features

- **Bill lifecycle tracking**: draft → submitted → picked up → in transit → out for delivery → delivered → invoiced → paid (with disputed/cancelled transitions)
- **Customer management**: name, company, email, phone, address
- **Document attachment**: attach BOLs, invoices, proof of delivery, customs docs, etc.
- **Activity log**: full audit trail of every status change and document upload
- **Dashboard**: live stats — total bills, active bills, customers, revenue
- **Filter & search** bills by status, customer, carrier, or tracking number

## Project Structure

```
├── backend/               # Hono Cloudflare Worker
│   ├── src/
│   │   ├── index.ts       # App entry point + CORS
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
└── schema.sql             # D1 database schema
```

## Getting Started

### Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm i -g wrangler`)
- A Cloudflare account

### Install dependencies

```bash
npm install
```

### Set up the D1 database

1. Create the D1 database:
   ```bash
   wrangler d1 create freight-bills-db --config backend/wrangler.toml
   ```
2. Copy the `database_id` from the output into `backend/wrangler.toml`
3. Run the schema migration:
   ```bash
   npm run db:migrate --workspace=backend          # remote
   npm run db:migrate:local --workspace=backend    # local dev
   ```

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

## Bill Lifecycle

```
draft → submitted → picked_up → in_transit → out_for_delivery → delivered → invoiced → paid
                                    ↓              ↓                ↓           ↓         ↓
                                disputed ←─────────────────────────────────────────────────
                                cancelled ← (available from most statuses)
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/customers` | List all customers |
| POST | `/api/customers` | Create customer |
| PUT | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete customer |
| GET | `/api/bills` | List bills (filter: `?status=`, `?search=`) |
| POST | `/api/bills` | Create bill |
| GET | `/api/bills/:id` | Get bill with documents & events |
| PUT | `/api/bills/:id` | Update bill details |
| PUT | `/api/bills/:id/status` | Advance lifecycle status |
| POST | `/api/bills/:id/documents` | Attach a document |
| DELETE | `/api/bills/:id/documents/:docId` | Remove a document |
| GET | `/api/bills/:id/events` | Get activity log |
