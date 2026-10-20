"use client";

// The vault card (V2, rails-ops ui-jobs 407; survey 2026-10-20 §6): the head of
// every vault page, drawn as the shared card's detail surface (decision 0043:
// the family supplies figures and words, never which parts exist).
// ----------------------------------------------------------------------------
// Heading "Vault summary", the status tag where the contract says the vault is
// shut down or paused, the identity (the asset's icon with the venue mark, the
// name, the short address with copy, the neutral pills) and the ⋮. Headlines
// Total assets · Share price · Yield · Holders (decision 0047 point 5), each
// label opening its read-more (decision 0038). The family's stats, at most six
// (decision 0040), with "Steward" for the role the contract names; addresses,
// never a curator's name (decision 0017 point 5). The (i) and the "?" carry the
// mechanic. The ⋮ holds the vault's addresses and pages, the exports and
// "Inspect provenance".

import { useState, type ReactNode } from "react";
import { Copy, Download, ExternalLink, FileText } from "lucide-react";
import { PositionCard, type PositionCardStatus, type PositionPanelRow } from "@/components/shared/position-card";
import { POSITION_CARD_MAX_STATS } from "@/components/shared/position-card-panel";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { Prov } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import { Icon } from "@/components/icons/icon";
import { ToolsMenuItem } from "@/components/shared/tools-menu";
import { VaultLead, VaultPills, vaultHeads, type VaultRowReceipts } from "@/components/vaults/vault-heads";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import type { VaultSummary } from "@/lib/vaults/summary";
import { yieldText, type VaultYield } from "@/lib/vaults/yield";
import { ExplainBullet, Fig } from "@/components/shared/explain-groups";
import { vaultCardCsv, vaultCardMarkdown, type VaultExportModel } from "@/lib/vaults/card-export";

/** A row of the ⋮ that opens a page: an explorer address, the venue's page. */
export interface VaultMenuLink {
  title: string;
  subtitle: string;
  href: string;
  item: string;
  /** A page on this site; absent or false opens in a new tab. */
  internal?: boolean;
}

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
  /** The ⋮'s identity rows: the vault's explorer page, the factory, the
   *  created block, the venue's page, the official docs. */
  links: VaultMenuLink[];
  /** The (i) pane's bullets. */
  explanation: ReactNode;
  learnMore: LearnMoreContent;
  /** The line at the card's foot: the block the figures were read at. */
  readAt: ReactNode;
  /** The stats and the table in words, for Copy, View as Markdown and
   *  Download CSV. */
  exports: VaultExportModel;
  /** `data-*` hooks on the card's frame, which the family's verifier reads. */
  hooks?: Record<string, string>;
  /** The family's identity hooks: on the standing pills. */
  pillHooks?: Parameters<typeof VaultPills>[0]["hooks"];
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

/** The ⋮'s rows above "Inspect provenance": the vault's addresses and pages,
 *  then Copy, View as Markdown and Download CSV. */
function MenuRows({
  close,
  links,
  markdown,
  csv,
}: {
  close: () => void;
  links: VaultMenuLink[];
  markdown: () => string;
  csv: { filename: string; build: () => string };
}) {
  const [copied, setCopied] = useState(false);
  const open = (text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  return (
    <>
      {links.map((l) => (
        <ToolsMenuItem
          key={l.item}
          icon={<ExternalLink size={16} />}
          title={l.title}
          subtitle={l.subtitle}
          href={l.href}
          external={!l.internal}
          item={l.item}
          onClick={close}
        />
      ))}
      <ToolsMenuItem
        icon={copied ? <Icon name="check" size={16} /> : <Copy size={16} />}
        title="Copy"
        subtitle={copied ? "Copied" : "The card as Markdown, for an LLM"}
        copied={copied}
        item="copy"
        onClick={() =>
          void navigator.clipboard.writeText(markdown()).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      />
      <ToolsMenuItem
        icon={<FileText size={16} />}
        title="View as Markdown"
        subtitle="Opens in a new tab"
        item="markdown"
        onClick={() => {
          open(markdown(), "text/plain;charset=utf-8");
          close();
        }}
      />
      <ToolsMenuItem
        icon={<Download size={16} />}
        title="Download CSV"
        subtitle="The figures and where the assets are"
        item="csv"
        onClick={() => {
          const url = URL.createObjectURL(new Blob([csv.build()], { type: "text/csv;charset=utf-8" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = csv.filename;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          close();
        }}
      />
    </>
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
  readAt,
  exports,
  hooks,
  pillHooks,
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
          heading: "Vault summary",
          status,
          identity,
          heads: vaultHeads({ vault: v, yieldFigure, holdersHref, receipts, detail: true }),
          panel: [stats, []],
          counters: null,
          menu: {
            leading: (close) => <MenuRows close={close} links={links} markdown={markdown} csv={csv} />,
            exports: null,
          },
          foot: (
            <p className="mt-4 text-[11px] text-rb-500" data-vault-read-at={v.readAt.block} data-prov-exempt>
              {readAt}
            </p>
          ),
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
      ) : (
        <ExplainBullet>No yield figure: the daily series is under 30 days old or was not read.</ExplainBullet>
      )}
      <ExplainBullet>It is net of fees taken inside the share; {rewards} are not counted.</ExplainBullet>
    </>
  );
}
