"use client";

// The accounts of J3: one block per account (J3.2), its holdings on rows that
// open their pages, each amount with its receipt. One receipts scope its ⋮ arms.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Prov } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { walletRows } from "@/lib/euler/position";
import { walletFindProv, walletRowProv } from "@/lib/euler/provenance";
import type { EulerWalletRead } from "@/lib/euler/types";
import { FRONT_DOOR, accountName, num, short } from "@/lib/euler/words";

const SCOPE = "euler-wallet";
/** Uniswap's wallet row (components/protocol/uniswap/uniswap-wallet-positions.tsx, a server module). */
const ROW =
  "flex items-center gap-3 rounded-xl border border-rb-200 bg-raised px-4 py-3 transition-colors duration-150 hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-rb-600";

export function EulerWalletList({ w, home }: { w: EulerWalletRead; home: string }) {
  const rows = walletRows(w);
  const accounts = [...new Set(rows.map((r) => r.index))];
  const count = `${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`;
  const markdown = () =>
    [
      `## ${FRONT_DOOR.heading}: ${w.owner}`,
      "",
      ...rows.map(
        (r) =>
          `- ${accountName(r.index)} · ${r.vaultSymbol}: ${r.kind === "loan" ? FRONT_DOOR.loan : FRONT_DOOR.deposit} ${num(r.amount)} ${r.asset.symbol}`,
      ),
    ].join("\n");
  return (
    <ProvSection scope={SCOPE}>
      <SectionHeading
        title={<Prov info={walletFindProv(w)}>{count}</Prov>}
        menu={<SectionMenu scope={SCOPE} title={FRONT_DOOR.heading} exports={{ markdown: { build: markdown } }} />}
      />
      <div className="mt-2 flex flex-col gap-5">
        {accounts.map((i) => (
          <div key={i} data-anatomy="J3.2" data-euler-account={i}>
            <p className="mb-2 text-xs text-rb-500">
              <span className="font-semibold text-foreground">{accountName(i)}</span> ·{" "}
              <span className="font-mono">{short(rows.find((r) => r.index === i)!.account)}</span>
            </p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rows
                .filter((r) => r.index === i)
                .map((r) => (
                  <li key={r.vault}>
                    <Link
                      href={`${home}/position/${r.account.toLowerCase()}/${r.vault.toLowerCase()}`}
                      className={ROW}
                      data-euler-row={`${i}:${r.vault}`}
                      data-kind={r.kind}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {r.kind === "loan" ? FRONT_DOOR.loan : FRONT_DOOR.deposit}{" "}
                          <Prov info={walletRowProv(r, w)}>{FRONT_DOOR.row(r)}</Prov>
                        </span>
                        <span className="block text-xs text-rb-500">
                          {r.vaultSymbol}
                          {r.collateral ? ` · ${FRONT_DOOR.collateral}` : ""}
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
          </div>
        ))}
      </div>
    </ProvSection>
  );
}
