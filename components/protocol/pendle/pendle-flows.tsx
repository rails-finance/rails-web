"use client";

// Lifetime flows of one Pendle position, by leg: what the wallet received and
// paid of PT, YT, LP, SY and each outside token through Pendle's routers, and
// the asset value of what went in and came out, each event at the SY's
// exchange rate in its block. The figures are Rails' sums over the router
// logs; a move outside the routers is the timeline's note row, not a flow.

import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { SECTION_HEADING, CARD_INSET_START } from "@/lib/shared/ui-grammar";
import { amountText, assetDecimals, assetSymbol, exact, marketName, symbolOf } from "@/lib/pendle/format";
import { flowProv } from "@/lib/pendle/provenance";
import type { PendlePosition, PendleToken, PendleTokenMeta, PendleTotals } from "@/lib/pendle/types";

function Cell({ raw, decimals, what, events }: { raw: string; decimals: number | null; what: string; events: number }) {
  return (
    <Prov info={flowProv(what, events)} value={exact(raw, decimals) ?? raw}>
      {amountText(raw, decimals)}
    </Prov>
  );
}

export function PendleFlows({ p, meta }: { p: PendlePosition; meta: Record<string, PendleTokenMeta> }) {
  const registry = useReceiptRegistry();
  const t = p.tokens;
  const f = p.flows;
  const lp: PendleToken = { ...t.market, symbol: `LP ${marketName(t)}` };
  const legs: { key: string; label: string; tok: PendleToken; v: PendleTotals }[] = [
    { key: "pt", label: "PT", tok: t.pt, v: f.pt },
    { key: "yt", label: "YT", tok: t.yt, v: f.yt },
    { key: "lp", label: "LP", tok: lp, v: f.lp },
    { key: "sy", label: "SY", tok: t.sy, v: f.sy },
    ...Object.entries(f.tokens).map(([address, v]) => ({
      key: address,
      label: symbolOf({ address, symbol: meta[address]?.symbol ?? null }),
      tok: { address, symbol: meta[address]?.symbol ?? null, decimals: meta[address]?.decimals ?? null },
      v,
    })),
  ].filter((r) => r.v.in !== "0" || r.v.out !== "0");
  const asset = assetSymbol(t);
  const dec = assetDecimals(t);
  return (
    <section className="space-y-3" data-anatomy="P2" aria-label="Lifetime flows">
      <h2 className={`${SECTION_HEADING} ${CARD_INSET_START}`}>Lifetime flows</h2>
      <ProvReceiptsScope registry={registry}>
        <div className="rounded-xl bg-raised p-4 text-sm sm:p-5" data-anatomy="F23·pendle" data-pendle-flows="">
          {f.events === 0 ? (
            <p className="text-rb-500">No router event names this wallet in this market.</p>
          ) : (
            <>
              {f.asset && (
                <p className="mb-3 text-rb-500" data-pendle-flows-asset="">
                  Paid in:{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    <Cell raw={f.asset.out} decimals={dec} what={`Paid in, in ${asset}`} events={f.events} />
                  </span>{" "}
                  {asset}. Taken out:{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    <Cell raw={f.asset.in} decimals={dec} what={`Taken out, in ${asset}`} events={f.events} />
                  </span>{" "}
                  {asset}. Over {f.events} router {f.events === 1 ? "event" : "events"}, each at the SY&rsquo;s exchange
                  rate in its block.
                </p>
              )}
              <table className="w-full table-fixed tabular-nums">
                <thead>
                  <tr className="text-left text-xs text-rb-500">
                    <th className="w-[34%] pb-2 font-normal">Leg</th>
                    <th className="pb-2 text-right font-normal">Received</th>
                    <th className="pb-2 text-right font-normal">Paid</th>
                    <th className="pb-2 text-right font-normal">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {legs.map((r) => (
                    <tr key={r.key} className="border-t border-rb-200 dark:border-rb-800" data-pendle-flow-leg={r.key}>
                      <td className="py-2">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <TokenChipIcon
                            symbol={r.tok.symbol ?? ""}
                            address={r.tok.address}
                            size={16}
                            filterable={false}
                          />
                          <span className="truncate">{r.label}</span>
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <Cell raw={r.v.in} decimals={r.tok.decimals} what={`${r.label} received`} events={f.events} />
                      </td>
                      <td className="py-2 text-right">
                        <Cell raw={r.v.out} decimals={r.tok.decimals} what={`${r.label} paid`} events={f.events} />
                      </td>
                      <td className="py-2 text-right text-foreground">
                        {r.v.net.startsWith("-") ? "−" : r.v.net === "0" ? "" : "+"}
                        <Cell
                          raw={r.v.net.replace(/^-/, "")}
                          decimals={r.tok.decimals}
                          what={`${r.label} net`}
                          events={f.events}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </ProvReceiptsScope>
    </section>
  );
}
