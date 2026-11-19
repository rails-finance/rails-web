"use client";

// "Where the assets are" on an IPOR Fusion factsheet (anatomy V3; rails-ops
// TO-DO-ipor-scoping §6.3 phase B): the asset in the vault, the rewards claim
// manager, then each active market's recorded balance with its grants decoded;
// where this vault's totalAssets() is below the rows, the management fee not
// yet taken as a deduction, and any remainder; under the table the routes,
// the markets that hold no balance. Shares are over the rows' sum, the gross
// book. A row links to Rails only where its balance is above zero.

import { Prov } from "@/components/shared/provenance";
import { allocationBar, VaultAssets, type VaultAssetRow } from "@/components/vaults/vault-assets";
import { vaultAssetsExports, type VaultExportModel } from "@/lib/vaults/card-export";
import { iporFusionVaultAssetsContent } from "@/lib/vaults/card-words";
import type { VaultSummary } from "@/lib/vaults/summary";
import { marketRailsHref } from "@/lib/ipor-fusion/market-links";
import { assetText, pctText } from "@/lib/shared/vault-amount-text";
import { substratesLine, substrateWords } from "@/lib/ipor-fusion/market-words";
import {
  iporFeeNotTakenProv,
  iporInVaultProv,
  iporMarketBalanceProv,
  iporMarketsGapProv,
  iporMarketSubstratesProv,
  iporRewardsProv,
  iporShareProv,
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
  crosschain: "is an executor, or a vault on another chain, as IPOR's CrosschainSubstrateLib packs them",
  route: "is a token address",
  raw: "is shown as the hex the vault answers, which this page does not decode",
};

const isZero = (a: RawAmount | null) => !a || BigInt(a.raw) === ZERO;

