import { NextRequest, NextResponse } from "next/server";
import { readForkShutdown } from "@/lib/sources/chain/liquity-fork-shutdown";
import type { LiquityForkBranchConfig, LiquityForkConfig } from "@/lib/sources/chain/liquity-fork-position";
import { LIQUITY_V2_BRANCHES, DEBT_SYMBOL as LIQUITY_V2_DEBT } from "@/lib/liquity/asset-catalog";
import {
  ASYMMETRY_BRANCHES,
  DEBT_SYMBOL as ASYMMETRY_DEBT,
  resolveBranch as asymmetryBranch,
} from "@/lib/asymmetry/asset-catalog";
import { EBISU_BRANCHES, DEBT_SYMBOL as EBISU_DEBT, resolveBranch as ebisuBranch } from "@/lib/ebisu/asset-catalog";
import {
  BASEDOLLAR_BRANCHES,
  DEBT_SYMBOL as BASEDOLLAR_DEBT,
  resolveBranch as basedollarBranch,
} from "@/lib/basedollar/asset-catalog";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { publicErrorMessage } from "@/lib/api/public-error";

// A Liquity-family branch's shutdown, read live (rails-ops TO-DO-ui-jobs 612):
// `?protocol=` names the explorer, `?branch=` the collateral branch. Answers
// `{ live }`, the branch's `shutdownTime()` on the contract its catalog names
// (lib/sources/chain/liquity-fork-shutdown.ts); `live.shutDown` null where the
// read failed. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Lookup = (b: string) => LiquityForkBranchConfig | undefined;
const PROTOCOLS: Record<string, { cfg: LiquityForkConfig; branch: Lookup }> = {
  "liquity-v2": {
    cfg: {
      protocol: "liquity-v2",
      debtSymbol: LIQUITY_V2_DEBT,
      branches: LIQUITY_V2_BRANCHES as Record<string, LiquityForkBranchConfig>,
      chainId: MAINNET_CHAIN_ID,
    },
    branch: (b) => LIQUITY_V2_BRANCHES[b.toLowerCase()],
  },
  ebisu: {
    cfg: { protocol: "ebisu", debtSymbol: EBISU_DEBT, branches: EBISU_BRANCHES, chainId: MAINNET_CHAIN_ID },
    branch: ebisuBranch,
  },
  asymmetry: {
    cfg: { protocol: "asymmetry", debtSymbol: ASYMMETRY_DEBT, branches: ASYMMETRY_BRANCHES, chainId: MAINNET_CHAIN_ID },
    branch: asymmetryBranch,
  },
  basedollar: {
    cfg: { protocol: "basedollar", debtSymbol: BASEDOLLAR_DEBT, branches: BASEDOLLAR_BRANCHES, chainId: BASE_CHAIN_ID },
    branch: basedollarBranch,
  },
};

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const proto = PROTOCOLS[sp.get("protocol") ?? ""];
  if (!proto) return NextResponse.json({ error: "protocol must name a Liquity-family explorer" }, { status: 400 });
  const branch = proto.branch(sp.get("branch") ?? "");
  if (!branch) return NextResponse.json({ error: "branch must name a collateral branch" }, { status: 400 });
  try {
    const read = await readForkShutdown(proto.cfg);
    return NextResponse.json({ live: read[branch.key] ?? null });
  } catch (error) {
    console.error("Error reading a Liquity-family branch shutdown:", error);
    const message = publicErrorMessage(error, "Failed to read the branch shutdown");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
