"use client";

// How a Pendle market is built (M2), left to right: the wrapped token, the SY
// that wraps it, the SY split into PT and YT, the LP that pairs PT with SY, and
// the reward the market pays. Each item is the token's icon (its asset panel:
// the contract and, where Rails has one, its page) and its symbol with a
// receipt naming the contract read behind it. One "?" on the SY step says what
// SY is. Below sm the items stack. The body of the market page's "How the
// market is built" section (lib/pendle/product.tsx), whose ⋮ links each token.

import type { ReactNode } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { AssetPopover } from "@/components/shared/asset-popover";
import { Prov } from "@/components/shared/provenance";
import { RevealTip } from "@/components/shared/reveal-tip";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { PendleTokenIcon, type PendleTokenKind } from "@/components/protocol/pendle/pendle-token-icon";
import { symbolOf } from "@/lib/pendle/format";
import { marketTokenProv } from "@/lib/pendle/provenance";
import { PENDLE_WORDS, lpName } from "@/lib/pendle/words";
import type { PendleMarketPage, PendleToken } from "@/lib/pendle/types";

const SY_TIP =
  "SY is Pendle's standard wrapper around a yield-bearing token: the market trades against it, and its exchange rate says what one SY is worth in the asset.";

type Role = Parameters<typeof marketTokenProv>[0];

function Item({
  m,
  tok,
  kind,
  role,
  name,
}: {
  m: PendleMarketPage;
  tok: PendleToken;
  kind: PendleTokenKind | "reward";
  role: Role;
  name?: string;
}) {
  const shown = name ?? symbolOf(tok);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" data-pendle-token={role}>
      <AssetPopover symbol={shown} address={tok.address}>
        {kind === "reward" ? (
          <TokenChipIcon symbol={tok.symbol ?? ""} address={tok.address} size={20} filterable={false} untitled />
        ) : (
          <PendleTokenIcon kind={kind} tokens={m.tokens} size={20} />
        )}
      </AssetPopover>
      <span className="min-w-0 truncate text-sm font-medium text-foreground">
        <Prov info={marketTokenProv(role, tok, m.tokens.market.address)} value={tok.address}>
          {shown}
        </Prov>
      </span>
    </span>
  );
}

function Step({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-1 text-[11px] text-rb-500">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
    </div>
  );
}

const Arrow = () => (
  <ArrowRight size={14} className="shrink-0 self-end text-rb-400 max-sm:rotate-90 max-sm:self-start" aria-hidden />
);

export function PendleTokenStrip({ m }: { m: PendleMarketPage }) {
  const t = m.tokens;
  const rewards = Object.entries(m.rewardTokens).map(([address, r]) => ({ address, ...r }));
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-raised px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-4 sm:px-5">
      <Step label={PENDLE_WORDS.yieldBearingToken}>
        <Item m={m} tok={t.yieldToken} kind="yield" role="Yield-bearing token" />
      </Step>
      <Arrow />
      <Step
        label={
          <>
            SY
            <RevealTip tip={SY_TIP} label={`SY: ${SY_TIP}`} focusable wrap className="focus-ring rounded-sm">
              <span className="tip-underline text-[10px]" data-header-tip="sy">
                ?
              </span>
            </RevealTip>
          </>
        }
      >
        <Item m={m} tok={t.sy} kind="sy" role="SY" />
      </Step>
      <Arrow />
      <Step label="Split into">
        <Item m={m} tok={t.pt} kind="pt" role="PT" />
        <Plus size={12} className="shrink-0 text-rb-400" aria-hidden />
        <Item m={m} tok={t.yt} kind="yt" role="YT" />
      </Step>
      <span className="hidden h-8 w-px self-end bg-rb-300 sm:block dark:bg-rb-700" aria-hidden />
      <Step label="Pool: PT with SY">
        <Item m={m} tok={t.market} kind="lp" role="LP" name={lpName(t)} />
      </Step>
      {rewards.length > 0 && (
        <>
          <span className="hidden h-8 w-px self-end bg-rb-300 sm:block dark:bg-rb-700" aria-hidden />
          <Step label={rewards.length === 1 ? "Reward" : "Rewards"}>
            {rewards.map((r) => (
              <Item key={r.address} m={m} tok={r} kind="reward" role="Reward" />
            ))}
          </Step>
        </>
      )}
    </div>
  );
}
