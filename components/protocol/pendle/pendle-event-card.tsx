"use client";

// One Pendle router event on the shared event-card shell (event-card.tsx). On a
// wallet page the legs are the wallet's side (received positive, paid
// negative); on a market page the event's own side (positive to the receiver,
// negative from the caller). T1 the verb and the legs on the spine's flanks;
// T2 each leg, the asset value at the SY's exchange rate at the event's block,
// the trade's fixed APY where it priced PT, and the router; T3 the event in
// words.

import Link from "next/link";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { PendleTokenIcon, type PendleTokenKind } from "@/components/protocol/pendle/pendle-token-icon";
import { pendleWalletHref } from "@/lib/pendle/routes";
import type { EventCellSpec } from "@/components/shared/event-cells";
import type { SpineColumnProps, SpineTokenRow } from "@/components/shared/spine-column";
import { AssetPopover } from "@/components/shared/asset-popover";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { explorerUrl } from "@/lib/shared/chains";
import {
  KIND_LABEL,
  PENDLE_CHAIN_ID,
  ROUTER_NAME,
  amountText,
  apyText,
  assetDecimals,
  assetSymbol,
  exact,
  legToken,
  shortAddress,
  symbolOf,
  units,
} from "@/lib/pendle/format";
import { eventAssetProv, legProv, tradeApyProv } from "@/lib/pendle/provenance";
import type {
  PendleMarketTokens,
  PendleRole,
  PendleTimelineRow,
  PendleToken,
  PendleTokenMeta,
} from "@/lib/pendle/types";

const ROLE_WORDS: Record<PendleRole, string> = {
  caller: "The wallet called the router; another address received.",
  receiver: "Another address called the router; this wallet received.",
  both: "The wallet called the router and received.",
  "router-hop": "A step inside a transaction this wallet sent, between two router calls.",
  maker: "This wallet's limit order was filled.",
  taker: "This wallet filled another's limit order.",
};

function TokenIcon({ tok, kind, tokens }: { tok: PendleToken; kind: string; tokens: PendleMarketTokens | null }) {
  return (
    <AssetPopover symbol={symbolOf(tok)} address={tok.address}>
      {tokens && kind !== "token" ? (
        <PendleTokenIcon kind={kind as PendleTokenKind} tokens={tokens} size={16} />
      ) : (
        <TokenChipIcon symbol={tok.symbol ?? ""} address={tok.address} size={16} filterable={false} untitled />
      )}
    </AssetPopover>
  );
}

/** The event's verb: a zero-price-impact add (the KeepYt events) names the YT it keeps. */
export function eventLabel(row: Pick<PendleTimelineRow, "kind" | "event">): string {
  return /KeepYt$/.test(row.event) ? "Add liquidity, keep YT" : KIND_LABEL[row.kind];
}

const STAMP: Record<string, string> = { pt: "PT", yt: "YT", lp: "LP", sy: "SY" };

