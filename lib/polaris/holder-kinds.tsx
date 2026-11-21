// Polaris's position kinds for a wallet search (components/shared/holder-kinds.tsx):
// CDPs, Stability Pool deposits and reserve loans, each read from its listing
// route. Each listing draws its own kind's cards with these renders and passes
// the other two kinds to the shared sections.

import { holderKind } from "@/components/shared/holder-kinds";
import { PolarisPositionCard, viewFromSummary } from "@/components/protocol/polaris/polaris-position-card";
import { PolarisDepositCard } from "@/components/protocol/polaris/polaris-deposit-card";
import { PolarisLoanCard } from "@/components/protocol/polaris/polaris-loan-card";
import type { PolarisPositionSummary } from "@/lib/sources/api/polaris-positions";
import type { PolarisMarketsChainResponse } from "@/lib/sources/chain/polaris-position";
import type { PolarisDepositRow, PolarisLoanRow } from "@/lib/sources/api/polaris-sp-loans";
import { fetchPolarisListingPage } from "./listing-fetch";
import { POLARIS_LIST_DEFAULTS } from "./list-filter-dimensions";
import { DEPOSIT_LIST_DEFAULTS, fetchDepositPage, fetchLoanPage, LOAN_LIST_DEFAULTS } from "./sp-loan-listing";
import {
  POLARIS_BASE_PATH,
  POLARIS_LOANS_PATH,
  POLARIS_SP_PATH,
  polarisDepositHref,
  polarisLoanHref,
  polarisPositionHref,
} from "./routes";

export const polarisCdpCard = (
  p: PolarisPositionSummary,
  markets: PolarisMarketsChainResponse | null,
  pending: boolean,
) => <PolarisPositionCard v={viewFromSummary(p, markets, pending)} surface="listing" />;
export const polarisCdpHref = (p: PolarisPositionSummary) => polarisPositionHref(p.market, p.cdpId);
export const polarisCdpKey = (p: PolarisPositionSummary) => `${p.market}:${p.cdpId}`;
export const polarisDepositListingCard = (r: PolarisDepositRow) => <PolarisDepositCard row={r} surface="listing" />;
export const polarisDepositKey = (r: PolarisDepositRow) => `${r.market}:${r.token_id}`;
export const polarisLoanListingCard = (r: PolarisLoanRow) => <PolarisLoanCard row={r} surface="listing" />;

/** The CDPs kind; its cards carry the approximate ratio at the market board. */
export const polarisCdpKind = (markets: PolarisMarketsChainResponse | null, pending: boolean) =>
  holderKind<PolarisPositionSummary>({
    id: "cdp",
    heading: "Positions",
    listingPath: POLARIS_BASE_PATH,
    // The CDP listing's own read for a wallet search: every status, newest
    // first, the CDPs it passed on included and counted apart.
    read: (wallet, signal) =>
      fetchPolarisListingPage({ ...POLARIS_LIST_DEFAULTS, q: wallet }, 1, undefined, signal).then((r) => ({
        rows: r.data,
        total: r.total,
        passedOn: r.passedOn,
      })),
    renderCard: (p) => polarisCdpCard(p, markets, pending),
    hrefFor: polarisCdpHref,
    keyFor: polarisCdpKey,
  });

export const POLARIS_DEPOSITS = holderKind<PolarisDepositRow>({
  id: "deposit",
  heading: "Stability Pool deposits",
  listingPath: POLARIS_SP_PATH,
  // An address names a holder, so the page is every status, newest first.
  read: (wallet, signal) =>
    fetchDepositPage({ ...DEPOSIT_LIST_DEFAULTS, q: wallet }, 1, { signal }).then((r) => ({
      rows: r.data,
      total: r.total,
    })),
  renderCard: polarisDepositListingCard,
  hrefFor: (r) => polarisDepositHref(r.market, r.token_id),
  keyFor: polarisDepositKey,
});

export const POLARIS_LOANS = holderKind<PolarisLoanRow>({
  id: "loan",
  heading: "Reserve loans",
  listingPath: POLARIS_LOANS_PATH,
  // An address names a holder, so the page is every status, newest first.
  read: (wallet, signal) =>
    fetchLoanPage({ ...LOAN_LIST_DEFAULTS, q: wallet }, 1, { signal }).then((r) => ({ rows: r.data, total: r.total })),
  renderCard: polarisLoanListingCard,
  hrefFor: (r) => polarisLoanHref(r.loan_id),
  keyFor: (r) => r.loan_id,
});