export function IporFusionMarketsTile({
  data,
  coords,
  v,
  childPages,
}: {
  data: IporFusionVaultResponse;
  coords: IporFusionCoords;
  v: VaultSummary;
  /** Rails' page for each child vault it catalogues, by lowercased address. */
  childPages: Record<string, string>;
}) {
  const y = data.vault;
  const m = data.markets;
  const unit = y.asset.symbol;
  const ad = y.asset.decimals;
  const asset = { symbol: unit, address: y.asset.address };
  const amount = (raw: bigint): RawAmount => ({ raw: raw.toString(), value: Number(raw) / Math.pow(10, ad) });
  // asset() answered another token than the census's: the decimals these
  // amounts would be scaled by are not known, so no amount is printed.
  const withheld = y.assetDiffersFromCensus
    ? "The vault's asset() answers a token other than the one the census recorded, so the decimals these amounts are scaled by are not known."
    : undefined;
  const line = (
    <>
      The asset in the vault and the {n(m?.rows.filter((r) => r.kind !== "route").length ?? 0)} markets it acts in,
      largest first.
    </>
  );
  if (!m) {
    return (
      <VaultAssets
        rows={[]}
        assetSymbol={unit}
        assetAddress={asset.address}
        assetDecimals={ad}
        look="index"
        line="The vault's markets could not be read at this block."
        shareTip="The row's amount over the rows' sum."
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

  type Draft = Omit<VaultAssetRow, "share" | "shareProv"> & { shareVenue?: string };
  const drafts: Draft[] = [
    {
      key: "in-vault",
      venue: "In the vault",
      sub: "outside every market",
      amount: m.inVault,
      amountProv: iporInVaultProv(coords, y.asset.address),
      shareVenue: "the asset in the vault",
      hooks: { "data-market": "in-vault" },
    },
  ];
  if (m.rewards && !isZero(m.rewards.balance))
    drafts.push({
      key: "rewards",
      venue: "Rewards claim manager",
      sub: "rewards the vault has claimed",
      amount: m.rewards.balance,
      amountProv: iporRewardsProv(coords, m.rewards.manager),
      shareVenue: "the rewards claim manager",
      hooks: { "data-market": "rewards" },
    });
  for (const r of sorted) {
    const railsHref = marketRailsHref(r, data.chainId, y.address);
    const grants = r.substrates ?? [];
    // A child-vault market, and a cross-chain market's remote vaults, link
    // where exactly one granted vault has a Rails page; otherwise each grant
    // says whether Rails covers it. A remote vault is keyed by chain and
    // address (childPagesOf).
    const pageOf = (g: (typeof grants)[number]) =>
      g.kind === "address"
        ? childPages[g.address]
        : g.kind === "remote-vault"
          ? childPages[`${g.chainId}:${g.address}`]
          : undefined;
    const viaChild = r.kind === "child" || r.kind === "crosschain";
    const childGrants = grants.filter((g) =>
      r.kind === "child" ? g.kind === "address" : r.kind === "crosschain" ? g.kind === "remote-vault" : false,
    );
    const childWithPage = childGrants.filter((g) => pageOf(g));
    const childHref = childWithPage.length === 1 ? pageOf(childWithPage[0]) : undefined;
    const href = isZero(r.balance) ? undefined : ((viaChild ? childHref : railsHref) ?? undefined);
    const covered =
      r.kind === "held" ? "held" : viaChild ? (childWithPage.length > 0 ? "yes" : "no") : railsHref ? "yes" : "no";
    const one = r.kind === "child" && grants.length === 1;
    const perGrant = viaChild && childGrants.length > 1;
    const words = perGrant
      ? grants
          .map(
            (g) => `${substrateWords(g, m)}${childGrants.includes(g) && !pageOf(g) ? " (not covered by Rails)" : ""}`,
          )
          .join(", ")
      : substratesLine(grants, m);
    drafts.push({
      key: r.id,
      venue: one ? substrateWords(grants[0], m) : r.venue,
      ...(href ? { href } : {}),
      sub: (
        <>
          {r.substrates ? (
            <Prov info={iporMarketSubstratesProv(coords, { id: r.id, constant: r.constant, decoder: DECODER[r.kind] })}>
              {one ? r.venue : words || "no grants"}
            </Prov>
          ) : (
            "grants not read"
          )}
          {covered === "no" && !perGrant && " · not covered by Rails"}
        </>
      ),
      amount: r.balance,
      amountProv: iporMarketBalanceProv(coords, { id: r.id, constant: r.constant }),
      shareVenue: `totalAssetsInMarket(${r.id})`,
      hooks: {
        "data-market": r.id,
        "data-market-constant": r.constant ?? "",
        "data-market-kind": r.kind,
        "data-market-covered": covered,
        "data-market-balance-raw": r.balance?.raw ?? "",
      },
    });
  }

  // The gross book: the rows' sum. Where this vault's totalAssets() is below
  // it, the management fee not yet taken is the deduction, and anything left
  // is a remainder row. A rewards manager whose balance did not answer leaves
  // the book unsummed.
  const rewardsUnread = m.rewards != null && m.rewards.balance == null;
  const allRead = drafts.every((d) => d.amount != null) && !rewardsUnread;
  const book = allRead ? drafts.reduce((acc, d) => acc + BigInt(d.amount!.raw), ZERO) : null;
  const extra: VaultAssetRow[] = [];
  let feeDeducted = false;
  let denominator = book;
  if (book != null && y.totalAssets) {
    const total = BigInt(y.totalAssets.raw);
    const below = book - total;
    const feeRaw = y.unrealizedManagementFee ? BigInt(y.unrealizedManagementFee.raw) : ZERO;
    const fee = below > ZERO ? (feeRaw < below ? feeRaw : below) : ZERO;
    if (fee > ZERO) {
      feeDeducted = true;
      extra.push({
        key: "fee-not-taken",
        venue: "Management fee not yet taken",
        sub: "accrued, and minted to the fee account when taken",
        amount: amount(fee),
        amountProv: iporFeeNotTakenProv(coords, { fee: assetText(amount(fee), ad) }),
        minus: true,
        share: null,
        hooks: { "data-figure": "fee-not-taken" },
      });
    }
    const remainder = total - (book - fee);
    if (remainder !== ZERO) {
      const abs = amount(remainder < ZERO ? -remainder : remainder);
      if (remainder > ZERO) denominator = book + remainder;
      extra.push({
        key: "not-in-a-row",
        venue: "Not in a row",
        sub: remainder > ZERO ? "total assets beyond the rows above" : "the rows above exceed total assets",
        amount: abs,
        amountProv: iporMarketsGapProv(coords, {
          total: assetText(y.totalAssets, ad),
          summed: assetText(amount(book), ad),
          fee: fee > ZERO ? assetText(amount(fee), ad) : null,
          gap: `${remainder < ZERO ? "−" : ""}${assetText(abs, ad)}`,
        }),
        ...(remainder < ZERO ? { minus: true } : {}),
        share: null,
        hooks: { "data-figure": "not-in-a-row" },
      });
    }
  }
  const den = denominator != null ? amount(denominator) : null;
  const bookText = den ? assetText(den, ad) : "";
  const shareOf = (d: Draft): Pick<VaultAssetRow, "share" | "shareProv"> =>
    den && d.amount
      ? {
          share: Number((BigInt(d.amount.raw) * BigInt(1e9)) / (BigInt(den.raw) || BigInt(1))) / 1e9,
          shareProv: iporShareProv(coords, { venue: d.shareVenue ?? String(d.key), book: bookText, feeDeducted }),
        }
      : { share: null };
  const rows: VaultAssetRow[] = [
    ...drafts.map(({ shareVenue, ...d }) => ({ ...d, ...shareOf({ ...d, shareVenue }) })),
    ...extra.map((e) =>
      e.key === "not-in-a-row" && !e.minus && den && e.amount
        ? { ...e, ...shareOf({ ...e, shareVenue: "the remainder" }) }
        : e,
    ),
  ];

  const exportModel: VaultExportModel = {
    stats: [],
    rows: rows.map((r): [string, string, string] => [
      typeof r.venue === "string" ? r.venue : r.key,
      r.amount ? `${r.minus ? "−" : ""}${assetText(r.amount, ad)}` : "not read",
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
        line={line}
        shareTip="The row's amount over the rows' sum."
        learnMore={iporFusionVaultAssetsContent()}
        menu={{ exports: vaultAssetsExports(v, exportModel) }}
        amountsWithheld={withheld}
      />
      {routes.length > 0 && (
        <div className="mt-6" data-vault-routes="" data-anatomy="V3.2">
          <h3 className="text-sm font-semibold text-foreground">Routes</h3>
          <p className="mt-1 text-[13px] text-rb-500">
            Markets the vault acts through that hold no balance, such as swaps and flash loans.
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
