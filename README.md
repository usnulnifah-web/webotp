# webotp

Developer-first SaaS/API provider untuk virtual number dan OTP. Project ini menyediakan public marketing site, authenticated workspace, wallet ledger, idempotent activation flow, secure API keys, signed webhook data model, supplier abstraction, database-driven pricing, dan REST API v1.

## Live preview

- Preview: `https://3000-il877pzsmns87u0uungsj-d87631eb.sg2.manus.computer`
- Public catalog: `/api/v1/services`
- API base: `/api/v1/`

## Stack

- React + TypeScript + TailwindCSS
- Express + tRPC
- Drizzle ORM + MySQL/TiDB
- Manus OAuth session authentication
- JSON REST API

> The managed WebDev runtime is Node-based. The project is intentionally implemented on the supported WebDev stack so the preview, database, auth, and deployment pipeline work together directly.

## Implemented capabilities

- Public landing page with service catalog, platform overview, developer docs, FAQ, and status metrics.
- Authenticated dashboard with balance, activation, wallet ledger, API key, webhook, and documentation views.
- Database tables for `wallets`, `wallet_transactions`, `deposits`, `refunds`, `activations`, `activation_events`, `api_keys`, `webhook_endpoints`, `webhook_deliveries`, `suppliers`, and `services`.
- Activation state machine records `CREATED → RESERVED → PENDING`, with data model support for `OTP_RECEIVED`, `SUCCESS`, `CANCELLED`, `TIMEOUT`, and `REFUND`.
- Atomic wallet debit with wallet version checks, unique ledger references, and per-user idempotency key constraints.
- API secrets are stored as SHA-256 hashes; full secret is returned only on creation/regeneration.
- Supplier abstraction through `SupplierInterface` and `SupplierRouter` scoring stock, price, availability, success rate, response time, and admin priority.
- Database-driven supplier and service pricing fields: supplier, sale, reseller, VIP, and API prices.
- REST endpoints: balance, services, countries, prices, availability, buy number, activation status, cancel/refund, history, and account.
- Webhook endpoint creation and test-delivery records with event ID, timestamp, payload, signature field, attempts, status, and idempotency-ready delivery storage.

## REST usage

Public:

```bash
curl https://YOUR_HOST/api/v1/services
curl https://YOUR_HOST/api/v1/countries
curl https://YOUR_HOST/api/v1/prices
curl https://YOUR_HOST/api/v1/availability
```

Authenticated:

```bash
curl -H 'X-API-Key: wotp_...' https://YOUR_HOST/api/v1/balance
curl -H 'X-API-Key: wotp_...' https://YOUR_HOST/api/v1/history
curl -H 'X-API-Key: wotp_...' https://YOUR_HOST/api/v1/account
```

Buy with idempotency:

```bash
curl -X POST https://YOUR_HOST/api/v1/number/buy \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: wotp_...' \
  -d '{"serviceId":1,"idempotencyKey":"order-client-unique-001"}'
```

Every response follows:

```json
{"success":true,"data":{},"message":"Success","error":null}
```

## Local development

```bash
pnpm install
pnpm db:push
pnpm dev
```

### First-run admin setup

After the database migration, open the web address. The application first shows a mandatory **Create admin account** screen. Until the first admin account exists, the application workspace remains locked. The admin password is exactly **six numeric digits**; it is salted and stored as a scrypt hash, never as plain text. After setup, the browser is signed in automatically. On later visits, the admin login screen is shown until a valid local admin session is established.

The original OAuth session flow and API-key authentication remain available for existing integrations. The local admin session is an additional installation gate for the web interface.

### Security and operations

Admin login is rate-limited with a 15-minute lockout after five failed attempts. Administrators can change the six-digit password, revoke all active sessions, and review security audit events from **Security** in the dashboard. State-changing tRPC requests require a double-submit CSRF token; API-key REST requests do not use cookie authentication and therefore do not require a CSRF token.

The service exposes `GET /health` for liveness and `GET /ready` for database readiness. Public catalog REST and tRPC endpoints remain locked with `ADMIN_SETUP_REQUIRED` until the first admin account exists. Once setup is complete, they are available as documented above.

Create a MySQL dump with the included command. Store the resulting file outside the repository and in a protected backup location:

```bash
pnpm db:backup
```

The command reads `DATABASE_URL`, writes a timestamped dump under `backups/`, and excludes that directory from Git. It is intentionally run by the deployment scheduler or backup system rather than by an unauthenticated web request.

Checks:

```bash
pnpm check
pnpm test
pnpm build
```

## Live supplier and payments

The core system is ready for real supplier adapters and payment-provider webhooks. To activate real external fulfillment, implement a concrete `SupplierInterface` adapter with the supplier API URL, credential secret, service/country mapping, reserve/status/cancel calls, timeout, and error mapping. For real deposits, connect a QRIS/payment provider webhook to update `deposits` and append a credit ledger entry atomically. No external supplier or payment credential was available in this build, so the initial database catalog is operational configuration for the first route, not a claim that an external provider has already been connected.

## Security notes

- Never commit `.env` or provider secrets.
- API key secrets are shown once; rotate immediately if exposed.
- Use HTTPS in production.
- Add a queue/worker for high-volume webhook retry and supplier polling when moving beyond the managed request runtime.
