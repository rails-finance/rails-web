import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="w-full bg-gradient-to-b from-slate-100 dark:from-slate-900 to-transparent mt-16">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* App Links */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Navigation</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/troves"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm transition-colors duration-150"
                >
                  Explore Troves
                </Link>
              </li>
              <li>
                <Link
                  href="/"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm transition-colors duration-150"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm transition-colors duration-150"
                >
                  About Rails
                </Link>
              </li>
              <li>
                <Link
                  href="/how-it-works"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm transition-colors duration-150"
                >
                  How It Works
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Resources</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://liquity.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm transition-colors duration-150"
                >
                  Liquity Protocol
                </a>
              </li>
              <li>
                <a
                  href="https://docs.liquity.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm transition-colors duration-150"
                >
                  Liquity V2 Documentation
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/rails-finance"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm transition-colors duration-150"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Connect</h4>
            <div className="flex items-center gap-3 mb-4">
              <a
                href="https://x.com/rails_finance"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-150"
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
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-150"
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
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-150"
                title="Rails on GitHub"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
            </div>
            <p className="text-slate-600 dark:text-slate-500 text-xs">Support Rails development:</p>
            <a
              href="https://etherscan.io/name-lookup-search?id=donate.rails.eth"
              className="text-fuchsia-600 dark:text-fuchsia-600 hover:text-fuchsia-700 dark:hover:text-fuchsia-600 text-sm font-bold transition-colors duration-150"
              target="_blank"
              rel="noopener noreferrer"
            >
              donate.rails.eth
            </a>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-slate-600 dark:text-slate-500 text-xs mb-2 md:mb-0">
              © {new Date().getFullYear()} Rails • Built with support from Liquity
            </p>
            <div className="flex gap-4">
              <Link
                href="/privacy"
                className="text-slate-600 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 text-xs transition-colors duration-150"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-slate-600 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 text-xs transition-colors duration-150"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
