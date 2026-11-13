"use client";

// "How the vault is doing" (V7; rails-ops ui-jobs 553, door 1): a section
// under the holding card on the MetaMorpho, Aave and Yearn holder pages. Five
// lines (figures lib/vaults/health.ts, words lib/vaults/health-words.ts),
// each a label, the measured figure with its window and one sentence, the
// figure traced to its reads (lib/vaults/health-provenance.ts). No colour
// carries a verdict. A line Rails does not read for the family says so,
// muted. The section is one receipts scope (decision 0059).

import { Prov } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu, type SectionMenuLink } from "@/components/shared/section-menu";
import { SectionReadStamp, readStampProv, type ReadContract } from "@/components/shared/read-stamp";
import { SectionExplainer } from "@/components/shared/section-explainer";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import type { ChainId } from "@/lib/shared/chains";
import type { ServerRead } from "@/lib/shared/server-head-read";
import type { Health } from "@/lib/vaults/health";
import { HEALTH_DISCLAIMER, HEALTH_EXPLAINER, HEALTH_TITLE, type HealthLine } from "@/lib/vaults/health-words";
import { healthLineProv, type HealthReceiptVault } from "@/lib/vaults/health-provenance";

/** The section's name (`data-prov-scope`). */
export const HEALTH_SCOPE = "vault-health";

/** The lines as Markdown, for the ⋮'s Copy. */
function healthMarkdown(name: string, lines: readonly HealthLine[]): string {
  return [
    `## ${HEALTH_TITLE}: ${name}`,
    "",
    ...lines.map((l) => `- **${l.label}**: ${[l.headline, l.sentence].filter(Boolean).join(". ")}`),
    "",
    HEALTH_DISCLAIMER,
  ].join("\n");
}

function HealthRow({
  line,
  health,
  vault,
  block,
}: {
  line: HealthLine;
  health: Health;
  vault: HealthReceiptVault;
  block: number;
}) {
  const info = healthLineProv(line.key, health, vault, block);
  return (
    <li
      className="grid gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[7rem_minmax(0,1fr)]"
      data-anatomy="V7.1"
      data-health-line={line.key}
      data-health-read={line.read ? "" : undefined}
    >
      <span className="text-xs font-semibold text-rb-500 sm:pt-0.5">{line.label}</span>
      <div className="min-w-0">
        {line.headline && (
          <p className="text-sm font-medium text-foreground" data-health-headline="">
            {info ? <Prov info={info}>{line.headline}</Prov> : line.headline}
          </p>
        )}
        {line.sentence && (
          <p
            className={`text-[13px] leading-snug ${line.read ? "text-foreground" : "text-rb-500"}`}
            data-health-sentence=""
          >
            {line.sentence}
          </p>
        )}
      </div>
    </li>
  );
}

export function VaultHealth({
  lines,
  health,
  vault,
  chainId,
  block,
  readBy,
  contracts,
  links,
  className = "mb-6",
}: {
  lines: HealthLine[];
  health: Health;
  vault: HealthReceiptVault;
  chainId: ChainId;
  /** The page's read block: withdrawals, the steward and lost assets. */
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
        title={HEALTH_TITLE}
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
            title={HEALTH_TITLE}
            links={links}
            exports={{ markdown: { build: () => healthMarkdown(vault.name, lines) } }}
          />
        }
      />
      <div className="mt-2 rounded-xl border border-rb-200 px-4 py-3 dark:border-rb-500/30">
        <ul className="divide-y divide-rb-200 dark:divide-rb-500/30">
          {lines.map((l) => (
            <HealthRow key={l.key} line={l} health={health} vault={vault} block={block} />
          ))}
        </ul>
      </div>
      <SectionExplainer
        label={HEALTH_EXPLAINER.label}
        className="mt-2"
        slot={{
          body: (
            <>
              <p className="text-sm leading-snug text-foreground" data-health-disclaimer="">
                {HEALTH_DISCLAIMER}
              </p>
              <ExplainGroup title={HEALTH_EXPLAINER.readsTitle}>
                {HEALTH_EXPLAINER.reads.map((r) => (
                  <ExplainBullet key={r}>{r}</ExplainBullet>
                ))}
                <ExplainBullet>{HEALTH_EXPLAINER.greyed}</ExplainBullet>
              </ExplainGroup>
            </>
          ),
        }}
      />
    </ProvSection>
  );
}
