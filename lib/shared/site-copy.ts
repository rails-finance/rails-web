import { LAUNCHED_PRODUCTION_PROTOCOL_VERSION_COUNT, launchedProductionChainNames } from "@/lib/shared/protocols";

/**
 * What Rails is, in one sentence: the opening of /about, the start of the root
 * meta description, and the summary line of /llms.txt (rails-ops ui-jobs 475).
 * One constant so a search summary, a crawler and a reader of /about are told
 * the same thing. Stated off the launched roster, so the count and the chains
 * move when an explorer launches.
 */
export const SITE_LEAD = `Rails is a set of read-only explorers for ${LAUNCHED_PRODUCTION_PROTOCOL_VERSION_COUNT} DeFi protocols on ${launchedProductionChainNames()}, plus Polaris on Sepolia.`;

/** The second sentence of /about and of its description: how every figure is
 *  sourced. */
export const SITE_METHOD =
  "Every position is replayed from the protocol's on-chain events, with a receipt showing where each number came from.";
