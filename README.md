# Finclair

Personal financial management — track assets, expenses, income, and every aspect of your finances in one place.

## Tech Stack

- **[SvelteKit](https://kit.svelte.dev/)** — Full-stack framework (static adapter, SPA/PWA)
- **[Svelte 5](https://svelte.dev/)** — Reactive UI with runes
- **[TypeScript](https://www.typescriptlang.org/)** — Strict mode
- **[Tailwind CSS v4](https://tailwindcss.com/)** + **[daisyUI](https://daisyui.com/)** — Styling
- **[Firebase](https://firebase.google.com/)** — Auth, Firestore, Cloud Functions, Analytics
- **PWA** — Installable progressive web app

## Architecture Decisions

### Per-page code splitting (lazy loading)

Each page loads its own JS bundle independently — there is no single large JS file. SvelteKit handles this automatically per route. A slim **top progress bar** appears during navigation when a new page chunk is loading.

**Trade-off:** If a user opens only one page and goes offline, other pages won't be available since their JS hasn't been fetched yet. This is intentional — we prioritize fast initial load over full offline availability.

### Authentication

Google OAuth via Firebase Auth using `signInWithPopup`. Login is a client-side gate — unauthenticated users see a sign-in page, authenticated users see the app. The popup approach works with GitHub Pages hosting (redirect-based auth requires Firebase Hosting).

### Google Drive integration

The app requests the `drive.file` scope during login, which grants access **only** to files/folders the app creates — not the user's entire Drive. The OAuth access token is captured from the popup result and stored in the auth store.

## Firebase & Google Cloud Services

| Service | Purpose |
|---|---|
| **Authentication** | Google sign-in via OAuth |
| **Cloud Firestore** | Database for todos, user data, quota tracking |
| **Cloud Functions** | Backend logic (receipt processing, quota management, Stripe webhooks) |
| **Analytics** | User distribution, page views, session tracking |
| **Google Drive API** | Store/sync user financial data to their Drive |

### Payments — Stripe

Users purchase AI quota via **Stripe Checkout** (hosted payment page). The flow:

1. User clicks "Buy quota" → app calls a Cloud Function
2. Cloud Function creates a Stripe Checkout session → returns URL
3. User completes payment on Stripe's hosted page
4. Stripe sends a webhook → Cloud Function verifies and credits quota in Firestore

Why Stripe over Google Play Billing:
- Works on **any device/browser** (PWA, not a native app)
- ~3% fee vs 15-30% Play Store cut
- No app store review process
- Hosted checkout — no PCI compliance burden

## CI/CD

- Push to `main` triggers the pipeline (no PR workflow)
- **Commit scopes** control deploy targets:
  - `feat(app):` → GitHub Pages only
  - `feat(server):` → Firebase Functions only
  - `feat:` or `feat(app+server):` → both
- Releasable types: `feat` (minor), `fix`/`perf` (patch), breaking changes (major)
- Non-releasable: `docs`, `chore`, `style`, `test`, `ci`, `refactor`
- A local `commit-msg` git hook validates commit format

## Getting Started

```bash
# Install dependencies (also activates git hooks)
pnpm install

# Copy env file and fill in Firebase config
cp .env.example .env

# Start development server (port 3000)
pnpm dev

# Build for production
pnpm build

# Preview production build (port 5000)
pnpm preview
```

## Project Structure

```
src/
├── app.css              # Global styles
├── app.html             # HTML shell
├── service-worker.ts    # PWA service worker
├── lib/
│   ├── firebase.ts      # Firebase initialization
│   ├── components/      # Svelte components
│   ├── services/        # Business logic
│   └── stores/          # Svelte 5 rune stores
└── routes/
    ├── +layout.svelte   # Root layout (auth gate, navbar)
    ├── +layout.ts       # Layout config (SPA mode)
    └── +page.svelte     # Home page
functions/
└── src/                 # Firebase Cloud Functions
scripts/
├── commit-msg           # Commit message validator
└── pre-commit           # Lint check before commit
```

## License

MIT — free and open source.