export function PendleEventCard({
  row,
  tokens,
  meta,
  side,
  isLast,
  eventNumber,
  parties,
}: {
  row: PendleTimelineRow;
  tokens: PendleMarketTokens | null;
  meta: Record<string, PendleTokenMeta>;
  side: "wallet" | "market";
  isLast: boolean;
  eventNumber?: number;
  /** A market page's caller and receiver. */
  parties?: { caller: string | null; receiver: string | null };
}) {
  const id = `${row.txHash}-${row.logIndex}`;
  // The wallet a market row names: the receiver, which on a limit fill is the maker.
  const wallet = side === "market" ? (parties?.receiver ?? null) : null;
  const legs = row.legs
    .filter((l) => l.amount !== "0")
    .map((l) => ({ l, tok: legToken(l.leg, l.token, tokens, meta) }))
    .filter((x): x is { l: (typeof row.legs)[number]; tok: PendleToken } => x.tok != null);

  const spineRows: SpineTokenRow[] = legs.slice(0, 3).map(({ l, tok }) => {
    const n = units(l.amount.replace(/^-/, ""), tok.decimals);
    // A market token wears the yield token's mark, its kind as the unit.
    const own = l.leg !== "token" && tokens;
    return {
      symbol: tok.symbol ?? "",
      iconSymbol: own ? (tokens.yieldToken.symbol ?? undefined) : undefined,
      address: own ? tokens.yieldToken.address : tok.address,
      direction: l.amount.startsWith("-") ? "right" : "left",
      popover: true,
      value: n ?? undefined,
      unit: own ? STAMP[l.leg] : (tok.symbol ?? undefined),
    };
  });
  const spine: SpineColumnProps = { tokens: spineRows, isLast };

  const into = side === "wallet" ? ["Received", "Paid"] : ["To the receiver", "From the caller"];
  const cells: EventCellSpec[] = legs.map(({ l, tok }) => {
    const out = l.amount.startsWith("-");
    const raw = out ? l.amount.slice(1) : l.amount;
    return {
      kind: "stat",
      key: `${l.leg}:${tok.address}`,
      label: `${out ? into[1] : into[0]} ${l.leg === "token" ? "" : l.leg.toUpperCase()}`.trim(),
      changed: true,
      figure: `pendle-${l.leg}`,
      value: {
        after: {
          text: `${amountText(raw, tok.decimals)} ${symbolOf(tok)}`,
          info: legProv(row, tok, raw),
          value: exact(raw, tok.decimals) ?? raw,
        },
        chip: <TokenIcon tok={tok} kind={l.leg} tokens={tokens} />,
      },
    };
  });
  const asset = tokens ? assetSymbol(tokens) : null;
  if (tokens && row.asset != null) {
    const raw = row.asset.replace(/^-/, "");
    cells.push({
      kind: "stat",
      key: "asset",
      label: `Value in ${asset}`,
      changed: false,
      figure: "pendle-asset",
      value: {
        after: {
          text: `${amountText(raw, assetDecimals(tokens))} ${asset}`,
          info: eventAssetProv(row, asset!),
          value: exact(raw, assetDecimals(tokens)) ?? raw,
        },
      },
    });
  }
  if (row.impliedApy != null)
    cells.push({
      kind: "stat",
      key: "apy",
      label: "Fixed APY of the trade",
      changed: false,
      value: { after: { text: apyText(row.impliedApy), info: tradeApyProv(row), value: row.impliedApy.toFixed(6) } },
    });
  const router = ROUTER_NAME[row.router];
  cells.push({
    kind: "stat",
    key: "router",
    label: "Router",
    changed: false,
    value: {
      lines: [
        <a
          key="r"
          href={explorerUrl(PENDLE_CHAIN_ID, "address", router.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-muted text-xs"
        >
          {router.name} ↗
        </a>,
        <span key="e" className="text-xs text-rb-500">
          {row.event}
        </span>,
      ],
    },
    sub: [{ content: side === "wallet" ? ROLE_WORDS[row.role] : partyWords(parties) }],
  });

  const words = legs.map(({ l, tok }) => {
    const out = l.amount.startsWith("-");
    return { out, text: `${amountText(out ? l.amount.slice(1) : l.amount, tok.decimals)} ${symbolOf(tok)}` };
  });
  const paid = words.filter((w) => w.out).map((w) => w.text);
  const got = words.filter((w) => !w.out).map((w) => w.text);
  const list = (xs: string[]) =>
    xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

  const slots: EventCardSlots = {
    event: {
      id,
      family: "pendle",
      txHash: row.txHash,
      blockNumber: row.block,
      timestamp: row.timestamp,
      number: eventNumber,
    },
    spine,
    head: {
      label: eventLabel(row),
      ...(side === "market" && wallet && tokens
        ? {
            clauses: [
              <Link
                key="w"
                href={`${pendleWalletHref(wallet)}/${tokens.market.address}`}
                onClick={(e) => e.stopPropagation()}
                className="font-mono text-xs text-rb-500 hover:text-foreground hover:underline"
                data-pendle-row-wallet={wallet}
              >
                {shortAddress(wallet)}
              </Link>,
            ],
          }
        : {}),
      deltas: legs.slice(0, 2).flatMap(({ l, tok }) => {
        const n = units(l.amount, tok.decimals);
        return n == null
          ? []
          : [
              {
                value: n,
                symbol: tok.symbol ?? "",
                address: tok.address,
                prov: legProv(row, tok, l.amount.replace(/^-/, "")),
              },
            ];
      }),
    },
    caption: "Router event",
    cells,
    ledgers: { none: "A router event moves tokens; the position's balances are on the card above." },
    explainer: {
      body: (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          {side === "wallet" ? (
            <li>
              {paid.length > 0 && `This wallet paid ${list(paid)}`}
              {paid.length > 0 && got.length > 0 && " and "}
              {got.length > 0 && `${paid.length > 0 ? "received" : "This wallet received"} ${list(got)}`} through{" "}
              {router.name}&rsquo;s {row.event}.
            </li>
          ) : (
            <li>
              {got.length > 0 && `The receiver got ${list(got)}`}
              {paid.length > 0 && got.length > 0 && "; "}
              {paid.length > 0 && `the caller paid ${list(paid)}`}, through {router.name}&rsquo;s {row.event}.
            </li>
          )}
          {row.asset != null && asset && (
            <li>
              Its SY side was worth {amountText(row.asset.replace(/^-/, ""), tokens ? assetDecimals(tokens) : null)}{" "}
              {asset} at the SY&rsquo;s exchange rate in this block.
            </li>
          )}
          {row.impliedApy != null && (
            <li>The PT in this trade was priced at a fixed {apyText(row.impliedApy)} a year to maturity.</li>
          )}
          {row.partial && (
            <li>The log does not give every leg of this wallet&rsquo;s side, so some legs are missing.</li>
          )}
        </ul>
      ),
    },
    learnMore: null,
  };
  return <EventCard slots={slots} avatar={null} />;
}

function partyWords(p?: { caller: string | null; receiver: string | null }): string {
  if (!p) return "";
  const c = p.caller ? shortAddress(p.caller) : "unknown";
  const r = p.receiver ? shortAddress(p.receiver) : "unknown";
  return c === r ? `Caller and receiver ${c}` : `Caller ${c}, receiver ${r}`;
}
