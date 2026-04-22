# Autoscaling & Cost Controls

Finclair scales on three independent axes: **Cloud Functions** (compute), **Firestore** (state), **Vertex AI** (inference cost). Each has different knobs and different failure modes.

## TL;DR — recommended config

| Function | minInstances | maxInstances | concurrency | memory | timeout |
|---|---|---|---|---|---|
| `scanReceipt` | 0 | 50 | 40 | 1 GiB | 60 s |
| `getMyQuota` | 0 | 20 | 80 | 256 MiB | 10 s |
| `createCheckoutSession` | 0 | 10 | 40 | 256 MiB | 15 s |
| `redeemPurchase` | 0 | 20 | 40 | 256 MiB | 15 s |
| `stripeWebhook` | 0 | 20 | 40 | 256 MiB | 15 s |

All deployed to `us-central1` (or whichever region hosts your Firestore).

## Cloud Functions v2 — how autoscaling actually works

Functions v2 runs on Cloud Run. Each function is an independent Cloud Run service with its own autoscaler. You're not scaling "Firebase" — you're scaling individual container revisions.

### The three core knobs

- **`minInstances`** — containers kept warm 24/7. You pay for idle capacity.
- **`maxInstances`** — hard cap on parallel containers. Cloud Run rejects with 429 when hit. **This is your cost circuit breaker.**
- **`concurrency`** — in-flight requests per container. Default 80. I/O-bound workloads (Gemini, Stripe calls) handle 40–80 easily; CPU-bound stays at 1.

**Throughput at cap** = `maxInstances × concurrency`. Example: `scanReceipt` @ 50 × 40 = 2000 in-flight requests. Plenty for realistic load, bounded for cost.

### Per-function rationale

#### `scanReceipt`
```ts
export const scanReceipt = onCall(
  {
    minInstances: 0,
    maxInstances: 50,
    concurrency: 40,
    memory: "1GiB",
    cpu: 1,
    timeoutSeconds: 60,
    cpuBoost: true,
  },
  async (request) => { ... },
);
```
- `minInstances: 0` — users already wait 3–8 s for Gemini; 1 s cold start is lost in the noise. Not worth paying for warm capacity.
- `maxInstances: 50` — primary cost circuit breaker. Gemini calls are the expensive part, not the container.
- `memory: 1GiB` — base64 image (up to 10 MB) + response buffer + SDK overhead. 512 MiB is tight; 256 MiB will OOM on large receipts.
- `cpuBoost: true` — speeds cold-start container initialisation.

#### `getMyQuota`
```ts
export const getMyQuota = onCall(
  { minInstances: 0, maxInstances: 20, concurrency: 80, memory: "256MiB" },
  async (request) => { ... },
);
```
Tiny, fast, called often. High concurrency is fine — it's just one Firestore read.

#### `redeemPurchase` / `createCheckoutSession`
```ts
export const redeemPurchase = onCall(
  { minInstances: 0, maxInstances: 20, concurrency: 40, memory: "256MiB", secrets: ["STRIPE_SECRET_KEY"] },
  async (request) => { ... },
);
```
Low traffic (user triggers once per purchase). Keep cap modest.

#### `stripeWebhook`
```ts
export const stripeWebhook = onRequest(
  { minInstances: 0, maxInstances: 20, concurrency: 40, memory: "256MiB", secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] },
  async (req, res) => { ... },
);
```
Stripe webhooks are idempotent on our side, and Stripe retries for 3 days on non-2xx — so occasional 429 from the cap is safe.

### When to set `minInstances: 1`

Only if **p50 user-visible latency is dominated by cold start** AND the function is critical to the UX. For Finclair, only `scanReceipt` could plausibly qualify, but its latency is dominated by Gemini inference — not worth paying for a warm container.

Warm instance pricing (roughly): ~$3–5/month per `minInstances: 1` with default memory, higher with more memory.

## Firestore — already autoscales, watch for hotspots

Firestore has no "scale up" button. Reads/writes scale automatically. You pay per operation, not per capacity. The scaling concerns are:

### Per-document write cap
- **Limit:** ~500 sustained writes/second to a single document.
- **Impact for Finclair:** each user document `users/{uid}` is hit at most once per scan — per-user writes are far below the cap.
- **Watch out for:** global counters. If you ever add `metrics/global` that increments on every scan, you'll hit the cap. Use [distributed counters](https://firebase.google.com/docs/firestore/solutions/counters) (shard across N docs).

### Hot partition rule
Sequential document IDs (timestamps, auto-incrementing) cluster on one partition → write hotspot. Use Firestore auto-IDs (`collection.doc()`) or UUIDs. We currently use `uid` (well-distributed) and Stripe `sessionId` (random-ish) — both fine.

### Index fanout
Every composite index adds write amplification. Don't create indexes you don't query. Currently we have zero composite indexes, which is correct.

### Reads per query
Always cap list queries with `.limit(N)` and `.orderBy()`. Unbounded `collection.get()` can return thousands of docs. Not currently relevant (no list queries) but required going forward.

## Vertex AI — the actual cost driver

