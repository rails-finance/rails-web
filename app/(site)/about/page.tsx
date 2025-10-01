import { LiquityLogo } from "@/components/LiquityLogo";

export default function AboutPage() {


  return (
    <div className="container mx-auto md:px-6 px-4 pt-32 pb-12 max-w-7xl">

      <div className="prose prose-lg max-w-none">
        <p className="text-xl mb-8 text-slate-800 dark:text-slate-200">
          We believe that decentralised finance (DeFi) represents the future of finance, but it's currently too complex for most users to understand and navigate safely. <span className="font-bold">Rails</span> bridges this gap by providing clear, intuitive explanations of DeFi transactions and protocol events, keeping users informed about their DeFi activity.
        </p>



        {/* Roadmap & Mission Section */}

<div className="lg:grid mb-12 lg:grid-cols-[1fr_180px_480px] lg:grid-rows-[40px_180px_180px_180px_180px]">
    <div id="cell_1" className="my-8 lg:my-0 row-span-2 col-start-1 row-start-2 lg:justify-center lg:flex lg:flex-col">
			<div className="">
				<h3 className="text-2xl font-bold text-slate-600 dark:text-slate-300 mb-6">The Definitive DeFi Support Platform</h3>
				<p className="text-lg text-slate-700 dark:text-slate-300">
					<span className="font-bold">Our mission</span> is to make DeFi more understandable and accessible for everyone.
				</p>
			</div>
    </div>
    <div id="cell_2" className="hidden lg:block row-span-3 col-start-2">
    	<object
    		data="/about-mission-lg__1.svg"
    		type="image/svg+xml"
    		className="w-full h-full"
    		aria-label="Hero decoration"
    	/>
    </div>
    <div id="cell_3" className="col-start-3 row-start-2">
<div className="rounded-lg p-5 border-2 border-green-600 mb-2 lg:mb-0 lg:h-full lg:flex lg:flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center mr-3">
                  <span className="text-white font-bold">1</span>
                </div>
                <h4 className="text-lg font-semibold text-slate-600 dark:text-slate-300">Liquity V2 Support</h4>
              </div>
              <span className="text-xs font-extrabold text-green-100 bg-green-600 px-2 py-1 rounded-full">Completed</span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 ml-13">
              Full integration with Liquity V2 protocol including trove tracking, transaction analysis, and comprehensive event explanations.
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
      	       <span className="text-xs font-extrabold text-blue-100 bg-blue-600 px-2 py-1 rounded-full">In Progress</span>
      	     </div>
      	     <p className="text-sm text-slate-600 dark:text-slate-400 ml-13">
      	       Rails extends its analytics to all Liquity V2 friendly forks, establishing Rails as the standard for CDP protocol support.
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
      	          <h4 className="text-lg font-semibold text-slate-600 dark:text-slate-300">Multi-Protocol Intelligence</h4>
      	        </div>
      	        <span className="text-xs font-extrabold text-slate-100 bg-slate-400 px-2 py-1 rounded-full">Planned</span>
      	      </div>
      	      <p className="text-sm text-slate-600 dark:text-slate-400 ml-13">
      	        Expanding to support the likes of Morpho, Compound, Aave, Sky and beyond - creating a unified analytics layer for protocol interactions.
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
          	        <span className="text-xs font-extrabold text-slate-100 bg-slate-400 px-2 py-1 rounded-full">Planned</span>
          	      </div>
          	      <p className="text-sm text-slate-600 dark:text-slate-400 ml-13">
          	        Rails evolves into portable, composable infrastructure that can be embedded directly into wallets, dApps, and protocols.
          	      </p>
          	    </div></div>
    <div id="cell_7" className=" hidden lg:block row-span-2  col-span-2 col-start-2 row-start-4 justify-start mt-2">
    	<object
    		data="/about-mission-lg__2.svg"
    		type="image/svg+xml"
    		className="w-full h-full"
    		aria-label="Hero decoration"
    	/>
    </div>
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
                  <a href="https://x.com/milesessex" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">@milesessex</a>
                </div>
              </div>
              <p className="text-slate-700 dark:text-slate-300">
                Graphic UX designer with 20+ years experience. Focused on creating intuitive interfaces for complex financial data.
              </p>
            </div>
           {/* Slava */}
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-6">
              <div className="flex items-center mb-4">
                <img
                  src="/about-team-slvdev.jpg"
                  alt="Slava"
                  className="w-16 h-16 rounded-full mr-4 object-cover"
                />
                <div>
                  <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300">Slava</h3>
                  <p className="text-slate-600 dark:text-slate-400">Developer</p>
                  <a href="https://x.com/slvdev" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">@slvdev</a>
                </div>
              </div>
              <p className="text-slate-700 dark:text-slate-300">
                Passionate about building tools that make DeFi more understandable and accessible.
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
                    <img src="/liquity-logo.svg" alt="Liquity" className="h-full w-auto" />
                  </a>
                </div>
                <p className="text-slate-700 dark:text-slate-300 mb-3">
                  Liquity has been instrumental in getting Rails off the ground, providing a 20,000 BOLD grant to kickstart our development. Their support enables us to build critical infrastructure for the Liquity ecosystem and beyond. Thank you to Liquity!
                </p>
              </div>
              <div className="ml-6 flex flex-col items-center rounded-xl bg-green-600 p-8">
                <div className="text-3xl font-bold text-green-50 mb-1 drop-shadow">20K</div>
                <div className="text-sm font-extrabold text-slate-100  drop-shadow">BOLD Grant</div>
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
                  <div className="w-5 h-5 mr-3 text-green-600"></div>
                  <a href="https://twitter.com/railsdefi" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300" target="_blank">
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
                  <div className="w-5 h-5 mr-3 text-green-600"></div>
                  <a href="https://github.com/rails-finance" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300" target="_blank">
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
                  <a href="https://etherscan.io/name-lookup-search?id=donate.rails.eth" className=" rounded-full bg-fuchsia-600 dark:bg-fuchsia-700 hover:bg-fuchsia-700/50 dark:hover:bg-fuchsia-800/50 transition-all duration-300 p-2 px-4 text-3xl font-extrabold text-white  hover:text-white" target="_blank">
                    donate<span className="hidden lg:inline">.rails.eth</span>
                  </a>
                </div>
                <p className="text-white ">
                  Help us continue building tools for the DeFi community <span className="lg:hidden">by donating to <span className="underline font-extrabold">donate.rails.eth</span></span>
                </p>
              </div>
            </div>
          </div>


        </div>
      </div>
    </div>
  );
}