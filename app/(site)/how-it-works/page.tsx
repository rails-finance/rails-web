"use client";

import { useState } from "react";

export default function HowItWorksPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "technical">("overview");

  return (
    <div className="container mx-auto md:px-6 px-4 pt-32 pb-12 max-w-7xl">
      <div className="prose prose-lg max-w-none">
        <h1 className="text-3xl font-bold text-slate-700 dark:text-slate-200 mb-6">How Rails Works</h1>

        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "overview"
                ? "bg-green-600 text-white"
                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("technical")}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "technical"
                ? "bg-green-600 text-white"
                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            }`}
          >
            Technical Architecture
          </button>
        </div>

        {activeTab === "overview" ? (
          <>
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">What Rails Does</h2>
              <p className="text-slate-700 dark:text-slate-300 mb-4">
                Rails is a specialized analytics platform that makes DeFi activity easy to understand. We take complex
                blockchain data from protocols like Liquity V2 and transform it into clear, actionable insights.
              </p>

              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-green-800 dark:text-green-300 mb-3">Key Features</h3>
                <ul className="list-disc pl-6 text-green-700 dark:text-green-400">
                  <li>Real-time tracking of Liquity V2 troves and transactions</li>
                  <li>Rich transaction timelines with detailed explanations</li>
                  <li>Ownership history and transfer tracking</li>
                  <li>Comprehensive protocol analytics and statistics</li>
                  <li>Multi-collateral support (ETH, wstETH, rETH)</li>
                </ul>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">The Rails Approach</h2>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">1. Data Collection</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    We continuously monitor the Ethereum blockchain for Liquity V2 events. Every transaction, state
                    change, and protocol interaction is captured in real-time.
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">
                    2. Context Enrichment
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    Raw blockchain events are enriched with transaction context. We analyze why transfers happened, what
                    operations triggered them, and how they affect protocol state.
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">
                    3. Processing & Analysis
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    Our processors analyze complete transactions to understand complex operations like batch updates,
                    interest rate changes, and liquidations.
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">
                    4. User-Friendly Display
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    Processed data is transformed into intuitive visualizations, timelines, and explanations that make
                    DeFi activity understandable at a glance.
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Why Rails is Different</h2>

              <div className="space-y-4">
                <div className="border-l-4 border-green-500 pl-4">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">
                    Complete Transaction Context
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    Unlike simple block explorers, Rails understands the complete context of each transaction. We show
                    not just what happened, but why it happened and what it means.
                  </p>
                </div>

                <div className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">
                    Protocol-Specific Intelligence
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    Rails deeply understands Liquity V2's mechanics. We decode complex operations, calculate interest
                    impacts, and explain protocol-specific events in plain language.
                  </p>
                </div>

                <div className="border-l-4 border-purple-500 pl-4">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Real-Time Processing</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    Data is processed as it happens on-chain. You see your transactions and their effects immediately,
                    with rich context and explanations.
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Security & Privacy</h2>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-5">
                <ul className="space-y-2 text-slate-700 dark:text-slate-300">
                  <li className="flex items-start">
                    <span className="text-green-600 dark:text-green-400 mr-2">✓</span>
                    <span>Rails is read-only - we never ask for private keys or wallet connections</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-600 dark:text-green-400 mr-2">✓</span>
                    <span>All data displayed is publicly available on the blockchain</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-600 dark:text-green-400 mr-2">✓</span>
                    <span>We don't track users or store personal information</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-600 dark:text-green-400 mr-2">✓</span>
                    <span>Open-source code available for review on GitHub</span>
                  </li>
                </ul>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Technical Architecture</h2>
              <p className="text-slate-700 dark:text-slate-300 mb-4">
                Rails uses a sophisticated multi-layer architecture to process and serve blockchain data efficiently and
                accurately.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">System Components</h2>

              <div className="space-y-6">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">
                    1. Blockchain Indexer (Ponder)
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-3">
                    Connects directly to Ethereum nodes and monitors all Liquity V2 contracts in real-time.
                  </p>
                  <ul className="list-disc pl-6 text-sm text-slate-600 dark:text-slate-400">
                    <li>Captures events from 6 smart contracts (3 collateral types: WETH, wstETH, rETH)</li>
                    <li>Processes Transfer, TroveOperation, TroveUpdated, Liquidation, Redemption, and Batch events</li>
                    <li>Fetches oracle prices from Chainlink for accurate USD valuations</li>
                    <li>Routes events to appropriate processing queues via RabbitMQ</li>
                    <li>Maintains real-time synchronization with blockchain state</li>
                  </ul>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">
                    2. Message Queue (RabbitMQ)
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-3">
                    Manages event flow and ensures reliable processing of all blockchain events.
                  </p>
                  <ul className="list-disc pl-6 text-sm text-slate-600 dark:text-slate-400">
                    <li>9 separate queues for different event types</li>
                    <li>Guarantees event processing even during high load</li>
                    <li>Enables decoupled, scalable architecture</li>
                    <li>Triggers materialized view refreshes after processing</li>
                  </ul>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">3. Event Processor</h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-3">
                    Specialized processor that understands and enriches blockchain events.
                  </p>
                  <ul className="list-disc pl-6 text-sm text-slate-600 dark:text-slate-400">
                    <li>Enriches events with USD values using oracle prices</li>
                    <li>Resolves ENS names for better user experience</li>
                    <li>Calculates transaction costs in ETH and USD</li>
                    <li>Processes complex Liquity operations including batch management</li>
                    <li>Handles NFT transfers for trove ownership tracking</li>
                  </ul>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">
                    4. Database Layer (Dual PostgreSQL)
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-3">
                    Stores processed data with rich context and pre-computed summaries.
                  </p>
                  <div className="mb-3">
                    <h4 className="font-medium text-slate-600 dark:text-slate-300 text-sm mb-2">
                      Two-Database Strategy:
                    </h4>
                    <ul className="list-disc pl-6 text-sm text-slate-600 dark:text-slate-400">
                      <li>Indexer Database: Raw blockchain events as captured by Ponder</li>
                      <li>API Database: Enriched, processed events and 9 materialized views</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-slate-600 dark:text-slate-300 text-sm mb-2">Materialized Views:</h4>
                    <ul className="list-disc pl-6 text-sm text-slate-600 dark:text-slate-400">
                      <li>Current trove states with zombie detection</li>
                      <li>Ownership history with ENS resolution</li>
                      <li>Operation history with before/after states</li>
                      <li>Protocol-wide statistics and metrics</li>
                      <li>Batch management status and peak values tracking</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">
                    5. Materialized View Updater
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-3">
                    Maintains pre-computed data views for instant API responses.
                  </p>
                  <ul className="list-disc pl-6 text-sm text-slate-600 dark:text-slate-400">
                    <li>Event-driven refresh (only when data changes)</li>
                    <li>Respects dependency order between views</li>
                    <li>Non-blocking concurrent refreshes</li>
                    <li>Ensures data consistency across all views</li>
                  </ul>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">6. API Gateway</h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-3">
                    Serves pre-processed data to the frontend with minimal latency.
                  </p>
                  <ul className="list-disc pl-6 text-sm text-slate-600 dark:text-slate-400">
                    <li>RESTful endpoints for trove, transaction, and stats queries</li>
                    <li>Advanced filtering and sorting capabilities</li>
                    <li>Pagination support for large datasets</li>
                    <li>5-second query timeout for performance</li>
                    <li>Response caching for frequently accessed data</li>
                  </ul>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">
                    7. Frontend (Next.js + React)
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-3">
                    Modern, responsive interface for data visualization and exploration.
                  </p>
                  <ul className="list-disc pl-6 text-sm text-slate-600 dark:text-slate-400">
                    <li>Server-side rendering for optimal performance</li>
                    <li>Interactive timelines and data visualizations</li>
                    <li>Real-time updates as blockchain events occur</li>
                    <li>Mobile-responsive design</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Data Flow Example</h2>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5">
                <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-3">
                  When a user opens a trove:
                </h3>
                <ol className="list-decimal pl-6 space-y-2 text-blue-700 dark:text-blue-400">
                  <li>Transaction occurs on Ethereum blockchain</li>
                  <li>
                    Ponder captures multiple events from the transaction:
                    <ul className="list-disc pl-6 mt-1">
                      <li>Transfer event (NFT mint representing trove ownership)</li>
                      <li>TroveOperation event (the "openTrove" action)</li>
                      <li>TroveUpdated event (new trove state)</li>
                    </ul>
                  </li>
                  <li>Events routed through RabbitMQ to ensure reliable processing</li>
                  <li>
                    Processor enriches each event:
                    <ul className="list-disc pl-6 mt-1">
                      <li>Adds USD values using current oracle prices</li>
                      <li>Resolves ENS name for the trove owner</li>
                      <li>Calculates gas costs in ETH and USD</li>
                      <li>Links the NFT mint to the trove operation</li>
                    </ul>
                  </li>
                  <li>Database updated with enriched event data</li>
                  <li>
                    Views refreshed to include the new trove:
                    <ul className="list-disc pl-6 mt-1">
                      <li>Current state view shows the open trove</li>
                      <li>Ownership view links trove to owner</li>
                      <li>Stats view updates protocol totals</li>
                    </ul>
                  </li>
                  <li>API serves complete trove data with all context</li>
                  <li>Frontend displays the new trove with timeline and current values</li>
                </ol>
                <p className="text-blue-600 dark:text-blue-300 mt-4 text-sm font-medium">
                  The entire process completes in 1-2 seconds from blockchain to user interface.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Key Innovations</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">
                    Transaction Context Understanding
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    By processing complete transactions with all their events, Rails understands the full context of
                    every operation, not just individual events.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Pre-computed Data Views</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Data is processed and organized at ingestion time through materialized views, enabling instant API
                    responses without runtime calculations.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Event Correlation</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Multiple events from the same transaction are automatically correlated to provide complete operation
                    understanding.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Protocol-Aware Processing</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Deep understanding of Liquity V2 mechanics enables accurate tracking of interest rate changes, batch
                    management, liquidations, zombie troves, and collateral ratio calculations.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Multi-Collateral Support</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Seamlessly handles three different collateral types (WETH, wstETH, rETH) with their specific price
                    feeds and exchange rates.
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Open Source</h2>
              <p className="text-slate-700 dark:text-slate-300 mb-4">
                Rails is committed to transparency. Our codebase is open source and available for review:
              </p>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <a
                  href="https://github.com/rails-finance"
                  className="text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 font-medium"
                >
                  View Rails on GitHub →
                </a>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
