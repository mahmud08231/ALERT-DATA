# ALERT DATA

ALERT DATA is a separated Node.js + Express starter for a Nigerian VTU business. It includes data, airtime, bills, TV, exam pins, betting funding, wallet funding, email verification, password recovery, transaction PIN confirmation and an admin dashboard.

## Run locally

```bash
cp .env.example .env
npm install
npm start
```

Open `http://localhost:3000`.

For plain-HTTP local development, set `COOKIE_SECURE=false` in `.env`. Leave it `true` for HTTPS hosting and the managed Preview.

The demo store is created in `server/store/data.json` on first run. The default admin credentials come from `.env`; use the values in that file and change them before deployment.

## Local testing checklist

Run `npm start` and open `http://localhost:3000`. Set `COOKIE_SECURE=false` for plain HTTP. Create a new account with an email, password and 4–6 digit wallet PIN. If Gmail SMTP is not configured while `NODE_ENV=development`, the registration response displays a `devCode`; enter it on `/pages/verify-email.html`. The resend button starts disabled and becomes available after 60 seconds. You can also request a forgot-password code; in development without SMTP, the response displays a `devToken` for testing.

To test a successful purchase, use the dashboard’s demo wallet funding, add a test amount, then buy data or airtime and enter the wallet PIN. The dashboard should show `✓ Successful` and deduct the order amount. To test a decline, try an order whose amount is greater than the wallet balance; the page shows `✕ Declined — insufficient balance` and does not create a provider order. An incorrect PIN is rejected without changing the balance.

Gift Cards is available at `/gift-cards`. Select a country, choose a card, adjust GBP amount and quantity, and enter the wallet PIN. A successful manual order shows `Order received - Manual fulfillment` and is appended to the root `orders.json` file. Gift Cards does not call Paystack or a gift-card provider yet. Change `GIFTCARD_GBP_NGN_RATE` in `.env` to adjust the exchange rate; it defaults to `2118`.

## Dashboard settings and support

The dashboard includes a Settings page where a signed-in user can change their password after confirming their current password, and change their 4–6 digit wallet payment PIN after confirming the existing PIN. The Support page provides tap-to-call and WhatsApp links for ALERT DATA support.

## Email verification and forgot password

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` using the website owner’s email sender account. Gmail requires 2-Step Verification plus a Gmail App Password; do not use the sender account’s normal password. Verification codes go to each customer’s registered email address. After a successful login (including the automatic sign-in after email verification), the site emails a new-sign-in notice to that account email. Login still succeeds if SMTP is unavailable, but the notice will not arrive. If SMTP is not configured, development mode returns verification codes/reset tokens for testing; production never returns them.

## Paystack

Set `PAYSTACK_SECRET_KEY`. The backend exposes:

- `POST /api/wallet/paystack/initialize`
- `GET /api/wallet/paystack/verify/:reference`
- `POST /api/wallet/paystack/webhook`

Set the Paystack webhook URL to `/api/wallet/paystack/webhook` on your deployed HTTPS domain. Verify all webhook signatures before crediting a wallet; this starter does that with HMAC SHA-512.

## VTU.ng

`VTU_PLAN_SOURCE=static` (the default) loads the plan names and prices transcribed from the supplied video in `server/config/data-plans.js` and does not call VTU.ng to retrieve the catalogue. This mode is display-only: the video does not contain provider variation codes, so data checkout is blocked and no wallet is charged. To use the live provider catalogue instead, set `VTU_PLAN_SOURCE=provider`, `VTU_API_BASE_URL=https://api.vtu.ng/v1`, a valid `VTU_API_KEY`, and `VTU_MOCK_MODE=false`. `VTU_DATA_MARKUP_PERCENT` controls additional retail markup in provider mode and defaults to `0`. For sandbox testing, match the sandbox API base URL with a test key that has the `bills:read` and `bills:write` scopes. Data and airtime use the documented VTU.ng v1 purchase endpoints and unique idempotency keys. Other bill categories still require provider-specific endpoint/payload mapping before live sales.

If the plan selector shows HTTP 403 while `VTU_PLAN_SOURCE=provider`, VTU.ng has denied the catalogue request. Confirm the server-side key matches the selected live/sandbox base URL and ask VTU.ng to enable `bills:read`.

The dashboard notification bell stores user-specific sign-in, purchase and wallet-funding notices. Successful purchases show a confirmation dialog; insufficient balance gives the customer a direct Fund wallet action.

## Production hardening before accepting real money

Use a managed database and shared session store, replace the JSON store, set `COOKIE_SECURE=true`, use HTTPS, rotate the cookie secret, change the admin seed credentials, configure a real mail provider, add provider-specific idempotency keys, reconcile Paystack webhooks, add operational monitoring and review the VTU.ng agreement/API docs.

## Hosting

This app listens on `PORT` (default `3000`) and includes a `Dockerfile`. Upload the project folder or ZIP, install dependencies, copy `.env.example` to `.env`, set secrets in the hosting control panel and run `npm start`.

## Important demo behavior

- Email codes and password-reset tokens are visible in development responses only when SMTP is unavailable.
- Betting account verification is provider-backed when VTU credentials are active; in mock mode, the demo IDs in `DEMO_BETTING_IDS` are accepted and other IDs are rejected.
- A purchase always requires the user's 4–6 digit wallet PIN and sufficient wallet balance.
