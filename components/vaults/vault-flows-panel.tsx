"use client";

// The Lifetime flows panel on a vault holder page (Aave vaults, Yearn, Morpho
// vaults on Base): the shared `LifetimeFlowsPanel` over the holder's whole
// history in the vault's asset (lib/vaults/vault-flows.ts), with the
// Explanation of what was summed.
//
// THE PANEL HOLDS NO REDUCER. The server half of the page runs
// `computeVaultPositionEconomics` (the gate and the exact share and asset sums)
// and `vaultFlowTimeline` (the day rows) over the WHOLE life; the rows the
// timeline draws are capped at `VAULT_TIMELINE_DRAW_ROWS`, so a panel that
// summed what the client holds would state a window under a lifetime's
// caption. Both answer on the server, and the panel is drawn only where the
// gate passed (`computed` non-null).

import type { ReactNode } from "react";

import { LifetimeFlowsPanel } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { vaultFlowsContent } from "@/lib/shared/learn-more-content";
import type { VaultPositionEconomics, VaultPositionFlows } from "@/lib/aave-vaults/position-economics";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import { AmountText } from "@/components/shared/amount-text";
import { formatCompact } from "@/lib/shared/format-compact";

/** The figures behind the share and asset sums, as the feeder has them. */
const sum = (xs: number[]): string => String(xs.reduce((a, b) => a + b, 0));

export interface VaultFlowsPanelProps {
  /** `computeVaultPositionEconomics` over the WHOLE life, run on the server.
   *  Null wherever the timeline drew nothing, and then nothing is drawn here. */
  computed: VaultPositionEconomics | null;
  /** `vaultFlowTimeline` over the same life, run on the server. */
  timeline: FlowTimeline | null;
  /** The address the panel is about, for the surface's data attribute. */
  holder: string;
  /** The block every figure on this page was read at. */
  blockNumber: number;
  /** `balanceOf` and `convertToAssets(balanceOf)` at that block, raw. */
  sharesRaw: string;
  claimRaw: string | null;
  shareSymbol: string;
  assetSymbol: string;
}

export function VaultFlowsPanel(props: VaultFlowsPanelProps) {
  if (!props.computed || !props.timeline) return null;
  const { data, flows } = props.computed;
  const total = flows.counts.mints + flows.counts.burns + flows.counts.transfersIn + flows.counts.transfersOut;

  return (
    <div
      className="mb-6"
      // The hooks the vault verifiers read, wei-exact: the raw sums, and the
      // figures the feeder bucketed them into.
      data-vault-flows-tower={props.holder}
      data-minted-raw={flows.mintedShares.toString()}
      data-burned-raw={flows.burnedShares.toString()}
      data-transferred-in-raw={flows.transferredInShares.toString()}
      data-transferred-out-raw={flows.transferredOutShares.toString()}
      data-deposited-assets-raw={flows.depositedAssets.toString()}
      data-withdrawn-assets-raw={flows.withdrawnAssets.toString()}
      data-shares-now-raw={props.sharesRaw}
      data-claim-now-raw={props.claimRaw ?? ""}
      data-assetless-rows={flows.counts.assetlessTransfers}
      data-tower-minted={sum([data.debt.lifetimeInflow])}
      data-tower-received={sum((data.debt.received ?? []).map((l) => l.amount))}
      data-tower-burned={sum(data.debt.exited.filter((l) => l.key === "shares-burned").map((l) => l.amount))}
      data-tower-transferred-out={sum(data.debt.exited.filter((l) => l.key === "shares-out").map((l) => l.amount))}
      data-tower-shares-now={sum(data.debt.current.map((l) => l.amount))}
      data-tower-deposited={sum([data.collateral.lifetimeInflow])}
      data-tower-withdrawn={sum(data.collateral.exited.map((l) => l.amount))}
      data-tower-claim-now={sum(data.collateral.current.map((l) => l.amount))}
    >
      <LifetimeFlowsPanel
        read="done"
        explanation={vaultFlowsExplanation(flows, props, total)}
        learnMore={vaultFlowsContent(props.assetSymbol, props.shareSymbol)}
        scrubber={<LifetimeFlowsScrubber timeline={props.timeline} />}
      />
    </div>
  );
}

// ── the Explanation pane ─────────────────────────────────────────────────────

function Fig({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground tabular-nums">{children}</span>;
}

const amountText = (v: number, symbol: string) => `${formatCompact(v)} ${symbol}`;

/** What was summed: a lead, then bullets built from the feeder's exact sums.
 *  Facts only. */
function vaultFlowsExplanation(flows: VaultPositionFlows, input: VaultFlowsPanelProps, total: number): ReactNode {
  const assetSym = input.assetSymbol;
  const shareSym = input.shareSymbol;
  const blockNumber = input.blockNumber;
  const { data } = input.computed!;
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
      The vault&rsquo;s events record <Fig>{amountText(deposited, assetSym)}</Fig> deposited across{" "}
      <AmountText value={flows.counts.mints} /> mint{flows.counts.mints === 1 ? "" : "s"}
      {withdrawn > 0 && (
        <>
          {" "}
          and <Fig>{amountText(withdrawn, assetSym)}</Fig> withdrawn across <AmountText value={flows.counts.burns} />{" "}
          burn
          {flows.counts.burns === 1 ? "" : "s"}
        </>
      )}
      , the <code>assets</code> word of the ERC-4626 events.
    </span>,
  );

  items.push(
    <span key="claim">
      {claim > 0 ? (
        <>
          The shares held now convert to <Fig>{amountText(claim, assetSym)}</Fig>, the vault&rsquo;s{" "}
          <code>convertToAssets</code> of this balance at block {blockNumber.toLocaleString("en-US")}.
        </>
      ) : (
        <>This address holds no shares at block {blockNumber.toLocaleString("en-US")}, so no claim is stated.</>
      )}
    </span>,
  );

  items.push(
    <span key="shares">
      The share ledger adds up to the wei: <Fig>{amountText(minted, shareSym)}</Fig> minted
      {inShares > 0 && (
        <>
          {" "}
          plus <Fig>{amountText(inShares, shareSym)}</Fig> transferred in
        </>
      )}
      , less what was burned
      {outShares > 0 && <> and the {amountText(outShares, shareSym)} transferred out</>}, is the{" "}
      <Fig>{amountText(sharesNow, shareSym)}</Fig> the vault&rsquo;s <code>balanceOf</code> reports at that block.
    </span>,
  );

  if (flows.counts.assetlessTransfers > 0)
    items.push(
      <span key="assetless">
        <AmountText value={flows.counts.assetlessTransfers} /> row
        {flows.counts.assetlessTransfers === 1 ? " moved" : "s moved"} shares only; the bar values{" "}
        {flows.counts.assetlessTransfers === 1 ? "its" : "their"} shares at the vault&rsquo;s share price at{" "}
        {flows.counts.assetlessTransfers === 1 ? "its" : "each"} block.
      </span>,
    );

  if (flows.counts.legless > 0)
    items.push(
      <span key="legless">
        <AmountText value={flows.counts.legless} /> mint or burn carried no ERC-4626 event naming this address: it is in
        the share totals and in no asset total above, and the bar values its shares at the share price at its block.
      </span>,
    );

  return (
    <div className="space-y-2 text-sm text-rb-500">
      {/* WHAT WAS SUMMED, not what is painted: the timeline below hands the
          browser at most `VAULT_TIMELINE_DRAW_ROWS` rows of a long life. */}
      <p className="leading-relaxed">
        These totals are summed over all <AmountText value={total} /> share movement{total === 1 ? "" : "s"} in this
        address&rsquo;s history in the vault.
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
