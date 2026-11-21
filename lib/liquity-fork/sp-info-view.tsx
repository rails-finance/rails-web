// A Liquity V2 fork's "Stability Pool deposits" section on its About page
// (ProtocolInfoPage, rails-ops standards/info-page-template.md): Liquity V2's
// section (app/(app)/ethereum/liquity-v2/info/page.tsx) in the fork's
// stablecoin and branches, from its deployment record
// (lib/liquity-v2/sp-deployment.ts), linking the fork's deposit listing. A fork
// may add one closing line (Ebisu's shutdown).

import type { ReactNode } from "react";
import Link from "next/link";
import type { InfoView } from "@/components/shared/protocol-info-page";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { SP_DEPLOYMENTS } from "@/lib/liquity-v2/sp-deployment";
import type { LiquityForkDeployment } from "./explorer";

const UL = "mt-1.5 list-disc space-y-1 pl-5";

const list = (xs: string[]): string =>
  xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

const NUMBER = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

export function forkSpInfoView(fork: LiquityForkDeployment, closing?: ReactNode): InfoView {
  const dep = SP_DEPLOYMENTS[fork];
  const S = dep.stable.symbol;
  const n = dep.pools.length;
  return {
    heading: "Stability Pool deposits",
    section: "stability-pool",
    body: (
      <ul className={UL}>
        <li>
          Each of the {NUMBER[n] ?? n} branches ({list(dep.pools.map((p) => p.symbol))}) has a Stability Pool of {S}{" "}
          that repays the debt of liquidated Troves on that branch. A deposit is one address&apos;s {S} in one
          branch&apos;s pool. Each liquidation burns a share of every deposit and pays the branch&apos;s collateral in
          its place, and the branch&apos;s interest pays the deposit a yield in {S}.
        </li>
        <li>
          The pool writes what changed only when the depositor touches the deposit. A touch either claims both gains or
          neither: unclaimed yield joins the deposit and unclaimed collateral is stashed. A deposit&apos;s page also
          shows the deposit now, and the collateral and yield the next touch would pay.{" "}
          <Link href={dep.spPath} className={INLINE_LINK}>
            See the deposits
          </Link>
          .
        </li>
        {closing && <li>{closing}</li>}
      </ul>
    ),
  };
}
