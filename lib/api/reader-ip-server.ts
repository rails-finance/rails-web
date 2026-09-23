// SERVER-ONLY. Reads the reader's IP off the current request's headers via
// `next/headers`, for server-side loaders that run inside a Server Component
// render rather than a route handler — they have no Request object of their
// own to hand to readerIpFromRequest, only the ambient incoming request that
// next/headers exposes. Never import this from a file a client component
// imports (it pulls in next/headers, which isn't valid outside a Server
// Component / route handler); use reader-ip.ts there instead.

import { headers } from "next/headers";
import { readerIpFromRequest } from "@/lib/api/reader-ip";

/**
 * The reader's IP for the current request, or undefined when there is none to
 * read — `headers()` throws outside request scope (build-time prerender,
 * generateStaticParams, and similar), which is caught and treated the same as
 * an absent header rather than allowed to fail the caller.
 */
export async function readerIpFromHeaders(): Promise<string | undefined> {
  try {
    const h = await headers();
    return readerIpFromRequest({ headers: h });
  } catch {
    return undefined;
  }
}
