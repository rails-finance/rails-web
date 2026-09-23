"use client";

// The pieces the two MetaMorpho exposure surfaces share.
// ----------------------------------------------------------------------------
// Two pages ask the same question from opposite ends: /base/morpho/vaults/<vault>
// starts at a vault and looks up an address, the retired find door started
// at an address and finds the vaults. Everything below is what both of them draw
// — the formatting rules, the stat card, the sentence stating what the address
// is, and the attributed-per-market table.
//
// It lives here rather than being written twice because the ARITHMETIC AND THE
// FORMATTING CONTRACT ARE THE CLAIM. The amount rule (two decimals for a
// six-decimal asset, six for an 18-decimal one, and a non-zero amount that would
// round to nothing printed exactly from its raw units) was got wrong once, in a
// way that was invisible to every wei-exact check because the verifier restated
// the same wrong contract; a second copy of it would be a second place for that
// to happen, and the two pages could print the same wei differently.

import { Prov } from "@/components/shared/provenance";
import { explorerUrl } from "@/lib/shared/chains";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import {
  vaultAttributedProv,
  vaultAttributedTotalProv,
  vaultHolderShapeProv,
  vaultLegAssetsProv,
  type MorphoVaultCoords,
} from "@/lib/morpho-base/vault-provenance";
import type { MorphoBaseVaultHolderShape, MorphoBaseVaultLeg, RawAmount } from "@/lib/sources/chain/morpho-base-vault";

// The print rules themselves now live in lib/shared/vault-amount-text.ts, a
// module both runtimes can read: this file is "use client", and the section's
// SERVER callers (the share card an unfurl renders, a page building the strings
// a card's props carry) could not call an export of it at all. They are
// re-exported here so every existing caller keeps importing them from the file
// its header still describes — and so there is still exactly one copy.
export { assetText, shareText, pctText, shortId, shortAddress } from "@/lib/shared/vault-amount-text";
import { assetText, shortAddress, shortId } from "@/lib/shared/vault-amount-text";

/** The token a wrapper's `asset()` named, as it can be stated: its symbol where
 *  one resolved, and the address itself where none did. Never a symbol invented
 *  from an address. */
const assetNamed = (symbol: string | null, address: string) => symbol ?? shortAddress(address);

export function StatCard({
  label,
  children,
  note,
  figure,
}: {
  label: string;
  children: React.ReactNode;
  note?: React.ReactNode;
  /** A stable handle for the card's value, so a verifier reads THIS figure
   *  rather than the nth element that happens to look like a number. */
  figure: string;
}) {
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5" data-figure={figure}>
      <div className="text-[11px] uppercase tracking-wider text-rb-500">{label}</div>
      {/* `data-figure-value` marks the VALUE alone, apart from the label above
          it and the note below. A verifier reading `[data-figure]` gets the
          whole card's text — label, figure and note in one string — which makes
          a comparison against a formatted figure either impossible or so loose
          it would pass on a substring. This is the handle for the figure
          itself. */}
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground" data-figure-value>
        {children}
      </div>
      {note && <p className="mt-1 text-[11px] leading-relaxed text-rb-500">{note}</p>}
    </div>
  );
}

/** The sentence under the holder pill: what the address IS, from the code read
 *  at the same block. Split in two so the block-bearing clause can carry the
 *  receipt and the rest can stay prose.
 *
 *  It states a MECHANISM, never an identity. A proxy is reported as a proxy to a
 *  named address — the implementation is printed for the reader to follow, and
 *  no label is put on it from the shape of its ABI. A contract that holds shares
 *  holds them for whoever holds it, and the page says so and keeps attributing
 *  to the address, which is the only party the chain names. */
function shapeSentence(
  shape: MorphoBaseVaultHolderShape,
  blockNumber: number,
): { verdict: string; rest: string; onBehalf: boolean; delegate?: string } {
  const at = `at block ${blockNumber.toLocaleString("en-US")}`;
  const bytes = `${shape.codeSize.toLocaleString("en-US")} bytes of code`;
  switch (shape.kind) {
    case "eoa":
      return { verdict: `has no code ${at}`, rest: ": an externally owned account.", onBehalf: false };
    case "delegated-account":
      return {
        // NEUTRAL, AND NAMED BY ADDRESS. An app whose delegate this is may be
        // named on its own tile and guide, where the evidence for the name sits
        // beside it; a holder reading names the address and nothing else.
        verdict: `is an account delegated to ${shortAddress(shape.delegate)} ${at}`,
        rest: `: its ${bytes} are the EIP-7702 delegation indicator — “0xef0100” followed by that address — so a key still controls the account and its code is the delegate's.`,
        onBehalf: false,
        delegate: shape.delegate,
      };
    case "metamorpho-vault":
      return {
        verdict: `is a contract ${at}`,
        rest: `: the MetaMorpho vault ${shape.name}${shape.symbol ? ` (${shape.symbol})` : ""}${
          shape.asset
            ? shape.assetIsVaultShares
              ? ", an ERC-4626 vault whose asset is this vault's own shares"
              : `, an ERC-4626 vault whose asset is ${assetNamed(shape.assetSymbol, shape.asset)}`
            : ""
        }.`,
        onBehalf: true,
      };
    case "safe":
      return {
        verdict: `is a Safe (${shape.version}) ${at}`,
        rest: `: its ${shape.evidence} names the released singleton at ${shortAddress(shape.singleton)}.`,
        onBehalf: false,
      };
    case "erc4626":
      return {
        verdict: `is a contract ${at}`,
        rest: `: ${shape.name ? `${shape.name}${shape.symbol ? ` (${shape.symbol})` : ""}, an` : "an"} ERC-4626 vault whose asset is ${
          shape.assetIsVaultShares ? "this vault's own shares" : assetNamed(shape.assetSymbol, shape.asset)
        }.`,
        onBehalf: true,
      };
    case "erc1967-proxy":
      return {
        verdict: `is a proxy to ${shortAddress(shape.implementation)} ${at}`,
        rest: `: that address is what its EIP-1967 implementation slot holds. What the implementation is takes reading it; nothing here names it.`,
        onBehalf: false,
      };
    case "eip1167-proxy":
      return {
        verdict: `is a proxy to ${shortAddress(shape.implementation)} ${at}`,
        rest: `: its ${bytes} are the EIP-1167 minimal proxy, with that address embedded in them. What the implementation is takes reading it; nothing here names it.`,
        onBehalf: false,
      };
    case "contract":
      return {
        verdict: `is a contract ${at}`,
        rest: `: ${bytes}${
          shape.name || shape.symbol
            ? `, answering to ${shape.name ?? "no name"}${shape.symbol ? ` (${shape.symbol})` : ""}`
            : ""
        }. It answers no asset(), its storage slot 0 names no Safe singleton, and its EIP-1967 implementation slot is empty.`,
        onBehalf: false,
      };
  }
}

