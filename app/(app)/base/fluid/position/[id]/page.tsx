// One Fluid vault position on Base (components/protocol/fluid-base/fluid-base-position-page.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import {
  FluidBasePositionPage,
  loadFluidBasePosition,
} from "@/components/protocol/fluid-base/fluid-base-position-page";
import { fluidBasePosition } from "@/lib/fluid-base/position";
import { isFluidBaseId } from "@/lib/fluid-base/types";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  // The pair names the market; the same `cache()` read the page body makes.
  const answer = isFluidBaseId(id) ? await loadFluidBasePosition(id).catch(() => null) : null;
  const p = answer?.kind === "ok" ? fluidBasePosition(answer.data) : null;
  return positionMetadata({
    session: "fluid-base",
    subject: id,
    market: p ? `${p.colUnit} / ${p.debtUnit}` : undefined,
    canonicalPath: `/base/fluid/position/${id}`,
  });
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <FluidBasePositionPage id={id} />;
}
