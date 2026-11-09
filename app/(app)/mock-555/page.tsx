// ui-jobs 555, door 1 mock index: the twelve measured positions.

import Link from "next/link";
import { POSITIONS } from "./_positions";
import { CARD, LINK, MUTED, MockNote } from "./_ui";

export const PROV_EXEMPT = "ui-jobs 555 mock: receipts are written out as text; the build carries them";

export default function Mock555Index() {
  return (
    <div className="py-8">
      <MockNote>
        Door 1 for liquidity pools: &quot;I have an LP position: how is it doing?&quot; Every figure is read live from
        Ethereum when the page opens (a position takes a few seconds the first time: the days in range are 30 past-block
        reads, which the DEX lane&apos;s daily sample replaces on the build). Door 2:{" "}
        <Link href="/mock-555/pair/eth-usdc" className={LINK}>
          pools that take ETH and USDC
        </Link>
        .
      </MockNote>
      <h1 className="mb-4 text-xl font-semibold text-foreground">Liquidity positions, Uniswap on Ethereum</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["v3", "v4"] as const).map((v) => (
          <section key={v} className={`${CARD} p-4`}>
            <h2 className="mb-2 text-base font-semibold text-foreground">Uniswap {v.toUpperCase()}</h2>
            <ul className="space-y-2">
              {POSITIONS.filter((p) => p.version === v).map((p) => (
                <li key={p.id} className="text-sm">
                  <Link href={`/mock-555/position/${v}/${p.id}`} className={LINK}>
                    #{Number(p.id).toLocaleString("en-US")} · {p.pair}
                  </Link>{" "}
                  <span className={MUTED}>{p.note}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
