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

Checks:

```bash
pnpm check
pnpm test
pnpm build
```

## Live supplier and payments

The core system is ready for real supplier adapters and payment-provider webhooks. To activate real external fulfillment, implement a concrete `SupplierInterface` adapter with the supplier API URL, credential secret, service/country mapping, reserve/status/cancel calls, timeout, and error mapping. No external supplier or payment credential was available in this build, so saving configuration is not a claim that an external provider has already been connected.

### Admin operations panel

Sign in with an account whose role is `admin`, then open `/admin`. The panel supports adding supplier connection metadata, tracking whether an encrypted credential is stored, changing catalog prices, and viewing aggregate activation, deposit, supplier, and webhook-delivery status. Admin reads and mutations are protected by the `adminProcedure` role check. Existing credentials are never returned to the browser. The provider adapter still needs to be implemented and tested against the chosen supplier's published API before a route is production-ready.

Set `SUPPLIER_CREDENTIAL_ENCRYPTION_KEY` in the deployment secret manager before storing supplier API keys. Generate a key with `openssl rand -base64 32`; it must decode to exactly 32 bytes. Back it up securely: losing it makes previously stored supplier credentials unreadable. Never add this value or provider keys to source control.

### Generic QRIS payment callback

The callback endpoint is `POST /api/webhooks/payments/qris`. It accepts a JSON event with `event_id`, `reference` (the deposit reference returned by `wallet.createDeposit`), `status: "paid"`, and integer `amountMinor`. The sender must provide `X-Payment-Signature: sha256=<hex HMAC-SHA256 of the exact raw HTTP body>`. Configure `QRIS_WEBHOOK_SECRET` to the shared signing secret from the payment provider. The handler rejects missing/invalid signatures, unknown or non-pending references, and amount mismatches. It marks a pending deposit paid and credits the wallet ledger in one database transaction; repeated callbacks for an already-paid deposit do not credit it twice. A real QRIS gateway still needs to be selected and configured, and its callback fields/signature scheme may require a provider-specific adapter or mapping.

Example signature generation (run in the provider integration service; do not place the secret in frontend code):

```js
const signature = `sha256=${crypto.createHmac("sha256", process.env.QRIS_WEBHOOK_SECRET)
  .update(rawRequestBody).digest("hex")}`;
```

The admin panel indicates whether the payment signing secret and supplier encryption key exist, but does not claim a provider is reachable. For independent service uptime and webhook receipt, deploy this application on managed persistent hosting rather than relying on a local development process.

## Security notes

- Never commit `.env` or provider secrets.
- API key secrets are shown once; rotate immediately if exposed.
- Use HTTPS in production.
- Add a queue/worker for high-volume webhook retry and supplier polling when moving beyond the managed request runtime.
