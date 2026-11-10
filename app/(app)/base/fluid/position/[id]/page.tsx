// One Fluid vault position on Base (components/protocol/fluid-base/fluid-base-position-page.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { FluidBasePositionPage } from "@/components/protocol/fluid-base/fluid-base-position-page";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return positionMetadata({ session: "fluid-base", subject: `#${id}`, canonicalPath: `/base/fluid/position/${id}` });
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <FluidBasePositionPage id={id} />;
}
