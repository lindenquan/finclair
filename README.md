# Finclair

Personal financial management — track assets, expenses, income, and every aspect of your finances in one place.

## Tech Stack

- **[SvelteKit](https://kit.svelte.dev/)** — Full-stack framework
- **[Svelte 5](https://svelte.dev/)** — Reactive UI
- **[TypeScript](https://www.typescriptlang.org/)** — Type safety
- **PWA** — Installable, offline-capable progressive web app

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Project Structure

```
src/
├── app.css              # Global styles
├── app.d.ts             # TypeScript declarations
├── app.html             # HTML shell
├── service-worker.ts    # PWA service worker
└── routes/
    ├── +layout.svelte   # Root layout
    ├── +layout.ts       # Layout config (SPA mode)
    └── +page.svelte     # Home page
static/
├── favicon.svg          # App icon
└── manifest.json        # PWA manifest
```

## License

MIT — free and open source.
