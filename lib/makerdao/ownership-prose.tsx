// How the MakerDAO vault page names the parties to a vault's ownership, and
// what a transaction that moved it did as a whole. Every name comes from the
// known-contracts register or from the transaction read
// (lib/sources/chain/makerdao-tx-context.ts); an address with neither is
// stated as an address.

import type { ReactNode } from "react";
import type { MakerTxContext } from "@/lib/makerdao/chain-history-types";
import type { MakerEvent, MakerOwnerRef } from "@/lib/makerdao/vault-history";
import { knownContract } from "@/lib/makerdao/known-contracts";
import { formatNumber } from "@/lib/utils/format";

export const shortAddr = (a?: string | null): string => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

/** A chip's text for an owner: a known contract's short name, an Instadapp
 *  account with its address, else the account behind the proxy. */
export function ownerChipText(ref: MakerOwnerRef, ctx?: MakerTxContext): { name?: string; address: string } {
  const holder = ref.holder ?? ref.owner ?? "";
  const known = knownContract(holder);
  if (known) return { name: known.short, address: holder };
  const party = holder ? ctx?.parties[holder] : undefined;
  if (party?.kind === "instadapp-account") return { name: `Instadapp account ${shortAddr(holder)}`, address: holder };
  return { address: ref.owner ?? holder };
}

/** An owner in a sentence. */
export function describeOwner(ref: MakerOwnerRef, ctx?: MakerTxContext, inTx = true): ReactNode {
  const holder = ref.holder;
  const known = knownContract(holder);
  if (known)
    return (
      <>
        {known.name} ({shortAddr(holder)})
      </>
    );
  const party = holder ? ctx?.parties[holder] : undefined;
  if (party?.kind === "instadapp-account") {
    return (
      <>
        an Instadapp account ({shortAddr(holder)}){party.createdInTx && inTx ? " created in this transaction" : ""}
        {ref.owner && ref.owner !== holder ? <> for {shortAddr(ref.owner)}</> : null}
      </>
    );
  }
  if (holder && ref.owner && holder !== ref.owner) {
    return (
      <>
        {shortAddr(ref.owner)} through its {party?.kind === "dsproxy" ? "DSProxy" : "proxy"} {shortAddr(holder)}
      </>
    );
  }
  return <>{shortAddr(ref.owner ?? holder)}</>;
}

/** An address that called something in the transaction, by what it is. */
export function describeCaller(address: string | null, ctx?: MakerTxContext): ReactNode {
  if (!address) return <>an address</>;
  const known = knownContract(address);
  if (known) return <>{known.name}</>;
  const party = ctx?.parties[address];
  if (party?.kind === "dsproxy" && party.owner)
    return (
      <>
        {shortAddr(party.owner)}&rsquo;s DSProxy ({shortAddr(address)})
      </>
    );
  if (party?.kind === "instadapp-account") return <>the Instadapp account ({shortAddr(address)})</>;
  if (party?.kind === "eoa") return <>{shortAddr(address)}, a wallet</>;
  return <>{shortAddr(address)}</>;
}

const same = (a: MakerOwnerRef, b: MakerOwnerRef) => (a.holder ?? a.owner) === (b.holder ?? b.owner);

/** One line on what a transaction that moved the vault's ownership did as a
 *  whole: who sent it and through what, each step in chain order, and how the
 *  vault ended it. Null for a transaction with a single give and nothing else
 *  of this vault's (the row says it all), or an open's (the open row does). */
