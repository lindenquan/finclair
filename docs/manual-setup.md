# Manual Setup Checklist

Things that **cannot be automated from the repo** — they live in external dashboards, require human decisions, or touch billing/secrets. Work through this once; revisit when rotating credentials or onboarding a new environment.

Legend: 🔴 blocker (do before production) · 🟠 important · 🟡 recommended · 🟢 optional

---

## 🔴 Before production

### 2. Stripe account setup

#### a) Create a Stripe account
https://dashboard.stripe.com/register. Start in **test mode** until you're ready to accept real money.

#### b) Create products + prices
Products → **+ Create**. One product per credit pack (e.g. "50 Scans", "200 Scans", "1000 Scans"). Copy each `price_xxx` ID.
Paste price IDs into your `createCheckoutSession` function's `plans` map — see [payment-workflow.md](payment-workflow.md) § 1.

#### c) Restrict to card-only payments
Settings → Payment methods. **Disable:**
- SEPA Direct Debit
- ACH Direct Debit
- Bacs Direct Debit
- OXXO, Boleto, Konbini, Multibanco (all voucher-based)

**Keep enabled:** Card, Apple Pay, Google Pay, Link.

Rationale: [payment-workflow.md](payment-workflow.md) — async methods break the "`payment_status === paid` on redirect" invariant.

#### d) Configure webhook endpoint
Developers → Webhooks → **+ Add endpoint**.
- **URL:** your deployed `stripeWebhook` Cloud Function URL. Format:
  `https://<region>-<project-id>.cloudfunctions.net/stripeWebhook`
  (Copy exact URL from `firebase deploy` output.)
- **Events to send:** `checkout.session.completed`. Later: add `charge.refunded` when you implement refund handling.
- **Signing secret:** copy (`whsec_...`) — needed for the next step.

#### e) Store secrets in Firebase
```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
# Paste sk_test_xxx (test mode) or sk_live_xxx (production)

firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
# Paste whsec_xxx from step (d)
```

Reference them in function configs: `secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]`.

#### f) When ready: switch to live mode
Stripe Dashboard toggle top-right (Test data → Live). Repeat (b)–(e) with live keys. Test a real $1 purchase end-to-end before launch.

---

### 3. GCP billing budget + alerts
The single most important cost control. Without this, a runaway bug or abuse can rack up a 5-figure bill before you notice.

1. GCP Console → Billing → **Budgets & alerts** → Create budget.
2. Scope: **This Firebase project only** (not the billing account).
3. Amount: pick a monthly ceiling you're comfortable with ($20–$100 for a pre-revenue product).
4. Alert thresholds: 50% / 90% / 100% / 120%.
5. Notification channels: your email at minimum. Add Slack/Discord via Cloud Monitoring channels if you want live pings.
6. ⚠️ GCP does **not** auto-stop services at 100% — the alert is informational only. For a hard stop, use Pub/Sub + a Cloud Function that disables billing on breach: https://cloud.google.com/billing/docs/how-to/notify (advanced).

---

### 4. Vertex AI daily quota cap
Hard server-side ceiling on Gemini requests, enforced by GCP.

1. GCP Console → IAM & Admin → **Quotas**.
2. Filter: service `aiplatform.googleapis.com`, metric contains `generate` or model name.
3. Relevant quota: **Online prediction requests per minute per region** (or similar — naming varies by model).
4. Click **Edit** → set a reasonable cap (e.g. 100 RPM / 10,000 per day for a new app).
5. Submit request — usually auto-approved for decreases.

At the cap, Vertex returns 429. Your function should surface this as a user-friendly "scanning is busy, try again in a minute" message.

---

## 🟠 Important

### 5. Enable App Check
Blocks requests not originating from your app. Critical to prevent bot floods, scrapers, and curl abuse of your Cloud Functions.

1. Firebase Console → **App Check** → Get started.
2. Register your web app with **reCAPTCHA v3** (easiest for web) or reCAPTCHA Enterprise (free tier, more capable).
3. Get the site key → add to client:
   ```ts
   import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

   initializeAppCheck(app, {
     provider: new ReCaptchaV3Provider(import.meta.env.VITE_APP_CHECK_SITE_KEY),
     isTokenAutoRefreshEnabled: true,
   });
   ```
4. In each Cloud Function, set `enforceAppCheck: true`.
5. **Roll out gradually:** first deploy in "unenforced" mode (Firebase Console → App Check → APIs → unenforce) to see what traffic would be rejected. Flip to enforced once clean for 24 hours.

