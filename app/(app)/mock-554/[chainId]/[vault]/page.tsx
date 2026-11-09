// ui-jobs 554, step 1: one vault's "What protects it" and "The protocol
// underneath", read at head (lib/mock-554/read.ts).

import Link from "next/link";
import { notFound } from "next/navigation";
import { mockVault, readMock554 } from "@/lib/mock-554/read";
import { LINK, MUTED, MockNote, MockSection } from "../../_ui";

export const dynamic = "force-dynamic";
export const PROV_EXEMPT = "ui-jobs 554 mock: receipts are written out as text; the build carries them";

const CHAIN: Record<number, string> = { 1: "Ethereum", 8453: "Base" };

export default async function Mock554Vault({ params }: { params: Promise<{ chainId: string; vault: string }> }) {
  const { chainId, vault } = await params;
  const v = mockVault(Number(chainId), vault);
  if (!v) notFound();
  const r = await readMock554(v);
  const time = new Date(r.readAt).toISOString().slice(11, 16);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <MockNote>
        Live: every figure, read from the chain at block {r.block.toLocaleString("en-US")} when this page loaded, and
        each deploy block checked against the chain. Taken from each protocol&apos;s source on GitHub and named in the
        receipt: which changes wait and who may upgrade what. Not here: the inspector (receipts are written out under
        each line), cap changes over 30 days (they wait on the server), and the readout&apos;s other lines.{" "}
        <Link href="/mock-554" className={LINK}>
          All seven vaults
        </Link>
      </MockNote>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">{r.name ?? v.address}</h1>
        <p className={`text-xs ${MUTED}`}>
          {v.family} · {CHAIN[v.chainId]} · Read {time} UTC
        </p>
      </div>
      <MockSection title="What protects it" line={r.protects} />
      <MockSection title="The protocol underneath" line={r.underneath} />
      <p className={`text-xs ${MUTED}`}>Readings at the block shown. Rails does not forecast, rate or recommend.</p>
    </div>
  );
}
