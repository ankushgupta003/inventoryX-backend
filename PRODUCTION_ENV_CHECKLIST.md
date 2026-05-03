# InventoryX Production Env Checklist

Use this checklist before or immediately after a live deploy.

## Backend env

- `DATABASE_URL` points to the live Neon database and includes `sslmode=require`
- `DATABASE_URL` includes `connect_timeout=15`
- `JWT_ACCESS_SECRET` is a long random value
- `JWT_REFRESH_SECRET` is a different long random value
- `JWT_ACCESS_TTL` is reviewed and intentional
- `JWT_REFRESH_TTL` is reviewed and intentional
- `SUPER_ADMIN_NAME` is correct
- `SUPER_ADMIN_EMAIL` is a real admin mailbox you control
- `SUPER_ADMIN_PASSWORD` is treated as a bootstrap-only secret
- `FRONTEND_URL` matches the deployed frontend origin
- No production secret uses placeholder values such as `ChangeMe123!` or `change-me-*`

## Frontend env

- `VITE_API_URL` points at the deployed backend URL
- `VITE_USE_MOCK=false`
- Render rewrite `/* -> /index.html` is enabled for SPA routing

## Super-admin safety

- The super-admin account is created from env only if it does not already exist
- After first production login, change the super-admin password inside the app
- Do not rely on `SUPER_ADMIN_PASSWORD` as the day-to-day login password after bootstrap
- Keep `SUPER_ADMIN_EMAIL` stable unless you intentionally want a different bootstrap identity

## Secret rotation runbook

1. Change user-facing passwords inside the app first.
2. Rotate backend JWT secrets in Render and redeploy the backend.
3. Expect all existing sessions to be logged out after JWT rotation.
4. Confirm `/health` returns 200 after redeploy.
5. Confirm super-admin login still works.
6. Confirm a company admin can still log in.
7. Rotate provider API keys after deployment work is complete.

## Provider credentials to rotate after setup

- Render API keys
- Neon personal or org API keys
- Any GitHub token used for repo automation

## Optional but recommended

- Record who owns each secret and where it is stored
- Keep production values only in Render or another secret manager, not in committed files
- Review inactive demo accounts and remove any that are no longer needed
