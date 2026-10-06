# Liquity V2 event templates

Generated from `lib/liquity/event-templates.ts` by `pnpm exports:liquity-v2`; do not edit by hand.
Send changes as edits to this file: each string keeps its id, and a placeholder keeps its `{name}`.
`{name|rounding}` prints a placeholder at another rounding for that sentence alone.
Prices are at the event unless a sentence names "today".

## Roundings

| Rounding | Prints |
|---|---|
| coll | collateral at the decimals the card's ledger prints (772.334); four places where the page has no ledger |
| coll_trim | the same, trailing zeros dropped (125, 0.497) |
| debt | whole units from 1,000 up (1,056,120), up to two places below (843.5) |
| accrued | two places, grouped (2.20) |
| accrued_signed | two places with a + or − sign (+258.54) |
| amount | whole units from 1,000 up, four places from 1, more below 1 so the figure never reads 0 |
| usd | whole dollars ($4,490); under $0.01 reads < $0.01 |
| usd_about | from $10,000: 'about' and the nearest thousand (about $561,000); below, whole dollars ($2,222) |
| usd_cents | dollars and cents ($2,221.83); under $0.01 reads < $0.01 |
| ratio | two places (328.34%) |
| ratio_whole | whole percent (328%); two places where before and after would read alike |
| ratio_pair | the collateral ratio and its LTV at two places (328.34% (LTV 30.46%)); the viewer's ratio setting bolds one |
| rate | an annual rate at the protocol's two places (1.71%) |
| rate_step | a rate change at two places, widened until before and after read apart (4.12% → 4.115%) |
| pct_whole | whole percent of a fraction (0.665 → 66%), unsigned |
| pct3 | three places (0.512%) |
| count | a whole number, grouped (23,267,256) |
| compact | the header's compact form (125, 2.2K, 1.1M, 0.4974) |
| date | a UTC day (1 Sep 2025) |
| day_short | a short UTC day (Sep 1; with the year when not this year) |
| span | hours under a day (5 hours), else days at one place (3.2 days) |
| manager | the batch manager's name and short address (ARM (0xe507…b60a)), linked to the explorer |
| address | a short address (0xf060…45f8), linked to the explorer |
| text | a word or name as given |

## Placeholders

| Placeholder | Rounding | Stands for |
|---|---|---|
| `{coll_symbol}` | text | the branch's collateral token (WETH, wstETH, rETH) |
| `{debt_symbol}` | text | the debt token (BOLD) |
| `{label}` | text | the header's event label |
| `{coll_change}` | compact | the collateral the event moved, as the header prints it |
| `{debt_change}` | compact | the debt the event moved, as the header prints it |
| `{coll_label}` | text | Add or Withdraw, on a row that moved both sides |
| `{debt_label}` | text | Borrow or Repay, on a row that moved both sides |
| `{redist_l1}` | text | a redistribution the touch applied, as the header prints it |
| `{surplus_l1}` | text | a liquidation's claimable surplus, as the header prints it |
| `{debt_move_abs}` | compact | the debt's move on a batch rate change, as the header prints it |
| `{mcr}` | pct_whole | the branch's minimum collateral ratio (110% for WETH) |
| `{min_debt}` | count | Liquity V2's minimum debt (2,000 BOLD) |
| `{price_at_event}` | usd | the collateral's oracle price at the event's block |
| `{price_prev}` | usd | the collateral's oracle price at the trove's previous event |
| `{price_change}` | pct_whole | the price's move since the previous event, as a fraction |
| `{price_today}` | usd | the collateral's oracle price today (redemption only) |
| `{cr_before}` | ratio_pair | collateral ratio before the event, percent |
| `{cr_before_same_price}` | ratio_whole | collateral ratio before the event at this event's price, percent |
| `{cr_after}` | ratio_whole | collateral ratio after the event, percent |
| `{cr_at_liquidation}` | ratio_pair | collateral ratio at the liquidation's price, percent |
| `{liq_price_before}` | usd | the price at which the trove would reach the minimum, before |
| `{liq_price_after}` | usd | the price at which the trove would reach the minimum, after |
| `{liq_distance_before}` | pct_whole | how far the price would have to fall to liquidation, before |
| `{liq_distance_after}` | pct_whole | how far the price would have to fall to liquidation, after |
| `{added}` | coll_trim | collateral the owner added |
| `{added_usd}` | usd_about | that collateral at the event's price |
| `{withdrawn}` | coll_trim | collateral the owner withdrew |
| `{withdrawn_usd}` | usd_about | that collateral at the event's price |
| `{borrowed}` | debt | debt the owner borrowed |
| `{repaid}` | debt | debt the owner repaid |
| `{upfront_fee}` | debt | the upfront fee added to the debt |
| `{accrued_total}` | accrued | interest and any management fee accrued since the previous event |
| `{accrued_fee}` | accrued | the management fee part of it |
| `{debt_before}` | debt | the trove's debt before the event |
| `{debt_after}` | debt | the trove's debt after the event |
| `{coll_after}` | coll | the trove's collateral after the event |
| `{coll_after_usd}` | usd | that collateral at the event's price |
| `{rate_before}` | rate | the annual interest rate before the event |
| `{rate_after}` | rate | the annual interest rate after the event |
| `{rate_setter}` | text | the batch manager's name, where a batch manager sets the rate |
| `{manager}` | manager | the batch manager |
| `{former_manager}` | address | the batch manager the trove left |
| `{manager_address}` | address | the batch manager |
| `{batch_rate}` | rate | the batch's rate on joining |
| `{batch_fee_rate}` | rate | the batch's annual management fee on joining |
| `{redist_debt}` | debt | debt a liquidated trove's redistribution passed to this one |
| `{redist_coll}` | coll | collateral a liquidated trove's redistribution passed to this one |
| `{redist_coll_usd}` | usd_cents | that collateral at the event's price |
| `{debt_terms}` | text | the debt's move, term by term (FRAGMENTS) |
| `{net_benefit}` | usd_cents | redistributed collateral at the price less the debt inherited, unsigned |
| `{debt_cleared}` | debt | debt the event cleared |
| `{coll_taken}` | coll_trim | collateral a redemption took |
| `{coll_taken_usd}` | usd | that collateral at the redemption's price |
| `{redemption_result_usd}` | usd | debt cleared less the collateral taken at the redemption's price: the fee the trove kept |
| `{redemption_vs_today_usd}` | usd | debt cleared less the collateral taken at today's price, unsigned |
| `{coll_liquidated}` | coll | collateral the liquidation took |
| `{coll_liquidated_usd}` | usd | that collateral at the liquidation's price |
| `{coll_surplus}` | coll | collateral left to the borrower above the debt and penalty |
| `{coll_surplus_usd}` | usd_cents | that surplus at the liquidation's price |
| `{claimed_at}` | date | when the borrower claimed the surplus |
| `{est_loss}` | usd_cents | the borrower's estimated loss after the surplus |
| `{coll_to_sp}` | coll | collateral sent to the Stability Pool |
| `{coll_to_sp_usd}` | usd_cents | that collateral at the liquidation's price |
| `{coll_gas_comp}` | coll | collateral paid to the liquidator as gas compensation |
| `{incentive_coll}` | coll | the 5% liquidation incentive, in collateral |
| `{incentive_usd}` | usd_cents | that incentive in dollars |
| `{principal}` | debt | debt borrowed on open, before the upfront fee |
| `{debt_repaid}` | debt | debt a close repaid |
| `{coll_retrieved}` | coll | collateral a close returned |
| `{dust}` | amount | the debt a no-change adjustment repaid |
| `{run_count}` | count | how many no-change adjustments the row stands for |
| `{run_first}` | day_short | the first of them |
| `{run_last}` | day_short | the last of them |
| `{debt_move}` | accrued_signed | the debt's move since the trove's previous event |
| `{prev_date}` | date | the trove's previous event |
| `{move_interest}` | accrued | interest over that span |
| `{move_rate}` | rate | the rate in force over that span |
| `{move_span}` | span | the time since the previous event |
| `{move_fee}` | accrued | management fee over that span |
| `{move_fee_rate}` | rate | the batch's management fee in force over that span |
| `{move_upfront}` | accrued | the upfront fee: the rest of the move |
| `{block}` | count | the event's block |
| `{block_events}` | count | how many of this trove's events the block holds |
| `{block_position}` | text | this event's place among them (1 of 2) |
| `{from_address}` | address | the NFT's previous holder |
| `{to_address}` | address | the NFT's new holder |
| `{operation}` | text | the contract operation's name |

