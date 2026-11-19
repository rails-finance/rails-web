"use client";

// "Where the assets are" on an IPOR Fusion factsheet (anatomy V3; rails-ops
// TO-DO-ipor-scoping §6.3 phase B): the asset in the vault, the rewards
// manager, then each active market's booked balance with its grants decoded,
// a row for any gap to totalAssets(), and under the table the routes, the
// markets that hold no balance. One link rule for every row: a row links to
// Rails only where its balance is above zero.

import { Prov } from "@/components/shared/provenance";
import { allocationBar, VaultAssets, type VaultAssetRow } from "@/components/vaults/vault-assets";
import { vaultVenueShareProv } from "@/lib/vaults/card-provenance";
import { vaultAssetsExports, type VaultExportModel } from "@/lib/vaults/card-export";
import { iporFusionVaultAssetsContent } from "@/lib/vaults/card-words";
import type { VaultSummary } from "@/lib/vaults/summary";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { assetText, pctText } from "@/lib/shared/vault-amount-text";
import { substratesLine } from "@/lib/ipor-fusion/market-words";
import {
  iporInVaultProv,
  iporMarketBalanceProv,
  iporMarketsGapProv,
  iporMarketSubstratesProv,
  iporRewardsProv,
  type IporFusionCoords,
} from "@/lib/ipor-fusion/vault-provenance";
import type { MarketKind } from "@/lib/ipor-fusion/markets";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";
import type { IporFusionMarketRow, IporFusionVaultResponse } from "@/lib/sources/chain/ipor-fusion-vault";

const n = (v: number) => v.toLocaleString("en-US");
const ZERO = BigInt(0);

/** How each kind's grants are read, for the receipt. */
const DECODER: Record<MarketKind, string> = {
  tokens: "is a token address",
  held: "is a token address",
  morpho: "is a Morpho Blue market id, named from Rails' catalog of Morpho markets",
  child: "is a vault the vault holds shares of",
  address: "is a contract address",
  liquity: "is a Liquity V2 branch's address registry, named by its collToken()",
  "aave-v4": "is a spoke, a reserve id and two flags, as IPOR's AaveV4SubstrateLib packs them",
  euler: "is an Euler V2 vault, two flags and a sub-account, as IPOR's EulerFuseLib packs them",
  "uniswap-v4": "is a Uniswap V4 pool id, or one of its tokens",
  midas: "is a type and an address, as IPOR's MidasSubstrateLib packs them",
  external: "is a type and its payload, as IPOR's ExternalStateSubstrateLib packs them",
  route: "is a token address",
  raw: "is shown as the hex the vault answers, which this page does not decode",
};

const fraction = (part: RawAmount | null, total: RawAmount | null): number | null =>
  part && total && BigInt(total.raw) > ZERO ? Number((BigInt(part.raw) * BigInt(1e9)) / BigInt(total.raw)) / 1e9 : null;

/** The covered explorer's listing at the vault's address, or the child vault's
 *  page: only where the balance is above zero. */
function linkOf(
  r: IporFusionMarketRow,
  chainId: number,
  vault: string,
  childPages: Record<string, string>,
): string | undefined {
  if (!r.balance || BigInt(r.balance.raw) === ZERO) return undefined;
  if (r.kind === "child") {
    const only = r.substrates?.length === 1 && r.substrates[0].kind === "address" ? r.substrates[0].address : null;
    return only ? childPages[only] : undefined;
  }
  const session = r.covered?.[chainId] as SessionProtocol | undefined;
  return session ? (listingHrefForWallet(session, vault) ?? undefined) : undefined;
}

