/** The Rails mark: three bars, the first two at 85%. Drawn by the rail's glyph
 *  (H1), the header bar's mark (H2) and the home hero's h1 (S1), which
 *  sizes it in em through `className`. */
export function RailsMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 200 200" fill="none" aria-hidden="true">
      <path
        fill="currentColor"
        style={{ opacity: 0.85 }}
        d="M 79.763 159.671 L 111.637 159.671 L 52.168 41.625 L 20.295 41.625 L 79.763 159.671 Z"
      />
      <path
        fill="currentColor"
        style={{ opacity: 0.85 }}
        d="M 98.578 97.056 L 130.451 97.056 L 105.044 47.853 L 73.171 47.853 L 98.578 97.056 Z"
      />
      <path
        fill="currentColor"
        d="M 148.892 142.388 L 180.766 142.388 L 155.359 93.185 L 123.486 93.185 L 148.892 142.388 Z"
      />
    </svg>
  );
}
