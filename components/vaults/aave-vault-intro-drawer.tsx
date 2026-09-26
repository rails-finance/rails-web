"use client";

// How this vault works, and what its figures are — off the face, one click away.
// ----------------------------------------------------------------------------
// The vault page used to state its family's whole mechanic and a paragraph on
// what its figures are before the reader reached a single number: 1,186 visible
// words on a position, against 492 on the reference position page. This drawer
// is where that prose went (plan §2.4). Nothing was deleted — the mechanic
// paragraphs and the "what these figures are" statement are here in full, and
// what each individual figure is now rides that figure's own receipt.
//
// ALWAYS MOUNTED, `hidden` WHEN CLOSED. The house `InfoDisclosure` unmounts its
// children, which would make every claim in here true only while a reader had
// it open — and absent from the initial HTML, where a verifier and a crawler
// both look. So the drawer is a plain `hidden` div and the trigger only flips
// the attribute (the same seam the vault-positions listing uses).
//
// PROSE ONLY. No `<Prov>` lives in here: a figure belongs beside the reading it
// is about, on the face, where its receipt can name the block it was read at.
// This drawer carries mechanics — what the contract DOES — which is not a
// reading and has no block.

import { useState } from "react";

import { InfoDisclosureTrigger } from "@/components/shared/info-disclosure";
import type { AaveVaultFamily } from "@/lib/aave-vaults/vault-catalog";

export function AaveVaultIntroDrawer({
  family,
  assetSymbol,
  /** The Umbrella wrapper's own symbol, when this token holds one — the hop the
   *  mechanic paragraph names. Null where the read did not answer. */
  wrapperSymbol,
}: {
  family: AaveVaultFamily;
  assetSymbol: string;
  wrapperSymbol?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-5" data-skel-section="vault-intro">
      <InfoDisclosureTrigger
        open={open}
        onToggle={() => setOpen((v) => !v)}
        label="how this vault works"
        surface="raised"
        ariaControls="vault-intro"
      >
        <span className="text-xs">How this vault works</span>
      </InfoDisclosureTrigger>

      <div
        id="vault-intro"
        data-intro-drawer
        hidden={!open}
        className="mt-2 max-w-3xl space-y-2 rounded-xl bg-raised px-3 py-3 text-[12px] leading-relaxed text-rb-500"
      >
        {family === "sgho" && (
          <>
            <h3 className="text-[13px] font-semibold text-foreground" data-intro-mechanic="sgho">
              How savings GHO works
            </h3>
            <p>
              One vault over {assetSymbol}, one hop. A holder&rsquo;s shares grow with a stored yield index rather than
              with a balance the vault receives, which is why <code>totalAssets()</code> is not the {assetSymbol} the
              contract holds: that figure is the index applied to the whole share supply, and the balance is a separate
              reading. Withdrawals are clamped to the balance. The rate the index grows at is a setting the risk council
              writes, and the vault accepts deposits up to a cap it also sets.
            </p>
            <p>
              <code>convertToAssets(shares)</code> is shares times the index over one RAY, and the index is grown by the
              rate and rewritten on every mint, burn and transfer. Neither the index nor the rate is compounded out to a
              period anywhere on this page.
            </p>
          </>
        )}

        {family === "stata" && (
          <>
            <h3 className="text-[13px] font-semibold text-foreground" data-intro-mechanic="stata">
              How a static aToken works
            </h3>
            <p>
              This vault wraps exactly one Aave V3 aToken, so a holder&rsquo;s shares are a non-rebasing claim on a
              supply position in the Aave V3 Core market. The share price is not this vault&rsquo;s own arithmetic: it
              is the reserve&rsquo;s accrued index in the Pool, which is why a wrapper holding nothing still answers a
              share price well clear of parity. There is no withdrawal delay and no queue — the only gates are the
              reserve being inactive or paused, and the wrapper&rsquo;s own pause flag.
            </p>
            <p>
              The reserve&rsquo;s liquidity index in the Pool is the same fact as the share price read from the other
              end. The Pool named beside it is the one the wrapper itself answers in <code>POOL()</code>, and the aToken
              is asked of the wrapper rather than searched for across Aave&rsquo;s three Ethereum Pools.
            </p>
            <p>
              The wrapper&rsquo;s <code>rewardTokens()</code> is a registry rather than the Pool&rsquo;s truth: a reward
              the Pool starts paying after the wrapper was deployed has to be registered by a permissionless call before
              it appears there, so the list can under-report and an empty one is not proof there is nothing to claim.
            </p>
          </>
        )}

        {family === "umbrella-stake" && (
          <>
            <h3 className="text-[13px] font-semibold text-foreground" data-intro-mechanic="umbrella-stake">
              How an Umbrella stake token works
            </h3>
            <p>
              Staked, and slashable. Umbrella owns this token and can take assets out of it to cover a deficit on the
              single reserve it covers; that lowers every holder&rsquo;s share price at once and emits nothing per
              holder. Exposure is isolated to that one reserve. Redemption runs through a cooldown a holder starts and a
              window that follows it, and outside the window <code>maxRedeem()</code> answers zero for a holder with a
              positive balance — a state, not missing data.
            </p>
            {wrapperSymbol && (
              <p>
                What this token holds is not the reserve asset: it holds {wrapperSymbol}, a static aToken and itself a
                vault in this section, which holds the aToken, which is the reserve. Every {assetSymbol} amount on this
                page is in that wrapper&rsquo;s units, and each hop is its own call.
              </p>
            )}
            <p>
              Past slashings are not read on this page: it reads state, never history, so an absence is an absence of
              history rather than evidence that none happened. What one holder would lose in a slashing that has not
              happened is a projection, and the way to keep refusing it is not to compute it.
            </p>
          </>
        )}

        <h3 className="text-[13px] font-semibold text-foreground" data-intro-figures>
          What these figures are
        </h3>
        <p>
          Every one of them is a call answered by a contract at the block named under the title — no indexer and no
          stored table for the readings. Amounts are quantities of the token named beside them and nothing is priced in
          USD, so two figures in two different tokens are never ordered against each other. A configuration read says
          what a setting IS at that block, never what it will be. Where an address is named, the events below its
          reading are that address&rsquo;s own logs, reconciled against the vault&rsquo;s own <code>balanceOf</code>{" "}
          before any of them is drawn.
        </p>
        <p>
          Shares are fungible and the vault pooled the deposits before anything was done with them, so two addresses
          holding equal shares carry equal figures here whatever they deposited and whenever. An address with a computed
          stake is not an identified person unless it carries a name of its own.
        </p>
      </div>
    </div>
  );
}
