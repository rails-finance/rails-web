import { RAILS_TELEGRAM_URL, RAILS_X_URL } from "@/lib/shared/social";

// Robinhood is a chain choice with no explorers yet: the home roster toggle and
// the header's "Open an explorer" panel both offer it, and both show this line
// in place of a roster (Miles, 2 Nov 2026).

export const ROBINHOOD_LABEL = "Robinhood";

const LINK = "text-blue-600 dark:text-blue-400 transition-colors hover:underline";

export function RobinhoodSoon() {
  return (
    <span>
      Coming soon,{" "}
      <a href={RAILS_X_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
        follow us on X
      </a>{" "}
      for announcements and Telegram{" "}
      <a href={RAILS_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
        @railsfinance
      </a>{" "}
      for details.
    </span>
  );
}
