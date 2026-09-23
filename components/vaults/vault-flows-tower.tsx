"use client";

// The lifetime flows of ONE vault position — the shared tower, fed by
// lib/aave-vaults/position-economics.ts, plus the Explanation that narrates it.
//
// WHY THIS FILE EXISTS AND THE FEEDER DOES NOT DRAW. The tower's data is a
// reduction over BigInt sums and belongs in `lib/`; the Explanation is JSX and
// belongs beside the component that renders it. Every other feeder in the tier
// splits the two the same way (`lib/<proto>/economics.ts` +
// `<proto>EconomicsExplanation`).
//
// ⚠️⚠️ THIS COMPONENT HOLDS NO REDUCER, AND MUST NOT. It is handed the feeder's
// already-computed `{data, flows}` by the SERVER half of the page, which runs
// `computeVaultPositionEconomics` over the WHOLE life. The rows this page's
// timeline draws are capped at `VAULT_TIMELINE_DRAW_ROWS` — a life of nine thousand rows
// hands the client one thousand — so a tower that summed what it was given
// would state a window's arithmetic under a caption reading "Lifetime flows".
// Keeping the reducer out of reach is what makes that impossible rather than
// merely discouraged.
//
// THE TOWER IS DRAWN UNDER EXACTLY THE CONDITION THE ROWS ARE. The feeder
// answers null on every path the timeline refused — a read that did not answer,
// a gate that did not pass, a life above what the store holds, a life still
// being built — and this component then renders nothing rather than an empty
// frame. A tower beside a withheld timeline would be a whole-life claim about a
// life the page just declined to draw.
//
// NO USD, NO RATE, NO YIELD. The two sides are in the two tokens' own units and
// are not height-comparable; the shared tower says so, and the Explanation's
// last bullet says why no figure spans the blocks between a row and the page's
// block.

import type { ReactNode } from "react";

import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { aaveVaultFlowsContent } from "@/lib/shared/learn-more-content";
import type { VaultPositionEconomics, VaultPositionFlows } from "@/lib/aave-vaults/position-economics";
import type { ChainTruthTowerData } from "@/lib/shared/chain-truth-economics";
import { formatCompact, formatNumber } from "@/lib/utils/format";

/** The figures behind the bars, as the bars have them: token units, summed
 *  after the feeder's bucketing. */
const sum = (xs: number[]): string => String(xs.reduce((a, b) => a + b, 0));

/** What the tower RENDERS — the feeder's answer, and the six words and figures
 *  the Explanation states beside it. No rows: this component is never given a
 *  life to sum, which is the point of it. */
export interface VaultFlowsTowerProps {
  /** `computeVaultPositionEconomics` over the WHOLE life, run on the server.
   *  Null wherever the timeline drew nothing, and then nothing is drawn here. */
  computed: VaultPositionEconomics | null;
  /** The address the tower is about, for the surface's own data attribute. */
  holder: string;
  /** The block every figure on this page was read at. */
  blockNumber: number;
  /** `balanceOf` and `convertToAssets(balanceOf)` at that block, raw — stated
   *  on the surface so a check here is wei-exact rather than on formatted
   *  cents. */
  sharesRaw: string;
  claimRaw: string | null;
  shareSymbol: string;
  assetSymbol: string;
}

export function VaultFlowsTower(props: VaultFlowsTowerProps) {
  if (!props.computed) return null;
  const { data, flows } = props.computed;
  const total = flows.counts.mints + flows.counts.burns + flows.counts.transfersIn + flows.counts.transfersOut;

  return (
    <div
      className="mb-6"
      data-skel-section="vault-flows-tower"
      data-vault-flows-tower={props.holder}
      // Raw, so a check on this surface is wei-exact rather than a check on
      // formatted cents — the rule both existing vault verifiers hold to.
      data-minted-raw={flows.mintedShares.toString()}
      data-burned-raw={flows.burnedShares.toString()}
      data-transferred-in-raw={flows.transferredInShares.toString()}
      data-transferred-out-raw={flows.transferredOutShares.toString()}
      data-deposited-assets-raw={flows.depositedAssets.toString()}
      data-withdrawn-assets-raw={flows.withdrawnAssets.toString()}
      data-shares-now-raw={props.sharesRaw}
      data-claim-now-raw={props.claimRaw ?? ""}
      data-assetless-rows={flows.counts.assetlessTransfers}
      // …and the figures the BARS are actually drawn from, which is a different
      // claim from the sums above: these come out of the feeder, after the
      // decision about which bucket each flow belongs in. A build that summed
      // transfers into the minted bar would leave the raw sums untouched and
      // move only these, so a check on the raw ones alone could not see it.
      data-tower-minted={sum([data.debt.lifetimeInflow])}
      data-tower-received={sum((data.debt.received ?? []).map((l) => l.amount))}
      data-tower-burned={sum(data.debt.exited.filter((l) => l.key === "shares-burned").map((l) => l.amount))}
      data-tower-transferred-out={sum(data.debt.exited.filter((l) => l.key === "shares-out").map((l) => l.amount))}
      data-tower-shares-now={sum(data.debt.current.map((l) => l.amount))}
      data-tower-deposited={sum([data.collateral.lifetimeInflow])}
      data-tower-withdrawn={sum(data.collateral.exited.map((l) => l.amount))}
      data-tower-claim-now={sum(data.collateral.current.map((l) => l.amount))}
    >
      <ChainTruthTower
        data={data}
        title="Lifetime flows"
        explanation={vaultPositionEconomicsExplanation(data, flows, props, total)}
        learnMore={aaveVaultFlowsContent(props.assetSymbol, props.shareSymbol)}
      />
    </div>
  );
}