## Header words (L1)

Each template's L1 line joins its groups with " · "; a group whose figure the event lacks is left out.

| Id | Word |
|---|---|
| open | Open |
| close | Close |
| liquidated | Liquidated |
| liquidation | Liquidation |
| add | Add |
| withdraw | Withdraw |
| borrow | Borrow |
| repay | Repay |
| adjust | Adjust |
| no_change | No change |
| no_change_run | No change ×{run_count} |
| rate_up | Increase interest rate |
| rate_down | Decrease interest rate |
| rate_change | Rate change |
| apply_debt | Apply debt |
| redemption | Redemption |
| redeemed | Redeemed |
| delegate | Delegate |
| leave_delegate | Leave delegate |
| transfer | Transfer |
| batch_rate | Interest rate |
| supply | Supply |
| cleared | Cleared |
| took | Took |
| debt | Debt |
| from_liquidation | From a liquidation |
| and | and |
| claimable | claimable |
| claimed | claimable, claimed |
| zombie | Zombie |

## Opened-card words (L2)

| Id | Words |
|---|---|
| collateral | Collateral |
| debt | Debt |
| interest_rate | Interest Rate |
| price | {coll_symbol} price |
| incl | incl. +{accrued_total} {accrual_noun} |
| interest | interest |
| interest_and_fees | interest and fees |
| fee | {upfront_fee} fee |
| yearly_interest | {yearly_interest} {debt_symbol} / year interest |
| excl_fee | , excl. management fee |
| yearly_fee | + {batch_fee_rate} management fee · {yearly_fee} {debt_symbol} / year |
| closed | CLOSED |
| not_applicable | N/A |
| redeemed_by | Redeemed by: |
| pl | P/L |
| or | or |
| today | today |
| claimable | claimable |

## Copy for LLM header and footer

| Id | Words |
|---|---|
| context.title | # Liquity V2 · {title} · {utc} UTC |
| context.position | Liquity V2 · {chain} · {coll_symbol} trove {trove} · owner {owner} |
| context.event | Event #{n} of {total} · tx {tx} · {url} |
| context.prices | Prices are {coll_symbol} oracle prices at the time of the event unless marked "today". Not financial advice. |
| footer.gas | Gas {gas} |
| footer.gas_run | Gas across {run_count} transactions {gas} |
| footer.tx | tx {tx} |
| footer.block | block {block} |

## Fragments

| Id | Words |
|---|---|
| debt_term.repaid | − {x} repaid |
| debt_term.borrowed | + {x} borrowed |
| debt_term.fee | + {x} fee |
| debt_term.redist | + {x} from the liquidation |
| debt_term.interest | + {x} interest |
| debt_term.interest_and_fees | + {x} interest and fees |

## Shared sentences

