# Issues & Improvements

Prioritised punch list from the code review. Severity reflects *impact if unaddressed*, not implementation difficulty.

Legend: 🔴 critical (security / money at stake) · 🟠 high (correctness) · 🟡 medium · 🟢 low / polish

---

## 🔴 Critical

### 1. Missing Firestore security rules, and [firebase.json](../firebase.json) doesn't reference Firestore
**File:** [firebase.json](../firebase.json), missing `firestore.rules`
**Impact:** Any authenticated user can read/write any other user's balance document. Default rules in production are either locked (nothing works) or fully open (all users exposed) — undefined behaviour.

**Fix:**
1. Update [firebase.json](../firebase.json):
   ```json
   {
     "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
     "functions": { "source": "functions", "runtime": "nodejs22", "predeploy": ["pnpm --prefix functions run build"] }
   }
   ```
2. Create `firestore.rules`:
   ```rules
   rules_version = '2';
   service cloud.firestore {
     match /databases/{db}/documents {
       match /users/{uid} {
         allow read: if request.auth != null && request.auth.uid == uid;
         allow write: if false;
       }
       match /processedSessions/{id} {
         allow read, write: if false;
       }
       match /rateLimits/{uid} {
         allow read, write: if false;
       }
     }
   }
   ```
3. Create `firestore.indexes.json` with `{"indexes": [], "fieldOverrides": []}`.
4. Deploy: `firebase deploy --only firestore:rules`.

---

