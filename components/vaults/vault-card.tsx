"use client";

// The vault card (V2, rails-ops ui-jobs 407; survey 2026-10-20 §6): the head of
// every vault page, drawn as the shared card's detail surface (decision 0043:
// the family supplies figures and words, never which parts exist).
// ----------------------------------------------------------------------------
// No sidebar (C20): that marks a position. The protocol's mark and name lead
// the heading row and the chain's glyph ends it (C20.1, C20.2). Heading
// "Vault summary", the status tag where the contract says the vault is
// shut down or paused, the identity (the asset's icon with the venue mark, the
// name, the short address with copy, the neutral pills) and the ⋮. Headlines
// Total assets · Share price · Yield · Holders (decision 0047 point 5), each
// label opening its read-more (decision 0038). The family's stats, at most six
// (decision 0040), with "Steward" for the role the contract names; addresses,
// never a curator's name (decision 0017 point 5). The (i) and the "?" carry the
// mechanic. The read stamp sits at the right of the heading row. The ⋮ holds
// Rails's pages, the off-site pages (the vault, its factory and steward on the
// chain's explorer, the venue's app and docs), the exports and "Inspect
// provenance" (components/shared/section-menu.tsx).

import { useState, type ReactNode } from "react";
import {
  PositionCard,
  type PositionCardHead,
  type PositionCardStatus,
  type PositionPanelRow,
} from "@/components/shared/position-card";
import { POSITION_CARD_MAX_STATS } from "@/components/shared/position-card-panel";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { Prov } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import { Icon } from "@/components/icons/icon";
import { SectionMenuRows, type SectionMenuLink } from "@/components/shared/section-menu";
import { VaultLead, VaultPills, vaultHeads, type VaultRowReceipts } from "@/components/vaults/vault-heads";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import type { VaultSummary } from "@/lib/vaults/summary";
import { yieldText, type VaultYield } from "@/lib/vaults/yield";
import { ExplainBullet, Fig } from "@/components/shared/explain-groups";
import { useBlockTime } from "@/components/shared/read-stamp";
import { formatDate } from "@/lib/date";
import type { ChainId } from "@/lib/shared/chains";
import { vaultCardCsv, vaultCardMarkdown, type VaultExportModel } from "@/lib/vaults/card-export";

/** A row of the ⋮ that opens a page: a Rails page, an explorer address, the
 *  venue's app, the docs. */
export type VaultMenuLink = SectionMenuLink;

export interface VaultCardProps {
  vault: VaultSummary;
  yieldFigure?: VaultYield;
  /** The positions listing filtered to this vault; null where there is none. */
  holdersHref: string | null;
  receipts: VaultRowReceipts;
  /** "Shut down" or "Paused" where the contract says so. */
  status: PositionCardStatus | null;
  /** The family's stats, in the card's order. */
  stats: PositionPanelRow[];
  /** The ⋮'s page rows: Rails's pages first, then the vault's explorer page,
   *  the factory, the created block, the steward, the venue's app and docs. */
  links: VaultMenuLink[];
  /** The (i) pane's bullets. */
  explanation: ReactNode;
  learnMore: LearnMoreContent;
  /** The read stamp in the heading row ("Read 10:12 UTC", `SectionReadStamp`),
   *  the block and the contracts read in its receipt. */
  stamp: ReactNode;
  /** The stats and the table in words, for Copy, View as Markdown and
   *  Download CSV. */
  exports: VaultExportModel;
  /** `data-*` hooks on the card's frame, which the family's verifier reads. */
  hooks?: Record<string, string>;
  /** A full-width strip under the stats: an illiquid vault's markets (ui-jobs 540). */
  band?: ReactNode;
  /** The family's identity hooks: on the standing pills. */
  pillHooks?: Parameters<typeof VaultPills>[0]["hooks"];
  /** The headlines in place of `vaultHeads`'s (the MetaMorpho page's);
   *  absent on the other families' pages. */
  heads?: PositionCardHead[];
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <RevealTip tip={copied ? "Copied!" : "Copy"}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          void navigator.clipboard.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        aria-label={copied ? "Copied address" : "Copy address"}
        className="cursor-pointer text-rb-500 hover:text-foreground"
      >
        <Icon name={copied ? "check" : "copy"} size={12} />
      </button>
    </RevealTip>
  );
}

