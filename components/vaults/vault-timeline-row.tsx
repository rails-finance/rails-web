"use client";

// One row in a holder's vault timeline — the shape both chains draw.
// ----------------------------------------------------------------------------
// A row is one log the vault emitted about this address. What it says is the
// same on Ethereum and on Base because the event is the same event: the action,
// the amounts with their glyphs, the date in en-GB UTC, and behind the chevron
// the three figures a `Transfer` supports — the replayed balance after it, the
// share price at its own block, and the shares it moved.
//
// Each chain keeps its OWN receipt builders: what a share price MEANS differs
// by family, and a receipt that spoke about both chains at once would be true
// about neither. So the row takes a `VaultTimelineProvKit` and the copy inside
// each receipt stays where the mechanic it describes lives. Everything else —
// the card, the spine, the grid, the day-leading date rule — is one
// implementation, because a second one would be a second grammar for one thing.
//
// WHAT A ROW REFUSES TO DRAW, on either chain:
//  1. NO LINE, NO CURVE, NO SERIES. Each row's share price is a read at a block
//     the HOLDER chose by transacting. Two of them are two receipted reads;
//     joining them would be a curve through blocks nobody chose, which is the
//     sampled series decision `0017` §6 refuses. There is no chart here and no
//     field in the row shape to draw one from.
//  2. NO USD, NO APY, NO RATE OF RETURN, NO INTEREST EARNED. Every figure is a
//     quantity of one named token.
//  3. NO NAMES. A counterparty is an address and a link to the explorer.
//  4. NO OPINIONATED COLOUR. A deposit and a withdrawal are the same KIND of
//     fact, so neither is tinted; the sign and the label carry the direction.
//
// A ZERO IS A READING. A self-transfer moves nothing and still draws a row; a
// share price the archive call did not answer is stated as unread, never as a
// dash and never as the head price.
//
// THE BALANCE IS A TRANSITION, NOT AN AFTER-STATE. Every other Rails row states
// where a figure came FROM as well as where it went, and this row can: the
// replayed balance after the log minus the log's own signed value IS the balance
// before it, exactly, with no second read and nothing modelled. So the detail
// draws `before → after`, and a row that moved nothing — a self-transfer, a
// cooldown — draws the same figure both sides, which is the reading.
//
// The BEFORE side carries its own receipt, supplied by the chain through the
// prov kit's optional `balanceBefore`. It is optional because it is a
// SUBTRACTION and what that subtraction means is the family's own: a chain
// whose kit does not carry one draws the after-state alone, exactly as this row
// did before, rather than borrowing another family's words for it.

import type { ReactNode } from "react";