export function txSummary(
  rows: readonly MakerEvent[],
  ctx: MakerTxContext | undefined,
  steps: Map<string, { before: MakerOwnerRef; after: MakerOwnerRef }>,
): ReactNode | null {
  const gives = rows.filter((r) => r.context.data.eventType === "give");
  if (gives.length === 0) return null;
  if (rows.some((r) => r.context.data.isOpen)) return null;
  if (gives.length === 1 && rows.length === 1) return null;
  const sym = rows[0].context.data.collateralSymbol;
  const parts: ReactNode[] = [];
  let loanUsed = false;
  const firstStep = steps.get(gives[0].id);
  const lastStep = steps.get(gives[gives.length - 1].id);
  for (const r of rows) {
    const d = r.context.data;
    if (d.eventType === "give") {
      const step = steps.get(r.id);
      if (!step) return null;
      const back = firstStep && r.id !== gives[0].id && same(step.after, firstStep.before);
      const received = ctx?.tokensIn.filter((t) => t.to === step.after.holder) ?? [];
      parts.push(
        back ? (
          <>handed it back to {describeOwner(step.after, ctx)}</>
        ) : (
          <>
            gave the vault to {describeOwner(step.after, ctx)}
            {received.length > 0 ? (
              <>
                , which received{" "}
                {received.map((t, i) => (
                  <span key={i}>
                    {i > 0 ? " and " : ""}
                    {formatNumber(Number(t.amount))} {t.symbol}
                  </span>
                ))}
              </>
            ) : null}
          </>
        ),
      );
      continue;
    }
    if (d.eventType !== "frob") continue;
    const dink = Number(d.dink) || 0;
    const debt = Number(d.debtChange) || 0;
    if (dink > 0) {
      const loan =
        !loanUsed &&
        ctx?.flashLoan &&
        ctx.flashLoan.symbol === sym &&
        Math.abs(Number(ctx.flashLoan.amount) - dink) < 1e-9
          ? ctx.flashLoan
          : null;
      if (loan) loanUsed = true;
      parts.push(
        loan ? (
          <>
            put {formatNumber(dink)} {sym} borrowed in a {loan.lender} flash loan into the vault
          </>
        ) : (
          <>
            deposited {formatNumber(dink)} {sym}
          </>
        ),
      );
    } else if (dink < 0) {
      parts.push(
        <>
          took {formatNumber(-dink)} {sym} out
        </>,
      );
    }
    if (debt > 0) parts.push(<>drew {formatNumber(debt)} DAI</>);
    else if (debt < 0) parts.push(<>repaid {formatNumber(-debt)} DAI</>);
  }
  if (parts.length < 2) return null;
  const netInk = rows.reduce(
    (t, r) => t + (r.context.data.eventType === "frob" ? Number(r.context.data.dink) || 0 : 0),
    0,
  );
  const netDebt = rows.reduce(
    (t, r) => t + (r.context.data.eventType === "frob" ? Number(r.context.data.debtChange) || 0 : 0),
    0,
  );
  const sameOwner = firstStep && lastStep && same(firstStep.before, lastStep.after);
  const sender = ctx ? describeSender(ctx) : null;
  return (
    <>
      This transaction{sender ? <>, {sender},</> : null}{" "}
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? (i === parts.length - 1 ? " and " : ", ") : null}
          {p}
        </span>
      ))}
      .
      {sameOwner && Math.abs(netInk) < 1e-9 && Math.abs(netDebt) < 1e-6 ? (
        <> The vault ended it with the same owner, collateral and debt it started with.</>
      ) : sameOwner ? (
        <> The vault ended it with the same owner.</>
      ) : null}
    </>
  );
}

/** "sent by 0x8a56…71b5 through DeFi Saver (its "InstClaimFLAndSwap" recipe)". */
export function describeSender(ctx: MakerTxContext): ReactNode {
  const via = ctx.to ? ctx.parties[ctx.to] : undefined;
  return (
    <>
      sent by {shortAddr(ctx.from)}
      {via?.kind === "dsproxy" && via.owner === ctx.from ? <> through its DSProxy</> : null}
      {ctx.tools.length > 0 ? (
        <>
          {" "}
          running {ctx.tools.join(" and ")}
          {ctx.recipe ? <>&rsquo;s &ldquo;{ctx.recipe}&rdquo; recipe</> : null}
        </>
      ) : null}
    </>
  );
}

/** A deposit and a withdrawal of the same amount inside one transaction: the
 *  other row, when this row is one of such a pair. */
export function inAndOutPartner(row: MakerEvent, rows: readonly MakerEvent[] | undefined): MakerEvent | null {
  if (!rows || row.context.data.eventType !== "frob") return null;
  const dink = Number(row.context.data.dink) || 0;
  if (dink === 0) return null;
  return (
    rows.find(
      (r) =>
        r.id !== row.id &&
        r.context.data.eventType === "frob" &&
        Math.abs((Number(r.context.data.dink) || 0) + dink) < 1e-12,
    ) ?? null
  );
}