- **market.fell** (when the price fell since the trove's previous event by at least a quarter of the room the trove had above the minimum): {coll_symbol} had fallen {price_change} since the previous event, from {price_prev} to {price_at_event}.
  - placeholders: `{coll_symbol}` text, `{price_change}` pct_whole, `{price_prev}` usd, `{price_at_event}` usd
- **market.rose** (when the price rose by the same measure): {coll_symbol} had risen {price_change} since the previous event, from {price_prev} to {price_at_event}.
  - placeholders: `{coll_symbol}` text, `{price_change}` pct_whole, `{price_prev}` usd, `{price_at_event}` usd
- **rate.moved** (when an adjustment also moved the rate): The annual interest rate moved from {rate_before} to {rate_after}.
  - placeholders: `{rate_before}` rate, `{rate_after}` rate
- **redist.debt** (when the touch applied a redistribution of debt only): Liquidations on the {coll_symbol} branch passed this trove {redist_debt} {debt_symbol} of debt since its last change, applied at this touch.
  - placeholders: `{coll_symbol}` text, `{redist_debt}` debt, `{debt_symbol}` text
- **redist.coll** (when the touch applied a redistribution of collateral only): Liquidations on the {coll_symbol} branch passed this trove {redist_coll} {coll_symbol} of collateral since its last change, applied at this touch.
  - placeholders: `{coll_symbol}` text, `{redist_coll}` coll
- **redist.both** (when the touch applied a redistribution of both): Liquidations on the {coll_symbol} branch passed this trove {redist_debt} {debt_symbol} of debt and {redist_coll} {coll_symbol} of collateral since its last change, applied at this touch.
  - placeholders: `{coll_symbol}` text, `{redist_debt}` debt, `{debt_symbol}` text, `{redist_coll}` coll
- **redist.balance** (when a redistribution of debt arrived with the touch): Debt: {debt_before} before {debt_terms} = {debt_after} {debt_symbol}.
  - placeholders: `{debt_before}` debt, `{debt_terms}` text, `{debt_after}` debt, `{debt_symbol}` text
- **fee.borrow** (when the adjustment charged an upfront fee): Borrowing more charged a one-time fee of {upfront_fee} {debt_symbol}, equal to 7 days of average interest on the {coll_symbol} branch.
  - placeholders: `{upfront_fee}` debt, `{debt_symbol}` text, `{coll_symbol}` text
- **accrual.interest** (when more than 0.01 accrued and the trove was not batched): Interest of {accrued_total} {debt_symbol} accrued since the last operation.
  - placeholders: `{accrued_total}` accrued, `{debt_symbol}` text
- **accrual.batched** (when more than 0.01 accrued on a batched trove): Interest and fees of {accrued_total} {debt_symbol} accrued since the last operation.
  - placeholders: `{accrued_total}` accrued, `{debt_symbol}` text
- **accrual.batched_fee** (when the same, with the management fee told apart): Interest and fees of {accrued_total} {debt_symbol} accrued since the last operation, including a {accrued_fee} {debt_symbol} management fee.
  - placeholders: `{accrued_total}` accrued, `{debt_symbol}` text, `{accrued_fee}` accrued
- **state.debt_now** (when the trove has debt after the event): Its debt now stands at {debt_after} {debt_symbol}.
  - placeholders: `{debt_after}` debt, `{debt_symbol}` text
- **state.cr** (when the trove has a ratio after the event): The collateral ratio is {cr_after|ratio_pair}.
  - placeholders: `{cr_after}` ratio_pair
- **liq.after** (when the liquidation price is below the event's price): Liquidation would now come at {coll_symbol} {liq_price_after}, {liq_distance_after} below that price.
  - placeholders: `{coll_symbol}` text, `{liq_price_after}` usd, `{liq_distance_after}` pct_whole
- **liq.after_before** (when the same, where the liquidation price moved): Liquidation would now come at {coll_symbol} {liq_price_after}, {liq_distance_after} below that price, against {liq_price_before} before.
  - placeholders: `{coll_symbol}` text, `{liq_price_after}` usd, `{liq_distance_after}` pct_whole, `{liq_price_before}` usd
- **same_block** (when the block holds more than one of the trove's events): This trove had {block_events} events in block {block}; this is {block_position}, in the order the block recorded them.
  - placeholders: `{block_events}` count, `{block}` count, `{block_position}` text

## liquity2.adjust.add_coll

**Title:** Add collateral  
**Selected when:** adjustTrove that added collateral and moved no debt  
**L5:** adjust

**Variants:**

- `default`: always

**L1:** {label} · {coll_change} {coll_symbol} · From a liquidation {redist_l1}

**L4, in order:**

- **add.what** — when always
  > The owner added {added} {coll_symbol} ({added_usd}) of collateral to the trove.
  - placeholders: `{added}` coll_trim, `{coll_symbol}` text, `{added_usd}` usd_about
- **add.safety** — when the ratio moved
  > With more collateral behind the same debt, the trove is safer: its collateral ratio rose from {cr_before_same_price} to {cr_after}.
  - placeholders: `{cr_before_same_price}` ratio_whole, `{cr_after}` ratio_whole
- **add.liq_distance** — when the trove has debt before and after
  > {coll_symbol} would now need to fall {liq_distance_after}, to about {liq_price_after}, before liquidation, compared with {liq_distance_before} before this deposit.
  - placeholders: `{coll_symbol}` text, `{liq_distance_after}` pct_whole, `{liq_price_after}` usd, `{liq_distance_before}` pct_whole
- **market.fell** (shared) — when the price fell since the trove's previous event by at least a quarter of the room the trove had above the minimum
- **market.rose** (shared) — when the price rose by the same measure
- **redist.debt** (shared) — when the touch applied a redistribution of debt only
- **redist.coll** (shared) — when the touch applied a redistribution of collateral only
- **redist.both** (shared) — when the touch applied a redistribution of both
- **redist.balance** (shared) — when a redistribution of debt arrived with the touch
- **add.rest** — when no redistribution arrived and the rate held
  > Its debt and interest rate are unchanged.
  - placeholders: none
- **rate.moved** (shared) — when an adjustment also moved the rate
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.adjust.withdraw_coll

**Title:** Withdraw collateral  
**Selected when:** adjustTrove that withdrew collateral and moved no debt  
**L5:** adjust

**Variants:**

- `default`: always

**L1:** {label} · {coll_change} {coll_symbol} · From a liquidation {redist_l1}

**L4, in order:**

- **withdraw.what** — when always
  > The owner withdrew {withdrawn} {coll_symbol} ({withdrawn_usd}) of collateral from the trove.
  - placeholders: `{withdrawn}` coll_trim, `{coll_symbol}` text, `{withdrawn_usd}` usd_about
- **withdraw.safety** — when the ratio moved
  > With less collateral behind the same debt, the trove is less safe: its collateral ratio fell from {cr_before_same_price} to {cr_after}.
  - placeholders: `{cr_before_same_price}` ratio_whole, `{cr_after}` ratio_whole
- **withdraw.liq_distance** — when the trove has debt before and after
  > {coll_symbol} would now need to fall {liq_distance_after}, to about {liq_price_after}, before liquidation, compared with {liq_distance_before} before this withdrawal.
  - placeholders: `{coll_symbol}` text, `{liq_distance_after}` pct_whole, `{liq_price_after}` usd, `{liq_distance_before}` pct_whole
- **market.fell** (shared) — when the price fell since the trove's previous event by at least a quarter of the room the trove had above the minimum
- **market.rose** (shared) — when the price rose by the same measure
- **redist.debt** (shared) — when the touch applied a redistribution of debt only
- **redist.coll** (shared) — when the touch applied a redistribution of collateral only
- **redist.both** (shared) — when the touch applied a redistribution of both
- **redist.balance** (shared) — when a redistribution of debt arrived with the touch
- **withdraw.margin_far** — when the ratio after is at least twice the minimum, no redistribution arrived and the rate held
  > The trove stays far above the {mcr} minimum, and its debt and interest rate are unchanged.
  - placeholders: `{mcr}` pct_whole
- **withdraw.margin** — when the ratio after is under twice the minimum, no redistribution arrived and the rate held
  > The trove stays above the {mcr} minimum, and its debt and interest rate are unchanged.
  - placeholders: `{mcr}` pct_whole
- **rate.moved** (shared) — when an adjustment also moved the rate
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.adjust.borrow

**Title:** Borrow  
**Selected when:** adjustTrove that borrowed more and moved no collateral  
**L5:** adjust

**Variants:**

- `default`: always

**L1:** {label} · {debt_change} {debt_symbol} · From a liquidation {redist_l1}

**L4, in order:**

- **borrow.what** — when always
  > The owner borrowed {borrowed} {debt_symbol} more against the trove.
  - placeholders: `{borrowed}` debt, `{debt_symbol}` text
- **borrow.safety** — when the ratio moved
  > With more debt against the same collateral, the trove is less safe: its collateral ratio fell from {cr_before_same_price} to {cr_after}.
  - placeholders: `{cr_before_same_price}` ratio_whole, `{cr_after}` ratio_whole
- **borrow.liq_distance** — when the trove has debt before and after
  > {coll_symbol} would now need to fall {liq_distance_after}, to about {liq_price_after}, before liquidation, compared with {liq_distance_before} before this borrow.
  - placeholders: `{coll_symbol}` text, `{liq_distance_after}` pct_whole, `{liq_price_after}` usd, `{liq_distance_before}` pct_whole
- **market.fell** (shared) — when the price fell since the trove's previous event by at least a quarter of the room the trove had above the minimum
- **market.rose** (shared) — when the price rose by the same measure
- **fee.borrow** (shared) — when the adjustment charged an upfront fee
- **redist.debt** (shared) — when the touch applied a redistribution of debt only
- **redist.coll** (shared) — when the touch applied a redistribution of collateral only
- **redist.both** (shared) — when the touch applied a redistribution of both
- **redist.balance** (shared) — when a redistribution of debt arrived with the touch
- **borrow.margin_far** — when the ratio after is at least twice the minimum, no redistribution arrived and the rate held
  > The trove stays far above the {mcr} minimum, and its collateral and interest rate are unchanged.
  - placeholders: `{mcr}` pct_whole
- **borrow.margin** — when the ratio after is under twice the minimum, no redistribution arrived and the rate held
  > The trove stays above the {mcr} minimum, and its collateral and interest rate are unchanged.
  - placeholders: `{mcr}` pct_whole
- **rate.moved** (shared) — when an adjustment also moved the rate
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.adjust.repay

**Title:** Repay  
**Selected when:** adjustTrove that repaid debt and moved no collateral  
**L5:** adjust

**Variants:**

- `default`: always

**L1:** {label} · {debt_change} {debt_symbol} · From a liquidation {redist_l1}

**L4, in order:**

- **repay.what** — when always
  > The owner repaid {repaid} {debt_symbol} of the trove’s debt.
  - placeholders: `{repaid}` debt, `{debt_symbol}` text
- **repay.safety** — when the ratio moved
  > With less debt against the same collateral, the trove is safer: its collateral ratio rose from {cr_before_same_price} to {cr_after}.
  - placeholders: `{cr_before_same_price}` ratio_whole, `{cr_after}` ratio_whole
- **repay.liq_distance** — when the trove has debt before and after
  > {coll_symbol} would now need to fall {liq_distance_after}, to about {liq_price_after}, before liquidation, compared with {liq_distance_before} before this repayment.
  - placeholders: `{coll_symbol}` text, `{liq_distance_after}` pct_whole, `{liq_price_after}` usd, `{liq_distance_before}` pct_whole
- **market.fell** (shared) — when the price fell since the trove's previous event by at least a quarter of the room the trove had above the minimum
- **market.rose** (shared) — when the price rose by the same measure
- **redist.debt** (shared) — when the touch applied a redistribution of debt only
- **redist.coll** (shared) — when the touch applied a redistribution of collateral only
- **redist.both** (shared) — when the touch applied a redistribution of both
- **redist.balance** (shared) — when a redistribution of debt arrived with the touch
- **repay.rest** — when no redistribution arrived and the rate held
  > Its collateral and interest rate are unchanged.
  - placeholders: none
- **rate.moved** (shared) — when an adjustment also moved the rate
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.adjust.combined

**Title:** Adjust trove  
**Selected when:** adjustTrove that moved both collateral and debt  
**L5:** adjust

**Variants:**

- `add_borrow`: added collateral and borrowed
- `add_repay`: added collateral and repaid
- `withdraw_borrow`: withdrew collateral and borrowed
- `withdraw_repay`: withdrew collateral and repaid

**L1:** {coll_label} {coll_change} {coll_symbol} · {debt_label} {debt_change} {debt_symbol} · From a liquidation {redist_l1}

**L4, in order:**

- **combined.what.add_borrow** — when variant add_borrow
  > The owner added {added} {coll_symbol} ({added_usd}) of collateral and borrowed {borrowed} {debt_symbol} more.
  - placeholders: `{added}` coll_trim, `{coll_symbol}` text, `{added_usd}` usd_about, `{borrowed}` debt, `{debt_symbol}` text
- **combined.what.add_repay** — when variant add_repay
  > The owner added {added} {coll_symbol} ({added_usd}) of collateral and repaid {repaid} {debt_symbol} of debt.
  - placeholders: `{added}` coll_trim, `{coll_symbol}` text, `{added_usd}` usd_about, `{repaid}` debt, `{debt_symbol}` text
- **combined.what.withdraw_borrow** — when variant withdraw_borrow
  > The owner withdrew {withdrawn} {coll_symbol} ({withdrawn_usd}) of collateral and borrowed {borrowed} {debt_symbol} more.
  - placeholders: `{withdrawn}` coll_trim, `{coll_symbol}` text, `{withdrawn_usd}` usd_about, `{borrowed}` debt, `{debt_symbol}` text
- **combined.what.withdraw_repay** — when variant withdraw_repay
  > The owner withdrew {withdrawn} {coll_symbol} ({withdrawn_usd}) of collateral and repaid {repaid} {debt_symbol} of debt.
  - placeholders: `{withdrawn}` coll_trim, `{coll_symbol}` text, `{withdrawn_usd}` usd_about, `{repaid}` debt, `{debt_symbol}` text
- **combined.safety_rose** — when the ratio rose
  > Together, these changes raised the collateral ratio from {cr_before_same_price} to {cr_after}.
  - placeholders: `{cr_before_same_price}` ratio_whole, `{cr_after}` ratio_whole
- **combined.safety_fell** — when the ratio fell
  > Together, these changes lowered the collateral ratio from {cr_before_same_price} to {cr_after}.
  - placeholders: `{cr_before_same_price}` ratio_whole, `{cr_after}` ratio_whole
- **combined.liq_distance** — when the trove has debt before and after
  > {coll_symbol} would now need to fall {liq_distance_after}, to about {liq_price_after}, before liquidation, compared with {liq_distance_before} before this adjustment.
  - placeholders: `{coll_symbol}` text, `{liq_distance_after}` pct_whole, `{liq_price_after}` usd, `{liq_distance_before}` pct_whole
- **market.fell** (shared) — when the price fell since the trove's previous event by at least a quarter of the room the trove had above the minimum
- **market.rose** (shared) — when the price rose by the same measure
- **fee.borrow** (shared) — when the adjustment charged an upfront fee
- **redist.debt** (shared) — when the touch applied a redistribution of debt only
- **redist.coll** (shared) — when the touch applied a redistribution of collateral only
- **redist.both** (shared) — when the touch applied a redistribution of both
- **redist.balance** (shared) — when a redistribution of debt arrived with the touch
- **combined.rate** — when the rate held
  > Its interest rate is unchanged.
  - placeholders: none
- **rate.moved** (shared) — when an adjustment also moved the rate
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.adjust.no_change

**Title:** No change  
**Selected when:** adjustTrove that moved neither side past display precision, or the server's run of them  
**L5:** adjust

**Variants:**

- `single`: one touch
- `run`: a run of touches the server collapsed into one row

**L1:** {label}

**L4, in order:**

- **nochange.run** — when variant run
  > This row stands in for {run_count} adjustments between {run_first} and {run_last}, every one of which left the trove unchanged.
  - placeholders: `{run_count}` count, `{run_first}` day_short, `{run_last}` day_short
- **nochange.run_repaid** — when variant run, debt repaid
  > Together they repaid {dust} {debt_symbol}, the interest that accrued between touches.
  - placeholders: `{dust}` amount, `{debt_symbol}` text
- **nochange.dust** — when variant single, debt repaid
  > This adjustment moved no collateral and repaid only {dust} {debt_symbol}, the interest that had accrued since the trove was last touched.
  - placeholders: `{dust}` amount, `{debt_symbol}` text
- **nochange.none** — when variant single, nothing repaid
  > This adjustment moved no collateral and no debt.
  - placeholders: none
- **nochange.at_min** — when the debt after is the minimum
  > The debt sits at Liquity V2’s {min_debt} {debt_symbol} minimum.
  - placeholders: `{min_debt}` count, `{debt_symbol}` text
- **nochange.capped_run** — when variant run at the minimum
  > A repayment stops at that floor unless it closes the trove, so every larger attempt in this stretch was capped at the interest accrued since the last touch.
  - placeholders: none
- **nochange.capped** — when variant single at the minimum
  > A repayment stops at that floor unless it closes the trove, so any larger attempt was capped at the interest accrued since the last touch.
  - placeholders: none
- **nochange.bot** — when always
  > Repeated no-change adjustments like this are typically sent by an automated manager retrying an operation the protocol clamps to nothing.
  - placeholders: none
- **nochange.gas** — when always
  > Each attempt costs the sender only gas.
  - placeholders: none
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.adjust.rate

**Title:** Interest rate change  
**Selected when:** adjustTroveInterestRate: the owner set a new rate  
**L5:** interest_rate

**Variants:**

- `raised`: the rate rose
- `lowered`: the rate fell

**L1:** {label} · {rate_after}

**L4, in order:**

- **rate.raised** — when variant raised
  > This adjustment raised the trove’s interest rate from {rate_before} to {rate_after} APR.
  - placeholders: `{rate_before}` rate, `{rate_after}` rate
- **rate.lowered** — when variant lowered
  > This adjustment lowered the trove’s interest rate from {rate_before} to {rate_after} APR.
  - placeholders: `{rate_before}` rate, `{rate_after}` rate
- **accrual.interest** (shared) — when more than 0.01 accrued and the trove was not batched
- **accrual.batched** (shared) — when more than 0.01 accrued on a batched trove
- **accrual.batched_fee** (shared) — when the same, with the management fee told apart
- **rate.fee** — when the change charged an upfront fee
  > An upfront fee of {upfront_fee} {debt_symbol} was added to the debt, because the rate changed within 7 days of the trove’s previous rate change; the fee equals 7 days of average interest.
  - placeholders: `{upfront_fee}` debt, `{debt_symbol}` text
- **state.debt_now** (shared) — when the trove has debt after the event
- **rate.coll** — when the trove holds priced collateral
  > The collateral remains {coll_after} {coll_symbol} ({coll_after_usd}).
  - placeholders: `{coll_after}` coll, `{coll_symbol}` text, `{coll_after_usd}` usd
- **state.cr** (shared) — when the trove has a ratio after the event
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.redemption

**Title:** Redemption  
**Selected when:** redeemCollateral, or a zombie trove's adjustZombieTrove / adjustUnredeemableZombieTrove  
**L5:** redemption

**Variants:**

- `price_lower_now`: the collateral's price today is below its price at the redemption
- `price_higher_now`: the price today is far enough above it that the redeemed collateral would now be worth more than the debt it paid off
- `at_event`: no price today, or one that reads the same, or a rise smaller than the fee
- `no_detail`: the event carries no redemption log

**L1:** {label} · Cleared {debt_change} {debt_symbol} · Took {coll_change} {coll_symbol}

**L4, in order:**

- **redeem.no_detail** — when variant no_detail
  > The {coll_symbol} trove was redeemed.
  - placeholders: `{coll_symbol}` text
- **redeem.what** — when always
  > A redeemer exchanged {debt_cleared} {debt_symbol} for this trove’s {coll_symbol}, clearing that much debt and taking {coll_taken} {coll_symbol} ({coll_taken_usd}) of collateral.
  - placeholders: `{debt_cleared}` debt, `{debt_symbol}` text, `{coll_symbol}` text, `{coll_taken}` coll_trim, `{coll_taken_usd}` usd
- **redeem.result** — when the fee the trove kept reads at least $1
  > In effect, some collateral was sold at {price_at_event} to repay debt, and the trove kept a {redemption_result_usd} fee, so the owner came out slightly ahead.
  - placeholders: `{price_at_event}` usd, `{redemption_result_usd}` usd
- **redeem.result_no_fee** — when the fee reads under $1
  > In effect, some collateral was sold at {price_at_event} to repay the same amount of debt.
  - placeholders: `{price_at_event}` usd
- **redeem.today_lower** — when variant price_lower_now
  > {coll_symbol} has since fallen to {price_today} today, so the redeemed {coll_symbol} would now be worth {redemption_vs_today_usd} less than the debt it paid off.
  - placeholders: `{coll_symbol}` text, `{price_today}` usd, `{redemption_vs_today_usd}` usd
- **redeem.today_higher** — when variant price_higher_now
  > {coll_symbol} has since risen to {price_today} today, so if the trove had kept the redeemed {coll_symbol}, it would now be worth {redemption_vs_today_usd} more than the debt it paid off.
  - placeholders: `{coll_symbol}` text, `{price_today}` usd, `{redemption_vs_today_usd}` usd
- **redeem.why_batch** — when not a zombie, the trove is batched
  > It was redeemed because its {rate_after} rate, set by batch manager {rate_setter}, was among the lowest in the {coll_symbol} branch.
  - placeholders: `{rate_after}` rate, `{rate_setter}` text, `{coll_symbol}` text
- **redeem.why_owner** — when not a zombie, the owner sets the rate
  > It was redeemed because its {rate_after} rate was among the lowest in the {coll_symbol} branch.
  - placeholders: `{rate_after}` rate, `{coll_symbol}` text
- **redeem.zero** — when the redemption cleared all the debt, not a zombie
  > The trove now holds 0 {debt_symbol} of debt.
  - placeholders: `{debt_symbol}` text
- **redeem.zombie_zero** — when a zombie with no debt left
  > The trove now holds 0 {debt_symbol} of debt and remains open with collateral only, a zero-debt zombie trove.
  - placeholders: `{debt_symbol}` text
- **redeem.zombie_zero_rate** — when a zombie with no debt left
  > With no debt, interest accrual has stopped and the {rate_after} rate is inactive.
  - placeholders: `{rate_after}` rate
- **redeem.zombie_zero_next** — when a zombie with no debt left
  > It can be closed by withdrawing the remaining collateral, or re-activated by borrowing {min_debt} {debt_symbol} or more.
  - placeholders: `{min_debt}` count, `{debt_symbol}` text
- **redeem.zombie_low** — when a zombie with debt left
  > The trove now holds {debt_after} {debt_symbol} of debt, a low-debt zombie trove below the {min_debt} {debt_symbol} minimum.
  - placeholders: `{debt_after}` debt, `{debt_symbol}` text, `{min_debt}` count
- **redeem.zombie_low_queue** — when a zombie with debt left
  > It is removed from the normal redemption order and may be prioritised in later redemptions to clear the below-minimum debt.
  - placeholders: none
- **redeem.zombie_low_rate** — when a zombie with debt left
  > Interest keeps accruing at {rate_after}; if the debt later rises back above {min_debt} {debt_symbol}, the trove returns to normal behaviour.
  - placeholders: `{rate_after}` rate, `{min_debt}` count, `{debt_symbol}` text
- **redeem.zombie_low_next** — when a zombie with debt left
  > It can be resolved by repaying the remaining debt and withdrawing collateral to close it, or by borrowing more to bring the debt above {min_debt} {debt_symbol}.
  - placeholders: `{min_debt}` count, `{debt_symbol}` text
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.delegation.join

**Title:** Join batch manager  
**Selected when:** setInterestBatchManager  
**L5:** delegation

**Variants:**

- `default`: always

**L1:** {label} · {rate_after} · {rate_setter}

**L4, in order:**

- **join.what** — when the batch manager is known
  > This trove delegated its interest-rate management to {manager}.
  - placeholders: `{manager}` manager
- **join.what_plain** — when the batch manager is not known
  > This trove delegated its interest-rate management.
  - placeholders: none
- **join.debt_accrued** — when the debt moved and interest accrued
  > Its debt updated from {debt_before} {debt_symbol} to {debt_after} {debt_symbol}, reflecting accrued interest.
  - placeholders: `{debt_before}` debt, `{debt_symbol}` text, `{debt_after}` debt
- **join.debt_moved** — when the debt moved, nothing accrued
  > Its debt updated from {debt_before} {debt_symbol} to {debt_after} {debt_symbol}.
  - placeholders: `{debt_before}` debt, `{debt_symbol}` text, `{debt_after}` debt
- **join.debt_same** — when the debt held
  > Its debt is unchanged at {debt_after} {debt_symbol}.
  - placeholders: `{debt_after}` debt, `{debt_symbol}` text
- **join.fee** — when joining charged an upfront fee
  > An upfront fee of {upfront_fee} {debt_symbol} was added to the debt: joining a batch charges the upfront fee, 7 days of interest at the branch’s average rate.
  - placeholders: `{upfront_fee}` debt, `{debt_symbol}` text
- **join.coll** — when the trove holds collateral
  > The collateral remains {coll_after} {coll_symbol}.
  - placeholders: `{coll_after}` coll, `{coll_symbol}` text
- **join.rate** — when the rate after is known
  > The trove now accrues at a delegated rate of {rate_after} APR.
  - placeholders: `{rate_after}` rate
- **state.cr** (shared) — when the trove has a ratio after the event
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.delegation.leave

**Title:** Leave batch manager  
**Selected when:** removeFromBatch  
**L5:** delegation

**Variants:**

- `default`: always

**L1:** {label} · {rate_after}

**L4, in order:**

- **leave.what** — when the batch manager is known
  > This trove left its batch manager and returned to managing its own interest rate, formerly delegated to {former_manager}.
  - placeholders: `{former_manager}` address
- **leave.what_plain** — when the batch manager is not known
  > This trove left its batch manager and returned to managing its own interest rate.
  - placeholders: none
- **leave.fees** — when more than 0.01 of management fee accrued since the previous event
  > About {accrued_fee} {debt_symbol} of batch management fees had accrued.
  - placeholders: `{accrued_fee}` accrued, `{debt_symbol}` text
- **leave.fee** — when leaving charged an upfront fee
  > An upfront fee of {upfront_fee} {debt_symbol} was added to the debt, because leaving a delegate within 7 days of the trove’s previous rate change counts as a rate change; the fee equals 7 days of average interest.
  - placeholders: `{upfront_fee}` debt, `{debt_symbol}` text
- **state.debt_now** (shared) — when the trove has debt after the event
- **leave.coll** — when the trove holds priced collateral
  > The collateral is {coll_after} {coll_symbol} ({coll_after_usd}).
  - placeholders: `{coll_after}` coll, `{coll_symbol}` text, `{coll_after_usd}` usd
- **leave.rate** — when the rate moved
  > The rate moved from {rate_before} to a self-set {rate_after}.
  - placeholders: `{rate_before}` rate, `{rate_after}` rate
- **state.cr** (shared) — when the trove has a ratio after the event
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.delegation.rate_update

**Title:** Batch manager rate change  
**Selected when:** setBatchManagerAnnualInterestRate: the trove's batch manager set the batch's rate  
**L5:** delegation

**Variants:**

- `raised`: the rate rose
- `lowered`: the rate fell
- `kept`: the rate held

**L1:** {label} · {rate_after} · {rate_setter} · Debt {debt_move_abs} {debt_symbol}

**L4, in order:**

- **bru.raised** — when variant raised
  > The batch manager raised the delegated interest rate from {rate_before|rate_step} to {rate_after|rate_step} APR.
  - placeholders: `{rate_before}` rate_step, `{rate_after}` rate_step
- **bru.lowered** — when variant lowered
  > The batch manager lowered the delegated interest rate from {rate_before|rate_step} to {rate_after|rate_step} APR.
  - placeholders: `{rate_before}` rate_step, `{rate_after}` rate_step
- **bru.kept** — when variant kept
  > The batch manager kept the delegated interest rate at {rate_after} APR.
  - placeholders: `{rate_after}` rate
- **bru.move** — when the debt moved by 0.01 or more and the previous event and batch fee are known
  > Debt {debt_move} {debt_symbol} since {prev_date}, the trove’s previous event.
  - placeholders: `{debt_move}` accrued_signed, `{debt_symbol}` text, `{prev_date}` date
- **bru.interest** — when interest of 0.005 or more
  > Interest {move_interest} {debt_symbol} at {move_rate} over {move_span}.
  - placeholders: `{move_interest}` accrued, `{debt_symbol}` text, `{move_rate}` rate, `{move_span}` span
- **bru.mgmt** — when management fee of 0.005 or more
  > Management fee {move_fee} {debt_symbol} at the batch’s {move_fee_rate} a year.
  - placeholders: `{move_fee}` accrued, `{debt_symbol}` text, `{move_fee_rate}` rate
- **bru.upfront** — when the change fell inside the 7-day cooldown and left a remainder
  > Upfront fee {move_upfront} {debt_symbol}: the manager changed the rate again within 7 days.
  - placeholders: `{move_upfront}` accrued, `{debt_symbol}` text
- **bru.setter** — when the batch manager is known
  > The rate is set by the delegate {manager_address}.
  - placeholders: `{manager_address}` address
- **bru.debt** — when the trove has debt
  > The trove’s debt now stands at {debt_after} {debt_symbol}.
  - placeholders: `{debt_after}` debt, `{debt_symbol}` text
- **bru.coll** — when the trove holds priced collateral
  > Its collateral is {coll_after} {coll_symbol} ({coll_after_usd|usd_cents}).
  - placeholders: `{coll_after}` coll, `{coll_symbol}` text, `{coll_after_usd}` usd_cents
- **bru.cr** — when the trove has a ratio
  > The collateral ratio is {cr_after|ratio}.
  - placeholders: `{cr_after}` ratio
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.open

**Title:** Open trove  
**Selected when:** openTrove or openTroveAndJoinBatch  
**L5:** open

**Variants:**

- `self`: the owner sets the rate
- `join_batch`: opened straight into a batch

**L1:** {label} · Supply {coll_change} {coll_symbol} · Borrow {debt_change} {debt_symbol} · {rate_after}

**L4, in order:**

- **open.what** — when always
  > This trove opened, depositing {coll_after} {coll_symbol} as collateral and borrowing {principal} {debt_symbol} against it.
  - placeholders: `{coll_after}` coll, `{coll_symbol}` text, `{principal}` debt, `{debt_symbol}` text
- **open.fee** — when opening charged an upfront fee
  > A one-time borrowing fee of {upfront_fee} {debt_symbol} was added to the debt, equivalent to 7 days of average interest.
  - placeholders: `{upfront_fee}` debt, `{debt_symbol}` text
- **open.debt_fee** — when opening charged an upfront fee
  > Its total initial debt stands at {debt_after} {debt_symbol}, including that fee.
  - placeholders: `{debt_after}` debt, `{debt_symbol}` text
- **open.debt** — when no upfront fee
  > Its total initial debt stands at {debt_after} {debt_symbol}.
  - placeholders: `{debt_after}` debt, `{debt_symbol}` text
- **open.reserve** — when always
  > A 0.0375 ETH liquidation reserve is set aside on open and returned when the trove closes.
  - placeholders: none
- **open.value** — when the event carries a price
  > At the price at the time, that collateral is worth {coll_after_usd} ({coll_symbol} at {price_at_event}).
  - placeholders: `{coll_after_usd}` usd, `{coll_symbol}` text, `{price_at_event}` usd
- **open.cr** — when always
  > The trove opened at a {cr_after|ratio_pair} collateral ratio.
  - placeholders: `{cr_after}` ratio_pair
- **liq.after** (shared) — when the liquidation price is below the event's price
- **open.rate** — when always
  > It accrues interest at {rate_after} a year, added to the debt as it accrues.
  - placeholders: `{rate_after}` rate
- **open.join** — when variant join_batch, manager and fee known
  > The trove joined a batch manager on open, delegating its rate to {manager} at {batch_rate} APR, with a {batch_fee_rate} management fee.
  - placeholders: `{manager}` manager, `{batch_rate}` rate, `{batch_fee_rate}` rate
- **open.join_no_fee** — when variant join_batch, no management fee
  > The trove joined a batch manager on open, delegating its rate to {manager} at {batch_rate} APR.
  - placeholders: `{manager}` manager, `{batch_rate}` rate
- **open.join_plain** — when variant join_batch, manager not known
  > The trove joined a batch manager on open.
  - placeholders: none
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.close

**Title:** Close trove  
**Selected when:** closeTrove  
**L5:** close

**Variants:**

- `repaid`: the close repaid debt
- `zero_debt`: a redemption had already cleared the debt

**L1:** {label} · {debt_change} {debt_symbol} · {coll_change} {coll_symbol}

**L4, in order:**

- **close.repaid** — when variant repaid
  > This transaction closed the trove, repaying its {debt_repaid} {debt_symbol} of debt in full.
  - placeholders: `{debt_repaid}` debt, `{debt_symbol}` text
- **close.zero** — when variant zero_debt
  > This transaction closed the trove; its debt was already zero, so nothing was repaid.
  - placeholders: none
- **close.coll** — when always
  > The borrower retrieved all {coll_retrieved} {coll_symbol} of collateral.
  - placeholders: `{coll_retrieved}` coll, `{coll_symbol}` text
- **close.reserve** — when always
  > The 0.0375 ETH liquidation reserve was returned.
  - placeholders: none
- **close.rate** — when variant repaid, a rate before
  > Before closing, the trove was paying {rate_before} annual interest.
  - placeholders: `{rate_before}` rate
- **close.cr** — when variant repaid, a ratio before
  > It closed at a {cr_before} collateral ratio.
  - placeholders: `{cr_before}` ratio_pair
- **close.nft** — when always
  > The trove NFT was sent to the burn address, ending its ownership.
  - placeholders: none
- **close.nothing** — when always
  > Nothing remains on either side.
  - placeholders: none
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.liquidation

**Title:** Liquidation  
**Selected when:** liquidate  
**L5:** liquidation

**Variants:**

- `destructive`: this trove was liquidated
- `redistribution_gain`: another trove's liquidation redistributed collateral and debt onto this one
- `no_detail`: the event carries no liquidation log

**L1:** {label} · Liquidated {coll_change} {coll_symbol} · Cleared {debt_change} {debt_symbol} · {surplus_l1}

**L4, in order:**

- **liq.no_detail** — when variant no_detail
  > The {coll_symbol} trove was liquidated.
  - placeholders: `{coll_symbol}` text
- **liq.gain.what** — when variant redistribution_gain
  > Another trove’s liquidation redistributed part of its collateral and debt onto this one.
  - placeholders: none
- **liq.gain.received** — when variant redistribution_gain, priced
  > This trove received {redist_coll} {coll_symbol} from the liquidated trove (about {redist_coll_usd} at the price at the time).
  - placeholders: `{redist_coll}` coll, `{coll_symbol}` text, `{redist_coll_usd}` usd_cents
- **liq.gain.received_unpriced** — when variant redistribution_gain, no price
  > This trove received {redist_coll} {coll_symbol} from the liquidated trove.
  - placeholders: `{redist_coll}` coll, `{coll_symbol}` text
- **liq.gain.inherited** — when variant redistribution_gain
  > It inherited {redist_debt} {debt_symbol} of debt in proportion to its collateral.
  - placeholders: `{redist_debt}` debt, `{debt_symbol}` text
- **liq.gain.net_pos** — when variant redistribution_gain, the collateral outweighed the debt
  > The net effect was +{net_benefit}, the redistribution penalty working in this trove’s favour.
  - placeholders: `{net_benefit}` usd_cents
- **liq.gain.net_neg** — when variant redistribution_gain, the debt outweighed the collateral
  > The net effect was −{net_benefit}, a small cost.
  - placeholders: `{net_benefit}` usd_cents
- **liq.gain.why** — when variant redistribution_gain
  > The redistribution happened because the Stability Pool could not fully cover the liquidation.
  - placeholders: none
- **liq.gain.cr** — when variant redistribution_gain, both ratios known
  > Its collateral ratio moved from {cr_before} to {cr_after|ratio_pair}.
  - placeholders: `{cr_before}` ratio_pair, `{cr_after}` ratio_pair
- **liq.gain.open** — when variant redistribution_gain
  > The trove remains open, now carrying the inherited debt.
  - placeholders: none
- **liq.what** — when variant destructive
  > This trove was liquidated: its collateral ratio had dropped to {cr_at_liquidation}, below the {mcr} liquidation line for {coll_symbol}.
  - placeholders: `{cr_at_liquidation}` ratio_pair, `{mcr}` pct_whole, `{coll_symbol}` text
- **liq.debt** — when variant destructive
  > Its {debt_cleared} {debt_symbol} of debt was cleared.
  - placeholders: `{debt_cleared}` debt, `{debt_symbol}` text
- **liq.coll** — when variant destructive
  > {coll_liquidated} {coll_symbol} of collateral was liquidated, worth {coll_liquidated_usd} at the price at the time.
  - placeholders: `{coll_liquidated}` coll, `{coll_symbol}` text, `{coll_liquidated_usd}` usd
- **liq.surplus** — when variant destructive, a surplus, not claimed yet
  > The collateral’s value exceeded the debt, so {coll_surplus} {coll_symbol} of surplus ({coll_surplus_usd}) remains claimable by the borrower.
  - placeholders: `{coll_surplus}` coll, `{coll_symbol}` text, `{coll_surplus_usd}` usd_cents
- **liq.surplus_claimed** — when variant destructive, the surplus since claimed
  > The collateral’s value exceeded the debt, so {coll_surplus} {coll_symbol} of surplus ({coll_surplus_usd}) was left claimable by the borrower, who claimed it on {claimed_at}.
  - placeholders: `{coll_surplus}` coll, `{coll_symbol}` text, `{coll_surplus_usd}` usd_cents, `{claimed_at}` date
- **liq.surplus_claimed_undated** — when variant destructive, the surplus since claimed, date unknown
  > The collateral’s value exceeded the debt, so {coll_surplus} {coll_symbol} of surplus ({coll_surplus_usd}) was left claimable by the borrower, who claimed it.
  - placeholders: `{coll_surplus}` coll, `{coll_symbol}` text, `{coll_surplus_usd}` usd_cents
- **liq.loss** — when variant destructive, the collateral was worth more than the debt
  > After that surplus, the borrower’s estimated loss was about {est_loss}.
  - placeholders: `{est_loss}` usd_cents
- **liq.partial** — when variant destructive, the pool covered part
  > The Stability Pool could not fully cover the liquidation, so part of the debt was redistributed to other troves.
  - placeholders: none
- **same_block** (shared) — when the block holds more than one of the trove's events
- **liq.leg.sp** (list) — when variant destructive, collateral went to the pool
  > The Stability Pool received {coll_to_sp} {coll_symbol} ({coll_to_sp_usd}).
  - placeholders: `{coll_to_sp}` coll, `{coll_symbol}` text, `{coll_to_sp_usd}` usd_cents
- **liq.leg.gas_comp** (list) — when variant destructive, collateral gas compensation
  > The liquidator received {coll_gas_comp} {coll_symbol} in gas compensation.
  - placeholders: `{coll_gas_comp}` coll, `{coll_symbol}` text
- **liq.leg.gas_weth** (list) — when variant destructive
  > The liquidator received 0.0375 WETH in gas compensation.
  - placeholders: none
- **liq.leg.incentive** (list) — when variant destructive, debt cleared
  > The liquidator received {incentive_coll} {coll_symbol} ({incentive_usd}) as the 5% liquidation incentive.
  - placeholders: `{incentive_coll}` coll, `{coll_symbol}` text, `{incentive_usd}` usd_cents
- **liq.leg.nft** (list) — when variant destructive
  > The trove NFT was burned in the liquidation.
  - placeholders: none

## liquity2.apply_pending_debt

**Title:** Apply pending debt  
**Selected when:** applyPendingDebt  
**L5:** interest_rate

**Variants:**

- `default`: always

**L1:** {label} · {debt_change} {debt_symbol} · {coll_change} {coll_symbol}

**L4, in order:**

- **apply.what** — when no collateral arrived
  > This event applied {redist_debt} {debt_symbol} of pending redistribution debt to the trove.
  - placeholders: `{redist_debt}` debt, `{debt_symbol}` text
- **apply.what_coll** — when collateral arrived too
  > This event applied {redist_debt} {debt_symbol} of pending redistribution debt to the trove, along with {redist_coll} {coll_symbol} of redistributed collateral.
  - placeholders: `{redist_debt}` debt, `{debt_symbol}` text, `{redist_coll}` coll, `{coll_symbol}` text
- **apply.batch** — when a batch update rode with it
  > A batch manager applied the trove’s accrued interest at the same time.
  - placeholders: none
- **state.debt_now** (shared) — when the trove has debt after the event
- **apply.coll** — when the trove holds priced collateral
  > The collateral is unchanged at {coll_after} {coll_symbol} ({coll_after_usd}).
  - placeholders: `{coll_after}` coll, `{coll_symbol}` text, `{coll_after_usd}` usd
- **apply.coll_unpriced** — when the trove holds collateral, no price
  > The collateral is unchanged at {coll_after} {coll_symbol}.
  - placeholders: `{coll_after}` coll, `{coll_symbol}` text
- **apply.rate** — when always
  > Interest accrues at {rate_after} a year.
  - placeholders: `{rate_after}` rate
- **state.cr** (shared) — when the trove has a ratio after the event
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.transfer

**Title:** Transfer  
**Selected when:** transferTrove: the trove NFT changed hands  
**L5:** transfer

**Variants:**

- `transfer`: a transfer between wallets
- `mint`: the NFT's mint
- `burn`: the NFT's burn
- `no_detail`: no transfer log

**L1:** {label}

**L4, in order:**

- **transfer.no_detail** — when variant no_detail
  > The {coll_symbol} trove’s ownership was transferred.
  - placeholders: `{coll_symbol}` text
- **transfer.mint** — when variant mint
  > The trove NFT was minted to {to_address}.
  - placeholders: `{to_address}` address
- **transfer.burn** — when variant burn
  > The trove NFT was burned from {from_address}.
  - placeholders: `{from_address}` address
- **transfer.move** — when variant transfer
  > The trove NFT moved from {from_address} to {to_address}.
  - placeholders: `{from_address}` address, `{to_address}` address
- **transfer.state** — when variant transfer, the trove holds something, priced
  > The transferred trove holds {debt_after} {debt_symbol} of debt against {coll_after} {coll_symbol} of collateral, at a {cr_after|ratio_pair} ratio and a {rate_after} interest rate ({coll_symbol} at {price_at_event}).
  - placeholders: `{debt_after}` debt, `{debt_symbol}` text, `{coll_after}` coll, `{coll_symbol}` text, `{cr_after}` ratio_pair, `{rate_after}` rate, `{price_at_event}` usd
- **transfer.state_unpriced** — when variant transfer, the trove holds something, no price
  > The transferred trove holds {debt_after} {debt_symbol} of debt against {coll_after} {coll_symbol} of collateral, at a {cr_after|ratio_pair} ratio and a {rate_after} interest rate.
  - placeholders: `{debt_after}` debt, `{debt_symbol}` text, `{coll_after}` coll, `{coll_symbol}` text, `{cr_after}` ratio_pair, `{rate_after}` rate
- **transfer.unchanged** — when variant transfer
  > The trove’s debt and collateral balances are unchanged by the transfer.
  - placeholders: none
- **same_block** (shared) — when the block holds more than one of the trove's events

## liquity2.fallback

**Title:** Trove event  
**Selected when:** any operation no other template takes  
**L5:** fallback

**Variants:**

- `default`: always

**L1:** {label}

**L4, in order:**

- **fallback.what** — when always
  > This was a {operation} on the {coll_symbol} trove.
  - placeholders: `{operation}` text, `{coll_symbol}` text
- **same_block** (shared) — when the block holds more than one of the trove's events

## L5 modals

### adjust

**L5 · How adjusting a trove works**
An adjustment changes a trove without closing it. The owner can add or withdraw collateral, borrow more BOLD, or repay some of the debt.

Adding collateral or repaying makes the trove safer. Withdrawing collateral or borrowing more brings it closer to liquidation, and borrowing more adds a one-time fee. Every adjustment must leave the collateral ratio above the branch minimum (110% for WETH), or the transaction is rejected.

Adjusting doesn't change the interest rate, which is a separate action. The rate matters because it decides how early the trove is redeemed against.
Links: How do I decide on my collateral ratio? · Are there other borrowing fees? · What is a Trove?

### redemption

**L5 · How redemptions work**
Anyone holding BOLD can exchange it for $1 of collateral per BOLD. Because the swap happens at face value, bots redeem whenever BOLD trades below $1, which helps hold BOLD at its peg.

For the borrower, a redemption works like selling some collateral at the current price to repay the same amount of debt, plus a small fee kept in the trove. It isn't a loss at the time, but it leaves the owner with less exposure to the collateral's price.

Troves are redeemed in order of interest rate, lowest first, so a higher rate pushes a trove further back in the queue.

Watch this video on redemptions from Liquity to understand how they work and how to manage redemption risk. 9 min video
Links: What are redemptions? · What happens if my Trove gets redeemed? · How can I stay protected? · Is there a redemption fee?

### liquidation

**L5 · How Liquidations Work**
Troves become eligible for liquidation when the collateral ratio falls below the minimum threshold (110% for WETH, equivalent to a maximum 90.91% LTV). Once eligible, anyone can trigger a liquidation transaction.

If the Stability Pool has sufficient BOLD, it absorbs the debt and receives the collateral. Otherwise, debt and collateral are redistributed proportionally to other active borrowers in the same market.

Liquidators receive a 5% incentive on the debt cleared, plus a gas compensation of 0.0375 WETH. Any remaining collateral above what is needed to cover debt + penalty is claimable by the original borrower as surplus.
Links: How do liquidations work? · What is the liquidation threshold? · How does the Stability Pool work?

### open

**L5 · How Borrowing Works**
Liquity V2 allows users to borrow BOLD (a decentralized stablecoin) by depositing collateral into a Trove. The Trove is represented by an NFT that provides full control over the position. The interest rate set at opening determines redemption risk — higher rates provide better protection against redemptions but cost more over time.

Key concepts:
- **Collateral ratio** — the value of the collateral relative to the debt. Must stay above the liquidation threshold.
- **Interest rate** — the borrower sets the rate, or delegates it to a batch manager. Lower rates save money but increase redemption risk.
- **Upfront fee** — a one-time borrowing fee equivalent to 7 days of average interest, added to the Trove's debt.
- **Liquidation reserve** — 0.0375 ETH set aside to incentivise liquidators. Refunded when the Trove is closed.

Learn how to borrow on Liquity and manage a Trove effectively. video guide
Links: What is a Trove? · Understanding borrowing fees · What is the liquidation reserve? · How user-set interest rates work

### close

**L5 · How Closing a Trove Works**
Closing a trove repays its entire debt and returns the collateral, ending the position. The trove's NFT is burned once it closes.

Key concepts:
- **Full repayment** — closing requires repaying the whole debt — principal plus accrued interest — in BOLD.
- **Liquidation reserve** — the 0.0375 ETH gas reserve set aside when the trove opened is refunded on close.
- **Trove NFT** — the NFT representing the position is burned when the trove closes, freeing the slot.
Links: What is a Trove? · What is the liquidation reserve? · How many troves can I open with the same address?

### interest_rate

**L5 · How Interest Rates Work**
Each trove carries an annual interest rate that accrues continuously to its debt. The borrower can change the rate at any time, or delegate that to a batch manager that runs one shared rate for a group of troves.

Key concepts:
- **Who sets the rate** — the borrower sets the rate, or delegates it to a batch manager. Lower rates cost less but sit earlier in the redemption queue.
- **Continuous accrual** — interest compounds onto the principal over time rather than being charged upfront.
- **Premium on change** — changing the rate soon after the last adjustment can incur an upfront premium, discouraging rate-gaming.
Links: How do user-set interest rates work? · What are redemptions?

### delegation

**L5 · How Interest Delegation Works**
A trove can delegate interest-rate management to a batch manager — a delegate that sets one shared rate for a group of troves and charges a management fee.

Key concepts:
- **Batch manager** — a delegate that sets a single interest rate applied to every trove in its batch.
- **Management fee** — an annual fee, on top of the interest, that accrues to the debt as the delegate's compensation.
- **Joining & leaving** — a trove can join or exit a batch at any time; leaving returns rate control to the owner.
Links: What is interest-rate delegation? · How do user-set interest rates work?

### transfer

**L5 · How Trove Transfers Work**
A trove is an ERC-721 NFT, so its ownership can be transferred to another wallet like any other token.

Key concepts:
- **Trove NFT** — ownership of the position is a transferable NFT — whoever holds it controls the trove.
- **Transfer effects** — transferring the NFT hands full control of the collateral and debt to the new owner.
- **Multiple troves** — one address can hold many troves, each a separate NFT and position.
Links: How many troves can I open with the same address? · What is a Trove?

### fallback

**L5 · How Liquity V2 Troves Work**
Liquity V2 lets a borrower take out BOLD against collateral in a trove — a self-custodied position represented by an NFT.

Key concepts:
- **Trove** — the borrowing position — collateral in, BOLD out, with a collateral ratio to keep above the threshold.
- **Interest rate** — a user-set rate that accrues to the debt and sets the trove's place in the redemption queue.
- **Redemptions** — BOLD can be redeemed for collateral at face value, starting with the lowest-rate troves.
Links: What is a Trove? · How do user-set interest rates work? · What are redemptions?
