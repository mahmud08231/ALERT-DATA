# ALERT DATA delivery checklist

- [x] Purple-and-white mobile-friendly home page for Nigerian users with clear actions for data, airtime, bills, TV, exam pins and betting funding.
- [x] Separate registration page that collects a wallet PIN and sends a six-digit email verification code.
- [x] Email verification page that accepts the code, shows a 60-second resend cooldown, and supports resend after the cooldown.
- [x] Separate login page with invalid-credential feedback and a forgot-password link.
- [x] Forgot-password flow that emails a time-limited reset token and accepts a new password.
- [x] Authenticated dashboard that shows wallet balance and quick actions.
- [x] Wallet funding flow with Paystack initialization/verification hooks and safe demo mode when credentials are absent.
- [x] Transaction PIN gate before wallet-funded purchases.
- [x] Data purchase flow for MTN, Glo, Airtel and 9mobile with plan and phone selection.
- [x] Airtime purchase flow with network, phone number and amount.
- [x] Electricity, DSTV/GOTV and JAMB/WAEC/NECO purchase routes with VTU.ng adapter boundaries.
- [x] Betting funding flow listing the requested platforms, account verification, invalid-account feedback, amount selection and wallet debit after PIN confirmation.
- [x] Transaction history for the signed-in user.
- [x] Admin dashboard with summary cards, users and orders.
- [x] Separated frontend/backend source files, environment placeholders, upload instructions, health check, Dockerfile and ZIP package.
- [x] Existing wallet-funded purchases show explicit successful, declined or processing states, including insufficient-balance declines.
- [x] New `/gift-cards` page with homepage entry point, searchable country dropdown with flags, searchable card dropdown, amount and quantity steppers, GBP-to-NGN calculation, wallet PIN confirmation, manual-fulfillment alert and `orders.json` persistence.
