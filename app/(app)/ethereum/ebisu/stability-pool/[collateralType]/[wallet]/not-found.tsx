// The 404 body for a URL that names no Ebisu stability-pool deposit.
import { ForkSpDepositNotFound } from "@/lib/liquity-fork/sp-pages";

export default function EbisuDepositNotFound() {
  return <ForkSpDepositNotFound fork="ebisu" />;
}
