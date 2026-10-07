// The Explanation pane's grouped bullets (rails-ops
// standards/explanation-copy-charter.md, "Brief bullets"): a two-or-three-word
// heading over short bullets, one fact each, figures first. Anything past one
// phone screen goes behind an `<ExplainMore>` disclosure.

import type { ReactNode } from "react";

export function ExplainGroup({
  title,
  children,
  ...rest
}: { title: string; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <section className="mt-3 first:mt-0" {...rest}>
      <ExplainHeading>{title}</ExplainHeading>
      <ul className="mt-1 space-y-1 text-sm leading-snug text-rb-500">{children}</ul>
    </section>
  );
}

/** A group's heading: the Lifetime flows pane's, and an event explanation's
 *  where its bullets are grouped (lib/shared/explainer-prose.tsx). */
export function ExplainHeading({ children }: { children: ReactNode }) {
  return <h4 className="text-xs font-semibold text-foreground">{children}</h4>;
}

export function ExplainBullet({ children, ...rest }: { children: ReactNode } & Record<`data-${string}`, string>) {
  return (
    <li className="flex items-start gap-2" {...rest}>
      <span aria-hidden className="select-none">
        •
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** The second disclosure: what does not fit in one phone screen. */
export function ExplainMore({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group mt-3" data-explain-more="">
      <summary className="cursor-pointer list-none text-xs font-semibold text-rb-500 hover:text-foreground [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>{" "}
        {title}
      </summary>
      <div className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-rb-500">{children}</div>
    </details>
  );
}

/** A figure in a bullet: the body tone unless the card's chrome shows the same
 *  value (the highlight rule, explanation-copy-charter §3). */
export function Fig({ children, bold = false }: { children: ReactNode; bold?: boolean }) {
  return (
    <span className={`whitespace-nowrap tabular-nums ${bold ? "font-semibold text-foreground" : "font-medium"}`}>
      {children}
    </span>
  );
}
