// One Euler V2 holding on Base: an account's deposit in, or loan from, one vault
// (components/protocol/euler/euler-position-page.tsx).

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { EulerPositionPage } from "@/components/protocol/euler/euler-position-page";

interface Props {
  params: Promise<{ account: string; vault: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { account, vault } = await params;
  return positionMetadata({
    session: "euler-v2-base",
    subject: account,
    canonicalPath: `/base/euler-v2/position/${account}/${vault}`,
  });
}

export default async function Page({ params }: Props) {
  const { account, vault } = await params;
  return <EulerPositionPage chain={8453} account={account} vault={vault} />;
}
