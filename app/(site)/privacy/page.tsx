import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Rails Privacy Policy. Learn how we handle data and protect your privacy when using the Rails DeFi analytics platform.",
  openGraph: {
    title: "Privacy Policy | Rails",
    description:
      "Rails Privacy Policy. Learn how we handle data and protect your privacy.",
    url: "https://rails.finance/privacy",
  },
  robots: {
    index: true,
    follow: false,
  },
};

export default function PrivacyPage() {
  return (
    <div className="container mx-auto md:px-6 px-4 pt-32 pb-12 max-w-7xl">
      <div className="prose prose-lg max-w-none">
        <h1 className="text-3xl font-bold text-slate-700 dark:text-slate-200 mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
          Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Overview</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            Rails ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we
            handle information when you use our website and services at rails.finance and associated domains.
          </p>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            Rails is a read-only blockchain analytics platform. We do not custody funds, execute transactions, or store
            private keys. We simply display publicly available blockchain data in an organized, user-friendly format.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Information We Access</h2>

          <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-3">Blockchain Data</h3>
          <ul className="list-disc pl-6 mb-4 text-slate-700 dark:text-slate-300">
            <li>Publicly available wallet addresses and ENS names you search for</li>
            <li>Publicly available Trove IDs and transaction hashes you view</li>
            <li>Publicly available transaction history from the Ethereum blockchain</li>
            <li>Publicly available Liquity V2 protocol interactions and events</li>
          </ul>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            All blockchain data we display is publicly available on the Ethereum network. We do not have access to your
            private keys or the ability to execute transactions on your behalf.
          </p>

          <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-3">Technical Information</h3>
          <ul className="list-disc pl-6 mb-4 text-slate-700 dark:text-slate-300">
            <li>Browser type and version</li>
            <li>Device type (mobile/desktop)</li>
            <li>General geographic location (country/region level)</li>
            <li>Pages visited and features used</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">How We Use Information</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">We use the information we access to:</p>
          <ul className="list-disc pl-6 mb-4 text-slate-700 dark:text-slate-300">
            <li>Display blockchain data and transaction history</li>
            <li>Resolve ENS names to wallet addresses</li>
            <li>Improve our service and user experience</li>
            <li>Ensure the technical functionality of our platform</li>
            <li>Protect against abuse and maintain security</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Data Storage and Retention</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We cache blockchain data temporarily to improve performance and reduce load on blockchain infrastructure.
            This cached data is publicly available information from the Ethereum blockchain.
          </p>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We do not store personal information or maintain user accounts. Search queries and viewing history are not
            permanently stored or associated with individual users.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Third-Party Services</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            Rails interacts with the following third-party services:
          </p>
          <ul className="list-disc pl-6 mb-4 text-slate-700 dark:text-slate-300">
            <li>
              <strong>Ethereum RPC Providers:</strong> To fetch blockchain data
            </li>
            <li>
              <strong>ENS (Ethereum Name Service):</strong> To resolve human-readable names
            </li>
            <li>
              <strong>Liquity V2 Protocol:</strong> To read protocol state and events
            </li>
            <li>
              <strong>GitHub:</strong> For open-source code hosting
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Cookies and Local Storage</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We use minimal browser local storage to enhance your experience:
          </p>
          <ul className="list-disc pl-6 mb-4 text-slate-700 dark:text-slate-300">
            <li>User interface preferences (theme, layout settings)</li>
            <li>Recently viewed items for quick access</li>
            <li>Session data for temporary state management</li>
          </ul>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We do not use tracking cookies or analytics cookies. All local storage data can be cleared through your
            browser settings.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Security</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We implement appropriate technical measures to protect our infrastructure. However, please remember that
            blockchain data is inherently public, and we cannot control the visibility of on-chain transactions.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Children's Privacy</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            Our services are not directed to individuals under the age of 18. We do not knowingly collect information
            from children.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Changes to This Policy</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We may update this Privacy Policy from time to time. We will notify users of any material changes by posting
            the new Privacy Policy on this page and updating the "Last updated" date.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Contact Us</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            If you have questions about this Privacy Policy or our practices, please contact us at:
          </p>
          <ul className="list-none text-slate-700 dark:text-slate-300">
            <li>
              Twitter/X:{" "}
              <a
                href="https://x.com/rails_finance"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                @rails_finance
              </a>
            </li>
            <li>
              GitHub:{" "}
              <a
                href="https://github.com/rails-finance"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                github.com/rails-finance
              </a>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
