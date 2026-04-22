# Testing

## Test types

| Type | Command | Scope | Requires | Runs in CI |
|---|---|---|---|---|
| Unit | `pnpm test` | Frontend logic, components | Nothing | Yes |
| Integration | `pnpm test:integration` | Firestore rules, quota, Stripe | Java 21, Firebase Emulator | Yes |

## Unit tests (`pnpm test`)

**Runner:** Vitest

**What they cover:**
- `src/lib/services/receipt.test.ts` — `getQuota` and `scanReceipt` behavior when Firebase is not configured
- `src/lib/components/ReceiptApp.test.ts` — component renders title and offline warning

**How to run:**
```bash
pnpm test          # single run
pnpm test:watch    # watch mode
```

Firebase is fully mocked — no network, no emulators needed.

## Integration tests (`pnpm test:integration`)

**Runner:** Vitest (inside `functions/`)
**Requires:** Java 21, Firebase Emulator (Firestore on port 8080)

**What they cover:**
- `functions/tests/quota.test.ts` — `getQuota` and `consumeScan` against real Firestore emulator
- `functions/tests/rules.test.ts` — Firestore security rules (read/write permissions per collection)
- `functions/tests/stripe.test.ts` — `creditScansOnce` idempotency against real Firestore emulator

**Prerequisites:** Install Java 21 (the Firebase Emulator requires it). Verify with `java -version`.

**How to run:**
```bash
# Option 1: auto-starts emulator, runs tests, shuts down
pnpm test:integration

# Option 2: run emulator separately (useful for repeated runs)
firebase emulators:start --only firestore --project demo-finclair
# In another terminal:
cd functions && pnpm run test:integration
```

The `demo-` project prefix tells the emulator not to connect to any real GCP project.

## CI pipeline

The CI/CD workflow (`.github/workflows/ci-cd.yml`) runs on push to `main`:

1. `pnpm lint` — Biome + svelte-check
2. `pnpm test` — unit tests
3. `pnpm test:integration` — integration tests (Java 21 + Firebase Emulator installed in CI)
4. `pnpm build` — production build
