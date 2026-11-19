"use client";

// One IPOR Fusion vault's factsheet (rails-ops TO-DO-ipor-scoping §6.3): the
// vault card (V2), then the grid: the roles over the vault, its fuses with
// their standing in the IPOR DAO's Fuse Whitelist, and its configuration
// (V12), after where the assets are (V3, components/vaults/ipor-fusion-vault-markets.tsx).
// One block's read (lib/sources/chain/ipor-fusion-vault.ts).

import { serverReadOf } from "@/lib/shared/server-head-read";
import { ProvReceiptsScope, Prov, useReceiptRegistry } from "@/components/shared/provenance";
import { readStampProv, SectionReadStamp, useBlockTime } from "@/components/shared/read-stamp";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import type { PositionPanelRow } from "@/components/shared/position-card-panel";
import { NotLoaded } from "@/components/shared/not-loaded";
import { CreatedBullet, VaultCard, type VaultMenuLink } from "@/components/vaults/vault-card";
import { Tile } from "@/components/shared/tile-grid";
import { VAULT_CARD_TILE, VAULT_GRID } from "@/components/vaults/vault-tiles";
import { VaultConfiguration } from "@/components/vaults/vault-config";
import { iporFusionConfigTile } from "@/components/vaults/vault-config-columns";
import { IporFusionMarketsTile } from "@/components/vaults/ipor-fusion-vault-markets";
import { ALLOCATION_SCOPE } from "@/components/vaults/vault-assets";
import { ProvSection, SectionHeading } from "@/components/shared/section-menu";
import { TipLabel } from "@/components/shared/tip-label";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { IPOR_FUSION_DOCS } from "@/components/vaults/ipor-fusion-vault-directory-view";
import { explorerUrl, chainMeta, type ChainId } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { assetText, shareText, shortAddress } from "@/lib/shared/vault-amount-text";
import { StatAmount } from "@/components/vaults/stat-amount";
import { iporFusionVaultPageSummary } from "@/lib/vaults/summary";
import { iporFusionVaultCardContent } from "@/lib/vaults/card-words";
import type { VaultExportModel } from "@/lib/vaults/card-export";
import { IPOR_ROLES, IPOR_STEWARD_ROLES } from "@/lib/ipor-fusion/addresses";
import { bpsText, roleName } from "@/lib/ipor-fusion/words";
import {
  iporFuseStateProv,
  iporRoleNoneProv,
  iporRoleProv,
  iporVaultFeeProv,
  iporVaultNameProv,
  iporVaultSharePriceProv,
  iporVaultSupplyCapProv,
  iporVaultTotalAssetsProv,
  iporVaultTotalSupplyProv,
  type IporFusionCoords,
} from "@/lib/ipor-fusion/vault-provenance";
import type { IporFusionRoleHolder, IporFusionVaultResponse } from "@/lib/sources/chain/ipor-fusion-vault";

const n = (v: number) => v.toLocaleString("en-US");
const UNREAD = <NotLoaded className="text-base font-normal text-rb-500" />;
const MAX_UINT = (BigInt(1) << BigInt(256)) - BigInt(1);
const ROLES_SCOPE = "vault-roles";
const FUSES_SCOPE = "vault-fuses";

