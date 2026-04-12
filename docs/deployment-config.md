# Deployment Configuration Matrix

This document maps each deployment setting to its source and where it is consumed.

Reference docs:

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Workers environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables/)
- [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

## Source-of-truth model

- Runtime bindings and environment-specific config are defined in `backend/wrangler.toml`.
- Single deploy workflow (`.github/workflows/deploy.yml`) selects environment from GitHub context:
  - `push` to `main` -> `production`
  - `pull_request` -> `staging`
  - non-main `push` -> `staging` only when branch has an open PR
  - `workflow_dispatch` -> `production` on `main`, else `staging`
- Access auth values are synced as Worker secrets during CI before deploy.
- D1 database IDs are defined directly in `backend/wrangler.toml` per environment and used as-is by CI.

## Value mapping

| Key | Environment | Source | Consumed by | Notes |
| --- | --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | staging | GitHub Environment secret (`staging`) | Wrangler CLI and `cloudflare/wrangler-action` | Use a staging-only API token with least privilege |
| `CLOUDFLARE_API_TOKEN` | production | GitHub Environment secret (`production`) | Wrangler CLI and `cloudflare/wrangler-action` | Use a production-only API token with least privilege |
| `CLOUDFLARE_ACCOUNT_ID` | staging | GitHub Environment variable (`staging`) | Wrangler CLI and `cloudflare/wrangler-action` | Must match account where staging Worker/D1/R2 exist |
| `CLOUDFLARE_ACCOUNT_ID` | production | GitHub Environment variable (`production`) | Wrangler CLI and `cloudflare/wrangler-action` | Must match account where production Worker/D1/R2 exist |
| `DB` D1 `database_id` (staging) | staging | `backend/wrangler.toml` `env.staging.d1_databases` | Worker runtime + migration commands | CI no longer mutates D1 IDs |
| `DB` D1 `database_id` (production) | production | `backend/wrangler.toml` `env.production.d1_databases` | Worker runtime + migration commands | CI no longer mutates D1 IDs |
| `CF_ACCESS_TEAM_DOMAIN` | staging | GitHub Environment variable (`staging`) | CI validation + `wrangler secret put TEAM_DOMAIN --env staging` | Must start with `https://` and have no trailing slash |
| `CF_ACCESS_POLICY_AUD` | staging | GitHub Environment variable (`staging`) | CI validation + `wrangler secret put POLICY_AUD --env staging` | Access app audience tag |
| `CF_ACCESS_TEAM_DOMAIN` | production | GitHub Environment variable (`production`) | CI validation + `wrangler secret put TEAM_DOMAIN --env production` | Must start with `https://` and have no trailing slash |
| `CF_ACCESS_POLICY_AUD` | production | GitHub Environment variable (`production`) | CI validation + `wrangler secret put POLICY_AUD --env production` | Access app audience tag |
| `JWT_VALIDATION_DISABLED` | staging/prod/local | `backend/wrangler.toml` vars | Worker runtime middleware | `false` in staging/prod, `true` local default |
| `TEAM_DOMAIN` | staging/prod/local | Worker secret in deployed envs, `.dev.vars` local | Worker runtime middleware | Secret required in Wrangler env config |
| `POLICY_AUD` | staging/prod/local | Worker secret in deployed envs, `.dev.vars` local | Worker runtime middleware | Secret required in Wrangler env config |
| `DB` D1 binding | staging/prod/local | `backend/wrangler.toml` env-specific `d1_databases` | Worker runtime + migration commands | Non-inheritable, defined per env |
| `DOCUMENTS_BUCKET` R2 binding | staging/prod/local | `backend/wrangler.toml` env-specific `r2_buckets` | Worker runtime + deploy-time binding validation | Non-inheritable, defined per env |

## Why this structure

- Cloudflare recommends using Wrangler configuration as source of truth.
- `vars` and bindings are non-inheritable in Wrangler, so each environment declares them explicitly.
- Access values are stored as GitHub environment variables and synced via Wrangler into Worker secrets at deploy time.
- GitHub checks remain for format constraints that Wrangler cannot express (for example URL shape checks).
- GitHub Environments gate credential/config access per environment, so `main` deployments and staging deployments can use different values and protection rules with one workflow file.
