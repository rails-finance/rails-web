"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { CollateralBreakdown } from "@/components/stats/CollateralBreakdown";
import { ProtocolStats } from "@/types/api/stats";

export default function Home() {
  const [searchValue, setSearchValue] = useState("");
  const [liquityStats, setLiquityStats] = useState<ProtocolStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/address/${searchValue}`);
  };


  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats');
        const result = await response.json();
        if (result.success && result.data) {
          setLiquityStats(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="bg-white text-gray-900 min-h-screen pb-12">
      <div className="relative">
        {/* Video Background Section */}
        <div className="relative w-full mx-auto max-w-7xl">
          <div className="relative">
            {/* Inner shadow overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                height: '600px',
                boxShadow: 'inset 0 0 100px 50px rgba(255, 255, 255, 0.9), inset 0 0 200px 100px rgba(255, 255, 255, 0.7)',
                background: 'radial-gradient(ellipse at center, transparent 0%, rgba(255, 255, 255, 0.4) 70%, rgba(255, 255, 255, 0.8) 100%)'
              }}
            />

            {/* Content over video */}
            <div className="relative z-10 px-4" style={{ height: '600px' }}>
              <div className="h-full">
                <div className="md:flex gap-8 h-full">
                  {/* Logo Column */}
                  <div className="flex-shrink-0 pt-12">
                    <div className="p-3 sm:p-4 w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
                      {/* Logo placeholder */}
                    </div>
                  </div>

                  {/* Content Column */}
                  <div className="md:flex-1 md:max-w-none pt-12 md:pr-8">
                    {/* First paragraph positioned lower in the video area */}
                    <div className="mt-32  md:max-w-[50%]">
                      <p className="text-gray-700 text-xl md:text-2xl font-semibold mb-4 rounded-lg inline-block">
                        <span className="text-green-600">Rails</span> displays your DeFi activity on intuitive timelines with clear explanations and in-depth transaction analysis.
                      </p>
                      <p className="text-gray-700 mb-4 rounded-lg inline-block">
                    Rails is building essential DeFi support infrastructure, starting with Liquity v2. Our roadmap includes integration with Liquity v2 forks and expansion across the broader DeFi ecosystem. Discover our approach here.
                    <a className="text-green-500" href="about/">here</a>.
                  </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Rest of content below video */}
        <div className="relative overflow-x-hidden">
          <div className="relative z-10 w-full mx-auto px-4 max-w-7xl">
            <div className="md:flex gap-8">
              {/* Spacer for alignment */}
              <div className="flex-shrink-0">
                <div className="p-3 sm:p-4 w-16 h-16 sm:w-20 sm:h-20">
                </div>
              </div>

              {/* Content Column continued */}
              <div className="md:flex-1 md:max-w-none space-y-12 pb-12 md:pr-8">
                {/* Introduction text */}
                <div>
                </div>

                {/* Liquity v2 Protocol Card */}
                <div className="space-y-6">
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <div className="p-4 space-y-6">
                      <div className="flex items-center gap-2 mb-4">
                            <svg className="w-7 h-7" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                              <use href="#icon-liquity" />
                            </svg>
                        <span className="font-medium text-lg">Explore Liquity v2</span>
                      </div>
                      <p className="text-slate-500 text-sm leading-relaxed">
                        <strong>Liquity v2</strong> is a fully immutable, governance-free borrowing protocol where users can deposit ETH, wstETH, or rETH as collateral to mint BOLD stablecoins at user-set interest rates (0.5%-250% APR). Explore <strong>Liquity v2</strong> with Rails:
                      </p>

                    {/* Search Bar */}
                    <div className="relative px-4">
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
                        className="absolute left-8 top-1/2 transform -translate-y-1/2 text-slate-500"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Borrower address / ENS, Trove ID or delegate"
                        className="w-full pl-12 pr-14 py-3 text-base bg-white text-gray-900 border-2 border-gray-300 hover:border-gray-400 focus:border-blue-500 focus:outline-none transition-colors placeholder-gray-500 rounded-full"
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                      />
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
      </div>
    </div>
  );
}