// ── the Explanation pane ─────────────────────────────────────────────────────

function Fig({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground tabular-nums">{children}</span>;
}

const amountText = (v: number, symbol: string) => `${formatCompact(v)} ${symbol}`;

/** The V2/V4 grammar: a lead that says what was summed, then bullets built from
 *  the same figures the bars draw. Facts only — every sentence is a count, a
 *  sum, a call or a refusal, and none of them advises. */
function vaultPositionEconomicsExplanation(
  data: ChainTruthTowerData,
  flows: VaultPositionFlows,
  input: VaultFlowsTowerProps,
  total: number,
): ReactNode {
  const assetSym = input.assetSymbol;
  const shareSym = input.shareSymbol;
  const blockNumber = input.blockNumber;
  const deposited = data.collateral.lifetimeInflow;
  const withdrawn = data.collateral.exited.reduce((s, l) => s + l.amount, 0);
  const claim = data.collateral.current.reduce((s, l) => s + l.amount, 0);
  const minted = data.debt.lifetimeInflow;
  const inShares = (data.debt.received ?? []).reduce((s, l) => s + l.amount, 0);
  const outShares = data.debt.exited.filter((l) => l.key === "shares-out").reduce((s, l) => s + l.amount, 0);
  const sharesNow = data.debt.current.reduce((s, l) => s + l.amount, 0);

  const items: ReactNode[] = [];

  items.push(
    <span key="assets">
      The vault&rsquo;s own events record <Fig>{amountText(deposited, assetSym)}</Fig> deposited across{" "}
      {formatNumber(flows.counts.mints)} mint{flows.counts.mints === 1 ? "" : "s"}
      {withdrawn > 0 && (
        <>
          {" "}
          and <Fig>{amountText(withdrawn, assetSym)}</Fig> withdrawn across {formatNumber(flows.counts.burns)} burn
          {flows.counts.burns === 1 ? "" : "s"}
        </>
      )}
      . Both are the <code>assets</code> word of the ERC-4626 events themselves.
    </span>,
  );

  items.push(
    <span key="claim">
      {claim > 0 ? (
        <>
          The shares held now convert to <Fig>{amountText(claim, assetSym)}</Fig> — the vault&rsquo;s own{" "}
          <code>convertToAssets</code> of this exact balance at block {blockNumber.toLocaleString("en-US")}.
        </>
      ) : (
        <>
          This address holds no shares at block {blockNumber.toLocaleString("en-US")}, so there is no balance to convert
          and no claim is stated.
        </>
      )}
    </span>,
  );

  items.push(
    <span key="shares">
      The share ledger adds up wei-exact: <Fig>{amountText(minted, shareSym)}</Fig> minted
      {inShares > 0 && (
        <>
          {" "}
          plus <Fig>{amountText(inShares, shareSym)}</Fig> transferred in
        </>
      )}
      , less what was burned
      {outShares > 0 && <> and the {amountText(outShares, shareSym)} transferred out</>}, is the{" "}
      <Fig>{amountText(sharesNow, shareSym)}</Fig> the vault&rsquo;s own <code>balanceOf</code> reports at that block.
    </span>,
  );

  if (flows.counts.assetlessTransfers > 0)
    items.push(
      <span key="assetless">
        {formatNumber(flows.counts.assetlessTransfers)} row
        {flows.counts.assetlessTransfers === 1 ? " moved" : "s moved"} shares only; no asset word was emitted for{" "}
        {flows.counts.assetlessTransfers === 1 ? "it" : "them"}, so nothing on the asset side counts{" "}
        {flows.counts.assetlessTransfers === 1 ? "it" : "them"} and no share of it is converted.
      </span>,
    );

  if (flows.counts.legless > 0)
    items.push(
      <span key="legless">
        {formatNumber(flows.counts.legless)} mint or burn carried no ERC-4626 event naming this address, so its shares
        are in the share totals and its assets are in no total at all.
      </span>,
    );

  items.push(
    <span key="no-rate">
      No rate, no yield and no profit or loss is drawn. The deposits and withdrawals are the contract&rsquo;s words at
      the blocks they happened at and the claim is its word now; nothing was read between those blocks, so a figure
      spanning them would be a line through blocks nobody chose.
    </span>,
  );

  return (
    <div className="space-y-2 text-sm text-rb-500">
      {/* WHAT WAS SUMMED, not what is painted. The timeline below hands the
          browser at most `VAULT_TIMELINE_DRAW_ROWS` rows of a long life, so naming the drawn
          set here would state a smaller number than these totals were reduced
          over. The set is this address's whole history in the vault, and the
          sentence says exactly that. */}
      <p className="leading-relaxed">
        These totals are summed over all {formatNumber(total)} share movement{total === 1 ? "" : "s"} in this
        address&rsquo;s history in the vault, each in its own token&rsquo;s units. The two sides are different tokens,
        so their heights are not comparable.
      </p>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 leading-relaxed">
          <span className="select-none text-rb-500">&bull;</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}
