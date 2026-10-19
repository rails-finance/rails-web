"use client";

// One field that opens a wallet's position page — the front door of a
// position-first explorer, which has no listing to search (Aave V3 on
// Arbitrum). Takes a 0x address, or an ENS name resolved through
// /api/ens/resolve to the address it names; a value that is neither gets a
// line under the field and the page stays put. The field wears the listing
// search box's look (components/shared/filter-bar/list-toolbar.tsx) and the
// button the navigation grammar (lib/shared/ui-grammar.ts NAV_BUTTON).

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { NAV_BUTTON, ctrlWaking } from "@/lib/shared/ui-grammar";
import { useHydrated } from "@/hooks/useHydrated";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ENS = /^[^\s]+\.eth$/i;

export function WalletLookup({
  positionHref,
  placeholder,
}: {
  /** The position page for an address. */
  positionHref: (wallet: string) => string;
  placeholder: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const typed = value.trim();
    if (ADDRESS.test(typed)) {
      setProblem(null);
      router.push(positionHref(typed.toLowerCase()));
      return;
    }
    if (!ENS.test(typed) || typed.length < 7) {
      setProblem("Enter a wallet address (0x and 40 hexadecimal characters) or an ENS name ending in .eth.");
      return;
    }
    setResolving(true);
    try {
      const res = await fetch(`/api/ens/resolve?name=${encodeURIComponent(typed.toLowerCase())}`);
      const body = res.ok ? ((await res.json()) as { address?: string | null }) : null;
      if (body?.address && ADDRESS.test(body.address)) {
        setProblem(null);
        router.push(positionHref(body.address.toLowerCase()));
      } else setProblem(`${typed} does not name an address on ENS.`);
    } catch {
      setProblem("The ENS lookup did not answer. Try again, or paste the address.");
    } finally {
      setResolving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5" data-wallet-lookup="" {...ctrlWaking(hydrated)}>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rb-500"
            aria-hidden="true"
          />
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (problem) setProblem(null);
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-invalid={problem != null}
            aria-describedby={problem ? "wallet-lookup-problem" : undefined}
            spellCheck={false}
            autoComplete="off"
            className="h-9 w-full rounded-md bg-raised pl-8 pr-3 text-sm text-foreground placeholder:text-rb-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button type="submit" className={NAV_BUTTON} disabled={resolving}>
          {resolving ? "Looking up…" : "Open"}
        </button>
      </div>
      {problem && (
        <p id="wallet-lookup-problem" role="alert" className="text-xs text-rb-500" data-wallet-lookup-problem="">
          {problem}
        </p>
      )}
    </form>
  );
}