/** The shape line itself. The clause naming the block carries the receipt (the
 *  evidence is the code read, and the block is part of it); the rest is prose,
 *  which is why it is not wrapped. Absent entirely when the code read did not
 *  answer — an unread address gets no sentence rather than a guessed one. */
export function HolderShapeLine({
  shape,
  blockNumber,
  coords,
  /** What the shares are held in, where there is one thing to name. The
   *  holder-first page attributes across several vaults, so it says "shares"
   *  plainly rather than naming a vault it has not singled out. */
  subject = "The shares it holds",
}: {
  shape: MorphoBaseVaultHolderShape;
  blockNumber: number;
  coords: MorphoVaultCoords;
  subject?: string;
}) {
  const { verdict, rest, onBehalf, delegate } = shapeSentence(shape, blockNumber);
  return (
    <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-figure="holder-shape">
      This address <Prov info={vaultHolderShapeProv(coords, shape)}>{verdict}</Prov>
      {rest}
      {delegate ? (
        <>
          {" "}
          The delegate is{" "}
          <a
            href={explorerUrl(MORPHO_BASE_CHAIN_ID, "address", delegate)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external font-mono"
            data-holder-delegate={delegate}
          >
            {delegate}
          </a>
          ; what it is takes reading it, and nothing here names it.
        </>
      ) : null}
      {onBehalf
        ? ` ${subject} are held on behalf of its own holders; this page attributes them to the address, not to whoever holds it.`
        : ""}
    </p>
  );
}

/** The attributed-per-market table: one row per market in the vault's withdraw
 *  queue, the vault's own supplied balance beside the holder's slice of it, and
 *  the Σ of those slices.
 *
 *  ONE COPY OF THE ARITHMETIC, drawn by both pages. Every figure here is already
 *  computed by the loader (`leg.attributed`, `holder.attributedTotal`); this
 *  component prints them and nothing else, so the two pages cannot disagree
 *  about what an address's slice of a market is. */
export function VaultAttributionTable({
  legs,
  coords,
  holder,
  unit,
  assetDecimals,
  attributedTotal,
}: {
  legs: readonly MorphoBaseVaultLeg[];
  /** The vault's coordinates — the market id and holder are added per row. */
  coords: MorphoVaultCoords;
  holder: string;
  /** The asset's symbol, named in the column headings rather than in the cells. */
  unit: string;
  assetDecimals: number;
  attributedTotal: RawAmount;
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[36rem] text-[12px]">
        <thead>
          <tr className="border-b border-rb-200 text-left text-[11px] uppercase tracking-wider text-rb-500 dark:border-rb-500/30">
            <th className="py-2 pr-3 font-normal">Market</th>
            <th className="py-2 pr-3 text-right font-normal">Vault supplied · {unit}</th>
            <th className="py-2 text-right font-normal">Attributed · {unit}</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((leg) => {
            const legCoords: MorphoVaultCoords = {
              ...coords,
              marketId: leg.id,
              collateralSymbol: leg.collateralSymbol,
              holder,
            };
            return (
              <tr key={leg.id} data-exposure-leg={leg.id} className="border-b border-rb-200/60 dark:border-rb-500/20">
                <td className="py-2 pr-3">
                  <span className={leg.collateralNamed ? "text-foreground" : "font-mono text-foreground"}>
                    {leg.isIdle ? "Idle market" : (leg.collateralSymbol ?? shortId(leg.id))}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-rb-500">
                  <Prov info={vaultLegAssetsProv(legCoords)}>{assetText(leg.assets, assetDecimals)}</Prov>
                </td>
                <td className="py-2 text-right tabular-nums text-foreground" data-cell="attributed">
                  <Prov info={vaultAttributedProv(legCoords)}>
                    {assetText(leg.attributed ?? { raw: "0", value: 0 }, assetDecimals)}
                  </Prov>
                </td>
              </tr>
            );
          })}
          <tr>
            <td className="py-2 pr-3 text-[11px] uppercase tracking-wider text-rb-500">Total</td>
            <td className="py-2 pr-3" />
            <td className="py-2 text-right tabular-nums text-foreground" data-figure="attributed-total">
              <Prov info={vaultAttributedTotalProv(coords)}>{assetText(attributedTotal, assetDecimals)}</Prov>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
