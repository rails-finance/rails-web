// One Velodrome position on Optimism (components/protocol/aerodrome/aerodrome-position-page.tsx).
// The deployment is part of the key: ids overlap across Slipstream's two position managers here.

import type { Metadata } from "next";
import { positionMetadata, readAtHeadDescription } from "@/lib/shared/page-metadata";
import { AerodromePositionPage } from "@/components/protocol/aerodrome/aerodrome-position-page";
import { VELODROME } from "@/lib/aerodrome/sites";

interface Props {
  params: Promise<{ deployment: string; id: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { deployment, id } = await params;
  return positionMetadata({
    session: "velodrome",
    subject: id,
    description: readAtHeadDescription,
    canonicalPath: `/optimism/velodrome/position/${deployment}/${id}`,
  });
}

export default async function Page({ params }: Props) {
  const { deployment, id } = await params;
  return <AerodromePositionPage deployment={deployment} id={id} site={VELODROME} />;
}
