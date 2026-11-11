"use client";

// Saving a position (C17's "Save position", ui-jobs 530) and a listing view
// (N1.7, the listing's ⋮, ui-jobs 521) into the one saved-items list
// (lib/shared/sessions.ts), and `useSavedLinks`, which the profile menu (H20)
// and /bookmarks read. The rows are the wallet menu's "Save wallet" row with
// the same filled bookmark once saved.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bookmark, Link2 } from "lucide-react";
import { ToolsMenu, ToolsMenuItem } from "@/components/shared/tools-menu";
import { chainMeta } from "@/lib/shared/chains";
import { protocolForPathname } from "@/lib/shared/protocols";
import {
  findSavedLink,
  loadSavedLinks,
  SESSIONS_CHANGED_EVENT,
  toggleSavedLink,
  updateSavedEnded,
  type SavedLink,
} from "@/lib/shared/sessions";

/** Re-run `sync` on every saved-items change, in this tab and others. */
function useSavedSync(sync: () => void, deps: unknown[]) {
  useEffect(() => {
    sync();
    window.addEventListener(SESSIONS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SESSIONS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** The saved positions or views, in the reader's order; `null` until read in
 *  the browser. */
export function useSavedLinks(kind: "position" | "view"): SavedLink[] | null {
  const [links, setLinks] = useState<SavedLink[] | null>(null);
  useSavedSync(() => setLinks(loadSavedLinks(kind)), [kind]);
  return links;
}

/** The saved entry for `key`, kept in step; null when not saved. */
function useSavedLink(kind: "position" | "view", key: string | null): SavedLink | null {
  const [entry, setEntry] = useState<SavedLink | null>(null);
  useSavedSync(() => setEntry(key ? findSavedLink(kind, key) : null), [kind, key]);
  return entry;
}

/** The protocol's short display name for a saved entry (Miles, 7 Nov 2026):
 *  the label without "Blue", as the card's sidebar shortens it ("Morpho Blue"
 *  → "Morpho"); a version stays ("Liquity V2", "Aave V3"). */
const shortName = (label: string) => label.replace(/ Blue$/, "");

/** The explorer and chain a path belongs to, as a saved entry keeps them. */
function placeOf(pathname: string): Pick<SavedLink, "protocol" | "chain"> {
  const entry = protocolForPathname(pathname);
  if (!entry) return {};
  return {
    protocol: { id: entry.id, name: shortName(entry.label) },
    chain: { id: String(entry.chainId), name: chainMeta(entry.chainId).name },
  };
}

/** Query params that say how the page was reached or what it opened to, so
 *  they are no part of what a saved entry names: `find` (focus the listing's
 *  search), `from` (the explorer the wallet view links back to), `event` (the
 *  timeline card opened). A position's other params name it (Aave's
 *  `?market=core`), as a view's name its filters and sort. */
const PASSING_PARAMS = ["find", "from", "event"];

/** The page's path and query as a saved entry keeps them. */
function currentPageKey(): string {
  const params = new URLSearchParams(window.location.search);
  for (const p of PASSING_PARAMS) params.delete(p);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}

/** The saved row's name: the reader's, else the default. */
export const savedName = (s: SavedLink) => s.customName || s.name;

/** The bookmark glyph, filled once saved. */
const mark = (saved: boolean) => <Bookmark size={16} fill={saved ? "currentColor" : "none"} />;

/** Bring a saved position's closed tag up to date as its card draws. Writes
 *  only when the page is saved and the tag has changed. */
export function useSavedEndedRefresh(ended: SavedLink["ended"]) {
  const pathname = usePathname();
  const word = ended?.word;
  useEffect(() => {
    updateSavedEnded(currentPageKey(), ended);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, word]);
}

/** The position's noun and short ID, from the page title the position's
 *  layout writes ("Rails | Aave V3 on Base position 0xfe28…5820" gives
 *  "Position 0xfe28…5820"; lib/shared/page-metadata.ts `positionMetadata`).
 *  The card's identity rarely carries the ID; the title always does. */
function positionSubject(protocol: string | undefined): string {
  let t = document.title.replace(/^Rails \| /, "");
  if (protocol && t.startsWith(protocol))
    t = t
      .slice(protocol.length)
      .replace(/^ on \S+/, "")
      .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

/** C17's "Save position" row (ui-jobs 530), after the family's identity rows.
 *  The default name is the card's identity (C5) as it reads. `ended` is the
 *  card's closed tag, kept on the entry so a saved row shows it. */
export function SavePositionRow({ identityText, ended }: { identityText: () => string; ended?: SavedLink["ended"] }) {
  const pathname = usePathname();
  // Read as the menu opens (the row mounts with it).
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => setKey(currentPageKey()), [pathname]);
  const saved = useSavedLink("position", key);
  if (!key) return null;
  return (
    <ToolsMenuItem
      icon={mark(!!saved)}
      title={saved ? "Remove from saved" : "Save position"}
      subtitle={saved ? savedName(saved) : "Keep it in your saved positions"}
      item="save-position"
      onClick={() => {
        const place = placeOf(window.location.pathname);
        const name = [identityText(), positionSubject(protocolForPathname(window.location.pathname)?.label)]
          .filter(Boolean)
          .join(" · ");
        toggleSavedLink({
          kind: "position",
          key,
          name: name || `${place.protocol?.name ?? "Saved"} position`,
          ...place,
          ...(ended ? { ended } : {}),
        });
      }}
    />
  );
}

/** The listing's ⋮ at the right end of its sort and filter row (N1.7, ui-jobs
 *  521): "Save listing" and "Copy link". The default name is the protocol,
 *  the chain and the active filters. `filterLabels` are the active filters'
 *  chip texts. */
export function ListingViewMenu({ filterLabels }: { filterLabels: string[] }) {
  const pathname = usePathname();
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const saved = useSavedLink("view", key);
  // The URL changes under the menu as filters change; read it when the menu
  // draws its rows (each open), and on a change of path.
  useEffect(() => setKey(currentPageKey()), [pathname]);
  return (
    <span className="flex h-8 items-center">
      <ToolsMenu variant="view" label="View menu" heading="View" copied={copied}>
        {(close) => (
          <ViewRows
            onOpen={() => setKey(currentPageKey())}
            saved={saved}
            onSave={() => {
              const at = currentPageKey();
              const place = placeOf(window.location.pathname);
              const name = [place.protocol?.name, place.chain?.name, ...filterLabels].filter(Boolean).join(" · ");
              toggleSavedLink({ kind: "view", key: at, name: name || "Saved listing", ...place });
              setKey(at);
            }}
            onCopy={() => {
              close();
              void navigator.clipboard.writeText(`${window.location.origin}${currentPageKey()}`).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          />
        )}
      </ToolsMenu>
    </span>
  );
}

function ViewRows({
  onOpen,
  saved,
  onSave,
  onCopy,
}: {
  onOpen: () => void;
  saved: SavedLink | null;
  onSave: () => void;
  onCopy: () => void;
}) {
  // The rows mount as the menu opens: the URL is read then.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onOpen(), []);
  return (
    <>
      <ToolsMenuItem
        icon={mark(!!saved)}
        title={saved ? "Remove from saved" : "Save listing"}
        subtitle={saved ? savedName(saved) : "Keep it in your saved listings"}
        item="save-view"
        onClick={onSave}
      />
      <ToolsMenuItem
        icon={<Link2 size={16} />}
        title="Copy link"
        subtitle="With its filters and sort"
        item="copy-view-link"
        onClick={onCopy}
      />
    </>
  );
}
