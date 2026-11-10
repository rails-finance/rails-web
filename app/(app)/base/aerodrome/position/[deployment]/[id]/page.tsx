// One Aerodrome position (components/protocol/aerodrome/aerodrome-position-page.tsx).
// The deployment is part of the key: ids overlap across Slipstream's three position managers.

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { AerodromePositionPage } from "@/components/protocol/aerodrome/aerodrome-position-page";

interface Props {
  params: Promise<{ deployment: string; id: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { deployment, id } = await params;
  return positionMetadata({
    session: "aerodrome",
    subject: id,
    canonicalPath: `/base/aerodrome/position/${deployment}/${id}`,
  });
}

export default async function Page({ params }: Props) {
  const { deployment, id } = await params;
  return <AerodromePositionPage deployment={deployment} id={id} />;
}
