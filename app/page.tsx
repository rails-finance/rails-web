"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Icon } from "@/components/icons/icon";
import { TokenIcon } from "@/components/icons/tokenIcon";

type SampleAddress = { type: "address"; value: string } | { type: "trove"; value: string; collateral: string };

const sampleAddresses: Record<string, SampleAddress> = {
  "Multiple Troves": { type: "address", value: "0x6665e62ef6f6db29d5f8191fbac472222c2cc80f" },
  "Redemption": { type: "trove", value: "108550162375459801081263175493506884375415170607601597105767494617691416279914", collateral: "WETH" },
  "Liquidation": { type: "trove", value: "37074809567919752442189907000666523308270530793726257191383299205622979408716", collateral: "WETH" },
  "Sizeable loan": { type: "trove", value: "108944359109208165624092356986168793957147284372283522328459696677773946197825", collateral: "WETH" },
  "Adjust Interest Rate": { type: "trove", value: "61010792625571153425067473455212148956727512052795796603835829351408505245957", collateral: "WETH" },
  "Trove Transfer": { type: "trove", value: "67872479288899261507793697577754208586488365819754818403051389498986683142732", collateral: "wstETH" },
  "Zombie Trove": { type: "trove", value: "95820990254409912827054397309958850335014404990634110562055610547259397124124", collateral: "WETH" },
  "Open with delegate": { type: "trove", value: "54495587837920133815632508166260258833637212972586767178860236873613556271151", collateral: "WETH" },
  "Delegate": { type: "trove", value: "102570399347334904848277730749855536164897158539639787290331273088032008072627", collateral: "wstETH" },
};

export default function Home() {
  const [searchValue, setSearchValue] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/address/${searchValue}`);
  };

  const handleSampleClick = (sample: string) => {
    const sampleData = sampleAddresses[sample];
    if (sampleData.type === "address") {
      router.push(`/address/${sampleData.value}`);
    } else if (sampleData.type === "trove") {
      router.push(`/trove/${sampleData.collateral}/${sampleData.value}`);
    }
  };

  return (
    <div className="relative w-full pl-24 px-4">
      <div className="md:flex gap-8">
        {/* Content */}
        <div className="md:flex-shrink-0 md:w-[480px] space-y-8">
          {/* Search */}
          <form onSubmit={handleSearch} className="relative">
            <Icon
              name="search"
              size={20}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              placeholder="Borrower address / Trove ID or delegate"
              className="w-full pl-12 pr-14 py-3 text-base bg-white text-gray-900 border-2 border-gray-300 hover:border-gray-400 focus:border-blue-500 focus:outline-none transition-colors placeholder-gray-500 rounded-full"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
          </form>

          <p className="text-gray-600 text-2xl font-semibold">
            <span className="text-green-600">Rails</span> creates DeFi event timelines with
            simple explanations and detailed analysis.
          </p>

          {/* Protocol table */}
          <div className="space-y-6">
            <div className="bg-gray-50 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Protocol</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Collateral</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Debt</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-2 align-top">
                      <div className="flex items-start gap-2 whitespace-nowrap">
                        <svg className="w-8 h-8 flex-shrink-0" viewBox="0 0 40 40">
                          <use href="#icon-liquity" />
                        </svg>
                        <span className="font-medium text-black">
                          Liquity v2
                          <br />
                          <a href="https://liquity.org" target="_blank" className="text-xs text-blue-400">
                            liquity.org
                          </a>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <div className="flex items-center">
                        <div className="w-8 h-8 z-30">
                          <TokenIcon assetSymbol="reth" className="w-full h-full" />
                        </div>
                        <div className="w-8 h-8 -ml-3 z-20">
                          <TokenIcon assetSymbol="eth" className="w-full h-full" />
                        </div>
                        <div className="w-8 h-8 -ml-3 z-10">
                          <TokenIcon assetSymbol="wsteth" className="w-full h-full" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <div className="flex items-center">
                        <div className="w-8 h-8">
                          <TokenIcon assetSymbol="bold" className="w-full h-full" />
                        </div>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-4 py-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <div className="flex items-center gap-0.5 text-xs font-semibold text-gray-700">
                            <Icon name="zap" size={12} />
                            <span>Samples:</span>
                          </div>
                          {Object.keys(sampleAddresses).map((sample) => (
                            <button
                              key={sample}
                              onClick={() => handleSampleClick(sample as keyof typeof sampleAddresses)}
                              className="text-blue-600 border border-blue-200 cursor-pointer hover:underline text-xs font-semibold bg-blue-100 px-2 py-0.5 rounded-sm"
                            >
                              {sample}
                            </button>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <a className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2" href="/stats">📊 Protocol Stats</a>
              <span className="text-xs text-gray-400 mx-2">•</span>
              <a className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2" href="/troves">Browse all troves...</a>
              <span className="text-xs text-gray-400 mx-2">•</span>
              <a className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2" href="/trove/WETH/mock-all-events">Mock events</a>
            </p>
            <p className="text-green-600 font-semibold">More protocols coming soon...</p>
          </div>

          {/* Donation section */}
          <div className="space-y-1 text-gray-600">
            <p className="text-2xl font-semibold text-green-600">
              <a
                href="https://etherscan.io/name-lookup-search?id=donate.rails.eth"
                className="hover:underline"
                target="_blank"
                title="Link to donate.rails.eth on etherscan.io"
              >
                donate.rails.eth
              </a>
            </p>
            <p className="text-sm font-semibold">
              If you'd like to support Rails please consider donating. We are team of two, on a mission to make DeFi
              more accessible for all!
            </p>
          </div>

          {/* Thank you section */}
          <div className="space-y-1 text-gray-600">
            <p className="text-2xl font-semibold text-green-600">Thank you Liquity</p>
            <p className="text-sm font-semibold">
              Special thanks to{" "}
              <a href="https://liquity.org" className="hover:underline" target="_blank" title="Link to liquity.org">
                Liquity
              </a>{" "}
              for helping us get started!
            </p>
          </div>
        </div>

        {/* Hero image */}
        <div className="hidden md:block md:flex-1 relative">
          <div className="relative h-[600px]">
            <Image
              src="/hero.png"
              alt="Liquity v2 Interface"
              width={800}
              height={600}
              className="h-full w-auto object-contain object-left"
              priority
            />
          </div>
        </div>
      </div>
    </div>
  );
}
