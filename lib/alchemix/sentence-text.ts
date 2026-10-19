// The Explanation's first sentence as plain text, for the event page's browser
// title (rails-ops decision 0045, "Ruled since"): the teaser cut after its
// first sentence (splitFirstSentence), its text read from the strings and the
// children its elements carry, an address link's from its `address`, an
// AmountText's from its value in the format it names. Server-safe.

import { isValidElement, type ReactNode } from "react";
import { splitFirstSentence } from "@/lib/shared/explainer-prose";
import { AmountText } from "@/components/shared/amount-text";
import { formatNumber } from "@/lib/utils/format";
import { formatCompact } from "@/lib/shared/format-compact";

function text(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<{ value: number; format?: string }>(node) && node.type === AmountText)
    return node.props.format === "compact" ? formatCompact(node.props.value) : formatNumber(node.props.value);
  if (isValidElement<{ children?: ReactNode; address?: unknown }>(node)) {
    const { children, address } = node.props;
    if (children == null && typeof address === "string") return `${address.slice(0, 6)}…${address.slice(-4)}`;
    return text(children);
  }
  return "";
}

/** The teaser's first sentence in words, or null where it has none. */
export function firstSentenceText(teaser: ReactNode | null | undefined): string | null {
  if (teaser == null) return null;
  const words = text(splitFirstSentence(teaser).head)
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:)])/g, "$1")
    .trim();
  return words || null;
}
