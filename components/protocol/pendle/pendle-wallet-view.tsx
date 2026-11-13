"use client";

// A wallet on Pendle: one card per market its router events name (C1 listing
// surface, each a link to that position's page), open positions first, then
// the markets it has left. Every figure is read at the block the answer names.

import Link from "next/link";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { PositionCard, type PositionCardSlots } from "@/components/shared/position-card";

import { BlockRef } from "@/components/shared/block-ref";
import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";
import { rowAssetKeys } from "@/lib/shared/focus-row-keys";
import { SECTION_HEADING, CARD_INSET_START } from "@/lib/shared/ui-grammar";
import { PendleReadNotice } from "@/components/protocol/pendle/pendle-read-notice";
import { UnderlyingLabel, heldPt, positionClosed } from "@/components/protocol/pendle/pendle-position-card";
import {
  PENDLE_CHAIN_ID,
  amountText,
  apyText,
  assetDecimals,
  assetSymbol,
  exact,
  marketName,
  maturityDate,
  maturityWords,
  shortAddress,
} from "@/lib/pendle/format";
import { entryApyProv, impliedApyProv, maturityProv, valueProv } from "@/lib/pendle/provenance";
import { PENDLE_WORDS } from "@/lib/pendle/words";
import { pendleWalletHref } from "@/lib/pendle/routes";
import type { PendlePosition, PendleWalletPositions } from "@/lib/pendle/types";
import type { PendleReadFailure } from "@/lib/sources/api/pendle";

const NONE: PendlePosition[] = [];

function ListingCard({ p, w }: { p: PendlePosition; w: PendleWalletPositions }) {
  const t = p.tokens;
  const dec = assetDecimals(t);
  const asset = assetSymbol(t);
  const closed = positionClosed(p);
  const expired = p.maturity.expired === true;
  const rows = w.timeline.filter((r) => r.market === t.market.address);
  const last = rows[rows.length - 1];
  const slots: PositionCardSlots = {
    surface: "listing",
    status: closed ? { word: "Closed", tone: "muted" } : expired ? { word: "Matured", tone: "muted" } : null,
    heads: [
      {
        id: "value",
        label: "Value",
        tier: "amount",
        value:
          p.value.asset.total == null ? null : (
            <Prov
              info={valueProv("total", t, w.block, p.maturity.expired)}
              value={exact(p.value.asset.total, dec) ?? ""}
            >
              {amountText(p.value.asset.total, dec)}
            </Prov>
          ),
        sub: asset,
      },
      {
        id: "entry-apy",
        label: PENDLE_WORDS.effectiveFixedApy,
        value:
          p.apy.entry.ptWeighted == null || !heldPt(p) ? null : (
            <Prov info={entryApyProv(p.apy.entry.buys, p.apy.entry.unpriced)} value={p.apy.entry.ptWeighted.toFixed(6)}>
              {apyText(p.apy.entry.ptWeighted)}
            </Prov>
          ),
        sub: heldPt(p) ? undefined : PENDLE_WORDS.noPtHeld,
      },
      {
        id: "implied-apy",
        label: "Implied APY now",
        value:
          p.apy.current == null ? (
            expired ? (
              "Matured"
            ) : null
          ) : (
            <Prov info={impliedApyProv(t.market.address, w.block, null)} value={p.apy.current.toFixed(6)}>
              {apyText(p.apy.current)}
            </Prov>
          ),
      },
      {
        id: "maturity",
        label: "Maturity",
        value: (
          <Prov info={maturityProv(t.market.address, t.expiry, w.block)} value={String(t.expiry)}>
            {maturityDate(t.expiry)}
          </Prov>
        ),
        sub: maturityWords(t.expiry, w.timestamp),
      },
    ],
    identity: (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-foreground">{marketName(t)}</span>
        <UnderlyingLabel p={p} />
      </span>
    ),
    counters: { lastActivityAt: last?.timestamp ?? null, eventCount: rows.length, eventCountNoun: "router event" },
    menu: null,
  };
  return (
    <Link
      href={`${pendleWalletHref(w.wallet)}/${t.market.address}`}
      className="block"
      data-anatomy="N2"
      data-pendle-position-link={t.market.address}
    >
      <PositionCard slots={slots} />
    </Link>
  );
}

