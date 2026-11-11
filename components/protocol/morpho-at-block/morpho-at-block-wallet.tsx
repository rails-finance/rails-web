// A wallet's Morpho Blue positions on Arc (U3; rails-ops ui-jobs 577), at
// `/arc/morpho/<wallet>`: each market the wallet holds a position in, with its
// collateral, debt or supply in dollars where Arc has a feed for the loan
// token, and its LTV, each opening the position's page. The layout is Aave V4
// on Arc's (components/protocol/aave-v4-arc/aave-v4-arc-wallet.tsx).
//
// SERVER-ONLY: the read uses the bearer token.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ReadTierTitleRow } from "@/components/shared/read-tier-tag";
import { Prov } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { MorphoAtBlockReceipts } from "@/components/protocol/morpho-at-block/morpho-at-block-receipts";
import { ROW } from "@/components/protocol/uniswap/uniswap-wallet-positions";
import { fetchMorphoAtBlockWallet } from "@/lib/api/fetch-morpho-at-block";
import { morphoAtBlockWalletPositions, type MorphoAtBlockFigures } from "@/lib/morpho-at-block/position";
import { morphoAtBlockProv, type MorphoAtBlockReceiptContext } from "@/lib/morpho-at-block/provenance";
import { MORPHO_ARC_ROUTE, MORPHO_ARC_SESSION, isMorphoWallet, type MorphoAtBlockWalletRead } from "@/lib/morpho-at-block/types";
import { amount, CARD_WORDS, FRONT_DOOR, pairName, pctText, usd } from "@/lib/morpho-at-block/words";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";

function Figure({
  c,
  usdKey,
  unitKey,
  value,
  valueUsd,
  unit,
}: {
  c: MorphoAtBlockReceiptContext;
  usdKey: "usd-collateral" | "usd-debt" | "usd-supplied";
  unitKey: "collateral" | "debt" | "supplied";
  value: number;
  valueUsd: number | null;
  unit: string;
}) {
  return valueUsd != null ? (
    <Prov info={morphoAtBlockProv(usdKey, c)}>{usd(valueUsd)}</Prov>
  ) : (
    <Prov info={morphoAtBlockProv(unitKey, c)}>{amount(value, unit)}</Prov>
  );
}

function rowFigures(f: MorphoAtBlockFigures, c: MorphoAtBlockReceiptContext) {
  const parts: React.ReactNode[] = [];
  if (f.collateral > 0 && f.collateralToken)
    parts.push(
      <span key="c">
        {CARD_WORDS.collateral}{" "}
        <Figure
          c={c}
          usdKey="usd-collateral"
          unitKey="collateral"
          value={f.collateral}
          valueUsd={f.collateralUsd}
          unit={f.collateralToken.symbol}
        />
      </span>,
    );
  if (f.supplied > 0)
    parts.push(
      <span key="s">
        {CARD_WORDS.supplied}{" "}
        <Figure
          c={c}
          usdKey="usd-supplied"
          unitKey="supplied"
          value={f.supplied}
          valueUsd={f.suppliedUsd}
          unit={f.loan.symbol}
        />
      </span>,
    );
  if (f.debt > 0)
    parts.push(
      <span key="d">
        {CARD_WORDS.debt}{" "}
        <Figure c={c} usdKey="usd-debt" unitKey="debt" value={f.debt} valueUsd={f.debtUsd} unit={f.loan.symbol} />
      </span>,
    );
  if (f.ltv != null)
    parts.push(
      <span key="l">
        {CARD_WORDS.ltv} <Prov info={morphoAtBlockProv("ltv", c)}>{pctText(f.ltv, 1)}</Prov>
      </span>,
    );
  return parts.flatMap((p, i) => (i ? [" · ", p] : [p]));
}

export async function MorphoAtBlockWallet({ wallet: raw }: { wallet: string }) {
  if (!isMorphoWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const session = MORPHO_ARC_SESSION;
  const answer = await fetchMorphoAtBlockWallet(wallet);
  const r: MorphoAtBlockWalletRead | null = answer.kind === "ok" ? answer.data : null;
  const rows = r ? morphoAtBlockWalletPositions(r) : [];
  return (
    <div className="py-8" data-anatomy="U3" data-morpho-arc-wallet={wallet}>
      <header className="mb-5">
        <DetailTopRow
          session={session}
          fallbackHref={MORPHO_ARC_ROUTE}
          showStamp={false}
          priceReason={ORACLE_USD_REASON[session]}
          owner={{ wallet, filterProtocol: null }}
          tools={false}
        />
        <ReadTierTitleRow id={session}>
          <h2 className="text-lg font-semibold text-foreground">{FRONT_DOOR.heading}</h2>
        </ReadTierTitleRow>
        {r && <p className="text-xs text-rb-500">{FRONT_DOOR.read(r.marketsRead)}</p>}
      </header>
      {!r ? (
        <p className="text-sm text-rb-500">{FRONT_DOOR.unanswered}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-rb-500" data-morpho-arc-none="">
          {FRONT_DOOR.none}
        </p>
      ) : (
        <MorphoAtBlockReceipts scopeId="morpho-arc-wallet">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((f) => {
              const m = r.positions.find((x) => x.id === f.id)!;
              const c: MorphoAtBlockReceiptContext = { f, m, p: m.position, head: r.head };
              return (
                <li key={f.id}>
                  <Link
                    href={`${MORPHO_ARC_ROUTE}/${wallet}/${f.id}`}
                    className={ROW}
                    data-morpho-arc-position-row={f.id}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{pairName(f)}</span>
                      <span className="block text-xs text-rb-500">{FRONT_DOOR.rowSub(f)}</span>
                      <span className="mt-1 block text-xs tabular-nums text-rb-500">{rowFigures(f, c)}</span>
                    </span>
                    <ArrowRight
                      className="ml-auto h-4 w-4 shrink-0 text-blue-600 dark:text-[var(--text-link)]"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </MorphoAtBlockReceipts>
      )}
      <ProvInspectorLayer />
    </div>
  );
}
