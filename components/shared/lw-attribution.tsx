// TradingView's attribution for Lightweight Charts (Apache-2.0; rails-ops
// reference/asset-key-map.md, "The chart engine"): the NOTICE word for word
// with a link to tradingview.com, in the site's footers on every page (Miles,
// 26 Oct 2026), which the README at v5.2.1 accepts in place of the chart's
// attribution logo.

/** The NOTICE file of tradingview/lightweight-charts at v5.2.1, word for word (its
 *  "(с)" is a Cyrillic es, U+0441, kept as the file has it). */
export const LW_NOTICE = "TradingView Lightweight Charts™ Copyright (с) 2025 TradingView, Inc.";
export const LW_NOTICE_URL = "https://www.tradingview.com/";

/** The NOTICE and its link. */
export function LwNotice({ className }: { className?: string }) {
  return (
    <span className={className} data-lw-notice="">
      {LW_NOTICE}{" "}
      <a href={LW_NOTICE_URL} target="_blank" rel="noreferrer" className="hover:underline">
        {LW_NOTICE_URL}
      </a>
    </span>
  );
}