export function IporFusionVaultPage({
  data,
  childPages = {},
}: {
  data: IporFusionVaultResponse;
  /** Rails's page for each child vault it catalogues, by lowercased address. */
  childPages?: Record<string, string>;
}) {
  const registry = useReceiptRegistry();
  const y = data.vault;
  const chainId = data.chainId as ChainId;
  const chain = chainMeta(chainId);
  const link = (kind: "address" | "block", v: string | number) => explorerUrl(chainId, kind, v);
  const createdAt = useBlockTime(chainId, y.createdBlock > 0 ? y.createdBlock : null);
  const v = iporFusionVaultPageSummary(data);
  const unit = y.asset.symbol;
  const ad = y.asset.decimals;
  const asset = { symbol: unit, address: y.asset.address };
  const vaultName = y.name ?? y.censusName ?? shortAddress(y.address);
  const coords: IporFusionCoords = {
    chainId,
    readBy: serverReadOf(data),
    blockNumber: data.blockNumber || undefined,
    vault: y.address,
    vaultName,
    assetSymbol: unit,
  };
  const roles = data.roles;
  const holdersOf = (roleId: string): IporFusionRoleHolder[] =>
    roles.read ? roles.holders.filter((h) => h.roleId === roleId) : [];
  const roleProv = (h: IporFusionRoleHolder) =>
    roles.read && y.accessManager
      ? iporRoleProv(coords, {
          ...h,
          accessManager: y.accessManager,
          fromBlock: roles.fromBlock,
          toBlock: roles.toBlock,
          lane: roles.lane,
        })
      : undefined;
  const holderAddress = (h: IporFusionRoleHolder) => {
    const info = roleProv(h);
    return (
      <span className="font-mono text-sm" data-role-holder={h.account} data-role-id={h.roleId}>
        {info ? <Prov info={info}>{shortAddress(h.account)}</Prov> : shortAddress(h.account)}
      </span>
    );
  };
  const fig = (name: string, raw: string | undefined, value: React.ReactNode) => (
    <span data-cell={name} data-raw={raw ?? ""}>
      {value}
    </span>
  );
  const capUnset = y.supplyCap != null && BigInt(y.supplyCap.raw) === MAX_UINT;

  // The steward stat: the owner, then the curator (Miles, 19 Nov 2026).
  const stewards = IPOR_STEWARD_ROLES.map((roleId) => ({ roleId, holders: holdersOf(roleId) }));
  const stewardValue = !roles.read ? (
    UNREAD
  ) : (
    <span className="flex flex-col gap-0.5">
      {stewards.map(({ roleId, holders }) => (
        <span key={roleId} className="flex items-baseline gap-1.5" data-steward-role={IPOR_ROLES[roleId].word}>
          <span className="text-xs text-rb-500">{IPOR_ROLES[roleId].word?.toLowerCase()}</span>
          {holders.length === 0 ? (
            <span className="text-sm text-rb-500" data-steward-none="">
              {roles.read && y.accessManager ? (
                <Prov
                  info={iporRoleNoneProv(coords, {
                    roleId,
                    accessManager: y.accessManager,
                    fromBlock: roles.fromBlock,
                    toBlock: roles.toBlock,
                    lane: roles.lane,
                  })}
                >
                  none
                </Prov>
              ) : (
                "none"
              )}
            </span>
          ) : (
            <>
              {holderAddress(holders[0])}
              {holders.length > 1 && <span className="text-xs text-rb-500">+{n(holders.length - 1)}</span>}
            </>
          )}
        </span>
      ))}
    </span>
  );

  const stats: PositionPanelRow[] = [
    {
      id: "shares-issued",
      label: "Shares issued",
      tip: "Every share of the vault in existence.",
      sub: y.symbol ?? undefined,
      value: fig(
        "total-supply",
        y.totalSupply?.raw,
        y.totalSupply ? (
          <Prov info={iporVaultTotalSupplyProv(coords)}>
            <StatAmount amount={y.totalSupply} decimals={y.shareDecimals} shares />
          </Prov>
        ) : (
          UNREAD
        ),
      ),
    },
    {
      id: "supply-cap",
      label: "Supply cap",
      tip: "The most shares the vault may issue. A deposit that would pass it is refused.",
      value: fig(
        "supply-cap",
        y.supplyCap?.raw,
        y.supplyCap ? (
          <Prov info={iporVaultSupplyCapProv(coords)}>
            {capUnset ? "no cap" : <StatAmount amount={y.supplyCap} decimals={y.shareDecimals} shares />}
          </Prov>
        ) : (
          UNREAD
        ),
      ),
    },
    {
      id: "performance-fee",
      label: "Performance fee",
      tip: "The share of a gain in the share price the vault takes, as new shares minted to its fee account.",
      value: fig(
        "performance-fee",
        y.performanceFee ? String(y.performanceFee.bps) : undefined,
        y.performanceFee ? (
          <Prov info={iporVaultFeeProv(coords, "performance", y.performanceFee.bps)}>
            {bpsText(y.performanceFee.bps)}
          </Prov>
        ) : (
          UNREAD
        ),
      ),
    },
    {
      id: "management-fee",
      label: "Management fee",
      sub: "a year",
      tip: "A yearly charge on the vault's assets, accrued with time and minted to its fee account as new shares.",
      value: fig(
        "management-fee",
        y.managementFee ? String(y.managementFee.bps) : undefined,
        y.managementFee ? (
          <Prov info={iporVaultFeeProv(coords, "management", y.managementFee.bps)}>{bpsText(y.managementFee.bps)}</Prov>
        ) : (
          UNREAD
        ),
      ),
    },
    {
      id: "steward",
      label: "Steward",
      sub: "owner · curator",
      tip: "The owner appoints the vault's Atomist, owners and guardians; the curator, IPOR's Alpha, moves the assets between markets.",
      value: fig("steward", undefined, stewardValue),
    },
  ];

  const links: VaultMenuLink[] = [
    {
      item: "vault-contract",
      title: "Vault contract",
      subtitle: `${shortAddress(y.address)} on ${chain.explorerName}`,
      href: link("address", y.address),
    },
    {
      item: "factory",
      title: "Factory",
      subtitle: `${v.releaseLabel} · ${shortAddress(y.factory)}`,
      href: link("address", y.factory),
    },
    {
      item: "created",
      title: "Created",
      subtitle: `Block ${n(y.createdBlock)} on ${chain.explorerName}`,
      href: link("block", y.createdBlock),
    },
    { item: "docs", ...IPOR_FUSION_DOCS },
  ];

  const owners = holdersOf("1");
  const curators = holdersOf("200");
  const explanation = (
    <div data-vault-explanation="">
      <ExplainGroup title="Holdings">
        <ExplainBullet>
          This vault holds <Fig>{y.totalAssets ? `${assetText(y.totalAssets, ad)} ${unit}` : "an unread amount"}</Fig>,
          the asset in the vault plus what its balance fuses last booked in each market.
        </ExplainBullet>
        {data.fuses && (
          <ExplainBullet>
            It can act through <Fig>{n(data.fuses.length)}</Fig> fuses.
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Risk">
        {curators.length > 0 && (
          <ExplainBullet>
            The curator <Fig>{shortAddress(curators[0].account)}</Fig> moves the assets between markets.
          </ExplainBullet>
        )}
        {owners.length > 0 && (
          <ExplainBullet>
            The owner <Fig>{shortAddress(owners[0].account)}</Fig> appoints the Atomist, who manages the vault&rsquo;s
            settings and fuses.
          </ExplainBullet>
        )}
        <ExplainBullet>
          A loss in any market the vault is in lowers the share price once the vault books it.
        </ExplainBullet>
      </ExplainGroup>
      <ExplainGroup title="Fees">
        {y.performanceFee && (
          <ExplainBullet>
            A performance fee of <Fig>{bpsText(y.performanceFee.bps)}</Fig> of each gain in the share price.
          </ExplainBullet>
        )}
        {y.managementFee && (
          <ExplainBullet>
            A management fee of <Fig>{bpsText(y.managementFee.bps)}</Fig> a year on the vault&rsquo;s assets.
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="History">
        <CreatedBullet
          chainId={chainId}
          block={y.createdBlock > 0 ? y.createdBlock : null}
          by={`the IPOR Fusion factory, clone ${n(y.index)}`}
        />
      </ExplainGroup>
    </div>
  );

  const exportModel: VaultExportModel = {
    stats: [
      ["Shares issued", y.totalSupply ? shareText(y.totalSupply, y.shareDecimals) : "not read"],
      ["Supply cap", y.supplyCap ? (capUnset ? "no cap" : shareText(y.supplyCap, y.shareDecimals)) : "not read"],
      ["Performance fee", y.performanceFee ? bpsText(y.performanceFee.bps) : "not read"],
      ["Management fee", y.managementFee ? `${bpsText(y.managementFee.bps)} a year` : "not read"],
      ["Steward (owner)", roles.read ? (owners[0]?.account ?? "none") : "not read"],
      ["Steward (curator)", roles.read ? (curators[0]?.account ?? "none") : "not read"],
    ],
    rows: [],
  };

  const config = iporFusionConfigTile({ data, coords, release: v.releaseLabel, createdAt });

  return (
    <ProvReceiptsScope registry={registry}>
      <Tile id="summary" flush>
        <div className={VAULT_CARD_TILE}>
          <VaultCard
            vault={v}
            holdersHref={null}
            receipts={{
              name: iporVaultNameProv(coords),
              totalAssets: iporVaultTotalAssetsProv(coords),
              sharePrice: iporVaultSharePriceProv(coords, y.shareDecimals),
            }}
            status={null}
            stats={stats}
            links={links}
            explanation={explanation}
            learnMore={iporFusionVaultCardContent()}
            stamp={
              <SectionReadStamp
                chainId={chainId}
                block={data.blockNumber}
                readBy={coords.readBy}
                info={(at) =>
                  readStampProv({
                    chainId,
                    block: data.blockNumber,
                    at,
                    readBy: coords.readBy,
                    what: "Every figure on this card",
                    contracts: [
                      {
                        name: vaultName,
                        address: y.address,
                        reads:
                          "name(), totalAssets(), totalSupply(), convertToAssets(), getTotalSupplyCap(), getPerformanceFeeData(), getManagementFeeData(), getAccessManagerAddress()",
                      },
                      ...(y.accessManager
                        ? [
                            {
                              name: "IporFusionAccessManager",
                              address: y.accessManager,
                              reads: roles.read
                                ? `RoleGranted logs from block ${n(roles.fromBlock)} to ${n(roles.toBlock)} on ${roles.lane}, then hasRole(role, account)`
                                : "hasRole(role, account)",
                            },
                          ]
                        : []),
                    ],
                  })
                }
              />
            }
            exports={exportModel}
          />
        </div>
      </Tile>

      <div className={VAULT_GRID} data-vault-grid="" data-anatomy="V13">
        <Tile id="allocation" segScope={ALLOCATION_SCOPE} wide>
          <IporFusionMarketsTile data={data} coords={coords} v={v} childPages={childPages} />
        </Tile>
        <Tile id="roles" left>
          <IporFusionRoles data={data} holderAddress={holderAddress} />
        </Tile>
        <Tile id="fuses" right>
          <IporFusionFuses data={data} coords={coords} />
        </Tile>
        <Tile id="configuration" wide last>
          <VaultConfiguration
            chainId={chainId}
            vault={y.address}
            vaultName={vaultName}
            block={data.blockNumber}
            readBy={coords.readBy}
            {...config}
          />
        </Tile>
      </div>
    </ProvReceiptsScope>
  );
}

/** Every role holder `hasRole` confirms at the block, by role id. */
function IporFusionRoles({
  data,
  holderAddress,
}: {
  data: IporFusionVaultResponse;
  holderAddress: (h: IporFusionRoleHolder) => React.ReactNode;
}) {
  const roles = data.roles;
  const rows = roles.read ? [...roles.holders].sort((a, b) => Number(a.roleId) - Number(b.roleId)) : [];
  return (
    <ProvSection scope={ROLES_SCOPE} data-vault-roles={data.vault.address} data-anatomy="V15">
      <SectionHeading title="Roles">
        <p className="mt-1 text-[13px] text-rb-500">
          {roles.read
            ? `Every address holding a role at block ${n(data.blockNumber)}, found in the access manager's grants from block ${n(roles.fromBlock)}.`
            : null}
        </p>
      </SectionHeading>
      {!roles.read ? (
        <p className="mt-4 text-[13px] text-rb-500" data-roles-unread="">
          Roles not read: {roles.reason}.
        </p>
      ) : (
        <DataTable tableClassName="mt-3 text-sm" label="Roles over the vault" stacked>
          <DataTableHead>
            <DataTableHeader label="Role" />
            <DataTableHeader label="Holder" align="right" />
          </DataTableHead>
          <DataTableBody>
            {rows.map((h) => {
              const name = roleName(h.roleId);
              const tip = IPOR_ROLES[h.roleId]?.tip;
              return (
                <DataTableRow key={`${h.roleId}:${h.account}`} data-role-row={h.roleId}>
                  <DataTableCell rowHeader>
                    <span className={name.constant ? "font-mono text-[12px]" : "font-semibold"}>
                      <TipLabel text={name.text} tip={`${tip ? `${tip} ` : ""}Role ${h.roleId}.`} />
                    </span>
                  </DataTableCell>
                  <DataTableCell label="Holder" align="right">
                    {holderAddress(h)}
                  </DataTableCell>
                </DataTableRow>
              );
            })}
          </DataTableBody>
        </DataTable>
      )}
    </ProvSection>
  );
}

/** The vault's fuses and each one's entry in the IPOR DAO's Fuse Whitelist. */
function IporFusionFuses({ data, coords }: { data: IporFusionVaultResponse; coords: IporFusionCoords }) {
  const fuses = data.fuses;
  return (
    <ProvSection scope={FUSES_SCOPE} data-vault-fuses={data.vault.address} data-anatomy="V16">
      <SectionHeading title="Fuses">
        <p className="mt-1 text-[13px] text-rb-500">
          The contracts the vault can act through, and each one&rsquo;s state in the IPOR DAO&rsquo;s Fuse Whitelist at
          block {n(data.blockNumber)}.
        </p>
      </SectionHeading>
      {fuses == null ? (
        <p className="mt-4 text-[13px] text-rb-500">Fuses not read: the vault&rsquo;s getFuses() did not answer.</p>
      ) : (
        <DataTable tableClassName="mt-3 text-sm" label="The vault's fuses" stacked>
          <DataTableHead>
            <DataTableHeader label="Fuse" />
            <DataTableHeader label="Whitelist" align="right" />
          </DataTableHead>
          <DataTableBody>
            {fuses.map((f) => (
              <DataTableRow
                key={f.address}
                data-fuse={f.address}
                data-fuse-state={f.state ?? (f.stateId == null ? "unread" : "")}
              >
                <DataTableCell rowHeader>
                  <span className="block font-mono text-[12px] text-foreground">
                    {f.type ?? shortAddress(f.address)}
                  </span>
                  {f.type && <span className="font-mono text-[11px] text-rb-500">{shortAddress(f.address)}</span>}
                </DataTableCell>
                <DataTableCell label="Whitelist" align="right">
                  {f.stateId == null ? (
                    <span className="text-rb-500">not read</span>
                  ) : (
                    <Prov info={iporFuseStateProv(coords, f, data.whitelist)}>
                      {f.type ? (f.state ?? `state ${f.stateId}`) : "not listed"}
                    </Prov>
                  )}
                  {f.listedAt != null && (
                    <span className="block text-[11px] text-rb-500">
                      since {formatDate(new Date(f.listedAt * 1000))}
                    </span>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </ProvSection>
  );
}