export function VaultCard({
  vault: v,
  yieldFigure,
  holdersHref,
  receipts,
  status,
  stats,
  links,
  explanation,
  learnMore,
  stamp,
  exports,
  hooks,
  pillHooks,
  band,
  heads,
}: VaultCardProps) {
  const markdown = () => vaultCardMarkdown(v, yieldFigure, exports);
  const csv = {
    filename: `${v.symbol ?? v.address}-vault-${v.readAt.block}.csv`,
    build: () => vaultCardCsv(v, yieldFigure, exports),
  };
  const name = v.name ?? v.catalogName ?? v.symbol ?? shortAddress(v.address);
  if (process.env.NODE_ENV !== "production" && stats.length > POSITION_CARD_MAX_STATS)
    console.warn(`[vault-card] ${stats.length} stats: the card holds at most ${POSITION_CARD_MAX_STATS}`);

  const identity = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5" data-vault-identity="">
      <VaultLead vault={v} size={24} />
      <h1 className="text-sm font-semibold text-foreground" data-vault-name>
        {v.name != null && receipts.name ? <Prov info={receipts.name}>{v.name}</Prov> : name}
      </h1>
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-rb-500" data-vault-address={v.address}>
        {shortAddress(v.address)}
        <CopyAddress address={v.address} />
      </span>
      <VaultPills vault={v} receipts={receipts} hooks={pillHooks} />
    </span>
  );

  return (
    <section
      className="mb-6"
      data-anatomy="V2"
      data-vault-card={v.address}
      data-vault-page={v.address}
      data-vault-family={v.family}
      data-vault-block={v.readAt.block}
      data-vault-figures=""
      data-total-assets-raw={v.totalAssets?.raw ?? ""}
      data-total-supply-raw={v.totalSupply?.raw ?? ""}
      data-share-price-raw={v.sharePrice?.raw ?? ""}
      {...hooks}
    >
      <PositionCard
        slots={{
          surface: "detail",
          sidebar: false,
          heading: "Vault summary",
          status,
          identity,
          heads: heads ?? vaultHeads({ vault: v, yieldFigure, holdersHref, receipts, detail: true }),
          panel: [stats, []],
          band,
          counters: null,
          menu: {
            leading: (close) => (
              <SectionMenuRows
                close={close}
                links={links}
                exports={{
                  markdown: { build: markdown, copySubtitle: "The card as Markdown, for an LLM" },
                  csv: { ...csv, subtitle: "The figures and where the assets are" },
                }}
              />
            ),
            exports: null,
          },
          stamp: <span data-vault-read-at={v.readAt.block}>{stamp}</span>,
          explainer: { body: explanation },
          learnMore,
        }}
      />
    </section>
  );
}

/** The (i) pane's Rate bullets every family shares: the Yield figure as
 *  Rails's interpretation, and what it leaves out (decision 0047 point 3). */
export function YieldBullets({ yieldFigure, rewards }: { yieldFigure?: VaultYield; rewards: string }) {
  return (
    <>
      {yieldFigure && "yearly" in yieldFigure ? (
        <ExplainBullet>
          Yield <Fig>{yieldText(yieldFigure.yearly)}</Fig> is Rails&rsquo;s figure from two share-price reads{" "}
          {yieldFigure.days} days apart.
        </ExplainBullet>
      ) : yieldFigure?.none === "too-small" ? (
        <ExplainBullet>
          No yield figure: the vault holds under 10,000 raw units of its asset, so one unit of rounding moves its share
          price by more than 0.01%.
        </ExplainBullet>
      ) : (
        <ExplainBullet>No yield figure: the daily series is under 30 days old or was not read.</ExplainBullet>
      )}
      <ExplainBullet>The yield is net of fees taken inside the share; {rewards} are not counted.</ExplainBullet>
    </>
  );
}

/** The (i) pane's History line: "Created on 3 Mar 2024 by …", the date from
 *  the creation block's time; until that answers, or where it fails, the
 *  clause without it. */
export function CreatedBullet({ chainId, block, by }: { chainId: ChainId; block: number | null; by: string }) {
  const at = useBlockTime(chainId, block);
  return (
    <ExplainBullet data-vault-created={block != null ? String(block) : ""}>
      Created{at != null && <> on {formatDate(new Date(at * 1000))}</>} by {by}.
    </ExplainBullet>
  );
}
