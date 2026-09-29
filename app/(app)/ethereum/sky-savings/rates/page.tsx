import { SubPageHeader } from "@/components/shared/sub-page-header";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { SkySavingsRatesView } from "@/components/protocol/sky-savings/sky-savings-rates-view";
import { SkyGateStatement } from "@/components/protocol/sky-savings/sky-savings-gate-refusal";
import { protocolForHref } from "@/lib/shared/protocols";
import { unlaunchedRobotsForPath } from "@/lib/shared/page-metadata";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { readSkyRates } from "@/lib/sources/api/sky-savings";
import { skyRateContent } from "@/lib/sky-savings/learn-more";
import { SKY_BASE_PATH, SKY_RATES_PATH } from "@/lib/sky-savings/constants";
import { gateRefusal } from "@/lib/sky-savings/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sky Savings Rate history",
  description:
    "Every change Sky governance made to the Savings Rate since sUSDS launched, each at the block that made it, with the share price and the PSM price of USDS now.",
  alternates: { canonical: SKY_RATES_PATH },
  ...unlaunchedRobotsForPath(SKY_RATES_PATH),
};

const PROTOCOL = protocolForHref(SKY_BASE_PATH)!;

export default async function SkySavingsRatesPage() {
  const rates = await readSkyRates(await readerIpFromHeaders()).catch(() => null);
  const refusal = rates ? gateRefusal(rates) : "missing";
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <SubPageHeader protocol={PROTOCOL} title="Savings Rate history" learnMore={skyRateContent()} />
        <p className="mb-6 max-w-3xl text-sm text-rb-500">
          The Savings Rate sets how fast one sUSDS grows in USDS. Sky governance changes it, and each change applies to
          every holder from its block. Between two changes the rate stays where it was set.
        </p>
        <div data-skel-section="page-table">
          {rates && !refusal ? (
            <SkySavingsRatesView rates={rates} />
          ) : (
            <SkyGateStatement reason={refusal ?? "missing"} gate={rates?.gate ?? null} />
          )}
        </div>
        <ProvInspectorLayer />
      </div>
    </div>
  );
}
