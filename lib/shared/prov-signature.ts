// A registered receipt's content signature (components/shared/provenance.tsx,
// ReceiptRegistry). <Prov> re-registers on every render, so an unchanged entry
// must sign the same and register as a silent no-op (no emit, no re-render
// loop). The classes count as content: a live read that lands with the same
// figure and words moves a leaf from Indexed to State (ui-jobs 669). Pure, so a
// unit test runs the same rule.

import type { ProvReceiptEntry } from "@/components/shared/provenance";

export const entrySig = (e: Omit<ProvReceiptEntry, "order" | "el">) =>
  [
    e.value,
    e.display,
    e.symbol ?? "",
    e.echo ? "echo" : "",
    e.info.kind,
    e.info.pclass ?? "",
    e.info.summary,
    e.info.formula ?? "",
    e.info.via ?? "",
    e.info.scaling?.raw ?? "",
    (e.info.inputs ?? [])
      .map(
        (i) => `${i.label}:${i.value ?? ""}:${i.kind}:${i.pclass ?? ""}:${i.definition ? "def" : ""}:${i.note ?? ""}`,
      )
      .join("|"),
  ].join("§");
