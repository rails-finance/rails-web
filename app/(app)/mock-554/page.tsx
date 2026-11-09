// ui-jobs 554, step 1: the mock's index, one link per example vault.

import Link from "next/link";
import { MOCK_VAULTS } from "@/lib/mock-554/read";
import { shortHex } from "@/lib/vaults/health-words";
import { LINK, MUTED, MockNote } from "./_ui";

export const PROV_EXEMPT = "ui-jobs 554 mock index";

const CHAIN: Record<number, string> = { 1: "Ethereum", 8453: "Base" };

export default function Mock554Index() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <MockNote>
        Two sections for the vault page, &quot;What protects it&quot; and &quot;The protocol underneath&quot;, read from
        the chain when each page loads.
      </MockNote>
      <h1 className="mb-4 text-2xl font-semibold text-foreground">Risk with provenance</h1>
      <ul className="space-y-2 text-sm">
        {MOCK_VAULTS.map((v) => (
          <li key={`${v.chainId}:${v.address}`}>
            <Link href={`/mock-554/${v.chainId}/${v.address}`} className={LINK}>
              {v.family} {shortHex(v.address)}
            </Link>{" "}
            <span className={MUTED}>
              {CHAIN[v.chainId]}: {v.why}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
