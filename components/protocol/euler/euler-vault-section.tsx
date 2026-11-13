"use client";

// "The vault" (J2): the whole vault under an Euler V2 holding, read at the
// same two blocks as the card. One line each (J2.1) for supplied, borrowed,
// utilization, the share price over the window, the borrow APY now with the
// debts' growth over the window, and the oracle's price, each with its receipt. The section is one receipts scope its
// ⋮ arms (decision 0059).

import { Prov, type Provenance } from "@/components/shared/provenance";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { SectionExplainer } from "@/components/shared/section-explainer";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { Segs } from "@/components/protocol/uniswap/uniswap-readout";
import { EulerReadStamp } from "@/components/protocol/euler/euler-position-card";
import { eulerPosition } from "@/lib/euler/position";
import { vaultProv, type VaultLineKey, type WindowGrowthKey } from "@/lib/euler/provenance";
import type { EulerPositionRead } from "@/lib/euler/types";
import { VAULT_SECTION, num, rate, vaultExplainer } from "@/lib/euler/words";

const SCOPE = "euler-vault";

export function EulerVaultSection({ r }: { r: EulerPositionRead }) {
  const p = eulerPosition(r);
  const c = { p, r };
  const A = p.asset.symbol;
  // A line is one figure with its receipt, or several joined by ", " (the borrow APY now, the debts' growth over the window).
  const all: {
    key: VaultLineKey;
    label: string;
    text: string | null;
    parts?: { key: VaultLineKey | WindowGrowthKey; text: string }[];
  }[] = [
    { key: "supplied", label: VAULT_SECTION.supplied, text: `${num(p.totalSupplied)} ${A}` },
    { key: "borrowed", label: VAULT_SECTION.borrowed, text: `${num(p.totalBorrowed)} ${A}` },
    { key: "utilisation", label: VAULT_SECTION.utilisation, text: p.utilisation === null ? null : rate(p.utilisation) },
    {
      key: "shareGrowth",
      label: VAULT_SECTION.shareGrowth,
      text: p.window.shareGrowth === null ? null : VAULT_SECTION.shareGrowthText(p.window.shareGrowth, p.window.days),
    },
    (() => {
      const parts: { key: VaultLineKey | WindowGrowthKey; text: string }[] = [
        { key: "borrowApy", text: VAULT_SECTION.borrowApyNow(p.borrowApyNow) },
        ...(p.window.indexGrowth === null
          ? []
          : [
              {
                key: "borrowWindow" as const,
                text: VAULT_SECTION.debtGrowthText(p.window.indexGrowth, p.window.days),
              },
            ]),
      ];
      return {
        key: "borrowApy" as const,
        label: VAULT_SECTION.borrowApy,
        text: parts.map((x) => x.text).join(", "),
        parts,
      };
    })(),
    { key: "price", label: VAULT_SECTION.price, text: `1 ${A} = ${VAULT_SECTION.priceText(p)}` },
  ];
  // EULER_DOLLARS off: the oracle price line goes with the other dollar lines.
  const lines = all.filter((l) => l.key !== "price" || p.unit.kind !== "off");
  const markdown = () =>
    [
      `## ${VAULT_SECTION.title}: ${p.vaultSymbol}`,
      "",
      ...lines.map((l) => `- **${l.label}**: ${l.text ?? VAULT_SECTION.none}`),
    ].join("\n");
  const info = (k: VaultLineKey | WindowGrowthKey): Provenance => vaultProv(k, c);
  return (
    <ProvSection scope={SCOPE} data-anatomy="J2" data-euler-vault={p.vault}>
      <SectionHeading
        title={VAULT_SECTION.title}
        stamp={<EulerReadStamp c={c} what="Every figure in this section" />}
        menu={<SectionMenu scope={SCOPE} title={VAULT_SECTION.title} exports={{ markdown: { build: markdown } }} />}
      >
        <p className="text-xs text-rb-500">{VAULT_SECTION.sub}</p>
      </SectionHeading>
      <div className="mt-2 rounded-xl border border-rb-200 px-4 py-3 dark:border-rb-500/30">
        <ul className="divide-y divide-rb-200 dark:divide-rb-500/30">
          {lines.map((l) => (
            <li
              key={l.key}
              className="grid gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[7rem_minmax(0,1fr)]"
              data-anatomy="J2.1"
              data-euler-vault-line={l.key}
            >
              <span className="text-xs font-semibold text-rb-500 sm:pt-0.5">{l.label}</span>
              <p className="text-[13px] leading-snug text-foreground">
                {l.text === null ? (
                  <span className="text-rb-500">{VAULT_SECTION.none}</span>
                ) : l.parts ? (
                  l.parts.map((x, i) => (
                    <span key={x.key}>
                      {i > 0 && ", "}
                      <Prov info={info(x.key)}>{x.text}</Prov>
                    </span>
                  ))
                ) : (
                  <Prov info={info(l.key)}>{l.text}</Prov>
                )}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <SectionExplainer
        label={VAULT_SECTION.explainerLabel}
        className="mt-2"
        slot={{
          body: (
            <>
              {vaultExplainer(p).map((g) => (
                <ExplainGroup key={g.title} title={g.title}>
                  {g.bullets.map((b, i) => (
                    <ExplainBullet key={i}>
                      <Segs segs={b} />
                    </ExplainBullet>
                  ))}
                </ExplainGroup>
              ))}
            </>
          ),
        }}
      />
    </ProvSection>
  );
}
