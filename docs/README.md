# Finclair Docs

Reference documentation for Finclair's architecture, workflows, and operations.

## Contents

| Doc | What's in it |
|---|---|
| [architecture.md](architecture.md) | System overview, data model, trust boundaries, request flows |
| [payment-workflow.md](payment-workflow.md) | Stripe checkout + webhook dual-path credit flow |
| [autoscaling.md](autoscaling.md) | Cloud Functions v2 config, Firestore scaling, cost controls |
| [issues-and-improvements.md](issues-and-improvements.md) | Prioritised punch list of bugs, smells, and upgrades |
| [manual-setup.md](manual-setup.md) | One-time tasks that must be done outside the codebase |

## Stack at a glance

- **Frontend**: SvelteKit SPA (static adapter) → deployed to GitHub Pages
- **Auth + DB**: Firebase Auth, Firestore
- **Backend**: Firebase Cloud Functions v2 (Node.js 22)
- **AI**: Google Vertex AI — Gemini (receipt parsing)
- **Payments**: Stripe Checkout (card-only for synchronous confirmation)
- **Testing**: Vitest + Playwright
- **Lint/format**: Biome
