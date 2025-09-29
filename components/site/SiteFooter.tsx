export function SiteFooter() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-2">
        <div className="max-w-7xl container mx-auto flex justify-center items-center text-sm">
          <div className="flex items-center gap-4">
            <a
              href="https://x.com/rails_finance"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 p-1 rounded"
              title="Follow Rails on X"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://www.youtube.com/@rails_finance"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 p-1 rounded"
              title="Rails Finance on YouTube"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
