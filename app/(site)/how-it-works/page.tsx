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
                    <li>Captures events with full transaction receipts for complete context</li>
                    <li>Processes TroveOperation, TroveUpdated, and Transfer events</li>
                    <li>Routes events to appropriate processing queues</li>
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
                    <li>Separate queues for ownership, transaction, and summary events</li>
                    <li>Guarantees event processing even during high load</li>
                    <li>Dead letter queue for error handling and retry logic</li>
                  </ul>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">3. Event Processors</h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-3">
                    Specialized processors that understand and enrich blockchain events.
                  </p>

                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <div className="border-l-4 border-blue-400 pl-3">
                      <h4 className="font-medium text-slate-700 dark:text-slate-200">Ownership Processor</h4>
                      <ul className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        <li>• Tracks NFT mints, transfers, and burns</li>
                        <li>• Links transfers to their triggering operations</li>
                        <li>• Maintains ownership history</li>
                      </ul>
                    </div>

                    <div className="border-l-4 border-green-400 pl-3">
                      <h4 className="font-medium text-slate-700 dark:text-slate-200">Transaction Processor</h4>
                      <ul className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        <li>• Processes complex Liquity operations</li>
                        <li>• Calculates interest and fee impacts</li>
                        <li>• Handles batch operations</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">
                    4. Database Layer (PostgreSQL)
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-3">
                    Stores processed data with rich context and pre-computed summaries.
                  </p>
                  <ul className="list-disc pl-6 text-sm text-slate-600 dark:text-slate-400">
                    <li>Optimized schema for multi-collateral (ETH, wstETH, rETH) queries</li>
                    <li>Pre-computed JSON summaries for instant API responses</li>
                    <li>Full transaction history with operation context</li>
                    <li>Efficient indexing for address and trove lookups</li>
                  </ul>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">5. API Gateway</h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-3">
                    Serves pre-processed data to the frontend with minimal latency.
                  </p>
                  <ul className="list-disc pl-6 text-sm text-slate-600 dark:text-slate-400">
                    <li>RESTful endpoints for trove, transaction, and stats queries</li>
                    <li>Redis caching for frequently accessed data</li>
                    <li>Real-time WebSocket updates for live data</li>
                  </ul>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">
                    6. Frontend (Next.js + React)
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-3">
                    Modern, responsive interface for data visualization and exploration.
                  </p>
                  <ul className="list-disc pl-6 text-sm text-slate-600 dark:text-slate-400">
                    <li>Server-side rendering for optimal performance</li>
                    <li>Interactive timelines and data visualizations</li>
                    <li>Real-time updates via WebSocket connections</li>
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
                  <li>Ponder captures TroveOperation event with full transaction receipt</li>
                  <li>Event routed to transaction processor via RabbitMQ</li>
                  <li>Processor analyzes receipt, finds NFT mint in same transaction</li>
                  <li>Creates rich operation record: "openTrove with NFT mint to user"</li>
                  <li>Ownership processor updates ownership with operation context</li>
                  <li>Summary processor creates comprehensive JSON for API</li>
                  <li>Frontend displays complete operation with timeline and explanations</li>
                </ol>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Key Innovations</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">
                    Transaction Receipt Analysis
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    By analyzing complete transaction receipts, we understand the full context of every operation, not
                    just individual events.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Pre-computed Summaries</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Data is processed and summarized at ingestion time, enabling instant API responses without runtime
                    calculations.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Event Correlation</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Multiple events from the same transaction are correlated to provide complete operation
                    understanding.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-600 rounded-lg p-4">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Protocol-Aware Processing</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Deep understanding of Liquity V2 mechanics enables accurate interest calculations and operation
                    decoding.
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
