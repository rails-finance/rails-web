"use client";

// The "In this transaction" bullet of a Liquity V2 deposit card's Explanation
// (rails-ops ui-jobs 751): the Troves the deposit's transaction acted on, each
// linked to its page with a receipt on its name. Facts only, no causal word;
// the words are lib/liquity-v2/tx-troves-words.ts. A failed read, or a
// transaction that logged no Trove operation, draws nothing.

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Prov } from "@/components/shared/provenance";
import { LIQUITY_FORK_CARD_CONFIGS } from "@/lib/shared/liquity-fork-card-config";
import { shortPositionId } from "@/lib/shared/position-name";
import { spTxTroveProv } from "@/lib/liquity-v2/sp-provenance";
import { useTxTroves } from "@/lib/liquity-v2/tx-troves";
import { txTrovesLine, txTrovesTail, type TxTrove } from "@/lib/liquity-v2/tx-troves-words";

const TROVE_PATH = LIQUITY_FORK_CARD_CONFIGS["liquity-v2"].trovePath;

function TroveName({ t, txHash }: { t: TxTrove; txHash: string }) {
  const id = shortPositionId(t.troveId);
  return (
    <>
      <Link href={`${TROVE_PATH}/${t.collateralType}/${t.troveId}`} prefetch={false} className="link">
        <Prov info={spTxTroveProv(t, id, txHash)} value={t.troveId}>
          Trove {id}
        </Prov>
      </Link>{" "}
      ({t.collateralType})
    </>
  );
}

/** Joins nodes as "a", "a and b", "a, b and c". */
function joinNodes(nodes: ReactNode[]): ReactNode[] {
  return nodes.map((n, i) => (
    <Fragment key={i}>
      {i > 0 && (i === nodes.length - 1 ? " and " : ", ")}
      {n}
    </Fragment>
  ));
}

export function SpTxTroves({ txHash }: { txHash: string }) {
  const res = useTxTroves(txHash);
  const line = res ? txTrovesLine(res) : null;
  if (!line) return null;
  const tail = txTrovesTail(line);
  return (
    <li data-sp-tx-troves="">
      In this transaction:{" "}
      {line.clauses.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && "; "}
          {joinNodes(
            c.troves.map((t) => <TroveName key={`${t.collateralType}:${t.troveId}`} t={t} txHash={txHash} />),
          )}{" "}
          {c.verbs}
        </Fragment>
      ))}
      {tail && `; ${tail}`}.
    </li>
  );
}
