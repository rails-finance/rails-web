import { LiquityLogo } from "@/components/LiquityLogo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Rails",
  description:
    "Learn about Rails and our mission to make DeFi more understandable and accessible for everyone. Building essential self-service support infrastructure for DeFi users, starting with Liquity V2.",
  openGraph: {
    title: "About Rails",
    description:
      "Learn about Rails and our mission to provide self-service support that makes DeFi more understandable and accessible for everyone.",
    url: "https://rails.finance/about",
  },
};

export default function AboutPage() {
  return (
    <div className="container mx-auto md:px-6 px-4 pt-32 pb-12 max-w-7xl">
      <div className="prose prose-lg max-w-none">
        <p className="text-xl mb-8 text-slate-800 dark:text-slate-200">
          We believe that decentralised finance (DeFi) represents the future of finance, but it's currently too complex
          for most users to understand and navigate safely. <span className="font-bold">Rails</span> bridges this gap by
          providing clear, intuitive explanations of DeFi transactions and protocol events, empowering users with
          self-service support that keeps them informed and confident in their DeFi activity.
        </p>

        {/* Roadmap & Mission Section */}

        <div className="lg:grid mb-12 lg:grid-cols-[1fr_180px_480px] lg:grid-rows-[40px_180px_180px_180px_180px]">
          <div
            id="cell_1"
            className="my-8 lg:my-0 row-span-2 col-start-1 row-start-2 lg:justify-center lg:flex lg:flex-col"
          >
            <div className="">
              <h3 className="text-2xl font-bold text-slate-600 dark:text-slate-300 mb-6">
                The Definitive DeFi Support Platform
              </h3>
              <p className="text-lg text-slate-700 dark:text-slate-300">
                <span className="font-bold">Our mission</span> is to make DeFi more understandable and accessible for
                everyone.
              </p>
            </div>
          </div>
          <div
            id="cell_2"
            className="hidden lg:block row-span-3 col-start-2 bg-white dark:bg-slate-900 rounded-lg"
            style={{
              backgroundImage: "url(/about-mission-lg__1.svg)",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center center",
              backgroundSize: "contain",
            }}
            aria-label="Mission decoration"
          />
          <div id="cell_3" className="col-start-3 row-start-2">
            <div className="rounded-lg p-5 border-2 border-green-600 mb-2 lg:mb-0 lg:h-full lg:flex lg:flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center mr-3">
                    <span className="text-white font-bold">1</span>
                  </div>
                  <h4 className="text-lg font-semibold text-slate-600 dark:text-slate-300">Liquity V2 Support</h4>
                </div>
                <span className="text-xs font-extrabold text-green-100 bg-green-600 px-2 py-1 rounded">
                  Completed
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 ml-13">
                Full integration with Liquity V2 protocol including trove tracking, transaction analysis, and
                comprehensive event explanations.
              </p>
            </div>
          </div>
          <div id="cell_4" className="mb-2 lg:mb-0 col-start-3 row-start-3">
            <div className="rounded-lg p-5 border-2 border-blue-600 lg:mt-2 lg:h-full lg:flex lg:flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                    <span className="text-white font-bold">2</span>
                  </div>
                  <h4 className="text-lg font-semibold text-slate-600 dark:text-slate-300">Ecosystem Expansion</h4>
                </div>
                <span className="text-xs font-extrabold text-blue-100 bg-blue-600 px-2 py-1 rounded">
                  In Progress
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 ml-13">
                Rails extends its analytics to all Liquity V2 friendly forks, establishing Rails as the standard for CDP
                protocol support.
              </p>
            </div>
          </div>
          <div id="cell_5" className="col-start-1 row-start-4">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5 mb-2 lg:mb-0 lg:h-full lg:flex lg:flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center mr-3">
                    <span className="text-white font-bold">3</span>
                  </div>
                  <h4 className="text-lg font-semibold text-slate-600 dark:text-slate-300">
                    Multi-Protocol Intelligence
                  </h4>
                </div>
                <span className="text-xs font-extrabold text-slate-100 bg-slate-400 px-2 py-1 rounded">
                  Planned
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 ml-13">
                Expanding to support the likes of Morpho, Compound, Aave, Sky and beyond - creating a unified analytics
                layer for protocol interactions.
              </p>
            </div>
          </div>
          <div id="cell_6" className="row-start-5 ">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5 lg:mt-2 lg:h-full lg:flex lg:flex-col ">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-orange-400 rounded-full flex items-center justify-center mr-3">
                    <span className="text-white font-bold">4</span>
                  </div>
                  <h4 className="text-lg font-semibold text-slate-600 dark:text-slate-300">Modularisation</h4>
                </div>
                <span className="text-xs font-extrabold text-slate-100 bg-slate-400 px-2 py-1 rounded">
                  Planned
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 ml-13">
                Rails evolves into portable, composable infrastructure that can be embedded directly into wallets,
                dApps, and protocols.
              </p>
            </div>
          </div>
          <div
            id="cell_7"
            className=" hidden lg:block row-span-2  col-span-2 col-start-2 row-start-4 justify-start mt-2 bg-white dark:bg-slate-900 rounded-lg"
            style={{
              backgroundImage: "url(/about-mission-lg__2.svg)",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center center",
              backgroundSize: "contain",
            }}
            aria-label="Roadmap decoration"
          />
        </div>

        {/* Team Section */}
        <div className="mb-12">
          <h2 className="text-3xl font-semibold mb-6 text-slate-600 dark:text-slate-300">Team</h2>

          {/* Miles */}
          <div className="grid md:grid-cols-2 gap-8  mb-8">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6">
              <div className="flex items-center mb-4">
                <img
                  src="/about-team-milesessex.jpg"
                  alt="Miles Essex"
                  className="w-16 h-16 rounded-full mr-4 object-cover"
                />
                <div>
                  <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300">Miles Essex</h3>
                  <p className="text-slate-600 dark:text-slate-400">Designer</p>
                  <a
                    href="https://x.com/milesessex"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    @milesessex
                  </a>
                </div>
              </div>
              <p className="text-slate-700 dark:text-slate-300">
                Graphic UX designer with 20+ years experience. Focused on creating intuitive interfaces for complex
                financial data.
              </p>
            </div>
            {/* Slava */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6">
              <div className="flex items-center mb-4">
                <img src="/about-team-slvdev.jpg" alt="Slava" className="w-16 h-16 rounded-full mr-4 object-cover" />
                <div>
                  <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300">Slava</h3>
                  <p className="text-slate-600 dark:text-slate-400">Developer</p>
                  <a
                    href="https://x.com/slvdev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    @slvdev
                  </a>
                </div>
              </div>
              <p className="text-slate-700 dark:text-slate-300">
                Web3 developer with expertise in Rust and Solidity. Focused on building infrastructure that makes DeFi
                protocols accessible and understandable.
              </p>
            </div>
          </div>
        </div>

        {/* Supporters Section */}
        <div className="mb-12">
          <h2 className="text-3xl font-semibold mb-6 text-slate-600 dark:text-slate-300">Our Supporters</h2>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6">
            <div className="flex items-start">
              <div className="flex-1">
                <div className="flex items-center mb-4 h-full">
                  <a href="https://liquity.org" target="_blank" rel="noopener noreferrer" className="h-full">
                    <LiquityLogo className="h-full w-auto" />
                  </a>
                </div>
                <p className="text-slate-700 dark:text-slate-300 mb-3">
                  Liquity has been instrumental in getting Rails off the ground, providing a grant to
                  kickstart our development. Their support enables us to build critical infrastructure for the Liquity
                  ecosystem and beyond. Thank you to Liquity!
                </p>
              </div>
              
            </div>
          </div>
        </div>
        {/* Contact Section */}
        <div className="mb-12">
          <h2 className="text-3xl font-semibold mb-6 text-slate-600 dark:text-slate-300">Connect With Us</h2>

          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 shadow hover:lg:shadow-lg">
              <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">General Inquiries</h3>
              <div className="space-y-3">
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-3 text-slate-600 dark:text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <a
                    href="https://x.com/rails_finance"
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                    target="_blank"
                  >
                    @rails_finance
                  </a>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  We'd love to hear from you! Whether you have questions, feedback, or just want to say hello.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6 shadow hover:lg:shadow-lg">
              <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Our code</h3>
              <div className="space-y-3">
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-3 text-slate-600 dark:text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                  </svg>
                  <a
                    href="https://github.com/rails-finance"
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                    target="_blank"
                  >
                    GitHub
                  </a>
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  Help us continue building tools for the DeFi community
                </p>
              </div>
            </div>

            <div className="bg-fuchsia-400 dark:bg-fuchsia-500 rounded-lg p-6 shadow hover:lg:shadow-lg">
              <h3 className="text-xl font-extrabold text-white mb-4">Support Rails</h3>
              <div className="space-y-3">
                <div className="flex items-center">
                  <a
                    href="https://etherscan.io/name-lookup-search?id=donate.rails.eth"
                    className=" rounded-full bg-fuchsia-600 dark:bg-fuchsia-700 hover:bg-fuchsia-700/50 dark:hover:bg-fuchsia-800/50 transition-all duration-300 p-2 px-4 text-3xl font-extrabold text-white  hover:text-white"
                    target="_blank"
                  >
                    donate<span className="hidden lg:inline">.rails.eth</span>
                  </a>
                </div>
                <p className="text-white ">
                  Help us continue building tools for the DeFi community{" "}
                  <span className="lg:hidden">
                    by donating to <span className="underline font-extrabold">donate.rails.eth</span>
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
