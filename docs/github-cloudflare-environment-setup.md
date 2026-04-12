# GitHub + Cloudflare Environment Setup

This runbook documents exact setup for the single deployment workflow:

- `.github/workflows/deploy.yml`
- `main` branch deploys to `production`
- `pull_request` events deploy to `staging`
- non-main `push` deploys to `staging` only when branch has an open PR

## 1) Configure GitHub environments

Repository settings path:

1. Open repo in GitHub.
2. Go to **Settings -> Environments**.
3. Create two environments: `staging`, `production`.

### Environment secret (required in both environments)

Add this secret under each environment:

- `CLOUDFLARE_API_TOKEN`

### Environment variables (required in both environments)

Add these variables under each environment:

- `CLOUDFLARE_ACCOUNT_ID`
- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_POLICY_AUD`

Notes:

- Keep names identical across environments. Values differ by environment.
- `CF_ACCESS_TEAM_DOMAIN` must include `https://` and no trailing `/`.
- `CF_ACCESS_POLICY_AUD` must be the Access Application AUD tag.

### Recommended environment protection rules

For `staging`:

- Deployment branches: allow branch and PR-triggered staging usage for your flow.
- Required reviewers: optional.

For `production`:

- Deployment branches: `main` only.
- Required reviewers: enabled.
- Prevent self-review: enabled.
- Allow admin bypass: disabled (recommended for stronger controls).

Plan caveat:

- Some protection features depend on repository visibility and GitHub plan tier.

## 2) Create Cloudflare API tokens (least privilege)

Create two separate tokens:

- one token used only in `staging` GitHub environment
- one token used only in `production` GitHub environment

Cloudflare dashboard path:

1. Go to **My Profile -> API Tokens** (or Account API Tokens if using account-owned tokens).
2. Select **Create Token**.
3. Start from Workers template or Custom token.
4. Restrict to only the target account resource.

### Required permission groups for current workflow commands

The workflow runs:

- `wrangler secret put`
- `wrangler d1 migrations apply`
- `wrangler d1 list` (diagnostics)
- `wrangler deploy`

Grant only these account-level permissions:

- `Workers Scripts Edit`
- `D1 Edit`

If your account policy requires explicit R2 API permissions for deploy-time binding checks, add `Workers R2 Storage Edit` only when needed.

Do not grant:

- Zone permissions
- User permissions
- Unrelated account permissions

## 3) Map tokens to GitHub environments

Set environment config values as follows:

- `staging` environment:
  - Secret `CLOUDFLARE_API_TOKEN` = staging token
  - Variable `CLOUDFLARE_ACCOUNT_ID` = staging account id
- `production` environment:
  - Secret `CLOUDFLARE_API_TOKEN` = production token
  - Variable `CLOUDFLARE_ACCOUNT_ID` = production account id

Set Access values as environment variables in each environment:

- `CF_ACCESS_TEAM_DOMAIN` = Access team domain URL
- `CF_ACCESS_POLICY_AUD` = Access app audience tag

If both environments deploy to the same Cloudflare account, `CLOUDFLARE_ACCOUNT_ID` can match while tokens still remain separate.

## 4) Validate tokens before use

Run token verification (replace token value):

```bash
curl "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  --header "Authorization: Bearer <API_TOKEN>"
```

Expected response includes active token status.

## 5) Rotation procedure

1. Create new token for one environment.
2. Update that environment's `CLOUDFLARE_API_TOKEN` secret.
3. Run one deploy for that environment.
4. Revoke old token.
5. Repeat for the other environment.

This keeps blast radius isolated and avoids cross-environment downtime.
