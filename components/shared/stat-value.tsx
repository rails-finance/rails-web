import type { ReactNode } from "react";

interface StatValueProps {
  children: ReactNode;
  title?: string;
  color?: string;
  className?: string;
  /** A name for the figure this value IS, stamped as `data-figure`. Optional
   *  and undefined by default, so a value that does not name itself renders
   *  exactly as it always has. It exists for a figure a surface states ONCE and
   *  something else reads by name — a verifier's selector, the skeleton
   *  recorder — so the name travels with the statement rather than with a
   *  wrapper somebody has to keep in step with it. */
  figure?: string;
}

export function StatValue({
  children,
  title,
  figure,
  // Muted-but-prominent default so every big value shares one tone across both
  // protocols and pairs with the muted (rb-500) labels. Responsive size:
  // text-2xl on small/medium (keeps Aave's icon-laden values from crowding the
  // 4-col row), text-3xl on large for the bigger desktop feel.
  color = "text-foreground/80",
  className,
}: StatValueProps) {
  return (
    <div
      className={`text-2xl lg:text-3xl font-bold tabular-nums mt-2 ${color}${className ? ` ${className}` : ""}`}
      title={title}
      data-figure={figure}
    >
      {children}
    </div>
  );
}

interface StatFootnoteProps {
  children: ReactNode;
  color?: string;
  bold?: boolean;
  title?: string;
}

export function StatFootnote({ children, color = "text-rb-500", bold, title }: StatFootnoteProps) {
  return (
    <div className={`text-xs mt-0.5 ${color}${bold ? " font-medium" : ""}`} title={title}>
      {children}
    </div>
  );
}

export function StatDash({ children = "\u2014" }: { children?: ReactNode }) {
  return <div className="text-2xl lg:text-3xl font-bold text-rb-500 mt-2">{children}</div>;
}
