"use client";

import { createContext, useContext } from "react";

/** True where the event page's title states the explanation's first
 *  sentence (rails-ops decision 0045, "Ruled since"): a grouped pane leaves
 *  its first bullet out. Provided by the event card in page mode. */
export const ExplainerLeadOnTitleContext = createContext(false);

export function useExplainerLeadOnTitle(): boolean {
  return useContext(ExplainerLeadOnTitleContext);
}
