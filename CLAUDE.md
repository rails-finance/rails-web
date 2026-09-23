# CLAUDE.md — rails-web-onboarding

Guidance for Claude Code working in **this repo's code**. All prose — the charter,
architecture, design grammar, per-protocol/pipeline reference — lives in
**`rails-ops`**. This file
is just commands, conventions, and how the code is laid out.

## Read this first (all in rails-ops)

- **`rails-ops/architecture/onboarding-charter.md`** — the charter: the objective,
  the architecture decisions, and the Status checklist of what's done and next.
- **`rails-ops/architecture/data-source-architecture.md`** — the two data-source
  architectures and per-protocol fit.
- **`rails-ops/architecture/chain-truth-charter.md`** — which values may render.

This repo is the onboarding tier; do **not** push to the production repos.

## What this repo is

The **protocol onboarding framework**: bring new DeFi protocols up to the depth of
the reference protocols **Liquity V2** and **Aave V4** (timeline cards, position
view, economics, provenance receipts tracing every number). The *why/what-next* is
the charter above; the *how the code is laid out* is below.

There are **no directory tiers** (rails-ops decision `0012`): one uniform roster of
protocol explorers (`lib/shared/protocols.ts`), and the depth matrix in
`lib/shared/coverage.ts` (rendered per chain at /coverage/{ethereum,base,sepolia} —
there is no bare /coverage; its structural `COVERAGE_NOTES` also
open each listing's intro drawer) is the one statement of how deep each explorer
currently goes. Cells distinguish `false` ("not yet") from `{ why }` ("the protocol
can't provide it"). When an explorer gains a capability, flip its matrix cell in the
same change.

## Commands

- `npm run dev` / `pnpm dev` — dev server (Next.js 15.5, App Router, React 19, TS,
  Tailwind v4). **One per checkout, ever** — two share one `.next` and corrupt it.
  Check `pgrep -fl 'next dev'` before starting another; a second server on a free
  port is not harmlessly separate.
- `npx tsc --noEmit` — typecheck (the correctness gate; run before committing).
  `pnpm check` runs it after the static checks (`check:prov`, `check:receipts`,
  `check:routes`, `check:locale`, `check:dead` and the rest).
- `pnpm format` — Prettier. No test framework configured.
- `npm run verify:preflight` — **run this before any browser verifier.** A serving
  port is not a working server: a corrupted `.next` answers every route with a 500
  whose stack trace points into a real module, and the suite behind it then reports
  a table of failures that are not findings. The gate names that state and prints
  the fix. Pass the fixture routes too — `npm run verify:preflight -- --warm /a,/b`
  — because dev compiles on demand and a verifier's post-hydration waits are
  measured against a warm route; the first open of a cold one is how a green change
  fails eight checks. `run-all.mjs` calls the gate itself and refuses to run.
- `ONLY=timeline,market-note node scripts/verify/run-all.mjs` — the verifiers whose
  names match, against one server, **one at a time**. Run the ones the change
  touches, not the suite. `JOBS=2` (or more) opens the pool — reach for it on a
  machine with room or a selection of light scripts, and stop if a run's failures
  start moving around, because the fan-out shares one dev server and one Alchemy
  key. A few scripts are quarantined from the pool whatever `JOBS` says
  (`RUN_ALONE` in `run-all.mjs`); each entry records the measurement that put it
  there, and `MEASURE=1` empties the map so that claim can be re-tested — it is
  not a speed knob, it hands back the flaky configuration. `FIXTURES=` passes a
  fixture filter through to a verifier that has one (`ONLY` is the runner's own
  selector and stops there).
  A run that reaches a verdict over zero checks is reported as a CRASH, not a pass.

## Data sources — the code seams

The serving source is the **live indexed backend** (`/api/<proto>/…` →
`RAILS_API_URL`): history + reduced state for every protocol, read through the
`lib/api/fetch-*.ts` clients. The old `api ↔ chain` source *toggle* is retired
(rails-ops decision `0006`) — there is no user-facing second source.

On top of it, **per-position live chain-state overlays** (`app/api/chain/<proto>/…` →
`lib/sources/chain/*-position.ts`, viem/Multicall3) read the protocol's contracts at
head for the position dashboard, risk strips, protocol-oracle USD, and receipt
figures. These are primary truth rendered on the page (the `0006` carve-out), not a
swappable data source: detail pages fetch both and merge.

The working model, the retired frozen-`T` scaffolding, the indexed backbone, and the
Aave chain-state refresher are described in
`rails-ops/architecture/{onboarding-charter,data-source-architecture}.md`.

**Server-only / env** (never import into client components; keys must not reach the
browser bundle):
- `ALCHEMY_URL` — chain-overlay live `eth_call` state.
- `RAILS_API_URL` / `API_BEARER_TOKEN` — the live indexed backend.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_FEEDBACK_CHAT_ID` — the footer feedback
  route (`app/api/feedback/route.ts` → private team chat).
- `ETHERSCAN_API_KEY` is read by scripts only (the Frankencoin verifier, the vault
  census), never at runtime. The full key list, grouped, is `.env.example`.

`lib/sources/chain/rpc.ts` is SERVER-ONLY — imported only from `/api/*` route handlers.

## Conventions

- Provenance: `components/shared/provenance.tsx` (the `<Prov>` grammar) + the
  page-level inspector (`components/shared/prov-inspector.tsx`), the only receipt
  surface (`rails-ops/standards/provenance-receipts-grammar.md` §1);
  `ProvenanceInfoTabs` now carries a card's Explanation pane, not receipts.
  Per-protocol vocabularies in `lib/<proto>/*-provenance.ts` + `event-provenance.ts`.
  Helpers are source-aware (default `source` to `"api"`).
- Event cards: `components/protocol/<proto>/` (header / detail / explainer); shared
  shell in `components/shared/event-card.tsx`; `SpineColumn` for the timeline column.
- Per-protocol loaders/services under `lib/<proto>/`; cross-protocol types in
  `lib/shared/`.
- `@/` path alias → project root.
- Every locale-sensitive format call names its locale: `"en-US"` for numbers,
  `"en-GB"` for dates (`lib/date.ts` is the reference). A bare
  `toLocaleString()` formats in the runtime's locale — one thing on the server,
  another in the browser — which is a hydration mismatch on every SSR'd page.
  `npm run check:locale` fails on an unpinned call.
- viem targets ES2017 (no BigInt literals — use `BigInt()`); multi-return calls
  decode to positional arrays, structs to objects.
- Run `npx tsc --noEmit` and `pnpm format` before committing. `main` tracks `origin`
  (`github.com/rails-finance/rails-web-onboarding`; the old `web-mig` URL still
  redirects) — commit on `main` and `git push`.

## Finishing a change

**A change is finished when it typechecks, its verifiers have RUN, and it is
committed — in the same session that wrote it.** A tree of green, unverified,
uncommitted work costs a whole second session to pick up: the next reader has to
re-derive what it was for before they can finish it. If you must stop mid-change,
commit what stands and say in the message what is unfinished.

**Write the prose once.** The argument for a change belongs in its `rails-ops`
decision, and nowhere else. A code header states the RULE and points at the
decision; it does not restate the reasoning, and neither does the commit message.
Correct a `rails-ops` doc when it would now mislead a reader who acts on it
(the charter, an architecture reference, a live grammar); leave dated build logs
and session records alone — they were true when written.

**One grep closes the loop.** When a change retires something a doc can name — a
param, a control, a flag, a prop — grep `rails-ops` for that
token in the same change. That is the whole documentation pass; it takes seconds
and it is what stops four passages quietly describing a control nobody can reach.
