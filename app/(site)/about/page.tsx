export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-4xl font-bold mb-8 text-gray-900">About Rails</h1>

      <div className="prose prose-lg max-w-none text-gray-800">
        <p className="text-xl mb-8">
          Rails transforms complex protocol data into intuitive timelines with clear explanations and in-depth transaction analysis.
        </p>

        <p className="mb-6">
          We believe that DeFi represents the future of finance, but it's currently too complex for most users to understand and navigate safely. Rails bridges this gap by providing clear, intuitive explanations of DeFi transactions and protocols, helping users make informed decisions about their financial activities.
        </p>

        <p className="mb-8">
          Rails is building essential DeFi support infrastructure, starting with Liquity v2. Our roadmap includes seamless integration with Liquity-compatible forks and expansion across the broader DeFi ecosystem. Discover our approach here.
        </p>

        {/* Protocol table */}
                        <div className="space-y-6">
                          <div className="bg-gray-50 rounded-lg overflow-hidden">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-gray-100">
                                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Protocol</th>
                                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Network</th>
                                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Collateral</th>
                                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Borrow</th>
                                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* Liquity V2  */}
                                <tr>
                                  <td colSpan={5} className="p-0">
                                    <div className="px-4 py-2">
                                      <div className="flex items-center gap-2 mb-4">
                                        <div className="pl-4 pr-5 rounded-br-lg rounded-tl-lg py-2 flex items-center justify-center relative">
                                          <svg className="absolute inset-0 w-full h-full rounded-br-lg rounded-tl-lg" viewBox="0 0 96 48" preserveAspectRatio="none">
                                            <use href="#protocol-bg-liquity-v2" />
                                          </svg>
                                          <div className="w-7 h-7 rounded-full flex items-center justify-center relative z-10">
                                            <svg className="w-7 h-7" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                              <use href="#protocol-liquity-v2" />
                                            </svg>
                                          </div>
                                        </div>
                                        <span className="font-medium text-lg">
                                          Liquity v2
                                        </span>
                                        <span className="text-xs text-gray-500">Ethereum</span>
                                      </div>
                                      
                                    </div>
                                  </td>
                                </tr>
                                  <tr>
                                  <td colspan="6">{/* Introduction */}
        														{/* Search */}
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
                            className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500"
                          >
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.3-4.3" />
                          </svg>
                          
                        </div>
        								<div className="p-8">
        															<p className="text-slate-500 text-sm leading-relaxed">
        																Euismod at neque quam parturient consectetur ante torquent tristique nam, accumsan hac eu sapien habitant cras mollis turpis justo, arcu litora nascetur ac sollicitudin feugiat viverra dolor, adipiscing dignissim magna netus convallis montes maecenas lobortis. Habitant tincidunt per semper maximus .
        															</p>
        															
        														</div>
        														
        														</td>
                                  </tr>
        
                                {/* Asymmetry Finance */}
                                <tr>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-start gap-2 whitespace-nowrap">
                                      <div className="pl-4 pr-5 rounded-br-lg rounded-tl-lg py-2 flex items-center justify-center relative">
                                        <svg className="absolute inset-0 w-full h-full rounded-br-lg rounded-tl-lg" viewBox="0 0 96 48" preserveAspectRatio="none">
                                          <use href="#protocol-bg-asymmetry" />
                                        </svg>
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center relative z-10">
                                          <svg className="w-7 h-7" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                            <use href="#protocol-asymmetry" />
                                          </svg>
                                        </div>
                                      </div>
                                      <span className="font-medium leading-tight">
                                        Asymmetry 
                                        <br />
                                                                        <a href="https://asymmetry.finance" target="_blank" className="text-xs text-slate-400">
                                          asymmetry.finance
                                        </a>
        
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="text-xs text-gray-500">Ethereum</span>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6 z-60 opacity-50 filter-grayscale" viewBox="0 0 48 48">
                                        <use href="#asset-scrvusd" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-50" viewBox="0 0 48 48">
                                        <use href="#asset-sfrxusd" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-40" viewBox="0 0 48 48">
                                        <use href="#asset-susds" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-30" viewBox="0 0 48 48">
                                        <use href="#asset-tbtc" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-20" viewBox="0 0 48 48">
                                        <use href="#asset-wbtc" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-10" viewBox="0 0 48 48">
                                        <use href="#asset-ysybold" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6" viewBox="0 0 48 48">
                                        <use href="#asset-usdaf" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
                                      Planned
                                    </span>
                                  </td>
                                </tr>
        
                                {/* Felix Protocol */}
                                <tr>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-start gap-2 whitespace-nowrap">
                                      <div className="pl-4 pr-5 rounded-br-lg rounded-tl-lg py-2 flex items-center justify-center relative">
                                        <svg className="absolute inset-0 w-full h-full rounded-br-lg rounded-tl-lg" viewBox="0 0 96 48" preserveAspectRatio="none">
                                          <use href="#protocol-bg-felix" />
                                        </svg>
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center relative z-10">
                                          <svg className="w-7 h-7" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                            <use href="#protocol-felix" />
                                          </svg>
                                        </div>
                                      </div>
                                      <span className="font-medium leading-tight">
                                        Felix 
                                        <br />
                                        <a href="https://www.usefelix.xyz" target="_blank" className="text-xs text-slate-400">
                                          usefelix.xyz
                                        </a>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="text-xs text-gray-500">Hyperliquid</span>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6 z-40" viewBox="0 0 48 48">
                                        <use href="#asset-hype" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-30" viewBox="0 0 48 48">
                                        <use href="#asset-khype" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-20" viewBox="0 0 48 48">
                                        <use href="#asset-wsthype" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-10" viewBox="0 0 48 48">
                                        <use href="#asset-btc" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6" viewBox="0 0 48 48">
                                        <use href="#asset-feusd" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
                                      Planned
                                    </span>
                                  </td>
                                </tr>
        
                                {/* Nerite Protocol */}
                                <tr>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-start gap-2 whitespace-nowrap">
                                      <div className="pl-4 pr-5 rounded-br-lg rounded-tl-lg py-2 flex items-center justify-center relative">
                                        <svg className="absolute inset-0 w-full h-full rounded-br-lg rounded-tl-lg" viewBox="0 0 96 48" preserveAspectRatio="none">
                                          <use href="#protocol-bg-nerite" />
                                        </svg>
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center relative z-10">
                                          <svg className="w-7 h-7" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                            <use href="#protocol-nerite" />
                                          </svg>
                                        </div>
                                      </div>
                                      <span className="font-medium leading-tight">
                                        Nerite 
                                        <br />
                                        <a href="https://www.nerite.org" target="_blank" className="text-xs text-slate-400">
                                          nerite.org
                                        </a>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="text-xs text-gray-500">Arbitrum</span>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6 z-80" viewBox="0 0 120 120">
                                        <use href="#asset-weth" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-70" viewBox="0 0 120 120">
                                        <use href="#asset-wsteth" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-60" viewBox="0 0 120 120">
                                        <use href="#asset-reth" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-50" viewBox="0 0 120 120">
                                        <use href="#asset-rseth" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-40" viewBox="0 0 120 120">
                                        <use href="#asset-weeth" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-30" viewBox="0 0 120 120">
                                        <use href="#asset-arb" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-20" viewBox="0 0 120 120">
                                        <use href="#asset-comp" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-10" viewBox="0 0 120 120">
                                        <use href="#asset-tbtc" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-usnd" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
                                      Planned
                                    </span>
                                  </td>
                                </tr>
        
                                {/* Quill Finance */}
                                <tr>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-start gap-2 whitespace-nowrap">
                                      <div className="pl-4 pr-5 rounded-br-lg rounded-tl-lg py-2 flex items-center justify-center relative">
                                        <svg className="absolute inset-0 w-full h-full rounded-br-lg rounded-tl-lg" viewBox="0 0 96 48" preserveAspectRatio="none">
                                          <use href="#protocol-bg-quill" />
                                        </svg>
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center relative z-10">
                                          <svg className="w-7 h-7" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                            <use href="#protocol-quill" />
                                          </svg>
                                        </div>
                                      </div>
                                      <span className="font-medium leading-tight">
                                        Quill
                                        <br />
                                        <a href="https://quill.finance" target="_blank" className="text-xs text-slate-400">
                                          quill.finance
                                        </a>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="text-xs text-gray-500">Scroll</span>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6 z-40" viewBox="0 0 120 120">
                                        <use href="#asset-weth" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-30" viewBox="0 0 120 120">
                                        <use href="#asset-wsteth" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-20" viewBox="0 0 120 120">
                                        <use href="#asset-weeth" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-10" viewBox="0 0 120 120">
                                        <use href="#asset-scr" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-usdq" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
                                      Planned
                                    </span>
                                  </td>
                                </tr>
        
                                {/* Orki Finance */}
                                <tr>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-start gap-2 whitespace-nowrap">
                                      <div className="pl-4 pr-5 rounded-br-lg rounded-tl-lg py-2 flex items-center justify-center relative">
                                        <svg className="absolute inset-0 w-full h-full rounded-br-lg rounded-tl-lg" viewBox="0 0 96 48" preserveAspectRatio="none">
                                          <use href="#protocol-bg-orki" />
                                        </svg>
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center relative z-10">
                                          <svg className="w-7 h-7" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                            <use href="#protocol-orki" />
                                          </svg>
                                        </div>
                                      </div>
                                      <span className="font-medium leading-tight">
                                        Orki
                                        <br />
                                        <a href="https://orki.finance" target="_blank" className="text-xs text-slate-400">
                                          orki.finance
                                        </a>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="text-xs text-gray-500">Swellchain</span>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6 z-50" viewBox="0 0 120 120">
                                        <use href="#asset-weth" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-40" viewBox="0 0 120 120">
                                        <use href="#asset-sweth" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-30" viewBox="0 0 120 120">
                                        <use href="#asset-rsweth" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-20" viewBox="0 0 120 120">
                                        <use href="#asset-swell" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-10" viewBox="0 0 120 120">
                                        <use href="#asset-weeth" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-usdk" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
                                      Planned
                                    </span>
                                  </td>
                                </tr>
        
                                {/* Aesyx Finance */}
                                <tr>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-start gap-2 whitespace-nowrap">
                                      <div className="pl-4 pr-5 rounded-br-lg rounded-tl-lg py-2 flex items-center justify-center relative">
                                        <svg className="absolute inset-0 w-full h-full rounded-br-lg rounded-tl-lg" viewBox="0 0 96 48" preserveAspectRatio="none">
                                          <use href="#protocol-bg-aesyx" />
                                        </svg>
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center relative z-10">
                                          <svg className="w-7 h-7" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                            <use href="#protocol-aesyx" />
                                          </svg>
                                        </div>
                                      </div>
                                      <span className="font-medium leading-tight">
                                        Aesyx
                                        <br />
                                        <a href="https://aesyx.fi" target="_blank" className="text-xs text-slate-400">
                                          aesyx.fi
                                        </a>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="text-xs text-gray-500">Avalanche</span>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6 z-20" viewBox="0 0 120 120">
                                        <use href="#asset-savax" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-10" viewBox="0 0 120 120">
                                        <use href="#asset-btcb" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-axd" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
                                      Planned
                                    </span>
                                  </td>
                                </tr>
        
                                {/* Ebisu Finance */}
                                <tr>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-start gap-2 whitespace-nowrap">
                                      <div className="pl-4 pr-5 rounded-br-lg rounded-tl-lg py-2 flex items-center justify-center relative">
                                        <svg className="absolute inset-0 w-full h-full rounded-br-lg rounded-tl-lg" viewBox="0 0 96 48" preserveAspectRatio="none">
                                          <use href="#protocol-bg-ebisu" />
                                        </svg>
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center relative z-10">
                                          <svg className="w-7 h-7" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                            <use href="#protocol-ebisu" />
                                          </svg>
                                        </div>
                                      </div>
                                      <span className="font-medium leading-tight">
                                        Ebisu
                                        <br />
                                        <a href="https://ebisu.fi" target="_blank" className="text-xs text-slate-400">
                                          ebisu.money
                                        </a>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="text-xs text-gray-500">Ethereum</span>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6 z-40" viewBox="0 0 120 120">
                                        <use href="#asset-susde" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-30" viewBox="0 0 120 120">
                                        <use href="#asset-wbtc" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-20" viewBox="0 0 120 120">
                                        <use href="#asset-weeth" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-10" viewBox="0 0 120 120">
                                        <use href="#asset-lbtc" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-ebusd" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
                                      Planned
                                    </span>
                                  </td>
                                </tr>
        
                                {/* DeFi Dollar */}
                                <tr>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-start gap-2 whitespace-nowrap">
                                      <div className="pl-4 pr-5 rounded-br-lg rounded-tl-lg py-2 flex items-center justify-center relative">
                                        <svg className="absolute inset-0 w-full h-full rounded-br-lg rounded-tl-lg" viewBox="0 0 96 48" preserveAspectRatio="none">
                                          <use href="#protocol-bg-defidollar" />
                                        </svg>
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center relative z-10">
                                          <svg className="w-7 h-7" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                            <use href="#protocol-defidollar" />
                                          </svg>
                                        </div>
                                      </div>
                                      <span className="font-medium leading-tight">
                                        DeFi Dollar
                                        <br />
                                        <a href="https://defidollar.io" target="_blank" className="text-xs text-slate-400">
                                          defidollar.io
                                        </a>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="text-xs text-gray-500">Ethereum</span>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center flex-wrap gap-1">
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-aave" />
                                      </svg>
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-crv" />
                                      </svg>
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-fxs" />
                                      </svg>
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-ldo" />
                                      </svg>
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-link" />
                                      </svg>
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-lqty" />
                                      </svg>
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-sky" />
                                      </svg>
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-uni" />
                                      </svg>
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-wbtc" />
                                      </svg>
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-yfi" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-usdfi" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
                                      Planned
                                    </span>
                                  </td>
                                </tr>
                                {/* Soneta */}
                                <tr>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-start gap-2 whitespace-nowrap">
                                      <div className="pl-4 pr-5 rounded-br-lg rounded-tl-lg py-2 flex items-center justify-center relative">
                                        <svg className="absolute inset-0 w-full h-full rounded-br-lg rounded-tl-lg" viewBox="0 0 96 48" preserveAspectRatio="none">
                                          <use href="#protocol-bg-soneta" />
                                        </svg>
                                        <div className="w-7 h-7 rounded-full flex items-center justify-center relative z-10">
                                          <svg className="w-7 h-7" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                            <use href="#protocol-soneta" />
                                          </svg>
                                        </div>
                                      </div>
                                      <span className="font-medium leading-tight">
                                        DeFi Dollar
                                        <br />
                                        <a href="https://soneta.xyz" target="_blank" className="text-xs text-slate-400">
                                          soneta.xyz
                                        </a>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="text-xs text-gray-500">Sonic Labs</span>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6 z-40" viewBox="0 0 120 120">
                                        <use href="#asset-s" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-30" viewBox="0 0 120 120">
                                        <use href="#asset-sts" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-20" viewBox="0 0 120 120">
                                        <use href="#asset-wos" />
                                      </svg>
                                      <svg className="w-6 h-6 -ml-1 z-10" viewBox="0 0 120 120">
                                        <use href="#asset-lbtc" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <div className="flex items-center">
                                      <svg className="w-6 h-6" viewBox="0 0 120 120">
                                        <use href="#asset-one" />
                                      </svg>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 align-center">
                                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
                                      Planned
                                    </span>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
{/* Team Section */}
        <div className="mb-12">
          <h2 className="text-3xl font-semibold mb-6 text-gray-900">Team</h2>
          <p className="text-lg mb-6">
            Meet the team behind Rails - we are passionate about making DeFi more accessible for everyone.
          </p>

          <div className="grid md:grid-cols-2 gap-8 not-prose mb-8">
            <div className="bg-white/60 rounded-lg p-6 border border-gray-200">
              <div className="flex items-center mb-4">
                <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mr-4">
                  <span className="text-white font-bold text-xl">A</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Alex Chen</h3>
                  <p className="text-gray-600">Co-Founder & Lead Developer</p>
                </div>
              </div>
              <p className="text-gray-700">
                Former blockchain engineer at Ethereum Foundation. Passionate about building tools that make DeFi more understandable and accessible.
              </p>
            </div>

            <div className="bg-white/60 rounded-lg p-6 border border-gray-200">
              <div className="flex items-center mb-4">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mr-4">
                  <span className="text-white font-bold text-xl">S</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">Sarah Martinez</h3>
                  <p className="text-gray-600">Co-Founder & Product Designer</p>
                </div>
              </div>
              <p className="text-gray-700">
                UX designer with 8+ years experience in fintech. Focused on creating intuitive interfaces for complex financial data.
              </p>
            </div>
          </div>

          <p className="mb-4">
            We're committed to building tools that democratize access to decentralized finance while maintaining the security and transparency that makes DeFi so powerful.
          </p>
        </div>

        {/* Roadmap Section */}
        <div className="mb-12">
          <h2 className="text-3xl font-semibold mb-6 text-gray-900">Roadmap</h2>
          <p className="text-lg mb-6">
            Our vision for making DeFi more accessible and understandable for everyone.
          </p>

          <div className="space-y-6 not-prose">
            <div className="bg-white/60 rounded-lg p-6 border border-gray-200">
              <div className="flex items-center mb-3">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                <h3 className="text-xl font-semibold text-gray-900">Phase 1: Liquity V2 Support</h3>
                <span className="ml-auto text-sm font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">Completed</span>
              </div>
              <p className="text-gray-700">
                Full integration with Liquity V2 protocol including trove tracking, transaction analysis, and comprehensive event explanations.
              </p>
            </div>

            <div className="bg-white/60 rounded-lg p-6 border border-gray-200">
              <div className="flex items-center mb-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                <h3 className="text-xl font-semibold text-gray-900">Phase 2: Multi-Protocol Support</h3>
                <span className="ml-auto text-sm font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded-full">In Progress</span>
              </div>
              <p className="text-gray-700">
                Expanding support to include other major DeFi protocols like Compound, Aave, and MakerDAO.
              </p>
            </div>

            <div className="bg-white/60 rounded-lg p-6 border border-gray-200">
              <div className="flex items-center mb-3">
                <div className="w-3 h-3 bg-gray-400 rounded-full mr-3"></div>
                <h3 className="text-xl font-semibold text-gray-900">Phase 3: Advanced Analytics</h3>
                <span className="ml-auto text-sm font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">Planned</span>
              </div>
              <p className="text-gray-700">
                AI-powered insights, risk analysis, and personalized recommendations for DeFi users.
              </p>
            </div>

            <div className="bg-white/60 rounded-lg p-6 border border-gray-200">
              <div className="flex items-center mb-3">
                <div className="w-3 h-3 bg-gray-400 rounded-full mr-3"></div>
                <h3 className="text-xl font-semibold text-gray-900">Phase 4: Mobile App</h3>
                <span className="ml-auto text-sm font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">Future</span>
              </div>
              <p className="text-gray-700">
                Native mobile applications for iOS and Android with push notifications and offline support.
              </p>
            </div>
          </div>
        </div>

        {/* Contact Section */}
        <div className="mb-12">
          <h2 className="text-3xl font-semibold mb-6 text-gray-900">Contact Us</h2>
          <p className="text-lg mb-6">
            We'd love to hear from you! Whether you have questions, feedback, or just want to say hello.
          </p>

          <div className="grid md:grid-cols-2 gap-8 not-prose mb-8">
            <div className="bg-white/60 rounded-lg p-6 border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">General Inquiries</h3>
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="w-5 h-5 mr-3 text-green-600">📧</div>
                  <a href="mailto:hello@rails.eth" className="text-blue-600 hover:text-blue-700">
                    hello@rails.eth
                  </a>
                </div>
                <div className="flex items-center">
                  <div className="w-5 h-5 mr-3 text-green-600">🐦</div>
                  <a href="https://twitter.com/railsdefi" className="text-blue-600 hover:text-blue-700" target="_blank">
                    @railsdefi
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-white/60 rounded-lg p-6 border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Technical Support</h3>
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="w-5 h-5 mr-3 text-green-600">💬</div>
                  <a href="https://discord.gg/rails" className="text-blue-600 hover:text-blue-700" target="_blank">
                    Discord Community
                  </a>
                </div>
                <div className="flex items-center">
                  <div className="w-5 h-5 mr-3 text-green-600">📚</div>
                  <a href="https://github.com/rails-defi/rails" className="text-blue-600 hover:text-blue-700" target="_blank">
                    GitHub Repository
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-white/60 rounded-lg p-6 border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Business Partnerships</h3>
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="w-5 h-5 mr-3 text-green-600">🤝</div>
                  <a href="mailto:partnerships@rails.eth" className="text-blue-600 hover:text-blue-700">
                    partnerships@rails.eth
                  </a>
                </div>
                <p className="text-gray-600 text-sm">
                  Interested in integrating Rails with your protocol? Let's talk!
                </p>
              </div>
            </div>

            <div className="bg-white/60 rounded-lg p-6 border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Support Rails</h3>
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="w-5 h-5 mr-3 text-green-600">💝</div>
                  <a href="https://etherscan.io/name-lookup-search?id=donate.rails.eth" className="text-blue-600 hover:text-blue-700" target="_blank">
                    donate.rails.eth
                  </a>
                </div>
                <p className="text-gray-600 text-sm">
                  Help us continue building tools for the DeFi community
                </p>
              </div>
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-6 border border-green-200 not-prose">
            <h3 className="text-xl font-semibold text-green-900 mb-3">Response Time</h3>
            <p className="text-green-800">
              We typically respond to inquiries within 24 hours. For urgent technical issues, please reach out on Discord for faster assistance.
            </p>
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
      </div>
    </div>
  );
}