export function PendleWalletView({
  wallet,
  data,
  failure,
}: {
  wallet: string;
  data: PendleWalletPositions | null;
  failure: PendleReadFailure | null;
}) {
  // Focus (ui-jobs 557): the markets whose PT, YT, SY, yield token or LP is in focus.
  const scoped = useScopedRows(
    data?.positions ?? NONE,
    (p) => rowAssetKeys(p.tokens, PENDLE_CHAIN_ID),
    () => PENDLE_CHAIN_ID,
  );
  const narrowed = scoped.on && !scoped.peek;
  const open = scoped.rows.filter((p) => !positionClosed(p));
  const closed = scoped.rows.filter((p) => positionClosed(p));
  const registry = useReceiptRegistry();
  return (
    <ProvReceiptsScope registry={registry}>
      <div className="space-y-6 py-8">
        <DetailTopRow session="pendle" wallet={wallet} owner={{ wallet }} assets={[]} tools />
        {failure && <PendleReadNotice failure={failure} />}
        {data && (
          <p className="text-xs text-rb-500" data-pendle-asof={data.block}>
            Pendle · Ethereum · every figure at <BlockRef block={data.block} chainId={PENDLE_CHAIN_ID} />
          </p>
        )}
        {data && data.positions.length === 0 && (
          <p className="text-sm text-rb-500">No Pendle router event names this wallet.</p>
        )}
        {data && data.positions.length > 0 && <ScopeNote scoped={scoped} noun={["market", "markets"]} />}
        <div className="space-y-6" {...scoped.listProps}>
          {open.length > 0 && (
            <section className="space-y-3" aria-label="Open positions" data-pendle-open="">
              <h2 className={`${SECTION_HEADING} ${CARD_INSET_START}`}>
                Open positions{" "}
                <span className="tabular-nums text-rb-500" data-prov-exempt="">
                  {open.length}
                </span>
              </h2>
              {open.map((p) => (
                <ListingCard key={p.tokens.market.address} p={p} w={data!} />
              ))}
            </section>
          )}
          {closed.length > 0 && (
            <section className="space-y-3" aria-label="Closed positions" data-pendle-closed="">
              <h2 className={`${SECTION_HEADING} ${CARD_INSET_START}`}>
                Closed{" "}
                <span className="tabular-nums text-rb-500" data-prov-exempt="">
                  {closed.length}
                </span>
              </h2>
              {closed.map((p) => (
                <ListingCard key={p.tokens.market.address} p={p} w={data!} />
              ))}
            </section>
          )}
        </div>
        {/* A YT with no market names nothing the focus can judge, so it is left out under Focus. */}
        {data && ((!narrowed && data.unplacedYts.length > 0) || data.truncated) && (
          <div className={`space-y-1 text-xs text-rb-500 ${CARD_INSET_START}`} data-pendle-notes="">
            {!narrowed && data.unplacedYts.length > 0 && (
              <p>
                This wallet minted or redeemed{" "}
                {data.unplacedYts.length === 1 ? "a YT" : `${data.unplacedYts.length} YTs`} whose market none of its
                router events name ({data.unplacedYts.map(shortAddress).join(", ")}), so{" "}
                {data.unplacedYts.length === 1 ? "it has" : "they have"} no card here.
              </p>
            )}
            {data.truncated && (
              <p>This wallet has more router events than one read returns; the newest are left out.</p>
            )}
          </div>
        )}
        <ProvInspectorLayer />
      </div>
    </ProvReceiptsScope>
  );
}
