# Architecture

## System overview

```
┌───────────────────────┐        ┌──────────────────────────────┐
│  SvelteKit SPA        │        │  Firebase Cloud Functions v2 │
│  (GitHub Pages)       │────────▶  - scanReceipt (onCall)      │
│                       │        │  - getMyQuota (onCall)       │
│  - Firebase Auth SDK  │◀──auth─┤  - createCheckoutSession     │
│  - Firebase Firestore │        │  - redeemPurchase (onCall)   │
│  - Stripe.js (redirect│        │  - stripeWebhook (onRequest) │
│    to checkout)       │        └──────┬───────────────────────┘
└───────┬───────────────┘               │
        │                               │
        │             Admin SDK ───────▶│
        │                               ▼
        │                        ┌──────────────┐
        │                        │  Firestore   │
        │◀──────reads──auth──────│              │
        │                        └──────────────┘
        │                               │
        │                               ▼
        │                        ┌──────────────┐
        │                        │  Vertex AI   │
        │                        │  (Gemini)    │
        │                        └──────────────┘
        │
        │                        ┌──────────────┐
        └───redirect────────────▶│   Stripe     │
                                 │  Checkout    │
                                 └──────┬───────┘
                                        │ webhook
                                        ▼
                                 stripeWebhook
```

## Trust boundaries

- **Client (SPA)** — untrusted. Any input may be forged. Used only for rendering and collecting user input.
- **Cloud Functions** — trusted. Every callable enforces `request.auth` before doing anything. Admin SDK bypasses Firestore rules.
- **Firestore rules** — second line of defence. Lock clients out of collections that only functions should touch.
- **Stripe / Vertex AI** — trusted external services, authenticated via server-held secrets (`STRIPE_SECRET_KEY`, GCP service account).

## Data model

### `users/{uid}`
Written only by Cloud Functions (via Admin SDK). Clients read own doc for balance display.

```ts
{
  scansUsed: number;       // monotonically increasing counter
  scansPurchased: number;  // total credits purchased (stripe webhooks increment)
}
```

Balance formula: `remaining = max(0, FREE_SCANS + scansPurchased - scansUsed)`.

### `processedSessions/{sessionId}`
Idempotency ledger for Stripe credits. Keyed by Stripe Checkout Session ID.

```ts
{
  uid: string;
  scans: number;
  at: Timestamp;
}
```

Written only inside a Firestore transaction that also updates `users/{uid}`. Existence of this doc means "this session has already credited the user — do not double-credit".

### `rateLimits/{uid}`
Sliding-window rate limit for `scanReceipt` to cap per-user Vertex AI spend.

```ts
{
  windowStart: number; // epoch milliseconds (Date.now())
  count: number;
}
```

## Request flows

### 1. Scan receipt
```
Client                Functions              Firestore         Vertex AI
  │                      │                      │                  │
  │──scanReceipt(img)───▶│                      │                  │
  │                      │──txn consumeScan────▶│                  │
  │                      │◀─ok / exhausted──────│                  │
  │                      │─────parseReceipt─────────────────────▶  │
  │                      │◀────receipt data────────────────────────│
  │◀───{success, data}───│                      │                  │
```

`consumeScan` is a Firestore transaction: read balance → check → increment in one atomic step (see [issues-and-improvements.md](issues-and-improvements.md) #3).

### 2. Read quota
```
Client ──getMyQuota──▶ Functions ──get users/{uid}──▶ Firestore
       ◀──{remaining, total, used}──
```

Client may also read `users/{uid}` directly via Firestore SDK (gated by security rules: only own doc, read-only).

### 3. Purchase flow
See [payment-workflow.md](payment-workflow.md) for the full dual-path diagram. Summary:

1. Client → `createCheckoutSession` → receives Stripe URL
2. User pays on Stripe
3. **Two parallel credit paths** both guarded by `processedSessions/{sessionId}` idempotency:
   - Fast path: client redirect → `redeemPurchase(sessionId)` → verify with Stripe API → credit
   - Safety net: `stripeWebhook` receives `checkout.session.completed` → verify signature → credit

Whichever path wins the race credits; the other is a no-op.

## Frontend layout

```
src/
├── routes/                        # SvelteKit routes
│   ├── +layout.svelte
│   ├── +layout.ts
│   └── +page.svelte
├── lib/
│   ├── firebase.ts                # SDK init + config validation
│   ├── storage.ts                 # IndexedDB key-value storage (cached connection)
│   ├── components/                # Svelte components
│   │   ├── LoginPage.svelte       # Google login + offline mode tabs
│   │   ├── ReceiptApp.svelte      # Receipt scanning UI
│   │   └── NavigationLoader.svelte
│   ├── stores/                    # Svelte 5 runes stores
│   │   └── auth.svelte.ts         # onAuthStateChanged + offline mode
│   └── services/
│       └── receipt.ts             # client-side scanReceipt wrapper + compression
└── service-worker.ts              # PWA cache (allowlist only — see issues doc)
```

## Backend layout

```
functions/src/
├── index.ts                       # HTTPS function exports
├── admin.ts                       # Firebase Admin init (singleton)
├── quota.ts                       # getQuota / consumeScan / addPurchasedScans
├── receipt.ts                     # Vertex AI Gemini integration + JSON parsing
├── stripe.ts                      # (planned) Stripe SDK init + session verification
└── webhook.ts                     # (planned) stripeWebhook handler
```

## Environment variables

### Client (VITE_*, bundled into SPA)
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
VITE_STRIPE_PUBLISHABLE_KEY        # (planned)
```

### Server (Cloud Functions secrets)
```
GCLOUD_PROJECT                     # auto-provided by Firebase runtime
STRIPE_SECRET_KEY                  # (planned) — set via `firebase functions:secrets:set`
STRIPE_WEBHOOK_SECRET              # (planned) — set via `firebase functions:secrets:set`
```

## Key design decisions

1. **Balance may overdraft by one scan.** If a user has $0.002 credit and a scan costs $0.005, the scan completes and balance zeroes. Accepting bounded overage is far simpler than pre-deducting exact cost (which Gemini can't report until after inference). Max loss per call is capped by input image size limit (10 MB) + `maxOutputTokens` on Gemini.
2. **Firestore rules are deny-by-default for writes.** All writes to `users/{uid}` and `processedSessions/{id}` go through Cloud Functions Admin SDK. Clients cannot increment their own balance.
3. **Stripe card-only.** `payment_method_types: ["card"]` on Checkout Sessions. Avoids async methods (SEPA, OXXO, etc.) where `payment_status` is "unpaid" at redirect. Simplifies the client fast-path.
4. **Dual-path credit.** Webhook alone is too slow for UX (can be 5–30s under load). Client-side verify alone breaks if user closes browser before redirect. Both, guarded by idempotency, gives fast + reliable.
5. **GitHub Pages hosting, not Firebase Hosting.** Static adapter + SPA fallback. Firebase is used for Auth, Firestore, and Functions only.
