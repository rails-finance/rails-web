export default function TermsPage() {
  return (
    <div className="container mx-auto md:px-6 px-4 pt-32 pb-12 max-w-7xl">
      <div className="prose prose-lg max-w-none">
        <h1 className="text-3xl font-bold text-slate-700 dark:text-slate-200 mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 dark:border-amber-500 p-4 mb-8">
          <h3 className="text-lg font-bold text-amber-800 dark:text-amber-300 mb-2">Important Notice</h3>
          <p className="text-amber-700 dark:text-amber-400 text-sm">
            Rails is not a financial advisor, investment advisor, or broker. The information provided on this platform is for informational purposes only and should not be considered as financial, investment, legal, or tax advice. Always conduct your own research and consult with qualified professionals before making any financial decisions.
          </p>
        </div>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">1. Acceptance of Terms</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            By accessing or using Rails ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">2. Description of Service</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            Rails is a blockchain analytics and visualization platform that displays publicly available data from the Ethereum blockchain, with a focus on the Liquity V2 protocol. The Service:
          </p>
          <ul className="list-disc pl-6 mb-4 text-slate-700 dark:text-slate-300">
            <li>Displays transaction history and protocol interactions</li>
            <li>Provides analytics and visualizations of DeFi activity</li>
            <li>Offers educational information about protocol operations</li>
            <li>Does NOT custody funds or execute transactions</li>
            <li>Does NOT have access to your private keys or wallet</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">3. No Financial Advice</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4 font-semibold">
            THE INFORMATION PROVIDED BY RAILS IS FOR INFORMATIONAL AND EDUCATIONAL PURPOSES ONLY.
          </p>
          <ul className="list-disc pl-6 mb-4 text-slate-700 dark:text-slate-300">
            <li>Rails does not provide investment, financial, legal, or tax advice</li>
            <li>No information on Rails should be interpreted as an endorsement or recommendation to buy, sell, or hold any asset</li>
            <li>Past performance data displayed is not indicative of future results</li>
            <li>You are solely responsible for evaluating the risks of your DeFi interactions</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">4. DeFi and Blockchain Risks</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">You acknowledge and understand that:</p>
          <ul className="list-disc pl-6 mb-4 text-slate-700 dark:text-slate-300">
            <li><strong>Immutability:</strong> Blockchain transactions are permanent and cannot be reversed</li>
            <li><strong>Public Nature:</strong> All blockchain transactions are publicly visible and permanently recorded</li>
            <li><strong>Smart Contract Risk:</strong> Smart contracts may contain bugs or vulnerabilities</li>
            <li><strong>No Custody:</strong> Rails does not custody or control any digital assets</li>
            <li><strong>Protocol Independence:</strong> Rails is independent from the Liquity protocol and has no control over its operations</li>
            <li><strong>Data Accuracy:</strong> While we strive for accuracy, blockchain data may be delayed or incorrect</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">5. Acceptable Use</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">You agree not to:</p>
          <ul className="list-disc pl-6 mb-4 text-slate-700 dark:text-slate-300">
            <li>Use the Service for any illegal or unauthorized purpose</li>
            <li>Attempt to gain unauthorized access to our systems</li>
            <li>Interfere with or disrupt the Service or servers</li>
            <li>Scrape or harvest data through automated means without permission</li>
            <li>Misrepresent the Service or your affiliation with Rails</li>
            <li>Use the Service to mislead or defraud others</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">6. Intellectual Property</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            The Rails platform, including its design, features, and content (excluding blockchain data), is the property of Rails and is protected by copyright and other intellectual property laws. Our open-source code is available under the applicable license on GitHub.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">7. Disclaimer of Warranties</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4 font-semibold">
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND.
          </p>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We do not warrant that the Service will be uninterrupted, error-free, or completely secure. We do not guarantee the accuracy, completeness, or timeliness of blockchain data displayed.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">8. Limitation of Liability</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, RAILS AND ITS TEAM MEMBERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
          </p>
          <ul className="list-disc pl-6 mb-4 text-slate-700 dark:text-slate-300">
            <li>Loss of profits, revenue, or data</li>
            <li>Financial losses from DeFi protocol interactions</li>
            <li>Losses due to smart contract exploits or failures</li>
            <li>Decisions made based on information displayed on Rails</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">9. Indemnification</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            You agree to indemnify and hold harmless Rails and its team members from any claims, damages, losses, liabilities, costs, and expenses arising from your use of the Service or violation of these Terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">10. Third-Party Services</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            Rails may display information from or link to third-party services (including the Liquity protocol, Ethereum network, and other DeFi protocols). We are not responsible for the content, accuracy, or practices of these third parties.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">11. Modifications</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We reserve the right to modify these Terms at any time. Material changes will be noted with an updated "Last updated" date. Your continued use of the Service after changes constitutes acceptance of the modified Terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">12. Termination</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            We reserve the right to terminate or suspend access to the Service at any time, without notice, for any reason, including violation of these Terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">13. Governing Law</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            These Terms shall be governed by applicable law without regard to conflict of law provisions. Any disputes arising from these Terms or the Service shall be resolved through binding arbitration.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">14. Contact Information</h2>
          <p className="text-slate-700 dark:text-slate-300 mb-4">
            For questions about these Terms, please contact us:
          </p>
          <ul className="list-none text-slate-700 dark:text-slate-300">
            <li>Twitter/X: <a href="https://x.com/rails_finance" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">@rails_finance</a></li>
            <li>GitHub: <a href="https://github.com/rails-finance" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">github.com/rails-finance</a></li>
          </ul>
        </section>
      </div>
    </div>
  );
}