"use client";

// "What protects it" (V9) and "The protocol underneath" (V10) on each vault
// page (rails-ops ui-jobs 554 pieces A and B): one line each, the label, the
// read fact as the headline (traced to its calls), one sentence and, muted,
// what Rails did not read. Words lib/vaults/protects-words.ts, receipts
// lib/vaults/protects-provenance.ts. No colour carries a verdict. Each
// section is one receipts scope (decision 0059); the first one's
// explanation carries the page's disclaimer.

import { Prov, type Provenance } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { SectionReadStamp, readStampProv, type ReadContract } from "@/components/shared/read-stamp";
import { SectionExplainer } from "@/components/shared/section-explainer";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import type { ChainId } from "@/lib/shared/chains";
import {
  PROTECTS_DISCLAIMER,
  PROTECTS_EXPLAINER,
  PROTECTS_TITLE,
  UNDERNEATH_EXPLAINER,
  UNDERNEATH_TITLE,
  UNREAD_TEXT,
  protectsMarkdown,
  type ProtectsLine,
} from "@/lib/vaults/protects-words";

export interface ProtectsSectionData {
  line: ProtectsLine;
  info: Provenance;
  contracts: ReadContract[];
}

const SECTIONS = {
  protects: { title: PROTECTS_TITLE, scope: "vault-protects", anatomy: "V9", explainer: PROTECTS_EXPLAINER },
  underneath: {
    title: UNDERNEATH_TITLE,
    scope: "vault-underneath",
    anatomy: "V10",
    explainer: UNDERNEATH_EXPLAINER,
  },
} as const;

/** How a line reads: "framed", the label column beside the headline over its
 *  sentence in a framed box (the live page); "paragraph", one unframed
 *  paragraph, the headline in semibold leading the muted sentence and gap,
 *  no label (the MetaMorpho page's grid). */
export type ProtectsLook = "framed" | "paragraph";

/** The full stop a headline lacks, if it lacks one. */
const stopFor = (t: string) => (/[.!?]$/.test(t) ? "" : ".");

function OneSection({
  which,
  data,
  chainId,
  block,
  vaultName,
  look,
}: {
  which: keyof typeof SECTIONS;
  data: ProtectsSectionData | null;
  chainId: ChainId;
  block: number;
  vaultName: string;
  look: ProtectsLook;
}) {
  const s = SECTIONS[which];
  const line = data?.line;
  return (
    <ProvSection scope={s.scope} className="mb-6" data-anatomy={s.anatomy} data-vault-protects={which}>
      <SectionHeading
        title={s.title}
        stamp={
          data && block > 0 ? (
            <SectionReadStamp
              chainId={chainId}
              block={block}
              info={(at) =>
                readStampProv({
                  chainId,
                  block,
                  at,
                  what: "Every figure in this section",
                  contracts: data.contracts,
                })
              }
            />
          ) : undefined
        }
        menu={
          <SectionMenu
            scope={s.scope}
            title={s.title}
            exports={line ? { markdown: { build: () => protectsMarkdown(s.title, vaultName, line) } } : undefined}
          />
        }
      />
      <div
        className={
          look === "paragraph" ? "mt-2" : "mt-2 rounded-xl border border-rb-200 px-4 py-3 dark:border-rb-500/30"
        }
      >
        {line && data && look === "paragraph" ? (
          <p className="text-[13px] leading-snug text-rb-500" data-protects-line="">
            <span className="font-semibold text-foreground" data-protects-headline="">
              <Prov info={data.info}>{line.headline}</Prov>
              {stopFor(line.headline)}
            </span>
            {line.sentence && (
              <>
                {" "}
                <span data-protects-sentence="">{line.sentence}</span>
              </>
            )}
            {line.gap && (
              <>
                {" "}
                <span data-protects-gap="">{line.gap}</span>
              </>
            )}
          </p>
        ) : line && data ? (
          <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[7rem_minmax(0,1fr)]" data-protects-line="">
            <span className="text-xs font-semibold text-rb-500 sm:pt-0.5">{line.label}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground" data-protects-headline="">
                <Prov info={data.info}>{line.headline}</Prov>
              </p>
              {line.sentence && (
                <p className="text-[13px] leading-snug text-foreground" data-protects-sentence="">
                  {line.sentence}
                </p>
              )}
              {line.gap && (
                <p className="text-[13px] leading-snug text-rb-500" data-protects-gap="">
                  {line.gap}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-[13px] leading-snug text-rb-500" data-protects-unread="">
            {UNREAD_TEXT}
          </p>
        )}
      </div>
      <SectionExplainer
        label={s.explainer.label}
        className="mt-2"
        slot={{
          body: (
            <>
              {which === "protects" && (
                <p className="text-sm leading-snug text-foreground" data-protects-disclaimer="">
                  {PROTECTS_DISCLAIMER}
                </p>
              )}
              <ExplainGroup title={s.explainer.readsTitle}>
                {s.explainer.reads.map((r) => (
                  <ExplainBullet key={r}>{r}</ExplainBullet>
                ))}
              </ExplainGroup>
            </>
          ),
        }}
      />
    </ProvSection>
  );
}

export function VaultProtects({
  chainId,
  block,
  vaultName,
  protects,
  underneath,
  look = "framed",
}: {
  chainId: ChainId;
  /** The block both sections were read at; 0 where the read failed. */
  block: number;
  vaultName: string;
  protects: ProtectsSectionData | null;
  underneath: ProtectsSectionData | null;
  look?: ProtectsLook;
}) {
  return (
    <>
      <OneSection which="protects" data={protects} chainId={chainId} block={block} vaultName={vaultName} look={look} />
      <OneSection
        which="underneath"
        data={underneath}
        chainId={chainId}
        block={block}
        vaultName={vaultName}
        look={look}
      />
    </>
  );
}
