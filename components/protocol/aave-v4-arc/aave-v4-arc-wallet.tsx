// A wallet's Aave V4 accounts on Arc (U3; rails-ops ui-jobs 577), at
// `/arc/aave-v4/<wallet>`: each spoke the wallet supplies or borrows on, with
// its dollars at the spoke's oracle and its health factor, each opening the
// spoke account's page. The layout is Fluid on Base's
// (components/protocol/fluid-base/fluid-base-wallet-positions.tsx).
//
// SERVER-ONLY: the read uses the bearer token.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ReadTierTitleRow } from "@/components/shared/read-tier-tag";
import { Prov } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { AaveV4ArcReceipts } from "@/components/protocol/aave-v4-arc/aave-v4-arc-receipts";
import { ROW } from "@/components/protocol/uniswap/uniswap-wallet-positions";
import { fetchAaveV4ArcWallet } from "@/lib/api/fetch-aave-v4-arc";
import { arcWalletSpokes } from "@/lib/aave-v4-arc/position";
import { arcWalletHealthProv, arcWalletProv } from "@/lib/aave-v4-arc/provenance";
import { ARC_SESSION, arcSpokeByKey, isArcWallet } from "@/lib/aave-v4-arc/types";
import { CARD_WORDS, FRONT_DOOR, hfText, usd } from "@/lib/aave-v4-arc/words";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { explorerHref } from "@/lib/shared/protocols";
import { ARC_CHAIN_ID } from "@/lib/shared/chains";

export async function AaveV4ArcWallet({ wallet: raw }: { wallet: string }) {
  if (!isArcWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const session = ARC_SESSION;
  const home = explorerHref(ARC_CHAIN_ID, "aave-v4");
  const answer = await fetchAaveV4ArcWallet(wallet);
  const spokes = answer.kind === "ok" ? arcWalletSpokes(answer.data) : [];
  return (
    <div className="py-8" data-anatomy="U3" data-aave-v4-arc-wallet={wallet}>
      <header className="mb-5">
        <DetailTopRow
          session={session}
          fallbackHref={home}
          showStamp={false}
          priceReason={ORACLE_USD_REASON[session]}
          owner={{ wallet, filterProtocol: null }}
          tools={false}
        />
        <ReadTierTitleRow id={session}>
          <h2 className="text-lg font-semibold text-foreground">{FRONT_DOOR.heading}</h2>
        </ReadTierTitleRow>
      </header>
      {answer.kind !== "ok" ? (
        <p className="text-sm text-rb-500">{FRONT_DOOR.unanswered}</p>
      ) : spokes.length === 0 ? (
        <p className="text-sm text-rb-500" data-aave-v4-arc-none="">
          {FRONT_DOOR.none}
        </p>
      ) : (
        <AaveV4ArcReceipts scopeId="aave-v4-arc-wallet">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {spokes.map((s) => (
              <li key={s.key}>
                <Link
                  href={`${home}/spoke/${arcSpokeByKey(s.key)?.slug ?? s.key}/${wallet}`}
                  className={ROW}
                  data-aave-v4-arc-spoke-row={s.key}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{FRONT_DOOR.row(s)}</span>
                    <span className="block text-xs text-rb-500">{FRONT_DOOR.rowSub(s)}</span>
                    <span className="mt-1 block text-xs tabular-nums text-rb-500">
                      {s.supplied.length > 0 && (
                        <>
                          {CARD_WORDS.supplied}{" "}
                          <Prov info={arcWalletProv("supplied", s, answer.data)}>{usd(s.suppliedUsd)}</Prov>
                        </>
                      )}
                      {s.borrowed.length > 0 && (
                        <>
                          {s.supplied.length > 0 && " · "}
                          {CARD_WORDS.debt} <Prov info={arcWalletProv("debt", s, answer.data)}>{usd(s.debtUsd)}</Prov>
                        </>
                      )}
                      {s.healthFactor != null && (
                        <>
                          {" · "}
                          {CARD_WORDS.health}{" "}
                          <Prov info={arcWalletHealthProv(s, answer.data)}>{hfText(s.healthFactor)}</Prov>
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
            ))}
          </ul>
        </AaveV4ArcReceipts>
      )}
      <ProvInspectorLayer />
    </div>
  );
}