Per-scan cost dominates the entire system budget. Firestore and Functions are noise by comparison.

### Gemini pricing shape
- Charged per input token (image + prompt) + per output token.
- Image input tokens scale with resolution — **compress client-side before upload** (see [issues-and-improvements.md](issues-and-improvements.md) #14).
- Output tokens bounded by `generationConfig.maxOutputTokens`. Set this to cap runaway responses.

### Rate limits
Vertex AI enforces per-minute and per-day quotas on Gemini endpoints. Defaults vary by region and model. For a small app:
- **Default quota is usually generous** (hundreds of RPM).
- **Request quota increases** via GCP Console → IAM & Admin → Quotas if needed.

### Cost-cap pattern
```ts
// functions/src/receipt.ts
const model = vertexAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  generationConfig: {
    maxOutputTokens: 1024,   // ~$0.0003 max output cost
    temperature: 0.1,
  },
});
```

Combined with the 10 MB input cap, this bounds worst-case cost per call.

### Client-side image compression (before upload)
Largest cost lever. A 5 MB phone photo resized to 1600 px @ JPEG q=0.85 is usually <400 KB — **~10× cost reduction** with no OCR accuracy loss. See [issues-and-improvements.md](issues-and-improvements.md) #14 for the implementation.

## Cost controls — do all of these

### 1. GCP Billing alerts (most important)
`Billing → Budgets & Alerts → Create budget`. Set $50/month budget with alerts at 50 / 90 / 100%. Add 120% as a hard stop if you want the project to auto-disable on overrun.

### 2. Vertex AI per-day quota cap
`IAM & Admin → Quotas → search "Gemini"`. Cap `Requests per day per region` to a sane number (e.g. 10,000). This is a **hard server-side cap** — users hitting it get 429s but your bill is capped.

### 3. Cloud Functions `maxInstances` on every function
Runtime circuit breaker. Set on deploy, enforced by Cloud Run.

### 4. App Check on all callables
Blocks requests not originating from your app. Prevents bot floods and scraper abuse.
```ts
export const scanReceipt = onCall(
  { enforceAppCheck: true, /* ... */ },
  async (request) => { /* request.app is guaranteed set */ },
);
```
Enable in Firebase Console → App Check → Register app for reCAPTCHA v3 / Enterprise / DeviceCheck / Play Integrity.

### 5. Per-user rate limiter (application layer)
App Check stops non-app traffic but a legit user can still spam `scanReceipt`. Add a sliding-window counter:

```ts
async function checkRateLimit(uid: string, maxPerMinute: number): Promise<void> {
  const ref = db.collection("rateLimits").doc(uid);
  const now = Date.now();
  const windowMs = 60_000;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? { windowStart: 0, count: 0 };
    if (now - data.windowStart > windowMs) {
      tx.set(ref, { windowStart: now, count: 1 });
    } else if (data.count >= maxPerMinute) {
      throw new HttpsError("resource-exhausted", "Rate limit exceeded.");
    } else {
      tx.update(ref, { count: FieldValue.increment(1) });
    }
  });
}
```
Call at the top of `scanReceipt` before consuming a scan.

## Monitoring

### What to watch (Cloud Console)
- **Cloud Functions → Metrics**: p99 latency, invocation count, error rate per function.
- **Firestore → Usage**: reads/writes per day (cost-linear), 1% sustained load.
- **Vertex AI → Metrics**: request count, error rate.
- **Billing → Reports**: grouped by service to spot anomalies.

### Alerts to set up
1. Cloud Functions error rate > 5% for 10 min → page.
2. Vertex AI request count > 80% of daily quota → notify.
3. Billing at 90% of monthly budget → notify.
4. `maxInstances` hit on `scanReceipt` → notify (means you need to raise the cap).

## Scaling down

Cloud Functions scale to zero automatically when idle. Firestore has no capacity to release (pay-per-op). Vertex AI has no minimum commitment. **If the app has no traffic, you pay almost nothing** — a few cents a month for Firestore storage of `users/` docs.

This is the correct default posture for a new product. Don't set `minInstances` until you have evidence of cold-start complaints.

## Cold start reality check

| Function | Typical cold start |
|---|---|
| `getMyQuota` (256 MiB, no SDK imports beyond Firestore) | ~400–800 ms |
| `scanReceipt` (1 GiB, Vertex AI SDK) | ~1–2 s |
| `stripeWebhook` (Stripe SDK) | ~800 ms – 1.5 s |

For `scanReceipt`, cold start adds 15–25% to total latency — user perceives 4–9 s instead of 3–8 s. Not worth paying for warm instances unless users complain.

## If you outgrow Cloud Functions v2

Move to **Cloud Run directly** (Functions v2 is already Cloud Run under the hood). Benefits:
- Arbitrary container images (not limited to Node runtimes).
- Longer max timeout (60 min vs 60 s default for onCall).
- Fine-grained VPC egress, custom networking.
- CPU-always-allocated pricing for background work.

For Finclair specifically, staying on Functions v2 is the right call until you hit a specific limit you can name.
