// The wallets the home hero offers to try (rails-ops decision 0051, app
// anatomy S1): each holds positions in several families, and Rails has the
// holder's permission to show it. The hero links to the first; a later random
// selector picks from the list.

export interface SampleWallet {
  address: `0x${string}`;
}

export const SAMPLE_WALLETS: readonly SampleWallet[] = [{ address: "0xf06016d822943c42e3cb7fc3a6a3b1889c1045f8" }];
