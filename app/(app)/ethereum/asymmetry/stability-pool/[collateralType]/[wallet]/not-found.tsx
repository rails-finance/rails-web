// The 404 body for a URL that names no Asymmetry stability-pool deposit.
import { ForkSpDepositNotFound } from "@/lib/liquity-fork/sp-pages";

export default function AsymmetryDepositNotFound() {
  return <ForkSpDepositNotFound fork="asymmetry" />;
}
