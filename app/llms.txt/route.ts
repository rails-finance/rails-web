import { SITE_URL } from "@/lib/shared/page-metadata";
import { explorerName, launchedChains, protocolsForChain } from "@/lib/shared/protocols";
import { SITE_LEAD, SITE_METHOD } from "@/lib/shared/site-copy";

// /llms.txt (llmstxt.org): one plain page a language model can read for what
// Rails is and where each explorer lives (rails-ops ui-jobs 475). Generated
// from the launched roster at build time, the source the nav, the sitemap and
// /about read, so an explorer appears here the day it launches. Each line's
// text is the explorer's directory-card `desc`: only what the site says.
export const dynamic = "force-static";

export function GET() {
  const explorers = launchedChains().flatMap((chain) => [
    "",
    `## ${chain.name} explorers`,
    "",
    `Coverage: ${SITE_URL}/coverage/${chain.slug}`,
    "",
    ...protocolsForChain(chain.id).map((p) => `- [${explorerName(p)}](${SITE_URL}${p.href}): ${p.desc}`),
  ]);

  const body = [
    "# Rails",
    "",
    `> ${SITE_LEAD} ${SITE_METHOD}`,
    "",
    "Look up any wallet by address or ENS name, or browse every open position in a protocol. Rails is read-only: no wallet connection, no signatures, no login. How deep each explorer goes is stated per chain on its coverage page.",
    ...explorers,
    "",
    "## About",
    "",
    `- [About Rails](${SITE_URL}/about): what Rails is, who it is for, and the explorers`,
    `- [Technical architecture](${SITE_URL}/about/architecture): how the data gets from the chain to the page`,
    `- [Blog](${SITE_URL}/blog): posts from the Rails team, each with its date`,
    "",
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
