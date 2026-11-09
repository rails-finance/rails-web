// ui-jobs 555, door 1 mock: "I have an LP position: how is it doing?"
// The position first, the six-line readout beside it, everything read live
// from Ethereum (_reads.ts).

import Link from "next/link";
import { notFound } from "next/navigation";
import { lines } from "../../../_lines";
import { readPosition } from "../../../_reads";
import { CARD, LINK, MUTED, MockNote, RangeBar, Readout, SectionHead, day, num, short } from "../../../_ui";

export const dynamic = "force-dynamic";
export const PROV_EXEMPT = "ui-jobs 555 mock: receipts are written out as text; the build carries them";

export default async function MockPoolPosition({ params }: { params: Promise<{ version: string; id: string }> }) {
  const { version, id } = await params;
  if ((version !== "v3" && version !== "v4") || !/^\d+$/.test(id)) notFound();
  const p = await readPosition(version, BigInt(id));
  const B = p.base.symbol;
  const Q = p.quote.symbol;

  return (
    <div className="py-8">
      <MockNote>
        Read live at block {p.block.now.toLocaleString("en-US")} ({day(p.block.nowAt)}), owner {short(p.owner)}. On the
        build it is the reader&apos;s own position, found from their wallet. Values are in {Q}, priced by the pool. The
        dots say where each line&apos;s figure comes from; they leave on the build.{" "}
        <Link href="/mock-555" className={LINK}>
          All twelve
        </Link>
      </MockNote>

      <div className="mb-6">
        <div className="text-lg font-semibold text-foreground">
          {B}/{Q} · Uniswap {version.toUpperCase()} · position #{Number(id).toLocaleString("en-US")}
        </div>
        <div className={`text-xs ${MUTED}`}>
          Fee {p.feeLabel} · Ethereum{p.hooks ? ` · hook ${short(p.hooks)}` : ""}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section className={`${CARD} p-4`} data-door="position">
          <SectionHead
            title="Your position"
            sub={`In ${Q}, at the pool's own price. Rails prices nothing in dollars here.`}
          />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className={`text-xs ${MUTED}`}>Holds now</dt>
              <dd className="text-sm font-semibold tabular-nums text-foreground">
                {num(p.holds.base)} {B}
              </dd>
              <dd className="text-sm font-semibold tabular-nums text-foreground">
                {num(p.holds.quote)} {Q}
              </dd>
            </div>
            <div>
              <dt className={`text-xs ${MUTED}`}>Worth now</dt>
              <dd className="text-lg font-semibold tabular-nums text-foreground">
                {num(p.valueNow)} {Q}
              </dd>
            </div>
            <div>
              <dt className={`text-xs ${MUTED}`}>Fees not yet collected</dt>
              <dd className="text-sm font-semibold tabular-nums text-foreground">
                {num(p.uncollected)} {Q}
              </dd>
            </div>
            <div>
              <dt className={`text-xs ${MUTED}`}>Opened</dt>
              <dd className="text-sm tabular-nums text-foreground">
                {p.firstAt ? day(p.firstAt) : "–"}
                {p.firstBlock ? <span className={MUTED}> · block {p.firstBlock.toLocaleString("en-US")}</span> : null}
              </dd>
            </div>
          </dl>
          <div className="mt-4">
            <div className={`mb-1 text-xs ${MUTED}`}>The range against the price</div>
            <RangeBar p={p} />
          </div>
          <p className={`mt-4 text-xs ${MUTED}`}>
            {p.version === "v3"
              ? "History on the build: its deposits, withdrawals and collections from its own logs, each at its block."
              : "History on the build: its deposits and withdrawals from the DEX lane; V4 does not index them by position."}
          </p>
        </section>

        <Readout lines={lines(p)} />
      </div>
    </div>
  );
}
