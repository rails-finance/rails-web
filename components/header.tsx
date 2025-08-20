import Link from "next/link";

export function Header() {
  return (
    <header className="pt-0 pb-6 relative">
      <div className="max-w-7xl mx-auto px-4 relative">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <Link href="/" className="block flex-shrink-0 self-start -mt-0">
            <div className="bg-green-600 rounded-b-lg p-3 sm:p-4 w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
              <svg className="w-10 h-10 sm:w-12 sm:h-12" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <use href="#icon-rails" />
              </svg>
            </div>
          </Link>

          {/* Title and badges */}
          <div className="flex flex-col gap-1 relative">
            <h1 className="text-3xl font-bold leading-none">
              <Link href="/" className="text-white hover:underline">
                Rails
              </Link>
            </h1>
            <span className="text-base/5 text-slate-400">
              <span className="mr-1.5">Liquity v2 Explorer</span>
              <span className="relative -top-0.5 border pb-0.5 text-[0.7em] border-orange-500 font-bold px-0.5 bg-orange-500 rounded-tl rounded-bl text-slate-800 italic">
                Alpha
              </span>
              <span className="rounded-tr rounded-br border text-slate-800 relative -top-0.5 border-orange-500 text-[0.7em] text-white text-xs font-semibold px-1 pb-0.5">
                1.0
              </span>
            </span>
          </div>
        </div>

        {/* Connect Wallet */}
        {/* <button className="absolute -top-6 right-4 cursor-pointer bg-green-600 hover:bg-green-700 transition-colors rounded-b-lg px-4 pt-8 pb-3 z-10 text-white font-medium text-sm">
          Connect Wallet
        </button> */}
      </div>
    </header>
  );
}
