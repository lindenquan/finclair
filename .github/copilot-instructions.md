# Finclair — AI Coding Instructions

## General Principles

- **Popular packages first.** Always prefer well-maintained, widely-adopted libraries over custom solutions or obscure alternatives.
- **Less code is better.** Favor concise, readable implementations. Don't add abstractions, helpers, or patterns unless they solve a concrete, immediate problem.
- **No over-engineering.** Only build what's needed right now. Avoid premature optimization, speculative features, and unnecessary layers.
- **Skip the dependency if it's easy to implement.** If a feature can be built with a small, clear implementation, do it in-house instead of adding a package.

## Tech Stack

- **Svelte 5** with runes (`$state`, `$derived`, `$effect`) — no legacy stores API
- **SvelteKit** with static adapter (SPA/PWA)
- **TypeScript** — strict mode, minimal type gymnastics
- **pnpm** — not npm or yarn

## Code Style

- Use Svelte 5 runes for all state management. No external state libraries unless the built-in approach is clearly insufficient.
- Keep components small and focused. One file, one responsibility.
- Colocate styles in `<style>` blocks within Svelte components.
- Use **Tailwind CSS v4** utility classes and **daisyUI** components for styling. No custom CSS files.
- Prefer native browser APIs over library equivalents when practical.

## Commits

- Follow **Conventional Commits**: `type[(scope)]: description`
- **Types**: `feat`, `fix`, `docs`, `chore`, `perf`, `refactor`, `style`, `test`, `ci`
- **Scopes** (optional): `app` (frontend only), `server` (functions only), `app+server` (both), or omit for both
- **Deployable commits** (trigger prod release): `feat`, `fix`, `perf`, breaking changes
- **Non-deployable**: `docs`, `chore`, `style`, `test`, `ci`, `refactor`
- **Always run `pnpm lint:fix` before committing** to ensure code style is consistent
- A local `commit-msg` hook validates format — activate with `git config core.hooksPath scripts`

## CI/CD

- Pipeline runs on push to `main` (no PR workflow)
- Custom commit parsing determines releasability — no third-party release tools
- Releasable types: `feat` (minor), `fix`/`perf` (patch), breaking changes (major)
- Non-releasable: `docs`, `chore`, `style`, `test`, `ci`, `refactor` — build only, no deploy
- Deploy targets based on scope: `(app)` → GitHub Pages, `(server)` → Firebase Functions, no scope or `(app+server)` → both
- Single production environment on GitHub Pages; custom domain to be added later
