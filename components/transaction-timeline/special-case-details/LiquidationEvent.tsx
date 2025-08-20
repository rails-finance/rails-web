export function LiquidationEvent() {
  return (
    <div className="p-4 rounded-lg border border-red-600/50 bg-red-950/50">
      <h3 className="text-sm font-semibold text-red-300 mb-1">
        Liquidation Event
      </h3>
      <p className="text-sm text-red-200">
        This trove was liquidated due to insufficient collateral ratio.
      </p>
    </div>
  );
}