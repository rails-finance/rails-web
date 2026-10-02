// The Lifetime flows mark: lucide's chart-bar-big with its lower bar drawn as
// the panel's line. Used on the panel heading and the timeline's "View on chart".
export function LifetimeFlowsIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <rect x="7" y="5" width="12" height="4" rx="1" />
      <path d="M6.827 16.814 13.092 14.576 16.194 16.642 19.351 13.992" />
    </svg>
  );
}
