import Link from "next/link";

export function Header() {
  return (
    <header className="pt-0 pb-2 relative mb-4">
      <div className="max-w-7xl mx-auto px-4 relative flex items-start gap-3">
        {/* Rails Logo */}
        <Link href="/" className="">
          <div className="bg-green-600 rounded-b p-3 w-9 h-9 flex items-center justify-center">
            <svg className="" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <use href="#icon-rails" />
            </svg>
          </div>
        </Link>

        {/* Liquity V2 Branding */}
        <div className="flex items-center gap-2 py-1.5">
          <svg className="w-6 h-6" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <use href="#icon-liquity" />
          </svg>
            <h1 className="text-xs font-semibold text-white">Liquity V2 Trove Explorer</h1>
        </div>
      </div>
    </header>
  );
}