### 2. `redeemPurchase` trusts client-provided purchase token
**File:** [functions/src/index.ts:50-68](../functions/src/index.ts#L50-L68)
**Impact:** Any authenticated user can mint themselves unlimited scans by sending an arbitrary string as `purchaseToken`. Burns Vertex AI budget with zero revenue.

**Fix:** Replace the entire function with Stripe session verification — see [payment-workflow.md](payment-workflow.md) sections 2 and 3. Key checks:
1. `session.payment_status === "paid"`
2. `session.metadata.uid === request.auth.uid`
3. Idempotency via Firestore transaction on `processedSessions/{sessionId}`

Add the `stripeWebhook` onRequest function as the safety net.

---

### 3. Race condition in [functions/src/quota.ts:28-39](../functions/src/quota.ts#L28-L39)
**Impact:** Concurrent `scanReceipt` calls from the same user can overspend quota. Bounded by concurrency × per-scan cost (~pennies) but trivially scripted.

**Fix:** Wrap in a transaction:
```ts
export async function consumeScan(uid: string): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const ref = db.collection("users").doc(uid);
    const snap = await tx.get(ref);

    if (!snap.exists) {
      tx.set(ref, { scansUsed: 1, scansPurchased: 0 });
      return true;
    }

    const data = snap.data() ?? {};
    const used = typeof data.scansUsed === "number" ? data.scansUsed : 0;
    const purchased = typeof data.scansPurchased === "number" ? data.scansPurchased : 0;
    if (used >= FREE_SCANS + purchased) return false;

    tx.update(ref, { scansUsed: FieldValue.increment(1) });
    return true;
  });
}
```

---

### 4. `.env` committed to git
**File:** [.env](../.env)
**Impact:** Firebase config is in repo history. Web API keys aren't strictly secret but are rate-limited to your project — an attacker can exhaust your auth quotas.

**Fix (manual — see [manual-setup.md](manual-setup.md)):**
1. Check git history: `git log --all -- .env`
2. If present in any commit, rotate the Firebase API key in Firebase Console.
3. Purge from history with BFG or `git filter-repo`.
4. Confirm `.env` is in `.gitignore` (it is).

---

## 🟠 High

### 5. Silent `catch {}` hides all errors in [functions/src/index.ts:35-40](../functions/src/index.ts#L35-L40)
```ts
} catch {
  throw new HttpsError("internal", "Failed to parse receipt.");
}
```
Loses stack traces. Cannot distinguish Gemini down vs malformed response vs out-of-memory.

**Fix:**
```ts
} catch (err) {
  console.error("scanReceipt failed", { uid: request.auth.uid, err });
  throw new HttpsError("internal", "Failed to parse receipt.");
}
```

---

### 6. `JSON.parse` on Gemini output without error handling in [functions/src/receipt.ts:42-44](../functions/src/receipt.ts#L42-L44)
Gemini can return non-JSON or include extra text around the code fence. Current code crashes the whole function with 500.

**Fix:** Wrap parse in try/catch, validate the parsed object shape before returning, and log the raw response on failure:
```ts
const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
if (!text) throw new Error("Gemini returned empty response");

const cleaned = text.replaceAll(/```json\n?|\n?```/g, "").trim();

let parsed: unknown;
try {
  parsed = JSON.parse(cleaned);
} catch (err) {
  console.error("Gemini JSON parse failed", { cleaned });
  throw new Error(`Invalid JSON from Gemini: ${String(err)}`);
}

if (!isReceiptData(parsed)) {
  throw new Error(`Gemini response did not match schema: ${cleaned.slice(0, 200)}`);
}
return parsed;
```

Define `isReceiptData` as a type guard checking required fields.

---

### 7. `onAuthStateChanged` listener never unsubscribed in [src/lib/stores/auth.svelte.ts:33-41](../src/lib/stores/auth.svelte.ts#L33-L41)
**Impact:** Minor memory leak under HMR and Vitest reruns; accumulates listeners.

**Fix:** Capture the unsubscribe callback:
```ts
let unsubscribe: (() => void) | null = null;

export function initAuth() {
  if (!auth || unsubscribe) return;
  unsubscribe = onAuthStateChanged(auth, (fbUser) => {
    user = fbUser ? mapUser(fbUser) : null;
    loading = false;
    ready = true;
  });
}

export function destroyAuth() {
  unsubscribe?.();
  unsubscribe = null;
}
```
Call `initAuth()` from root layout's `onMount`; `destroyAuth()` is optional for an SPA.

---

### 8. No rate limiting on `scanReceipt`
**Impact:** Legit authenticated user (or one compromised account) can spam `scanReceipt` and burn Vertex AI budget inside your per-user balance.

**Fix:** Add per-UID sliding-window rate limit (see [autoscaling.md](autoscaling.md) § Per-user rate limiter). Suggest 10 req/min per UID.

Complementary: enable App Check (`enforceAppCheck: true`) to block non-app traffic entirely.

---

### 9. No cost cap on Gemini output tokens
**File:** [functions/src/receipt.ts](../functions/src/receipt.ts)
**Impact:** A prompt injection or model regression could cause multi-KB output. Paired with the "let last call overdraft" policy, worst-case loss per call is unbounded.

**Fix:** Add `generationConfig` to the model:
```ts
const model = vertexAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  generationConfig: { maxOutputTokens: 1024, temperature: 0.1 },
});
```

---

## 🟡 Medium

### 10. Firestore data shape not validated in [functions/src/quota.ts:21](../functions/src/quota.ts#L21)
```ts
const data = snap.data() as Record<string, number>;
```
Silently coerces corrupt data. Use `typeof` guards:
```ts
const data = snap.data() ?? {};
const used = typeof data.scansUsed === "number" ? data.scansUsed : 0;
const purchased = typeof data.scansPurchased === "number" ? data.scansPurchased : 0;
```

---

### 11. Vertex AI init doesn't fail fast on missing project ID
**File:** [functions/src/receipt.ts:3-6](../functions/src/receipt.ts#L3-L6)
Currently defaults to `""`, first invocation crashes cryptically.

**Fix:**
```ts
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
if (!PROJECT_ID) throw new Error("GCLOUD_PROJECT or GCP_PROJECT must be set");
```

---

### 12. Service worker unbounded cache in [src/service-worker.ts](../src/service-worker.ts)
Caches every 200 response indefinitely. IndexedDB quota fills up; user's cache grows without bound.

**Fix:**
- Only cache build assets (already in `ASSETS` array), not arbitrary fetches.
- Or add a path allowlist + LRU eviction (e.g. Workbox recipes).
- Never cache `POST` or Firebase function callable responses.

---

### 13. Empty string base64 passes validation
**File:** [functions/src/index.ts:17-25](../functions/src/index.ts#L17-L25)
Empty string is falsy so caught by `!image`. A single space or invalid base64 passes.

**Fix:** Validate with a strict regex and trial decode:
```ts
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
  throw new HttpsError("invalid-argument", "Invalid base64 image.");
}
```

---

### 14. No client-side image compression
**File:** [src/lib/services/receipt.ts](../src/lib/services/receipt.ts)
**Impact:** Phone photos are 3–8 MB. Base64 inflates 33%. Gemini cost scales with input image tokens. 10× cost reduction possible.

**Fix:** Compress to max 1600 px @ JPEG q=0.85 before upload:
```ts
async function compressImage(file: File, maxDim = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(bmp.width * scale, bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}
```
Use `createImageBitmap` + `OffscreenCanvas` — no DOM needed, works in workers if you move compression off the main thread.

---

### 15. Biome linter disables dead-code detection on Svelte files
**File:** [biome.json](../biome.json)
`noUnusedImports: off`, `noUnusedVariables: off` for `**/*.svelte` means unused code piles up invisibly.

**Fix:** Remove those overrides. Biome's Svelte support now handles these correctly in runes mode.

---

### 16. `svelte-check` not in build pipeline
**File:** [package.json](../package.json)
Type errors in Svelte components fail `pnpm lint` but not `pnpm build`. CI can ship broken types.

**Fix:**
```json
"build": "svelte-check --tsconfig ./tsconfig.json && vite build",
```

---

## 🟢 Low / polish

### 18. Unused `as string` casts in [src/lib/firebase.ts](../src/lib/firebase.ts)
Replace with a validated config builder — one place, all keys checked at startup.

### 19. No E2E coverage beyond login visibility
**File:** [e2e/todo.spec.ts](../e2e/todo.spec.ts)
Add a scan-receipt happy path (with mocked Vertex response) and a purchase flow smoke test.

### 20. `TodoApp.svelte` / todos store looks legacy
If Finclair's scope is receipts, delete the leftover todo code. Less surface, less maintenance.

### 21. No CI/CD pipeline
Consider adding `.github/workflows/ci.yml` to run `pnpm lint && pnpm test && pnpm build` on every push.

### 22. No refund handling
Stripe `charge.refunded` / `charge.dispute.created` events are not handled. If a user refunds, they keep the scans. Add a handler to deduct balance on refund (subtract from `scansPurchased`, clamp at 0).

### 23. No `firestore.indexes.json` skeleton
Even empty, the file serves as documentation. Without it, first composite query fails at runtime with a console-printable URL that creates the index.

### 24. Static adapter: `precompress: false`, `strict: false` in [svelte.config.js](../svelte.config.js)
Low impact on a GitHub Pages deploy, but enabling both is free: gzip/brotli assets and route validation at build.

---

## Suggested implementation order

| Sprint | Items |
|---|---|
| Day 1 (security) | #4 rotate key, #1 Firestore rules, #2 Stripe verify, #3 transaction |
| Week 1 (correctness) | #5 error logging, #6 JSON parse, #7 auth unsubscribe, #9 output cap |
| Week 2 (cost defence) | #8 rate limit, #14 image compression, autoscale configs |
| Week 3 (polish) | #10–13, #15–17 lint/test tightening |
| Backlog | #18–24 |

---

## What I can vs can't fix in code

**In code (anyone can do from this repo):**
1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24.

**Only you can do (manual, external systems):**
See [manual-setup.md](manual-setup.md). Includes #4 (API key rotation), budget setup, Stripe dashboard config, App Check enrolment, webhook URL registration, secret storage, quota cap settings.
