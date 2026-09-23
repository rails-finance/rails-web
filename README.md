# Rails

A DeFi self-service support frontend that renders position state and transaction timelines for **Liquity V2** and **Aave V4**.

Visit **[rails.finance](https://rails.finance)** to explore the platform.

## Overview

Rails turns on-chain DeFi activity into clear, comprehensible timelines and position cards. Each protocol gets its own end-to-end view — a listing of all positions, a detail page for any one position, and a transaction timeline grounded in what actually happened on chain.

The frontend is mono-rails: each protocol owns its `/[protocol]/...` URL space. There is no cross-protocol composer in production; visit `/liquity-v2` for Liquity, `/aave-v4` for Aave, and use each protocol's own search bar to filter by wallet.

## Features

### Liquity V2

- Trove explorer: search and view troves by ID, owner address, or ENS name.
- Per-trove timeline: open, adjust, close, redeem, liquidate, batch-delegate — with state-transition cards explaining each event.
- Batch manager integration: track delegated trove management (Summerstone, Bolder, Caramila Capital, …).
- Real-time stats: TVL, collateral distribution, and protocol-wide metrics across WETH, wstETH, and rETH collateral.

### Aave V4

- Spoke explorer: browse positions across Aave V4's spoke architecture (Main, Bluechip, EtherFi, Lido, …) — one shared health factor per spoke, independent between spokes.
- Per-position detail: chain-state balances and HF, per-asset price-runway, liquidation-price headroom, and net APY.
- Transaction timeline: Supply, Borrow, Withdraw, Repay, Liquidation, CollateralToggle, with USD pills priced at the event block (Chainlink-direct + LST exchange-rate derivation).

### Cross-cutting

- ENS name resolution.
- Dark and light themes.
- Per-protocol wallet history (recent + pinned), stored in local storage.
- Server-side bearer-authenticated proxy to the `rails-server-onboarding` API.

## Status

Rails is in beta. Liquity V2 and Aave V4 are stable; both are continuously enhanced. Additional protocols may follow.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
