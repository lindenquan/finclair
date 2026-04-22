# Code Review Skill

## When this skill applies
Use when asked to: review code, do a code review, audit changes, check code quality, look for bugs/issues.

## Procedure — follow in exact order

**Stop immediately and report if any step fails. Never continue past a failure.**

---

### Step 1 — Lint

Run `pnpm lint`. Do **not** run `pnpm lint:fix`.

- Errors → stop, report them, end the review.
- Warnings only → note them and continue.

---

### Step 2 — Build

Run `pnpm build`.

- Failure → stop, report errors, end the review.

---

### Step 3 — Tests

Run each script in order, stopping immediately on failure:

1. `pnpm test`
2. `pnpm test:integration`
---

### Step 4 — Review the diff

Run `git diff HEAD` (or `git diff main..HEAD` for a branch). Review the diff output only — do not read every file in the repo.

Look for:

| Severity | What to flag |
|---|---|
| 🔴 Critical | Security issues: hardcoded secrets, missing auth checks, injection vulnerabilities, insecure defaults, unvalidated external input |
| 🟠 High | Bugs: race conditions, null dereference, off-by-one, incorrect logic, uncaught errors |
| 🟡 Medium | Improvements: missing error handling, performance, unnecessary complexity |
| 🟢 Low | Polish: naming, minor style, dead code |
| ⚠️ Warning | **Large file** — any single file over 300 lines added or modified in the diff |
| 🚨 Major error | **Duplicate code** — the same logic appearing in more than one place; always flag, always suggest consolidation |

---

### Step 5 — Check code matches docs

Read the relevant files in `docs/` (architecture.md, payment-workflow.md, autoscaling.md). Flag any behaviour in the diff that contradicts or is missing from the documented design.

---

## Output format

```
## Lint      ✅ / ❌
## Build     ✅ / ❌
## Tests     ✅ / ❌ / ⏭️ skipped

## Findings
🔴 ...
🟠 ...
🟡 ...
🟢 ...

## Verdict: PASS / FAIL
```

If there are no findings in a severity tier, omit it. Keep each finding to 1–2 sentences with a file + line reference where possible.
