// The Explanation pane's grouped bullets (rails-ops
// standards/explanation-copy-charter.md, "Brief bullets"): a two-or-three-word
// heading over short bullets, one fact each, figures first.

import type { ReactNode } from "react";

export function ExplainGroup({
  title,
  children,
  ...rest
}: { title: string; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <section className="mt-3 first:mt-0" {...rest}>
      <h4 className="text-xs font-semibold text-foreground">{title}</h4>
      <ul className="mt-1 space-y-1 text-sm leading-snug text-rb-500">{children}</ul>
    </section>
  );
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
