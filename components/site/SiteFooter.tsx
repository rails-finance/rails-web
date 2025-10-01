import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 mt-24 transition-colors">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Rails Info */}
          <div className="md:col-span-2">
            <h3 className="text-xl font-bold text-green-600 dark:text-green-400 mb-3">Rails</h3>
            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-4">
              Making DeFi more understandable and accessible for everyone. Rails displays your DeFi activity on simple timelines with clear explanations and in-depth transaction analysis.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://x.com/rails_finance"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 dark:text-slate-500 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                title="Follow Rails on X"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://www.youtube.com/@rails_finance"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 dark:text-slate-500 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                title="Rails Finance on YouTube"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
              <a
                href="https://github.com/rails-finance"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 dark:text-slate-500 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                title="Rails on GitHub"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-slate-600 dark:text-slate-400 hover:text-green-600 dark:hover:text-green-400 text-sm transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-slate-600 dark:text-slate-400 hover:text-green-600 dark:hover:text-green-400 text-sm transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="text-slate-600 dark:text-slate-400 hover:text-green-600 dark:hover:text-green-400 text-sm transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/troves" className="text-slate-600 dark:text-slate-400 hover:text-green-600 dark:hover:text-green-400 text-sm transition-colors">
                  Explore Troves
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Support Rails</h4>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-3">
              Help us continue building tools for the DeFi community
            </p>
            <a
              href="https://etherscan.io/name-lookup-search?id=donate.rails.eth"
              className="inline-block bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              donate.rails.eth
            </a>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex flex-col md:flex-row items-center gap-4 mb-4 md:mb-0">
              <p className="text-slate-500 dark:text-slate-400 text-xs">
                © {new Date().getFullYear()} Rails
              </p>
              <div className="flex gap-4">
                <Link href="/privacy" className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-xs transition-colors">
                  Privacy Policy
                </Link>
                <Link href="/terms" className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 text-xs transition-colors">
                  Terms of Service
                </Link>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-slate-500 dark:text-slate-400 text-xs mr-2">Built with support from {' '}
              <a href="https://liquity.org" target="_blank" rel="noopener noreferrer" className="hover:underline">
                Liquity
              </a></span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}