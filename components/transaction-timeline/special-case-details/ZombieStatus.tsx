import { MIN_DEBT } from "@/lib/constants";

export function ZombieStatus({ finalDebt }: { finalDebt: number }) {
  return (
    <div className="mt-4 pt-3 border-t border-slate-700">
      <div className="flex items-start space-x-2">
        <span className="text-yellow-500">ⓘ</span>
        <div className="text-xs space-y-1">
          <p className="font-medium text-yellow-400">Zombie Trove Status:</p>
          <ul className="list-disc list-inside space-y-0.5 text-yellow-300">
            <li>
              Debt is now {finalDebt === 0 ? "zero" : finalDebt} (below {MIN_DEBT} minimum)
            </li>
            <li>Cannot be redeemed further while in this state</li>
            <li>Can be revived by borrowing at least {MIN_DEBT} BOLD</li>
            <li>Can still receive redistributions</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
