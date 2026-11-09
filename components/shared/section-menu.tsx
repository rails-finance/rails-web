"use client";

// The section ⋮ and the section it arms (rails-ops ui-jobs 549/550, proposal
// §3): every section of a product page that draws a figure carries a ⋮ at the
// right of its heading row, and is one receipts scope, so the ⋮'s "Inspect
// provenance" arms that section alone and rings it.
// ----------------------------------------------------------------------------
// The rows, in this order, each group drawn only where it has rows:
//   1. Rails pages for the section's object (`--text-link`)
//   2. off-site pages: the contract on the chain's explorer, the protocol's
//      app, its docs (`--text-external`, pink)
//   3. exports: Copy, View as Markdown, Download CSV
//   4. a divider, then Inspect provenance (provenance teal), which ToolsMenu
//      draws from `provScope`.
// `SectionMenuRows` is groups 1 to 3 alone, for a ⋮ another shell draws (the
// position card's, through `menu.leading`).
//
// `ProvSection` is the section: one `ProvReceiptsScope` under a stable
// `scopeId`, its root stamped `data-prov-scope` and, while armed on it alone,
// `data-prov-lit` (the ring, app/globals.css).

import { useState, type ReactNode } from "react";
import { Copy, Download, ExternalLink, FileText, ArrowRight } from "lucide-react";
import { Icon } from "@/components/icons/icon";
import { ToolsMenu, ToolsMenuItem } from "@/components/shared/tools-menu";
import { ProvReceiptsScope, useProvScopeLit, useReceiptRegistry } from "@/components/shared/provenance";

/** A row that opens a page: a Rails page (`internal`) or one off-site. */
export interface SectionMenuLink {
  title: string;
  subtitle: string;
  href: string;
  /** `data-menu-item`, for the verifiers. */
  item: string;
  /** A page of Rails; absent or false, an off-site page opened in a new tab. */
  internal?: boolean;
}

/** The export rows. Each is drawn only where it is given. */
export interface SectionMenuExports {
  /** The section as Markdown: Copy puts it on the clipboard, View as Markdown
   *  opens it in a new tab. */
  markdown?: { build: () => string; copySubtitle?: string };
  /** The section's table as CSV. */
  csv?: { filename: string; build: () => string; subtitle?: string };
}

const DIVIDER = <div className="mx-3 my-1 border-t border-rb-300 dark:border-rb-700" />;

function openText(text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Groups 1 to 3 of the ⋮: Rails pages, off-site pages, exports, a divider
 *  between groups that both have rows. */
export function SectionMenuRows({
  close,
  links = [],
  exports,
}: {
  close: () => void;
  links?: SectionMenuLink[];
  exports?: SectionMenuExports;
}) {
  const [copied, setCopied] = useState(false);
  const rails = links.filter((l) => l.internal);
  const offsite = links.filter((l) => !l.internal);
  const md = exports?.markdown;
  const csv = exports?.csv;
  const groups: ReactNode[] = [];
  if (rails.length)
    groups.push(
      rails.map((l) => (
        <ToolsMenuItem
          key={l.item}
          icon={<ArrowRight size={16} />}
          title={l.title}
          subtitle={l.subtitle}
          href={l.href}
          item={l.item}
          internal
          onClick={close}
        />
      )),
    );
  if (offsite.length)
    groups.push(
      offsite.map((l) => (
        <ToolsMenuItem
          key={l.item}
          icon={<ExternalLink size={16} />}
          title={l.title}
          subtitle={l.subtitle}
          href={l.href}
          external
          offsite
          item={l.item}
          onClick={close}
        />
      )),
    );
  if (md || csv)
    groups.push(
      <>
        {md && (
          <ToolsMenuItem
            icon={copied ? <Icon name="check" size={16} /> : <Copy size={16} />}
            title="Copy"
            subtitle={copied ? "Copied" : (md.copySubtitle ?? "This section as Markdown, for an LLM")}
            copied={copied}
            item="copy"
            onClick={() =>
              void navigator.clipboard.writeText(md.build()).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          />
        )}
        {md && (
          <ToolsMenuItem
            icon={<FileText size={16} />}
            title="View as Markdown"
            subtitle="Opens in a new tab"
            item="markdown"
            onClick={() => {
              openText(md.build(), "text/plain;charset=utf-8");
              close();
            }}
          />
        )}
        {csv && (
          <ToolsMenuItem
            icon={<Download size={16} />}
            title="Download CSV"
            subtitle={csv.subtitle ?? "This section's table"}
            item="csv"
            onClick={() => {
              download(csv.build(), csv.filename);
              close();
            }}
          />
        )}
      </>,
    );
  return (
    <>
      {groups.map((g, i) => (
        <div key={i} className="contents">
          {i > 0 && DIVIDER}
          {g}
        </div>
      ))}
    </>
  );
}

/** A section's ⋮: its rows, then Inspect provenance armed on `scope`. */
export function SectionMenu({
  scope,
  title,
  hint = "Click a value in this section to trace it",
  links,
  exports,
}: {
  /** The `scopeId` of the `ProvSection` this ⋮ arms. */
  scope: string;
  /** The section's heading: the menu's accessible name and its sheet's heading. */
  title: string;
  hint?: string;
  links?: SectionMenuLink[];
  exports?: SectionMenuExports;
}) {
  const rows = (links?.length ?? 0) > 0 || exports?.markdown != null || exports?.csv != null;
  return (
    <div className="-my-1 -mr-1 flex shrink-0" data-anatomy="K1" data-section-menu={scope}>
      <ToolsMenu variant="panel" label={`${title} menu`} heading={title} provScope={{ id: scope, hint }}>
        {rows ? (close) => <SectionMenuRows close={close} links={links} exports={exports} /> : undefined}
      </ToolsMenu>
    </div>
  );
}

/** A section that its ⋮ arms alone: one receipts scope under `scope`, its
 *  root stamped `data-prov-scope` and ringed while armed on it. */
export function ProvSection({
  scope,
  as: Tag = "section",
  className,
  children,
  ...data
}: {
  scope: string;
  as?: "section" | "div";
  className?: string;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  const registry = useReceiptRegistry();
  const lit = useProvScopeLit(scope);
  // The scope sits inside the root, so its dev coverage bookends never stand
  // between the section and its siblings.
  return (
    // 8px of room on every side, taken back by the margins, so the ring
    // stands off the content without moving it.
    <Tag
      className={`-mx-2 -mt-2 rounded-xl p-2 ${className ?? ""}`}
      data-prov-scope={scope}
      data-prov-lit={lit ? "" : undefined}
      {...data}
    >
      <ProvReceiptsScope registry={registry} scopeId={scope}>
        {children}
      </ProvReceiptsScope>
    </Tag>
  );
}

/** A section's heading row: the heading at the left; the read stamp, the "?"
 *  and the ⋮ at the right. */
export function SectionHeading({
  title,
  stamp,
  help,
  menu,
  children,
}: {
  title: ReactNode;
  stamp?: ReactNode;
  help?: ReactNode;
  menu?: ReactNode;
  /** A line under the heading. */
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3" data-section-heading="">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {children}
      </div>
      {(stamp || help || menu) && (
        <div className="flex shrink-0 items-center gap-2">
          {stamp}
          {help}
          {menu}
        </div>
      )}
    </div>
  );
}
