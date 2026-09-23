"use client";

// The three holder-side parts both Aave-on-Ethereum surfaces draw.
// ----------------------------------------------------------------------------
// `/ethereum/aave/vaults/<vault>/<holder>` states one address's reading of ONE vault;
// the retired find door stated which of the catalogue that same address
// holds. Both answer the same two questions about the address itself — what IS
// it, and is it one of Aave's own vaults — and both must answer them in the same
// words: a reader who follows a sweep row into a vault page and reads a
// different verdict about their own address has been told two things.
//
// So the shape sentence, the catalogue cross-link and the explorer link live
// here once. Each states a MECHANISM and never an identity: a proxy is reported
// as a proxy to a named address, a delegated account as a delegation to one, and
// no app is named from any delegate or implementation.

import Link from "next/link";
import { Prov } from "@/components/shared/provenance";
import { shortAddress } from "@/components/protocol/morpho-base/vault-exposure-parts";
import { AAVE_FAMILY_SINGULAR } from "@/components/vaults/aave-vault-format";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import {
  aaveAttestedNameProv,
  aaveVaultCatalogueMemberProv,
  aaveVaultHolderShapeProv,
} from "@/lib/aave-vaults/vault-provenance";
import { attestedFaceClause, attestedShortName } from "@/lib/shared/attested-addresses";
import type { AaveVaultCoords } from "@/lib/aave-vaults/vault-provenance";
import { ethereumVaultHref } from "@/lib/vaults/routes";
import type { AaveVaultHolderShape, AaveVaultRef } from "@/lib/sources/chain/aave-ethereum-vault";

const n = (v: number) => v.toLocaleString("en-US");

export const addressLink = (address: string, className = "link-external font-mono") => (
  <a
    href={explorerUrl(MAINNET_CHAIN_ID, "address", address)}
    target="_blank"
    rel="noopener noreferrer"
    className={className}
  >
    {shortAddress(address)}
  </a>
);

/** A vault in this catalogue, linked to its own page. The link exists because
 *  an enumerator returned the address at this block — a chain fact, not a name
 *  — and the receipt on it says exactly that. */
export function CatalogueMemberLink({
  vault,
  coords,
  what,
}: {
  vault: AaveVaultRef;
  coords: AaveVaultCoords;
  what: string;
}) {
  return (
    <>
      <Prov info={aaveVaultCatalogueMemberProv(coords, what)}>
        <Link
          href={ethereumVaultHref(vault.address)}
          className={PAGE_LINK}
          prefetch={false}
          data-link="catalogue-member"
          data-catalogue-member={vault.address}
        >
          {vault.symbol ?? shortAddress(vault.address)}
        </Link>
      </Prov>{" "}
      <span className="text-[11px] text-rb-500">({AAVE_FAMILY_SINGULAR[vault.family]})</span>
    </>
  );
}

/** What the holding address IS, from the code read at the same block. It states
 *  a MECHANISM, never an identity: a proxy is reported as a proxy to a named
 *  address, and no app is named from a delegate or an implementation. */
