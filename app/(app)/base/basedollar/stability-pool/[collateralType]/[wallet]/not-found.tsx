// The 404 body for a URL that names no Basedollar stability-pool deposit.
import { ForkSpDepositNotFound } from "@/lib/liquity-fork/sp-pages";

export default function BasedollarDepositNotFound() {
  return <ForkSpDepositNotFound fork="basedollar" />;
}
