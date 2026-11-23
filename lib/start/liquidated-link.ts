// /start's "liquidated" results: the params that open a listing on its liquidated positions.
// Read from start-tree.json `results.liquidated`, in this order:
//   1. a history switch the listing offers ("Liquidated before"), with every status;
//   2. the "Closed by liquidation" switch (`ended`, ui-jobs 805), as `status=closed&ended=liquidated`;
//   3. a Status option `liquidated`, for a listing whose Status is still the list of buckets.
//
// Pure, with no `@/` imports, so the unit test reads it (scripts/test/start-liquidated.test.mjs).

import { everyStatusParam } from "../shared/status-choice";

export interface LiquidatedSpec {
  heading: string;
  line: string;
  history: { param: string; value: string }[];
  ended: { status: string; param: string; value: string };
  status: string;
}

/** The part of a filter dimension the link reads. */
export interface LinkDimension {
  param?: string;
  options?: { value: string }[];
}

export interface LiquidatedLink {
  params: Record<string, string>;
  source: string;
}

function offers(dims: LinkDimension[], param: string, value: string): boolean {
  return dims.some((d) => d.param === param && (d.options ?? []).some((o) => o.value === value));
}

/** The link onto a listing's liquidated positions, or null where its filters cannot ask. */
export function liquidatedLink(dims: LinkDimension[], spec: LiquidatedSpec): LiquidatedLink | null {
  const status = dims.find((d) => d.param === "status");
  const history = spec.history.find((h) => offers(dims, h.param, h.value));
  if (history) {
    // Every status, so a position liquidated and then closed is listed too.
    const params: Record<string, string> = { [history.param]: history.value };
    if (status?.options?.length) params.status = everyStatusParam(status.options.map((o) => o.value));
    return { params, source: "the listing's liquidation filter" };
  }
  if (offers(dims, spec.ended.param, spec.ended.value)) {
    return {
      params: { status: spec.ended.status, [spec.ended.param]: spec.ended.value },
      source: "the listing's status filter",
    };
  }
  if (status && offers(dims, "status", spec.status)) {
    return { params: { status: spec.status }, source: "the listing's status filter" };
  }
  return null;
}
