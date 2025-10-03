export function TroveListLoadingSkeleton() {
  return (
    <main className="min-h-screen">
      <div className="max-w-7xl mx-auto py-8">
        <h1 className="text-2xl font-bold text-slate-700 dark:text-white mb-6">Liquity V2 Troves</h1>
        <div className="animate-pulse flex space-x-3">
          <div className="h-10 bg-slate-50 dark:bg-slate-700/75 rounded w-1/3 mb-3"></div>
          <div className="h-10 bg-slate-50 dark:bg-slate-700/75 rounded w-1/3 mb-3"></div>
          <div className="h-10 bg-slate-50 dark:bg-slate-700/75 rounded w-1/3 mb-3"></div>
        </div>
        <div className="animate-pulse  flex sm:hidden space-x-3">
          <div className="h-10 bg-slate-50 dark:bg-slate-700/75 rounded w-full mb-3"></div>
        </div>
        <div className="animate-pulse  flex sm:hidden space-x-3">
          <div className="h-10 bg-slate-50 dark:bg-slate-700/75 rounded w-full mb-3"></div>
        </div>
        <div className="animate-pulse flex space-x-3">
          <div className="h-40 bg-slate-50 dark:bg-slate-700/75 rounded-lg w-full mt-3 mb-6"></div>
        </div>
        <div className="animate-pulse flex space-x-3">
          <div className="h-40 bg-slate-100/75 dark:bg-slate-700/75 rounded-lg w-full mb-6"></div>
        </div>
        <div className="animate-pulse flex space-x-3">
          <div className="h-40 bg-slate-100/50 dark:bg-slate-700/50 rounded-lg w-full mb-6"></div>
        </div>
        <div className="animate-pulse flex space-x-3">
          <div className="h-40 bg-slate-100/25 dark:bg-slate-700/25 rounded-lg w-full mb-6"></div>
        </div>
      </div>
    </main>
  );
}
