# ALERT DATA implementation plan

## Scope
ALERT DATA is a mobile-first Nigerian VTU web application with a purple/white customer experience and a separate admin area. The application provides account creation with email verification, login, forgot-password recovery, a wallet secured by a transaction PIN, Paystack wallet funding, VTU.ng adapter boundaries for digital services, order history, betting-wallet funding, and admin visibility into users and orders.

## Architecture
- **Frontend:** Separate HTML entry pages in `public/`, modular CSS in `public/css/`, and modular browser JavaScript in `public/js/`.
- **Backend:** Node.js + Express in `server.js`, with routes split into authentication, wallet, catalog, order and admin modules.
- **Storage:** A small JSON store for an upload-ready demo and low-volume starter deployment. The store boundary is isolated in `server/store/db.js` so it can be replaced with MySQL/Postgres without changing route contracts.
- **External adapters:** `server/services/paystack.js`, `server/services/vtu.js` and `server/services/email.js` read environment variables. Without provider credentials, the app stays in explicit demo mode instead of pretending a live transaction succeeded.
- **Sessions:** Signed, HTTP-only cookie sessions held in memory for the starter; production deployments should switch to a shared session store before horizontal scaling.

## Design direction
Three possible directions were considered: **purple fintech calm** (0.06), **neon utility dashboard** (0.04), and **editorial mobile money** (0.08). The selected direction is **purple fintech calm**.

- **Design movement:** contemporary Nigerian fintech minimalism with a soft editorial layer.
- **Core principles:** make the next action obvious; keep money state visible; use generous white space; make errors actionable and human.
- **Color philosophy:** a confident indigo-purple brand color anchors trust and action, while lilac surfaces and warm white space keep the experience friendly on small screens.
- **Layout paradigm:** a left-edge account rail on desktop that collapses into a compact bottom action bar on mobile; content flows in stacked cards rather than dense admin grids.
- **Signature elements:** a violet “signal” mark, rounded balance tiles, and small status chips with plain-language feedback.
- **Interaction philosophy:** every purchase has a review step, then PIN confirmation; verification states are explicit and never implied.
- **Animation:** quick 160–220ms lift/fade transitions, no decorative motion during payment confirmation, and a subtle pulse only for pending states.
- **Typography system:** system-ui for performance, with strong 700/800 headings and 500 labels; tabular figures for balances.
- **Brand essence:** “Everyday digital services, one clear balance.” Personality: steady, helpful, local.
- **Brand voice:** direct and reassuring. Examples: “Top up your wallet, then get it done.” and “We’ll tell you exactly what needs attention.”
- **Wordmark & logo:** a compact signal-ring mark next to the ALERT DATA wordmark; the mark doubles as a loading indicator.
- **Signature brand color:** Alert Violet `#6d4aff`.

## Delivery
The app will run on `PORT` (default 3000), provide `/api/health`, serve static frontend files, include `.env.example`, `README.md`, a Dockerfile and a ZIP containing the separated source. Live credentials are never embedded in the code.
