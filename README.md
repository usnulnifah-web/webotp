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
- First-party email/password member sessions with optional Gmail SMTP OTP; OAuth is not used by the customer login UI
- JSON REST API

> The managed WebDev runtime is Node-based. The project is intentionally implemented on the supported WebDev stack so the preview, database, auth, and deployment pipeline work together directly.

## Implemented capabilities

- Public landing page with service catalog, platform overview, developer docs, FAQ, and status metrics.
- Authenticated dashboard with balance, activation, wallet ledger, API key, webhook, and documentation views.
- Database tables for `wallets`, `wallet_transactions`, `deposits`, `refunds`, `activations`, `activation_events`, `api_keys`, `webhook_endpoints`, `webhook_deliveries`, `suppliers`, and `services`.
- Activation state machine records `CREATED → RESERVED → PENDING`, with data model support for `OTP_RECEIVED`, `SUCCESS`, `CANCELLED`, `TIMEOUT`, and `REFUND`.
- Atomic wallet debit with wallet version checks, unique ledger references, and per-user idempotency key constraints.
- API secrets are stored as SHA-256 hashes; full secret is returned only on creation/regeneration.
- Local member passwords use salted scrypt hashes; email registration is not activated until a short-lived email OTP is verified.
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

## Customer login and email verification

Customer sign-in is first-party at `/login`; registration is at `/register`. Neither normal member login nor the client bootstrap calls or forwards a Manus OAuth session. New registrations require an emailed six-digit OTP (10-minute expiry). Passwords require 12–128 characters, are salted and hashed with scrypt, and are never stored as plaintext. Login/OTP operations have per-email and per-IP limits; session cookies are HttpOnly and last 12 hours. If an existing OAuth account needs a local password, registration sends an OTP to the account email and links the new password to that existing user record after verification.

To activate OTP delivery in deployment secrets, configure Gmail SMTP with a dedicated mailbox and a Google App Password (the mailbox must have 2-Step Verification enabled). Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_APP_PASSWORD`, and optionally `SMTP_FROM`. Also ensure `JWT_SECRET` is at least 32 characters and `VITE_APP_ID` is set. Do not use a normal Gmail account password, put secrets in source control, or expose these values to the client. Until SMTP credentials are supplied, registration is deliberately disabled and the admin monitoring card reports that email OTP is not ready.

Apply the new schema migration (`drizzle/0002_local_email_otp_auth.sql`) before enabling the updated application. Back up the database first. OAuth identities and admin roles remain on their existing user records; an email OTP proves mailbox control but does not grant admin rights.

An existing admin can link its verified mailbox/password by registering with the same account email and confirming OTP; its database role remains unchanged. To provision a new initial admin, first complete email verification, then grant `role='admin'` through a restricted database administration workflow. There is intentionally no public self-service admin promotion.

## Customer database backup and restore

The CLI exports users, salted password hashes, verification state, wallets, orders/activations, deposits, refunds, transaction ledgers, API-key hashes, supplier metadata, encrypted supplier credentials, and webhook records. It excludes transient authentication rate-limit counters. Output is gzip-compressed then authenticated-encrypted with AES-256-GCM; plaintext passwords are not part of the database or archive. The backup encryption key is separate from the supplier-credential key and database credentials.

Generate a 32-byte key once, store it in the deployment secret manager and a separate protected recovery location, and never commit it:

```bash
openssl rand -base64 32
# Inject the stored value from your secret manager; for an interactive shell:
read -rsp 'Backup key: ' BACKUP_ENCRYPTION_KEY; export BACKUP_ENCRYPTION_KEY; printf '\n'
pnpm db:backup -- ./backups/webotp-$(date -u +%Y%m%dT%H%M%SZ).webotp.enc
```

The backup file is created with owner-only permissions and refuses to overwrite an existing path. Store a copy away from the application host; the command itself does not upload files or create a scheduled backup job. To restore, provision a **fresh empty database**, set its `DATABASE_URL` plus the original `BACKUP_ENCRYPTION_KEY`, apply the current schema/migrations, then run:

```bash
pnpm db:restore -- ./backups/webotp-YYYYMMDDTHHMMSSZ.webotp.enc
```

Restore verifies the GCM authentication tag and imports everything in a transaction. It refuses to merge into non-empty application tables and rolls back on errors. Keep the backup key: losing it makes the archives unrecoverable. Test restores in a staging database and restrict both archive and key access because the archive contains customer personal data and password hashes.

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

The admin panel indicates whether the payment signing secret, supplier encryption key, email SMTP, and backup encryption key exist, but does not claim a provider is reachable. For independent service uptime and webhook receipt, deploy this application on managed hosting rather than relying on a local development process.

## Security notes

- Never commit `.env` or provider secrets.
- Customer passwords are salted hashes, not recoverable plaintext; verify mailbox access with OTP instead of trying to email/recover a stored password.
- Keep database backups and their separate AES-256 key in access-controlled, independent locations; regularly test restore in an empty staging database.
- Login and verification responses use no-store headers; customer profiles are not mirrored to browser localStorage.
- API key secrets are shown once; rotate immediately if exposed.
- Use HTTPS in production.
- Add a queue/worker for high-volume webhook retry and supplier polling when moving beyond the managed request runtime.
