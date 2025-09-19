export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 pt-48 pb-12 max-w-6xl">

      <div className="prose prose-lg max-w-none text-slate-800">
        <p className="text-xl mb-8">
          We believe that DeFi represents the future of finance, but it's currently too complex for most users to understand and navigate safely. Rails bridges this gap by providing clear, intuitive explanations of DeFi transactions and protocols, helping users make informed decisions about their financial activities.
        </p>

        <p className="mb-8 text-red-500 font-extrabold">
Technical Credibility: Add specifics about your infrastructure - what makes it "institutional-grade"? Response times? Data accuracy? Protocol coverage?
        </p>

{/* Team Section */}
        <div className="mb-12">
          <h2 className="text-3xl font-semibold mb-6 text-slate-900">Team</h2>
          <p className="text-lg mb-6">
            Meet the team behind Rails - we are passionate about making DeFi more accessible for everyone.
          </p>

          <div className="grid md:grid-cols-2 gap-8 not-prose mb-8">
            <div className="bg-white/60 rounded-lg p-6 border border-slate-200">
              <div className="flex items-center mb-4">
                <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mr-4">
                  <span className="text-white font-bold text-xl">M</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">Miles Essex</h3>
                  <p className="text-slate-600">Founder & Product Designer</p>
                </div>
              </div>
              <p className="text-slate-700">
                Graphic UX designer with 20+ years experience. Focused on creating intuitive interfaces for complex financial data.
              </p>
            </div>

            <div className="bg-white/60 rounded-lg p-6 border border-slate-200">
              <div className="flex items-center mb-4">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mr-4">
                  <span className="text-white font-bold text-xl">S</span>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">Slava</h3>
                  <p className="text-slate-600">Technical Architect</p>
                </div>
              </div>
              <p className="text-slate-700">
                Former blockchain engineer at Ethereum Foundation. Passionate about building tools that make DeFi more understandable and accessible.
              </p>
            </div>
          </div>

          <p className="mb-4">
            We're committed to building tools that democratize access to decentralized finance while maintaining the security and transparency that makes DeFi so powerful.
          </p>
        </div>

        {/* Supporters Section */}
        <div className="mb-12">
          <h2 className="text-3xl font-semibold mb-6 text-slate-900">Our Supporters</h2>
          <p className="text-lg mb-6">
            We're grateful for the support from our partners who believe in our mission to make DeFi more accessible.
          </p>

          <div className="bg-white/60 rounded-lg p-6 border border-slate-200 not-prose">
            <div className="flex items-start">
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Liquity</h3>
                <p className="text-slate-700 mb-3">
                  Liquity has been instrumental in getting Rails off the ground, providing a 20,000 BOLD grant to kickstart our development. Their support enables us to build critical infrastructure for the Liquity ecosystem and beyond.
                </p>
                <p className="text-sm text-slate-600">
                  This grant helps us maintain our commitment to building open-source tools that benefit the entire DeFi community.
                </p>
              </div>
              <div className="ml-6 flex flex-col items-center">
                <div className="text-3xl font-bold text-green-600 mb-1">20K</div>
                <div className="text-sm font-semibold text-slate-600">BOLD Grant</div>
              </div>
            </div>
          </div>
        </div>

        {/* Roadmap & Mission Section - Combined */}
        <div className="mb-12">
          <h2 className="text-3xl font-semibold mb-6 text-slate-900">Roadmap & Mission</h2>
          <p className="text-lg mb-8">
            Our vision for making DeFi more accessible and understandable for everyone.
          </p>

          <div className="not-prose">
            <div className="grid lg:grid-cols-2 gap-8 relative">
              {/* Core Mission - Left Column */}
              <div className="relative">
                <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-xl p-8 border border-slate-200 h-full flex flex-col justify-center">
                  <h3 className="text-2xl font-bold text-slate-900 mb-6">Core Mission</h3>
                  <div className="space-y-4">
                    <h4 className="text-xl font-semibold text-slate-800">The Definitive DeFi Support Platform</h4>
                    <p className="text-slate-700 leading-relaxed">
                      Rails is building the infrastructure layer that makes DeFi complexity disappear. We translate intricate protocol interactions into clear, actionable insights that anyone can understand.
                    </p>
                    <div className="mt-6 space-y-3">
                      <div className="flex items-start">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                        <p className="text-slate-600">Institutional-grade analytics made accessible</p>
                      </div>
                      <div className="flex items-start">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                        <p className="text-slate-600">Universal protocol support and translation</p>
                      </div>
                      <div className="flex items-start">
                        <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                        <p className="text-slate-600">Embedded infrastructure for the entire ecosystem</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual Connector - Bracket */}
              <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-12 -ml-6 flex items-center justify-center pointer-events-none">
                <svg className="w-full h-full" viewBox="0 0 48 400" preserveAspectRatio="none">
                  <path
                    d="M 24 40 Q 8 40 8 60 L 8 340 Q 8 360 24 360"
                    stroke="rgb(148 163 184)"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              {/* Phases - Right Column */}
              <div className="space-y-4 relative">
                {/* Phase 1 */}
                <div className="bg-white rounded-lg p-5 border border-slate-200 relative group hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center mr-3">
                        <span className="text-white font-bold">1</span>
                      </div>
                      <h4 className="text-lg font-semibold text-slate-900">Liquity V2 Support</h4>
                    </div>
                    <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">Completed</span>
                  </div>
                  <p className="text-sm text-slate-600 ml-13">
                    Full integration with Liquity V2 protocol including trove tracking, transaction analysis, and comprehensive event explanations.
                  </p>
                  {/* Connector line to next phase */}
                  <div className="absolute -bottom-4 left-5 w-0.5 h-4 bg-gradient-to-b from-green-500 to-blue-500"></div>
                </div>

                {/* Phase 2 */}
                <div className="bg-white rounded-lg p-5 border border-slate-200 relative group hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                        <span className="text-white font-bold">2</span>
                      </div>
                      <h4 className="text-lg font-semibold text-slate-900">Ecosystem Expansion</h4>
                    </div>
                    <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded-full">In Progress</span>
                  </div>
                  <p className="text-sm text-slate-600 ml-13">
                    Rails extends its analytics to all Liquity V2 friendly forks, establishing Rails as the standard for CDP protocol support.
                  </p>
                  {/* Connector line to next phase */}
                  <div className="absolute -bottom-4 left-5 w-0.5 h-4 bg-gradient-to-b from-blue-500 to-purple-500"></div>
                </div>

                {/* Phase 3 */}
                <div className="bg-white rounded-lg p-5 border border-slate-200 relative group hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center mr-3">
                        <span className="text-white font-bold">3</span>
                      </div>
                      <h4 className="text-lg font-semibold text-slate-900">Multi-Protocol Intelligence</h4>
                    </div>
                    <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-full">Planned</span>
                  </div>
                  <p className="text-sm text-slate-600 ml-13">
                    Expanding to support Morpho, Compound, Aave, and MakerDAO - creating a unified analytics layer for cross-protocol interactions.
                  </p>
                  {/* Connector line to next phase */}
                  <div className="absolute -bottom-4 left-5 w-0.5 h-4 bg-gradient-to-b from-purple-500 to-orange-500"></div>
                </div>

                {/* Phase 4 */}
                <div className="bg-white rounded-lg p-5 border border-slate-200 relative group hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center mr-3">
                        <span className="text-white font-bold">4</span>
                      </div>
                      <h4 className="text-lg font-semibold text-slate-900">Modularisation</h4>
                    </div>
                    <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-full">Planned</span>
                  </div>
                  <p className="text-sm text-slate-600 ml-13">
                    Rails evolves into portable, composable infrastructure that can be embedded directly into wallets, dApps, and protocols.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        
        {/* Contact Section */}
        <div className="mb-12">
          <h2 className="text-3xl font-semibold mb-6 text-slate-900">Contact Us</h2>
          <p className="text-lg mb-6">
            We'd love to hear from you! Whether you have questions, feedback, or just want to say hello.
          </p>

          <div className="grid md:grid-cols-2 gap-8 not-prose mb-8">
            <div className="bg-white/60 rounded-lg p-6 border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">General Inquiries</h3>
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

            <div className="bg-white/60 rounded-lg p-6 border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Technical Support</h3>
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="w-5 h-5 mr-3 text-green-600">📚</div>
                  <a href="https://github.com/rails-defi/rails" className="text-blue-600 hover:text-blue-700" target="_blank">
                    GitHub Repository
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-white/60 rounded-lg p-6 border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Business Partnerships</h3>
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="w-5 h-5 mr-3 text-green-600">🤝</div>
                  <a href="mailto:partnerships@rails.eth" className="text-blue-600 hover:text-blue-700">
                    partnerships@rails.eth
                  </a>
                </div>
                <p className="text-slate-600 text-sm">
                  Interested in integrating Rails with your protocol? Let's talk!
                </p>
              </div>
            </div>

            <div className="bg-white/60 rounded-lg p-6 border border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Support Rails</h3>
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className="w-5 h-5 mr-3 text-green-600">💝</div>
                  <a href="https://etherscan.io/name-lookup-search?id=donate.rails.eth" className="text-blue-600 hover:text-blue-700" target="_blank">
                    donate.rails.eth
                  </a>
                </div>
                <p className="text-slate-600 text-sm">
                  Help us continue building tools for the DeFi community
                </p>
              </div>
            </div>
          </div>

          
        </div>
      </div>
    </div>
  );
}