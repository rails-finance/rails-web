# Rails

The web app behind **[rails.finance](https://rails.finance)**: position explorers for DeFi lending
protocols, with every figure re-derived from the chain and a transaction timeline that says what
happened, event by event.

## What it covers

Twenty-six explorers across Ethereum, Base and Sepolia. On Ethereum: Aave V3, Aave V4, Asymmetry,
Compound V2, Compound V3, Dolomite, Ebisu, Fluid, Frankencoin, f(x), Liquity V1, Liquity V2,
LlamaLend, MakerDAO, Maple, Moonwell, Morpho Blue, PWN and Spark. On Base: Aave V3, Basedollar,
Compound V3, Moonwell, Morpho Blue and Seamless. On Sepolia: Polaris. The roster is
`lib/shared/protocols.ts`; what each explorer can state, and what it cannot yet, is the coverage
matrix at `/coverage`, driven by `lib/shared/coverage.ts`.

Every explorer has a listing, a position page and a timeline. A position page shows chain-state
balances and health beside the indexed history, prices each event at its own block where the
protocol's oracle allows it, and exports the position as Markdown or CSV for pasting into an LLM.
Where a figure cannot be stated from chain, the page says so rather than estimating.

## How it is built

Next.js App Router, TypeScript, Tailwind. Server-side route handlers talk to a bearer-authenticated
indexing backend (`RAILS_API_URL`) and, for live chain state, to an Ethereum and a Base RPC. No key
reaches the browser. `.env.example` documents every variable the app and its scripts read.

```
pnpm install
cp .env.example .env.local   # fill in the runtime keys
pnpm dev
pnpm check                   # routes, locale, OG cards, dead code, types
```

`scripts/verify-*-chain.mjs` re-derive an explorer's figures from the protocol's own contracts and
check them against what the site serves; `scripts/verify/run-all.mjs` runs the page-level
verifiers against a running dev server.

## Status

Rails is in beta. Explorers whose coverage cells are still open say so on `/coverage`.

## License

MIT — see [LICENSE](LICENSE).