---

## 🟡 Recommended

### 10. Monitoring / alerting
Cloud Console → Monitoring → **Alerting**. Suggested policies:
- Cloud Functions error rate > 5% for 10 min.
- Cloud Functions `maxInstances` cap hit on `scanReceipt` (means raise cap).
- Firestore read/write quota > 80% of daily.
- Vertex AI 429 count > 0 for 5 min.

Route alerts to email + whatever chat tool you use (Slack / Discord webhook via Pub/Sub).

---

### 11. Log-based metrics for key events
Cloud Logging → **Logs-based Metrics**. Create counters for:
- `receipt_scan_success` — successful `parseReceipt` calls.
- `receipt_scan_failure` — failures by error type (Gemini down vs bad JSON vs quota exhausted).
- `purchase_credited` — successful credits (fires on both fast path and webhook).
- `purchase_fast_path_vs_webhook` — which path won the race (useful to confirm dual-path is working).

Emit structured logs from functions:
```ts
console.log(JSON.stringify({ event: "purchase_credited", uid, sessionId, path: "fast" }));
```

---

### 12. Cloud Run region alignment
Keep Firestore region == Cloud Functions region == Vertex AI region. Cross-region traffic is slower and costs egress.

Current default is `us-central1`. If you change Firestore location, also redeploy all functions with `region: "<your-region>"` in their config.

---

### 13. Secret rotation schedule
Set a reminder every 6–12 months to rotate:
- Stripe API keys (roll via dashboard, update via `firebase functions:secrets:set`, redeploy).
- Firebase service account keys (generate new, update GitHub Actions secret, delete old).
- App Check debug tokens (if you've created any for local dev).

---

### 14. Stripe webhook testing with CLI
Install Stripe CLI: https://stripe.com/docs/stripe-cli.
```bash
# Forward live webhook events to local emulator
stripe listen --forward-to http://localhost:5001/<project>/us-central1/stripeWebhook

# Trigger a test event
stripe trigger checkout.session.completed
```
The CLI prints a temporary webhook signing secret for local testing — use that in your local `.env`, not the production one.

---

## 🟢 Optional / good to have

### 15. App Check debug token for local dev
Without this, local testing against a function with `enforceAppCheck: true` fails. Firebase Console → App Check → your app → ⋮ → **Manage debug tokens**. Add the token to browser console:
```js
self.FIREBASE_APPCHECK_DEBUG_TOKEN = "your-debug-token";
```
before calling `initializeAppCheck`.

### 17. Firestore data export schedule
Cloud Console → Firestore → **Import/Export** → schedule daily exports to a GCS bucket. Keeps a disaster recovery snapshot.

### 18. Separate dev/staging/prod Firebase projects
For serious ops: `.firebaserc` with aliases:
```json
{ "projects": { "default": "finclair-dev", "prod": "finclair-prod" } }
```
Switch via `firebase use prod`. Each project has independent Firestore, functions, secrets, Stripe keys.

### 19. Uptime checks
Cloud Console → Monitoring → **Uptime checks** on your `getMyQuota` function (unauthenticated, simple ping endpoint if you add one). Alerts if availability drops.

### 20. Backup strategy for `processedSessions`
This collection is the ledger for what you've already credited. If it gets corrupted or deleted, you risk double-crediting. Daily Firestore export (#17) covers this.

---

## Sanity checklist before shipping to production

- [x] `.env` is NOT in git; real keys only in local file + CI secrets.
- [x] `firestore.rules` deployed; tested with rules-unit-testing.
- [x] GitHub Actions secrets configured (`FIREBASE_SERVICE_ACCOUNT` + all `VITE_FIREBASE_*` vars).
- [ ] Stripe in **live mode**; webhook endpoint points to production URL; signing secret stored via `firebase functions:secrets:set`.
- [ ] `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are live keys, not test.
- [ ] GCP billing budget configured with alerts.
- [ ] Vertex AI daily quota cap in place.
- [ ] App Check enabled and enforced on all Cloud Functions.
- [x] Firebase Auth authorized domains include custom domain.
- [ ] Stripe success/cancel URLs point to production URL.
- [x] Cloud Functions `maxInstances` set on every function.
- [ ] End-to-end manual test: create real user, make real $1 purchase, verify balance credits, run scan, verify response.