export function HolderShapeLine({
  shape,
  coords,
  blockNumber,
}: {
  shape: AaveVaultHolderShape;
  coords: AaveVaultCoords;
  blockNumber: number;
}) {
  const at = `at block ${n(blockNumber)}`;
  const bytes = `${n(shape.codeSize)} bytes of code`;
  let verdict: string;
  let rest: string;
  let follow: string | null = null;
  switch (shape.kind) {
    case "eoa":
      verdict = `has no code ${at}`;
      rest = ": an externally owned account.";
      break;
    case "delegated-account":
      verdict = `is an account delegated to ${shortAddress(shape.delegate)} ${at}`;
      rest = `: its ${bytes} are the EIP-7702 delegation indicator — “0xef0100” followed by that address — so a key still controls the account and its code is the delegate's.`;
      follow = shape.delegate;
      break;
    case "aave-vault":
      verdict = `is a contract ${at}`;
      rest = `: a vault in this same catalogue${shape.symbol ? `, ${shape.symbol}` : ""}${
        shape.assetIsVaultShares ? ", whose own asset is this vault's share token" : ""
      }.`;
      break;
    case "safe":
      verdict = `is a Safe (${shape.version}) ${at}`;
      rest = `: its ${shape.evidence} names the released singleton at ${shortAddress(shape.singleton)}.`;
      break;
    case "erc4626":
      verdict = `is a contract ${at}`;
      rest = `: ${shape.name ? `${shape.name}${shape.symbol ? ` (${shape.symbol})` : ""}, an` : "an"} ERC-4626 vault whose asset is ${
        shape.assetIsVaultShares ? "this vault's own share token" : shortAddress(shape.asset)
      }.`;
      break;
    case "erc1967-proxy":
      verdict = `is a proxy to ${shortAddress(shape.implementation)} ${at}`;
      rest = `: that address is what its EIP-1967 implementation slot holds. What the implementation is takes reading it; nothing here names it.`;
      follow = shape.implementation;
      break;
    case "eip1167-proxy":
      verdict = `is a proxy to ${shortAddress(shape.implementation)} ${at}`;
      rest = `: its ${bytes} are the EIP-1167 minimal proxy, with that address embedded in them. What the implementation is takes reading it; nothing here names it.`;
      follow = shape.implementation;
      break;
    // ── THE NAME, WHERE A REGISTRY PUBLISHES ONE ────────────────────────────
    // Before `contract`, because "a contract, 1,096 bytes" is what this case used
    // to read as — and that sentence says nothing about Aave's own peg module
    // parking its reserves in Aave's own vault. The name is a CITATION and the
    // clause says whose and where: a constant in a published file at a pinned
    // commit, or a contract that file names having returned the address. An
    // address no rung answers for keeps the cases above (memory
    // `vault-provider-guides`: a source NAME is not attribution).
    case "attested":
      verdict = `is a contract ${at}`;
      // `rest` is the tail AFTER the name — the render puts the name itself
      // between them, under its own receipt.
      rest = ` — ${attestedFaceClause(shape.attested)}: ${shape.attested.what}.${
        shape.underlyingIsVaultShares
          ? " Its own UNDERLYING_ASSET() is this vault's share token, read at the same block."
          : shape.underlying
            ? ` Its own UNDERLYING_ASSET() is ${shortAddress(shape.underlying)}, read at the same block.`
            : ""
      }`;
      break;
    case "contract":
      verdict = `is a contract ${at}`;
      rest = `: ${bytes}${
        shape.name || shape.symbol
          ? `, answering to ${shape.name ?? "no name"}${shape.symbol ? ` (${shape.symbol})` : ""}`
          : ""
      }. It answers no asset(), its storage slot 0 names no Safe singleton, and its EIP-1967 implementation slot is empty.`;
      break;
  }
  return (
    <p
      className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500"
      data-figure="holder-shape"
      data-attested-constant={shape.kind === "attested" ? shape.attested.constant : undefined}
      data-attested-via={shape.kind === "attested" ? shape.attested.via : undefined}
    >
      This address <Prov info={aaveVaultHolderShapeProv(coords, shape.kind, shape.codeSize)}>{verdict}</Prov>
      {/* The NAME carries its own receipt, separate from the code read's: one is
          a chain read about bytes, the other a citation of a published file. A
          single receipt over both would let a reader trace the name to an
          `eth_getCode`, which is not where it came from. */}
      {shape.kind === "attested" ? (
        <>
          : {bytes}, named{" "}
          <Prov info={aaveAttestedNameProv(coords, shape.attested)}>
            <span className="font-mono text-foreground">{attestedShortName(shape.attested)}</span>
          </Prov>
          {rest}
        </>
      ) : (
        rest
      )}
      {follow && <> That address is {addressLink(follow)}; what it is takes reading it, and nothing here names it.</>}
    </p>
  );
}