import { ChainTruthRow, chainTruthDeltaValue, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import { EventCard } from "@/components/shared/event-card";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { SpineColumn, type SpineTokenRow } from "@/components/shared/spine-column";
import { DeltaToggle, StateTransition } from "@/components/shared/state-transition";
import { StatCard, assetText, shareText, shortAddress } from "@/components/protocol/morpho-base/vault-exposure-parts";
import { sharePriceText } from "@/components/vaults/aave-vault-format";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { KIND_LABEL, type VaultHolderEvent, type VaultTimelineCoords } from "@/lib/shared/vault-holder-timeline";

/** A raw integer and the number a formatter wants, from one string. Scaled here
 *  at the render edge and nowhere earlier — the row data is wei-exact. */
export const rawAmount = (s: string, decimals: number) => ({ raw: s, value: Number(s) / Math.pow(10, decimals) });

/** The four receipts every row carries, whichever chain drew it. Each chain
 *  supplies its own: the calls are the same calls, but what they MEAN is the
 *  family's own mechanic and belongs beside it. */
export interface VaultTimelineProvKit {
  shares: (coords: VaultTimelineCoords, kind: VaultHolderEvent["kind"]) => Provenance;
  balanceAfter: (coords: VaultTimelineCoords) => Provenance;
  /** The balance BEFORE this log — `balanceAfter` less the log's own signed
   *  value. Supply it and the row states the transition; omit it and the row
   *  states the after-state alone. See the file header on why it is optional. */
  balanceBefore?: (coords: VaultTimelineCoords) => Provenance;
  assets: (coords: VaultTimelineCoords, kind: "deposit" | "withdrawal") => Provenance;
  sharePrice: (coords: VaultTimelineCoords, shareDecimals: number) => Provenance;
}

export interface VaultTimelineRowProps {
  event: VaultHolderEvent;
  /** The PAGE's coordinates. The row narrows them to its own block and
   *  transaction before any receipt is built. */
  coords: VaultTimelineCoords;
  chainId: ChainId;
  shareUnit: string;
  assetSymbol: string;
  vaultAddress: string;
  isLast: boolean;
  /** The newest row — the head of the list, which draws the pulsing dot above
   *  it. Rows run newest first, so this is the row at index 0. */
  isFirst: boolean;
  /** This row's 1-based place in the position's WHOLE history, chronological
   *  and stable across a sort flip — the badge the display menu's "Event
   *  numbers" reveals. Omitted, no badge is drawn. */
  eventNumber?: number;
  prov: VaultTimelineProvKit;
  /** A family's own full-width instrument under the header, inside the header
   *  panel — the `EventCard` slot whose grid lines up with the detail grid.
   *  Ethereum's families have none; MetaMorpho draws its allocation band here. */
  headerBars?: ReactNode;
  /** Where a family's own figure joins the row's stat grid. */
  detailCards?: (rowCoords: VaultTimelineCoords) => ReactNode;
  /** Where a family's own sentence joins the row's detail panel, under the
   *  standard paragraphs. */
  detailNotes?: (rowCoords: VaultTimelineCoords) => ReactNode;
  /** The spine glyph where the row moves no shares and there is no flow to
   *  draw. Left undefined, the spine draws the token rows. */
  icon?: "extend" | "no-change";
  /** Namespaces the open/closed memory of a card so two chains' rows cannot
   *  collide on one reader's machine. */
  persistPrefix: string;
}

export function VaultTimelineRow({
  event,
  coords,
  chainId,
  shareUnit,
  assetSymbol,
  vaultAddress,
  isLast,
  isFirst,
  eventNumber,
  prov,
  headerBars,
  detailCards,
  detailNotes,
  icon,
  persistPrefix,
}: VaultTimelineRowProps) {
  // Each row's receipts name THAT row's block and transaction, not the page's.
  const rowCoords: VaultTimelineCoords = { ...coords, blockNumber: event.blockNumber, txHash: event.txHash };
  const sd = event.shareDecimals;
  const ad = event.assetDecimals;
  const deltaValue = Number(event.sharesDelta) / Math.pow(10, sd);
  const isDeposit = event.kind === "deposit";
  const isWithdrawal = event.kind === "withdrawal";
  // A share transfer to or from another address is a custody move: the share
  // row wears the paper-plane badge and no flank (the flanks are "out to the
  // wallet" and "into the vault", and this is neither), and the header states
  // the amount and the counterparty. A self-transfer moved nothing and keeps
  // its "no change" glyph.
  const isTransfer = event.kind === "transfer-in" || event.kind === "transfer-out";
  const movesShares = event.kind !== "cooldown";

  const deltas: ChainTruthDelta[] = [];
  const tokens: SpineTokenRow[] = [];

  // The asset leg leads, where the contract emitted one: it is what the holder
  // actually put in or took out, in the token they think in.
  if (event.assets && (isDeposit || isWithdrawal)) {
    const value = (isDeposit ? 1 : -1) * (Number(event.assets) / Math.pow(10, ad));
    const info = prov.assets(rowCoords, isDeposit ? "deposit" : "withdrawal");
    deltas.push({ value, symbol: assetSymbol, prov: info });
    tokens.push({
      symbol: assetSymbol,
      direction: isDeposit ? "right" : "left",
      value: Math.abs(value),
      prov: { info, value: chainTruthDeltaValue(value, false), symbol: assetSymbol },
    });
  }

  if (movesShares) {
    const info = prov.shares(rowCoords, event.kind);
    deltas.push({ value: deltaValue, symbol: shareUnit, prov: info });
    tokens.push(
      isTransfer
        ? { symbol: shareUnit, address: vaultAddress, badge: "send" }
        : {
            symbol: shareUnit,
            address: vaultAddress,
            direction: deltaValue < 0 ? "right" : "left",
            value: Math.abs(deltaValue),
            prov: { info, value: chainTruthDeltaValue(deltaValue, false), symbol: shareUnit },
          },
    );
  }

  // The counterparty of a transfer, as the address alone (rule 3 above: no
  // names here). Its receipt is the log's own — the same Transfer the shares
  // figure is read from.
  const party =
    isTransfer && event.counterparty
      ? {
          prefix: event.kind === "transfer-out" ? "to" : "from",
          address: event.counterparty,
          prov: prov.shares(rowCoords, event.kind),
        }
      : undefined;

  return (
    <EventCard
      avatar={null}
      iconColumn={
        <SpineColumn tokens={tokens.length ? tokens : undefined} icon={icon} isFirst={isFirst} isLast={isLast} />
      }
      header={
        <ChainTruthRow
          spec={{ label: KIND_LABEL[event.kind], custody: isTransfer, deltas, party }}
          timestamp={event.timestamp}
          eventNumber={eventNumber}
        />
      }
      headerBars={headerBars}
      detail={
        <RowDetail
          event={event}
          coords={rowCoords}
          chainId={chainId}
          shareUnit={shareUnit}
          assetSymbol={assetSymbol}
          prov={prov}
          detailCards={detailCards}
          detailNotes={detailNotes}
        />
      }
      detailLabel="What the chain recorded"
      explainer={<RowExplainer event={event} shareUnit={shareUnit} assetSymbol={assetSymbol} />}
      explainerLabel="Plain English"
      txHash={event.txHash}
      persistKey={`${persistPrefix}:${vaultAddress}:${event.id}`}
    />
  );
}

function RowDetail({
  event,
  coords,
  chainId,
  shareUnit,
  assetSymbol,
  prov,
  detailCards,
  detailNotes,
}: {
  event: VaultHolderEvent;
  coords: VaultTimelineCoords;
  chainId: ChainId;
  shareUnit: string;
  assetSymbol: string;
  prov: VaultTimelineProvKit;
  detailCards?: (rowCoords: VaultTimelineCoords) => ReactNode;
  detailNotes?: (rowCoords: VaultTimelineCoords) => ReactNode;
}) {
  const sd = event.shareDecimals;
  const ad = event.assetDecimals;
  // The before side, exactly: the replay position after this log less the log's
  // own signed value. Integer arithmetic on two figures the row already
  // carries — no second read, and nothing inferred.
  const balanceBeforeRaw = (BigInt(event.balanceAfter) - BigInt(event.sharesDelta)).toString();
  return (
    <div
      className="px-5 pb-4"
      data-row-kind={event.kind}
      data-row-block={event.blockNumber}
      data-row-balance-before={balanceBeforeRaw}
      data-row-balance-after={event.balanceAfter}
      data-row-shares-delta={event.sharesDelta}
      // RAW, so a verifier checks this row wei-exact rather than checking a
      // formatted figure — the rule every vault verifier holds to. The empty
      // string is the UNREAD marker and is distinct from "0": an archive call
      // that did not answer and a price of nothing are different facts, and the
      // panel above says so in words too.
      data-row-share-price={event.sharePriceAtBlock ?? ""}
      data-row-assets={event.assets ?? ""}
    >
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={`Balance · ${shareUnit}`}
          figure="row-balance-after"
          note="Replayed from this address's own transfers up to and including this log — not a call at this block. The figure on the left is the same replay one log earlier."
        >
          {prov.balanceBefore ? (
            <StateTransition>
              {/* `delta={null}`: the arrow stays a plain glyph rather than a
                  toggle. The change this row made is the "Shares moved" card
                  beside this one, with its own receipt, and a second statement
                  of it here would be the same figure twice in one panel. */}
              <DeltaToggle
                size="sm"
                delta={null}
                before={<Prov info={prov.balanceBefore(coords)}>{shareText(rawAmount(balanceBeforeRaw, sd), sd)}</Prov>}
              />
              <Prov info={prov.balanceAfter(coords)}>{shareText(rawAmount(event.balanceAfter, sd), sd)}</Prov>
            </StateTransition>
          ) : (
            <Prov info={prov.balanceAfter(coords)}>{shareText(rawAmount(event.balanceAfter, sd), sd)}</Prov>
          )}
        </StatCard>
        <StatCard
          label={`Share price at this block · ${assetSymbol}`}
          figure="row-share-price"
          note={`convertToAssets(10^${sd}) at block ${event.blockNumber.toLocaleString("en-US")} — the block this address's own transaction landed in.`}
        >
          {event.sharePriceAtBlock ? (
            <Prov info={prov.sharePrice(coords, sd)}>{sharePriceText(rawAmount(event.sharePriceAtBlock, ad), ad)}</Prov>
          ) : (
            <span className="text-base font-normal text-rb-500">not read</span>
          )}
        </StatCard>
        <StatCard
          label={`Shares moved · ${shareUnit}`}
          figure="row-shares-delta"
          note={
            event.kind === "cooldown"
              ? "This transaction carried no transfer of this address's shares — starting a cooldown moves none. The balance beside it is unchanged by it."
              : event.kind === "transfer-self"
                ? "Both ends of the transfer are this same address, so the balance did not move. The action still happened."
                : "The value word of this row's own Transfer log, in the share token's own units."
          }
        >
          {event.kind === "cooldown" ? (
            <span className="text-base font-normal text-rb-500">none</span>
          ) : (
            <Prov info={prov.shares(coords, event.kind)}>{shareText(rawAmount(event.sharesDelta, sd), sd)}</Prov>
          )}
        </StatCard>
        {detailCards?.(coords)}
      </div>

      {(event.kind === "deposit" || event.kind === "withdrawal") && (
        <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-rb-500" data-figure="row-asset-leg">
          {event.assets ? (
            <>
              The vault stated the other leg itself:{" "}
              <Prov info={prov.assets(coords, event.kind === "deposit" ? "deposit" : "withdrawal")}>
                {assetText(rawAmount(event.assets, ad), ad)} {assetSymbol}
              </Prov>{" "}
              in the ERC-4626 <code>{event.kind === "deposit" ? "Deposit" : "Withdraw"}</code> event of this same
              transaction. It is the contract&rsquo;s own figure, not these shares multiplied by a share price. This
              address&rsquo;s own leg is what is stated here; the transaction may have moved other shares too.
            </>
          ) : (
            <>
              The vault emitted no ERC-4626 <code>{event.kind === "deposit" ? "Deposit" : "Withdraw"}</code> event for
              this address in this transaction, so no asset leg is stated. The shares above are the reading; a figure
              divided out of them would not be the contract&rsquo;s word for what moved.
            </>
          )}
        </p>
      )}

      {event.counterparty && (
        <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-rb-500" data-figure="row-counterparty">
          The other end of the transfer was{" "}
          <a
            href={explorerUrl(chainId, "address", event.counterparty)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-muted font-mono"
          >
            {shortAddress(event.counterparty)}
          </a>
          . An address, and nothing more — this page does not say who it is.
        </p>
      )}

      {detailNotes?.(coords)}
    </div>
  );
}

/** The house explainer, and it is chain-neutral on purpose: what a mint IS on a
 *  share token does not change with the chain it happened on. */
function RowExplainer({
  event,
  shareUnit,
  assetSymbol,
}: {
  event: VaultHolderEvent;
  shareUnit: string;
  assetSymbol: string;
}) {
  const line = (() => {
    switch (event.kind) {
      case "deposit":
        return `The vault minted ${shareUnit} to this address. A mint is what a deposit looks like on the share token: the shares did not come from another holder, they came into existence, and the ${assetSymbol} leg went the other way in the same transaction.`;
      case "withdrawal":
        return `The vault burned this address's ${shareUnit}. A burn is what a withdrawal looks like on the share token: the shares left existence rather than passing to anyone, and the ${assetSymbol} leg came back in the same transaction.`;
      case "transfer-in":
        return `Another address sent this one ${shareUnit}. Nothing was deposited: the shares already existed and changed hands, so the vault's own total supply did not move and no asset leg was emitted.`;
      case "transfer-out":
        return `This address sent ${shareUnit} to another. Nothing was withdrawn: the shares changed hands rather than being redeemed, so the vault's total supply did not move and no asset leg was emitted.`;
      case "transfer-self":
        return `A transfer whose two ends are the same address. The balance is the same after it as before, and the row is here because the action is on the chain — a zero is a reading.`;
      case "cooldown":
        return `This address started a cooldown on the stake token, in a transaction that moved no shares. A stake token keeps one cooldown record per address at a time: starting a new one replaces the old, and an outgoing transfer decays it.`;
    }
  })();
  return (
    <div className="px-5 pb-4">
      <p className="max-w-3xl text-[13px] leading-relaxed text-rb-500">{line}</p>
      <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-rb-500">
        The share price on this row was read at block {event.blockNumber.toLocaleString("en-US")} — the block this
        transaction landed in. It says nothing about the blocks before or after it, and this page draws no line between
        one row&rsquo;s price and the next.
      </p>
    </div>
  );
}
