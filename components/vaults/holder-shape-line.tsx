"use client";

// What the holding address IS, from the code read at the page's block: one
// sentence for every vault family (rails-ops ui-jobs 407 step 4), in the holder
// card's (i). It states a mechanism and never an identity: a proxy is a proxy to
// a named address, a delegated account a delegation to one, and no app is named
// from a delegate or an implementation. A registry's name carries its own
// receipt, apart from the code read's.

import { Prov, type Provenance } from "@/components/shared/provenance";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { attestedFaceClause, attestedShortName } from "@/lib/shared/attested-addresses";
import type { AaveVaultHolderShape } from "@/lib/sources/chain/aave-ethereum-vault";
import type { MorphoBaseVaultHolderShape } from "@/lib/sources/chain/morpho-base-vault";

export type HolderShape = AaveVaultHolderShape | MorphoBaseVaultHolderShape;

const n = (v: number) => v.toLocaleString("en-US");

function sentence(shape: HolderShape, block: number): { verdict: string; rest: string; follow?: string } {
  const at = `at block ${n(block)}`;
  switch (shape.kind) {
    case "eoa":
      return { verdict: `has no code ${at}`, rest: ": an externally owned account." };
    case "delegated-account":
      return {
        verdict: `is an account delegated by EIP-7702 ${at}`,
        rest: "; a key still controls it. The delegate is",
        follow: shape.delegate,
      };
    case "aave-vault":
      return {
        verdict: `is a contract ${at}`,
        rest: `: a vault in this same catalogue${shape.symbol ? `, ${shape.symbol}` : ""}, holding for its own holders.`,
      };
    case "metamorpho-vault":
      return {
        verdict: `is a contract ${at}`,
        rest: `: the MetaMorpho vault ${shape.name}, holding for its own holders.`,
      };
    case "safe":
      return { verdict: `is a Safe (${shape.version}) ${at}`, rest: "." };
    case "erc4626": {
      const asset = shape.assetIsVaultShares
        ? "this vault's own shares"
        : "assetSymbol" in shape && shape.assetSymbol
          ? shape.assetSymbol
          : shortAddress(shape.asset);
      return {
        verdict: `is a contract ${at}`,
        rest: `: ${shape.name ?? "an"} ERC-4626 vault over ${asset}, holding for its own holders.`,
      };
    }
    case "erc1967-proxy":
    case "eip1167-proxy":
      return {
        verdict: `is a proxy to ${shortAddress(shape.implementation)} ${at}`,
        rest: "; what the implementation is takes reading it, and nothing here names it.",
      };
    case "attested":
      return { verdict: `is a contract ${at}`, rest: "" };
    case "contract":
      return {
        verdict: `is a contract ${at}`,
        rest: `: ${n(shape.codeSize)} bytes${shape.name ? `, answering to ${shape.name}` : ""}.`,
      };
  }
}

export function HolderShapeLine({
  shape,
  blockNumber,
  chainId,
  prov,
  nameProv,
}: {
  shape: HolderShape;
  blockNumber: number;
  chainId: ChainId;
  /** The code read's receipt. */
  prov: Provenance;
  /** A registry name's receipt, on an attested address. */
  nameProv?: Provenance;
}) {
  const { verdict, rest, follow } = sentence(shape, blockNumber);
  return (
    <span
      data-figure="holder-shape"
      data-holder-shape-kind={shape.kind}
      data-attested-constant={shape.kind === "attested" ? shape.attested.constant : undefined}
      data-attested-via={shape.kind === "attested" ? shape.attested.via : undefined}
    >
      This address <Prov info={prov}>{verdict}</Prov>
      {shape.kind === "attested" ? (
        <>
          , named{" "}
          {nameProv ? (
            <Prov info={nameProv}>
              <span className="font-mono">{attestedShortName(shape.attested)}</span>
            </Prov>
          ) : (
            <span className="font-mono">{attestedShortName(shape.attested)}</span>
          )}
          : {attestedFaceClause(shape.attested)}.
          {shape.underlyingIsVaultShares
            ? " Its own UNDERLYING_ASSET() is this vault's share token, read at the same block."
            : shape.underlying
              ? ` Its own UNDERLYING_ASSET() is ${shortAddress(shape.underlying)}, read at the same block.`
              : ""}
        </>
      ) : (
        rest
      )}
      {follow && (
        <>
          {" "}
          <a
            href={explorerUrl(chainId, "address", follow)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external font-mono"
            data-holder-delegate={follow}
          >
            {shortAddress(follow)}
          </a>
          .
        </>
      )}
    </span>
  );
}
