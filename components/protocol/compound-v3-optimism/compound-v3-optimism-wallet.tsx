// A wallet's Compound V3 accounts on Optimism (U3; rails-ops ui-jobs 578), at
// `/optimism/compound-v3/<wallet>`: each Comet the wallet lends to, borrows from
// or holds collateral in, with its dollars at the Comet's feeds and its borrowing
// limit used, each opening the Comet account's page. A wallet in one Comet goes
// to that Comet's page, as on Arbitrum. The layout is Aave V4 on Arc's.
//
// SERVER-ONLY: the read uses the bearer token.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { HistoryTitleRow } from "@/components/shared/history-tag";
import { Prov } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { UnansweredLine } from "@/components/shared/unanswered-line";
import { CompoundV3OptimismReceipts } from "@/components/protocol/compound-v3-optimism/compound-v3-optimism-receipts";
import { ROW } from "@/components/protocol/uniswap/uniswap-wallet-positions";
import { fetchCompoundV3OptimismWallet } from "@/lib/api/fetch-compound-v3-optimism";
import { accountFigures } from "@/lib/compound-v3-optimism/position";
import { opcBaseProv, opcCardProv, type OpcReceiptContext } from "@/lib/compound-v3-optimism/provenance";
import { isOpcWallet, OPC_ROUTE, OPC_SESSION, opcPositionHref } from "@/lib/compound-v3-optimism/types";
import { accountLine, CARD_WORDS, pctText, usd, WALLET_PAGE } from "@/lib/compound-v3-optimism/words";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";

export async function CompoundV3OptimismWallet({ wallet: raw }: { wallet: string }) {
  if (!isOpcWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const session = OPC_SESSION;
  const answer = await fetchCompoundV3OptimismWallet(wallet);
  const held =
    answer.kind === "ok"
      ? answer.data.comets.map((a) => ({ a, f: accountFigures(a, answer.data.ethUsd) })).filter((x) => x.f.held)
      : [];
  if (held.length === 1) redirect(opcPositionHref(held[0].a.key, wallet));
  return (
    <div className="py-8" data-anatomy="U3" data-compound-v3-optimism-wallet={wallet}>
      <header className="mb-5">
        <DetailTopRow
          session={session}
          fallbackHref={OPC_ROUTE}
          showStamp={false}
          priceReason={ORACLE_USD_REASON[session]}
          owner={{ wallet, filterProtocol: null }}
          tools={false}
        />
        <HistoryTitleRow id={session}>
          <h2 className="text-lg font-semibold text-foreground">{WALLET_PAGE.title}</h2>
        </HistoryTitleRow>
        <p className="text-xs text-rb-500">{WALLET_PAGE.sub}</p>
      </header>
      {answer.kind !== "ok" ? (
        <UnansweredLine ceiling={answer.kind === "ceiling"} className="text-sm text-rb-500" data-position-unanswered="">
          {WALLET_PAGE.unanswered}
        </UnansweredLine>
      ) : held.length === 0 ? (
        <p className="text-sm text-rb-500" data-compound-v3-optimism-empty="">
          {WALLET_PAGE.empty}
        </p>
      ) : (
        <CompoundV3OptimismReceipts>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {held.map(({ a, f }) => {
              const c: OpcReceiptContext = { a, f, head: answer.data.head, ethUsd: answer.data.ethUsd };
              const lend = f.supplied > 0;
              const baseUsd = lend ? f.suppliedUsd : f.borrowedUsd;
              return (
                <li key={a.key}>
                  <Link
                    href={opcPositionHref(a.key, wallet)}
                    className={ROW}
                    aria-label={WALLET_PAGE.open(a.label)}
                    data-compound-v3-optimism-comet-row={a.key}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{a.label}</span>
                      <span className="block text-xs text-rb-500">{accountLine(f)}</span>
                      <span className="mt-1 block text-xs tabular-nums text-rb-500">
                        {f.collateral.length > 0 && f.collateralUsd != null && (
                          <>
                            {CARD_WORDS.collateral}{" "}
                            <Prov info={opcCardProv("collateral-total", c)}>{usd(f.collateralUsd)}</Prov>
                          </>
                        )}
                        {(f.supplied > 0 || f.borrowed > 0) && baseUsd != null && (
                          <>
                            {f.collateral.length > 0 && " · "}
                            {lend ? CARD_WORDS.lent : CARD_VOCAB.debt}{" "}
                            <Prov info={opcBaseProv("usd", c)}>{usd(baseUsd)}</Prov>
                          </>
                        )}
                        {f.limitUsed != null && (
                          <>
                            {" · "}
                            {CARD_WORDS.limit} <Prov info={opcCardProv("limit", c)}>{pctText(f.limitUsed, 1)}</Prov>
                          </>
                        )}
                      </span>
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
        </CompoundV3OptimismReceipts>
      )}
      <ProvInspectorLayer />
    </div>
  );
}