export function IporFusionMarketsTile({
  data,
  coords,
  v,
  childPages,
}: {
  data: IporFusionVaultResponse;
  coords: IporFusionCoords;
  v: VaultSummary;
  /** Rails's page for each child vault it catalogues, by lowercased address. */
  childPages: Record<string, string>;
}) {
  const y = data.vault;
  const m = data.markets;
  const unit = y.asset.symbol;
  const ad = y.asset.decimals;
  const asset = { symbol: unit, address: y.asset.address };
  const amount = (raw: bigint): RawAmount => ({ raw: raw.toString(), value: Number(raw) / Math.pow(10, ad) });
  if (!m) {
    return (
      <VaultAssets
        rows={[]}
        assetSymbol={unit}
        assetAddress={asset.address}
        assetDecimals={ad}
        look="index"
        line="The vault's markets could not be read at this block."
        shareTip="The row's amount over the vault's total assets."
        learnMore={iporFusionVaultAssetsContent()}
        menu={{}}
      />
    );
  }
  const markets = m.rows.filter((r) => r.kind !== "route");
  const routes = m.rows.filter((r) => r.kind === "route");
  const sorted = [...markets].sort((a, b) => {
    const x = BigInt(a.balance?.raw ?? "0");
    const z = BigInt(b.balance?.raw ?? "0");
    return x === z ? 0 : x > z ? -1 : 1;
  });

  const rows: VaultAssetRow[] = [
    {
      key: "in-vault",
      venue: "In the vault",
      sub: "held by the vault contract",
      amount: m.inVault,
      amountProv: iporInVaultProv(coords, y.asset.address),
      share: fraction(m.inVault, y.totalAssets),
      shareProv: vaultVenueShareProv(v, "the asset in the vault", "totalAssets()", coords.readBy),
      hooks: { "data-market": "in-vault" },
    },
  ];
  if (m.rewards && m.rewards.balance && BigInt(m.rewards.balance.raw) > ZERO)
    rows.push({
      key: "rewards",
      venue: "Rewards manager",
      sub: "rewards the vault has claimed",
      amount: m.rewards.balance,
      amountProv: iporRewardsProv(coords, m.rewards.manager),
      share: fraction(m.rewards.balance, y.totalAssets),
      shareProv: vaultVenueShareProv(v, "the rewards manager's balance", "totalAssets()", coords.readBy),
      hooks: { "data-market": "rewards" },
    });
  for (const r of sorted) {
    const href = linkOf(r, data.chainId, y.address, childPages);
    const uncovered = !r.covered?.[data.chainId] && r.kind !== "held" && r.kind !== "child";
    const childUncovered =
      r.kind === "child" && !(r.substrates ?? []).some((s) => s.kind === "address" && childPages[s.address]);
    const only = r.kind === "child" && r.substrates?.length === 1 ? substratesLine(r.substrates, m) : null;
    const grants = r.substrates ? substratesLine(only ? [] : r.substrates, m) : "grants not read";
    rows.push({
      key: r.id,
      venue: only ?? r.venue,
      ...(href ? { href } : {}),
      sub: (
        <>
          {r.substrates ? (
            <Prov info={iporMarketSubstratesProv(coords, { id: r.id, constant: r.constant, decoder: DECODER[r.kind] })}>
              {only ? r.venue : grants || "no grants"}
            </Prov>
          ) : (
            grants
          )}
          {(uncovered || childUncovered) && " · not covered by Rails"}
        </>
      ),
      amount: r.balance,
      amountProv: iporMarketBalanceProv(coords, { id: r.id, constant: r.constant }),
      share: fraction(r.balance, y.totalAssets),
      shareProv: vaultVenueShareProv(v, `totalAssetsInMarket(${r.id})`, "totalAssets()", coords.readBy),
      hooks: {
        "data-market": r.id,
        "data-market-constant": r.constant ?? "",
        "data-market-kind": r.kind,
        "data-market-covered": r.kind === "held" ? "held" : uncovered || childUncovered ? "no" : "yes",
        "data-market-balance-raw": r.balance?.raw ?? "",
      },
    });
  }

  // The gap between the rows and totalAssets(), where the reads all answered.
  const parts = rows.map((r) => r.amount);
  if (y.totalAssets && parts.every((p) => p != null)) {
    const summed = parts.reduce((acc, p) => acc + BigInt(p!.raw), ZERO);
    const gap = BigInt(y.totalAssets.raw) - summed;
    if (gap !== ZERO) {
      const gapAmount = amount(gap < ZERO ? -gap : gap);
      rows.push({
        key: "not-in-a-row",
        venue: "Not in a row",
        sub:
          gap > ZERO
            ? `totalAssets() ${assetText(y.totalAssets, ad)} less the rows' ${assetText(amount(summed), ad)} at block ${n(data.blockNumber)}`
            : `the rows' ${assetText(amount(summed), ad)} exceed totalAssets() ${assetText(y.totalAssets, ad)} by ${assetText(gapAmount, ad)} at block ${n(data.blockNumber)}`,
        amount: gapAmount,
        amountProv: iporMarketsGapProv(coords, {
          total: assetText(y.totalAssets, ad),
          summed: assetText(amount(summed), ad),
          gap: `${gap < ZERO ? "−" : ""}${assetText(gapAmount, ad)}`,
        }),
        share: gap < ZERO ? null : fraction(gapAmount, y.totalAssets),
        shareProv: vaultVenueShareProv(v, "the difference", "totalAssets()", coords.readBy),
        offBand: gap < ZERO,
        hooks: { "data-figure": "not-in-a-row" },
      });
    }
  }

  const exportModel: VaultExportModel = {
    stats: [],
    rows: rows.map((r): [string, string, string] => [
      typeof r.venue === "string" ? r.venue : r.key,
      r.amount ? assetText(r.amount, ad) : "not read",
      r.share == null ? "" : pctText(r.share),
    ]),
  };
  const alloc = allocationBar(rows, { asset, venue: { one: "market", many: "markets" } });

  return (
    <>
      <VaultAssets
        rows={alloc.rows}
        assetSymbol={unit}
        assetAddress={asset.address}
        assetDecimals={ad}
        chart={alloc.chart}
        keyColours={alloc.keyColours}
        look="index"
        line={
          <>
            The asset in the vault and the {n(markets.length)} {markets.length === 1 ? "market" : "markets"} its balance
            fuses book, at block {n(data.blockNumber)}. A row links to Rails where its balance is above zero.
          </>
        }
        shareTip="The row's amount over the vault's total assets."
        learnMore={iporFusionVaultAssetsContent()}
        menu={{ exports: vaultAssetsExports(v, exportModel) }}
      />
      {routes.length > 0 && (
        <div className="mt-6" data-vault-routes="" data-anatomy="V3.2">
          <h3 className="text-sm font-semibold text-foreground">Routes</h3>
          <p className="mt-1 text-[13px] text-rb-500">
            Markets the vault acts through that hold no balance: swaps, flash loans and the zero-balance market.
          </p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {routes.map((r) => (
              <li key={r.id} data-route={r.id}>
                <span className="font-semibold text-foreground">{r.venue}</span>{" "}
                <span className="font-mono text-[11px] text-rb-500">{r.constant ?? r.id}</span>
                {r.substrates && r.substrates.length > 0 && (
                  <span className="block text-rb-500">
                    <Prov
                      info={iporMarketSubstratesProv(coords, {
                        id: r.id,
                        constant: r.constant,
                        decoder: DECODER[r.kind],
                      })}
                    >
                      {substratesLine(r.substrates, m, 8)}
                    </Prov>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
