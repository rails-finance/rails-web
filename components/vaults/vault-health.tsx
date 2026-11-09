"use client";

// "How the vault is doing" (V7; rails-ops ui-jobs 553, door 1): a section
// under the holding card on the MetaMorpho, Aave and Yearn holder pages. Five
// lines (lib/vaults/health.ts), each the question, a one-word answer and one
// sentence, the sentence traced to its reads (lib/vaults/health-provenance.ts).
// No colour carries a verdict: every answer is the same ink. A line Rails
// does not read for the family says so, muted. The section is one receipts
// scope its ⋮ arms (decision 0059).

import { Prov } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu, type SectionMenuLink } from "@/components/shared/section-menu";
import { SectionReadStamp, readStampProv, type ReadContract } from "@/components/shared/read-stamp";
import { SectionExplainer } from "@/components/shared/section-explainer";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import type { ChainId } from "@/lib/shared/chains";
import type { ServerRead } from "@/lib/shared/server-head-read";
import type { HealthLine } from "@/lib/vaults/health";
import { healthLineProv, type HealthReceiptVault } from "@/lib/vaults/health-provenance";

/** The section's scope: its ⋮ arms the inspector on it alone. */
export const HEALTH_SCOPE = "vault-health";

const TITLE = "How the vault is doing";

/** The lines as Markdown, for the ⋮'s Copy. */
function healthMarkdown(name: string, lines: readonly HealthLine[]): string {
  return [
    `## ${TITLE}: ${name}`,
    "",
    ...lines.map((l) => `- **${l.question}**${l.word ? `: ${l.word}.` : "."} ${l.sentence}`),
  ].join("\n");
}

function HealthRow({ line, vault, block }: { line: HealthLine; vault: HealthReceiptVault; block: number }) {
  const info = healthLineProv(line, vault, block);
  return (
    <li
      className="py-2.5 first:pt-0 last:pb-0"
      data-anatomy="V7.1"
      data-health-line={line.key}
      data-health-read={line.read ? "" : undefined}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium text-foreground">{line.question}</span>
        {line.word && (
          <span className="font-semibold text-foreground" data-health-word="">
            {line.word}
          </span>
        )}
      </div>
      <p
        className={`text-[13px] leading-snug ${line.read ? "text-foreground" : "text-rb-500"}`}
        data-health-sentence=""
      >
        {info ? <Prov info={info}>{line.sentence}</Prov> : line.sentence}
      </p>
    </li>
  );
}

export function VaultHealth({
  lines,
  vault,
  chainId,
  block,
  readBy,
  contracts,
  links,
  className = "mb-6",
}: {
  lines: HealthLine[];
  vault: HealthReceiptVault;
  chainId: ChainId;
  /** The page's read block: the exit, the steward and lost assets. */
  block: number;
  readBy?: ServerRead | null;
  /** What the read stamp's receipt lists as read at the block. */
  contracts: ReadContract[];
  links?: SectionMenuLink[];
  className?: string;
}) {
  return (
    <ProvSection
      scope={HEALTH_SCOPE}
      className={className}
      data-anatomy="V7"
      data-vault-health={vault.address}
      data-skel-section="vault-health"
    >
      <SectionHeading
        title={TITLE}
        stamp={
          block > 0 ? (
            <SectionReadStamp
              chainId={chainId}
              block={block}
              readBy={readBy}
              info={(at) =>
                readStampProv({
                  chainId,
                  block,
                  at,
                  readBy,
                  what: "Every figure in this section read at the page's block",
                  contracts,
                })
              }
            />
          ) : undefined
        }
        menu={
          <SectionMenu
            scope={HEALTH_SCOPE}
            title={TITLE}
            links={links}
            exports={{ markdown: { build: () => healthMarkdown(vault.name, lines) } }}
          />
        }
      />
      <div className="mt-2 rounded-xl border border-rb-200 px-4 py-3 dark:border-rb-500/30">
        <ul className="divide-y divide-rb-200 dark:divide-rb-500/30">
          {lines.map((l) => (
            <HealthRow key={l.key} line={l} vault={vault} block={block} />
          ))}
        </ul>
      </div>
      <SectionExplainer
        label="explanation of these lines"
        className="mt-2"
        slot={{
          body: (
            <>
              <ExplainGroup title="What it reads">
                <ExplainBullet>
                  Size, yield and falls come from the vault&rsquo;s total assets and share price, read once a day.
                </ExplainBullet>
                <ExplainBullet>
                  Getting out, losses on record and who runs it are read at this page&rsquo;s block.
                </ExplainBullet>
                <ExplainBullet>
                  A yield is the share price&rsquo;s growth over the window, as a yearly rate.
                </ExplainBullet>
              </ExplainGroup>
              <ExplainGroup title="The words">
                <ExplainBullet>
                  Steady: each 30 days of the last 90 earned within a quarter of the 30-day yield, or within one point.
                </ExplainBullet>
                <ExplainBullet>Flat: the share price has not moved.</ExplainBullet>
                <ExplainBullet>
                  Rails states the figures and rates nothing. A grey line is one Rails does not read for this vault yet.
                </ExplainBullet>
              </ExplainGroup>
            </>
          ),
        }}
      />
    </ProvSection>
  );
}
