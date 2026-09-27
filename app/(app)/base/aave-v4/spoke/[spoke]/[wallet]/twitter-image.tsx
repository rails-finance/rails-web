// Twitter's card points at the same render as og:image — one card, one route.
// `runtime`/`dynamic` are restated here rather than re-exported: Next reads
// those two segment options by static analysis of THIS file, and a re-export
// is invisible to it (it warns and falls back to defaults).
import Image from "./opengraph-image";

export { size, contentType, alt } from "./opengraph-image";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default Image;
