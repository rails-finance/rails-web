"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GraduationCap, Wallet, Code2, ShieldAlert, Lightbulb, Activity } from "lucide-react";
import Link from "next/link";
import { ProtocolStats } from "@/types/api/stats";
import { LiquityLogo } from "@/components/LiquityLogo";
import { NetworkGraphic } from "@/components/NetworkGraphic";
import { CollateralBreakdown } from "@/components/stats/CollateralBreakdown";
import { ExplanationPanel } from "@/components/transaction-timeline/explanation/ExplanationPanel";

export default function Home() {
  const [searchValue, setSearchValue] = useState("");
  const [liquityStats, setLiquityStats] = useState<ProtocolStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const router = useRouter();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedValue = searchValue.trim();

    if (!trimmedValue) return;

    // Detect input type (same logic as TroveListFilters)
    const isTroveId = /^\d+$/.test(trimmedValue);
    const isEns = trimmedValue.toLowerCase().endsWith(".eth");
    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(trimmedValue);

    // Only navigate if input matches a valid pattern
    if (!isTroveId && !isAddress && !isEns) {
      return;
    }

    // Build URL params
    const params = new URLSearchParams();

    if (isTroveId) {
      params.set("troveId", trimmedValue);
    } else if (isAddress) {
      params.set("ownerAddress", trimmedValue);
    } else if (isEns) {
      params.set("ownerEns", trimmedValue);
    }

    router.push(`/troves?${params.toString()}`);
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/stats");
        const result = await response.json();
        if (result.success && result.data) {
          setLiquityStats(result.data);
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 min-h-screen">
      {/* Hero Section - Responsive */}
      <div className="relative pt-24">
        {/* Desktop Layout Container */}
        <div className="md:relative md:h-[500px] md:flex">
          {/* Content - Responsive positioning */}
          <div className="px-4 pt-8 md:px-0 md:pt-0 md:w-1/2 md:max-w-[640px] md:mx-0 md:ml-auto md:relative">
            <div className="md:flex md:flex-col md:h-full">
              {/* Text Content - Same for both mobile and desktop */}
              <div className="md:flex-1 md:px-6 md:py-8 md:flex md:flex-col md:justify-center md:relative md:z-10">
                <p className="text-slate-700 dark:text-slate-200 text-xl md:text-3xl lg:text-4xl/12  font-bold mb-4">
                  DeFi activity on&nbsp;simple timelines with in&#8209;depth analysis
                </p>
              </div>

              {/* Bottom spacer for desktop layout */}
              <div className="hidden md:block md:flex-1"></div>
            </div>
          </div>

          {/* Desktop Bottom Left Background SVG */}
          <div
            className="hidden md:block absolute bottom-0 left-0 h-1/2 pointer-events-none"
            style={{
              width: "50%",
              backgroundImage: "url(/hero-bl.svg)",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right top",
              backgroundSize: "auto 100%",
            }}
          />

          {/* Desktop Right Side Background SVG */}
          <div
            className="hidden md:block md:w-1/2 md:h-1/2 md:-mt-24"
            style={{
              backgroundImage: "url(/hero-r.svg)",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "left center",
              backgroundSize: "auto 100%",
              height: "calc(100% + 6rem)",
            }}
          />
        </div>

        {/* Mobile SVG Section */}
        <div className="md:hidden w-full relative overflow-visible">
          <img
            src="/hero-mobile.svg"
            alt="Hero mobile decoration"
            className="w-full"
            style={{ display: "block" }}
          />
        </div>
      </div>

      <div className="relative overflow-x-hidden pb-12">
        <div className="relative z-10 w-full mx-auto px-4 max-w-7xl">
          <div className="md:flex gap-8">
            {/* Content Column continued */}
            <div>
              {/* Liquity V2 Protocol Card */}
              <div className="">
                <div className="bg-slate-100/50 dark:bg-slate-800 rounded-lg overflow-hidden">
                  <div className="p-4 space-y-6">

                    {/* Mobile: Stacked, Desktop: Two columns */}
                    
                    <div className="flex flex-col md:flex-row md:gap-8 md:items-center">
                      <div className="text-slate-600  dark:text-slate-400 font-medium text-md leading-relaxed md:flex-1 flex items-center mb-6 md:mb-0">
                        <p>
<div className="flex items-center gap-2 mb-4">
                    <span className="text-2xl text-slate-600 dark:text-slate-300 font-extrabold">
                      Explore
                      </span> <svg className="w-12 h-12" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                        <use href="#icon-liquity" />
                      </svg>
                      <span className="text-2xl text-slate-600 dark:text-slate-300 font-extrabold">
                        Liquity V2
                      </span>
                    </div>
                          Liquity V2 enables users to deposit ETH, wstETH, or rETH as collateral to mint BOLD stablecoins and set their own interest rates.
                        </p>
                      </div>

                      {/* Search Box - Mobile and Desktop */}
                      <div className="md:flex-1 bg-white dark:bg-slate-900 rounded-lg p-4 transition-shadow hover:shadow-sm">
                        <p className="text-slate-600 dark:text-slate-400 font-medium mb-3">
                          View a Liquity V2 Trove on Rails:
                        </p>
                        <form onSubmit={handleSearch}>
                          <div className="relative">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 dark:text-slate-400"
                            >
                              <circle cx="11" cy="11" r="8" />
                              <path d="m21 21-4.3-4.3" />
                            </svg>
                            <input
                              type="text"
                              className="w-full pl-10 pr-4 py-2 text-sm bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-2 border-blue-500 dark:border-blue-500 hover:border-slate-400 dark:hover:border-slate-500 focus:border-blue-500 dark:focus:border-white focus:outline-none transition-colors placeholder-slate-500 dark:placeholder-slate-400 rounded-full"
                              value={searchValue}
                              onChange={(e) => setSearchValue(e.target.value)}
                            />
                          </div>
                          <p className="text-slate-500 text-xs mt-2">Enter borrower address, ENS, or Trove ID</p>
                        </form>
                      </div>
                    </div>
                    {/* Collateral Overview */}
                    <CollateralBreakdown
                      data={liquityStats?.byCollateral || {}}
                      mode="overview"
                      loading={statsLoading}
                    />

                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="w-full pb-24">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl font-extrabold text-slate-700 dark:text-slate-200 text-center mb-4">
            Who is Rails for?
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="h-full bg-white dark:bg-slate-800/60 rounded-xl p-6 shadow-sm flex flex-col">
              <p className="text-sm font-semibold flex items-center gap-2 tracking-wide text-blue-600 dark:text-blue-500 mb-2">
                <GraduationCap className="h-5 w-5" aria-hidden="true" />
                The DeFi Curious
              </p>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-3">Learn by example</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                New users can browse real transactions to see how DeFi protocols operate in practice, explore trove
                timelines, and build intuition before they risk capital.
              </p>
            </div>
            <div className="h-full bg-white dark:bg-slate-800/60 rounded-xl p-6 shadow-sm flex flex-col">
              <p className="text-sm font-semibold flex items-center gap-2 tracking-wide text-emerald-600 dark:text-emerald-500 mb-2">
                <Wallet className="h-5 w-5" aria-hidden="true" />
                The Active DeFi User
              </p>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-3">Stay on top of positions</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Monitor positions, understand nuanced onchain events, and view interpreted logs so nothing stays
                buried in transaction traces.
              </p>
            </div>
            <div className="h-full bg-white dark:bg-slate-800/60 rounded-xl p-6 shadow-sm flex flex-col">
              <p className="text-sm font-semibold flex items-center gap-2 tracking-wide text-purple-600 dark:text-purple-500 mb-2">
                <Code2 className="h-5 w-5" aria-hidden="true" />
                DeFi Teams
              </p>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-3">Support your community</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed flex-1">
                Provide verifiable support with a Rails explorer tailored to your protocol. Give users clear timelines,
                and human-readable insights.
              </p>
            </div>
            <div className="h-full bg-white dark:bg-slate-800/60 rounded-xl p-6 shadow-sm flex flex-col">
              <p className="text-sm font-semibold flex items-center gap-2 tracking-wide text-amber-600 dark:text-amber-500 mb-2">
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                Crisis Support
              </p>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-3">When frontends fail</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed flex-1">
                Check your positions safely during DNS hijacks or frontend failures. No wallet connection required—just read-only access when you need it most.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Supporters Section */}
      <div className="w-full pb-24">
        <div className="sm:max-w-5xl mx-auto px-4">
          <p className="sm:text-center text-xl md:text-2xl leading-8 text-slate-700 dark:text-slate-300 mb-6">
            Rails is building essential DeFi support infrastructure, starting with Liquity V2. Our roadmap includes
            integration with Liquity V2 forks and expansion across the broader DeFi ecosystem.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="/about"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-150"
            >
              <Lightbulb className="h-5 w-5" />
              Learn about Rails
            </a>
            <a
              href="/pulse"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors duration-150"
            >
              <Activity className="h-5 w-5" />
              Check our Pulse
            </a>
          </div>
        </div>
      </div>
      {/* Our Supporters Section */}
      <div className="w-full pb-24">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl font-extrabold text-slate-500 dark:text-slate-400 text-center mb-8">
            Our Supporters
          </h2>
          <div className="flex justify-center">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-8" style={{ width: "400px", height: "120px" }}>
              <div className="flex items-center justify-center h-full">
                <a href="https://liquity.org" target="_blank" rel="noopener noreferrer" className="h-full">
                  <LiquityLogo />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}
